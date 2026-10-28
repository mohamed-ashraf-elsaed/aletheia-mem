// T-212: the first-run guide, with fake DOM and fake fetch.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let G;
let C;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 4; i += 1) await tick(); };
const waitUntil = async (predicate, { timeoutMs = 10_000, pollMs = 5 } = {}) => {
  const started = performance.now();
  while (!predicate()) {
    if (performance.now() - started > timeoutMs) throw new Error("condition not met before the deadline");
    await tick(pollMs);
  }
};
const json = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => data });

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  G ??= await import("../public/ui-guide.js");
  C.resetUi();
});
afterAll(() => restoreGlobals());

const tool = (id, name, extra = {}) => ({ id, name, installed: false, hooks: { present: 0, expected: 3 }, commands: { install: `aletheia install ${id} --write` }, ...extra });
const TOOLS = [tool("claude-code", "Claude Code"), tool("cursor", "Cursor", { installed: true })];
const step = (guide, n) => guide.querySelectorAll("li")[n - 1];

describe("T-212: when the guide shows", () => {
  test("only for a store with no memories and no facts", () => {
    expect(G.storeIsEmpty({ stats: { total: 0 }, facts: 0 })).toBe(true);
    expect(G.storeIsEmpty({ stats: {}, facts: 0 })).toBe(true);
    expect(G.storeIsEmpty({ stats: { total: 3 }, facts: 0 })).toBe(false);
    expect(G.storeIsEmpty({ stats: { total: 0 }, facts: 2 })).toBe(false);
  });
  test("hooks count as installed only when every expected hook is present", () => {
    expect(G.hooksInstalled([tool("a", "A", { hooks: { present: 3, expected: 3 } })], "a")).toBe(true);
    expect(G.hooksInstalled([tool("a", "A", { hooks: { present: 2, expected: 3 } })], "a")).toBe(false);
    expect(G.hooksInstalled([tool("a", "A", { hooks: { present: 0, expected: 0 } })], "a")).toBe(false);
    expect(G.hooksInstalled([], "a")).toBe(false);
  });
  test("a hidden guide is remembered, and blocked storage does not break", () => {
    expect(G.guideHidden({ getItem: () => "1" })).toBe(true);
    expect(G.guideHidden({ getItem: () => null })).toBe(false);
    expect(G.guideHidden({ getItem() { throw new Error("blocked"); } })).toBe(false);
  });
});

describe("T-212: the three steps", () => {
  test("shows three steps with the exact commands for the detected tool", () => {
    const guide = G.firstRunGuide({ tools: TOOLS, intervalMs: 0 });
    expect(guide.querySelectorAll("li").length).toBe(3);
    expect(guide.textContent).toContain("Install capture for your tool");
    expect(guide.textContent).toContain("Start a session");
    expect(guide.textContent).toContain("See it here");
    const commands = guide.querySelectorAll("code").map((c) => c.textContent);
    expect(commands).toEqual(["aletheia install cursor", "aletheia install cursor --write"]);
    expect(guide.querySelector("select").value).toBe("cursor");
    guide.dispose();
  });
  test("each command has a Copy button that copies exactly that text", async () => {
    const guide = G.firstRunGuide({ tools: TOOLS, intervalMs: 0 });
    dom.body.append(guide);
    guide.querySelectorAll("button").find((b) => b.getAttribute("aria-label") === "Copy the install command").click();
    await flush();
    expect(globalThis.navigator.clipboard.written).toEqual(["aletheia install cursor --write"]);
    guide.dispose();
  });
  test("choosing another tool changes the commands", () => {
    const guide = G.firstRunGuide({ tools: TOOLS, intervalMs: 0 });
    const select = guide.querySelector("select");
    select.value = "claude-code";
    select.dispatch("change", { target: select });
    expect(guide.querySelectorAll("code").map((c) => c.textContent)).toContain("aletheia install claude-code --write");
    guide.dispose();
  });
  test("with no tool list it still offers the Claude Code commands", () => {
    const guide = G.firstRunGuide({ tools: [], intervalMs: 0 });
    expect(guide.querySelectorAll("code").map((c) => c.textContent)).toContain("aletheia install claude-code --write");
    guide.dispose();
  });
  test("step 1 shows done when the hooks are already there; steps 2 and 3 wait", () => {
    const guide = G.firstRunGuide({ tools: [tool("cursor", "Cursor", { installed: true, hooks: { present: 3, expected: 3 } })], intervalMs: 0 });
    expect(step(guide, 1).classList.contains("is-done")).toBe(true);
    expect(step(guide, 2).classList.contains("is-done")).toBe(false);
    expect(step(guide, 3).classList.contains("is-done")).toBe(false);
    guide.dispose();
  });
  test("while waiting it says so, with a status role and a loader", () => {
    const guide = G.firstRunGuide({ tools: TOOLS, intervalMs: 0 });
    expect(guide.textContent).toContain("Waiting for the first event");
    expect(guide.querySelectorAll("[role=status]").length).toBeGreaterThan(0);
    expect(guide.querySelector(".ui-brain-loading")).not.toBeNull();
    guide.dispose();
  });
});

describe("T-212: waiting for the first event", () => {
  test("it flips to done the moment data arrives and then calls back once", async () => {
    let captured = false;
    let arrivedCalls = 0;
    const guide = G.firstRunGuide({ tools: TOOLS, intervalMs: 0, arrivedDelayMs: 30, onArrived: () => { arrivedCalls += 1; }, fetchState: async () => ({ captured, tool: "cursor", tools: TOOLS }) });
    await guide.poll();
    expect(guide.isArrived()).toBe(false);
    captured = true;
    await guide.poll();
    expect(guide.isArrived()).toBe(true);
    expect(guide.textContent).toContain("Your first memory arrived");
    expect(guide.textContent).toContain("Captured from cursor");
    for (const n of [1, 2, 3]) expect(step(guide, n).classList.contains("is-done")).toBe(true);
    expect(guide.textContent).not.toContain("Waiting for the first event");
    await tick(60);
    expect(arrivedCalls).toBe(1);
    await guide.poll();
    await tick(60);
    expect(arrivedCalls).toBe(1);
  });
  test("a poll that finds new hooks marks step 1 done without arriving", async () => {
    const guide = G.firstRunGuide({ tools: TOOLS, intervalMs: 0, fetchState: async () => ({ captured: false, tools: [tool("claude-code", "Claude Code"), tool("cursor", "Cursor", { installed: true, hooks: { present: 3, expected: 3 } })] }) });
    await guide.poll();
    expect(step(guide, 1).classList.contains("is-done")).toBe(true);
    expect(guide.isArrived()).toBe(false);
    guide.dispose();
  });
  test("a failing poll keeps waiting and does not throw", async () => {
    const guide = G.firstRunGuide({ tools: TOOLS, intervalMs: 0, fetchState: async () => { throw new Error("down"); } });
    await guide.poll();
    expect(guide.textContent).toContain("Waiting for the first event");
    guide.dispose();
  });
  test("the timer asks again and again until data arrives, and stops after dispose", async () => {
    let calls = 0;
    const guide = G.firstRunGuide({ tools: TOOLS, intervalMs: 20, fetchState: async () => { calls += 1; return { captured: false, tools: TOOLS }; } });
    await waitUntil(() => calls >= 3);
    guide.dispose();
    const seen = calls;
    await tick(80);
    expect(calls).toBe(seen);
  });
  test("the default check reads the overview, the doctor and the work overview", async () => {
    globalThis.fetch = async (path) => {
      if (path.startsWith("/api/hub/overview")) return json({ stats: { total: 0 } });
      if (path.startsWith("/api/hub/doctor")) return json({ tools: TOOLS });
      if (path.startsWith("/v1/work")) return json({ lastCapture: [{ tool: "cursor", at: new Date().toISOString(), count: 1 }] });
      return json({}, 404);
    };
    const guide = G.firstRunGuide({ tools: TOOLS, intervalMs: 0 });
    await guide.poll();
    expect(guide.isArrived()).toBe(true);
  });
  test("Hide this guide is offered while waiting and calls back", () => {
    let hidden = 0;
    const guide = G.firstRunGuide({ tools: TOOLS, intervalMs: 0, onHide: () => { hidden += 1; } });
    guide.querySelectorAll("button").find((b) => b.textContent === "Hide this guide").click();
    expect(hidden).toBe(1);
    guide.dispose();
  });
});
