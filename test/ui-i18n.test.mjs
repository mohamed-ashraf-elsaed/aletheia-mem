// The dashboard's language layer: the t() helper, the language choice, the catalogue files and the checker.
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LANGS, STORAGE_KEY, applyLang, detectLang, getLang, initLang, registerCatalogue, resetLang, setLang, t } from "../public/ui-i18n.js";
import { TABS } from "../public/ui-core.js";
import { checkUi, scanLiterals } from "../scripts/i18n-check.mjs";
import { installFakeDom, restoreGlobals } from "./support/fake-dom.mjs";

const ROOT = join(import.meta.dir, "..");
const CODES = ["ar", "de", "es", "fr", "hi", "ja", "ko", "pt-br", "ru", "zh"];
const read = (code) => JSON.parse(readFileSync(join(ROOT, "public", "i18n", `${code}.json`), "utf8"));
const keysOf = (doc) => Object.keys(doc).filter((key) => !key.startsWith("_")).sort();
const vars = (text) => [...String(text).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
const memoryStorage = (initial = {}) => {
  const data = { ...initial };
  return { getItem: (k) => (k in data ? data[k] : null), setItem: (k, v) => { data[k] = String(v); }, removeItem: (k) => { delete data[k]; }, data };
};

beforeEach(() => resetLang());
afterEach(() => { restoreGlobals(); resetLang(); });

describe("t()", () => {
  test("English is the default and an unknown key shows the key", () => {
    expect(getLang()).toBe("en");
    expect(t("nav.home")).toBe("Home");
    expect(t("no.such.key")).toBe("no.such.key");
  });
  test("fills {placeholders} and leaves an unknown one visible", () => {
    registerCatalogue("en", { "x.hello": "Hello {name}, {n} left", "x.odd": "Value {missing}" });
    expect(t("x.hello", { name: "Ada", n: 3 })).toBe("Hello Ada, 3 left");
    expect(t("x.odd", {})).toBe("Value {missing}");
  });
  test("picks a plural form from count", () => {
    registerCatalogue("en", { "x.item.one": "{count} item", "x.item.other": "{count} items" });
    expect(t("x.item", { count: 1 })).toBe("1 item");
    expect(t("x.item", { count: 0 })).toBe("0 items");
    expect(t("x.item", { count: 5 })).toBe("5 items");
  });
  test("a language with more plural forms uses them and falls back to other", () => {
    registerCatalogue("en", { "x.file.other": "{count} files" });
    registerCatalogue("ar", { "x.file.one": "ملف واحد", "x.file.few": "{count} ملفات", "x.file.other": "{count} ملف" });
    setLang("ar");
    expect(t("x.file", { count: 1 })).toBe("ملف واحد");
    expect(t("x.file", { count: 3 })).toBe("3 ملفات");
    expect(t("x.file", { count: 100 })).toBe("100 ملف");
  });
  test("a missing key in the chosen language falls back to English, key by key", () => {
    registerCatalogue("en", { "x.a": "Alpha", "x.b": "Beta" });
    registerCatalogue("de", { "x.a": "Alfa" });
    setLang("de");
    expect(t("x.a")).toBe("Alfa");
    expect(t("x.b")).toBe("Beta");
  });
});

describe("choosing the language", () => {
  test("the browser language picks a supported language", () => {
    expect(detectLang(["de-DE", "en"])).toBe("de");
    expect(detectLang(["pt-BR"])).toBe("pt-br");
    expect(detectLang(["pt-PT"])).toBe("pt-br");
    expect(detectLang(["zh-TW"])).toBe("zh");
    expect(detectLang(["ar-EG"])).toBe("ar");
    expect(detectLang(["sv", "ko-KR"])).toBe("ko");
    expect(detectLang(["sv"])).toBe("en");
    expect(detectLang([])).toBe("en");
  });
  test("a saved choice wins over the browser and is written when it changes", async () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "ja" });
    const lang = await initLang({ languages: ["de"], storage, load: async () => ({ "x.a": "x" }) });
    expect(lang).toBe("ja");
    await setLang("ko", { storage, load: async () => ({}) });
    expect(storage.data[STORAGE_KEY]).toBe("ko");
    expect(getLang()).toBe("ko");
  });
  test("with nothing saved the browser language is used, and storage that throws is tolerated", async () => {
    const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
    expect(await initLang({ languages: ["fr-CA"], storage: broken, load: async () => ({}) })).toBe("fr");
    await setLang("es", { storage: broken, load: async () => ({}) });
    expect(getLang()).toBe("es");
  });
  test("an unsupported saved value is ignored", async () => {
    const storage = memoryStorage({ [STORAGE_KEY]: "xx" });
    expect(await initLang({ languages: ["de"], storage, load: async () => ({}) })).toBe("de");
  });
  test("Arabic sets dir=rtl and lang on the document; the others are ltr", () => {
    const doc = installFakeDom();
    const root = doc.documentElement;
    applyLang("ar", doc);
    expect(root.getAttribute("dir")).toBe("rtl");
    expect(root.getAttribute("lang")).toBe("ar");
    applyLang("de", doc);
    expect(root.getAttribute("dir")).toBe("ltr");
    expect(root.getAttribute("lang")).toBe("de");
    applyLang("pt-br", doc);
    expect(root.getAttribute("lang")).toBe("pt-BR");
  });
  test("the languages are English plus every README translation", () => {
    const readme = readdirSync(join(ROOT, "docs", "i18n")).map((f) => /^README\.(.+)\.md$/.exec(f)?.[1]).filter(Boolean).sort();
    expect(readme).toEqual(CODES);
    expect(LANGS.map((l) => l.code).sort()).toEqual(["en", ...CODES].sort());
    expect(LANGS.find((l) => l.code === "ar").dir).toBe("rtl");
  });
});

describe("English still renders with the default language", () => {
  test("the tab labels", () => {
    expect(TABS.map((tab) => tab.label)).toEqual(["Home", "Activity", "Knowledge", "Rules", "Connections"]);
  });
});

describe("catalogue files", () => {
  const en = read("en");
  test("English has plenty of keys and no empty value", () => {
    expect(keysOf(en).length).toBeGreaterThan(300);
    for (const key of keysOf(en)) expect(String(en[key]).trim()).not.toBe("");
  });
  for (const code of CODES) {
    test(`${code}: same keys as English, same placeholders, marked machine-translated`, () => {
      const doc = read(code);
      expect(doc._meta?.machineTranslated).toBe(true);
      expect(typeof doc._meta?.note).toBe("string");
      const missing = keysOf(en).filter((key) => !(key in doc));
      const extra = keysOf(doc).filter((key) => !(key in en) && !/\.(?:zero|two|few|many)$/.test(key));
      expect({ missing: missing.slice(0, 10), extra: extra.slice(0, 10) }).toEqual({ missing: [], extra: [] });
      const bad = keysOf(en).filter((key) => !key.endsWith(".one") && vars(en[key]) !== vars(doc[key]));
      expect(bad.slice(0, 10)).toEqual([]);
    });
  }
  test("a missing key in a language file is reported by the checker", () => {
    const root = mkdtempSync(join(tmpdir(), "i18n-ui-"));
    try {
      mkdirSync(join(root, "public", "i18n"), { recursive: true });
      mkdirSync(join(root, "public", "tabs"), { recursive: true });
      writeFileSync(join(root, "public", "i18n", "en.json"), JSON.stringify({ "a.one": "One", "a.two": "Two" }));
      writeFileSync(join(root, "public", "i18n", "de.json"), JSON.stringify({ _meta: { machineTranslated: true, note: "x" }, "a.one": "Eins" }));
      const result = checkUi({ root, codes: ["de"] });
      expect(result.ok).toBe(false);
      expect(result.problems.join("\n")).toMatch(/de\.json: missing key a\.two/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});

describe("no English text outside the catalogue", () => {
  test("the scanner finds a visible literal and skips code-like strings", () => {
    const source = [
      'import { h } from "../ui-dom.js";',
      'const a = h("p", { class: "ui-meta" }, "Nothing to show here");',
      'const b = h("button", { "aria-label": "Close" }, "x");',
      'const c = t("home.title");',
      'const msg = `Saved ${n} items`;',
      "const e = h('div', { id: 'ui-main' });",
      'const f = fetch("/api/hub/settings");',
      "// a comment with some words",
    ].join("\n");
    const found = scanLiterals(source).map((hit) => hit.text);
    expect(found).toEqual(["Nothing to show here", "Close", "Saved ${n} items"]);
  });
  test("every tab module is free of untranslated literals (the exceptions are listed in the checker)", () => {
    const result = checkUi({ root: ROOT });
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
