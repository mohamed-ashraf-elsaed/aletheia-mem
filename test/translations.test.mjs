// ten translations keep the code, badges and generated tables unchanged, and say they are machine-made.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path) => readFileSync(join(root, path), "utf8");
const codes = ["zh", "es", "pt-br", "ja", "de", "fr", "ko", "hi", "ar", "ru"];
const english = read("README.md");

// the npm version badge was added to the top block after the translations were made (docs/tasks/unverified.md).
const NOT_TRANSLATED = ["https://img.shields.io/npm/v/aletheia-mem"];
const fences = (text) => [...text.matchAll(/```[\s\S]*?```/g)].map((match) => match[0]);
const generated = (text) => [...text.matchAll(/<!-- gen:([a-z]+) -->[\s\S]*?<!-- \/gen:\1 -->/g)].map((match) => match[0]);
const badges = (text) => [...text.matchAll(/https:\/\/(?:img\.shields\.io|github\.com\/[^)\s]+\/badge\.svg)[^)\s]*/g)].map((match) => match[0]);

describe("README translations", () => {
  test("all ten files exist and carry the machine-translation header", () => {
    for (const code of codes) {
      const path = `docs/i18n/README.${code}.md`;
      expect(existsSync(join(root, path))).toBe(true);
      const text = read(path);
      expect(text.startsWith("> Machine-translated from the English README on 2026-10-26.")).toBe(true);
      expect(text).toMatch(/source-sha256: [0-9a-f]{64}/);
      expect(text).not.toContain("reviewed by");
    }
  });

  test("code blocks, badge URLs and generated tables are byte-identical to English", () => {
    for (const code of codes) {
      const text = read(`docs/i18n/README.${code}.md`);
      expect(fences(text)).toEqual(fences(english));
      expect(generated(text)).toEqual(generated(english));
      expect(badges(text)).toEqual(badges(english).filter((url) => !NOT_TRANSLATED.includes(url)));
    }
  });

  test("Arabic is wrapped for right-to-left reading", () => {
    const text = read("docs/i18n/README.ar.md");
    expect(text).toContain('<div dir="rtl">');
    expect(text.trimEnd().endsWith("</div>")).toBe(true);
  });

  test("each translation links to the other nine and to English", () => {
    for (const code of codes) {
      const text = read(`docs/i18n/README.${code}.md`);
      expect(text).toContain("[English](../../README.md)");
      for (const other of codes) expect(text).toContain(`README.${other}.md`);
    }
  });
});
