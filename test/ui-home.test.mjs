// The Home page: it lists real projects in plain words, then for one project shows what Aletheia knows, its rules, the
// connected tools and what happened lately. Rows are read from fake API routes; nothing real is touched.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
let H;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 10; i += 1) await tick(); };
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

const now = Date.now();
const overview = {
  stats: { total: 900 },
  projects: [
    { name: "ConvertedIn", memories: 4328, lastAtEpoch: now - 3_600_000 },
    { name: "aletheia-mem", memories: 2400, lastAtEpoch: now - 1_000_000 },
    { name: "aletheia-mem/round13-facts-quality", memories: 84, lastAtEpoch: now - 2_000_000 },
    { name: "tmp.GZG9FxZMwC", memories: 1, lastAtEpoch: now - 9_000_000 },
  ],
};
const rules = [
  { id: "r_1", scopeTier: "everywhere", scopeName: "Everywhere", when: "", then: "Work faster once PRs are merged.", enabled: true, stale: false, reasons: [] },
  { id: "r_2", scopeTier: "project", scopeName: "ConvertedIn", when: "", then: "Never deploy on Friday.", enabled: true, stale: true, reasons: [{ message: "Not confirmed for 100 days." }] },
  { id: "r_3", scopeTier: "project", scopeName: "Other", when: "", then: "Rule for another project.", enabled: true, stale: false, reasons: [] },
];
const tools = [
  { id: "claude-code", name: "Claude Code", installed: true, hooks: { present: 5, expected: 5 } },
  { id: "windsurf", name: "Windsurf", installed: true, hooks: { present: 0, expected: 4 } },
  { id: "cursor", name: "Cursor", installed: false, hooks: { present: 0, expected: 6 } },
];
const memory = (id, extra = {}) => ({ id, project: "ConvertedIn", kind: "observation", type: "decision", title: `Decision number ${id} about the deploy`, narrative: "", pinned: false, tool: "claude-code", created_at_epoch: now - id * 60_000, ...extra });
const routes = () => [
  ["/api/hub/overview", () => json(overview)],
  ["/api/hub/rules/preview", () => json({ results: [{ tool: "claude-code", path: "/home/me/.claude/CLAUDE.md", changed: true, rules: 2 }] })],
  ["/api/hub/rules", () => json({ rules })],
  ["/api/hub/doctor", () => json({ tools })],
  [/kind=observation/, () => json({ items: [memory(1), memory(2, { title: '{"a":1}', narrative: "" }), memory(3, { title: "input: {\"question\":\"How should the bot trade?\"}" })] })],
  [/kind=summary/, () => json({ items: [memory(4, { kind: "summary", type: "summary", title: "Session summary for ConvertedIn (2 fact(s))", narrative: "**Request.** Fixed the deploy script and merged the pull request." })] })],
  [/kind=note/, () => json({ items: [memory(5, { kind: "note", type: "note", title: "Deploy needs Node 20.19.6", pinned: true })] })],
];

beforeEach(async () => {
  dom = installFakeDom();
  H ??= await import("../public/tabs/home.js");
  const D = await import("../public/ui-dom.js");
  D.state.project = "";
  globalThis.location = { hash: "#/home", protocol: "http:", host: "x" };
  const root = dom.createElement("div");
  root.setAttribute("id", "ui-home");
  dom.body.append(root);
});
afterAll(() => { restoreGlobals(); });

describe("Home, all projects", () => {
  test("welcomes you, lists only real projects as tiles, and explains Aletheia", async () => {
    install(routes());
    await H.renderHome();
    await flush();
    const text = dom.getElementById("ui-home").textContent;
    expect(text).toContain("Welcome back");
    expect(text).toContain("What is Aletheia?");
    expect(text).toContain("ConvertedIn");
    expect(text).toContain("4328 things remembered");
    const tiles = dom.getElementById("ui-home").querySelectorAll(".ui-home-project").map((tile) => tile.textContent);
    expect(tiles.some((tile) => tile.includes("round13-facts-quality"))).toBe(true); // listed, but under "other folders"
    const main = dom.getElementById("ui-home").querySelectorAll(".ui-home-projects")[0].querySelectorAll(".ui-home-project").map((tile) => tile.textContent);
    expect(main.some((tile) => tile.includes("tmp.GZG9FxZMwC") || tile.includes("round13"))).toBe(false);
    expect(text).toContain("other folders");
  });

  test("every block has a hint and an example", async () => {
    install(routes());
    await H.renderHome();
    await flush();
    const examples = dom.getElementById("ui-home").querySelectorAll(".ui-home-example");
    expect(examples.length).toBeGreaterThanOrEqual(2);
    expect(dom.getElementById("ui-home").textContent).toContain("Write a rule once");
  });
});

describe("Home, one project", () => {
  beforeEach(async () => { (await import("../public/ui-dom.js")).state.project = "ConvertedIn"; });

  test("shows readable knowledge: JSON and bold markers are cleaned, pinned notes first, junk skipped", async () => {
    install(routes());
    await H.renderHome();
    await flush();
    const rows = dom.getElementById("ui-home").querySelectorAll(".ui-home-row-title").map((row) => row.textContent);
    expect(rows[0]).toBe("Deploy needs Node 20.19.6");
    expect(rows).toContain("How should the bot trade?");
    expect(rows.some((row) => row.includes("{"))).toBe(false);
    const text = dom.getElementById("ui-home").textContent;
    expect(text).toContain("What Aletheia knows about ConvertedIn");
    expect(text).toContain("Fixed the deploy script and merged the pull request.");
    expect(text).not.toContain("**");
  });

  test("lists the rules for everywhere and for this project, and asks about a stale one", async () => {
    install(routes());
    await H.renderHome();
    await flush();
    const text = dom.getElementById("ui-home").textContent;
    expect(text).toContain("Work faster once PRs are merged.");
    expect(text).toContain("Applies in every project");
    expect(text).toContain("Never deploy on Friday.");
    expect(text).toContain("Only in ConvertedIn");
    expect(text).not.toContain("Rule for another project.");
    expect(text).toContain("Not confirmed for 100 days.");
    expect(buttonByText(dom.getElementById("ui-home"), "Still right")).toBeTruthy();
  });

  test("says in words which tools are on, which need setup and which are missing, with the command to copy", async () => {
    install(routes());
    await H.renderHome();
    await flush();
    const text = dom.getElementById("ui-home").textContent;
    expect(text).toContain("Turned on: it remembers your sessions");
    expect(text).toContain("Installed, but not turned on yet");
    expect(text).toContain("aletheia install windsurf --write");
    expect(text).toContain("Not installed on this computer");
    expect(text).not.toContain("aletheia install cursor --write");
    expect(text).toContain("Tools are connected once, for all your projects");
  });

  test("adding a rule posts it with the project scope only when the box is ticked", async () => {
    const calls = install(routes());
    await H.renderHome();
    await flush();
    const root = dom.getElementById("ui-home");
    const input = root.querySelectorAll("textarea")[0];
    input.value = "Always write a test first.";
    buttonByText(root, "Add rule").click();
    await flush();
    const post = calls.find((call) => call.method === "POST" && call.path === "/api/hub/rules");
    expect(post.body).toMatchObject({ then: "Always write a test first.", scopeTier: "everywhere", scopeName: "Everywhere" });
  });

  test("saving a note posts it as a pinned note in this project", async () => {
    const calls = install(routes());
    await H.renderHome();
    await flush();
    const root = dom.getElementById("ui-home");
    const input = root.querySelectorAll("input").find((item) => item.getAttribute("aria-label") === "Something to remember");
    input.value = "The staging box is called stg-2";
    buttonByText(root, "Save note").click();
    await flush();
    const post = calls.find((call) => call.method === "POST" && call.path === "/api/hub/memories");
    expect(post.body).toMatchObject({ project: "ConvertedIn", text: "The staging box is called stg-2", pinned: true });
  });

  test("the write-to-tools button previews first and writes nothing until confirmed", async () => {
    const calls = install(routes());
    await H.renderHome();
    await flush();
    buttonByText(dom.getElementById("ui-home"), "Write rules into my tools").click();
    await flush();
    const text = dom.getElementById("ui-home").textContent;
    expect(text).toContain("What will happen");
    expect(text).toContain("will be updated (2 rules)");
    expect(calls.some((call) => call.path === "/api/hub/rules/sync")).toBe(false);
    expect(buttonByText(dom.getElementById("ui-home"), "Write to 1 file")).toBeTruthy();
  });
});
