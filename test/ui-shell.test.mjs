// T-205: the shell's logic without a browser: routes, theme, search, shortcuts and the palette's commands.
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SUBVIEWS, TABS, routeOf } from "../public/ui-core.js";
import { THEMES, THEME_KEY, applyTheme, readTheme, themeAttribute } from "../public/ui-theme.js";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

let dom;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
beforeEach(() => { dom = installFakeDom(); });

const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; }, data };
};

describe("T-205: routes with pages inside tabs", () => {
  test("tab, page and the rest", () => {
    expect(routeOf("#/memory/facts?page=2")).toMatchObject({ tab: "memory", sub: "facts", rest: [], key: "memory/facts" });
    expect(routeOf("#/memory")).toMatchObject({ tab: "memory", sub: "memories", key: "memory/memories" });
    expect(routeOf("#/rules/suggestions")).toMatchObject({ tab: "rules", sub: "suggestions" });
    expect(routeOf("#/tools/activity?limit=50").key).toBe("tools/activity");
    expect(routeOf("")).toMatchObject({ tab: "work", sub: null, key: "work" });
    expect(routeOf("#/nope/x")).toMatchObject({ tab: "work" });
  });
  test("an unknown page falls back to the first page of the tab", () => {
    expect(routeOf("#/memory/zzz").sub).toBe("memories");
  });
  test("a work session keeps its id in the key, so opening another session rebuilds the view", () => {
    const a = routeOf("#/work/session/s1?project=shop");
    const b = routeOf("#/work/session/s2?project=shop");
    expect(a.rest).toEqual(["session", "s1"]);
    expect(a.key).not.toBe(b.key);
  });
  test("a page number or filter alone does not change the key", () => {
    expect(routeOf("#/memory/facts?page=1").key).toBe(routeOf("#/memory/facts?page=9&status=history").key);
  });
  test("every tab has a shortcut letter and a hint, and the letters are unique", () => {
    expect(TABS.map((tab) => tab.key)).toEqual(["w", "m", "r", "t"]);
    expect(new Set(TABS.map((tab) => tab.key)).size).toBe(TABS.length);
    for (const tab of TABS) { expect(tab.hint.length).toBeGreaterThan(5); expect(tab.hash).toBe(`#/${tab.id}`); }
    expect(Object.keys(SUBVIEWS).sort()).toEqual(TABS.map((tab) => tab.id).sort());
  });
});

describe("T-205: theme preference", () => {
  test("auto means no attribute; dark and light set it", () => {
    expect(themeAttribute("auto")).toBeNull();
    expect(themeAttribute("dark")).toBe("dark");
    expect(themeAttribute("light")).toBe("light");
    expect(themeAttribute("weird")).toBeNull();
    expect(THEMES).toEqual(["auto", "dark", "light"]);
  });
  test("applying stores the choice and sets the root attribute; auto clears both", () => {
    const storage = memoryStorage();
    const root = dom.documentElement;
    expect(applyTheme("dark", { root, storage })).toBe("dark");
    expect(root.getAttribute("data-theme")).toBe("dark");
    expect(storage.data[THEME_KEY]).toBe("dark");
    expect(applyTheme("light", { root, storage })).toBe("light");
    expect(readTheme(storage)).toBe("light");
    expect(applyTheme("auto", { root, storage })).toBe("auto");
    expect(root.getAttribute("data-theme")).toBeNull();
    expect(storage.data[THEME_KEY]).toBeUndefined();
  });
  test("a missing, odd or blocked store reads as auto", () => {
    expect(readTheme(memoryStorage())).toBe("auto");
    expect(readTheme(memoryStorage({ [THEME_KEY]: "purple" }))).toBe("auto");
    expect(readTheme({ getItem() { throw new Error("blocked"); } })).toBe("auto");
    expect(() => applyTheme("dark", { root: dom.documentElement, storage: { setItem() { throw new Error("blocked"); }, removeItem() {} } })).not.toThrow();
  });
  test("the early script uses the same key and the same rule as the module", () => {
    const early = readFileSync(join(import.meta.dir, "..", "public", "ui-theme-init.js"), "utf8");
    expect(early).toContain(THEME_KEY);
    expect(early).toContain('pref === "dark" || pref === "light"');
    expect(early).toContain("try");
  });
});

describe("T-205: the page", () => {
  test("index.html has the skip link, the status region, the live announcer and no inline script or style", () => {
    const html = readFileSync(join(import.meta.dir, "..", "public", "index.html"), "utf8");
    expect(html).toContain('class="ui-skip"');
    expect(html).toContain('id="ui-status"');
    expect(html).toContain('id="ui-announcer"');
    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('<script src="/work-view/ui-theme-init.js"></script>');
    expect(/<script(?![^>]*\bsrc=)[^>]*>/.test(html)).toBe(false);
    expect(/\sstyle="/.test(html)).toBe(false);
    expect(/\son[a-z]+="/.test(html)).toBe(false);
    expect(/(src|href)="https?:/.test(html)).toBe(false);
  });
});

describe("T-205: header search", () => {
  async function setup() {
    const S = await import("../public/ui-search.js");
    const input = dom.createElement("input");
    const form = dom.createElement("form");
    const list = dom.createElement("div");
    list.hidden = true;
    dom.body.append(form, list);
    form.append(input);
    const calls = [];
    const navigated = [];
    globalThis.fetch = async (path, init) => {
      calls.push({ path, body: JSON.parse(init.body) });
      return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ total: 2, capped: false, facts: [{ id: 1, kind: "fact", title: "A retry fact", project: "p" }], results: [{ id: 5, kind: "observation", title: "Retry note" }] }) };
    };
    const search = S.mountSearch({ input, form, list, navigate: (hash) => navigated.push(hash) });
    return { S, input, form, list, calls, navigated, search };
  }
  const type = (input, value) => { input.value = value; input.dispatch("input"); };

  test("typing waits, then asks once for the best matches", async () => {
    const { input, calls, list } = await setup();
    type(input, "re");
    type(input, "ret");
    type(input, "retry");
    await tick(60);
    expect(calls.length).toBe(0);
    await tick(300);
    expect(calls.length).toBe(1);
    expect(calls[0].body).toMatchObject({ query: "retry", limit: 8, offset: 0, paged: true, mix: true });
    expect(list.hidden).toBe(false);
    expect(list.querySelectorAll(".ui-search-item").length).toBe(3);
    expect(list.textContent).toContain("See all 2 results");
    expect(input.getAttribute("aria-expanded")).toBe("true");
  });
  test("one character does not search", async () => {
    const { input, calls } = await setup();
    type(input, "r");
    await tick(320);
    expect(calls.length).toBe(0);
  });
  test("Enter with nothing chosen opens the full results page", async () => {
    const { input, form, navigated } = await setup();
    input.value = "retry loop";
    form.dispatch("submit");
    expect(navigated).toEqual(["#/memory/search?q=retry+loop"]);
  });
  test("arrow keys move the active result and Escape closes", async () => {
    const { input, list } = await setup();
    type(input, "retry");
    await tick(340);
    input.dispatch("keydown", { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("ui-sr-f0");
    input.dispatch("keydown", { key: "ArrowDown" });
    expect(input.getAttribute("aria-activedescendant")).toBe("ui-sr-m0");
    input.dispatch("keydown", { key: "ArrowUp" });
    input.dispatch("keydown", { key: "ArrowUp" });
    expect(input.getAttribute("aria-activedescendant")).toBe("ui-sr-all");
    input.dispatch("keydown", { key: "Escape" });
    expect(list.hidden).toBe(true);
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });
  test("a failed search says so in the list", async () => {
    const { input, list } = await setup();
    globalThis.fetch = async () => { throw new Error("down"); };
    type(input, "retry");
    await tick(340);
    expect(list.textContent).toContain("Search failed");
  });
  test("an answer for an old query never replaces a newer one", async () => {
    const { input, list } = await setup();
    const answers = [];
    globalThis.fetch = (path, init) => new Promise((resolve) => answers.push({ query: JSON.parse(init.body).query, resolve }));
    type(input, "first");
    await tick(260);
    type(input, "second");
    await tick(260);
    const reply = (title) => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ total: 1, facts: [], results: [{ id: 1, kind: "note", title }] }) });
    answers[1].resolve(reply("new answer"));
    await tick(10);
    answers[0].resolve(reply("old answer"));
    await tick(10);
    expect(list.textContent).toContain("new answer");
    expect(list.textContent).not.toContain("old answer");
  });
  test("the results link hash is stable", async () => {
    const { S } = await setup();
    expect(S.searchHash("a b")).toBe("#/memory/search?q=a+b");
  });
});

describe("T-205: shortcuts", () => {
  async function setup() {
    const K = await import("../public/ui-keys.js");
    const calls = { navigate: [], search: 0, palette: 0 };
    const ctx = { navigate: (hash) => calls.navigate.push(hash), focusSearch: () => { calls.search += 1; }, openPalette: () => { calls.palette += 1; }, setTheme() {}, refresh() {} };
    const off = K.installKeys(ctx, dom);
    return { K, calls, off, ctx };
  }
  const press = (key, extra = {}, target = dom.body) => target.dispatch("keydown", { key, ctrlKey: false, metaKey: false, altKey: false, ...extra });

  test("g then a letter jumps to a tab", async () => {
    const { calls } = await setup();
    press("g"); press("m");
    press("g"); press("w");
    press("g"); press("r");
    press("g"); press("t");
    expect(calls.navigate).toEqual(["#/memory", "#/work", "#/rules", "#/tools"]);
  });
  test("g then an unknown letter does nothing, and a lone letter does nothing", async () => {
    const { calls } = await setup();
    press("g"); press("z");
    press("m");
    expect(calls.navigate).toEqual([]);
  });
  test("slash focuses search; Ctrl+K and Cmd+K open the palette", async () => {
    const { calls } = await setup();
    press("/");
    press("k", { ctrlKey: true });
    press("K", { metaKey: true });
    expect(calls.search).toBe(1);
    expect(calls.palette).toBe(2);
  });
  test("nothing fires while typing in a field, except Ctrl+K", async () => {
    const { calls } = await setup();
    const input = dom.createElement("input");
    dom.body.append(input);
    press("/", {}, input);
    press("g", {}, input); press("m", {}, input);
    press("k", { ctrlKey: true }, input);
    expect(calls.search).toBe(0);
    expect(calls.navigate).toEqual([]);
    expect(calls.palette).toBe(1);
  });
  test("nothing fires while a dialog is open", async () => {
    const { calls } = await setup();
    const overlay = dom.createElement("div");
    overlay.className = "ui-overlay";
    dom.body.append(overlay);
    press("/");
    press("g"); press("m");
    expect(calls.search).toBe(0);
    expect(calls.navigate).toEqual([]);
  });
  test("[ and ] click the visible pager's buttons", async () => {
    await setup();
    const page = dom.createElement("section");
    page.className = "ui-page";
    const prev = dom.createElement("button");
    prev.className = "ui-pager-prev";
    const next = dom.createElement("button");
    next.className = "ui-pager-next";
    let clicks = [];
    prev.addEventListener("click", () => clicks.push("prev"));
    next.addEventListener("click", () => clicks.push("next"));
    page.append(prev, next);
    dom.body.append(page);
    press("]"); press("["); press("]");
    expect(clicks).toEqual(["next", "prev", "next"]);
    next.setAttribute("disabled", "");
    clicks = [];
    press("]");
    expect(clicks).toEqual([]);
  });
  test("the browser's own shortcuts are left alone", async () => {
    const { calls } = await setup();
    press("g", { ctrlKey: true }); press("m", { ctrlKey: true });
    press("/", { altKey: true });
    expect(calls.navigate).toEqual([]);
    expect(calls.search).toBe(0);
  });
  test("the sheet lists what the handler does", async () => {
    const { K } = await setup();
    const keys = K.SHORTCUTS.map((item) => item.keys.join(" "));
    for (const expected of ["Ctrl K", "/", "g w", "g m", "g r", "g t", "[", "]", "?", "Esc"]) expect(keys).toContain(expected);
    const layer = K.openShortcuts();
    expect(layer.el.textContent).toContain("Next page of a list");
    layer.close();
  });
});

describe("T-205: the palette", () => {
  test("static commands cover every tab and sub page, and are findable", async () => {
    const K = await import("../public/ui-keys.js");
    const { rankCommands } = await import("../public/ui-pure.js");
    const items = K.staticCommands({ navigate() {}, setTheme() {}, refresh() {} });
    const labels = items.map((item) => item.label);
    for (const tab of TABS) expect(labels).toContain(`Go to ${tab.label}`);
    expect(labels).toContain("Memory: Facts");
    expect(labels).toContain("Rules: Suggested");
    expect(labels).toContain("Tools: Activity");
    expect(rankCommands(items, "dark")[0].label).toBe("Theme: dark");
    expect(rankCommands(items, "short")[0].label).toBe("Show keyboard shortcuts");
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
  test("opening the palette shows a labelled combobox and Escape closes it", async () => {
    const K = await import("../public/ui-keys.js");
    globalThis.fetch = async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ items: [], facts: [], results: [] }) });
    const layer = K.openPalette({ navigate() {}, setTheme() {}, refresh() {} });
    const input = layer.el.querySelector("input");
    expect(input.getAttribute("role")).toBe("combobox");
    expect(input.getAttribute("aria-label")).toBe("Command palette");
    expect(layer.el.querySelector("[role=listbox]")).not.toBeNull();
    expect(dom.activeElement).toBe(input);
    dom.press("Escape");
    await layer.result;
  });
  test("Enter runs the highlighted command", async () => {
    const K = await import("../public/ui-keys.js");
    globalThis.fetch = async () => ({ ok: true, headers: { get: () => "application/json" }, json: async () => ({ items: [], facts: [], results: [] }) });
    const went = [];
    const layer = K.openPalette({ navigate: (hash) => went.push(hash), setTheme() {}, refresh() {} });
    const input = layer.el.querySelector("input");
    input.value = "go to rules";
    input.dispatch("input");
    input.dispatch("keydown", { key: "Enter" });
    await layer.result;
    await tick(10);
    expect(went).toEqual(["#/rules"]);
  });
});

afterAll(() => restoreGlobals());
