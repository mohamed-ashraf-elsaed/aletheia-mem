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
import { parseRulesFromText, syncTool, targetPath } from "./rules-sync.mjs";
import { TOOLS, applyMcp, detectTools, mcpCommand, mcpPlan, toolById } from "./tools.mjs";

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

export function createHubRoutes({ hub, config }) {
  const mcpScript = join(import.meta.dir, "..", "..", "bin", "mcp.mjs");
  const argv = () => mcpCommand({ bun: process.execPath, script: mcpScript });
  const qs = (url) => Object.fromEntries(url.searchParams);

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
      const rel = pathname === "/hub" || pathname === "/hub/" ? "index.html" : decodeURIComponent(pathname.slice(5));
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

    // ================= /v1: the universal API (what any tool, script or MCP bridge calls) =================
    if (isV1) {
      if (pathname === "/v1/info" && method === "GET") return h.json({ name: "aletheia-mem", version: "0.1.0", api: "v1", stats: hub.stats() });
      if (pathname === "/v1/memories" && method === "POST") {
        const r = hub.add(memoryInput(await readJson(request), tool), { actor: tool ?? "api" });
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
    return h.json({ error: "Not found." }, 404);
  }

  return { handle };
}
