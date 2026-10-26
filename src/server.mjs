// HTTP server: static SPA, the /api/work-view* routes, /api/work-state, and /api/setup/*.
// Same contract as the original worker; see docs/03-http-api.md.
import { existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { HttpError, WorkViewService } from "./app.mjs";
import { isCrossOrigin, isLocalRequest, isSameOriginJson } from "./http/guards.mjs";
import { ValidationError, validateMarkFinished, validateReview, validateRuleAction, validateWorkStateWrite } from "./http/validate.mjs";
import { EVIDENCE_KINDS } from "./readmodel/evidence.mjs";
import { MIME_TYPES } from "./readmodel/work-product.mjs";
import { BadRequest, createHubRoutes } from "./hub/routes.mjs";
import { startBackgroundWorker } from "./hub/queue.mjs";
import { HubStore } from "./hub/store.mjs";
import { makeProvider } from "./refresh/providers.mjs";

const STATIC_TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml",
  ".webp": "image/webp", ".png": "image/png", ".ttf": "font/ttf", ".woff2": "font/woff2", ".json": "application/json", ".map": "application/json",
};
const BASE_HEADERS = { "Content-Security-Policy": "frame-ancestors 'none'", "X-Frame-Options": "DENY" };

const json = (body, status = 200, extra = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...BASE_HEADERS, ...extra } });
const text = (body, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
const notFoundRoute = (method, path) =>
  new Response(`<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>Error</title>\n</head>\n<body>\n<pre>Cannot ${method} ${path}</pre>\n</body>\n</html>\n`, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'", "X-Frame-Options": "DENY", "X-Content-Type-Options": "nosniff" },
  });

/** Create the service and the Bun server. Returns {server, service, stop}. */
export function startServer(config, { autoRefresh = null } = {}) {
  const service = new WorkViewService(config, { autoRefresh });
  const hub = new HubStore(config.hubDb);
  // The extraction worker is a background task of the server, not part of any hook. A misconfigured provider
  // must not stop the server from booting: extraction falls back to the rule extractor and doctor reports it.
  let ask = null;
  try {
    ask = makeProvider(config);
  } catch {
    ask = null;
  }
  const worker = config.extractionWorker ? startBackgroundWorker({ store: hub, ask, config }) : null;
  const hubRoutes = createHubRoutes({ hub, config });
  const html = new Map();
  const indexHtml = () => {
    const path = join(config.publicDir, "index.html");
    if (!html.has(path)) html.set(path, readFileSync(path));
    return html.get(path);
  };

  function guarded(request, server, { post = false } = {}) {
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

    // ---- static
    if (method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      return new Response(indexHtml(), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...BASE_HEADERS } });
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
  });
  return {
    server,
    service,
    hub,
    stop() {
      worker?.stop();
      server.stop(true);
      service.close();
      hub.close();
    },
  };
}
