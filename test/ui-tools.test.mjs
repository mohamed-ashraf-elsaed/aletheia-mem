// T-211: the Tools tab with fake DOM and fake fetch.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let TV;
let TOOLS;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 5; i += 1) await tick(); };
const json = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => data });
const buttonByText = (root, text) => root.querySelectorAll("button").find((b) => b.textContent.trim() === text);
const toasts = () => dom.getElementById("ui-toasts")?.textContent ?? "";

function install(routes) {
  const calls = [];
  globalThis.fetch = async (path, init = {}) => {
    const record = { path, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(record);
    for (const [pattern, handler] of routes) if (typeof pattern === "string" ? path.startsWith(pattern) : pattern.test(path)) return handler(record);
    return json({ error: `unrouted ${path}` }, 404);
  };
  return calls;
}
function fakeLocation(start) {
  const loc = { hash: start, history: [start], pops: [] };
  globalThis.location = loc;
  globalThis.history = { pushState: (_a, _b, hash) => { loc.hash = hash; loc.history.push(hash); }, replaceState: (_a, _b, hash) => { loc.hash = hash; } };
  globalThis.addEventListener = (type, fn) => { if (type === "popstate") loc.pops.push(fn); };
  globalThis.removeEventListener = () => {};
  return loc;
}

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  TV ??= await import("../public/tabs/tools-views.js");
  TOOLS ??= await import("../public/tabs/tools.js");
  C.resetUi();
  (await import("../public/ui-dom.js")).state.project = "";
  fakeLocation("#/tools");
});
afterAll(() => restoreGlobals());

const tool = (id, extra = {}) => ({ id, name: id === "claude-code" ? "Claude Code" : id, capabilities: "full", installed: true, hooks: { file: "/home/u/.claude/settings.json", present: 3, expected: 3, events: ["SessionStart", "Stop"], commands: { SessionStart: "aletheia hook claude-code SessionStart" }, error: null }, lastCapture: new Date(Date.now() - 120_000).toISOString(), spool: { items: 2, bytes: 2048, path: "/x" }, commands: { install: `aletheia install ${id} --write`, uninstall: `aletheia uninstall ${id} --write`, doctor: "aletheia doctor", mcp: "bun bin/mcp.mjs" }, ...extra });
const DOCTOR = (tools = [tool("claude-code")], checks = [{ name: "server", ok: true, detail: "answers" }]) => json({ tools, checks, dataDir: "/data", generatedAt: new Date().toISOString() });

describe("T-211: the tools page", () => {
  test("a card per tool with hooks status, last capture, spool and a Copy button for every command", async () => {
    install([["/api/hub/doctor", () => DOCTOR()], ["/api/hub/overview", () => json({ provider: "none", claudeMem: { exists: false } })]]);
    const view = TV.toolsView({});
    await flush();
    const card = view.querySelector(".ui-item");
    expect(card.textContent).toContain("Claude Code");
    expect(card.textContent).toContain("hooks 3/3");
    expect(card.textContent).toContain("2 min ago");
    expect(card.textContent).toContain("2 waiting, 2.0 KB");
    expect(card.querySelectorAll(".ui-command").length).toBe(5);
    const copy = card.querySelectorAll("button").find((b) => b.getAttribute("aria-label") === "Copy the install command");
    copy.click();
    await flush();
    expect(globalThis.navigator.clipboard.written).toContain("aletheia install claude-code --write");
  });
  test("a hooks error is shown, not hidden", async () => {
    install([["/api/hub/doctor", () => DOCTOR([tool("claude-code", { hooks: { file: "/f", present: 0, expected: 3, events: [], commands: {}, error: "cannot read /f: bad json" } })])], ["/api/hub/overview", () => json({})]]);
    const view = TV.toolsView({});
    await flush();
    expect(view.textContent).toContain("cannot read /f: bad json");
  });
  test("jargon has a tooltip", async () => {
    install([["/api/hub/doctor", () => DOCTOR()], ["/api/hub/overview", () => json({})]]);
    const view = TV.toolsView({});
    await flush();
    const terms = view.querySelectorAll(".ui-term");
    expect(terms.map((t) => t.textContent)).toEqual(["Hooks", "Spool"]);
    expect(terms.every((t) => t.getAttribute("aria-describedby"))).toBe(true);
  });
  test("a failing doctor call shows the error with Retry", async () => {
    install([["/api/hub/doctor", () => json({ error: "doctor crashed" }, 500)], ["/api/hub/overview", () => json({})]]);
    const view = TV.toolsView({});
    await flush();
    expect(view.textContent).toContain("doctor crashed");
    expect(buttonByText(view, "Retry")).toBeTruthy();
  });
  test("the old viewer card appears only when its database exists", async () => {
    const root = dom.createElement("div");
    root.setAttribute("id", "ui-tools");
    dom.body.append(root);
    install([["/api/hub/doctor", () => DOCTOR()], ["/api/hub/overview", () => json({ provider: "none", claudeMem: { exists: true } })]]);
    await TOOLS.renderTools({ tab: "tools", sub: "tools", params: {} });
    await flush();
    expect(root.textContent).toContain("Classic claude-mem viewer (reads ~/.claude-mem, read-only)");
    expect(root.querySelectorAll(".ui-tab").map((t) => t.getAttribute("data-tab"))).toEqual(["tools", "devices", "access", "alerts", "team", "checks", "activity", "context"]);
  });
});

describe("T-211: devices", () => {
  const SYNC = (devices, extra = {}) => json({ epoch: 2, headSeq: 40, deviceCount: devices.length, e2ee: { enabled: false }, devices, total: devices.length, limit: 10, offset: 0, ...extra });
  const dev = (id, extra = {}) => ({ deviceId: id, name: `Laptop ${id}`, revoked: false, pendingOps: 3, lastSync: new Date(Date.now() - 60_000).toISOString(), ...extra });
  test("pages from the server and shows counts and the encryption line", async () => {
    fakeLocation("#/tools/devices");
    const calls = install([["/api/hub/sync/status", () => SYNC([dev("d1"), dev("d2", { revoked: true })])]]);
    const view = TV.devicesView({});
    await flush();
    expect(calls[0].path).toBe("/api/hub/sync/status?limit=10&offset=0");
    expect(view.querySelectorAll(".ui-item").length).toBe(2);
    expect(view.textContent).toContain("End-to-end encryption is off");
    expect(view.textContent).toContain("3 pending");
    expect(view.textContent).toContain("revoked");
  });
  test("no devices explains pairing and gives the command", async () => {
    fakeLocation("#/tools/devices");
    install([["/api/hub/sync/status", () => SYNC([])]]);
    const view = TV.devicesView({});
    await flush();
    expect(view.textContent).toContain("No paired devices");
    expect(view.textContent).toContain("aletheia sync pair");
  });
  test("Revoke asks first and says what happens; cancelling sends nothing", async () => {
    fakeLocation("#/tools/devices");
    const calls = install([["/api/hub/sync/status", () => SYNC([dev("d1")])], ["/api/hub/sync/revoke", () => json({ ok: true })]]);
    const view = TV.devicesView({});
    await flush();
    buttonByText(view, "Revoke").click();
    await tick();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    expect(dialog.textContent).toContain("keeps its own local copy");
    buttonByText(dialog, "Cancel").click();
    await flush();
    expect(calls.some((c) => c.path.includes("revoke"))).toBe(false);
  });
  test("confirming revokes the device and reloads", async () => {
    fakeLocation("#/tools/devices");
    const calls = install([["/api/hub/sync/status", () => SYNC([dev("d1")])], ["/api/hub/sync/revoke", () => json({ ok: true })]]);
    const view = TV.devicesView({});
    await flush();
    buttonByText(view, "Revoke").click();
    await tick();
    buttonByText(dom.documentElement.querySelector(".ui-modal"), "Revoke device").click();
    await flush();
    expect(calls.find((c) => c.path.includes("revoke")).body).toEqual({ device_id: "d1" });
    expect(calls.filter((c) => c.path.startsWith("/api/hub/sync/status")).length).toBeGreaterThan(1);
  });
  test("the pairing code comes with a join command to copy", async () => {
    fakeLocation("#/tools/devices");
    install([["/api/hub/sync/status", () => SYNC([])], ["/api/hub/sync/pair", () => json({ url: "http://10.0.0.5:37791", code: "ABCD-1234" })]]);
    const view = TV.devicesView({});
    await flush();
    buttonByText(view, "Show pairing code").click();
    await flush();
    expect(view.textContent).toContain("ABCD-1234");
    expect(view.textContent).toContain("aletheia sync join http://10.0.0.5:37791 ABCD-1234");
  });
});

describe("T-211: remote access, checks, activity", () => {
  test("a new link shows its token once with the client snippets", async () => {
    install([["/api/hub/mcp-links/revoke", () => json({})], [/\/api\/hub\/mcp-links$/, (r) => (r.method === "POST" ? json({ token: "tok_123", url: "https://hub/mcp", scope: "mcp", claudeCode: "claude mcp add ...", claudeDesktop: "{ }" }) : json({ links: [] }))]]);
    const view = TV.accessView({});
    await flush();
    expect(view.textContent).toContain("No links yet");
    buttonByText(view, "Create MCP link").click();
    await flush();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    expect(dialog.textContent).toContain("shown once");
    expect(dialog.textContent).toContain("tok_123");
    expect(dialog.textContent).toContain("claude mcp add");
  });
  test("revoking a link asks first and says it cannot be undone", async () => {
    const calls = install([["/api/hub/mcp-links/revoke", () => json({})], [/\/api\/hub\/mcp-links$/, () => json({ links: [{ id: 4, scope: "mcp", name: "laptop", projects: [], revoked: false }] })]]);
    const view = TV.accessView({});
    await flush();
    buttonByText(view, "Revoke").click();
    await tick();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    expect(dialog.textContent).toContain("cannot be undone");
    buttonByText(dialog, "Revoke link").click();
    await flush();
    expect(calls.find((c) => c.path.endsWith("/revoke")).body).toEqual({ id: 4 });
  });
  test("checks say how many need attention and re-run on demand", async () => {
    const calls = install([["/api/hub/doctor", () => DOCTOR([], [{ name: "hooks", ok: false, detail: "missing" }, { name: "server", ok: true, detail: "ok" }])]]);
    const view = TV.checksView();
    await flush();
    expect(view.textContent).toContain("1 of 2 checks need attention.");
    expect(view.querySelectorAll("tr").length).toBe(3);
    buttonByText(view, "Run again").click();
    await flush();
    expect(calls.length).toBe(2);
  });
  test("activity pages and filters from the server", async () => {
    fakeLocation("#/tools/activity?actor=ui&action=memory");
    const calls = install([["/api/hub/audit", () => json({ audit: [{ id: 1, at_epoch: Date.now(), actor: "ui", action: "memory.update", detail: { id: 3 } }], total: 1 })]]);
    const view = TV.activityView();
    await flush();
    expect(calls[0].path).toBe("/api/hub/audit?limit=25&offset=0&actor=ui&action=memory");
    expect(view.textContent).toContain("memory.update");
    expect(view.textContent).toContain('{"id":3}');
  });
});
