// T-217: the Alerts and Team pages inside the Tools tab, with fake DOM and fake fetch.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let TT;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 6; i += 1) await tick(); };
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
  const loc = { hash: start, history: [start] };
  globalThis.location = loc;
  globalThis.history = { pushState: (_a, _b, hash) => { loc.hash = hash; loc.history.push(hash); }, replaceState: (_a, _b, hash) => { loc.hash = hash; } };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  return loc;
}

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  TT ??= await import("../public/tabs/tools-team.js");
  C.resetUi();
  fakeLocation("#/tools/alerts");
});
afterAll(() => restoreGlobals());

const rule = (id, extra = {}) => ({ id, name: `Rule ${id}`, event: "token.revoked", target: "file", path: "/var/alerts.log", hasSecret: false, allowPrivate: false, ...extra });
const delivery = (id, status = "delivered") => ({ id, event: "sync.error", status, attempts: 1, lastError: status === "failed" ? "connection refused" : null });
const alertRoutes = (extra = []) => [
  ...extra,
  [/^\/api\/hub\/alerts\/rules$/, (r) => (r.method === "POST" ? json({ id: 9 }, 201) : json({ rules: [rule(1), rule(2, { target: "webhook", url: "https://hook.example/x", hasSecret: true })] }))],
  [/^\/api\/hub\/alerts\/feed/, () => json({ deliveries: [delivery(5), delivery(4, "failed")], total: 23 })],
];

describe("T-217: alerts", () => {
  test("rules with their target, signing and a feed paged from the server", async () => {
    const calls = install(alertRoutes());
    const view = TT.alertsView();
    await flush();
    expect(view.textContent).toContain("#1 Rule 1");
    expect(view.textContent).toContain("/var/alerts.log");
    expect(view.textContent).toContain("https://hook.example/x");
    expect(view.textContent).toContain("signed");
    expect(calls.find((c) => c.path.startsWith("/api/hub/alerts/feed")).path).toBe("/api/hub/alerts/feed?limit=10&offset=0");
    expect(view.textContent).toContain("Showing 1 to 10 of 23");
    expect(view.textContent).toContain("connection refused");
  });
  test("an empty rule list explains what a rule does and that nothing is sent yet", async () => {
    install([[/rules$/, () => json({ rules: [] })], [/feed/, () => json({ deliveries: [], total: 0 })]]);
    const view = TT.alertsView();
    await flush();
    expect(view.textContent).toContain("Nothing is sent until you add one");
    expect(view.textContent).toContain("No deliveries yet");
  });
  test("Send a test reports the counts", async () => {
    const calls = install(alertRoutes([["/api/hub/alerts/test", () => json({ delivered: 1, failed: 0, blocked: 0 })]]));
    const view = TT.alertsView();
    await flush();
    buttonByText(view.querySelectorAll(".ui-item")[0], "Send a test").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/alerts/test").body).toEqual({ id: 1 });
    expect(toasts()).toContain("1 delivered, 0 failed, 0 blocked");
  });
  test("Remove asks first and says it cannot be undone; cancel sends nothing, confirm deletes", async () => {
    const calls = install(alertRoutes([[/rules\/1$/, () => json({ deleted: true })]]));
    const view = TT.alertsView();
    await flush();
    buttonByText(view.querySelectorAll(".ui-item")[0], "Remove").click();
    await tick();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    expect(dialog.textContent).toContain("cannot be undone");
    buttonByText(dialog, "Cancel").click();
    await flush();
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    buttonByText(view.querySelectorAll(".ui-item")[0], "Remove").click();
    await tick();
    buttonByText(dom.documentElement.querySelector(".ui-modal"), "Remove rule").click();
    await flush();
    expect(calls.find((c) => c.method === "DELETE").path).toBe("/api/hub/alerts/rules/1");
  });
  test("adding a rule needs a place to send to, then posts every field", async () => {
    const calls = install(alertRoutes());
    const view = TT.alertsView();
    await flush();
    buttonByText(view, "Add a rule").click();
    await tick();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    buttonByText(dialog, "Add rule").click();
    await flush();
    expect(toasts()).toContain("Say where the alert goes");
    const byLabel = (label) => dialog.querySelectorAll("input, select").find((el) => el.getAttribute("aria-label") === label);
    byLabel("Name (optional)").value = "Revokes";
    byLabel("Send to").value = "webhook";
    byLabel("File path or webhook address").value = "https://hook.example/a";
    byLabel("Signing secret (optional)").value = "s3cret";
    byLabel("Allow private addresses").checked = true;
    buttonByText(dialog, "Add rule").click();
    await flush();
    expect(calls.find((c) => c.method === "POST").body).toMatchObject({ name: "Revokes", event: "device.paired", target: "webhook", url: "https://hook.example/a", secret: "s3cret", countThreshold: 1, allowPrivate: true });
    expect(calls.find((c) => c.method === "POST").body.path).toBeUndefined();
  });
  test("Deliver due now runs the queue and reports", async () => {
    const calls = install(alertRoutes([["/api/hub/alerts/run", () => json({ delivered: 2, retried: 1, failed: 0 })]]));
    const view = TT.alertsView();
    await flush();
    buttonByText(view, "Deliver due now").click();
    await flush();
    expect(calls.some((c) => c.path === "/api/hub/alerts/run")).toBe(true);
    expect(toasts()).toContain("Delivered 2, retried 1, failed 0.");
  });
});

describe("T-217: team", () => {
  const TEAM = { id: "t1", name: "Core team", role: "editor", projects: ["shop"] };
  const teamRoutes = (extra = []) => [
    ...extra,
    [/^\/api\/hub\/team\/members/, () => json({ members: [{ name: "Sam", role: "editor", projects: ["shop"], revoked: false }, { name: "Lee", role: "viewer", projects: [], revoked: true }] })],
    [/^\/api\/hub\/team\/board/, () => json({ entries: [{ kind: "decision", text: "Use Postgres", author: { name: "Sam" }, at: new Date().toISOString() }] })],
    [/^\/api\/hub\/team\/brief/, () => json({ text: "# Brief\n**Shop** uses Postgres." })],
    [/^\/api\/hub\/team\/projects/, () => json({ ok: true })],
    [/^\/api\/hub\/team\/search/, () => json({ results: [{ project: "shop", text: "A shared note", source: "memory:4" }] })],
    [/^\/api\/hub\/team$/, (r) => (r.method === "POST" ? json({ id: "t2" }, 201) : json({ teams: [TEAM] }))],
  ];
  test("shows the team, its members, the board, the brief and the counts", async () => {
    fakeLocation("#/tools/team");
    install(teamRoutes());
    const view = TT.teamView();
    await flush();
    expect(view.textContent).toContain("Core team");
    expect(view.textContent).toContain("Sam");
    expect(view.textContent).toContain("revoked");
    expect(view.textContent).toContain("Use Postgres");
    expect(view.querySelector("strong")?.textContent).toBe("Shop");
    expect(view.querySelectorAll(".ui-stat").length).toBe(3);
  });
  test("no teams explains what a team is and offers Create", async () => {
    fakeLocation("#/tools/team");
    install([[/^\/api\/hub\/team$/, () => json({ teams: [] })]]);
    const view = TT.teamView();
    await flush();
    expect(view.textContent).toContain("No team yet");
    expect(view.textContent).toContain("shares chosen projects");
  });
  test("creating a team needs a name, then posts it", async () => {
    fakeLocation("#/tools/team");
    const calls = install(teamRoutes());
    const view = TT.teamView();
    await flush();
    buttonByText(view, "Create a team").click();
    await tick();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    buttonByText(dialog, "Create team").click();
    await flush();
    expect(toasts()).toContain("Type a name first.");
    dialog.querySelector("input").value = "Docs team";
    buttonByText(dialog, "Create team").click();
    await flush();
    expect(calls.find((c) => c.method === "POST" && c.path === "/api/hub/team").body).toEqual({ name: "Docs team" });
  });
  test("sharing a project posts it with the team id; a viewer cannot", async () => {
    fakeLocation("#/tools/team");
    const calls = install(teamRoutes());
    const view = TT.teamView();
    await flush();
    buttonByText(view, "Share a project").click();
    await tick();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    dialog.querySelector("input").value = "blog";
    buttonByText(dialog, "Share project").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/team/projects").body).toEqual({ team_id: "t1", project: "blog" });
    install([...teamRoutes().slice(0, -1), [/^\/api\/hub\/team$/, () => json({ teams: [{ ...TEAM, role: "viewer" }] })]]);
    fakeLocation("#/tools/team");
    const viewer = TT.teamView();
    await flush();
    expect(buttonByText(viewer, "Share a project").disabled).toBe(true);
  });
  test("the chosen team and project live in the address", async () => {
    const loc = fakeLocation("#/tools/team?team=t1&project=shop");
    const calls = install(teamRoutes());
    TT.teamView();
    await flush();
    expect(calls.find((c) => c.path.startsWith("/api/hub/team/board")).path).toBe("/api/hub/team/board?team_id=t1&project=shop");
    expect(calls.some((c) => c.path.startsWith("/api/hub/team/brief"))).toBe(true);
    expect(loc.hash).toBe("#/tools/team?team=t1&project=shop");
  });
  test("search needs words and lists the shared results", async () => {
    fakeLocation("#/tools/team");
    const calls = install(teamRoutes());
    const view = TT.teamView();
    await flush();
    buttonByText(view, "Search").click();
    await flush();
    expect(toasts()).toContain("Type something to search for.");
    view.querySelectorAll("input").find((i) => i.getAttribute("aria-label") === "Search shared memory").value = "note";
    buttonByText(view, "Search").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/team/search").body).toEqual({ team_id: "t1", query: "note" });
    expect(view.textContent).toContain("A shared note");
  });
});
