// accessibility and theme pass on the one-page app. This file covers what is runnable offline with the fake
// DOM: the theme persists and is applied before the first paint, and every interactive control the app builds is
// named and keyboard-reachable. The axe run and the 375 px / 1280 px browser keyboard walk need a browser install and
// are UNVERIFIED (see the task Evidence).
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";
import { THEMES, THEME_KEY, applyTheme, readTheme } from "../public/ui-theme.js";

let dom;
const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));
const flush = async () => { for (let i = 0; i < 5; i += 1) await tick(); };
const memoryStorage = (seed = {}) => { const data = { ...seed }; return { getItem: (key) => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = value; }, removeItem: (key) => { delete data[key]; } }; };

const INTERACTIVE = new Set(["button", "a", "input", "select", "textarea"]);

function nameOf(el, doc) {
  const aria = el.getAttribute("aria-label");
  if (aria && aria.trim()) return aria.trim();
  const by = el.getAttribute("aria-labelledby");
  if (by) { const text = by.split(/\s+/).map((id) => doc.getElementById(id)?.textContent ?? "").join(" ").trim(); if (text) return text; }
  for (let node = el.parentNode; node; node = node.parentNode) if (node.tag === "label" && node.textContent.trim()) return node.textContent.trim();
  const own = el.textContent.trim();
  if (own) return own;
  return el.getAttribute("title") ?? el.getAttribute("placeholder") ?? "";
}

function keyboardProblems(container, doc, label) {
  const problems = [];
  for (const el of container.all()) {
    if (!INTERACTIVE.has(el.tag)) continue;
    const type = el.getAttribute("type");
    if (el.tag === "input" && type === "hidden") continue;
    if (el.tag === "a" && el.getAttribute("href") == null) continue;
    if (el.getAttribute("disabled") != null) problems.push(`${label}: disabled ${el.tag}.${el.className} is unreachable`);
    if (el.getAttribute("tabindex") != null && Number(el.getAttribute("tabindex")) < 0) problems.push(`${label}: ${el.tag}.${el.className} removed from the tab order`);
    if (!nameOf(el, doc)) problems.push(`${label}: ${el.tag}.${el.className} has no accessible name`);
  }
  return problems;
}

beforeEach(() => { dom = installFakeDom(); });
afterAll(() => restoreGlobals());

describe("theme", () => {
  test("the preference persists across sessions", () => {
    const storage = memoryStorage();
    expect(applyTheme("dark", { root: dom.documentElement, storage })).toBe("dark");
    expect(readTheme(storage)).toBe("dark");
    expect(dom.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(applyTheme("light", { root: dom.documentElement, storage })).toBe("light");
    expect(readTheme(storage)).toBe("light");
    expect(THEMES).toEqual(["auto", "dark", "light"]);
  });

  test("a saved theme is applied before the first paint", () => {
    const html = readFileSync(join(import.meta.dir, "..", "public", "index.html"), "utf8");
    const early = readFileSync(join(import.meta.dir, "..", "public", "ui-theme-init.js"), "utf8");
    // the init script is a classic <script> in <head>, before the stylesheet, so no wrong theme is painted
    expect(html.indexOf("ui-theme-init.js")).toBeLessThan(html.indexOf("ui-theme.css"));
    expect(early).toContain(THEME_KEY);
    expect(early).toContain('pref === "dark" || pref === "light"');
    expect(early).toContain("try");
  });
});

describe("keyboard reachability", () => {
  test("every interactive control in the settings view is named and focusable", async () => {
    const S = await import("../public/tabs/settings.js");
    globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ settings: [{ key: "provider", label: "Provider", kind: "string", secret: false, value: "none" }, { key: "redaction", label: "Redact before storing", kind: "boolean", secret: false, value: false }, { key: "apiKey", label: "API key", kind: "string", secret: true, value: "••••••••", set: true }] }) });
    const view = S.settingsView();
    await flush();
    expect(keyboardProblems(view, dom.document, "settings")).toEqual([]);
    const tabbables = view.all().filter((el) => INTERACTIVE.has(el.tag) && el.getAttribute("type") !== "hidden" && (el.tag !== "a" || el.getAttribute("href") != null));
    expect(tabbables.length).toBeGreaterThan(0);
    expect(tabbables.every((el) => el.getAttribute("disabled") == null)).toBe(true);
  });
});
