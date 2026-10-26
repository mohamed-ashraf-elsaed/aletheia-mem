// MCP Streamable HTTP transport (spec 2025-03-26). One endpoint: POST carries JSON-RPC messages with
// `Accept: application/json, text/event-stream`, the answer is JSON (this server never opens an SSE
// stream, so GET answers 405); sessions ride the `Mcp-Session-Id` header; the Origin header is validated
// against an allow-list (loopback by default) to stop DNS rebinding; bodies are capped; a stalled body
// gets a timeout. Tool execution reuses the stdio handlers in mcp.mjs.
import { randomUUID } from "node:crypto";
import { handleMessage } from "./mcp.mjs";

const WRITE_TOOLS = new Set(["save_memory", "add_rule", "dismiss_memory", "restore_memory"]);

/** The default allow-list: no Origin header (non-browser clients) or an http loopback origin. */
export function loopbackOriginsOnly(origin) {
  if (origin == null || origin === "") return true;
  let url;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== "http:") return false;
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

const json = (body, status = 200, headers = {}) =>
  new Response(body === null || body === "" ? null : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });

/**
 * Build the MCP endpoint handler. Options:
 * - store: the HubStore the tools read and write.
 * - path: the endpoint path; other paths return null so the caller's own routing answers.
 * - authorize(request): returns { token, projects } or { status, error }. Omit for no auth.
 * - toolAllowed(token, name): false denies one tool (used for scope-limited tokens).
 * - allowedOrigins(origin): origin allow-list; defaults to loopback only.
 * - onCall({ token, tool, project, ok }): per tools/call audit hook. No payloads pass through it.
 * - rateLimit({ request, token, projects }): return { status, error, retryAfter } to refuse, or null.
 * - sessionTtlMs, maxBody, timeoutMs.
 */
export function createMcpHttpHandler({
  store,
  path = "/mcp",
  authorize = null,
  toolAllowed = null,
  allowedOrigins = loopbackOriginsOnly,
  onCall = null,
  rateLimit = null,
  sessionTtlMs = 24 * 60 * 60 * 1000,
  maxBody = 1024 * 1024,
  timeoutMs = 30_000,
} = {}) {
  const sessions = new Map(); // session id -> { ctx, expiresAt }

  const sweep = () => {
    const now = Date.now();
    for (const [id, session] of sessions) if (session.expiresAt < now) sessions.delete(id);
  };

  const isInitialize = (msg) => !!msg && typeof msg === "object" && msg.method === "initialize";

  function processOne(msg, ctx) {
    if (msg?.method === "tools/call" && msg.id !== undefined) {
      const name = msg.params?.name ?? null;
      if (name && toolAllowed && !toolAllowed(ctx.token ?? null, name)) {
        return { jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: `This token cannot call ${name}.` }], isError: true } };
      }
      const response = handleMessage(msg, ctx);
      if (onCall) {
        onCall({ token: ctx.token ?? null, tool: name, project: msg.params?.arguments?.project ?? null, ok: !response?.error && !response?.result?.isError });
      }
      return response;
    }
    return handleMessage(msg, ctx);
  }

  return async function handle(request) {
    const url = new URL(request.url);
    if (url.pathname !== path) return null;
    sweep();

    // The spec makes Origin validation mandatory on every connection (DNS rebinding).
    const origin = request.headers.get("origin");
    if (!allowedOrigins(origin)) return json({ error: "This origin is not allowed." }, 403);

    if (request.method === "GET") {
      // No server-initiated messages, so no SSE stream: the spec allows 405 here.
      return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, DELETE", "Content-Type": "text/plain; charset=utf-8" } });
    }

    if (request.method === "DELETE") {
      const id = request.headers.get("mcp-session-id");
      if (!id) return json({ error: "Mcp-Session-Id is required." }, 400);
      return sessions.delete(id) ? new Response("{}", { status: 200, headers: { "Content-Type": "application/json; charset=utf-8" } }) : json({ error: "Session not found." }, 404);
    }

    if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, DELETE", "Content-Type": "text/plain; charset=utf-8" } });

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > maxBody) return json({ error: "Body too large." }, 413);

    let raw;
    const read = request.text().then((text) => ({ text }));
    const timedOut = new Promise((resolve) => setTimeout(() => resolve({ timedOut: true }), timeoutMs));
    const body = await Promise.race([read, timedOut]);
    if (body.timedOut) return json({ error: "Request timed out." }, 408);
    raw = body.text;
    if (Buffer.byteLength(raw) > maxBody) return json({ error: "Body too large." }, 413);

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
    }

    const auth = await (authorize ? authorize(request) : null);
    if (auth && auth.status) return json({ error: auth.error ?? "Unauthorized." }, auth.status);
    const token = auth?.token ?? null;
    const projects = auth?.projects ?? null;

    if (rateLimit) {
      const limit = await rateLimit({ request, token, projects });
      if (limit) return json({ error: limit.error ?? "Too many requests." }, limit.status ?? 429, limit.retryAfter ? { "Retry-After": String(limit.retryAfter) } : {});
    }

    const messages = Array.isArray(parsed) ? parsed : [parsed];
    if (!messages.length || messages.some((msg) => !msg || typeof msg !== "object")) {
      return json({ jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } }, 400);
    }

    // Session management: initialize assigns a session id; every other message needs a valid one.
    const hasInit = messages.some(isInitialize);
    let ctx;
    if (hasInit) {
      ctx = { store, tool: null, cwd: null, token, projects };
    } else {
      const id = request.headers.get("mcp-session-id");
      if (!id) return json({ error: "Mcp-Session-Id is required before initialization." }, 400);
      const session = sessions.get(id);
      if (!session) return json({ error: "Session not found." }, 404);
      ctx = { ...session.ctx, token, projects };
    }

    const responses = messages.map((msg) => processOne(msg, ctx)).filter((response) => response !== null && response !== undefined);

    if (!responses.length) {
      // Only notifications: 202 Accepted with no body (the spec's case for input without requests).
      return new Response(null, { status: 202 });
    }

    const headers = {};
    if (hasInit) {
      const id = randomUUID();
      sessions.set(id, { ctx, expiresAt: Date.now() + sessionTtlMs });
      headers["Mcp-Session-Id"] = id;
    }

    const bodyOut = Array.isArray(parsed) ? responses : (responses[0] ?? null);
    return json(bodyOut, 200, headers);
  };
}

export { WRITE_TOOLS };
