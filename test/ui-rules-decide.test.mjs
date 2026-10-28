// rule strength, evidence, the decide flow, the on/off toggle, replacement and the learning run.
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
  return loc;
}

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  RV ??= await import("../public/tabs/rules-views.js");
  C.resetUi();
  (await import("../public/ui-dom.js")).state.project = "";
  fakeLocation("#/rules/suggestions");
});
afterAll(() => restoreGlobals());

const rule = (extra = {}) => ({ id: "r1", then: "Use pnpm", when: "", enabled: true, scopeTier: "everywhere", scopeName: "Everywhere", tools: null, source: "manual", ...extra });
const suggestion = (extra = {}) => ({
  id: 7, project: "shop", text: "Use pnpm, not npm", when: "", confidence: 0.8, status: "pending", sourceType: "prompt",
  createdAt: new Date().toISOString(), timesSeen: 6, strength: "Strong", latestAt: new Date().toISOString(), moreQuotes: 2,
  quotes: [
    { id: 1, text: "No, use pnpm instead of npm.", at: "2026-10-26T11:15:00.000Z", sessionId: "s2" },
    { id: 2, text: "Use pnpm, not npm.", at: "2026-10-26T10:35:00.000Z", sessionId: "s1" },
    { id: 3, text: "Please use pnpm.", at: "2026-10-25T09:00:00.000Z", sessionId: "s0" },
    { id: 4, text: "Always pnpm.", at: "2026-10-24T09:00:00.000Z", sessionId: "s0" },
  ],
  ...extra,
});

describe("suggestion strength and evidence", () => {
  test("shows strength, times seen, the latest date and the first two dated quotes", async () => {
    install([[/rule-suggestions\?/, () => json({ items: [suggestion()], total: 1 })], ["/api/hub/rules/learning-run", () => json({ learningRun: null })]]);
    const view = RV.suggestionsView({});
    await flush();
    const card = view.querySelector(".ui-item");
    expect(card.textContent).toContain("strength: Strong");
    expect(card.textContent).toContain("6× seen");
    expect(card.textContent).toContain("last seen");
    expect(card.textContent).toContain("No, use pnpm instead of npm.");
    expect(card.textContent).toContain("Use pnpm, not npm.");
    expect(card.textContent).toContain("More quotes (2)");
    expect(card.textContent).toContain("Please use pnpm.");
    expect(card.querySelector(".ui-estimate").getAttribute("href")).toContain("docs/32-requests.md");
  });
  test("Approve posts approve and Undo restores and turns the new rule off", async () => {
    const calls = install([
      [/rule-suggestions\?/, () => json({ items: [suggestion()], total: 1 })],
      ["/api/hub/rule-suggestions/7", (r) => json(r.body.action === "approve" ? { status: "accepted", ruleId: "r77" } : { status: "pending" })],
      ["/api/hub/rules/r77/toggle", () => json({ rule: { id: "r77", enabled: false } })],
      ["/api/hub/rules/learning-run", () => json({ learningRun: null })],
    ]);
    const view = RV.suggestionsView({});
    await flush();
    buttonByText(view.querySelector(".ui-item"), "Approve").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rule-suggestions/7").body).toEqual({ action: "approve" });
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.filter((c) => c.path === "/api/hub/rule-suggestions/7").map((c) => c.body.action)).toEqual(["approve", "restore"]);
    expect(calls.find((c) => c.path === "/api/hub/rules/r77/toggle").body).toEqual({ enabled: false });
  });
  test("Edit posts the edited text with action edit and closes the dialog", async () => {
    const calls = install([
      [/rule-suggestions\?/, () => json({ items: [suggestion()], total: 1 })],
      ["/api/hub/rule-suggestions/7", (r) => json({ status: "accepted", ruleId: "r88", text: r.body.text })],
      ["/api/hub/rules/learning-run", () => json({ learningRun: null })],
    ]);
    const view = RV.suggestionsView({});
    await flush();
    buttonByText(view.querySelector(".ui-item"), "Edit").click();
    await flush();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    expect(dialog.textContent).toContain("Edit before approving");
    dialog.querySelector("textarea").value = "Use pnpm, never npm.";
    buttonByText(dialog, "Save and approve").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rule-suggestions/7").body).toEqual({ action: "edit", text: "Use pnpm, never npm." });
  });
  test("Reject posts reject and offers Undo", async () => {
    const calls = install([
      [/rule-suggestions\?/, () => json({ items: [suggestion()], total: 1 })],
      ["/api/hub/rule-suggestions/7", (r) => json({ status: r.body.action === "reject" ? "dismissed" : "pending" })],
      ["/api/hub/rules/learning-run", () => json({ learningRun: null })],
    ]);
    const view = RV.suggestionsView({});
    await flush();
    buttonByText(view.querySelector(".ui-item"), "Reject").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rule-suggestions/7").body).toEqual({ action: "reject" });
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.filter((c) => c.path === "/api/hub/rule-suggestions/7").map((c) => c.body.action)).toEqual(["reject", "restore"]);
  });
});

describe("rules, toggle, replace and the learning run", () => {
  test("Turn off posts to /toggle and Undo posts the reverse", async () => {
    const calls = install([["/api/hub/rules/r1/toggle", (r) => json({ rule: { ...rule(), ...r.body } })], ["/api/hub/rules", () => json({ rules: [rule()] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    buttonByText(view.querySelector(".ui-item"), "Turn off").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rules/r1/toggle").method).toBe("POST");
    expect(calls.find((c) => c.path === "/api/hub/rules/r1/toggle").body).toEqual({ enabled: false });
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.filter((c) => c.path === "/api/hub/rules/r1/toggle").map((c) => c.body.enabled)).toEqual([false, true]);
  });
  test("Replace explains itself, posts the new text and reports the new rule", async () => {
    const calls = install([["/api/hub/rules/r1/replace", (r) => json({ replacedId: "r1", replacedBy: "r2", rule: rule({ id: "r2", then: r.body.then }) })], ["/api/hub/rules", () => json({ rules: [rule()] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    buttonByText(view.querySelector(".ui-item"), "Replace").click();
    await flush();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    expect(dialog.textContent).toContain("This rule is kept and marked as replaced");
    dialog.querySelector("textarea").value = "Use pnpm everywhere.";
    buttonByText(dialog, "Replace").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rules/r1/replace").body).toEqual({ then: "Use pnpm everywhere.", when: "" });
    expect(dom.getElementById("ui-toasts").textContent).toContain("Replaced with rule r2");
  });
  test("the learning run is read and can be run again", async () => {
    let run = null;
    const calls = install([
      [/rule-suggestions\?/, () => json({ items: [], total: 1 })],
      ["/api/hub/rules/learning-run", (r) => {
        if (r.method === "POST") run = { at: "2026-10-27T10:10:44.419Z", found: 2, proposed: 1, errors: 0 };
        return json({ learningRun: run });
      }],
    ]);
    const view = RV.suggestionsView({});
    await flush();
    expect(view.textContent).toContain("No learning run has been recorded yet");
    buttonByText(view, "Run learning now").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rules/learning-run" && c.method === "POST")).toBeTruthy();
    expect(view.textContent).toContain("found 2");
    expect(view.textContent).toContain("proposed 1");
    expect(view.textContent).toContain("errors 0");
  });
  test("a rule that was replaced shows the replacement on its card", async () => {
    install([["/api/hub/rules", () => json({ rules: [rule({ replaced_by: "r9" })] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    expect(view.querySelector(".ui-item").textContent).toContain("replaced by r9");
  });
});
