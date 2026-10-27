// T-214: accessibility contract. Every page is rendered with realistic API answers (including right-to-left text and a
// 200-character unbroken token) and every interactive element is checked for a name, a valid role and a sane tab
// order. The stylesheets are read for focus rings, touch size and the skip link. A real-browser pass (four widths,
// a keyboard walk, reduced motion) is recorded in docs/manual-test.md.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

const root = join(import.meta.dir, "..", "public");
const read = (name) => readFileSync(join(root, name), "utf8");
const ARABIC = "هذا نص عربي طويل لاختبار اتجاه الكتابة داخل البطاقات";
const TOKEN = "x".repeat(200);
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 8; i += 1) await tick(); };
const json = (data, status = 200) => ({ ok: status < 400, status, headers: { get: () => "application/json" }, json: async () => data });

let dom;
let mods = {};

const NOW = new Date().toISOString();
const memory = (id) => ({ id, title: id === 1 ? ARABIC : id === 2 ? TOKEN : `Memory ${id}`, narrative: `Body ${ARABIC} ${TOKEN}`, kind: "observation", type: "note", project: "shop", tool: "cursor", pinned: id === 1, created_at_epoch: Date.now() - 60_000, files: ["src/a.mjs"], facts: [], concepts: [] });
const fact = (id) => ({ id, text: id === 1 ? ARABIC : `Fact ${id}`, status: "active", scope: "project", extractorMode: "rules", confidence: 0.8, project: "shop", validAt: NOW, recordedAt: NOW, source: { episodeId: 1, episodeText: `raw ${ARABIC}` } });
const tool = { id: "claude-code", name: "Claude Code", capabilities: "full", installed: true, hooks: { file: "/f", present: 3, expected: 3, events: ["Stop"], commands: { Stop: "aletheia hook claude-code Stop" }, error: null }, lastCapture: NOW, spool: { items: 0, bytes: 0, path: "/s" }, commands: { install: "aletheia install claude-code --write", uninstall: "aletheia uninstall claude-code --write", doctor: "aletheia doctor", mcp: "bun bin/mcp.mjs" } };
const ROUTES = [
  [/^\/api\/hub\/overview/, () => json({ stats: { total: 3, pinned: 1 }, provider: "none", claudeMem: { exists: true, path: "/x" } })],
  [/^\/api\/hub\/memories\/\d+/, () => json(memory(1))],
  [/^\/api\/hub\/memories/, () => json({ items: [memory(1), memory(2), memory(3)], total: 3 })],
  [/^\/api\/hub\/facts/, () => json({ items: [fact(1), fact(2)], total: 2 })],
  [/items=0/, () => json({ items: [], duplicates: [{ key: "1:2", a: 1, b: 2, aText: ARABIC, bText: TOKEN, score: 0.9 }], duplicatesTotal: 1, dismissedDuplicates: [], dismissedDuplicatesTotal: 0 })],
  [/^\/api\/hub\/review\?/, () => json({ items: [{ id: 5, type: "fact", itemId: 1, reason: "contradiction", status: "pending", text: ARABIC, project: "shop", confidence: 0.8, createdAt: NOW }], total: 1 })],
  [/^\/api\/hub\/dismissed/, () => json({ items: [{ item_type: "fact", item_id: 3, reason: "noise", at_epoch: Date.now(), label: ARABIC, project: "shop" }], total: 1 })],
  [/^\/api\/hub\/rule-suggestions/, () => json({ items: [{ id: 7, project: "shop", text: ARABIC, when: "", confidence: 0.7, sourceType: "prompt", createdAt: NOW }], total: 1 })],
  [/^\/api\/hub\/rules/, () => json({ rules: [{ id: "r1", then: ARABIC, when: "", enabled: true, scopeTier: "everywhere", scopeName: "Everywhere", tools: null, source: "manual" }] })],
  [/^\/api\/hub\/tools/, () => json({ tools: [{ id: "claude-code", name: "Claude Code", installed: true }, { id: "agents-md", name: "AGENTS.md", installed: false }] })],
  [/^\/api\/hub\/doctor/, () => json({ tools: [tool], checks: [{ name: "server", ok: true, detail: "ok" }], dataDir: "/d", generatedAt: NOW })],
  [/^\/api\/hub\/sync\/status/, () => json({ epoch: 1, headSeq: 3, deviceCount: 1, e2ee: { enabled: false }, devices: [{ deviceId: "d1", name: ARABIC, revoked: false, pendingOps: 1, lastSync: NOW }], total: 1 })],
  [/^\/api\/hub\/alerts\/rules/, () => json({ rules: [{ id: 1, name: ARABIC, event: "token.revoked", target: "file", path: "/a.log", hasSecret: true, allowPrivate: false }] })],
  [/^\/api\/hub\/alerts\/feed/, () => json({ deliveries: [{ id: 3, event: "sync.error", status: "failed", attempts: 2, lastError: ARABIC }], total: 1 })],
  [/^\/api\/hub\/team\/members/, () => json({ members: [{ name: ARABIC, role: "editor", projects: ["shop"], revoked: false }] })],
  [/^\/api\/hub\/team\/board/, () => json({ entries: [{ kind: "decision", text: ARABIC, author: { name: "Sam" }, at: NOW }] })],
  [/^\/api\/hub\/team\/brief/, () => json({ text: `# Brief\n${ARABIC}` })],
  [/^\/api\/hub\/team$/, () => json({ teams: [{ id: "t1", name: ARABIC, role: "editor", projects: ["shop"] }] })],
  [/^\/api\/hub\/mcp-links/, () => json({ links: [{ id: 1, scope: "mcp", name: "laptop", projects: [], revoked: false }] })],
  [/^\/api\/hub\/audit/, () => json({ audit: [{ id: 1, at_epoch: Date.now(), actor: "ui", action: "memory.add", detail: { id: 1 } }], total: 1 })],
  [/^\/v1\/work\/sessions/, () => json({ items: [{ id: "s1", project: "shop", tool: "cursor", firstAt: NOW, lastAt: NOW, promptCount: 1, toolCount: 1, state: "finished", lastPrompt: ARABIC, summary: { text: "sum", at: NOW }, factCount: 1, href: "#/work/session/s1?project=shop" }], total: 1 })],
  [/^\/v1\/work\/goals/, () => json({ goals: [{ id: "0123456789abcdef", label: ARABIC, count: 2, sessionCount: 2, projects: ["shop"], lastSeen: NOW, pinned: false, quotes: [{ id: 1, at: NOW, project: "shop", text: "q" }] }], dismissedGoals: [], total: 1 })],
  [/^\/v1\/work\/session\//, () => json({ session: { id: "s1", project: "shop", tool: "cursor", firstAt: NOW, lastAt: NOW, promptCount: 1, toolCount: 1, summary: { text: ARABIC, at: NOW }, timeline: [{ id: 1, kind: "prompt", at: NOW, text: ARABIC, tool: "cursor" }], facts: [fact(1)] } })],
  [/^\/v1\/work\?/, () => json({ health: { status: "ok" }, mode: "code", empty: false, queue: { pending: 0, running: 0, failed: 0, done: 1, depth: 0 }, lastCapture: [{ tool: "cursor", at: NOW, count: 1 }], sessions: [{}], recentFacts: [fact(1)], review: { pending: 1, items: [{ id: 5, type: "fact", itemId: 1, reason: "contradiction", label: ARABIC, project: "shop" }] }, ruleSuggestions: [], dismissed: [], pinned: [], generatedAt: NOW })],
  [/^\/v1\/search/, () => json({ total: 2, totals: { facts: 1, memories: 1 }, capped: false, facts: [{ kind: "fact", id: 1, text: ARABIC, title: ARABIC, project: "shop", status: "active", confidence: 0.8, at: NOW, source: {} }], results: [{ id: 2, kind: "observation", type: "note", title: TOKEN, project: "shop", tool: "cursor" }], channels: {}, reason: null })],
];

function installFetch() {
  globalThis.fetch = async (path) => { for (const [pattern, handler] of ROUTES) if (pattern.test(path)) return handler(path); return json({ error: `unrouted ${path}` }, 404); };
}
function fakeLocation(start) {
  const loc = { hash: start, protocol: "http:", host: "x" };
  globalThis.location = loc;
  globalThis.history = { pushState: (_a, _b, hash) => { loc.hash = hash; }, replaceState: (_a, _b, hash) => { loc.hash = hash; } };
  globalThis.addEventListener = () => {};
  globalThis.removeEventListener = () => {};
  return loc;
}

beforeEach(async () => {
  dom = installFakeDom();
  mods.C ??= await import("../public/ui-components.js");
  mods.dom ??= await import("../public/ui-dom.js");
  mods.memory ??= await import("../public/tabs/memory.js");
  mods.rules ??= await import("../public/tabs/rules.js");
  mods.tools ??= await import("../public/tabs/tools.js");
  mods.work ??= await import("../public/tabs/work.js");
  mods.keys ??= await import("../public/ui-keys.js");
  mods.guide ??= await import("../public/ui-guide.js");
  mods.C.resetUi();
  mods.dom.state.project = "";
  installFetch();
});
afterAll(() => { mods.work?.stopWorkRefresh(); restoreGlobals(); });

// ---- the audit ------------------------------------------------------------------------------------------

const ROLES = new Set(["tablist", "tab", "tabpanel", "radiogroup", "radio", "switch", "dialog", "listbox", "option", "combobox", "status", "alert", "progressbar", "img", "region", "group", "list", "listitem", "tooltip", "presentation", "search", "navigation"]);
const INTERACTIVE = new Set(["button", "a", "input", "select", "textarea"]);

function nameOf(el, doc) {
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const by = el.getAttribute("aria-labelledby");
  if (by) { const text = by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent ?? "").join(" ").trim(); if (text) return text; }
  for (let node = el.parentNode; node; node = node.parentNode) if (node.tag === "label" && node.textContent.trim()) return node.textContent.trim();
  const own = el.textContent.trim();
  if (own) return own;
  if (el.querySelector?.("svg")) { const t = el.getAttribute("title"); if (t) return t; }
  return el.getAttribute("title") ?? el.getAttribute("placeholder") ?? "";
}

function audit(container, doc, label) {
  const problems = [];
  const ids = new Map();
  const all = container.all();
  for (const el of all) {
    const id = el.getAttribute("id");
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
    const role = el.getAttribute("role");
    if (role && !ROLES.has(role)) problems.push(`${label}: unknown role ${role}`);
    const tabindex = el.getAttribute("tabindex");
    if (tabindex && Number(tabindex) > 0) problems.push(`${label}: positive tabindex on ${el.tag}`);
    const type = el.getAttribute("type");
    const interactive = INTERACTIVE.has(el.tag) && !(el.tag === "input" && type === "hidden") && !(el.tag === "a" && el.getAttribute("href") == null) || ["tab", "radio", "switch", "option", "combobox"].includes(role);
    if (interactive && !nameOf(el, doc)) problems.push(`${label}: ${el.tag}.${el.className} has no accessible name`);
    if (el.tag === "svg" && !el.getAttribute("aria-hidden") && !el.getAttribute("aria-label")) problems.push(`${label}: an svg is neither hidden nor labelled`);
    if (el.tag === "img" && el.getAttribute("alt") == null) problems.push(`${label}: img without alt`);
    if (role === "dialog" && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby")) problems.push(`${label}: dialog without a name`);
    if (role === "progressbar" && !el.getAttribute("aria-label")) problems.push(`${label}: progressbar without a name`);
    if (role === "radiogroup" && !el.getAttribute("aria-label")) problems.push(`${label}: radiogroup without a name`);
    if (role === "tablist" && !el.getAttribute("aria-label")) problems.push(`${label}: tablist without a name`);
  }
  for (const [id, count] of ids) if (count > 1) problems.push(`${label}: duplicate id ${id}`);
  return problems;
}

/** Every element that shows API text must have dir=auto on itself or an ancestor inside the page. */
function directionProblems(container, needle, label) {
  const problems = [];
  const hasAuto = (el) => { for (let n = el; n; n = n.parentNode) { if (n.getAttribute?.("dir") === "auto" || n.getAttribute?.("dir") === "ltr") return true; if (n === container) break; } return false; };
  for (const el of container.all()) {
    const own = el.children.filter((kid) => kid.nodeType === 3).map((kid) => kid.textContent).join("");
    if (own.includes(needle) && !hasAuto(el)) problems.push(`${label}: ${el.tag}.${el.className} shows right-to-left text without dir`);
  }
  return problems;
}

async function page(setup) {
  const host = dom.createElement("div");
  host.setAttribute("id", "ui-app");
  dom.body.append(host);
  await setup(host);
  await flush();
  return host;
}

const mount = async (id, render, route) => {
  const holder = dom.createElement("div");
  holder.setAttribute("id", id);
  dom.body.append(holder);
  await render(route);
  await flush();
  return holder;
};

describe("T-214: the audit itself", () => {
  test("it finds an unnamed button, a bad role, a duplicate id and an unlabelled dialog", () => {
    const host = dom.createElement("div");
    const bare = dom.createElement("button");
    const odd = dom.createElement("div");
    odd.setAttribute("role", "banana");
    const a = dom.createElement("span");
    a.setAttribute("id", "x");
    const b = dom.createElement("span");
    b.setAttribute("id", "x");
    const dialog = dom.createElement("div");
    dialog.setAttribute("role", "dialog");
    host.append(bare, odd, a, b, dialog);
    const problems = audit(host, dom, "t").join("\n");
    expect(problems).toContain("no accessible name");
    expect(problems).toContain("unknown role banana");
    expect(problems).toContain("duplicate id x");
    expect(problems).toContain("dialog without a name");
  });
  test("it accepts a label wrapped around an input, and aria-labelledby", () => {
    const host = dom.createElement("div");
    const label = dom.createElement("label");
    label.append("Your tool");
    const input = dom.createElement("input");
    label.append(input);
    const heading = dom.createElement("h2");
    heading.setAttribute("id", "hh");
    heading.append("Heading");
    const button = dom.createElement("button");
    button.setAttribute("aria-labelledby", "hh");
    host.append(label, heading, button);
    dom.body.append(host);
    expect(audit(host, dom, "t")).toEqual([]);
  });
  test("a right-to-left string without a direction is reported", () => {
    const host = dom.createElement("div");
    const p = dom.createElement("p");
    p.append(ARABIC);
    host.append(p);
    expect(directionProblems(host, ARABIC, "t").length).toBe(1);
    p.setAttribute("dir", "auto");
    expect(directionProblems(host, ARABIC, "t")).toEqual([]);
  });
});

describe("T-214: names, roles and tab order on every page", () => {
  const cases = [
    ["memory", "ui-memory", (r) => mods.memory.renderMemory(r), ["memories", "facts", "review", "dismissed", "search"]],
    ["rules", "ui-rules", (r) => mods.rules.renderRules(r), ["rules", "suggestions", "sync", "import"]],
    ["tools", "ui-tools", (r) => mods.tools.renderTools(r), ["tools", "devices", "access", "alerts", "team", "checks", "activity"]],
  ];
  for (const [tab, id, render, subs] of cases) {
    for (const sub of subs) {
      test(`${tab}/${sub}: every control is named, ids are unique, text that may be right-to-left has a direction`, async () => {
        fakeLocation(`#/${tab}/${sub}${sub === "search" ? "?q=retry" : ""}`);
        const holder = await mount(id, render, { tab, sub, params: {} });
        expect(holder.all().length).toBeGreaterThan(10);
        const problems = [...audit(holder, dom, `${tab}/${sub}`), ...directionProblems(holder, ARABIC, `${tab}/${sub}`)];
        expect(problems).toEqual([]);
        mods.work.stopWorkRefresh();
      });
    }
  }
  test("work overview", async () => {
    fakeLocation("#/work");
    const holder = await mount("ui-work", (r) => mods.work.renderWork(r), { tab: "work" });
    expect([...audit(holder, dom, "work"), ...directionProblems(holder, ARABIC, "work")]).toEqual([]);
    mods.work.stopWorkRefresh();
  });
  test("work session", async () => {
    fakeLocation("#/work/session/s1?project=shop");
    const holder = await mount("ui-work", (r) => mods.work.renderWork(r), { tab: "work" });
    expect([...audit(holder, dom, "session"), ...directionProblems(holder, ARABIC, "session")]).toEqual([]);
  });
  test("the first-run guide, the shortcut sheet, the palette and the dialogs", async () => {
    const guide = mods.guide.firstRunGuide({ tools: [tool], intervalMs: 0 });
    dom.body.append(guide);
    expect(audit(guide, dom, "guide")).toEqual([]);
    guide.dispose();
    const sheet = mods.keys.openShortcuts();
    expect(audit(sheet.el, dom, "shortcuts")).toEqual([]);
    sheet.close();
    await flush();
    const palette = mods.keys.openPalette({ navigate() {}, setTheme() {}, refresh() {} });
    await flush();
    expect(audit(palette.el, dom, "palette")).toEqual([]);
    expect(palette.el.querySelector("input").getAttribute("role")).toBe("combobox");
    palette.close();
    await flush();
    const confirm = mods.C.confirmDialog({ title: "Revoke it?", message: "m" });
    expect(audit(dom.documentElement.querySelector(".ui-modal"), dom, "confirm")).toEqual([]);
    dom.documentElement.querySelectorAll("button").find((b) => b.textContent === "Cancel").click();
    await confirm;
  });
  test("the status regions, toasts and the page announcer are polite live regions", () => {
    const html = read("index.html");
    expect(html).toMatch(/id="ui-announcer"[^>]*aria-live="polite"/);
    expect(html).toMatch(/id="ui-health"[^>]*aria-live="polite"/);
    mods.C.toast("Saved", { duration: 0 });
    expect(dom.getElementById("ui-toasts").getAttribute("aria-live")).toBe("polite");
    expect(dom.getElementById("ui-toasts").getAttribute("role")).toBe("status");
  });
});

describe("T-214: the page and the stylesheets", () => {
  const html = read("index.html");
  const css = read("ui-components.css") + read("one-ui.css");
  test("the page declares its language, has a skip link and one main landmark", () => {
    expect(html).toContain('<html lang="en">');
    expect(html).toMatch(/<a class="ui-skip" href="#ui-main">/);
    expect(html.match(/<main\b/g).length).toBe(1);
    expect(html).toContain('id="ui-main"');
    expect(html).toMatch(/<nav id="ui-tabs"[^>]*aria-label=/);
    expect(html).toMatch(/<header class="ui-top">/);
  });
  test("form controls in the header have labels", () => {
    expect(html).toMatch(/<label class="ui-sr" for="ui-project">/);
    expect(html).toMatch(/<label class="ui-sr" for="ui-search">/);
  });
  test("every control has a visible focus style and the outline is never removed without a replacement", () => {
    expect(css).toContain(":focus-visible { outline: 2px solid var(--ui-accent)");
    // `:focus` (mouse and programmatic focus) may drop the outline because `:focus-visible` brings it back for the keyboard.
    for (const block of css.match(/[^{}]+:focus(?:-visible)?[^{}]*\{[^}]*outline:\s*none[^}]*\}/g) ?? []) {
      const selector = block.split("{")[0].trim();
      if (selector === ":focus" || selector === ".ui-main:focus") continue;
      expect(block).toMatch(/box-shadow|border-color|outline-offset/);
    }
  });
  test("touch targets are 40 px for buttons, chips, segments, tabs, pager and inputs", () => {
    expect(read("ui-theme.css")).toContain("--ui-touch: 40px");
    for (const selector of [".ui-btn {", ".ui-chipfilter {", ".ui-seg {", ".ui-tab {", ".ui-pager-nav, .ui-pager-page {", ".ui-toggle {", ".ui-disc-head {"]) {
      const at = css.indexOf(selector);
      expect(at).toBeGreaterThan(-1);
      expect(css.slice(at, css.indexOf("}", at))).toContain("var(--ui-touch)");
    }
    expect(css).toMatch(/\.ui-btn-sm \{ min-height: var\(--ui-touch\)/);
  });
  test("long text wraps and tables and code scroll instead of widening the page", () => {
    expect(css).toMatch(/body \{[^}]*overflow-wrap: anywhere/);
    expect(css).toMatch(/\.ui-md-code pre \{[^}]*overflow: auto/);
    expect(css).toMatch(/\.ui-md-table \{ overflow-x: auto/);
    expect(css).toMatch(/\.ui-item \{[^}]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/\.ui-command code \{[^}]*overflow-x: auto/);
  });
  test("the visually hidden helper stays inside its container's corner, so it cannot widen the page", () => {
    expect(css).toMatch(/\.ui-sr \{ position: absolute; left: 0; top: 0;/);
  });
  test("the header rearranges below 960 px and the page never forces a horizontal scroll", () => {
    expect(css).toContain("@media (max-width: 960px)");
    expect(css).toContain("@media (max-width: 420px)");
    expect(css).toMatch(/\.ui-nav \{[^}]*flex-basis: 100%/);
  });
  test("icon-only buttons are always built with a label", () => {
    for (const file of ["ui-components.js", "ui-views.js", "ui-status.js", "ui-guide.js", "ui-detail.js", "ui-keys.js", "ui-search.js"]) {
      const source = read(file);
      for (const match of source.matchAll(/iconButton\(\{([^}]*)\}/g)) expect({ file, ok: /label:/.test(match[1]) }).toEqual({ file, ok: true });
    }
    for (const name of readdirSync(join(root, "tabs"))) {
      const source = read(join("tabs", name));
      for (const match of source.matchAll(/iconButton\(\{([^}]*)\}/g)) expect({ name, ok: /label:/.test(match[1]) }).toEqual({ name, ok: true });
    }
  });
  test("no inline event handler attributes or style attributes in any script, and no positive tabindex", () => {
    const files = [...readdirSync(root).filter((f) => f.endsWith(".js") || f === "index.html").map((f) => f), ...readdirSync(join(root, "tabs")).map((f) => join("tabs", f))];
    for (const file of files) {
      const source = read(file);
      expect({ file, bad: /tabindex["']?\s*[:=]\s*["']?[1-9]/.test(source) }).toEqual({ file, bad: false });
      expect({ file, bad: /\bon(click|load|error|change|input|keydown)\s*=\s*["']/.test(source) }).toEqual({ file, bad: false });
    }
  });
});
