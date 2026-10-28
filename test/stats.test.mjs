import { describe, expect, test } from "bun:test";
import { bootstrapMeanCI, exactMatch, mulberry32, normalizeAnswer } from "../bench/lib/stats.mjs";

describe("bench/lib/stats.mjs", () => {
  test("the seeded bootstrap reproduces the same CI", () => {
    const values = [1, 0, 1, 0, 1, 0, 0, 1, 1, 0];
    const a = bootstrapMeanCI(values, { seed: 7, iterations: 2000 });
    const b = bootstrapMeanCI(values, { seed: 7, iterations: 2000 });
    expect(a.ci95).toEqual(b.ci95);
    expect(a.n).toBe(10);
    expect(a.mean).toBeCloseTo(0.5);
  });

  test("the bootstrap returns n, mean and a bounded CI", () => {
    const values = [1, 0, 1, 1, 0, 0, 1, 0, 1, 0, 1, 1];
    const result = bootstrapMeanCI(values, { seed: 1 });
    expect(result.n).toBe(values.length);
    expect(result.mean).toBeGreaterThan(0);
    expect(result.mean).toBeLessThan(1);
    expect(result.ci95[0]).toBeGreaterThanOrEqual(0);
    expect(result.ci95[1]).toBeLessThanOrEqual(1);
    expect(result.ci95[0]).toBeLessThanOrEqual(result.ci95[1]);
  });

  test("empty input has no mean or CI", () => {
    expect(bootstrapMeanCI([])).toEqual({ n: 0, mean: null, ci95: [null, null] });
  });

  test("exactMatch normalizes case and punctuation", () => {
    expect(exactMatch("  Value-7 ", "value 7")).toBe(true);
    expect(exactMatch("Paris, France.", "paris france")).toBe(true);
    expect(exactMatch("Paris", "London")).toBe(false);
    expect(exactMatch("", "x")).toBe(false);
  });

  test("normalizeAnswer and mulberry32 are deterministic", () => {
    expect(normalizeAnswer("  A. b-c  ")).toBe("a b c");
    expect(mulberry32(1)()).toBe(mulberry32(1)());
  });
});
