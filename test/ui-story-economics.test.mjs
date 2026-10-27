// T-221: the build story and context economics panels.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let STORY;
let ECON;
let CORE;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 8; i += 1) await tick(); };
const json = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => data });

function install(routes) {
  const calls = [];
  globalThis.fetch = async (path, init = {}) => {
    calls.push({ path, method: init.method ?? "GET" });
    for (const [pattern, handler] of routes) if (typeof pattern === "string" ? path.startsWith(pattern) : pattern.test(path)) return handler();
    return json({ error: `unrouted ${path}` }, 404);
  };
  return calls;
}
function fakeLocation(hash) {
  const loc = { hash, protocol: "http:", host: "x" };
  globalThis.location = loc;
  globalThis.history = { pushState: () => {}, replaceState: () => {} };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  return loc;
}

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  STORY ??= await import("../public/tabs/work-story.js");
  ECON ??= await import("../public/tabs/memory-economics.js");
  CORE ??= await import("../public/ui-core.js");
  C.resetUi();
  (await import("../public/ui-dom.js")).state.project = "";
  fakeLocation("#/work");
});
afterAll(() => restoreGlobals());

const story = (extra = {}) => ({
  project: "shop", generatedAt: new Date().toISOString(),
  counts: { shipped: 1, working: 1, waitingOnYou: 2, idle: 1, total: 5 },
  velocity: { totalShipped: 1, averageDaysToShip: 0.5, perWeek: [{ week: "2026-W44", shipped: 1 }] },
  learned: [{
    text: "Use pnpm, not npm", timesSeen: 2, latestAt: "2026-10-26T11:15:00.000Z",
    quotes: [
      { text: "Use pnpm, not npm.", at: "2026-10-26T10:35:00.000Z" },
      { text: "No, use pnpm instead of npm.", at: "2026-10-26T11:15:00.000Z" },
      { text: "Please use pnpm.", at: "2026-10-25T09:00:00.000Z" },
    ],
  }],
  empty: false, ...extra,
});

const economics = (extra = {}) => ({
  project: "shop", generatedAt: new Date().toISOString(), counter: "estimateTokens: ceil(text.length / 4)",
  observations: [{
    id: 17, project: "shop", kind: "observation", title: "Retry notes", text: "The retry button waits for the request.",
    readTokens: 28, workTokens: null, workTokensSource: "usage is recorded per extraction call, not per observation",
    at: "2026-10-26T11:15:00.000Z",
  }],
  totals: { observations: 1, readTokens: 28, workTokens: 1500, workTokensSource: "fact_usage input + output tokens", savingsPercent: 97 },
  empty: false, ...extra,
});

describe("T-221: the build story", () => {
  test("shows counts, velocity and learned habits with dated quotes", async () => {
    const calls = install([[/^\/v1\/work\/story/, () => json(story())]]);
    const view = STORY.storyView();
    await flush();
    expect(calls[0].path).toBe("/v1/work/story");
    expect(view.querySelectorAll(".ui-stat").length).toBe(6);
    expect(view.textContent).toContain("2026-W44: 1 shipped");
    expect(view.textContent).toContain("0.5 average days to ship");
    expect(view.textContent).toContain("Use pnpm, not npm");
    expect(view.textContent).toContain("2× seen");
    expect(view.textContent).toContain("Use pnpm, not npm.");
    expect(view.textContent).toContain("No, use pnpm instead of npm.");
    expect(view.textContent).toContain("More quotes (1)");
    expect(view.textContent).toContain("Please use pnpm.");
    expect(view.querySelectorAll(".ui-estimate").length).toBeGreaterThan(0);
  });
  test("a missing average says n/a instead of a number", async () => {
    install([[/^\/v1\/work\/story/, () => json(story({ velocity: { totalShipped: 0, averageDaysToShip: null, perWeek: [] } }))]]);
    const view = STORY.storyView();
    await flush();
    expect(view.textContent).toContain("average days to ship: n/a");
    expect(view.textContent).toContain("No shipped week is recorded yet.");
  });
  test("an empty story says so", async () => {
    install([[/^\/v1\/work\/story/, () => json({ counts: { total: 0 }, velocity: { perWeek: [] }, learned: [], empty: true })]]);
    const view = STORY.storyView();
    await flush();
    expect(view.textContent).toContain("No story yet");
  });
});

describe("T-221: context economics", () => {
  test("shows the totals, the counter and one row per context memory", async () => {
    const calls = install([[/^\/v1\/context\/economics/, () => json(economics())]]);
    const view = ECON.economicsView();
    await flush();
    expect(calls[0].path).toBe("/v1/context/economics?limit=50");
    expect(view.textContent).toContain("Observations");
    expect(view.textContent).toContain("read tokens: 28");
    expect(view.textContent).toContain("1,500");
    expect(view.textContent).toContain("Work tokens");
    expect(view.textContent).toContain("97%");
    expect(view.textContent).toContain("estimateTokens: ceil(text.length / 4)");
    expect(view.textContent).toContain("Retry notes");
    expect(view.textContent).toContain("work tokens: n/a");
    expect(view.textContent).toContain("usage is recorded per extraction call, not per observation");
  });
  test("a null work-token total is n/a with its reason, never zero", async () => {
    install([[/^\/v1\/context\/economics/, () => json(economics({ totals: { observations: 1, readTokens: 28, workTokens: null, workTokensSource: "no usage record", savingsPercent: null } }))]]);
    const view = ECON.economicsView();
    await flush();
    expect(view.textContent).toContain("no usage record");
    expect(view.textContent).toContain("n/a");
    expect(view.textContent).not.toContain("0%");
    expect(view.textContent).toContain("no measured reduction");
  });
  test("formatTokens never turns null into zero", () => {
    expect(ECON.formatTokens(null)).toBe("n/a");
    expect(ECON.formatTokens(undefined)).toBe("n/a");
    expect(ECON.formatTokens(0)).toBe("0");
    expect(ECON.formatTokens(1500)).toBe("1,500");
  });
  test("Memory has an Economics page", () => {
    expect(CORE.SUBVIEWS.memory.map((item) => item.id)).toContain("economics");
  });
});
