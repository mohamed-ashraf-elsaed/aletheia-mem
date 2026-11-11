// ALETHEIA_API_KEY guards every route that returns memory or changes data, /api/hub/* included, not only /v1 and /mcp.
// The dashboard asks for the key once, keeps it in sessionStorage and sends it as a bearer header. The /v1/live socket
// takes the key in the Authorization header (tools) or a one-time ticket offered as a WebSocket subprotocol (browsers),
// never in the URL. Static files, /health and /healthz stay open. With no key the routes behave as before. Remote login
// mode keeps working: a session and the key are separate checks, and a keyed remote server needs both on /api/*.
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { SyncStore } from "../src/hub/sync/store.mjs";
import { startServer } from "../src/server.mjs";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";
import * as dom from "../public/ui-dom.js";
import * as status from "../public/ui-status.js";

const KEY = "dashboard-key-1234567890";
const MARKER = "zebra-marker-memory-text";
const publicDir = join(import.meta.dir, "..", "public");

function serve(tag, extra = {}, options = {}) {
  const dir = tempDir(`aletheia-apikey-${tag}-`);
  const cfg = loadConfig({
    port: 0,
    dataDir: dir,
    hubDb: join(dir, "hub.db"),
    syncDb: join(dir, "sync.db"),
    syncPort: 0,
    sourceDb: join(dir, "no-source.db"),
    publicDir,
    provider: "none",
    autoRefresh: false,
    extractionWorker: false,
    ...extra,
  });
  const app = startServer(cfg, options);
  return { cfg, app, base: `http://127.0.0.1:${app.server.port}`, port: app.server.port };
}

const bearer = (key = KEY) => ({ Authorization: `Bearer ${key}` });
const postJson = (base, path, body, headers = {}) => fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

function openSocket(port, { headers = {}, protocols = undefined, path = "/v1/live" } = {}) {
  const url = `ws://127.0.0.1:${port}${path}`;
  const ws = protocols ? new WebSocket(url, protocols) : new WebSocket(url, { headers });
  return new Promise((resolve, reject) => {
    let opened = false;
    ws.onopen = () => { opened = true; resolve(ws); };
    ws.onerror = () => { if (!opened) reject(new Error("websocket handshake failed")); };
    ws.onclose = () => { if (!opened) reject(new Error("websocket closed before opening")); };
  });
}

afterAll(() => cleanupTempDirs());

describe("with ALETHEIA_API_KEY set", () => {
  let keyed;
  beforeAll(async () => {
    keyed = serve("keyed", { apiKey: KEY });
    const saved = await postJson(keyed.base, "/v1/memories", { project: "shop", kind: "note", title: MARKER, narrative: `${MARKER} body` }, bearer());
    expect(saved.status).toBe(201);
  });
  afterAll(() => keyed.app.stop());

  test("/api/hub/* without the bearer is 401 with a Bearer challenge; with it, 200", async () => {
    for (const path of ["/api/hub/overview", "/api/hub/memories", "/api/hub/projects", "/api/hub/rules", "/api/hub/settings", "/api/hub/audit?limit=5"]) {
      const bare = await fetch(`${keyed.base}${path}`);
      expect({ path, status: bare.status }).toEqual({ path, status: 401 });
      expect(bare.headers.get("www-authenticate")).toMatch(/^Bearer\b/);
      expect((await bare.json()).error).toBe("A valid bearer key is required.");
      expect(await (await fetch(`${keyed.base}${path}`, { headers: bearer("wrong-key") })).status).toBe(401);
      const ok = await fetch(`${keyed.base}${path}`, { headers: bearer() });
      expect({ path, status: ok.status }).toEqual({ path, status: 200 });
    }
    const memories = await (await fetch(`${keyed.base}/api/hub/memories`, { headers: bearer() })).json();
    expect(JSON.stringify(memories)).toContain(MARKER);
  });

  test("a write to /api/hub/* without the bearer is 401 and changes nothing", async () => {
    const bare = await postJson(keyed.base, "/api/hub/memories", { project: "shop", text: "sneaky write" });
    expect(bare.status).toBe(401);
    const ok = await postJson(keyed.base, "/api/hub/memories", { project: "shop", text: "keyed write" }, bearer());
    expect(ok.status).toBeLessThan(300);
    const list = JSON.stringify(await (await fetch(`${keyed.base}/api/hub/memories`, { headers: bearer() })).json());
    expect(list).toContain("keyed write");
    expect(list).not.toContain("sneaky write");
  });

  test("/v1/* without the bearer is 401; with it, 200", async () => {
    for (const path of ["/v1/info", "/v1/health", "/v1/work", "/v1/facts?subject=shop", "/v1/context/economics"]) {
      expect({ path, status: (await fetch(`${keyed.base}${path}`)).status }).toEqual({ path, status: 401 });
      expect({ path, status: (await fetch(`${keyed.base}${path}`, { headers: bearer() })).status }).toEqual({ path, status: 200 });
    }
    expect((await postJson(keyed.base, "/v1/search", { query: "zebra" })).status).toBe(401);
    const found = await postJson(keyed.base, "/v1/search", { query: "zebra" }, bearer());
    expect(found.status).toBe(200);
  });

  test("the work-view and setup routes need the key too", async () => {
    for (const path of ["/api/work-view", "/api/setup/state", "/api/setup/scan", "/api/work-state"]) {
      expect({ path, status: (await fetch(`${keyed.base}${path}`)).status }).toEqual({ path, status: 401 });
      expect({ path, status: (await fetch(`${keyed.base}${path}`, { headers: bearer() })).status }).not.toEqual({ path, status: 401 });
    }
    expect((await postJson(keyed.base, "/api/work-view/rules/load-in-claude-code", {})).status).toBe(401);
  });

  test("static files, /health and /healthz stay open, and health carries no memory text", async () => {
    for (const path of ["/", "/index.html", "/work-view/ui-dom.js", "/work-view/one-ui.css", "/work-view/favicon.png", "/health", "/healthz"]) {
      const response = await fetch(`${keyed.base}${path}`);
      expect({ path, status: response.status }).toEqual({ path, status: 200 });
      if (path.startsWith("/health")) expect(await response.text()).not.toContain(MARKER);
    }
  });

  test("the live socket refuses a handshake without the key and accepts the Authorization header", async () => {
    await expect(openSocket(keyed.port)).rejects.toThrow(/handshake failed|closed before opening/);
    await expect(openSocket(keyed.port, { headers: bearer("wrong-key") })).rejects.toThrow(/handshake failed|closed before opening/);
    const ws = await openSocket(keyed.port, { headers: bearer() });
    ws.close();
  });

  test("a browser trades the key for a one-time ticket and offers it as a subprotocol; the key never goes in the URL", async () => {
    expect((await postJson(keyed.base, "/v1/live/ticket", {})).status).toBe(401);
    const issued = await postJson(keyed.base, "/v1/live/ticket", {}, bearer());
    expect(issued.status).toBe(200);
    const { ticket, protocol } = await issued.json();
    expect(ticket).toMatch(/^[0-9a-f]{32,}$/);
    expect(ticket).not.toContain(KEY);
    expect(protocol).toBe("aletheia.live");
    const ws = await openSocket(keyed.port, { protocols: ["aletheia.live", `aletheia.ticket.${ticket}`] });
    expect(ws.protocol).toBe("aletheia.live");
    ws.close();
    // single use
    await expect(openSocket(keyed.port, { protocols: ["aletheia.live", `aletheia.ticket.${ticket}`] })).rejects.toThrow(/handshake failed|closed before opening/);
    await expect(openSocket(keyed.port, { protocols: ["aletheia.live", "aletheia.ticket.0123456789abcdef0123456789abcdef"] })).rejects.toThrow(/handshake failed|closed before opening/);
    // the key itself is not a ticket
    await expect(openSocket(keyed.port, { protocols: ["aletheia.live", `aletheia.ticket.${KEY}`] })).rejects.toThrow(/handshake failed|closed before opening/);
  });

  test("a ticket expires", async () => {
    const apiKey = await import("../src/hub/api-key.mjs");
    let now = 1_000;
    const tickets = apiKey.createLiveTickets({ ttlMs: 30_000, now: () => now });
    const offer = (ticket) => new Request("http://127.0.0.1/v1/live", { headers: { "Sec-WebSocket-Protocol": `aletheia.live, aletheia.ticket.${ticket}` } });
    const fresh = tickets.issue().ticket;
    const stale = tickets.issue().ticket;
    expect(tickets.redeem(offer(fresh))).toBe(true);
    now += 30_001;
    expect(tickets.redeem(offer(stale))).toBe(false);
  });
});

describe("with no key set", () => {
  let open;
  beforeAll(() => { open = serve("open"); });
  afterAll(() => open.app.stop());

  test("/api/hub/* and /v1/* answer without a bearer, as before", async () => {
    for (const path of ["/api/hub/overview", "/api/hub/memories", "/v1/info", "/v1/work"]) {
      expect({ path, status: (await fetch(`${open.base}${path}`)).status }).toEqual({ path, status: 200 });
    }
    const overview = await (await fetch(`${open.base}/api/hub/overview`)).json();
    expect(overview.apiKeyRequired).toBe(false);
  });

  test("the live socket opens without any auth, and a stray ticket offer still gets the live protocol back", async () => {
    const plain = await openSocket(open.port);
    plain.close();
    const { ticket } = await (await postJson(open.base, "/v1/live/ticket", {})).json();
    const offered = await openSocket(open.port, { protocols: ["aletheia.live", `aletheia.ticket.${ticket}`] });
    expect(offered.protocol).toBe("aletheia.live");
    offered.close();
  });
});

describe("remote login mode", () => {
  const cookieHeader = (response) => (response.headers.get("set-cookie") ?? "").split(/,(?=\s*aletheia_)/).map((part) => part.trim().split(";")[0]).join("; ");
  const adminToken = (cfg) => {
    const store = new SyncStore(cfg.syncDb);
    const token = store.mintToken(store.ensureAccount().id, { scope: "admin", name: "owner" }).token;
    store.close();
    return token;
  };
  const login = async (base, token) => {
    const response = await postJson(base, "/api/login", { token });
    expect(response.status).toBe(200);
    return cookieHeader(response);
  };

  test("without a key: login works and the session opens /api/hub, as before", async () => {
    const remote = serve("remote-open", {}, { requireLogin: true });
    try {
      expect((await fetch(`${remote.base}/api/hub/overview`)).status).toBe(401);
      const cookie = await login(remote.base, adminToken(remote.cfg));
      expect((await fetch(`${remote.base}/api/hub/overview`, { headers: { Cookie: cookie } })).status).toBe(200);
    } finally {
      remote.app.stop();
    }
  });

  test("with a key: the login page and /api/login need no key; /api/* needs the session and the key; /v1 needs the key", async () => {
    const remote = serve("remote-keyed", { apiKey: KEY }, { requireLogin: true });
    try {
      const page = await fetch(`${remote.base}/`);
      expect(page.status).toBe(401);
      expect(await page.text()).toContain("Log in to Aletheia");
      const cookie = await login(remote.base, adminToken(remote.cfg));
      const sessionOnly = await fetch(`${remote.base}/api/hub/overview`, { headers: { Cookie: cookie } });
      expect(sessionOnly.status).toBe(401);
      expect(sessionOnly.headers.get("www-authenticate")).toMatch(/^Bearer\b/);
      const keyOnly = await fetch(`${remote.base}/api/hub/overview`, { headers: bearer() });
      expect(keyOnly.status).toBe(401);
      expect(keyOnly.headers.get("www-authenticate")).toBeNull();
      expect((await fetch(`${remote.base}/api/hub/overview`, { headers: { Cookie: cookie, ...bearer() } })).status).toBe(200);
      expect((await fetch(`${remote.base}/`, { headers: { Cookie: cookie } })).status).toBe(200);
      expect((await fetch(`${remote.base}/v1/info`, { headers: bearer() })).status).toBe(200);
      expect((await fetch(`${remote.base}/v1/info`, { headers: { Cookie: cookie } })).status).toBe(401);
    } finally {
      remote.app.stop();
    }
  });
});

describe("the dashboard sends the key", () => {
  const memory = () => {
    const data = new Map();
    return { getItem: (key) => (data.has(key) ? data.get(key) : null), setItem: (key, value) => data.set(key, String(value)), removeItem: (key) => data.delete(key), data };
  };
  const reply = (status, body, headers = {}) => {
    const lower = Object.fromEntries(Object.entries({ "content-type": "application/json", ...headers }).map(([k, v]) => [k.toLowerCase(), v]));
    return { ok: status < 400, status, headers: { get: (name) => lower[name.toLowerCase()] ?? null }, json: async () => body, text: async () => JSON.stringify(body) };
  };
  const challenge = () => reply(401, { error: "A valid bearer key is required." }, { "WWW-Authenticate": 'Bearer realm="aletheia"' });
  let calls;

  beforeEach(() => {
    installFakeDom();
    globalThis.sessionStorage = memory();
    calls = [];
    dom.setKeyPrompt?.(null);
  });
  afterAll(() => {
    dom.setKeyPrompt?.(null);
    delete globalThis.sessionStorage;
    restoreGlobals();
  });

  test("api() sends Authorization: Bearer <key> when a key is stored, and nothing when none is", async () => {
    globalThis.fetch = async (path, init = {}) => { calls.push({ path, headers: { ...init.headers } }); return reply(200, { ok: true }); };
    await dom.api("/api/hub/overview");
    expect(calls[0].headers.Authorization).toBeUndefined();
    dom.storeKey(KEY);
    expect(globalThis.sessionStorage.data.get("aletheia.apiKey")).toBe(KEY);
    await dom.api("/api/hub/overview");
    await dom.api("/api/hub/memories", { method: "POST", body: { text: "x" } });
    expect(calls[1].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[2].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(calls[2].headers["Content-Type"]).toBe("application/json");
  });

  test("a key challenge asks for the key once, however many calls wait, then repeats each call with it", async () => {
    let asked = 0;
    let release;
    dom.setKeyPrompt(() => { asked += 1; return new Promise((resolve) => { release = resolve; }); });
    globalThis.fetch = async (path, init = {}) => {
      calls.push({ path, headers: { ...init.headers } });
      return init.headers?.Authorization === `Bearer ${KEY}` ? reply(200, { path }) : challenge();
    };
    const pending = Promise.all([dom.api("/api/hub/overview"), dom.api("/v1/work"), dom.api("/api/hub/projects")]);
    for (let i = 0; i < 10 && !release; i += 1) await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    release(KEY);
    const results = await pending;
    expect(asked).toBe(1);
    expect(results.map((result) => result.path)).toEqual(["/api/hub/overview", "/v1/work", "/api/hub/projects"]);
    expect(dom.storedKey()).toBe(KEY);
  });

  test("a wrong key asks again with a retry flag; cancelling gives a 401 error", async () => {
    const prompts = [];
    dom.setKeyPrompt((options) => { prompts.push(options); return prompts.length === 1 ? "wrong-key" : null; });
    globalThis.fetch = async () => challenge();
    const error = await dom.api("/api/hub/overview").catch((failure) => failure);
    expect(error).toBeInstanceOf(dom.ApiError);
    expect(error.status).toBe(401);
    expect(prompts.map((options) => !!options?.retry)).toEqual([false, true]);
    expect(dom.storedKey()).toBe("");
  });

  test("a 401 without the Bearer challenge (an expired remote session) does not ask for the key", async () => {
    let asked = 0;
    dom.setKeyPrompt(() => { asked += 1; return KEY; });
    globalThis.fetch = async () => reply(401, { error: "A session is required." });
    await expect(dom.api("/api/hub/overview")).rejects.toThrow("A session is required.");
    expect(asked).toBe(0);
  });

  test("the status bar's raw requests carry the key", async () => {
    dom.storeKey(KEY);
    const seen = [];
    const result = await status.rawJson("/v1/health", async (path, init = {}) => { seen.push({ ...init.headers }); return reply(200, { status: "ok" }); });
    expect(result.ok).toBe(true);
    expect(seen[0].Authorization).toBe(`Bearer ${KEY}`);
    expect(seen[0].Accept).toBe("application/json");
  });

  test("the live socket fetches a ticket with the key and offers it as a subprotocol, never in the URL", async () => {
    dom.storeKey(KEY);
    const opened = [];
    class FakeSocket {
      constructor(url, protocols) { this.url = url; this.protocols = protocols; opened.push(this); }
      close() { this.closed = true; }
    }
    const win = { WebSocket: FakeSocket, location: { protocol: "http:", host: "127.0.0.1:9" } };
    globalThis.fetch = async (path, init = {}) => {
      calls.push({ path, method: init.method, headers: { ...init.headers } });
      return reply(200, { ticket: "ab".repeat(24), protocol: "aletheia.live" });
    };
    const socket = status.openLiveSocket(win, "shop");
    for (let i = 0; i < 10 && !opened.length; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls[0]).toMatchObject({ path: "/v1/live/ticket", method: "POST" });
    expect(calls[0].headers.Authorization).toBe(`Bearer ${KEY}`);
    expect(opened).toHaveLength(1);
    expect(opened[0].url).toBe("ws://127.0.0.1:9/v1/live?project=shop");
    expect(opened[0].url).not.toContain(KEY);
    expect(opened[0].protocols).toEqual(["aletheia.live", `aletheia.ticket.${"ab".repeat(24)}`]);
    let frame = null;
    socket.onmessage = (event) => { frame = event.data; };
    opened[0].onmessage({ data: "{\"kind\":\"fact\"}" });
    expect(frame).toBe("{\"kind\":\"fact\"}");
    socket.close();
    expect(opened[0].closed).toBe(true);
  });

  test("the classic viewer, which cannot send the key, is not offered when the server needs it", async () => {
    const { classicViewerAvailable } = await import("../public/ui-core.js");
    expect(classicViewerAvailable({ claudeMem: { exists: true }, apiKeyRequired: false })).toBe(true);
    expect(classicViewerAvailable({ claudeMem: { exists: true }, apiKeyRequired: true })).toBe(false);
  });

  test("the key dialog is a password field that resolves the trimmed key, or null on cancel", async () => {
    const { apiKeyDialog, resetUi } = await import("../public/ui-components.js");
    resetUi();
    const pending = apiKeyDialog();
    const input = globalThis.document.querySelector("input");
    expect(input.getAttribute("type")).toBe("password");
    input.value = `  ${KEY}  `;
    input.dispatch("keydown", { key: "Enter" });
    expect(await pending).toBe(KEY);
    resetUi();
    const retry = apiKeyDialog({ retry: true });
    expect(globalThis.document.body.textContent).toContain("did not accept that key");
    globalThis.document.querySelectorAll("button").find((node) => node.textContent.includes("Cancel")).click();
    expect(await retry).toBeNull();
  });

  test("with no key stored the live socket opens directly, without a ticket or subprotocol", () => {
    const opened = [];
    class FakeSocket { constructor(url, protocols) { opened.push({ url, protocols }); } }
    globalThis.fetch = async () => { throw new Error("no request expected"); };
    status.openLiveSocket({ WebSocket: FakeSocket, location: { protocol: "https:", host: "hub.example" } }, "");
    expect(opened).toEqual([{ url: "wss://hub.example/v1/live", protocols: undefined }]);
  });
});
