// Remote mode (a non-loopback bind) turns on the Hub login. The API the tools use (/v1/*, /v1/live, /mcp) must not
// answer the network without a login session or the API key. Loopback mode is unchanged.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { SyncStore } from "../src/hub/sync/store.mjs";
import { removeDir } from "./temp-dirs.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-remote-auth-"));
const KEY = "remote-auth-test-key-0123456789";

const makeConfig = (tag, extra = {}) => loadConfig({
  port: 0,
  dataDir: join(temp, `data-${tag}`),
  hubDb: join(temp, `hub-${tag}.db`),
  syncDb: join(temp, `sync-${tag}.db`),
  syncPort: 0,
  provider: "none",
  ...extra,
});

function adminToken(cfg) {
  const store = new SyncStore(cfg.syncDb);
  const account = store.ensureAccount();
  const token = store.mintToken(account.id, { scope: "admin", name: "owner" }).token;
  store.close();
  return token;
}

// Browsers keep one cookie per Set-Cookie header and do not split a comma-joined one, so read them the same way.
const cookieHeader = (response) => response.headers.getSetCookie().map((part) => part.split(";")[0]).join("; ");
const csrfOf = (cookies) => decodeURIComponent((/aletheia_csrf=([^;]+)/.exec(cookies) ?? [])[1] ?? "");

async function loginCookies(base, token) {
  const response = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
  expect(response.status).toBe(200);
  return cookieHeader(response);
}

const mcpInit = (base, headers = {}) => fetch(`${base}/mcp`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }),
});

const servers = [];
const start = (tag, extra = {}, options = {}) => {
  const cfg = makeConfig(tag, extra);
  const token = adminToken(cfg);
  const app = startServer(cfg, options);
  servers.push(app);
  return { cfg, token, app, base: `http://127.0.0.1:${app.server.port}` };
};

let remoteNoKey;
let remoteKey;
let loopbackNoKey;

beforeAll(() => {
  remoteNoKey = start("remote-nokey", {}, { requireLogin: true });
  remoteKey = start("remote-key", { apiKey: KEY }, { requireLogin: true });
  loopbackNoKey = start("loopback-nokey");
});

afterAll(() => {
  for (const app of servers) app.stop();
  removeDir(temp, { recursive: true, force: true });
});

describe("remote mode without an API key", () => {
  test("/v1 routes refuse a request with no login session", async () => {
    for (const path of ["/v1/info", "/v1/work", "/v1/health", "/v1/search?q=pnpm"]) {
      const response = await fetch(`${remoteNoKey.base}${path}`);
      expect({ path, status: response.status }).toEqual({ path, status: 401 });
    }
    const post = await fetch(`${remoteNoKey.base}/v1/memories`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: "x", narrative: "y" }) });
    expect(post.status).toBe(401);
  });

  test("/v1/live refuses an upgrade with no login session", async () => {
    const response = await fetch(`${remoteNoKey.base}/v1/live`, { headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==" } });
    expect(response.status).toBe(401);
  });

  test("/mcp refuses a request with no login session and no key", async () => {
    const response = await mcpInit(remoteNoKey.base);
    expect(response.status).toBe(401);
  });

  test("a login session opens /v1 reads, and writes need the CSRF header too", async () => {
    const cookies = await loginCookies(remoteNoKey.base, remoteNoKey.token);
    const info = await fetch(`${remoteNoKey.base}/v1/info`, { headers: { Cookie: cookies } });
    expect(info.status).toBe(200);
    const body = JSON.stringify({ title: "remote note", narrative: "saved through a session" });
    const noCsrf = await fetch(`${remoteNoKey.base}/v1/memories`, { method: "POST", headers: { Cookie: cookies, "Content-Type": "application/json" }, body });
    expect(noCsrf.status).toBe(403);
    const withCsrf = await fetch(`${remoteNoKey.base}/v1/memories`, { method: "POST", headers: { Cookie: cookies, "Content-Type": "application/json", "X-CSRF-Token": csrfOf(cookies) }, body });
    expect(withCsrf.status).toBeLessThan(300);
  });

  test("health routes stay open and carry no memory text", async () => {
    for (const path of ["/healthz"]) {
      const response = await fetch(`${remoteNoKey.base}${path}`);
      expect([200, 503]).toContain(response.status);
      expect(await response.text()).not.toContain("saved through a session");
    }
  });
});

describe("login cookies", () => {
  test("login sends the session and CSRF cookies as two Set-Cookie headers", async () => {
    const response = await fetch(`${remoteNoKey.base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: remoteNoKey.token }) });
    const cookies = response.headers.getSetCookie();
    expect(cookies.length).toBe(2);
    expect(cookies.some((c) => c.startsWith("aletheia_session=") && c.includes("HttpOnly"))).toBe(true);
    expect(cookies.some((c) => c.startsWith("aletheia_csrf="))).toBe(true);
  });

  test("logout with the CSRF header ends the session", async () => {
    const cookies = await loginCookies(remoteNoKey.base, remoteNoKey.token);
    const out = await fetch(`${remoteNoKey.base}/api/logout`, { method: "POST", headers: { Cookie: cookies, "X-CSRF-Token": csrfOf(cookies) } });
    expect(out.status).toBe(200);
    expect(out.headers.getSetCookie().length).toBe(2);
    expect((await fetch(`${remoteNoKey.base}/v1/info`, { headers: { Cookie: cookies } })).status).toBe(401);
  });
});

describe("the remote live socket", () => {
  const open = (base, headers) => new Promise((resolve) => {
    const socket = new WebSocket(`${base.replace("http", "ws")}/v1/live`, { headers });
    socket.onopen = () => { socket.close(); resolve("open"); };
    socket.onerror = () => resolve("refused");
    setTimeout(() => resolve("timeout"), 3000);
  });

  test("opens with a session from a page on the same host, and refuses another origin", async () => {
    const cookies = await loginCookies(remoteNoKey.base, remoteNoKey.token);
    const host = new URL(remoteNoKey.base).host;
    expect(await open(remoteNoKey.base, { Cookie: cookies, Origin: `http://${host}` })).toBe("open");
    expect(await open(remoteNoKey.base, { Cookie: cookies, Origin: "https://evil.example" })).toBe("refused");
    expect(await open(remoteNoKey.base, { Origin: `http://${host}` })).toBe("refused");
  });

  test("opens for a dashboard served under a non-loopback host name", async () => {
    const cookies = await loginCookies(remoteNoKey.base, remoteNoKey.token);
    expect(await open(remoteNoKey.base, { Cookie: cookies, Host: "memory.example.com", Origin: "https://memory.example.com" })).toBe("open");
    expect(await open(remoteNoKey.base, { Cookie: cookies, Host: "memory.example.com", Origin: "https://other.example.com" })).toBe("refused");
  });
});

describe("the remote login page", () => {
  test("its Content-Security-Policy lets the page call its own /api/login", async () => {
    const page = await fetch(`${remoteNoKey.base}/`);
    expect(page.status).toBe(401);
    const csp = page.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("connect-src 'self'");
    expect(csp).toContain("default-src 'none'");
    expect(await page.text()).toContain("/api/login");
  });
});

describe("remote mode with an API key", () => {
  test("a tool with only the bearer key can use /v1 and /mcp", async () => {
    const info = await fetch(`${remoteKey.base}/v1/info`, { headers: { Authorization: `Bearer ${KEY}` } });
    expect(info.status).toBe(200);
    const mcp = await mcpInit(remoteKey.base, { Authorization: `Bearer ${KEY}` });
    expect(mcp.status).toBe(200);
  });

  test("no key and no session is refused on /v1 and /mcp", async () => {
    expect((await fetch(`${remoteKey.base}/v1/info`)).status).toBe(401);
    expect((await mcpInit(remoteKey.base)).status).toBe(401);
  });

  test("a wrong key is refused", async () => {
    expect((await fetch(`${remoteKey.base}/v1/info`, { headers: { Authorization: "Bearer nope" } })).status).toBe(401);
  });
});

describe("loopback mode is unchanged", () => {
  test("loopback without a key answers /v1 and /mcp with no login", async () => {
    expect((await fetch(`${loopbackNoKey.base}/v1/info`)).status).toBe(200);
    expect((await mcpInit(loopbackNoKey.base)).status).toBe(200);
  });

  test("loopback without a key refuses /mcp through a proxy, like /v1", async () => {
    const proxied = { Host: "memory.example.com", "X-Forwarded-For": "203.0.113.9" };
    expect((await fetch(`${loopbackNoKey.base}/v1/info`, { headers: proxied })).status).toBe(403);
    expect((await mcpInit(loopbackNoKey.base, proxied)).status).toBe(403);
  });
});
