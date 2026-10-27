// The Rules tab shows each rule's date, source and evidence, flags a rule to re-check with its reasons, lets you
// Confirm it (with Undo), filters to flagged rules, and says how many tools are out of sync. Fake DOM, fake fetch.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let RV;
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
}

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  RV ??= await import("../public/tabs/rules-views.js");
  C.resetUi();
  (await import("../public/ui-dom.js")).state.project = "";
  fakeLocation("#/rules");
});
afterAll(() => restoreGlobals());

const rule = (id, extra = {}) => ({
  id: `r${id}`, then: `Do thing ${id}`, when: "", enabled: true, scopeTier: "everywhere", scopeName: "Everywhere", tools: null, source: "you",
  createdAtEpoch: Date.parse("2026-08-03T10:00:00Z"), last_confirmed_epoch: Date.parse("2026-08-03T10:00:00Z"), age_days: 10, stale: false, reasons: [], evidence: [], ...extra,
});
const staleRule = (id, extra = {}) => rule(id, {
  stale: true, age_days: 120,
  reasons: [{ code: "evidence_fact_superseded", message: "Fact #4 behind this rule is superseded since 2026-10-01.", evidence: { kind: "fact", id: 4 } }],
  evidence: [{ kind: "fact", id: 4, at_epoch: Date.parse("2026-08-04T00:00:00Z"), quote: null, session_id: null }, { kind: "memory", id: 9, at_epoch: Date.parse("2026-08-05T00:00:00Z"), quote: "Use REST here", session_id: "s1" }],
  ...extra,
});
const base = (rules, extra = []) => [...extra, ["/api/hub/rules/diff", () => json({ outOfSync: 0, files: [] })], ["/api/hub/rules", () => json({ rules })]];
const toasts = () => dom.getElementById("ui-toasts");

describe("rule dates, source and evidence", () => {
  test("each rule shows added date, source, last confirmed and an evidence count with expandable evidence", async () => {
    install(base([staleRule(1)]));
    const view = RV.rulesView({ addRule() {} });
    await flush();
    const card = view.querySelector(".ui-item");
    expect(card.textContent).toContain("added 2026-08-03");
    expect(card.textContent).toContain("source: you");
    expect(card.textContent).toContain("last confirmed 2026-08-03");
    expect(card.textContent).toContain("2 evidence");
    const head = buttonByText(card, "Evidence (2)");
    expect(head).toBeTruthy();
    expect(head.getAttribute("aria-expanded")).toBe("false");
    head.click();
    await flush();
    expect(head.getAttribute("aria-expanded")).toBe("true");
    expect(card.textContent).toContain("memory #9 · 2026-08-05");
    expect(card.textContent).toContain("Use REST here");
  });

  test("a rule with no evidence says 0 evidence and has no evidence panel", async () => {
    install(base([rule(1)]));
    const view = RV.rulesView({ addRule() {} });
    await flush();
    const card = view.querySelector(".ui-item");
    expect(card.textContent).toContain("0 evidence");
    expect(buttonByText(card, "Evidence (0)")).toBeUndefined();
    expect(card.textContent).not.toContain("Re-check");
  });

  test("evidence text is plain text, never markup", async () => {
    install(base([staleRule(1, { evidence: [{ kind: "memory", id: 1, at_epoch: 0, quote: "<img src=x onerror=alert(1)>", session_id: null }] })]));
    const view = RV.rulesView({ addRule() {} });
    await flush();
    buttonByText(view, "Evidence (1)").click();
    await flush();
    expect(view.querySelectorAll("img").length).toBe(0);
    expect(view.textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("the Re-check badge, reasons and Confirm", () => {
  test("a stale rule shows a Re-check badge with its reasons and stays on", async () => {
    install(base([staleRule(1), rule(2)]));
    const view = RV.rulesView({ addRule() {} });
    await flush();
    const [first, second] = view.querySelectorAll(".ui-item");
    expect(first.textContent).toContain("Re-check");
    expect(first.textContent).toContain("Fact #4 behind this rule is superseded");
    expect(first.textContent).toContain("on");
    expect(second.textContent).not.toContain("Re-check");
    expect(view.textContent).toContain("1 rule to re-check");
  });

  test("Confirm clears the flag at once, posts to the confirm route, and Undo restores the earlier date", async () => {
    const calls = install(base([staleRule(1)], [["/api/hub/rules/r1/confirm", (r) => json(r.body?.restore ? { rule: staleRule(1) } : { rule: rule(1, { last_confirmed_epoch: Date.now() }), previousConfirmedEpoch: staleRule(1).last_confirmed_epoch })]]));
    const view = RV.rulesView({ addRule() {} });
    await flush();
    const card = view.querySelector(".ui-item");
    buttonByText(card, "Confirm").click();
    expect(card.textContent).not.toContain("Re-check");
    await flush();
    const confirms = calls.filter((c) => c.path === "/api/hub/rules/r1/confirm");
    expect(confirms.length).toBe(1);
    expect(confirms[0].method).toBe("POST");
    expect(toasts().textContent).toContain("Rule confirmed");
    buttonByText(toasts(), "Undo").click();
    await flush();
    const undo = calls.filter((c) => c.path === "/api/hub/rules/r1/confirm")[1];
    expect(undo.body.restore).toBe(staleRule(1).last_confirmed_epoch);
    expect(card.textContent).toContain("Re-check");
  });

  test("a failed Confirm rolls back and says so", async () => {
    install(base([staleRule(1)], [["/api/hub/rules/r1/confirm", () => json({ error: "disk full" }, 500)]]));
    const view = RV.rulesView({ addRule() {} });
    await flush();
    const card = view.querySelector(".ui-item");
    buttonByText(card, "Confirm").click();
    await flush();
    expect(card.textContent).toContain("Re-check");
    expect(toasts().textContent).toContain("Could not confirm this rule");
  });

  test("Retire reuses the turn-off route and keeps the rule", async () => {
    const calls = install(base([staleRule(1)], [["/api/hub/rules/r1/toggle", () => json({ rule: rule(1, { enabled: false }) })]]));
    const view = RV.rulesView({ addRule() {} });
    await flush();
    const card = view.querySelector(".ui-item");
    buttonByText(card, "Retire").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rules/r1/toggle").body).toEqual({ enabled: false });
    expect(toasts().textContent).toContain("kept, not deleted");
    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
  });

  test("Confirm and Retire are real buttons reachable by keyboard", async () => {
    install(base([staleRule(1)]));
    const view = RV.rulesView({ addRule() {} });
    await flush();
    for (const label of ["Confirm", "Retire"]) {
      const button = buttonByText(view, label);
      expect(button.tagName.toLowerCase()).toBe("button");
      expect(button.getAttribute("tabindex")).not.toBe("-1");
    }
  });
});

describe("the Re-check filter and the out-of-sync line", () => {
  test("the Re-check filter shows only flagged rules without another request", async () => {
    const calls = install(base([staleRule(1), rule(2), rule(3)]));
    const view = RV.rulesView({ addRule() {} });
    await flush();
    expect(view.querySelectorAll(".ui-item").length).toBe(3);
    const before = calls.length;
    const radio = view.querySelectorAll("[role=radio]").find((node) => node.textContent.trim() === "Re-check");
    expect(radio).toBeTruthy();
    radio.click();
    await flush();
    expect(view.querySelectorAll(".ui-item").length).toBe(1);
    expect(view.querySelector(".ui-item").textContent).toContain("Do thing 1");
    expect(calls.length).toBe(before);
  });

  test("it says how many tools are out of sync, and stays quiet when none are", async () => {
    install([["/api/hub/rules/diff", () => json({ outOfSync: 2, files: [] })], ["/api/hub/rules", () => json({ rules: [rule(1)] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    expect(view.textContent).toContain("2 tools out of sync");
    install(base([rule(1)]));
    const quiet = RV.rulesView({ addRule() {} });
    await flush();
    expect(quiet.textContent).not.toContain("out of sync");
  });

  test("a failing diff request does not break the list", async () => {
    install([["/api/hub/rules/diff", () => json({ error: "boom" }, 500)], ["/api/hub/rules", () => json({ rules: [rule(1)] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    expect(view.querySelectorAll(".ui-item").length).toBe(1);
    expect(view.textContent).not.toContain("out of sync");
  });
});

