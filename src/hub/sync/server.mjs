// The Aletheia Sync HTTP server: /v1/sync/* with bearer-token auth, per-operation push results,
// cursor-based pull, pairing, device management, scoped tokens and an append-only audit log.
// Binds to loopback by default; a non-loopback bind requires `behindTls` and prints a warning.
// Also serves the private remote MCP endpoint at /mcp when `hubDb` is given (T-107).
import { dirname, join } from "node:path";
import { AlertStore, startAlertDelivery } from "../alerts.mjs";
import { createMcpHttpHandler, loopbackOriginsOnly, WRITE_TOOLS } from "../mcp-http.mjs";
import { HubStore } from "../store.mjs";
import { teamRequest } from "../team-api.mjs";
import { TeamStore } from "../team.mjs";
import { SyncStore } from "./store.mjs";

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export const isLoopbackHost = (host) => ["127.0.0.1", "localhost", "::1"].includes(String(host ?? "").trim());

/** True when the hub needs an explicit TLS-terminating proxy in front: non-loopback and no --behind-tls. */
export function requiresTlsProxy(host, behindTls) {
  return !isLoopbackHost(host) && !behindTls;
}

/** 401 for an unknown, revoked or expired token; 403 for a valid token with the wrong scope; null when allowed. */
function authDenied(token, allowed) {
  if (!token) return 401;
  if (token.revoked_at || (token.expires_at && token.expires_at < Date.now())) return 401;
  if (!allowed.includes(token.scope)) return 403;
  return null;
}

export function createSyncRoutes({ store, team = null, alerts = null, getPeer = () => "loopback", behindTls = false, warn = (message) => console.warn(message) }) {
  const joinFailures = new Map();

  async function readJson(request) {
    try {
      return await request.json();
    } catch {
      return null;
    }
  }

  function bearer(request) {
    const header = request.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header);
    return match ? store.findToken(match[1]) : null;
  }

  /** Count only failed pairing attempts; a successful join clears the counter. */
  function recordFailure(accountId) {
    const now = Date.now();
    const entry = joinFailures.get(accountId) ?? { count: 0, reset: now + 60_000 };
    if (entry.reset < now) entry.count = 0, entry.reset = now + 60_000;
    entry.count += 1;
    joinFailures.set(accountId, entry);
    return entry.count > 5;
  }

  function clearFailures(accountId) {
    joinFailures.delete(accountId);
  }

  async function handle(request) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;
    const account = store.ensureAccount();
    const accountId = account.id;

    if (pathname === "/healthz" && method === "GET") return json({ status: "ok" });

    if (pathname === "/v1/sync/join" && method === "POST") {
      const body = await readJson(request);
      if (!body || typeof body.code !== "string" || typeof body.device_id !== "string") return json({ error: "code and device_id are required." }, 400);
      const result = store.redeemPairCode(accountId, body.code, { deviceId: body.device_id, name: body.name ?? body.device_id });
      if (!result.ok) {
        if (recordFailure(accountId)) return json({ error: "Too many pairing attempts; wait a minute." }, 429);
        return json({ error: result.reason }, result.status);
      }
      clearFailures(accountId);
      try { alerts?.emit("device.paired", { detail: { deviceId: result.deviceId, name: body.name ?? null } }); } catch { /* alerts never block pairing */ }
      return json({ token: result.token, device_id: result.deviceId });
    }

    const token = bearer(request);
    const accountForToken = token ? token.account_id : null;

    // ---- T-112: team mode (shared memory, board, brief, search) ---------------------------------
    if (team && (pathname === "/v1/team" || pathname.startsWith("/v1/team/"))) {
      const read = method === "GET" || method === "HEAD";
      const teamDenied = authDenied(token, read ? ["sync", "read", "mcp", "admin"] : ["sync", "admin"]);
      if (teamDenied) return json({ error: read ? "A valid token is required." : "A sync or admin token is required." }, teamDenied);
      const body = read ? null : await readJson(request);
      const result = teamRequest({
        path: pathname.slice("/v1/team".length) || "/",
        method,
        url,
        body,
        team,
        sync: store,
        accountId: accountForToken,
        tokenId: token?.id ?? null,
        operator: false,
      });
      if (!result) return json({ error: "Not found." }, 404);
      store.touchToken(token.id);
      return json(result.body, result.status);
    }

    if (pathname === "/v1/sync/push" && method === "POST") {
      const pushDenied = authDenied(token, ["sync", "admin"]);
      if (pushDenied) return json({ error: "A sync or admin token is required to push." }, pushDenied);
      const body = await readJson(request);
      if (!body || !Array.isArray(body.ops)) return json({ error: "ops must be an array." }, 400);
      const quota = store.quotaExceeded(token.id);
      if (quota) {
        try { alerts?.emit("quota.hit", { detail: { tokenId: token.id, quota } }); } catch { /* alerts never block a refusal */ }
        return json({ error: `This token's ${quota} quota is exhausted.` }, 402);
      }
      const deviceId = request.headers.get("x-device-id") ?? token.device_id ?? null;
      if (!deviceId) return json({ error: "X-Device-Id is required." }, 400);
      const projectDenied = (op) => token.projects?.length && op?.payload?.project && !token.projects.includes(op.payload.project);
      const allowedOps = [];
      const mapped = (body.ops ?? []).map((op) => {
        if (projectDenied(op)) return { status: "rejected", reason: "project not allowed for this token", entity_id: op?.entity_id ?? null };
        allowedOps.push(op);
        return null;
      });
      const storeResult = store.pushOps(accountForToken, allowedOps, { actor: { tokenId: token.id, deviceId } });
      let storeIndex = 0;
      const results = mapped.map((preset) => preset ?? storeResult.results[storeIndex++]);
      store.touchToken(token.id);
      const appliedCursor = Number(request.headers.get("x-sync-cursor") ?? 0);
      store.ackDevice(accountForToken, deviceId, Number.isFinite(appliedCursor) ? appliedCursor : 0);
      return json({ results, head_seq: storeResult.head_seq, epoch: storeResult.epoch });
    }

    if (pathname === "/v1/sync/pull" && method === "GET") {
      const pullDenied = authDenied(token, ["sync", "read", "mcp", "admin"]);
      if (pullDenied) return json({ error: "A valid token is required to pull." }, pullDenied);
      const since = Number(url.searchParams.get("since") ?? 0);
      const limit = Number(url.searchParams.get("limit") ?? 500);
      const result = store.pullOps(accountForToken, since, { limit });
      store.touchToken(token.id);
      const deviceId = request.headers.get("x-device-id") ?? token.device_id;
      if (deviceId) store.ackDevice(accountForToken, deviceId, result.head_seq);
      return json(result);
    }

    if (pathname === "/v1/sync/status" && method === "GET") {
      const statusDenied = authDenied(token, ["sync", "read", "mcp", "admin"]);
      if (statusDenied) return json({ error: "A valid token is required." }, statusDenied);
      store.touchToken(token.id);
      return json(store.status(accountForToken));
    }

    // The account's wrapped E2EE keys (T-117): a newly joined device fetches these and unwraps them
    // locally with the passphrase. Only wrapped keys ever leave the server.
    if (pathname === "/v1/sync/e2ee" && method === "GET") {
      const e2eeDenied = authDenied(token, ["sync", "read", "mcp", "admin"]);
      if (e2eeDenied) return json({ error: "A valid token is required." }, e2eeDenied);
      return json(store.e2eeStatus(accountForToken));
    }

    if (pathname === "/v1/sync/snapshot" && method === "GET") {
      const snapshotDenied = authDenied(token, ["sync", "read", "mcp", "admin"]);
      if (snapshotDenied) return json({ error: "A valid token is required." }, snapshotDenied);
      return json(store.snapshot(accountForToken));
    }

    if (pathname === "/v1/sync/devices" && method === "GET") {
      const devicesDenied = authDenied(token, ["admin"]);
      if (devicesDenied) return json({ error: "An admin token is required." }, devicesDenied);
      return json({ devices: store.listDevices(accountForToken) });
    }

    if (pathname === "/v1/sync/revoke" && method === "POST") {
      const revokeDenied = authDenied(token, ["admin"]);
      if (revokeDenied) return json({ error: "An admin token is required." }, revokeDenied);
      const body = await readJson(request);
      if (!body || typeof body.device_id !== "string") return json({ error: "device_id is required." }, 400);
      const revoked = store.revokeDevice(accountForToken, body.device_id);
      store.audit(accountForToken, { tokenId: token.id, deviceId: body.device_id, action: "device.revoke", result: revoked ? "ok" : "missing" });
      try { alerts?.emit("token.revoked", { detail: { deviceId: body.device_id, revoked } }); } catch { /* alerts never block a revoke */ }
      return json({ revoked });
    }

    if (pathname === "/v1/sync/tokens" && method === "GET") {
      const tokensGetDenied = authDenied(token, ["admin"]);
      if (tokensGetDenied) return json({ error: "An admin token is required." }, tokensGetDenied);
      return json({ tokens: store.listTokens(accountForToken) });
    }

    if (pathname === "/v1/sync/tokens" && method === "POST") {
      const tokensPostDenied = authDenied(token, ["admin"]);
      if (tokensPostDenied) return json({ error: "An admin token is required." }, tokensPostDenied);
      const body = await readJson(request) ?? {};
      const minted = store.mintToken(accountForToken, { scope: body.scope ?? "sync", deviceId: body.device_id ?? null, name: body.name ?? null, projects: body.projects ?? [], opsPerDay: body.ops_per_day ?? null, bytesPerDay: body.bytes_per_day ?? null });
      store.audit(accountForToken, { tokenId: token.id, action: "token.mint", result: "ok", detail: { id: minted.id, scope: minted.scope } });
      return json({ id: minted.id, token: minted.token, scope: minted.scope, device_id: minted.deviceId, projects: minted.projects }, 201);
    }

    if (pathname === "/v1/sync/audit" && method === "GET") {
      const auditDenied = authDenied(token, ["admin"]);
      if (auditDenied) return json({ error: "An admin token is required." }, auditDenied);
      return json({ audit: store.auditLog(accountForToken, Number(url.searchParams.get("limit") ?? 100)) });
    }

    if (pathname === "/v1/sync/compact" && method === "POST") {
      const compactDenied = authDenied(token, ["admin"]);
      if (compactDenied) return json({ error: "An admin token is required." }, compactDenied);
      const body = await readJson(request) ?? {};
      return json(store.compact(accountForToken, { retentionMs: body.retention_ms ?? undefined }));
    }

    if (pathname === "/v1/sync/purge" && method === "POST") {
      const purgeDenied = authDenied(token, ["admin"]);
      if (purgeDenied) return json({ error: "An admin token is required." }, purgeDenied);
      const body = await readJson(request);
      if (!body || typeof body.entity_id !== "string") return json({ error: "entity_id is required." }, 400);
      return json(store.purgeEntity(accountForToken, body.entity_id, { actor: { tokenId: token.id, deviceId: null } }));
    }

    return json({ error: "Not found." }, 404);
  }

  return { handle, json };
}

/**
 * Start the sync server. Returns {server, store, stop, port, url}.
 * With `hubDb`, the private remote MCP endpoint is served at /mcp (T-107): bearer tokens with an
 * `mcp`/`read`/`sync`/`admin` scope, project scope, per-token rate limit and an audit row per call.
 */
export function startSyncServer({ syncDb, host = "127.0.0.1", port = 0, name = "default", behindTls = false, hubDb = null, teamDb = null, alertsDb = null, alertDeliveryMs = 0, mcpOrigins = null, mcpRateLimitPerMinute = 60 } = {}) {
  const store = new SyncStore(syncDb);
  const account = store.ensureAccount(name);
  if (requiresTlsProxy(host, behindTls)) {
    console.warn(`Warning: binding sync to ${host} without TLS. Put it behind a reverse proxy or tunnel that terminates TLS.`);
  }
  const team = new TeamStore(teamDb ?? (syncDb === ":memory:" ? ":memory:" : join(dirname(syncDb), "team.db")), {
    tokenActive: (tokenId) => {
      const row = store.db.prepare("SELECT revoked_at, expires_at FROM sync_token WHERE id = ?").get(Number(tokenId));
      return !!row && !row.revoked_at && !(row.expires_at && row.expires_at < Date.now());
    },
  });
  const alerts = new AlertStore(alertsDb ?? (syncDb === ":memory:" ? ":memory:" : join(dirname(syncDb), "alerts.db")));
  const routes = createSyncRoutes({ store, team, alerts, behindTls, getPeer: () => "peer" });
  const delivery = Number(alertDeliveryMs) > 0 ? startAlertDelivery(alerts, { intervalMs: Number(alertDeliveryMs) }) : null;

  // ---- the private remote MCP endpoint (T-107) -----------------------------------------------
  const hub = hubDb ? new HubStore(hubDb) : null;
  const mcpWindows = new Map(); // token id -> { start, count }
  const mcpRoutes = hub
    ? createMcpHttpHandler({
        store: hub,
        authorize: async (request) => {
          const header = request.headers.get("authorization") ?? "";
          const match = /^Bearer\s+(.+)$/i.exec(header);
          if (!match) return { status: 401, error: "A valid bearer token is required." };
          const token = store.findToken(match[1]);
          if (!token || token.revoked_at || (token.expires_at && token.expires_at < Date.now())) return { status: 401, error: "A valid bearer token is required." };
          if (!["mcp", "read", "sync", "admin"].includes(token.scope)) return { status: 403, error: "This token cannot use the MCP endpoint." };
          return { token, projects: token.projects?.length ? token.projects : null };
        },
        toolAllowed: (token, toolName) => (WRITE_TOOLS.has(toolName) ? !!token && ["sync", "admin"].includes(token.scope) : true),
        allowedOrigins: (origin) => loopbackOriginsOnly(origin) || (mcpOrigins ?? []).includes(origin),
        rateLimit: ({ token }) => {
          if (!token?.id) return null;
          const now = Date.now();
          const window = mcpWindows.get(token.id) ?? { start: now, count: 0 };
          if (now - window.start >= 60_000) {
            window.start = now;
            window.count = 0;
          }
          window.count += 1;
          mcpWindows.set(token.id, window);
          if (window.count > mcpRateLimitPerMinute) return { status: 429, error: "Too many MCP calls; wait a minute.", retryAfter: Math.max(1, Math.ceil((window.start + 60_000 - now) / 1000)) };
          return null;
        },
        onCall: ({ token, tool, project, ok }) => {
          store.audit(account.id, { tokenId: token?.id ?? null, action: "mcp.call", detail: { tool, project, result: ok ? "ok" : "error" }, result: ok ? "ok" : "error" });
        },
      })
    : null;

  const server = Bun.serve({
    hostname: host,
    port,
    idleTimeout: 0,
    maxRequestBodySize: 8 * 1024 * 1024,
    async fetch(request, srv) {
      try {
        if (mcpRoutes && new URL(request.url).pathname === "/mcp") return await mcpRoutes(request);
        return await routes.handle(request);
      } catch (error) {
        console.error("[sync] request failed:", request.method, request.url, error);
        try { alerts.emit("sync.error", { detail: { method: request.method, path: new URL(request.url).pathname, error: String(error instanceof Error ? error.message : error).slice(0, 300) } }); } catch { /* ignore */ }
        return routes.json({ error: "Internal error." }, 500);
      }
    },
  });
  return {
    server,
    store,
    routes,
    team,
    alerts,
    hub,
    stop: () => {
      delivery?.stop();
      server.stop(true);
      store.close();
      team.close();
      alerts.close();
      hub?.close();
    },
    port: server.port,
    url: `http://127.0.0.1:${server.port}`,
  };
}
