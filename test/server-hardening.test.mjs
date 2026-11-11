// T-265: the low findings of the 2026-11-11 review of remote mode. One group per item.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { createConnection } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { createLoginGuard } from "../src/hub/login.mjs";
import { SyncStore } from "../src/hub/sync/store.mjs";
import { removeDir } from "./temp-dirs.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-hardening-"));
const KEY = "hardening-test-key-0123456789-abcdef";

const makeConfig = (tag, extra = {}) => loadConfig({
  port: 0,
  dataDir: join(temp, `data-${tag}`),
  hubDb: join(temp, `hub-${tag}.db`),
  syncDb: join(temp, `sync-${tag}.db`),
  syncPort: 0,
  provider: "none",
  ...extra,
});

const servers = [];
const start = (tag, extra = {}, options = {}) => {
  const cfg = makeConfig(tag, extra);
  const store = new SyncStore(cfg.syncDb);
  const token = store.mintToken(store.ensureAccount().id, { scope: "admin", name: "owner" }).token;
  store.close();
  const app = startServer(cfg, options);
  servers.push(app);
  return { cfg, token, app, base: `http://127.0.0.1:${app.server.port}`, port: app.server.port };
};

const cookieHeader = (response) => response.headers.getSetCookie().map((part) => part.split(";")[0]).join("; ");
const cookieValueOf = (cookies, name) => decodeURIComponent((new RegExp(`(?:^|; )${name}=([^;]+)`).exec(cookies) ?? [])[1] ?? "");
const login = async (base, token) => {
  const response = await fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
  expect(response.status).toBe(200);
  return response;
};
const loginCookies = async (base, token) => cookieHeader(await login(base, token));

/** A raw HTTP/1.1 request, so a header such as `Host: x/v1/` reaches the server as written. Returns the status code. */
const raw = (port, headerLines, path = "/api/work-view") => new Promise((resolve, reject) => {
  const socket = createConnection({ host: "127.0.0.1", port });
  let data = "";
  socket.on("connect", () => socket.write(`GET ${path} HTTP/1.1\r\n${headerLines.join("\r\n")}\r\nConnection: close\r\n\r\n`));
  socket.on("data", (chunk) => { data += chunk.toString(); });
  socket.on("end", () => resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0)));
  socket.on("error", reject);
  setTimeout(() => { socket.destroy(); resolve(Number(/^HTTP\/1\.1 (\d{3})/.exec(data)?.[1] ?? 0)); }, 3000);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
/** True when the body stream ends (done) within `ms`. */
const streamEnds = async (reader, ms) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const step = await Promise.race([reader.read().then((r) => r.done ? "done" : "chunk").catch(() => "done"), sleep(deadline - Date.now()).then(() => "timeout")]);
    if (step === "done") return true;
    if (step === "timeout") return false;
  }
  return false;
};

let loopback;
let remote;

beforeAll(() => {
  loopback = start("loopback");
  remote = start("remote", {}, { requireLogin: true });
});
afterAll(() => {
  for (const app of servers) app.stop();
  removeDir(temp, { recursive: true, force: true });
});

describe("item 1: Host header", () => {
  test.each(["x/v1/", "a#", "a?b", "user@host", "a\\b"])("Host %p is refused with 400", async (host) => {
    expect(await raw(loopback.port, [`Host: ${host}`])).toBe(400);
    expect(await raw(remote.port, [`Host: ${host}`])).toBe(400);
  });
  test("a normal Host still works", async () => {
    expect(await raw(loopback.port, [`Host: 127.0.0.1:${loopback.port}`], "/health")).toBe(200);
  });
});

describe("item 2: malformed percent sequences", () => {
  test("a bad cookie value is no session: 401, not 500", async () => {
    const response = await fetch(`${remote.base}/api/work-view`, { headers: { Cookie: "aletheia_session=%zz" } });
    expect(response.status).toBe(401);
    const mixed = await fetch(`${remote.base}/api/work-view`, { headers: { Cookie: "aletheia_session=%E0%A4%A; aletheia_csrf=%" } });
    expect(mixed.status).toBe(401);
  });
  test("a bad percent sequence in a static file path is 404", async () => {
    for (const path of ["/work-view/%zz", "/work-view/%E0%A4%A", "/x%.svg"]) {
      const response = await fetch(`${loopback.base}${path}`);
      expect(response.status).toBe(404);
    }
  });
  test("a bad percent sequence in a hub UI file path is 404", async () => {
    const response = await fetch(`${loopback.base}/hub/%zz`);
    expect(response.status).toBe(404);
  });
});

describe("item 3: /healthz caches the integrity check", () => {
  test("two calls within 30 s run one PRAGMA quick_check", async () => {
    const app = start("health");
    const db = app.app.hub.db;
    const original = db.prepare.bind(db);
    let checks = 0;
    db.prepare = (sql, ...rest) => {
      if (/quick_check/i.test(String(sql))) checks += 1;
      return original(sql, ...rest);
    };
    try {
      expect((await fetch(`${app.base}/healthz`)).status).toBe(200);
      expect((await fetch(`${app.base}/healthz`)).status).toBe(200);
      expect(checks).toBe(1);
    } finally {
      db.prepare = original;
    }
  });
});

describe("item 4: CSRF token is tied to the session", () => {
  test("a forged csrf cookie plus matching header is refused; the session's own token works", async () => {
    const cookies = await loginCookies(remote.base, remote.token);
    const sessionOnly = cookies.split("; ").filter((part) => part.startsWith("aletheia_session=")).join("; ");
    const forged = await fetch(`${remote.base}/api/logout`, { method: "POST", headers: { Cookie: `${sessionOnly}; aletheia_csrf=forged`, "X-CSRF-Token": "forged" } });
    expect(forged.status).toBe(403);
    const real = await fetch(`${remote.base}/api/logout`, { method: "POST", headers: { Cookie: cookies, "X-CSRF-Token": cookieValueOf(cookies, "aletheia_csrf") } });
    expect(real.status).toBe(200);
  });
  test("another session's csrf token does not work", async () => {
    const a = await loginCookies(remote.base, remote.token);
    const b = await loginCookies(remote.base, remote.token);
    const sessionA = a.split("; ").find((part) => part.startsWith("aletheia_session="));
    const csrfB = cookieValueOf(b, "aletheia_csrf");
    const response = await fetch(`${remote.base}/api/logout`, { method: "POST", headers: { Cookie: `${sessionA}; aletheia_csrf=${csrfB}`, "X-CSRF-Token": csrfB } });
    expect(response.status).toBe(403);
  });
  test("behind TLS the csrf cookie uses the __Host- prefix and Secure", async () => {
    const tls = start("tls", {}, { requireLogin: true, behindTls: true });
    const response = await login(tls.base, tls.token);
    const csrf = response.headers.getSetCookie().find((part) => part.includes("aletheia_csrf="));
    expect(csrf.startsWith("__Host-aletheia_csrf=")).toBe(true);
    expect(csrf).toContain("; Secure");
    expect(csrf).toContain("Path=/");
    expect(csrf).not.toContain("Domain");
    const cookies = cookieHeader(response);
    const out = await fetch(`${tls.base}/api/logout`, { method: "POST", headers: { Cookie: cookies, "X-CSRF-Token": cookieValueOf(cookies, "__Host-aletheia_csrf") } });
    expect(out.status).toBe(200);
  });
  test("the dashboard reads either cookie name", async () => {
    const source = await Bun.file(new URL("../public/ui-dom.js", import.meta.url)).text();
    expect(source).toContain("__Host-aletheia_csrf");
    expect(source).toContain("aletheia_csrf");
  });
});

describe("item 5: API key length and 401 throttle", () => {
  test("remote mode refuses a key shorter than 32 characters", () => {
    expect(() => startServer(makeConfig("shortkey", { apiKey: "too-short-key" }), { requireLogin: true })).toThrow(/at least 32/);
  });
  test("remote mode accepts a 32-character key; loopback accepts a short one", () => {
    const longKey = startServer(makeConfig("key32", { apiKey: "k".repeat(32) }), { requireLogin: true });
    longKey.stop();
    const loop = startServer(makeConfig("loopshort", { apiKey: "short" }));
    loop.stop();
  });
  test("repeated 401s from one peer on /v1 and /mcp end in 429", async () => {
    const keyed = start("throttle", { apiKey: KEY }, { requireLogin: true, authMaxFailures: 5, authWindowMs: 60_000 });
    const statuses = [];
    for (let i = 0; i < 8; i += 1) {
      statuses.push((await fetch(`${keyed.base}/v1/info`, { headers: { Authorization: "Bearer wrong" } })).status);
    }
    expect(statuses.slice(0, 5).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
    const mcp = await fetch(`${keyed.base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` }, body: "{}" });
    expect(mcp.status).toBe(429);
  });
  test("the right key is not throttled below the limit", async () => {
    const keyed = start("throttle-ok", { apiKey: KEY }, { requireLogin: true, authMaxFailures: 5 });
    for (let i = 0; i < 3; i += 1) await fetch(`${keyed.base}/v1/info`, { headers: { Authorization: "Bearer wrong" } });
    const good = await fetch(`${keyed.base}/v1/info`, { headers: { Authorization: `Bearer ${KEY}` } });
    expect(good.status).toBe(200);
  });
});

describe("item 6: login lockout map", () => {
  const guardFor = (clock, extra = {}) => createLoginGuard({
    store: { findToken: () => null },
    requireLogin: true,
    lockMs: 1000,
    maxFailures: 3,
    now: () => clock.t,
    getPeer: (request) => request.headers.get("x-peer") ?? "p",
    ...extra,
  });
  const badLogin = (guard, peer) => guard.handle(new Request("http://x/api/login", { method: "POST", headers: { "x-peer": peer, "Content-Type": "application/json" }, body: JSON.stringify({ token: "nope" }) }));

  test("expired entries are pruned", async () => {
    const clock = { t: 1_000_000 };
    const guard = guardFor(clock);
    for (let i = 0; i < 20; i += 1) await badLogin(guard, `peer-${i}`);
    expect(guard.stats().failurePeers).toBe(20);
    clock.t += 24 * 60 * 60 * 1000;
    await badLogin(guard, "fresh");
    expect(guard.stats().failurePeers).toBeLessThanOrEqual(2);
    guard.close();
  });
  test("the map is bounded", async () => {
    const clock = { t: 1_000_000 };
    const guard = guardFor(clock, { maxTrackedPeers: 50 });
    for (let i = 0; i < 500; i += 1) await badLogin(guard, `peer-${i}`);
    expect(guard.stats().failurePeers).toBeLessThanOrEqual(50);
    guard.close();
  });
  test("X-Forwarded-For is ignored unless behind TLS", async () => {
    const attempt = (base, xff) => fetch(`${base}/api/login`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": xff }, body: JSON.stringify({ token: "bad" }) });
    const plain = start("xff-plain", {}, { requireLogin: true, loginMaxFailures: 2 });
    const plainStatuses = [];
    for (let i = 0; i < 4; i += 1) plainStatuses.push((await attempt(plain.base, `10.0.0.${i}`)).status);
    expect(plainStatuses.at(-1)).toBe(429);
    const tls = start("xff-tls", {}, { requireLogin: true, behindTls: true, loginMaxFailures: 2 });
    const tlsStatuses = [];
    for (let i = 0; i < 4; i += 1) tlsStatuses.push((await attempt(tls.base, `10.0.0.${i}`)).status);
    expect(tlsStatuses.every((status) => status === 401)).toBe(true);
  });
});

describe("item 7: logout and expiry end live streams", () => {
  const openSse = async (base, cookies) => {
    const response = await fetch(`${base}/api/work-view/events`, { headers: { Cookie: cookies } });
    expect(response.status).toBe(200);
    const reader = response.body.getReader();
    await reader.read();
    return reader;
  };
  const openSocket = (app, cookies) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${app.port}/v1/live`, { headers: { Cookie: cookies } });
    const closed = new Promise((done) => ws.addEventListener("close", () => done(true)));
    ws.addEventListener("open", () => resolve({ ws, closed }));
    ws.addEventListener("error", reject);
  });

  test("logout closes the session's SSE stream and live socket", async () => {
    const cookies = await loginCookies(remote.base, remote.token);
    const reader = await openSse(remote.base, cookies);
    const { closed } = await openSocket(remote, cookies);
    const out = await fetch(`${remote.base}/api/logout`, { method: "POST", headers: { Cookie: cookies, "X-CSRF-Token": cookieValueOf(cookies, "aletheia_csrf") } });
    expect(out.status).toBe(200);
    expect(await streamEnds(reader, 3000)).toBe(true);
    expect(await Promise.race([closed, sleep(3000).then(() => false)])).toBe(true);
  });
  test("another session's streams stay open on logout", async () => {
    const a = await loginCookies(remote.base, remote.token);
    const b = await loginCookies(remote.base, remote.token);
    const readerB = await openSse(remote.base, b);
    await fetch(`${remote.base}/api/logout`, { method: "POST", headers: { Cookie: a, "X-CSRF-Token": cookieValueOf(a, "aletheia_csrf") } });
    expect(await streamEnds(readerB, 500)).toBe(false);
    await readerB.cancel();
  });
  test("session expiry closes the stream and the socket without a request", async () => {
    const short = start("expiry", {}, { requireLogin: true, sessionTtlMs: 600 });
    const cookies = await loginCookies(short.base, short.token);
    const reader = await openSse(short.base, cookies);
    const { closed } = await openSocket(short, cookies);
    expect(await streamEnds(reader, 4000)).toBe(true);
    expect(await Promise.race([closed, sleep(2000).then(() => false)])).toBe(true);
  });
});
