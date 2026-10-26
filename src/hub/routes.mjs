// Hub HTTP routes: /api/hub/* for the Hub UI and /v1/* for tools (the universal, tool-neutral API).
// Same guards as the rest of the server: local only, same-origin JSON for writes, optional bearer key for /v1.
import { existsSync, readFileSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { extname } from "node:path";
import { makeProvider } from "../refresh/providers.mjs";
import { isProjectExcluded, normalizeHook } from "./capture.mjs";
import { healthReport } from "./health.mjs";
import { projectKeyForPath } from "../readmodel/project.mjs";
import { compressRecent } from "./compress.mjs";
import { importClaudeMem } from "./importers.mjs";
import { nearDuplicates } from "./dedupe.mjs";
import { INSTALLERS, doctor } from "./install.mjs";
import { spoolPath, spoolRead } from "./hooks/shared.mjs";
import { parseRulesFromText, syncTool, targetPath } from "./rules-sync.mjs";
import { TOOLS, applyMcp, detectTools, mcpCommand, mcpPlan, toolById } from "./tools.mjs";
import { sessionDetail, workOverview } from "./work.mjs";
import { goalAction, proposeGoals } from "./goals.mjs";
import { SyncStore } from "./sync/store.mjs";
import { AlertStore, deliverDue, extractionFailures, queueDepth } from "./alerts.mjs";
import { applyErase, erasePlan, loadEraseKey, receiptId, signReceipt, verifyReceipt, writePreEraseExport, writeReceipt } from "./erasure.mjs";
import { teamRequest } from "./team-api.mjs";
import { TeamStore } from "./team.mjs";

const MAX_BODY = 8 * 1024 * 1024;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml" };

export class BadRequest extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const need = (cond, message, status) => { if (!cond) throw new BadRequest(message, status); };

function absDir(p, what = "projectDir") {
  need(typeof p === "string" && isAbsolute(p), `${what} must be an absolute path.`);
  need(existsSync(p) && statSync(p).isDirectory(), `${what} is not a folder that exists.`);
  return resolve(p);
}

export function createHubRoutes({ hub, config, liveHub = null, alerts = null }) {
  const mcpScript = join(import.meta.dir, "..", "..", "bin", "mcp.mjs");
  const argv = () => mcpCommand({ bun: process.execPath, script: mcpScript });
  const qs = (url) => Object.fromEntries(url.searchParams);
  const live = (frame) => liveHub?.broadcast(frame);
  let syncStore = null;
  const getSyncStore = () => syncStore ?? (syncStore = new SyncStore(config.syncDb));
  let teamStore = null;
  const getTeamStore = () => teamStore ?? (teamStore = new TeamStore(config.teamDb, {
    tokenActive: (tokenId) => {
      const row = getSyncStore().db.prepare("SELECT revoked_at, expires_at FROM sync_token WHERE id = ?").get(Number(tokenId));
      return !!row && !row.revoked_at && !(row.expires_at && row.expires_at < Date.now());
    },
  }));
  let alertStore = alerts;
  const getAlerts = () => alertStore ?? (alertStore = new AlertStore(config.alertsDb));

  async function readJson(request) {
    const len = Number(request.headers.get("content-length") ?? 0);
    if (len > MAX_BODY) throw new BadRequest("Body too large.", 413);
    let raw;
    try { raw = await request.text(); } catch { throw new BadRequest("Could not read the body."); }
    if (raw.length > MAX_BODY) throw new BadRequest("Body too large.", 413);
    try { return raw ? JSON.parse(raw) : {}; } catch { throw new BadRequest("Body must be valid JSON."); }
  }

  const toolView = (t) => {
    const plan = mcpPlan(t, config.home, argv());
    return { id: t.id, name: t.name, installed: detectTools(config.home).find((d) => d.id === t.id).installed, rules: { project: t.rules.project, global: t.rules.global, style: t.rules.style }, mcp: plan.supported ? { kind: plan.kind, path: plan.path, command: plan.command ?? null, snippet: plan.snippet ?? null, connected: plan.connected, error: plan.error ?? null } : null };
  };

  const memoryInput = (b, tool) => {
    need(b && typeof b === "object", "Body must be an object.");
    return { ...b, tool: b.tool ?? tool ?? "api", narrative: b.narrative ?? b.text, sessionId: b.sessionId ?? b.session_id };
  };

  const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);
  const pairKeyOf = (a, b) => (Number(a) < Number(b) ? `${Number(a)}:${Number(b)}` : `${Number(b)}:${Number(a)}`);
  const dismissedPairs = () => new Set(hub.setting("review.pairs.dismissed", []));

  /** One review_queue row with the thing it points at. Unknown types stay as a reason and an id. */
  function reviewItemView(row) {
    const base = { id: row.id, type: row.item_type, itemId: row.item_id, reason: row.reason, status: row.status, proposedBy: row.proposed_by, createdAt: iso(row.created_at_epoch) };
    try {
      if (row.item_type === "fact") {
        const fact = hub.getFact(row.item_id);
        if (fact) return { ...base, text: fact.text, project: fact.project, factStatus: fact.status, confidence: fact.confidence };
      }
      if (row.item_type === "rule") {
        const rule = hub.db.prepare("SELECT * FROM rule_suggestions WHERE id = ?").get(row.item_id);
        if (rule) return { ...base, text: rule.text, project: rule.project, confidence: rule.confidence, suggestionStatus: rule.status };
      }
      if (row.item_type === "entity") {
        const entity = hub.db.prepare("SELECT * FROM entities WHERE id = ?").get(row.item_id);
        if (entity) {
          const aliases = hub.db.prepare("SELECT alias, confidence FROM entity_aliases WHERE entity_id = ? ORDER BY confidence DESC").all(entity.id);
          return { ...base, name: entity.name, canonicalName: entity.canonical_name, entityType: entity.type, project: entity.project, aliases };
        }
      }
    } catch {
      // a row whose target vanished stays visible with its reason
    }
    return base;
  }

  function doctorEnv(server) {
    const root = join(import.meta.dir, "..", "..");
    return {
      home: config.home,
      bun: process.execPath,
      hookScript: join(root, "bin", "aletheia.mjs"),
      hookRunner: join(config.dataDir, "aletheia.bundle.mjs"),
      mcpScript: join(root, "bin", "mcp.mjs"),
      dataDir: config.dataDir,
      dbPath: config.hubDb,
      port: server?.port ?? config.port,
      provider: config.provider,
      mode: config.mode,
    };
  }

  async function doctorData(server) {
    const env = doctorEnv(server);
    const detected = new Map(detectTools(config.home).map((tool) => [tool.id, tool]));
    const spoolItems = spoolRead(config.dataDir);
    const spoolBytes = existsSync(spoolPath(config.dataDir)) ? statSync(spoolPath(config.dataDir)).size : 0;
    const tools = INSTALLERS.map((installer) => {
      const expected = installer.expectedHooks?.(env) ?? null;
      let present = 0;
      let error = null;
      if (expected) {
        try {
          const doc = existsSync(expected.file) ? JSON.parse(readFileSync(expected.file, "utf8")) : {};
          const handlers = Object.values(doc.hooks ?? {}).flatMap((definitions) => (Array.isArray(definitions) ? definitions : []).flatMap((definition) => (Array.isArray(definition?.hooks) ? definition.hooks.map((handler) => handler?.command) : [definition?.command]))).filter(Boolean);
          present = Object.values(expected.commands).filter((command) => handlers.includes(command)).length;
        } catch (failure) {
          error = `cannot read ${expected.file}: ${failure instanceof Error ? failure.message : String(failure)}`;
        }
      }
      const last = hub.db.prepare("SELECT MAX(created_at_epoch) AS at FROM memories WHERE tool = ?").get(installer.id)?.at ?? null;
      return {
        id: installer.id,
        name: installer.name,
        capabilities: installer.capabilities,
        verification: installer.verification,
        installed: !!detected.get(installer.id)?.installed,
        hooks: { file: expected?.file ?? null, present, expected: Object.keys(expected?.commands ?? {}).length, events: Object.keys(expected?.commands ?? {}), commands: expected?.commands ?? {}, error },
        lastCapture: iso(last),
        spool: { items: spoolItems.length, bytes: spoolBytes, path: spoolPath(config.dataDir) },
        commands: {
          install: `aletheia install ${installer.id} --write`,
          uninstall: `aletheia uninstall ${installer.id} --write`,
          doctor: "aletheia doctor",
          mcp: argv().join(" "),
        },
      };
    });
    let checks = [];
    try {
      checks = await doctor(env);
    } catch (failure) {
      checks = [{ name: "doctor", ok: false, detail: failure instanceof Error ? failure.message : String(failure) }];
    }
    return { tools, checks, dataDir: config.dataDir, generatedAt: new Date().toISOString() };
  }

  /** Returns a Response, or null when the path is not a hub route. `h` = {json, text, guarded, server}. */
  async function handle(request, h) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    const isHub = pathname.startsWith("/api/hub/");
    const isV1 = pathname.startsWith("/v1/") || pathname === "/healthz";
    const isUi = pathname === "/hub" || pathname.startsWith("/hub/");
    if (!isHub && !isV1 && !isUi) return null;

    if (isUi) {
      if (method !== "GET") return null;
      // The one UI replaced the separate Memory Hub page. /hub is kept as a redirect so old links and
      // bookmarks land on the Memory tab; its assets are still served for the old page and for tests.
      if (pathname === "/hub" || pathname === "/hub/") {
        const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Memory Hub</title>
<meta http-equiv="refresh" content="0; url=/#/memory">
<link rel="canonical" href="/#/memory">
</head>
<body>
<p>Memory Hub is now the Memory tab of the Aletheia app. <a href="/#/memory">Open /#/memory</a>.</p>
<script>location.replace("/#/memory")</script>
</body>
</html>`;
        return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Content-Security-Policy": "frame-ancestors 'none'", "X-Frame-Options": "DENY" } });
      }
      const rel = decodeURIComponent(pathname.slice(5));
      if (rel.includes("..")) return h.json({ error: "Not found." }, 404);
      const file = join(config.hubUiDir, rel);
      if (!existsSync(file) || !statSync(file).isFile()) return h.json({ error: "Not found." }, 404);
      return new Response(Bun.file(file), { headers: { "Content-Type": TYPES[extname(file)] ?? "application/octet-stream", "Cache-Control": "no-store", "Content-Security-Policy": "frame-ancestors 'none'", "X-Frame-Options": "DENY" } });
    }

    if (pathname === "/healthz" && method === "GET") {
      const health = healthReport(hub);
      return h.json(health, health.status === "ok" ? 200 : 503);
    }
    const denied = h.guarded(request, h.server, { post: method !== "GET" && method !== "HEAD" });
    if (denied) return denied;
    if (isV1 && config.apiKey) {
      const auth = request.headers.get("authorization") ?? "";
      if (auth !== `Bearer ${config.apiKey}`) return h.json({ error: "A valid bearer key is required." }, 401);
    }
    const tool = request.headers.get("x-tool") ?? undefined;
    let m;

    // ---- T-112: team mode for the local Hub UI. The route guard already made this an operator session. ----
    if (pathname === "/api/hub/team" || pathname.startsWith("/api/hub/team/")) {
      const sync = getSyncStore();
      const account = sync.ensureAccount();
      const body = method === "GET" || method === "HEAD" ? null : await readJson(request);
      const result = teamRequest({
        path: pathname.slice("/api/hub/team".length) || "/",
        method,
        url,
        body,
        team: getTeamStore(),
        sync,
        accountId: account.id,
        tokenId: null,
        operator: true,
      });
      return result ? h.json(result.body, result.status) : h.json({ error: "Not found." }, 404);
    }

    // ---- T-113: erasure report, apply and receipt verification for the local UI/admin session ----
    if (pathname === "/api/hub/erasure/report" && method === "POST") {
      const b = await readJson(request);
      const before = b.before == null ? null : typeof b.before === "number" ? b.before : Date.parse(String(b.before));
      need(before == null || Number.isFinite(before), "before must be a date or an epoch.");
      const plan = erasePlan(hub, { project: b.project ?? null, ids: Array.isArray(b.ids) ? b.ids : b.id == null ? [] : [b.id], before });
      return h.json({ plan });
    }
    if (pathname === "/api/hub/erasure/apply" && method === "POST") {
      const b = await readJson(request);
      const before = b.before == null ? null : typeof b.before === "number" ? b.before : Date.parse(String(b.before));
      need(before == null || Number.isFinite(before), "before must be a date or an epoch.");
      const plan = erasePlan(hub, { project: b.project ?? null, ids: Array.isArray(b.ids) ? b.ids : b.id == null ? [] : [b.id], before });
      if (!plan.counts.memories && !plan.counts.observations && !plan.counts.episodes && !plan.counts.facts) {
        return h.json({ plan, erased: false, note: "Nothing matched; no export and no receipt." });
      }
      const exportPath = typeof b.export_path === "string" && b.export_path ? b.export_path : join(config.erasureExportDir, `erase-${receiptId()}.jsonl`);
      writePreEraseExport(hub, { path: exportPath, project: plan.scope.project });
      const sync = getSyncStore();
      const result = applyErase(hub, plan, {
        syncStore: sync,
        accountId: sync.ensureAccount().id,
        teamStore: existsSync(config.teamDb) ? getTeamStore() : null,
        project: plan.scope.project,
      });
      const receipt = signReceipt(plan, { key: loadEraseKey(config.erasureKey), exports: [exportPath] });
      const receiptPath = typeof b.receipt_path === "string" && b.receipt_path ? b.receipt_path : join(config.erasureReceiptDir, `${receipt.id}.json`);
      writeReceipt(receipt, receiptPath);
      return h.json({ erased: true, plan, sync: result.sync, exportPath, receiptPath, receipt });
    }
    if (pathname === "/api/hub/erasure/verify" && method === "POST") {
      const b = await readJson(request);
      need(b && b.receipt && typeof b.receipt === "object", "receipt (the JSON object) is required.");
      const key = loadEraseKey(config.erasureKey, { create: false });
      const result = verifyReceipt(b.receipt, key);
      return h.json(result, result.ok ? 200 : 400);
    }

    // ---- T-114: alert rules, the feed and delivery controls for the local UI/admin session ----
    if (pathname === "/api/hub/alerts/rules" && method === "GET") return h.json({ rules: getAlerts().listRules() });
    if (pathname === "/api/hub/alerts/rules" && method === "POST") {
      const b = await readJson(request);
      try {
        return h.json({ rule: getAlerts().addRule({
          name: b.name, event: b.event, countThreshold: b.countThreshold ?? b.count_threshold,
          minValue: b.minValue ?? b.min_value, windowS: b.windowS ?? b.window_s,
          target: b.target, url: b.url, path: b.path, secret: b.secret,
          allowPrivate: b.allowPrivate === true || b.allow_private === true,
          enabled: b.enabled !== false, rateLimitS: b.rateLimitS ?? b.rate_limit_s,
        }) }, 201);
      } catch (error) {
        throw new BadRequest(error instanceof Error ? error.message : String(error));
      }
    }
    if ((m = /^\/api\/hub\/alerts\/rules\/(\d+)$/.exec(pathname))) {
      if (method === "PATCH") {
        const b = await readJson(request);
        try {
          const rule = getAlerts().updateRule(Number(m[1]), {
            name: b.name, event: b.event, countThreshold: b.countThreshold ?? b.count_threshold,
            minValue: b.minValue ?? b.min_value, windowS: b.windowS ?? b.window_s,
            target: b.target, url: b.url, path: b.path, secret: b.secret,
            allowPrivate: b.allowPrivate ?? b.allow_private,
            enabled: b.enabled, rateLimitS: b.rateLimitS ?? b.rate_limit_s,
          });
          return rule ? h.json({ rule }) : h.json({ error: "That alert rule does not exist." }, 404);
        } catch (error) {
          throw new BadRequest(error instanceof Error ? error.message : String(error));
        }
      }
      if (method === "DELETE") return getAlerts().removeRule(Number(m[1])) ? h.json({ deleted: true }) : h.json({ error: "That alert rule does not exist." }, 404);
    }
    if (pathname === "/api/hub/alerts/feed" && method === "GET") return h.json({ deliveries: getAlerts().feed({ limit: Number(qs(url).limit) || 100 }) });
    if (pathname === "/api/hub/alerts/test" && method === "POST") {
      const b = await readJson(request);
      need(b && Number.isSafeInteger(Number(b.id)), "id is required.");
      const queued = getAlerts().testRule(Number(b.id));
      need(queued, "That alert rule does not exist.", 404);
      return h.json({ queued, ...(await deliverDue(getAlerts())) });
    }
    if (pathname === "/api/hub/alerts/run" && method === "POST") return h.json(await deliverDue(getAlerts()));
    if (pathname === "/api/hub/alerts/check" && method === "POST") {
      const depth = queueDepth(hub);
      const failures = extractionFailures(hub);
      const queued = getAlerts().emit("queue.depth", { value: depth, detail: { depth } });
      if (failures) queued.push(...getAlerts().emit("extraction.failed", { value: failures, detail: { failures, window: "1h" } }));
      return h.json({ queueDepth: depth, failures, queued });
    }

    // ================= /v1: the universal API (what any tool, script or MCP bridge calls) =================
    if (isV1) {
      if (pathname === "/v1/health" && method === "GET") {
        const report = healthReport(hub);
        return h.json({ ...report, ok: report.status === "ok" }, report.status === "ok" ? 200 : 503);
      }
      if (pathname === "/v1/info" && method === "GET") return h.json({ name: "aletheia-mem", version: "0.1.0", api: "v1", stats: hub.stats() });
      if (pathname === "/v1/work" && method === "GET") {
        const q = qs(url);
        return h.json({ ...workOverview(hub, {
          project: q.project || null,
          sessionLimit: q.sessions,
          factLimit: q.facts,
          reviewLimit: q.review,
          activeMinutes: q.activeMinutes,
          windowHours: q.windowHours,
          dismissedHours: q.dismissedHours,
        }), mode: config.mode });
      }
      if (pathname === "/v1/work/goals" && method === "GET") {
        const q = qs(url);
        return h.json(proposeGoals(hub, { project: q.project || null, minSessions: q.minSessions, limit: q.limit }));
      }
      if ((m = /^\/v1\/work\/session\/(.+)$/.exec(pathname)) && method === "GET") {
        let id;
        try { id = decodeURIComponent(m[1]); } catch { throw new BadRequest("The session id is not valid URL text."); }
        const detail = sessionDetail(hub, { sessionId: id, project: qs(url).project || null });
        return detail ? h.json({ session: detail }) : h.json({ error: "No session has that id." }, 404);
      }
      if (pathname === "/v1/memories" && method === "POST") {
        const input = memoryInput(await readJson(request), tool);
        const r = hub.add(input, { actor: tool ?? "api" });
        live({ kind: "session", id: r.id, project: input.project ?? "default" });
        return h.json({ id: r.id, created: r.created }, r.created ? 201 : 200);
      }
      if ((m = /^\/v1\/memories\/(\d+)$/.exec(pathname)) && method === "GET") {
        const mem = hub.get(Number(m[1]));
        return mem ? h.json(mem) : h.json({ error: "No memory has that id." }, 404);
      }
      if (pathname === "/v1/search" && method === "POST") {
        const b = await readJson(request);
        need(typeof b.query === "string" && b.query.trim(), "query is required.");
        const scope = b.scope === "all" ? "all" : "current";
        const detailed = hub.searchDetailed({ query: b.query, project: b.project, kind: b.kind, type: b.type, tool: b.tool, limit: b.limit ?? 20, scope });
        return h.json({
          results: hub.search({ query: b.query, project: b.project, kind: b.kind, type: b.type, tool: b.tool, limit: b.limit ?? 20, scope }),
          facts: hub.searchFacts({ query: b.query, project: b.project, limit: b.limit ?? 20, includeHistory: b.includeHistory === true, asOf: b.asOf ?? null, scope }),
          reason: detailed.reason,
          channels: {
            facts: { lexical: true, keys: true, vector: false },
            episodes: { lexical: true, vector: false },
            fused: "none",
            note: "This route answers from keyword channels only. Use the CLI with --semantic, or POST a query vector, for dense results.",
          },
        });
      }
      if (pathname === "/v1/timeline" && method === "POST") {
        const b = await readJson(request);
        return h.json(hub.timeline({ anchor: b.anchor, query: b.query, project: b.project, before: b.before ?? 5, after: b.after ?? 5 }));
      }
      if (pathname === "/v1/observations/batch" && method === "POST") {
        const b = await readJson(request);
        need(Array.isArray(b.ids), "ids must be an array.");
        return h.json({ observations: hub.getMany(b.ids) });
      }
      if (pathname === "/v1/context" && method === "POST") {
        const b = await readJson(request);
        return h.json({ context: hub.context({ project: b.project, limit: b.limit ?? 20, maxChars: b.maxChars ?? 6000, tool: b.tool ?? tool, scope: b.scope === "all" ? "all" : "current" }) });
      }
      if (pathname === "/v1/events" && method === "POST") {
        const b = await readJson(request);
        const proj = b.project ?? (b.payload?.cwd ? projectKeyForPath(b.payload.cwd) : b.cwd ? projectKeyForPath(b.cwd) : "default");
        if (isProjectExcluded(proj, config.excludedProjects ?? [])) return h.json({ stored: false, reason: "excluded_project", project: proj });
        const memory = normalizeHook(b.payload ?? b, { tool: b.tool ?? tool ?? "api", project: b.project, excluded: config.excludedProjects });
        if (!memory) return h.json({ stored: false, reason: "Nothing to store for this event." });
        const r = hub.add(memory, { actor: memory.tool });
        live({ kind: "session", id: r.id, project: memory.project ?? "default" });
        return h.json({ stored: r.created, id: r.id }, r.created ? 201 : 200);
      }
      return h.json({ error: "Not found." }, 404);
    }

    // ================= /api/hub: the Hub UI =================
    if (pathname === "/api/hub/overview" && method === "GET") {
      return h.json({ stats: hub.stats(), projects: hub.projects(), tools: detectTools(config.home), claudeMem: { path: config.sourceDb, exists: existsSync(config.sourceDb) }, dataDir: config.dataDir, provider: config.provider, apiKeyRequired: !!config.apiKey, mcp: { command: argv() } });
    }
    if (pathname === "/api/hub/memories" && method === "GET") {
      const q = qs(url);
      return h.json(hub.list({ project: q.project, kind: q.kind, type: q.type, tool: q.tool, pinned: q.pinned === "1", q: q.q, limit: q.limit, offset: q.offset }));
    }
    if (pathname === "/api/hub/memories" && method === "POST") {
      const b = await readJson(request);
      const r = hub.add({ ...memoryInput(b, "ui"), kind: "note", tool: b.tool ?? "manual" }, { actor: "ui" });
      live({ kind: "session", id: r.id, project: b.project ?? "default" });
      return h.json({ ...r, memory: hub.get(r.id) }, r.created ? 201 : 200);
    }
    if ((m = /^\/api\/hub\/memories\/(\d+)$/.exec(pathname))) {
      const id = Number(m[1]);
      if (method === "GET") { const mem = hub.get(id); return mem ? h.json(mem) : h.json({ error: "No memory has that id." }, 404); }
      if (method === "PATCH") { const mem = hub.update(id, await readJson(request)); return mem ? h.json(mem) : h.json({ error: "No memory has that id." }, 404); }
      if (method === "DELETE") return hub.remove(id) ? h.json({ deleted: true }) : h.json({ error: "No memory has that id." }, 404);
    }
    if (pathname === "/api/hub/projects" && method === "GET") return h.json({ projects: hub.projects() });
    if (pathname === "/api/hub/projects/merge" && method === "POST") {
      const b = await readJson(request);
      return h.json(hub.mergeProjects(b.from, b.into));
    }

    if (pathname === "/api/hub/rules" && method === "GET") return h.json({ rules: hub.rules.list() });
    if (pathname === "/api/hub/rules" && method === "POST") {
      const b = await readJson(request);
      const r = hub.rules.add({ then: b.then, when: b.when, scopeTier: b.scopeTier, scopeName: b.scopeName, tools: b.tools, source: "you" });
      return h.json({ ...r, rule: hub.rules.get(r.id) }, r.created ? 201 : 200);
    }
    if ((m = /^\/api\/hub\/rules\/([\w-]+)$/.exec(pathname))) {
      if (method === "PATCH") { const r = hub.rules.update(m[1], await readJson(request)); return r ? h.json(r) : h.json({ error: "That rule does not exist." }, 404); }
      if (method === "DELETE") return hub.rules.remove(m[1]) ? h.json({ deleted: true }) : h.json({ error: "That rule does not exist." }, 404);
    }
    if ((pathname === "/api/hub/rules/preview" || pathname === "/api/hub/rules/sync") && method === "POST") {
      const b = await readJson(request);
      const scope = b.scope === "global" ? "global" : "project";
      const projectDir = scope === "project" ? absDir(b.projectDir) : undefined;
      const ids = Array.isArray(b.tools) && b.tools.length ? b.tools : TOOLS.map((t) => t.id);
      for (const id of ids) need(toolById(id), `Unknown tool: ${id}`);
      const apply = pathname.endsWith("/sync");
      if (apply) need(b.confirm === true, "Send confirm: true to write files. Preview first.", 400);
      const results = ids.map((id) => syncTool(hub.rules.list(), id, { scope, projectDir, home: config.home, dryRun: !apply }));
      if (apply) hub.audit("ui", "rules.sync", { tools: ids, scope, projectDir, written: results.filter((r) => r.written).map((r) => r.path) });
      return h.json({ results });
    }
    if (pathname === "/api/hub/rules/import" && method === "POST") {
      const b = await readJson(request);
      let path = b.path;
      if (!path && b.tool) {
        const scope = b.scope === "global" ? "global" : "project";
        path = targetPath(b.tool, { scope, projectDir: scope === "project" ? absDir(b.projectDir) : undefined, home: config.home });
      }
      need(typeof path === "string" && isAbsolute(path) && existsSync(path) && statSync(path).isFile(), "path must be an absolute path to a file that exists.");
      need(statSync(path).size <= 1_000_000, "That file is too large to read as rules.");
      const found = parseRulesFromText(readFileSync(path, "utf8"));
      const out = { found: found.length, added: 0, skipped: 0 };
      for (const r of found) {
        try { out[hub.rules.add({ ...r, source: `import:${b.tool ?? "file"}`, tools: b.tool ? [b.tool] : null }).created ? "added" : "skipped"]++; } catch { out.skipped++; }
      }
      hub.audit("ui", "rules.import", { path, ...out });
      return h.json(out);
    }

    if (pathname === "/api/hub/tools" && method === "GET") return h.json({ tools: TOOLS.map(toolView) });
    if ((m = /^\/api\/hub\/tools\/([\w-]+)\/connect$/.exec(pathname)) && method === "POST") {
      const t = toolById(m[1]);
      need(t, "Unknown tool.", 404);
      const b = await readJson(request);
      if (!b.apply) return h.json({ plan: toolView(t).mcp });
      need(b.confirm === true, "Send confirm: true to write the config. Preview first.");
      const r = applyMcp(t, config.home, argv());
      hub.audit("ui", "tool.connect", { tool: t.id, ...r });
      return h.json({ ...r, tool: toolView(t) });
    }

    if (pathname === "/api/hub/export" && method === "GET") {
      const q = qs(url);
      const markdown = q.format === "markdown";
      const body = markdown ? hub.exportMarkdown({ project: q.project }) : hub.exportBundle({ project: q.project, includeEvents: q.events === "1" });
      return new Response(body, { headers: { "Content-Type": markdown ? "text/markdown; charset=utf-8" : "application/x-ndjson; charset=utf-8", "Content-Disposition": `attachment; filename="aletheia-${new Date().toISOString().slice(0, 10)}.${markdown ? "md" : "jsonl"}"`, "Cache-Control": "no-store" } });
    }
    if (pathname === "/api/hub/import/bundle" && method === "POST") {
      const b = await readJson(request);
      need(typeof b.bundle === "string" && b.bundle.length, "bundle must be the text of an exported .jsonl file.");
      return h.json(hub.importBundle(b.bundle, { actor: "import" }));
    }
    if (pathname === "/api/hub/import/claude-mem" && method === "POST") {
      const b = await readJson(request);
      const path = b.path || config.sourceDb;
      need(isAbsolute(path), "path must be absolute.");
      return h.json(importClaudeMem(hub, path, { includePrompts: b.includePrompts !== false, project: b.project || null }));
    }
    if (pathname === "/api/hub/context" && method === "GET") {
      const q = qs(url);
      return h.json({ context: hub.context({ project: q.project, limit: Number(q.limit) || 20, tool: q.tool }) });
    }
    if (pathname === "/api/hub/compress" && method === "POST") {
      const b = await readJson(request);
      const ask = makeProvider(config);
      need(ask, "Set ALETHEIA_PROVIDER=claude-cli or openai to compress events into observations.", 409);
      return h.json(await compressRecent(hub, ask, { project: b.project }));
    }
    if (pathname === "/api/hub/audit" && method === "GET") return h.json({ audit: hub.auditLog(Number(qs(url).limit) || 100) });

    // ---- T-135: the facts table (current by default, history on request) ----
    if (pathname === "/api/hub/facts" && method === "GET") {
      const q = qs(url);
      return h.json(hub.listFacts({ project: q.project || undefined, history: q.history === "1" || q.history === "true", limit: Number(q.limit) || 100, offset: Number(q.offset) || 0 }));
    }

    // ---- T-136: the review queue, near-duplicate pairs and their actions ----
    if (pathname === "/api/hub/review" && method === "GET") {
      const q = qs(url);
      const status = q.status || "pending";
      const items = hub.reviewQueue({ status, limit: Number(q.limit) || 100 }).map(reviewItemView);
      const dismissed = dismissedPairs();
      const scanProject = q.project || hub.projects()[0]?.name || null;
      const duplicates = [];
      const dismissedDuplicates = [];
      if (scanProject) {
        const scan = nearDuplicates(hub, { project: scanProject, maxRows: Math.min(Number(q.scan) || 500, 2000) });
        for (const pair of scan.pairs) {
          const a = hub.getObservation(pair.a);
          const b = hub.getObservation(pair.b);
          if (!a || !b) continue;
          const key = pairKeyOf(pair.a, pair.b);
          const item = { key, a: pair.a, b: pair.b, aText: a.title, bText: b.title, score: Math.round(pair.score * 1000) / 1000, auto: pair.auto };
          (dismissed.has(key) ? dismissedDuplicates : duplicates).push(item);
        }
      }
      return h.json({ items, duplicates, dismissedDuplicates, project: scanProject, status });
    }
    if (pathname === "/api/hub/review/pairs" && method === "POST") {
      const b = await readJson(request);
      need(Number.isSafeInteger(Number(b.a)) && Number.isSafeInteger(Number(b.b)), "a and b are required.");
      need(["merge", "distinct", "restore"].includes(b.action), "action must be merge, distinct or restore.");
      const key = pairKeyOf(b.a, b.b);
      const dismissed = dismissedPairs();
      if (b.action === "merge") {
        const result = hub.mergeObservations(Number(b.a), Number(b.b), { actor: "ui" });
        dismissed.delete(key);
        hub.setSetting("review.pairs.dismissed", [...dismissed]);
        return h.json({ action: "merge", key, ...result });
      }
      if (b.action === "distinct") dismissed.add(key);
      else dismissed.delete(key);
      hub.setSetting("review.pairs.dismissed", [...dismissed]);
      hub.audit("ui", `review.pair.${b.action}`, { key });
      return h.json({ action: b.action, key, dismissed: dismissed.has(key) });
    }
    if ((m = /^\/api\/hub\/review\/(\d+)$/.exec(pathname)) && method === "POST") {
      const id = Number(m[1]);
      const b = await readJson(request);
      need(["accept", "reject", "reopen", "merge"].includes(b.action), "action must be accept, reject, reopen or merge.");
      const row = hub.getReview(id);
      need(row, "That review item does not exist.", 404);
      const reviewProject = reviewItemView(row).project ?? null;
      const suggestion = row.item_type === "rule" ? hub.db.prepare("SELECT * FROM rule_suggestions WHERE id = ?").get(row.item_id) : null;
      if (b.action === "merge") {
        need(Number.isSafeInteger(Number(b.into)), "into (the id to keep) is required for a merge.");
        const into = Number(b.into);
        need(into !== Number(row.item_id), "Pick a different row to merge into.");
        if (row.item_type === "fact") {
          need(hub.getFact(into), "The fact to keep does not exist.", 404);
          hub.closeFact(row.item_id, { status: "superseded" });
          hub.setFactSupersedes(row.item_id, into);
          hub.link({ fromType: "fact", fromId: row.item_id, toType: "fact", toId: into, relation: "duplicate_of" });
        } else if (row.item_type === "observation") {
          hub.mergeObservations(into, row.item_id, { actor: "ui" });
        } else {
          throw new BadRequest(`A ${row.item_type} review item cannot be merged from this page.`);
        }
        const updated = hub.resolveReview(id, { status: "accepted", actor: "ui" });
        live({ kind: "review", id, project: reviewProject });
        return h.json({ item: reviewItemView(updated) });
      }
      const status = b.action === "accept" ? "accepted" : b.action === "reject" ? "rejected" : "pending";
      if (suggestion) {
        const suggestionStatus = b.action === "accept" ? "accepted" : b.action === "reject" ? "dismissed" : "pending";
        if (b.action === "accept") {
          const scopeTier = suggestion.project && suggestion.project !== "default" ? "project" : "everywhere";
          hub.rules.add({ then: suggestion.text, when: suggestion.when_text, scopeTier, scopeName: scopeTier === "project" ? suggestion.project : "Everywhere", source: "suggested" });
        }
        hub.db.prepare("UPDATE rule_suggestions SET status = ? WHERE id = ?").run(suggestionStatus, suggestion.id);
        hub.audit("ui", `rule_suggestion.${b.action}`, { id: suggestion.id });
      }
      const updated = hub.resolveReview(id, { status, actor: "ui" });
      live({ kind: "review", id, project: reviewProject });
      return h.json({ item: reviewItemView(updated) });
    }

    // ---- T-137: rule suggestions, accept / dismiss / restore ----
    if (pathname === "/api/hub/rule-suggestions" && method === "GET") {
      const q = qs(url);
      const where = [];
      const params = [];
      if (q.project) { where.push("project = ?"); params.push(q.project); }
      if (q.status) { where.push("status = ?"); params.push(q.status); }
      const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
      const rows = hub.db.prepare(`SELECT * FROM rule_suggestions ${clause} ORDER BY created_at_epoch DESC, id DESC LIMIT ?`).all(...params, Math.min(Number(q.limit) || 100, 500));
      return h.json({ items: rows.map((row) => ({ id: row.id, project: row.project, text: row.text, when: row.when_text, confidence: row.confidence, status: row.status, sourceType: row.source_type, createdAt: iso(row.created_at_epoch) })) });
    }
    if ((m = /^\/api\/hub\/rule-suggestions\/(\d+)$/.exec(pathname)) && method === "POST") {
      const b = await readJson(request);
      need(["accept", "dismiss", "restore"].includes(b.action), "action must be accept, dismiss or restore.");
      const row = hub.db.prepare("SELECT * FROM rule_suggestions WHERE id = ?").get(Number(m[1]));
      need(row, "That rule suggestion does not exist.", 404);
      let ruleId = null;
      if (b.action === "accept") {
        const scopeTier = row.project && row.project !== "default" ? "project" : "everywhere";
        ruleId = hub.rules.add({ then: row.text, when: row.when_text, scopeTier, scopeName: scopeTier === "project" ? row.project : "Everywhere", source: "suggested" }).id;
      }
      const status = b.action === "accept" ? "accepted" : b.action === "dismiss" ? "dismissed" : "pending";
      hub.db.prepare("UPDATE rule_suggestions SET status = ? WHERE id = ?").run(status, row.id);
      const pending = hub.db.prepare("SELECT * FROM review_queue WHERE item_type = 'rule' AND item_id = ? AND status = 'pending'").get(row.id);
      if (pending) hub.resolveReview(pending.id, { status: b.action === "accept" ? "accepted" : b.action === "dismiss" ? "rejected" : "pending", actor: "ui" });
      else if (b.action === "restore") hub.addReview({ itemType: "rule", itemId: row.id, reason: "rule_suggestion", proposedBy: "extractor" });
      hub.audit("ui", `rule_suggestion.${b.action}`, { id: row.id, ruleId });
      return h.json({ id: row.id, status, ruleId });
    }

    // ---- T-138: installer status from doctor data, read only ----
    if (pathname === "/api/hub/doctor" && method === "GET") return h.json(await doctorData(h.server));

    // T-144: owner goals are pin/dismiss only; the goal list itself is computed from prompt rows.
    if ((m = /^\/api\/hub\/goals\/([a-f0-9]{16})$/.exec(pathname)) && method === "POST") {
      const b = await readJson(request);
      try {
        return h.json(goalAction(hub, m[1], { action: b.action, actor: "ui" }));
      } catch (error) {
        throw new BadRequest(error instanceof Error ? error.message : String(error));
      }
    }

    // T-123: dismiss is reversible; nothing is deleted here.
    if (pathname === "/api/hub/dismissed" && method === "GET") return h.json({ items: hub.dismissedList({ limit: Number(qs(url).limit) || 100 }) });
    if (pathname === "/api/hub/dismiss" && method === "POST") {
      const b = await readJson(request);
      need(b && Number.isSafeInteger(Number(b.id)), "id is required.");
      return h.json(hub.dismiss(b.type ?? "memory", Number(b.id), { actor: "ui", reason: b.reason ?? null }));
    }
    if (pathname === "/api/hub/restore" && method === "POST") {
      const b = await readJson(request);
      need(b && Number.isSafeInteger(Number(b.id)), "id is required.");
      return h.json(hub.restore(b.type ?? "memory", Number(b.id), { actor: "ui" }));
    }

    // ---- T-102/104: sync status, pairing and revoke for the Tools tab ----
    if (pathname === "/api/hub/sync/status" && method === "GET") {
      const store = getSyncStore();
      const account = store.ensureAccount();
      const status = store.status(account.id);
      const e2ee = store.e2eeStatus(account.id);
      return h.json({
        epoch: status.epoch,
        headSeq: status.headSeq,
        deviceCount: status.deviceCount,
        e2ee: { enabled: e2ee.enabled, currentKid: e2ee.currentKid },
        devices: status.devices.map((device) => ({
          ...device,
          pendingOps: Math.max(0, status.headSeq - device.lastAckSeq),
          lastSync: device.lastSeen ? new Date(device.lastSeen).toISOString() : null,
        })),
      });
    }
    if (pathname === "/api/hub/sync/pair" && method === "POST") {
      const store = getSyncStore();
      const account = store.ensureAccount();
      const code = store.createPairCode(account.id);
      hub.audit("ui", "sync.pair", { code: "created" });
      return h.json({ code, url: `http://127.0.0.1:${config.syncPort}` });
    }
    if (pathname === "/api/hub/sync/revoke" && method === "POST") {
      const b = await readJson(request);
      need(b && typeof b.device_id === "string", "device_id is required.");
      const store = getSyncStore();
      const account = store.ensureAccount();
      const revoked = store.revokeDevice(account.id, b.device_id);
      store.audit(account.id, { deviceId: b.device_id, action: "device.revoke", result: revoked ? "ok" : "missing" });
      hub.audit("ui", "sync.revoke", { deviceId: b.device_id, revoked });
      return h.json({ revoked });
    }

    // ---- T-107: the private remote MCP endpoint, managed from the Tools tab ----
    const mcpLinkView = (token) => ({
      id: token.id,
      scope: token.scope,
      name: token.name,
      projects: token.projects,
      revoked: !!token.revoked_at,
      lastUsedAt: token.last_used_at,
      createdAt: token.created_at,
    });
    const mcpLinkConfig = (token, { base }) => {
      const url = `${base.replace(/\/+$/, "")}/mcp`;
      return {
        url,
        claudeCode: `claude mcp add --transport http aletheia ${url} --header "Authorization: Bearer ${token}"`,
        claudeDesktop: JSON.stringify({ mcpServers: { aletheia: { type: "http", url, headers: { Authorization: `Bearer ${token}` } } } }, null, 2),
      };
    };
    if (pathname === "/api/hub/mcp-links" && method === "GET") {
      const store = getSyncStore();
      const account = store.ensureAccount();
      return h.json({ links: store.listTokens(account.id).filter((token) => ["mcp", "read", "sync", "admin"].includes(token.scope)).map(mcpLinkView) });
    }
    if (pathname === "/api/hub/mcp-links" && method === "POST") {
      const b = await readJson(request) ?? {};
      const store = getSyncStore();
      const account = store.ensureAccount();
      const projects = (Array.isArray(b.projects) ? b.projects : []).map(String).filter(Boolean);
      const scope = b.scope === "sync" || b.scope === "admin" ? b.scope : "mcp";
      const minted = store.mintToken(account.id, { scope, name: typeof b.name === "string" ? b.name : null, projects });
      const base = typeof b.url === "string" && b.url ? b.url : `http://127.0.0.1:${config.syncPort}`;
      hub.audit("ui", "mcp-link.create", { id: minted.id, scope, projects });
      return h.json({ id: minted.id, scope, projects, token: minted.token, ...mcpLinkConfig(minted.token, { base }) }, 201);
    }
    if (pathname === "/api/hub/mcp-links/revoke" && method === "POST") {
      const b = await readJson(request);
      need(b && Number.isSafeInteger(Number(b.id)), "id is required.");
      const store = getSyncStore();
      const account = store.ensureAccount();
      const revoked = store.revokeToken(account.id, Number(b.id));
      store.audit(account.id, { action: "token.revoke", result: revoked ? "ok" : "missing", detail: { id: Number(b.id) } });
      hub.audit("ui", "mcp-link.revoke", { id: Number(b.id), revoked });
      return h.json({ revoked });
    }
    return h.json({ error: "Not found." }, 404);
  }

  return { handle };
}
