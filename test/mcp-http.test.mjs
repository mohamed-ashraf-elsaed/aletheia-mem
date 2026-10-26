// T-067: MCP Streamable HTTP transport (spec 2025-03-26). One endpoint, POST for JSON-RPC with Accept
// handling, GET answered with 405 because this server sends no server-initiated stream, Mcp-Session-Id
// sessions, an Origin allow-list that defaults to loopback, a body cap, a request timeout and JSON-RPC
// batch handling. Tests speak raw fetch; no MCP SDK dependency is allowed.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { createMcpHttpHandler } from "../src/hub/mcp-http.mjs";
import { HubStore } from "../src/hub/store.mjs";

const start = (options = {}) => {
  const store = new HubStore(":memory:");
  store.add({ project: "shop", title: "Use backoff", narrative: "exponential backoff for retries", type: "decision", tool: "claude-code" });
  const handle = createMcpHttpHandler({ store, ...options });
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: async (request) => (await handle(request)) ?? new Response("not found", { status: 404 }) });
  return { server, store, url: `http://127.0.0.1:${server.port}`, stop: () => server.stop(true) };
};

const ACCEPT = "application/json, text/event-stream";

describe("T-067: MCP Streamable HTTP transport", () => {
  let app;
  beforeAll(() => {
    app = start();
  });
  afterAll(() => app.stop());

  const post = (body, headers = {}) => fetch(`${app.url}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: ACCEPT, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

  test("initialize returns a session id and tools/list answers with it", async () => {
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    expect(init.status).toBe(200);
    expect(init.headers.get("content-type")).toContain("application/json");
    const session = init.headers.get("mcp-session-id");
    expect(session).toBeTruthy();
    expect(session).toMatch(/^[\x21-\x7e]+$/); // visible ASCII only, per the spec
    const initBody = await init.json();
    expect(initBody.result.protocolVersion).toBe("2025-03-26");
    expect(initBody.result.serverInfo.name).toBe("aletheia");

    const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, { "Mcp-Session-Id": session });
    expect(list.status).toBe(200);
    const { result } = await list.json();
    expect(result.tools.some((t) => t.name === "search")).toBe(true);
    expect(result.tools.some((t) => t.name === "save_memory")).toBe(true);
  });

  test("a wrong Origin is rejected with 403", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { Origin: "https://evil.example" });
    expect(res.status).toBe(403);
  });

  test("a loopback Origin is accepted", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } }, { Origin: "http://127.0.0.1:8080" });
    expect(res.status).toBe(200);
  });

  test("GET answers 405 because no server-initiated stream is offered", async () => {
    const res = await fetch(`${app.url}/mcp`, { headers: { Accept: "text/event-stream" } });
    expect(res.status).toBe(405);
  });

  test("a non-init request without a session id is 400 and an unknown id is 404", async () => {
    const missing = await post({ jsonrpc: "2.0", id: 1, method: "ping" });
    expect(missing.status).toBe(400);
    const unknown = await post({ jsonrpc: "2.0", id: 1, method: "ping" }, { "Mcp-Session-Id": "not-a-session" });
    expect(unknown.status).toBe(404);
  });

  test("DELETE terminates a session and later requests get 404", async () => {
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    const session = init.headers.get("mcp-session-id");
    const del = await fetch(`${app.url}/mcp`, { method: "DELETE", headers: { "Mcp-Session-Id": session } });
    expect(del.status).toBe(200);
    const after = await post({ jsonrpc: "2.0", id: 2, method: "ping" }, { "Mcp-Session-Id": session });
    expect(after.status).toBe(404);
  });

  test("a batch is answered as an array and notifications get no response", async () => {
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    const session = init.headers.get("mcp-session-id");
    const batch = await post([{ jsonrpc: "2.0", id: 2, method: "ping" }, { jsonrpc: "2.0", method: "notifications/initialized" }], { "Mcp-Session-Id": session });
    expect(batch.status).toBe(200);
    const body = await batch.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0].result).toEqual({});
  });

  test("a notification-only POST is answered 202 with no body", async () => {
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    const session = init.headers.get("mcp-session-id");
    const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, { "Mcp-Session-Id": session });
    expect(res.status).toBe(202);
    expect(await res.text()).toBe("");
  });

  test("a body over the cap is refused with 413", async () => {
    const small = start({ maxBody: 100 });
    try {
      const res = await fetch(`${small.url}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: ACCEPT },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(500) } }),
      });
      expect(res.status).toBe(413);
    } finally {
      small.stop();
    }
  });

  test("tools/call saves and searches through the HTTP transport", async () => {
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } });
    const session = init.headers.get("mcp-session-id");
    const saved = await post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "save_memory", arguments: { text: "always use timingSafeEqual for token checks", project: "shop" } } }, { "Mcp-Session-Id": session });
    const savedBody = await saved.json();
    expect(savedBody.result.isError).toBeUndefined();
    const search = await post({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "search", arguments: { query: "timingSafeEqual" } } }, { "Mcp-Session-Id": session });
    const searchBody = await search.json();
    expect(searchBody.result.content[0].text).toContain("timingSafeEqual");
  });

  test("a missing bearer key is rejected when a key is configured", async () => {
    const locked = start({
      authorize: async (request) => {
        const header = request.headers.get("authorization") ?? "";
        const match = /^Bearer\s+(.+)$/i.exec(header);
        if (!match || match[1] !== "test-key-123") return { status: 401, error: "A valid bearer key is required." };
        return { token: { scope: "local" }, projects: null };
      },
    });
    try {
      const denied = await fetch(`${locked.url}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: ACCEPT },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
      });
      expect(denied.status).toBe(401);
      const allowed = await fetch(`${locked.url}/mcp`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: ACCEPT, Authorization: "Bearer test-key-123" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } }),
      });
      expect(allowed.status).toBe(200);
    } finally {
      locked.stop();
    }
  });

  test("an unparsable body is a 400 JSON-RPC parse error", async () => {
    const res = await fetch(`${app.url}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: ACCEPT }, body: "{not json" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe(-32700);
  });

  test("a request whose body never finishes gets 408 after the timeout", async () => {
    const slow = start({ timeoutMs: 250 });
    const chunks = [];
    try {
      const socket = await Bun.connect({
        hostname: "127.0.0.1",
        port: slow.server.port,
        socket: {
          data(_s, data) { chunks.push(data.toString()); },
          open(s) { s.write("POST /mcp HTTP/1.1\r\nHost: 127.0.0.1\r\nContent-Type: application/json\r\nContent-Length: 1000\r\nAccept: application/json, text/event-stream\r\n\r\n{\"jsonrpc\":"); },
          close() {},
          error() {},
        },
      });
      await Bun.sleep(500);
      socket.end();
    } finally {
      slow.stop();
    }
    expect(chunks.join("")).toContain("408");
  });
});
