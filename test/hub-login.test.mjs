// T-110: remote login for the Hub. When the server is not loopback-only, every `/` and `/api` route needs a
// session: an admin token from the sync account is exchanged for an HttpOnly, SameSite=Strict,
// Secure-when-HTTPS cookie plus a readable CSRF cookie; state-changing requests echo the CSRF cookie in the
// X-CSRF-Token header. Sessions expire; failed logins lock out with back-off. Loopback keeps today's behaviour.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { SyncStore } from "../src/hub/sync/store.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-login-"));

const makeConfig = (extra = {}) => loadConfig({
  port: 0,
  dataDir: join(temp, `data-${extra.tag ?? "x"}`),
  hubDb: join(temp, `hub-${extra.tag ?? "x"}.db`),
  syncDb: join(temp, `sync-${extra.tag ?? "x"}.db`),
  syncPort: 0,
  provider: "none",
  ...extra,
});

const cookiesOf = (response) => {
  const raw = response.headers.get("set-cookie") ?? "";
  const parts = raw.split(/,(?=\s*aletheia_)/).map((part) => part.trim()).filter(Boolean);
  const out = {};
  for (const part of parts) {
    const name = part.slice(0, part.indexOf("="));
    out[name] = part;
  }
  return out;
};

let admin;
let app;
let base;
let cfg;

beforeAll(() => {
  cfg = makeConfig({ tag: "main" });
  const store = new SyncStore(cfg.syncDb);
  const account = store.ensureAccount();
  admin = store.mintToken(account.id, { scope: "admin", name: "owner" }).token;
  store.close();
  app = startServer(cfg, { requireLogin: true });
  base = `http://127.0.0.1:${app.server.port}`;
});

afterAll(() => {
  app.stop();
  rmSync(temp, { recursive: true, force: true });
});

const login = (token, headers = {}) => fetch(`${base}/api/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({ token }),
});

describe("T-110: remote login for the Hub", () => {
  test("unauthenticated requests get 401 and the login page is served for /", async () => {
    const api = await fetch(`${base}/api/hub/overview`);
    expect(api.status).toBe(401);
    const page = await fetch(`${base}/`);
    expect(page.status).toBe(401);
    expect(await page.text()).toContain("Log in to Aletheia");
  });

  test("a wrong admin token is 401; the right one sets the session and CSRF cookies with the right flags", async () => {
    const wrong = await login("not-a-token");
    expect(wrong.status).toBe(401);

    const ok = await login(admin);
    expect(ok.status).toBe(200);
    const cookies = cookiesOf(ok);
    expect(cookies.aletheia_session).toContain("HttpOnly");
    expect(cookies.aletheia_session).toContain("SameSite=Strict");
    expect(cookies.aletheia_session).toContain("Path=/");
    expect(cookies.aletheia_csrf).toContain("SameSite=Strict");
    expect(cookies.aletheia_csrf).not.toContain("HttpOnly");
    expect(cookies.aletheia_session).not.toContain("Secure"); // plain http, no TLS proxy flag
  });

  test("with a session, GET works and a state-changing call without CSRF is 403", async () => {
    const ok = await login(admin);
    const cookies = cookiesOf(ok);
    const cookieHeader = `aletheia_session=${cookies.aletheia_session.split(";")[0].split("=")[1]}; aletheia_csrf=${cookies.aletheia_csrf.split(";")[0].split("=")[1]}`;

    const overview = await fetch(`${base}/api/hub/overview`, { headers: { Cookie: cookieHeader } });
    expect(overview.status).toBe(200);

    const noCsrf = await fetch(`${base}/api/hub/mcp-links`, { method: "POST", headers: { "Content-Type": "application/json", Cookie: cookieHeader }, body: "{}" });
    expect(noCsrf.status).toBe(403);

    const withCsrf = await fetch(`${base}/api/hub/mcp-links`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookieHeader, "X-CSRF-Token": cookies.aletheia_csrf.split(";")[0].split("=")[1] },
      body: "{}",
    });
    expect(withCsrf.status).toBe(201);
  });

  test("logout clears the session and the next request is 401", async () => {
    const ok = await login(admin);
    const cookies = cookiesOf(ok);
    const cookieHeader = `aletheia_session=${cookies.aletheia_session.split(";")[0].split("=")[1]}; aletheia_csrf=${cookies.aletheia_csrf.split(";")[0].split("=")[1]}`;
    const csrf = cookies.aletheia_csrf.split(";")[0].split("=")[1];

    const logout = await fetch(`${base}/api/logout`, { method: "POST", headers: { Cookie: cookieHeader, "X-CSRF-Token": csrf } });
    expect(logout.status).toBe(200);
    const after = await fetch(`${base}/api/hub/overview`, { headers: { Cookie: cookieHeader } });
    expect(after.status).toBe(401);
  });

  test("failed logins lock out with back-off and unlock afterwards", async () => {
    const cfg2 = makeConfig({ tag: "lock" });
    const store2 = new SyncStore(cfg2.syncDb);
    const account2 = store2.ensureAccount();
    const admin2 = store2.mintToken(account2.id, { scope: "admin" }).token;
    store2.close();
    const app2 = startServer(cfg2, { requireLogin: true, loginMaxFailures: 3, loginLockMs: 150 });
    const base2 = `http://127.0.0.1:${app2.server.port}`;
    const login2 = (token) => fetch(`${base2}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    try {
      for (let i = 0; i < 3; i++) expect((await login2("wrong")).status).toBe(401);
      const locked = await login2(admin2);
      expect(locked.status).toBe(429);
      expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
      await Bun.sleep(200);
      const unlocked = await login2(admin2);
      expect(unlocked.status).toBe(200);
    } finally {
      app2.stop();
    }
  });

  test("sessions expire", async () => {
    const cfg3 = makeConfig({ tag: "ttl" });
    const store3 = new SyncStore(cfg3.syncDb);
    const account3 = store3.ensureAccount();
    const admin3 = store3.mintToken(account3.id, { scope: "admin" }).token;
    store3.close();
    const app3 = startServer(cfg3, { requireLogin: true, sessionTtlMs: 100 });
    const base3 = `http://127.0.0.1:${app3.server.port}`;
    try {
      const ok = await fetch(`${base3}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: admin3 }) });
      const cookie = cookiesOf(ok).aletheia_session;
      const cookieHeader = cookie.slice(0, cookie.indexOf(";"));
      expect((await fetch(`${base3}/api/hub/overview`, { headers: { Cookie: cookieHeader } })).status).toBe(200);
      await Bun.sleep(150);
      expect((await fetch(`${base3}/api/hub/overview`, { headers: { Cookie: cookieHeader } })).status).toBe(401);
    } finally {
      app3.stop();
    }
  });

  test("the session cookie is Secure when the server is behind TLS", async () => {
    const cfg4 = makeConfig({ tag: "tls" });
    const store4 = new SyncStore(cfg4.syncDb);
    const account4 = store4.ensureAccount();
    const admin4 = store4.mintToken(account4.id, { scope: "admin" }).token;
    store4.close();
    const app4 = startServer(cfg4, { requireLogin: true, behindTls: true });
    try {
      const ok = await fetch(`http://127.0.0.1:${app4.server.port}/api/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: admin4 }) });
      expect(ok.status).toBe(200);
      expect(cookiesOf(ok).aletheia_session).toContain("Secure");
    } finally {
      app4.stop();
    }
  });

  test("loopback-only keeps today's behaviour: no login required", async () => {
    const cfg5 = makeConfig({ tag: "loop" });
    const app5 = startServer(cfg5); // host 127.0.0.1, requireLogin defaults to false
    try {
      const overview = await fetch(`http://127.0.0.1:${app5.server.port}/api/hub/overview`);
      expect(overview.status).toBe(200);
    } finally {
      app5.stop();
    }
  });
});
