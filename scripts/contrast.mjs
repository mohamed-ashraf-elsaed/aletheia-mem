#!/usr/bin/env bun
// Computes WCAG 2 contrast ratios for the text pairs in public/ui-theme.css. Run it to print the table.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const hex = (value) => {
  const m = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!m) throw new Error(`not a hex colour: ${value}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
};
const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = (value) => {
  const [r, g, b] = hex(value).map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Token maps for each theme, read from the CSS source. */
export function themeTokens(css = readFileSync(join(import.meta.dir, "..", "public", "ui-theme.css"), "utf8")) {
  const block = (selector) => {
    const start = css.indexOf(selector);
    if (start < 0) throw new Error(`missing ${selector}`);
    const open = css.indexOf("{", start);
    const close = css.indexOf("}", open);
    const tokens = {};
    for (const m of css.slice(open + 1, close).matchAll(/--ui-([\w-]+):\s*([^;]+);/g)) tokens[m[1]] = m[2].trim();
    return tokens;
  };
  return {
    dark: block(":root {"),
    light: block(':root[data-theme="light"]'),
    lightAuto: block(':root:not([data-theme="dark"]) {'),
  };
}

/** Text pairs that must reach 4.5:1 (normal text), and non-text pairs that must reach 3:1. */
export const TEXT_PAIRS = [
  ["text", "s0"], ["text", "s1"], ["text", "s2"], ["text", "s3"],
  ["muted", "s0"], ["muted", "s1"], ["muted", "s2"], ["muted", "s3"],
  ["accent", "s0"], ["accent", "s1"], ["accent", "s2"],
  ["accent-ink", "accent"],
  ["success", "s1"], ["warning", "s1"], ["danger", "s1"], ["info", "s1"],
  ["success", "s2"], ["warning", "s2"], ["danger", "s2"], ["info", "s2"],
];
export const UI_PAIRS = [["border-strong", "s0"], ["border-strong", "s1"], ["accent", "s0"], ["accent", "s1"]];

export function report() {
  const themes = themeTokens();
  const rows = [];
  for (const name of ["dark", "light"]) {
    for (const [fg, bg] of TEXT_PAIRS) rows.push({ theme: name, fg, bg, ratio: contrast(themes[name][fg], themes[name][bg]), min: 4.5 });
    for (const [fg, bg] of UI_PAIRS) rows.push({ theme: name, fg, bg, ratio: contrast(themes[name][fg], themes[name][bg]), min: 3 });
  }
  return rows;
}

if (import.meta.main) {
  for (const row of report()) console.log(`${row.theme.padEnd(5)} ${row.fg.padEnd(13)} on ${row.bg.padEnd(3)} ${row.ratio.toFixed(2)}:1  (min ${row.min}) ${row.ratio >= row.min ? "pass" : "FAIL"}`);
}
