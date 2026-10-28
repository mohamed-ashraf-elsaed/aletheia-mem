import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrast, report, themeTokens } from "../scripts/contrast.mjs";

const css = readFileSync(join(import.meta.dir, "..", "public", "ui-theme.css"), "utf8");

describe("design tokens", () => {
  test("contrast maths matches known values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  test("every text pair meets 4.5:1 and every control edge 3:1 in both themes", () => {
    const rows = report();
    expect(rows.length).toBeGreaterThan(40);
    expect(rows.filter((row) => row.ratio < row.min).map((row) => `${row.theme} ${row.fg}/${row.bg} ${row.ratio.toFixed(2)}`)).toEqual([]);
  });

  test("the automatic light theme and the manual light theme define the same tokens", () => {
    const { light, lightAuto } = themeTokens(css);
    expect(lightAuto).toEqual(light);
  });

  test("light overrides every theme token the dark theme sets", () => {
    const { dark, light } = themeTokens(css);
    expect(Object.keys(light).sort()).toEqual(Object.keys(dark).sort());
  });

  test("the stylesheet loads nothing from outside", () => {
    expect(css).not.toMatch(/@import|url\(|https?:\/\//);
  });

  test("reduced motion collapses every duration token", () => {
    expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*--ui-dur: 0\.01ms/);
  });
});
