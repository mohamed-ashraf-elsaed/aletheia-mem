// HTTP server: static SPA, the /api/work-view* routes, /api/work-state, and /api/setup/*.
// Same contract as the original worker; see docs/03-http-api.md.
import { existsSync, readFileSync, statSync } from "node:fs";
import { createHash, timingSafeEqual } from "node:crypto";
import { extname, join, normalize, sep } from "node:path";
import { HttpError, WorkViewService } from "./app.mjs";
import { isCrossOrigin, isLocalRequest, isSameOriginJson } from "./http/guards.mjs";
import { ValidationError, validateMarkFinished, validateReview, validateRuleAction, validateWorkStateWrite } from "./http/validate.mjs";
import { EVIDENCE_KINDS } from "./readmodel/evidence.mjs";
import { MIME_TYPES } from "./readmodel/work-product.mjs";
import { BadRequest, createHubRoutes } from "./hub/routes.mjs";
import { createLiveHub } from "./hub/live.mjs";
import { createMcpHttpHandler } from "./hub/mcp-http.mjs";
import { createLoginGuard } from "./hub/login.mjs";
import { SyncStore } from "./hub/sync/store.mjs";
import { startBackgroundWorker } from "./hub/queue.mjs";
import { HubStore } from "./hub/store.mjs";
import { makeProvider } from "./refresh/providers.mjs";

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".ttf": "font/ttf", ".woff2": "font/woff2", ".json": "application/json", ".map": "application/json",
};
const BASE_HEADERS = { "Content-Security-Policy": "frame-ancestors 'self'", "X-Frame-Options": "SAMEORIGIN" };
// The app page loads only its own scripts and styles. Same-origin requests and sockets, data: images for the tab icon,
// no inline script, no inline style attribute, no plugin, no form posting elsewhere.
const APP_CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'";

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...BASE_HEADERS, ...extra } });
const text = (body, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
const notFoundRoute = (method, path) =>
  new Response(`<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot ${method} ${path}</pre>\n</body>\n</html>\n`, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff" },
  });

/** Create the service and the Bun server. Returns {server, service, stop}. */
export function startServer(config, {
  autoRefresh = null,
  requireLogin = null,
  behindTls = false,
  sessionTtlMs = 24 * 60 * 60 * 1000,
  loginLockMs = 60_000,
  loginMaxFailures = 5,
} = {}) {
  const service = new WorkViewService(config, { autoRefresh });
  const hub = new HubStore(config.hubDb);
  // Remote login (T-110): on by default exactly when the bind is not loopback-only. The sync account's
  // admin token is the password. Loopback-only keeps today's behaviour (no login, no sessions).
  const remoteMode = requireLogin ?? !["127.0.0.1", "localhost", "::1"].includes(config.host);
  let loginStore = null;
  const getLoginStore = () => loginStore ?? (loginStore = new SyncStore(config.syncDb));
  const login = createLoginGuard({
    store: { findToken: (raw) => getLoginStore().findToken(raw) },
    requireLogin: remoteMode,
    behindTls,
    sessionTtlMs,
    lockMs: loginLockMs,
    maxFailures: loginMaxFailures,
    getPeer: (request, server) => server?.requestIP(request)?.address ?? "unknown",
  });
  // The extraction worker is a background task of the server, not part of any hook. A misconfigured provider
  // must not stop the server from booting: extraction falls back to the rule extractor and doctor reports it.
  let ask = null;
  try {
    ask = makeProvider(config);
  } catch {
    ask = null;
  }
  const worker = config.extractionWorker ? startBackgroundWorker({ store: hub, ask, config, onTick: (result) => {
    const project = result.last?.project ?? null;
    for (const id of result.last?.factIds ?? []) liveHub.broadcast({ kind: "fact", id, project });
  } }) : null;
  const liveHub = createLiveHub(hub);
  const hubRoutes = createHubRoutes({ hub, config, liveHub });
  // MCP over Streamable HTTP on the main (loopback) server. Optional bearer key, same one as /v1.
  const mcpHttp = createMcpHttpHandler({
    store: hub,
    authorize: config.apiKey
      ? async (request) => {
          const header = request.headers.get("authorization") ?? "";
          const match = /^Bearer\s+(.+)$/i.exec(header);
          if (!match) return { status: 401, error: "A valid bearer key is required." };
          const wanted = createHash("sha256").update(String(match[1])).digest();
          const expected = createHash("sha256").update(String(config.apiKey)).digest();
          if (!timingSafeEqual(wanted, expected)) return { status: 401, error: "A valid bearer key is required." };
          return { token: { scope: "local" }, projects: null };
        }
      : null,
  });
  const html = new Map();
  const indexHtml = () => {
    const path = join(config.publicDir, "index.html");
    if (!html.has(path)) html.set(path, readFileSync(path));
    return html.get(path);
  };

  function guarded(request, server, { post = false } = {}) {
    if (remoteMode) return null; // remote mode uses the login session instead of the local-only guard
    const peer = server.requestIP(request)?.address;
    if (!isLocalRequest(request, peer)) return json({ error: "Work view is available only on this computer." }, 403);
    if (post && !isSameOriginJson(request)) return json({ error: "Review changes must come from the local work viewer." }, 403);
    return null;
  }

  async function body(request) {
    try {
      return await request.json();
    } catch {
      throw new ValidationError([{ path: [], message: "Body must be valid JSON" }]);
    }
  }

  function staticFile(pathname) {
    const rel = normalize(decodeURIComponent(pathname.replace(/^\/work-view\//, "").replace(/^\//, "")));
    if (rel.startsWith("..") || rel.includes(`${sep}..${sep}`)) return null;
    const full = join(config.publicDir, rel);
    if (!existsSync(full) || !statSync(full).isFile()) return null;
    return new Response(Bun.file(full), { headers: { "Content-Type": STATIC_TYPES[extname(full).toLowerCase()] ?? "application/octet-stream", ...BASE_HEADERS } });
  }

  async function route(request, server) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // ---- MCP over Streamable HTTP (its own bearer auth and Origin rules)
    if (pathname === "/mcp") return await mcpHttp(request);

    // ---- login sessions (remote mode): /api/login, /api/logout, and the 401/403 gates
    const loginResponse = await login.handle(request, { server });
    if (loginResponse) return loginResponse;

    // ---- /v1/live WebSocket: same guards as /v1 (local only + optional bearer key), Origin check, upgrade
    if (pathname === "/v1/live" && method === "GET") {
      const denied = guarded(request, server);
      if (denied) return denied;
      if (config.apiKey) {
        const auth = request.headers.get("authorization") ?? "";
        if (auth !== `Bearer ${config.apiKey}`) return json({ error: "A valid bearer key is required." }, 401);
      }
      if (isCrossOrigin(request)) return json({ error: "This origin is not allowed." }, 403);
      const project = new URL(request.url).searchParams.get("project") || null;
      if (server.upgrade(request, { data: { project } })) return undefined;
      return json({ error: "WebSocket upgrade failed." }, 400);
    }

    // ---- static
    if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      return new Response(indexHtml(), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...BASE_HEADERS, "Content-Security-Policy": APP_CSP } });
    }
    if (method === "GET" && pathname === "/health") return json({ status: "ok", timestamp: Date.now() });
    if (method === "GET" && (pathname.startsWith("/work-view/") || /\.(?:svg|webp|png|ttf|woff2)$/.test(pathname)) && !pathname.startsWith("/api/")) {
      const file = staticFile(pathname);
      if (file) return file;
    }

    // ---- GET api
    if (method === "GET" && pathname === "/api/work-view") {
      const denied = guarded(request, server);
      return denied ?? json(service.snapshot());
    }
    if (method === "GET" && pathname === "/api/work-view/events") {
      const denied = guarded(request, server);
      return denied ?? service.eventStream(request.signal);
    }
    let m = /^\/api\/work-view\/evidence\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (method === "GET" && m) {
      const denied = guarded(request, server);
      if (denied) return denied;
      if (!/^\d+$/.test(m[2]) || !Number.isSafeInteger(Number(m[2]))) return json({ error: "Invalid id" }, 400);
      const row = EVIDENCE_KINDS.includes(m[1]) ? service.source.evidence(m[1], Number(m[2])) : null;
      return row ? json(row) : json({ error: "Recorded evidence not found." }, 404);
    }
    m = /^\/api\/work-view\/file\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(pathname);
    if (method === "GET" && m) {
      const denied = guarded(request, server);
      if (denied) return denied;
      if (request.headers.get("sec-fetch-site") === "cross-site" || isCrossOrigin(request)) return json({ error: "Recorded files open only from the local work viewer." }, 403);
      if (!/^\d+$/.test(m[2])) return json({ error: "Invalid id" }, 400);
      if (!/^\d+$/.test(m[3])) return json({ error: "Invalid index" }, 400);
      const path = service.source.file(m[1], Number(m[2]), Number(m[3]));
      if (!path) return json({ error: "Recorded file not found." }, 404);
      return new Response(Bun.file(path), {
        headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox allow-scripts", "Content-Type": MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream" },
      });
    }
    if (method === "GET" && pathname === "/api/work-state") {
      const denied = guarded(request, server);
      return denied ?? text("The clone does not read work state through this route. Use /api/work-view.", 501);
    }

    // ---- setup (cloud onboarding is not part of the clone: setup is permanently complete)
    if (method === "GET" && pathname === "/api/setup/state") {
      const denied = guarded(request, server);
      return denied ?? json({ status: "complete", choice: null, installer: null, checkout: null, tools: null, completedAt: null, alreadyPro: false, history: { projects: 0, sessions: 0, observations: 0 }, historyImport: null, backgroundWorkRunning: [] });
    }
    if (method === "GET" && pathname === "/api/setup/scan") {
      const denied = guarded(request, server);
      return denied ?? json(service.snapshot().setup.scan);
    }
    if (method === "POST" && pathname.startsWith("/api/setup/")) {
      const denied = guarded(request, server, { post: true });
      return denied ?? json({ error: "Account setup is not part of aletheia-mem." }, 404);
    }

    // ---- POST api
    if (method === "POST") {
      const post = ["/api/work-view/review", "/api/work-view/rules", "/api/work-view/agents/mark-finished", "/api/work-view/rules/load-in-claude-code"].includes(pathname);
      if (post) {
        const denied = guarded(request, server, { post: true });
        if (denied) return denied;
        if (pathname === "/api/work-view/rules/load-in-claude-code") return json(service.loadRulesInClaudeCode());
        const raw = await body(request);
        if (pathname === "/api/work-view/review") return json(service.review(validateReview(raw)));
        if (pathname === "/api/work-view/rules") return json(service.saveRule(validateRuleAction(raw)));
        return json(service.markAgentFinished(validateMarkFinished(raw)));
      }
      if (pathname === "/api/work-state/entries") {
        const denied = guarded(request, server, { post: true });
        if (denied) return denied;
        return text(service.appendWorkState(validateWorkStateWrite(await body(request))));
      }
    }
    const hubResponse = await hubRoutes.handle(request, { json, text, guarded, server });
    if (hubResponse) return hubResponse;
    return notFoundRoute(method, pathname);
  }

  const server = Bun.serve({
    hostname: config.host,
    port: config.port,
    idleTimeout: 0,
    maxRequestBodySize: 9 * 1024 * 1024, // refuse larger uploads at the socket (the hub caps bodies at 8 MB)
    async fetch(request, srv) {
      try {
        return await route(request, srv);
      } catch (error) {
        if (error instanceof ValidationError) return json({ error: "Invalid request body.", details: error.issues }, 400);
        if (error instanceof BadRequest) return json({ error: error.message }, error.status);
        if (error instanceof HttpError) return json({ error: error.message, ...error.extra }, error.status);
        if (error instanceof RangeError) return json({ error: error.message }, 400);
        console.error("[work-view] request failed:", request.method, request.url, error);
        return json({ error: "Internal error." }, 500);
      }
    },
    websocket: {
      open(ws) { liveHub.add(ws, ws.data ?? {}); },
      message() { /* client frames are ignored; the server only pushes advisory changes */ },
      close(ws) { liveHub.remove(ws); },
    },
  });
  return {
    server,
    service,
    hub,
    liveHub,
    stop() {
      worker?.stop();
      server.stop(true);
      service.close();
      hub.close();
      loginStore?.close();
    },
  };
}
