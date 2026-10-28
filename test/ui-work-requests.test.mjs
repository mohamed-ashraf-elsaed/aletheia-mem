// the request views on their own, with fake DOM and fake fetch.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let R;
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

const ID = "0123456789abcdef";
const request = (extra = {}) => ({
  id: ID, project: "shop", tool: "cursor", title: "Build a retry button", status: "Waiting on you", goal: "build retry",
  progress: 50, progressEvidence: { sessionCount: 2, completedSessions: 1, completedSessionIds: ["s1"], factIds: [3], summaryIds: [4] },
  eta: new Date(Date.now() + 3_600_000).toISOString(), etaEvidence: { paceMs: 1_800_000, remainingSessions: 1 },
  cameOutOfIt: [{ kind: "commit", value: "abc1234", evidenceId: 2, sessionId: "s1" }, { kind: "branch", value: "feat/retry", name: "feat/retry", evidenceId: 3, sessionId: "s1" }],
  startedAt: new Date(Date.now() - 3_600_000).toISOString(), runningTimeMs: 3_600_000, sessionCount: 2, promptCount: 2, toolCount: 3,
  evidence: { sessionIds: ["s1", "s2"] }, ...extra,
});

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  R ??= await import("../public/tabs/work-requests.js");
  C.resetUi();
  (await import("../public/ui-dom.js")).state.project = "";
  fakeLocation("#/work");
});
afterAll(() => restoreGlobals());

describe("request helpers", () => {
  test("a request route is 16 hex digits and nothing else", () => {
    fakeLocation(`#/work/request/${ID}`);
    expect(R.requestRoute()).toEqual({ id: ID, project: "" });
    fakeLocation("#/work/request/not-a-request");
    expect(R.requestRoute()).toBeNull();
    fakeLocation("#/work/session/s1");
    expect(R.requestRoute()).toBeNull();
  });
  test("durations read as words, and a missing time says unknown", () => {
    expect(R.durationLabel(30_000)).toBe("under a minute");
    expect(R.durationLabel(90 * 60_000)).toBe("1 h 30 min");
    expect(R.durationLabel(2 * 86_400_000)).toBe("2 days");
    expect(R.durationLabel(null)).toBe("unknown");
  });
  test("only http links are links; anything else stays text", () => {
    const host = dom.createElement("div");
    host.append(R.artifactList([{ kind: "pull", value: "#42", url: "https://github.com/a/b/pull/42", evidenceId: 4 }, { kind: "branch", value: "feat/x", name: "feat/x", evidenceId: 5 }, { kind: "commit", value: "abc1234", url: "javascript:alert(1)", evidenceId: 6 }]));
    expect(host.querySelectorAll("a").length).toBe(1);
    expect(host.querySelector("a").getAttribute("href")).toBe("https://github.com/a/b/pull/42");
    expect(host.textContent).toContain("evidence 6");
  });
  test("no artifacts says so instead of showing an empty box", () => {
    expect(R.artifactList([]).textContent).toContain("Nothing recorded yet");
  });
});

describe("the request list", () => {
  test("loads one page with the filter, sort and limit, and prints the counts", async () => {
    const calls = install([[/^\/v1\/work\/requests\?/, () => json({ counts: { all: 2, needsYou: 1, shipped: 1, working: 0, idle: 0, waitingOnYou: 1, total: 2 }, requests: [request(), request({ id: "fedcba9876543210", title: "Second", status: "Shipped", eta: null, etaEvidence: null, cameOutOfIt: [] })], dismissedRequests: [] })]]);
    const view = R.requestsView();
    await flush();
    expect(calls[0].path).toBe("/v1/work/requests?filter=all&sort=newest&limit=10");
    expect(view.querySelectorAll(".ui-request").length).toBe(2);
    expect(view.textContent).toContain("2 of 2 requests");
    expect(view.textContent).toContain("1 need you");
    expect(view.textContent).toContain("1 shipped");
  });
  test("group=tool renders one heading per tool", async () => {
    install([[/^\/v1\/work\/requests\?/, (r) => json({ group: "tool", counts: { all: 2 }, requests: [request(), request({ id: "fedcba9876543210", tool: "codex" })], groups: [{ key: "cursor", label: "cursor", count: 1, requests: [request()] }, { key: "codex", label: "codex", count: 1, requests: [request({ id: "fedcba9876543210", tool: "codex" })] }], dismissedRequests: [] })]]);
    const view = R.requestsView();
    await flush();
    const group = view.querySelectorAll("select").find((s) => s.getAttribute("aria-label") === "Group");
    group.value = "tool";
    group.dispatch("change");
    await flush();
    expect(view.querySelectorAll(".ui-subhead").map((h) => h.textContent)).toEqual(["cursor (1)", "codex (1)"]);
    expect(view.querySelectorAll(".ui-request").length).toBe(2);
  });
  test("dismiss is optimistic and Undo restores", async () => {
    const calls = install([
      [/^\/v1\/work\/requests\?/, () => json({ counts: { all: 1 }, requests: [request()], dismissedRequests: [] })],
      [`/api/hub/requests/${ID}`, (r) => json({ id: ID, action: r.body.action })],
    ]);
    const view = R.requestsView();
    await flush();
    const card = view.querySelector(".ui-request");
    buttonByText(card, "Dismiss").click();
    await tick();
    expect(card.classList.contains("is-leaving")).toBe(true);
    await flush();
    expect(calls.find((c) => c.path === `/api/hub/requests/${ID}`).body).toEqual({ action: "dismiss" });
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.filter((c) => c.path === `/api/hub/requests/${ID}`).map((c) => c.body.action)).toEqual(["dismiss", "restore"]);
  });
  test("the empty state says what a request is", async () => {
    install([[/^\/v1\/work\/requests\?/, () => json({ counts: { all: 0 }, requests: [], dismissedRequests: [] })]]);
    const view = R.requestsView();
    await flush();
    expect(view.textContent).toContain("No requests yet");
  });
});

describe("the request detail", () => {
  test("shows where it came from, the artifact links and a link to each session", async () => {
    const origin = { promptCount: 1, factCount: 1, sessions: [{ sessionId: "s1", project: "shop", firstAt: new Date().toISOString(), lastAt: new Date().toISOString(), ended: new Date().toISOString(), prompts: [{ id: 1, text: "Please retry", at: new Date().toISOString() }], facts: [{ id: 9, text: "Retries twice", status: "active", recordedAt: new Date().toISOString() }] }] };
    const calls = install([[/^\/v1\/work\/requests\/0123456789abcdef/, () => json({ request: request({ whereThisCameFrom: origin }) })]]);
    const page = R.requestDetailPage({ id: ID, project: "shop" });
    await flush();
    expect(calls[0].path).toBe(`/v1/work/requests/${ID}?project=shop`);
    expect(page.textContent).toContain("Build a retry button");
    expect(page.textContent).toContain("Where this came from (1 prompts, 1 facts)");
    expect(page.textContent).toContain("Please retry");
    expect(page.textContent).toContain("Retries twice");
    expect(page.querySelectorAll("a").map((a) => a.getAttribute("href"))).toContain("#/work/session/s1?project=shop");
    expect(page.querySelectorAll(".ui-estimate").length).toBeGreaterThan(1);
  });
  test("the dismiss button posts and returns to the Work page", async () => {
    const calls = install([[/^\/v1\/work\/requests\/0123456789abcdef/, () => json({ request: request() })], [`/api/hub/requests/${ID}`, (r) => json({ id: ID, action: r.body.action })]]);
    const page = R.requestDetailPage({ id: ID, project: "" });
    await flush();
    buttonByText(page, "Dismiss this request").click();
    await flush();
    expect(calls.find((c) => c.path === `/api/hub/requests/${ID}`).body).toEqual({ action: "dismiss" });
    expect(globalThis.location.hash).toBe("#/work");
  });
});
