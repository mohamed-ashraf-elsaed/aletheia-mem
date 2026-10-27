// T-218: the Work tab with request cards, and the older session page it still links to.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let W;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 8; i += 1) await tick(); };
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
  const loc = { hash: start, protocol: "http:", host: "x", history: [start], pops: [] };
  globalThis.location = loc;
  globalThis.history = { pushState: (_a, _b, hash) => { loc.hash = hash; loc.history.push(hash); }, replaceState: (_a, _b, hash) => { loc.hash = hash; } };
  globalThis.listeners = {};
  globalThis.addEventListener = (type, fn) => { (globalThis.listeners[type] ??= []).push(fn); };
  globalThis.removeEventListener = (type, fn) => { globalThis.listeners[type] = (globalThis.listeners[type] ?? []).filter((x) => x !== fn); };
  return loc;
}

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  W ??= await import("../public/tabs/work.js");
  C.resetUi();
  (await import("../public/ui-dom.js")).state.project = "";
  fakeLocation("#/work");
  const root = dom.createElement("div");
  root.setAttribute("id", "ui-work");
  dom.body.append(root);
});
afterAll(() => { W?.stopWorkRefresh(); restoreGlobals(); delete globalThis.listeners; });

const overview = (extra = {}) => ({ health: { status: "ok" }, mode: "code", empty: false, queue: { pending: 0, running: 0, failed: 0, done: 2, depth: 0 }, lastCapture: [{ tool: "cursor", at: new Date().toISOString(), count: 3 }], sessions: [{}], recentFacts: [{ id: 1, text: "A recent fact", project: "p", status: "active", confidence: 0.8, source: {} }], review: { pending: 2, items: [{ id: 11, type: "fact", itemId: 5, reason: "contradiction", label: "Two facts disagree", project: "p" }] }, ruleSuggestions: [{ id: 21, text: "Use pnpm", when: "", project: "p" }], dismissed: [], pinned: [], generatedAt: new Date().toISOString(), ...extra });
const IDS = ["0123456789abcdef", "fedcba9876543210"];
const requestRow = (n, extra = {}) => ({
  id: IDS[n - 1], project: "p", tool: n === 1 ? "cursor" : "codex", title: `Request ${n}`, status: n === 1 ? "Waiting on you" : "Shipped",
  goal: "build retry", stage: "build retry", progress: n === 1 ? 50 : 100,
  progressEvidence: { sessionCount: 2, completedSessions: n === 1 ? 1 : 2, completedSessionIds: [`s${n}`], factIds: [n], summaryIds: [n] },
  eta: n === 1 ? new Date(Date.now() + 3_600_000).toISOString() : null,
  etaEvidence: n === 1 ? { paceMs: 1_800_000, remainingSessions: 1 } : null,
  cameOutOfIt: n === 2 ? [{ kind: "pull", value: "#42", number: 42, url: "https://github.com/acme/shop/pull/42", evidenceId: 4, sessionId: "s2" }, { kind: "commit", value: "abc1234", sha: "abc1234", evidenceId: 2, sessionId: "s2" }, { kind: "branch", value: "feat/retry", name: "feat/retry", evidenceId: 3, sessionId: "s2" }] : [],
  outcome: { commits: n === 2 ? 1 : 0, pulls: n === 2 ? 1 : 0, branches: n === 2 ? 1 : 0 },
  startedAt: new Date(Date.now() - 7_200_000).toISOString(), runningTimeMs: 7_200_000,
  sessionCount: 2, promptCount: 3, toolCount: 4,
  evidence: { sessionIds: [`s${n}`, `s${n}b`], promptIds: [1], toolIds: [2] },
  ...extra,
});
const requestPage = (extra = {}) => ({ project: "all", filter: "all", sort: "newest", group: null, counts: { all: 2, needsYou: 1, shipped: 1, working: 0, idle: 0, waitingOnYou: 1, total: 2 }, requests: [requestRow(1), requestRow(2)], groups: null, dismissedRequests: [], empty: false, ...extra });
const goalRow = () => ({ id: "0123456789abcdef", label: "Run the tests", count: 3, sessionCount: 2, projects: ["p"], lastSeen: new Date().toISOString(), pinned: false, quotes: [] });
const routesFor = (extra = []) => [
  ...extra,
  [/^\/v1\/work\/requests\?/, () => json(requestPage())],
  [/^\/v1\/work\/goals/, () => json({ goals: [goalRow()], dismissedGoals: [], total: 1 })],
  [/^\/v1\/work\?/, () => json(overview())],
  ["/api/hub/doctor", () => json({ tools: [] })],
];

describe("T-218: the overview", () => {
  test("asks for a small overview, one page of requests and the goals", async () => {
    const calls = install(routesFor());
    await W.renderWork();
    await flush();
    const paths = calls.map((c) => c.path);
    expect(paths).toContain("/v1/work?sessions=1&facts=8&review=6");
    expect(paths).toContain("/v1/work/requests?filter=all&sort=newest&limit=10");
    expect(paths).toContain("/v1/work/goals?limit=5&offset=0");
    W.stopWorkRefresh();
  });
  test("shows the tiles, request cards, needs, recent facts and goals", async () => {
    install(routesFor());
    await W.renderWork();
    await flush();
    const root = dom.getElementById("ui-work");
    expect(root.querySelector("h1").textContent).toBe("Work");
    expect(root.querySelectorAll(".ui-stat").length).toBe(6);
    expect(root.querySelectorAll(".ui-request").length).toBe(2);
    expect(root.textContent).toContain("2 of 2 requests");
    expect(root.querySelector(".ui-needs-slot").querySelectorAll(".ui-item").length).toBe(2);
    expect(root.querySelector(".ui-recent-slot").textContent).toContain("A recent fact");
    expect(root.querySelector(".ui-work-goals").textContent).toContain("Run the tests");
    W.stopWorkRefresh();
  });
  test("a request card shows status, progress evidence, ETA and what came out of it", async () => {
    install(routesFor());
    await W.renderWork();
    await flush();
    const card = dom.getElementById("ui-work").querySelectorAll(".ui-request")[0];
    expect(card.textContent).toContain("Waiting on you");
    expect(card.textContent).toContain("50% · 1 of 2 sessions finished");
    expect(card.textContent).toContain("Estimated finish");
    expect(card.textContent).toContain("Progress evidence (3)");
    expect(card.querySelector("a").getAttribute("href")).toBe("#/work/request/0123456789abcdef");
    const shipped = dom.getElementById("ui-work").querySelectorAll(".ui-request")[1];
    expect(shipped.textContent).toContain("Came out of it (3)");
    expect(shipped.textContent).toContain("pull request: ");
    expect(shipped.querySelector('a[href="https://github.com/acme/shop/pull/42"]')).not.toBeNull();
    expect(shipped.textContent).toContain("No ETA yet");
    W.stopWorkRefresh();
  });
  test("the heuristic labels link to the UNVERIFIED note", async () => {
    install(routesFor());
    await W.renderWork();
    await flush();
    const links = dom.getElementById("ui-work").querySelectorAll(".ui-estimate");
    expect(links.length).toBeGreaterThan(1);
    for (const link of links) expect(link.getAttribute("href")).toContain("docs/tasks/unverified.md");
    W.stopWorkRefresh();
  });
  test("Accept on a review item hides it, posts, and Undo reopens it", async () => {
    const calls = install(routesFor([["/api/hub/review/11", () => json({ item: {} })]]));
    await W.renderWork();
    await flush();
    const card = dom.getElementById("ui-work").querySelector(".ui-needs-slot").querySelectorAll(".ui-item")[0];
    buttonByText(card, "Accept").click();
    await tick();
    expect(card.classList.contains("is-leaving")).toBe(true);
    await flush();
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.filter((c) => c.path === "/api/hub/review/11").map((c) => c.body.action)).toEqual(["accept", "reopen"]);
    W.stopWorkRefresh();
  });
  test("a failed action puts the card back and says why", async () => {
    install(routesFor([["/api/hub/review/11", () => json({ error: "locked" }, 500)]]));
    await W.renderWork();
    await flush();
    const card = dom.getElementById("ui-work").querySelector(".ui-needs-slot").querySelectorAll(".ui-item")[0];
    buttonByText(card, "Reject").click();
    await flush();
    await flush();
    expect(card.hidden).toBe(false);
    expect(toasts()).toContain("locked");
    W.stopWorkRefresh();
  });
  test("Dismiss hides a request first, posts, and Undo restores it", async () => {
    const calls = install(routesFor([["/api/hub/requests/0123456789abcdef", (r) => json({ id: IDS[0], action: r.body.action })]]));
    await W.renderWork();
    await flush();
    const card = dom.getElementById("ui-work").querySelectorAll(".ui-request")[0];
    buttonByText(card, "Dismiss").click();
    await tick();
    expect(card.classList.contains("is-leaving")).toBe(true);
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/requests/0123456789abcdef").body).toEqual({ action: "dismiss" });
    expect(toasts()).toContain("Nothing was deleted");
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    const actions = calls.filter((c) => c.path === "/api/hub/requests/0123456789abcdef").map((c) => c.body.action);
    expect(actions).toEqual(["dismiss", "restore"]);
    W.stopWorkRefresh();
  });
  test("a failed dismiss puts the card back and says why", async () => {
    install(routesFor([["/api/hub/requests/0123456789abcdef", () => json({ error: "locked" }, 500)]]));
    await W.renderWork();
    await flush();
    const card = dom.getElementById("ui-work").querySelectorAll(".ui-request")[0];
    buttonByText(card, "Dismiss").click();
    await flush();
    await flush();
    expect(card.hidden).toBe(false);
    expect(toasts()).toContain("locked");
    W.stopWorkRefresh();
  });
  test("a dismissed request is listed with Restore", async () => {
    const calls = install(routesFor([[/^\/v1\/work\/requests\?/, () => json(requestPage({ dismissedRequests: [requestRow(2, { status: "Idle" })] }))], ["/api/hub/requests/fedcba9876543210", (r) => json({ id: IDS[1], action: r.body.action })]]));
    await W.renderWork();
    await flush();
    const root = dom.getElementById("ui-work");
    expect(root.textContent).toContain("Dismissed requests (1)");
    buttonByText(root, "Restore").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/requests/fedcba9876543210").body).toEqual({ action: "restore" });
    W.stopWorkRefresh();
  });
  test("filter, sort and group controls refetch with the chosen values", async () => {
    const calls = install(routesFor());
    await W.renderWork();
    await flush();
    const root = dom.getElementById("ui-work");
    const group = root.querySelectorAll("select").find((s) => s.getAttribute("aria-label") === "Group");
    group.value = "tool";
    group.dispatch("change");
    await flush();
    expect(calls.some((c) => c.path.includes("group=tool"))).toBe(true);
    const sort = root.querySelectorAll("select").find((s) => s.getAttribute("aria-label") === "Sort");
    sort.value = "most-progress";
    sort.dispatch("change");
    await flush();
    expect(calls.some((c) => c.path.includes("sort=most-progress"))).toBe(true);
    W.stopWorkRefresh();
  });
  test("at most six needs-you items are shown, with a count and links to the full pages", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: 100 + i, type: "fact", itemId: i + 1, reason: "r", label: `Item ${i}`, project: "p" }));
    install([[/^\/v1\/work\/requests\?/, () => json(requestPage())], [/^\/v1\/work\?/, () => json(overview({ review: { pending: 9, items: many } }))], [/^\/v1\/work\/goals/, () => json({ goals: [], dismissedGoals: [], total: 0 })], ["/api/hub/doctor", () => json({ tools: [] })]]);
    await W.renderWork();
    await flush();
    const slot = dom.getElementById("ui-work").querySelector(".ui-needs-slot");
    expect(slot.querySelectorAll(".ui-item").length).toBe(6);
    expect(slot.textContent).toContain("Showing 6 of 10");
    expect(slot.querySelectorAll("a").map((a) => a.getAttribute("href"))).toContain("#/memory/review");
    W.stopWorkRefresh();
  });
  test("an empty hub shows the first-run guide, not made-up rows", async () => {
    install([[/^\/v1\/work\/requests\?/, () => json(requestPage({ requests: [], counts: { all: 0, needsYou: 0, shipped: 0, working: 0, idle: 0, waitingOnYou: 0, total: 0 }, empty: true }))], [/^\/v1\/work\/goals/, () => json({ goals: [], dismissedGoals: [], total: 0 })], [/^\/v1\/work\?/, () => json(overview({ empty: true, sessions: [], recentFacts: [], review: { pending: 0, items: [] }, ruleSuggestions: [], lastCapture: [] }))], ["/api/hub/doctor", () => json({ tools: [{ id: "claude-code", name: "Claude Code", installed: false, hooks: { present: 0, expected: 3 }, commands: { install: "aletheia install claude-code --write" } }] })]]);
    await W.renderWork();
    await flush();
    const root = dom.getElementById("ui-work");
    expect(root.querySelector(".ui-guide")).not.toBeNull();
    expect(root.textContent).toContain("aletheia install claude-code --write");
    expect(root.textContent).toContain("No requests yet");
    W.stopWorkRefresh();
  });
  test("goals page from the server and Pin is optimistic", async () => {
    const calls = install(routesFor([["/api/hub/goals/0123456789abcdef", () => json({ ok: true })]]));
    await W.renderWork();
    await flush();
    const goal = dom.getElementById("ui-work").querySelector(".ui-goal");
    buttonByText(goal, "Pin").click();
    await flush();
    expect(calls.find((c) => c.path.startsWith("/api/hub/goals/")).body).toEqual({ action: "pin" });
    expect(toasts()).toContain("Pinned");
    W.stopWorkRefresh();
  });
});

describe("T-215: refresh", () => {
  test("a change frame from the status bar refreshes the overview after a short pause", async () => {
    const calls = install(routesFor());
    await W.renderWork();
    await flush();
    const before = calls.filter((c) => c.path.startsWith("/v1/work?")).length;
    for (let i = 0; i < 3; i += 1) for (const fn of globalThis.listeners["aletheia:frame"] ?? []) fn({ detail: { kind: "session" } });
    await tick(650);
    expect(calls.filter((c) => c.path.startsWith("/v1/work?")).length).toBe(before + 1);
    W.stopWorkRefresh();
  });
  test("leaving the tab removes the listeners", async () => {
    install(routesFor());
    await W.renderWork();
    await flush();
    expect(globalThis.listeners["aletheia:frame"].length).toBe(1);
    W.stopWorkRefresh();
    expect(globalThis.listeners["aletheia:frame"].length).toBe(0);
  });
});

describe("T-218: one request", () => {
  const origin = { promptCount: 2, factCount: 1, sessions: [{ sessionId: "s1", project: "p", firstAt: new Date().toISOString(), lastAt: new Date().toISOString(), ended: new Date().toISOString(), prompts: [{ id: 1, text: "Please retry", at: new Date().toISOString() }], facts: [{ id: 9, text: "Retries twice", status: "active", recordedAt: new Date().toISOString() }] }] };
  test("opens from the address and shows where this came from, with a session link", async () => {
    fakeLocation("#/work/request/0123456789abcdef");
    const calls = install([[/^\/v1\/work\/requests\/0123456789abcdef/, () => json({ request: { ...requestRow(1), whereThisCameFrom: origin } })]]);
    await W.renderWork();
    await flush();
    expect(calls[0].path).toBe("/v1/work/requests/0123456789abcdef");
    const root = dom.getElementById("ui-work");
    expect(root.textContent).toContain("Request 1");
    expect(root.textContent).toContain("Where this came from (2 prompts, 1 facts)");
    expect(root.textContent).toContain("Please retry");
    expect(root.textContent).toContain("Retries twice");
    expect(root.querySelectorAll("a").map((a) => a.getAttribute("href"))).toContain("#/work/session/s1?project=p");
    expect(root.querySelectorAll("a").map((a) => a.getAttribute("href"))).toContain("#/work");
  });
  test("an unknown request shows the error with Retry", async () => {
    fakeLocation("#/work/request/0123456789abcdef");
    install([[/^\/v1\/work\/requests\/0123456789abcdef/, () => json({ error: "No request has that id." }, 404)]]);
    await W.renderWork();
    await flush();
    expect(dom.getElementById("ui-work").textContent).toContain("No request has that id.");
    expect(buttonByText(dom.getElementById("ui-work"), "Retry")).toBeTruthy();
  });
});

describe("T-215: one session", () => {
  test("shows the summary, the timeline in order, and the facts, and links back", async () => {
    fakeLocation("#/work/session/s1?project=p");
    const calls = install([["/v1/work/session/s1", () => json({ session: { id: "s1", project: "p", tool: "cursor", firstAt: new Date().toISOString(), lastAt: new Date().toISOString(), promptCount: 1, toolCount: 1, summary: { text: "Fixed **retry**", at: new Date().toISOString() }, timeline: [{ id: 1, kind: "prompt", at: new Date(Date.now() - 60_000).toISOString(), text: "Please retry", tool: "cursor" }, { id: 2, kind: "tool", at: new Date().toISOString(), text: "Edit file", tool: "cursor", source: "memory:2" }], facts: [{ id: 9, text: "Retries twice", status: "active", confidence: 0.8, source: {} }] } })]]);
    await W.renderWork();
    await flush();
    expect(calls[0].path).toBe("/v1/work/session/s1?project=p");
    const root = dom.getElementById("ui-work");
    expect(root.textContent).toContain("Session s1");
    expect(root.querySelector("strong")?.textContent).toBe("retry");
    expect(root.querySelectorAll(".ui-timeline-item").length).toBe(2);
    expect(root.textContent).toContain("Retries twice");
    expect(root.querySelectorAll("a").map((a) => a.getAttribute("href"))).toContain("#/work");
  });
  test("an unknown session shows the error with Retry", async () => {
    fakeLocation("#/work/session/nope");
    install([["/v1/work/session/nope", () => json({ error: "No session has that id." }, 404)]]);
    await W.renderWork();
    await flush();
    expect(dom.getElementById("ui-work").textContent).toContain("No session has that id.");
    expect(buttonByText(dom.getElementById("ui-work"), "Retry")).toBeTruthy();
  });
});
