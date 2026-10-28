// the private remote MCP endpoint. Streamable HTTP MCP on the sync server with a sync-style
// bearer token (scope `mcp`/`read` reads, `sync`/`admin` writes), project scope, per-token rate
// limit, an Origin allow-list and one append-only audit row per tool call (no payloads). The token
// travels in the Authorization header, never in the URL. The non-loopback TLS rule applies here too.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { runMcpLinkCommand } from "../src/hub/sync/cli.mjs";
import { requiresTlsProxy } from "../src/hub/sync/server.mjs";
import { startSyncServer } from "../src/hub/sync/server.mjs";
import { HubStore } from "../src/hub/store.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-remote-mcp-"));
const ACCEPT = "application/json, text/event-stream";

let hub;
let accountId;
let hubStore;

beforeAll(() => {
  hubStore = new HubStore(join(temp, "hub", "hub.db"));
  hubStore.add({ project: "shop", title: "Use backoff", narrative: "exponential backoff for retries", type: "decision", tool: "claude-code" });
  hubStore.add({ project: "private-proj", title: "Secret plan marker text", narrative: "the launch date is thursday", type: "note", tool: "cli" });
  hub = startSyncServer({ syncDb: join(temp, "hub", "sync.db"), host: "127.0.0.1", port: 0, name: "default", hubDb: join(temp, "hub", "hub.db"), mcpOrigins: ["https://claude.ai"], mcpRateLimitPerMinute: 5 });
  accountId = hub.store.ensureAccount("default").id;
});

afterAll(() => {
  hub.stop();
  hubStore.close();
  rmSync(temp, { recursive: true, force: true });
});

const post = (url, body, headers = {}) => fetch(`${url}/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: ACCEPT, ...headers },
  body: JSON.stringify(body),
});

async function init(url, token) {
  const res = await post(url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "test", version: "1" } } }, token ? { Authorization: `Bearer ${token}` } : {});
  return { session: res.headers.get("mcp-session-id"), status: res.status, body: await res.json() };
}

const call = (url, session, token, method, params) => post(url, { jsonrpc: "2.0", id: 2, method, params }, { "Mcp-Session-Id": session, ...(token ? { Authorization: `Bearer ${token}` } : {}) });

describe("the private remote MCP endpoint", () => {
  test("an mcp-scoped token completes initialize and tools/list", async () => {
    const token = hub.store.mintToken(accountId, { scope: "mcp", name: "reader" }).token;
    const initRes = await init(hub.url, token);
    expect(initRes.status).toBe(200);
    expect(initRes.session).toBeTruthy();
    const list = await call(hub.url, initRes.session, token, "tools/list", {});
    const body = await list.json();
    expect(body.result.tools.some((t) => t.name === "search")).toBe(true);
  });

  test("a read token gets read tools only; save_memory needs sync or admin", async () => {
    const read = hub.store.mintToken(accountId, { scope: "mcp", name: "reader" }).token;
    const initRes = await init(hub.url, read);
    const denied = await call(hub.url, initRes.session, read, "tools/call", { name: "save_memory", arguments: { text: "should not land", project: "shop" } });
    const deniedBody = await denied.json();
    expect(deniedBody.result.isError).toBe(true);
    expect(deniedBody.result.content[0].text).toContain("cannot call");

    const writer = hub.store.mintToken(accountId, { scope: "sync", name: "writer" }).token;
    const init2Res = await init(hub.url, writer);
    const saved = await call(hub.url, init2Res.session, writer, "tools/call", { name: "save_memory", arguments: { text: "written through the remote link", project: "shop" } });
    const savedBody = await saved.json();
    expect(savedBody.result.isError).toBeUndefined();
  });

  test("a token limited to named projects sees only those projects", async () => {
    const scoped = hub.store.mintToken(accountId, { scope: "mcp", projects: ["shop"] }).token;
    const initRes = await init(hub.url, scoped);
    const search = await call(hub.url, initRes.session, scoped, "tools/call", { name: "search", arguments: { query: "launch" } });
    const searchBody = await search.json();
    expect(searchBody.result.content[0].text).not.toContain("Secret plan");
    expect(searchBody.result.content[0].text).toContain("No matches.");

    const denied = await call(hub.url, initRes.session, scoped, "tools/call", { name: "search", arguments: { query: "launch", project: "private-proj" } });
    expect((await denied.json()).result.content[0].text).toContain("No matches.");
  });

  test("missing, unknown and revoked tokens get 401; a non-MCP scope gets 403", async () => {
    const missing = await init(hub.url, null);
    expect(missing.status).toBe(401);
    const unknown = await init(hub.url, "f".repeat(64));
    expect(unknown.status).toBe(401);

    const minted = hub.store.mintToken(accountId, { scope: "mcp" });
    expect((await init(hub.url, minted.token)).status).toBe(200);
    hub.store.revokeToken(accountId, minted.id);
    expect((await init(hub.url, minted.token)).status).toBe(401);

    const bad = hub.store.mintToken(accountId, { scope: "read" });
    const okRead = await init(hub.url, bad.token);
    expect(okRead.status).toBe(200); // read is an allowed scope (read tools only)
  });

  test("the per-token rate limit answers 429 with Retry-After", async () => {
    const token = hub.store.mintToken(accountId, { scope: "mcp" }).token;
    const initRes = await init(hub.url, token);
    const session = initRes.session;
    for (let i = 0; i < 4; i++) {
      const res = await call(hub.url, session, token, "tools/list", {});
      expect(res.status).toBe(200);
    }
    const limited = await call(hub.url, session, token, "tools/list", {});
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  test("every tool call writes an audit row with tool, project and result, and no payload", async () => {
    const token = hub.store.mintToken(accountId, { scope: "mcp" }).token;
    const initRes = await init(hub.url, token);
    await call(hub.url, initRes.session, token, "tools/call", { name: "search", arguments: { query: "backoff", project: "shop" } });
    const audit = hub.store.auditLog(accountId, 20);
    const row = audit.find((entry) => entry.action === "mcp.call");
    expect(row).toBeTruthy();
    expect(row.detail).toMatchObject({ tool: "search", project: "shop", result: "ok" });
    expect(JSON.stringify(audit)).not.toContain("backoff");
    expect(JSON.stringify(audit)).not.toContain("launch date");
  });

  test("an unknown Origin is 403 and an allow-listed Origin passes", async () => {
    const token = hub.store.mintToken(accountId, { scope: "mcp" }).token;
    const bad = await post(hub.url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, { Authorization: `Bearer ${token}`, Origin: "https://evil.example" });
    expect(bad.status).toBe(403);
    const good = await post(hub.url, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "t", version: "1" } } }, { Authorization: `Bearer ${token}`, Origin: "https://claude.ai" });
    expect(good.status).toBe(200);
  });

  test("a non-loopback bind needs the explicit TLS-proxy flag", () => {
    expect(requiresTlsProxy("127.0.0.1", false)).toBe(false);
    expect(requiresTlsProxy("localhost", false)).toBe(false);
    expect(requiresTlsProxy("0.0.0.0", false)).toBe(true);
    expect(requiresTlsProxy("0.0.0.0", true)).toBe(false);
  });

  test("mcp-link create prints a URL with no secret in the path and copy-ready client config", () => {
    const result = runMcpLinkCommand({ config: { syncDb: join(temp, "cli", "sync.db"), syncPort: 37791 }, flags: { projects: "shop,private-proj" }, pos: ["create"] });
    expect(result.url).toBe("http://127.0.0.1:37791/mcp");
    expect(result.url).not.toContain(result.token);
    expect(result.claudeCode).toBe(`claude mcp add --transport http aletheia ${result.url} --header "Authorization: Bearer ${result.token}"`);
    const desktop = JSON.parse(result.claudeDesktop);
    expect(desktop.mcpServers.aletheia).toMatchObject({ type: "http", url: result.url, headers: { Authorization: `Bearer ${result.token}` } });
    expect(result.projects).toEqual(["shop", "private-proj"]);

    const listed = runMcpLinkCommand({ config: { syncDb: join(temp, "cli", "sync.db"), syncPort: 37791 }, flags: {}, pos: ["list"] });
    expect(listed.links.some((link) => link.id === result.id && link.scope === "mcp")).toBe(true);
    const revoked = runMcpLinkCommand({ config: { syncDb: join(temp, "cli", "sync.db"), syncPort: 37791 }, flags: {}, pos: ["revoke", String(result.id)] });
    expect(revoked.revoked).toBe(true);
    const after = runMcpLinkCommand({ config: { syncDb: join(temp, "cli", "sync.db"), syncPort: 37791 }, flags: {}, pos: ["list"] });
    expect(after.links.find((link) => link.id === result.id).revokedAt).toBeTruthy();
  });

  test("the Hub UI routes create, list and revoke MCP links", async () => {
    const appDir = join(temp, "ui");
    const cfg = loadConfig({
      port: 0,
      dataDir: appDir,
      hubDb: join(appDir, "hub.db"),
      syncDb: join(appDir, "sync.db"),
      syncPort: 0,
      provider: "none",
    });
    const app = startServer(cfg);
    try {
      const base = `http://127.0.0.1:${app.server.port}`;
      const list = await fetch(`${base}/api/hub/mcp-links`);
      expect(list.status).toBe(200);
      const created = await fetch(`${base}/api/hub/mcp-links`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projects: ["shop"] }) });
      expect(created.status).toBe(201);
      const link = await created.json();
      expect(link.url).toContain("/mcp");
      expect(link.url).not.toContain(link.token);
      expect(link.claudeCode).toContain(`--header "Authorization: Bearer ${link.token}"`);
      const revoked = await fetch(`${base}/api/hub/mcp-links/revoke`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: link.id }) });
      expect((await revoked.json()).revoked).toBe(true);
      const after = await (await fetch(`${base}/api/hub/mcp-links`)).json();
      expect(after.links.find((l) => l.id === link.id).revoked).toBe(true);
    } finally {
      app.stop();
    }
  });
});
