// T-204: the component system, driven through a small fake DOM. Covers structure, roles, keyboard, focus handling
// and states. Real rendering is checked in a browser (docs/manual-test.md).
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { installFakeDom, restoreGlobals, serialize } from "./support/fake-dom.mjs";

let dom;
let C;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(async () => {
  dom = installFakeDom();
  C ??= await import("../public/ui-components.js");
  C.resetUi();
});

const NAMES = ["button", "iconButton", "badge", "statusDot", "toast", "undoToast", "modal", "confirmDialog", "promptDialog", "drawer", "tabs", "segmented", "toggle", "withTooltip", "popover", "card", "statTile", "skeleton", "spinner", "brainLoader", "progressBar", "emptyState", "errorState", "pager", "listView", "enterList", "codeBlock", "markdownView", "timeline", "chipFilters", "highlight", "clampText", "disclosure", "timeEl", "mono", "banner", "field", "copyText", "startClock", "icon", "isFocusable", "resetUi"];

describe("T-204: the library", () => {
  test("every component named in the task is exported as a function", () => {
    for (const name of NAMES) expect(typeof C[name]).toBe("function");
  });
  test("no module builds markup from strings or loads anything from outside", () => {
    const dir = join(import.meta.dir, "..", "public");
    for (const file of ["ui-components.js", "ui-brand.js", "ui-icons.js", "ui-motion.js", "ui-markdown.js", "ui-pure.js", "ui-components.css", "ui-theme.css"]) {
      const source = readFileSync(join(dir, file), "utf8");
      expect({ file, bad: /\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function\(/.test(source) }).toEqual({ file, bad: false });
      expect({ file, bad: /\bon[a-z]+\s*=\s*["']/.test(source) }).toEqual({ file, bad: false });
      expect({ file, bad: /https?:\/\/(?!www\.w3\.org)/.test(source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")) }).toEqual({ file, bad: false });
    }
  });
  test("every public script transpiles", () => {
    const dir = join(import.meta.dir, "..", "public");
    for (const file of readdirSync(dir).filter((name) => name.endsWith(".js"))) expect(() => new Bun.Transpiler({ loader: "js" }).transformSync(readFileSync(join(dir, file), "utf8"))).not.toThrow();
  });
});

describe("T-204: buttons", () => {
  test("label, variant, icon slot and a plain click", () => {
    let clicks = 0;
    const b = C.button({ label: "Save", variant: "primary", icon: "check", onClick: () => { clicks += 1; } });
    expect(b.tag).toBe("button");
    expect(b.textContent).toBe("Save");
    expect(b.classList.contains("ui-btn-primary")).toBe(true);
    expect(b.querySelector(".ui-icon")).not.toBeNull();
    b.click();
    expect(clicks).toBe(1);
    expect(b.classList.contains("is-loading")).toBe(false);
  });
  test("an async handler shows loading, disables, then a check", async () => {
    let release;
    const b = C.button({ label: "Go", onClick: () => new Promise((resolve) => { release = resolve; }) });
    dom.body.append(b);
    b.click();
    await tick();
    expect(b.classList.contains("is-loading")).toBe(true);
    expect(b.disabled).toBe(true);
    expect(b.getAttribute("aria-busy")).toBe("true");
    expect(b.querySelector(".ui-spinner")).not.toBeNull();
    release();
    await tick();
    expect(b.classList.contains("is-ok")).toBe(true);
    expect(b.disabled).toBe(false);
    expect(b.querySelector(".ui-icon-check")).not.toBeNull();
  });
  test("a second click while busy does nothing", async () => {
    let calls = 0;
    const b = C.button({ label: "Go", onClick: () => { calls += 1; return new Promise(() => {}); } });
    b.click();
    b.click();
    await tick();
    expect(calls).toBe(1);
  });
  test("a rejected handler shows the error and a toast", async () => {
    const b = C.button({ label: "Go", onClick: () => Promise.reject(new Error("Disk is full")) });
    dom.body.append(b);
    b.click();
    await tick();
    await tick();
    expect(b.classList.contains("is-err")).toBe(true);
    expect(b.disabled).toBe(false);
    expect(dom.getElementById("ui-toasts").textContent).toContain("Disk is full");
  });
  test("an icon button must carry a label", () => {
    const b = C.iconButton({ icon: "copy", label: "Copy id" });
    expect(b.getAttribute("aria-label")).toBe("Copy id");
    expect(b.getAttribute("title")).toBe("Copy id");
  });
  test("a link-style button keeps its href", () => {
    expect(C.button({ label: "Open", href: "#/memory" }).tag).toBe("a");
  });
});

describe("T-204: toasts", () => {
  test("three show at once, the rest wait and appear as others close", async () => {
    const handles = ["a", "b", "c", "d", "e"].map((text) => C.toast(text, { duration: 0 }));
    const region = dom.getElementById("ui-toasts");
    expect(region.getAttribute("aria-live")).toBe("polite");
    expect(region.querySelectorAll(".ui-toast-item").length).toBe(3);
    handles[0].dismiss();
    await tick();
    await tick();
    expect(region.textContent).toContain("d");
    for (const h of handles) h.dismiss();
    await tick();
    await tick();
    await tick();
    expect(region.querySelectorAll(".ui-toast-item").length).toBe(0);
  });
  test("undo toast has an Undo button that calls back once", async () => {
    let undone = 0;
    C.undoToast("Hidden", () => { undone += 1; });
    const undo = dom.getElementById("ui-toasts").querySelectorAll("button").find((b) => b.textContent.includes("Undo"));
    expect(undo).toBeTruthy();
    undo.click();
    await tick();
    expect(undone).toBe(1);
  });
  test("message text is text, not markup", () => {
    C.toast("<img src=x onerror=alert(1)>", { duration: 0 });
    const region = dom.getElementById("ui-toasts");
    expect(region.querySelectorAll("img").length).toBe(0);
    expect(region.textContent).toContain("<img");
  });
});

describe("T-204: dialogs", () => {
  test("a modal traps Tab, closes on Escape and returns focus", async () => {
    const opener = C.button({ label: "Open" });
    dom.body.append(opener);
    opener.focus();
    const a = C.button({ label: "One" });
    const b = C.button({ label: "Two" });
    const layer = C.modal({ title: "Hello", body: [a, b] });
    expect(layer.el.getAttribute("role")).toBe("dialog");
    expect(layer.el.getAttribute("aria-modal")).toBe("true");
    expect(dom.activeElement).toBe(layer.el);
    dom.press("Tab");
    expect(dom.activeElement.getAttribute("aria-label")).toBe("Close");
    dom.press("Tab");
    expect(dom.activeElement).toBe(a);
    dom.press("Tab");
    expect(dom.activeElement).toBe(b);
    dom.press("Tab");
    expect(dom.activeElement.getAttribute("aria-label")).toBe("Close");
    dom.press("Tab", { shiftKey: true });
    expect(dom.activeElement).toBe(b);
    dom.press("Tab", { shiftKey: true });
    dom.press("Tab", { shiftKey: true });
    dom.press("Tab", { shiftKey: true });
    expect(dom.activeElement).toBe(b);
    dom.press("Escape");
    await layer.result;
    expect(dom.activeElement).toBe(opener);
    expect(dom.documentElement.querySelectorAll(".ui-overlay").length).toBe(0);
  });
  test("the dialog title labels the dialog", () => {
    const layer = C.modal({ title: "Delete it", body: "x" });
    const id = layer.el.getAttribute("aria-labelledby");
    expect(dom.getElementById(id).textContent).toBe("Delete it");
    layer.close();
  });
  test("confirm resolves true on the confirm button and false on cancel", async () => {
    const yes = C.confirmDialog({ title: "Write files?", message: "Two files change.", confirmLabel: "Write" });
    dom.documentElement.querySelectorAll("button").find((x) => x.textContent === "Write").click();
    expect(await yes).toBe(true);
    const no = C.confirmDialog({ title: "Write files?", message: "Two files change." });
    dom.documentElement.querySelectorAll("button").find((x) => x.textContent === "Cancel").click();
    expect(await no).toBe(false);
  });
  test("a dangerous confirm focuses Cancel and Escape means no", async () => {
    const answer = C.confirmDialog({ title: "Revoke", message: "It stops working.", confirmLabel: "Revoke", danger: true });
    expect(dom.activeElement.textContent).toBe("Cancel");
    dom.press("Escape");
    expect(await answer).toBe(false);
  });
  test("a click on the backdrop closes", async () => {
    const layer = C.modal({ title: "t", body: "b" });
    const overlay = dom.documentElement.querySelector(".ui-overlay");
    overlay.dispatch("mousedown", { target: overlay });
    await layer.result;
    expect(dom.documentElement.querySelectorAll(".ui-overlay").length).toBe(0);
  });
  test("the app root is inert while a dialog is open", async () => {
    const root = dom.createElement("div");
    root.setAttribute("id", "ui-app");
    dom.body.append(root);
    const layer = C.modal({ title: "t", body: "b" });
    expect(root.getAttribute("inert")).toBe("");
    layer.close();
    await layer.result;
    expect(root.getAttribute("inert")).toBeNull();
  });
  test("a drawer is a dialog too", () => {
    const layer = C.drawer({ title: "Details", body: "x" });
    expect(layer.el.classList.contains("ui-drawer")).toBe(true);
    layer.close();
  });
  test("prompt returns the typed text", async () => {
    const answer = C.promptDialog({ title: "Edit", label: "Rule", value: "old" });
    const input = dom.documentElement.querySelector("input");
    input.value = "  new text ";
    dom.documentElement.querySelectorAll("button").find((x) => x.textContent === "Save").click();
    expect(await answer).toBe("new text");
  });
});

describe("T-204: tabs, segmented control, toggle", () => {
  test("tabs expose roles and the active one", () => {
    const t = C.tabs({ items: [{ id: "a", label: "A" }, { id: "b", label: "B", count: 1200 }], active: "a", label: "Views" });
    expect(t.getAttribute("role")).toBe("tablist");
    const [a, b] = t.querySelectorAll("button");
    expect(a.getAttribute("aria-selected")).toBe("true");
    expect(b.getAttribute("aria-selected")).toBe("false");
    expect(b.getAttribute("tabindex")).toBe("-1");
    expect(b.textContent).toContain("1,200");
  });
  test("arrow keys move and notify; setActive does not notify", () => {
    const seen = [];
    const t = C.tabs({ items: [{ id: "a", label: "A" }, { id: "b", label: "B" }, { id: "c", label: "C" }], active: "a", onChange: (id) => seen.push(id) });
    dom.body.append(t);
    const [a, , c] = t.querySelectorAll("button");
    a.focus();
    dom.press("ArrowRight");
    expect(seen).toEqual(["b"]);
    dom.press("End");
    expect(seen).toEqual(["b", "c"]);
    expect(c.getAttribute("aria-selected")).toBe("true");
    t.setActive("a");
    expect(seen.length).toBe(2);
  });
  test("link tabs render anchors", () => {
    const t = C.tabs({ items: [{ id: "w", label: "Work", href: "#/work" }], active: "w" });
    expect(t.querySelector("a").getAttribute("href")).toBe("#/work");
  });
  test("segmented control is a radio group", () => {
    let value = null;
    const s = C.segmented({ options: [{ value: "x", label: "X" }, { value: "y", label: "Y" }], value: "x", label: "Mode", onChange: (v) => { value = v; } });
    expect(s.getAttribute("role")).toBe("radiogroup");
    const [x, y] = s.querySelectorAll("button");
    expect(x.getAttribute("aria-checked")).toBe("true");
    y.click();
    expect(value).toBe("y");
    expect(y.getAttribute("aria-checked")).toBe("true");
    expect(x.getAttribute("aria-checked")).toBe("false");
  });
  test("a switch flips and reports", () => {
    let on = null;
    const t = C.toggle({ label: "Pulse", checked: false, onChange: (v) => { on = v; } });
    const sw = t.querySelector("button");
    expect(sw.getAttribute("role")).toBe("switch");
    sw.click();
    expect(on).toBe(true);
    expect(sw.getAttribute("aria-checked")).toBe("true");
  });
  test("chip filters: single and multi", () => {
    let last;
    const single = C.chipFilters({ options: [{ value: "a", label: "A", count: 3 }, { value: "b", label: "B" }], value: "a", onChange: (v) => { last = v; } });
    const [a, b] = single.querySelectorAll("button");
    expect(a.getAttribute("aria-pressed")).toBe("true");
    b.click();
    expect(last).toBe("b");
    expect(a.getAttribute("aria-pressed")).toBe("false");
    const multi = C.chipFilters({ options: [{ value: "a", label: "A" }, { value: "b", label: "B" }], value: [], multi: true, onChange: (v) => { last = v; } });
    multi.querySelectorAll("button").forEach((x) => x.click());
    expect(last.sort()).toEqual(["a", "b"]);
  });
});

describe("T-204: popover and tooltip", () => {
  test("a popover opens on click, closes on Escape and gives focus back", () => {
    const anchor = C.button({ label: "Server" });
    dom.body.append(anchor);
    const pop = C.popover({ anchor, content: () => dom.createElement("p"), label: "Server details" });
    expect(anchor.getAttribute("aria-expanded")).toBe("false");
    anchor.click();
    expect(pop.isOpen()).toBe(true);
    expect(anchor.getAttribute("aria-expanded")).toBe("true");
    pop.el.dispatch("keydown", { key: "Escape" });
    expect(pop.isOpen()).toBe(false);
    expect(dom.activeElement).toBe(anchor);
  });
  test("a click outside closes it", () => {
    const anchor = C.button({ label: "x" });
    dom.body.append(anchor);
    const pop = C.popover({ anchor, content: "hello" });
    anchor.click();
    dom.body.dispatch("mousedown", { target: dom.body });
    expect(pop.isOpen()).toBe(false);
  });
  test("a tooltip is the element's description and shows on focus", () => {
    const target = C.button({ label: "?" });
    dom.body.append(target);
    C.withTooltip(target, "Explains the thing");
    const id = target.getAttribute("aria-describedby");
    target.focus();
    expect(dom.getElementById(id).textContent).toBe("Explains the thing");
    expect(dom.getElementById(id).getAttribute("role")).toBe("tooltip");
  });
});

describe("T-204: progress, tiles, skeletons", () => {
  test("a determinate bar carries its value and a text", () => {
    const p = C.progressBar({ value: 40, max: 200, label: "Import" });
    const bar = p.querySelector(".ui-progress");
    expect(bar.getAttribute("role")).toBe("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("40");
    expect(bar.getAttribute("aria-valuemax")).toBe("200");
    expect(p.textContent).toContain("20%");
    p.update({ value: 200 });
    expect(p.textContent).toContain("100%");
  });
  test("an indeterminate bar has no value", () => {
    const p = C.progressBar({ label: "Export" });
    const bar = p.querySelector(".ui-progress");
    expect(bar.classList.contains("is-indeterminate")).toBe(true);
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    p.update({ value: 5, max: 10 });
    expect(bar.classList.contains("is-indeterminate")).toBe(false);
  });
  test("a stat tile shows a dash for no value and a number once known", () => {
    expect(C.statTile({ label: "Memories", value: null }).textContent).toContain("—");
    const t = C.statTile({ label: "Memories", value: 1234 });
    expect(t.textContent).toContain("Memories");
    t.update(2000);
    expect(t.querySelector(".ui-stat-value").textContent).toBe("2,000");
  });
  test("skeletons are hidden from screen readers and sized by count", () => {
    const s = C.skeleton({ kind: "card", count: 3 });
    expect(s.getAttribute("aria-hidden")).toBe("true");
    expect(s.querySelectorAll(".ui-skel-item").length).toBe(3);
    expect(C.skeleton({ kind: "lines", lines: 4, count: 1 }).querySelectorAll(".ui-skel-block").length).toBe(4);
  });
  test("the loader announces its text", () => {
    const l = C.brainLoader({ text: "Loading memories" });
    expect(l.getAttribute("role")).toBe("status");
    expect(l.textContent).toBe("Loading memories");
    expect(l.querySelectorAll("circle").length).toBe(17);
  });
});

describe("T-204: empty and error states", () => {
  test("empty state shows the fix command with a copy button", async () => {
    const e = C.emptyState({ title: "Nothing yet", text: "Install capture.", command: "aletheia install claude-code" });
    dom.body.append(e);
    expect(e.textContent).toContain("aletheia install claude-code");
    e.querySelector("button").click();
    await tick();
    expect(globalThis.navigator.clipboard.written).toEqual(["aletheia install claude-code"]);
  });
  test("error state has Retry and Copy details", async () => {
    let retried = 0;
    const e = C.errorState({ message: "Server said no", onRetry: async () => { retried += 1; }, error: Object.assign(new Error("x"), { status: 500, path: "/api/hub/facts" }) });
    dom.body.append(e);
    expect(e.getAttribute("role")).toBe("alert");
    const [retry, copy] = e.querySelectorAll("button");
    expect(retry.textContent).toBe("Retry");
    retry.click();
    await tick();
    expect(retried).toBe(1);
    copy.click();
    await tick();
    const written = globalThis.navigator.clipboard.written.at(-1);
    expect(written).toContain("request: /api/hub/facts");
    expect(written).toContain("status: 500");
    expect(written).toContain("message: Server said no");
  });
  test("banner updates its text", () => {
    const b = C.banner({ tone: "danger", text: "Connection lost" });
    b.setText("Retrying in 5 s");
    expect(b.textContent).toContain("Retrying in 5 s");
  });
});

describe("T-204: the pager", () => {
  test("labels, current page and disabled ends", () => {
    const p = C.pager({ total: 312, limit: 25, offset: 0, onChange() {} });
    expect(p.getAttribute("aria-label")).toBe("Pagination");
    expect(p.textContent).toContain("Showing 1 to 25 of 312");
    expect(p.querySelector(".ui-pager-prev").disabled).toBe(true);
    expect(p.querySelector(".ui-pager-next").disabled).toBe(false);
    expect(p.querySelector(".ui-pager-page.on").getAttribute("aria-current")).toBe("page");
  });
  test("clicks give an offset and a limit", () => {
    const seen = [];
    const p = C.pager({ total: 312, limit: 25, offset: 50, onChange: (v) => seen.push(v) });
    p.querySelector(".ui-pager-next").click();
    p.querySelector(".ui-pager-first").click();
    p.querySelector(".ui-pager-last").click();
    expect(seen).toEqual([{ offset: 75, limit: 25 }, { offset: 0, limit: 25 }, { offset: 300, limit: 25 }]);
  });
  test("the size select offers 10, 25, 50, 100 and resets to the first page", () => {
    const seen = [];
    const p = C.pager({ total: 312, limit: 25, offset: 50, onChange: (v) => seen.push(v) });
    const select = p.querySelector("select");
    expect(select.querySelectorAll("option").map((o) => o.textContent)).toEqual(["10 per page", "25 per page", "50 per page", "100 per page"]);
    select.dispatch("change", { target: { value: "50" } });
    expect(seen).toEqual([{ offset: 0, limit: 50 }]);
  });
  test("arrow keys inside the pager change page", () => {
    const seen = [];
    const p = C.pager({ total: 100, limit: 10, offset: 20, onChange: (v) => seen.push(v) });
    p.dispatch("keydown", { key: "ArrowRight" });
    p.dispatch("keydown", { key: "ArrowLeft" });
    expect(seen).toEqual([{ offset: 30, limit: 10 }, { offset: 10, limit: 10 }]);
  });
  test("an empty list says so and has no active buttons", () => {
    const p = C.pager({ total: 0, limit: 25, offset: 0, onChange() {} });
    expect(p.textContent).toContain("No results");
    expect(p.querySelector(".ui-pager-next").disabled).toBe(true);
  });
  test("a list enters with a stagger index", () => {
    const items = [0, 1, 2].map(() => dom.createElement("div"));
    const list = C.listView({ items });
    expect(list.getAttribute("role")).toBe("list");
    expect(items[2].style.props["--i"]).toBe("2");
    expect(items[0].classList.contains("ui-rise")).toBe(true);
  });
});

describe("T-204: text components", () => {
  test("highlight marks matches and keeps hostile text as text", () => {
    const el = C.highlight("<b>Retry</b> and retry", "retry");
    expect(el.querySelectorAll("mark").length).toBe(2);
    expect(el.querySelectorAll("b").length).toBe(0);
    expect(el.textContent).toBe("<b>Retry</b> and retry");
    expect(el.getAttribute("dir")).toBe("auto");
  });
  test("clamp shows the button only when text overflows", () => {
    const short = C.clampText({ text: "short" });
    short.measure();
    expect(short.querySelector("button").hidden).toBe(true);
    const long = C.clampText({ text: "long ".repeat(500) });
    long.querySelector(".ui-clamp-body").scrollHeight = 400;
    long.querySelector(".ui-clamp-body").clientHeight = 80;
    long.measure();
    const more = long.querySelector("button");
    expect(more.hidden).toBe(false);
    more.click();
    expect(more.textContent).toBe("Show less");
    expect(more.getAttribute("aria-expanded")).toBe("true");
    expect(long.querySelector(".ui-clamp-body").classList.contains("is-open")).toBe(true);
  });
  test("disclosure toggles aria-expanded", async () => {
    const d = C.disclosure({ summary: "More", content: "body" });
    const head = d.querySelector("button");
    expect(head.getAttribute("aria-expanded")).toBe("false");
    head.click();
    await tick();
    expect(head.getAttribute("aria-expanded")).toBe("true");
  });
  test("code block carries the language and the whitespace", () => {
    const c = C.codeBlock({ code: "a\n  b", lang: "sh" });
    expect(c.querySelector(".ui-md-lang").textContent).toBe("sh");
    expect(c.querySelector("pre").textContent).toBe("a\n  b");
  });
  test("a time element has the exact time in its title", () => {
    const t = C.timeEl(Date.now() - 180_000);
    expect(t.textContent).toBe("3 min ago");
    expect(t.getAttribute("title").length).toBeGreaterThan(5);
    expect(t.getAttribute("datetime")).toMatch(/T/);
  });
  test("mono copies its text", async () => {
    const m = C.mono("abc-123");
    m.querySelector("button").click();
    await tick();
    expect(globalThis.navigator.clipboard.written).toContain("abc-123");
  });
  test("timeline renders each item", () => {
    const t = C.timeline([{ title: "Started", at: Date.now() }, { title: "Done", text: "ok", tone: "success" }]);
    expect(t.querySelectorAll("li").length).toBe(2);
    expect(serialize(t)).toContain("Done");
  });
  test("a card with a title and actions", () => {
    const c = C.card({ title: "Rules", actions: [C.button({ label: "Add" })], children: ["body"] });
    expect(c.querySelector("h3").textContent).toBe("Rules");
    expect(c.querySelector("button").textContent).toBe("Add");
  });
  test("a status dot says what it is when labelled", () => {
    const d = C.statusDot("error", { label: "Server down" });
    expect(d.getAttribute("role")).toBe("img");
    expect(d.getAttribute("aria-label")).toBe("Server down");
    expect(d.classList.contains("is-error")).toBe(true);
  });
});

afterAll(() => restoreGlobals());
