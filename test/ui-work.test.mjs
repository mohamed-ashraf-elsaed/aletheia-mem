// T-215: the Work tab on the shared components, with fake DOM and fake fetch.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let W;
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
const sessionRow = (id) => ({ id: `s${id}`, project: "p", tool: "cursor", firstAt: new Date().toISOString(), lastAt: new Date().toISOString(), promptCount: 2, toolCount: 1, state: "finished", lastPrompt: `Prompt ${id}`, summary: id === 1 ? { text: "A summary", at: new Date().toISOString() } : null, factCount: id, href: `#/work/session/s${id}?project=p` });
const routesFor = (extra = []) => [
  ...extra,
  [/^\/v1\/work\/sessions/, () => json({ items: [sessionRow(1), sessionRow(2)], total: 42 })],
  [/^\/v1\/work\/goals/, () => json({ goals: [{ id: "0123456789abcdef", label: "Run the tests", count: 3, sessionCount: 2, projects: ["p"], lastSeen: new Date().toISOString(), pinned: false, quotes: [] }], dismissedGoals: [], total: 1 })],
  [/^\/v1\/work\?/, () => json(overview())],
  ["/api/hub/doctor", () => json({ tools: [] })],
];

describe("T-215: the overview", () => {
  test("asks for a small overview and one page of sessions and goals", async () => {
    const calls = install(routesFor());
    await W.renderWork();
    await flush();
    const paths = calls.map((c) => c.path);
    expect(paths).toContain("/v1/work?sessions=1&facts=8&review=6");
    expect(paths).toContain("/v1/work/sessions?limit=10&offset=0");
    expect(paths).toContain("/v1/work/goals?limit=5&offset=0");
    W.stopWorkRefresh();
  });
  test("shows the tiles, sessions with a pager, needs, recent facts and goals", async () => {
    install(routesFor());
    await W.renderWork();
    await flush();
    const root = dom.getElementById("ui-work");
    expect(root.querySelector("h1").textContent).toBe("Work");
    expect(root.querySelectorAll(".ui-stat").length).toBe(6);
    expect(root.querySelectorAll(".ui-session").length).toBe(2);
    expect(root.textContent).toContain("Showing 1 to 10 of 42");
    expect(root.querySelector(".ui-needs-slot").querySelectorAll(".ui-item").length).toBe(2);
    expect(root.querySelector(".ui-recent-slot").textContent).toContain("A recent fact");
    expect(root.querySelector(".ui-work-goals").textContent).toContain("Run the tests");
    W.stopWorkRefresh();
  });
  test("a session card links to its page and shows prompt and summary", async () => {
    install(routesFor());
    await W.renderWork();
    await flush();
    const card = dom.getElementById("ui-work").querySelectorAll(".ui-session")[0];
    expect(card.querySelector("a").getAttribute("href")).toBe("#/work/session/s1?project=p");
    expect(card.textContent).toContain("Prompt 1");
    expect(card.textContent).toContain("A summary");
    expect(card.textContent).toContain("Finished");
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
  test("at most six needs-you items are shown, with a count and links to the full pages", async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: 100 + i, type: "fact", itemId: i + 1, reason: "r", label: `Item ${i}`, project: "p" }));
    install([[/^\/v1\/work\?/, () => json(overview({ review: { pending: 9, items: many } }))], ...routesFor().slice(0, 2), ["/api/hub/doctor", () => json({ tools: [] })]]);
    await W.renderWork();
    await flush();
    const slot = dom.getElementById("ui-work").querySelector(".ui-needs-slot");
    expect(slot.querySelectorAll(".ui-item").length).toBe(6);
    expect(slot.textContent).toContain("Showing 6 of 10");
    expect(slot.querySelectorAll("a").map((a) => a.getAttribute("href"))).toContain("#/memory/review");
    W.stopWorkRefresh();
  });
  test("an empty hub shows the first-run guide, not made-up rows", async () => {
    install([[/^\/v1\/work\/sessions/, () => json({ items: [], total: 0 })], [/^\/v1\/work\/goals/, () => json({ goals: [], dismissedGoals: [], total: 0 })], [/^\/v1\/work\?/, () => json(overview({ empty: true, sessions: [], recentFacts: [], review: { pending: 0, items: [] }, ruleSuggestions: [], lastCapture: [] }))], ["/api/hub/doctor", () => json({ tools: [{ id: "claude-code", name: "Claude Code", installed: false, hooks: { present: 0, expected: 3 }, commands: { install: "aletheia install claude-code --write" } }] })]]);
    await W.renderWork();
    await flush();
    const root = dom.getElementById("ui-work");
    expect(root.querySelector(".ui-guide")).not.toBeNull();
    expect(root.textContent).toContain("aletheia install claude-code --write");
    expect(root.textContent).toContain("No sessions yet");
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
