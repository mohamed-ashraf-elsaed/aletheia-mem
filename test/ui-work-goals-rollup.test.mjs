// the goals roll-up in the Work tab.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let G;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 8; i += 1) await tick(); };
const json = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => data });
const buttonByText = (root, text) => root.querySelectorAll("button").find((b) => b.textContent.trim() === text);

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
function fakeLocation(hash) {
  const loc = { hash, protocol: "http:", host: "x" };
  globalThis.location = loc;
  globalThis.history = { pushState: (_a, _b, next) => { loc.hash = next; }, replaceState: (_a, _b, next) => { loc.hash = next; } };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  return loc;
}

const goal = (id, extra = {}) => ({ id, label: `Ship ${id}`, object: `ship ${id}`, status: "Moving", count: 3, sessionCount: 2, projects: ["shop"], lastSeen: new Date().toISOString(), pinned: false, quotes: [], aggregateProgress: 50, requestCount: 1, workingCount: 1, waitingCount: 0, shippedCount: 0, requests: [{ id: "0123456789abcdef", title: "Build retry", status: "Working", progress: 50, project: "shop", startedAt: new Date().toISOString(), goalKey: "build retry" }], whatCameOutOfIt: [{ kind: "commit", value: "abc1234", evidenceId: 2, sessionId: "s1" }], ...extra });
const rollup = (extra = {}) => ({ project: "all", goals: [goal("aaaaaaaaaaaaaaaa", { label: "Ship checkout", aggregateProgress: 100, status: "Moving" }), goal("bbbbbbbbbbbbbbbb", { label: "Fix queue", object: "fix queue", status: "Stalled", aggregateProgress: 0, requestCount: 0, requests: [] })], total: 2, dismissedGoals: [], noGoal: { count: 1, requests: [{ id: "fedcba9876543210", title: "Loose ends", status: "Waiting on you", progress: 0 }] }, openAsks: { total: 2, beingWorked: [{ id: "aaaaaaaaaaaaaaaa", label: "Ship checkout", object: "ship checkout", count: 3, sessionCount: 2 }], nothingWorking: [{ id: "bbbbbbbbbbbbbbbb", label: "Fix queue", object: "fix queue", count: 1, sessionCount: 1 }] }, empty: false, ...extra });

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  G ??= await import("../public/tabs/work-goals.js");
  C.resetUi();
  (await import("../public/ui-dom.js")).state.project = "";
  fakeLocation("#/work");
});
afterAll(() => restoreGlobals());

describe("the goals roll-up", () => {
  test("shows the roll-up, the open-ask split and the no-goal bucket", async () => {
    install([[/^\/v1\/work\/goals\?/, () => json(rollup())]]);
    const view = G.goalsRollupView();
    await flush();
    expect(view.textContent).toContain("Roll-up");
    expect(view.textContent).toContain("Open asks");
    expect(view.textContent).toContain("Being worked (1)");
    expect(view.textContent).toContain("Nothing working (1)");
    expect(view.textContent).toContain("ship checkout");
    expect(view.textContent).toContain("fix queue");
    expect(view.textContent).toContain("No goal (1)");
    expect(view.querySelectorAll('a[href="#/work/request/fedcba9876543210"]').length).toBe(1);
    expect(view.textContent).toContain("50% mean progress on this page");
    expect(view.querySelectorAll(".ui-estimate").length).toBeGreaterThan(0);
  });
  test("a goal card shows its status, aggregate progress, requests and artifacts", async () => {
    install([[/^\/v1\/work\/goals\?/, () => json(rollup())]]);
    const view = G.goalsRollupView();
    await flush();
    const card = view.querySelectorAll(".ui-goal")[0];
    expect(card.textContent).toContain("Ship checkout");
    expect(card.textContent).toContain("Moving");
    expect(card.textContent).toContain("100% across 1 request");
    expect(card.querySelectorAll('a[href="#/work/request/0123456789abcdef"]').length).toBe(1);
    expect(card.textContent).toContain("commit: abc1234");
  });
  test("Pin is optimistic and Undo unpins through the old goal route", async () => {
    const calls = install([[/^\/v1\/work\/goals\?/, () => json(rollup())], ["/api/hub/goals/aaaaaaaaaaaaaaaa", (r) => json({ id: "aaaaaaaaaaaaaaaa", action: r.body.action })]]);
    const view = G.goalsRollupView();
    await flush();
    const card = view.querySelectorAll(".ui-goal")[0];
    buttonByText(card, "Pin").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/goals/aaaaaaaaaaaaaaaa").body).toEqual({ action: "pin" });
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.filter((c) => c.path === "/api/hub/goals/aaaaaaaaaaaaaaaa").map((c) => c.body.action)).toEqual(["pin", "unpin"]);
  });
  test("Dismiss hides the goal first and Undo restores it", async () => {
    const calls = install([[/^\/v1\/work\/goals\?/, () => json(rollup())], ["/api/hub/goals/bbbbbbbbbbbbbbbb", (r) => json({ id: "bbbbbbbbbbbbbbbb", action: r.body.action })]]);
    const view = G.goalsRollupView();
    await flush();
    const card = view.querySelectorAll(".ui-goal")[1];
    buttonByText(card, "Dismiss").click();
    await tick();
    expect(card.classList.contains("is-leaving")).toBe(true);
    await flush();
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.filter((c) => c.path === "/api/hub/goals/bbbbbbbbbbbbbbbb").map((c) => c.body.action)).toEqual(["dismiss", "restore"]);
  });
  test("dismissed goals are listed with Restore", async () => {
    install([[/^\/v1\/work\/goals\?/, () => json(rollup({ dismissedGoals: [goal("cccccccccccccccc", { dismissed: true, label: "Old goal" })] }))]]);
    const view = G.goalsRollupView();
    await flush();
    expect(view.textContent).toContain("Dismissed goals (1)");
    expect(buttonByText(view, "Restore")).toBeTruthy();
  });
  test("the empty state explains how a goal appears", async () => {
    install([[/^\/v1\/work\/goals\?/, () => json({ goals: [], total: 0, dismissedGoals: [], noGoal: { count: 0, requests: [] }, openAsks: { total: 0, beingWorked: [], nothingWorking: [] } })]]);
    const view = G.goalsRollupView();
    await flush();
    expect(view.textContent).toContain("No repeated topics yet");
  });
});
