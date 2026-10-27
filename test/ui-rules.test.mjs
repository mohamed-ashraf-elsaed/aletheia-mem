// T-210: the Rules tab with fake DOM and fake fetch.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let C;
let RV;
let RULES;
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
  RV ??= await import("../public/tabs/rules-views.js");
  RULES ??= await import("../public/tabs/rules.js");
  C.resetUi();
  (await import("../public/ui-dom.js")).state.project = "";
  fakeLocation("#/rules");
});
afterAll(() => restoreGlobals());

const rule = (id, extra = {}) => ({ id: `r${id}`, then: `Do thing ${id}`, when: "", enabled: true, scopeTier: "everywhere", scopeName: "Everywhere", tools: null, source: "manual", ...extra });
const TOOLS = [{ id: "claude-code", name: "Claude Code", installed: true }, { id: "cursor", name: "Cursor", installed: false }, { id: "agents-md", name: "AGENTS.md", installed: false }];

describe("T-210: the rule list", () => {
  test("shows every rule with its scope, tools and state", async () => {
    install([["/api/hub/rules", () => json({ rules: [rule(1), rule(2, { enabled: false, when: "editing tests", scopeTier: "project", scopeName: "shop", tools: ["cursor"] })] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    expect(view.querySelectorAll(".ui-item").length).toBe(2);
    expect(view.textContent).toContain("When editing tests: Do thing 2");
    expect(view.textContent).toContain("project: shop");
    expect(view.textContent).toContain("only cursor");
    expect(view.textContent).toContain("all tools");
  });
  test("an empty list says what a rule is and offers Add and Import", async () => {
    install([["/api/hub/rules", () => json({ rules: [] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    expect(view.textContent).toContain("No rules yet");
    expect(buttonByText(view, "Add a rule")).toBeTruthy();
    expect(view.querySelector("a")?.getAttribute("href")).toBe("#/rules/import");
  });
  test("Turn off is immediate, sent to the server, and Undo turns it back on", async () => {
    const calls = install([["/api/hub/rules/r1/toggle", (r) => json({ rule: { ...rule(1), ...r.body } })], ["/api/hub/rules", () => json({ rules: [rule(1)] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    const card = view.querySelector(".ui-item");
    buttonByText(card, "Turn off").click();
    expect(card.textContent).toContain("off");
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rules/r1/toggle").body).toEqual({ enabled: false });
    expect(toasts()).toContain("kept, not deleted");
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    expect(calls.filter((c) => c.path === "/api/hub/rules/r1/toggle").map((c) => c.body.enabled)).toEqual([false, true]);
    expect(card.textContent).toContain("on");
  });
  test("a failed toggle rolls back and says why", async () => {
    install([["/api/hub/rules/r1/toggle", () => json({ error: "read-only file" }, 500)], ["/api/hub/rules", () => json({ rules: [rule(1)] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    const card = view.querySelector(".ui-item");
    buttonByText(card, "Turn off").click();
    await flush();
    await flush();
    expect(buttonByText(card, "Turn off")).toBeTruthy();
    expect(toasts()).toContain("read-only file");
  });
  test("the text filter narrows the list without a request", async () => {
    const calls = install([["/api/hub/rules", () => json({ rules: [rule(1), rule(2)] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    const input = view.querySelector("input");
    input.value = "thing 2";
    input.dispatch("input");
    expect(view.querySelectorAll(".ui-item").length).toBe(1);
    expect(calls.filter((call) => !call.path.includes("/rules/diff")).length).toBe(1);
  });
  test("rule text and the filter handle hostile and right-to-left text as plain text", async () => {
    install([["/api/hub/rules", () => json({ rules: [rule(1, { then: "<img src=x onerror=alert(1)> قاعدة" })] })]]);
    const view = RV.rulesView({ addRule() {} });
    await flush();
    expect(view.querySelectorAll("img").length).toBe(0);
    expect(view.querySelector(".ui-item-title").getAttribute("dir")).toBe("auto");
  });
});

describe("T-210: add a rule", () => {
  test("an empty rule is refused with a reason", async () => {
    install([]);
    RV.addRuleDialog({ tools: TOOLS });
    const dialog = dom.documentElement.querySelector(".ui-modal");
    buttonByText(dialog, "Add rule").click();
    await flush();
    expect(toasts()).toContain("A rule needs some text.");
  });
  test("a scoped rule needs a name; a good one posts its fields and the chosen tools", async () => {
    const calls = install([["/api/hub/rules", () => json({ id: "r9" }, 201)]]);
    let added = 0;
    RV.addRuleDialog({ tools: TOOLS, onAdded: () => { added += 1; } });
    const dialog = dom.documentElement.querySelector(".ui-modal");
    const [then, when] = dialog.querySelectorAll("textarea").concat(dialog.querySelectorAll("input"));
    dialog.querySelector("textarea").value = "Run the tests first";
    dialog.querySelector("select").value = "project";
    dialog.querySelector("select").dispatch("change");
    dialog.querySelectorAll("input").find((i) => i.getAttribute("name") === "rule-tool" && i.value === "cursor").checked = true;
    dialog.querySelectorAll("input").find((i) => i.getAttribute("name") === "rule-tool" && i.value === "cursor").dispatch("change");
    buttonByText(dialog, "Add rule").click();
    await flush();
    expect(toasts()).toContain("Name the project");
    const name = dialog.querySelectorAll("input").find((i) => i.getAttribute("aria-label") === "Scope name");
    name.value = "shop";
    buttonByText(dialog, "Add rule").click();
    await flush();
    expect(calls.find((c) => c.method === "POST").body).toEqual({ then: "Run the tests first", when: "", scopeTier: "project", scopeName: "shop", tools: ["cursor"] });
    expect(added).toBe(1);
  });
});

describe("T-210: suggested rules", () => {
  const sug = (id) => ({ id, project: "shop", text: `Suggestion ${id}`, when: "editing checkout", confidence: 0.8, status: "pending", sourceType: "prompt", createdAt: new Date().toISOString() });
  test("pending suggestions page from the server with their project and sort", async () => {
    fakeLocation("#/rules/suggestions?sort=confidence");
    (await import("../public/ui-dom.js")).state.project = "shop";
    const calls = install([["/api/hub/rule-suggestions", () => json({ items: [sug(1), sug(2)], total: 2 })]]);
    const view = RV.suggestionsView({});
    await flush();
    expect(calls[0].path).toBe("/api/hub/rule-suggestions?limit=25&offset=0&project=shop&status=pending&sort=confidence");
    expect(view.querySelectorAll(".ui-item").length).toBe(2);
  });
  test("Approve hides the row first; Undo restores it and turns the new rule off", async () => {
    fakeLocation("#/rules/suggestions");
    const calls = install([
      [/rule-suggestions\?/, () => json({ items: [sug(5)], total: 1 })],
      ["/api/hub/rule-suggestions/5", (r) => json(r.body.action === "approve" ? { status: "accepted", ruleId: "r77" } : { status: "pending" })],
      ["/api/hub/rules/r77/toggle", () => json({ rule: { id: "r77", enabled: false } })],
    ]);
    const view = RV.suggestionsView({});
    await flush();
    const card = view.querySelector(".ui-item");
    buttonByText(card, "Approve").click();
    await tick();
    expect(card.classList.contains("is-leaving")).toBe(true);
    await flush();
    expect(toasts()).toContain("Rule added");
    buttonByText(dom.getElementById("ui-toasts"), "Undo").click();
    await flush();
    const seq = calls.filter((c) => c.method !== "GET").map((c) => `${c.path} ${JSON.stringify(c.body)}`);
    expect(seq).toEqual(['/api/hub/rule-suggestions/5 {"action":"approve"}', '/api/hub/rule-suggestions/5 {"action":"restore"}', '/api/hub/rules/r77/toggle {"enabled":false}']);
  });
  test("a dismissed suggestion has Restore, not Approve", async () => {
    fakeLocation("#/rules/suggestions?status=dismissed");
    install([[/rule-suggestions\?/, () => json({ items: [{ ...sug(6), status: "dismissed" }], total: 1 })]]);
    const view = RV.suggestionsView({});
    await flush();
    expect(buttonByText(view, "Restore")).toBeTruthy();
    expect(buttonByText(view, "Approve")).toBeUndefined();
  });
  test("the empty state promises that nothing applies without Approve", async () => {
    fakeLocation("#/rules/suggestions");
    install([[/rule-suggestions\?/, () => json({ items: [], total: 0 })]]);
    const view = RV.suggestionsView({});
    await flush();
    expect(view.textContent).toContain("Nothing is applied until you Approve it");
  });
});

describe("T-210: writing rules into tool files", () => {
  const setup = async (extra = []) => {
    const calls = install([
      ["/api/hub/tools", () => json({ tools: TOOLS })],
      ["/api/hub/rules/preview", () => json({ results: [{ tool: "claude-code", path: "/p/CLAUDE.md", changed: true, after: "# Rules\n- one" }] })],
      ["/api/hub/rules/sync", () => json({ results: [{ tool: "claude-code", path: "/p/CLAUDE.md", written: true, changed: true, backup: "/p/CLAUDE.md.bak" }] })],
      ...extra,
    ]);
    const view = RV.syncView({});
    await flush();
    return { view, calls };
  };
  test("needs a folder for a project write", async () => {
    const { view, calls } = await setup();
    buttonByText(view, "Preview changes").click();
    await flush();
    expect(toasts()).toContain("absolute path");
    expect(calls.some((c) => c.path.includes("preview"))).toBe(false);
  });
  test("Preview posts without confirm and shows the new content", async () => {
    const { view, calls } = await setup();
    view.querySelectorAll("input").find((i) => i.getAttribute("aria-label") === "Project folder").value = "/p";
    buttonByText(view, "Preview changes").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rules/preview").body).toMatchObject({ tools: ["claude-code", "agents-md"], scope: "project", projectDir: "/p" });
    expect(calls.find((c) => c.path === "/api/hub/rules/preview").body.confirm).toBeUndefined();
    expect(view.textContent).toContain("would change");
  });
  test("Write files asks first, says what will happen, and cancelling writes nothing", async () => {
    const { view, calls } = await setup();
    view.querySelectorAll("input").find((i) => i.getAttribute("aria-label") === "Project folder").value = "/p";
    buttonByText(view, "Write files").click();
    await flush();
    const dialog = dom.documentElement.querySelector(".ui-modal");
    expect(dialog.textContent).toContain("managed block");
    expect(dialog.textContent).toContain("A backup of each existing file is kept");
    buttonByText(dialog, "Cancel").click();
    await flush();
    expect(calls.some((c) => c.path === "/api/hub/rules/sync")).toBe(false);
  });
  test("confirming sends confirm: true and shows the written files", async () => {
    const { view, calls } = await setup();
    view.querySelectorAll("input").find((i) => i.getAttribute("aria-label") === "Project folder").value = "/p";
    buttonByText(view, "Write files").click();
    await flush();
    buttonByText(dom.documentElement.querySelector(".ui-modal"), "Write files").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rules/sync").body.confirm).toBe(true);
    expect(view.textContent).toContain("written");
    expect(view.textContent).toContain("/p/CLAUDE.md.bak");
  });
  test("detected tools are ticked by default", async () => {
    const { view } = await setup();
    const boxes = view.querySelectorAll("input").filter((i) => i.getAttribute("name") === "sync-tool");
    expect(boxes.map((box) => [box.value, !!box.checked])).toEqual([["claude-code", true], ["cursor", false], ["agents-md", true]]);
  });
});

describe("T-210: import and the frame", () => {
  test("import posts the tool and the scope and reports the counts", async () => {
    const calls = install([["/api/hub/tools", () => json({ tools: TOOLS })], ["/api/hub/rules/import", () => json({ found: 4, added: 3, skipped: 1 })]]);
    const view = RV.importView({});
    await flush();
    buttonByText(view, "Import rules").click();
    await flush();
    expect(calls.find((c) => c.path === "/api/hub/rules/import").body).toEqual({ tool: "claude-code", scope: "global" });
    expect(view.textContent).toContain("Found 4, added 3, already had 1.");
  });
  test("the frame shows the title, four pages and the suggestion count", async () => {
    fakeLocation("#/rules");
    const root = dom.createElement("div");
    root.setAttribute("id", "ui-rules");
    dom.body.append(root);
    install([["/api/hub/rule-suggestions", () => json({ items: [], total: 3 })], ["/api/hub/rules", () => json({ rules: [rule(1)] })]]);
    await RULES.renderRules({ tab: "rules", sub: "rules", params: {} });
    await flush();
    expect(root.querySelector("h1").textContent).toBe("Rules");
    expect(root.querySelectorAll(".ui-tab").map((t) => t.getAttribute("data-tab"))).toEqual(["rules", "suggestions", "sync", "import"]);
    expect(root.querySelector('.ui-tab[data-tab="suggestions"]').textContent).toContain("3");
    expect(root.querySelectorAll(".ui-item").length).toBe(1);
  });
});
