import { describe, expect, test } from "bun:test";
import { assertSameGoldIds, assertSameQuestions, normalizeQuestion, waitForIndex } from "../bench/lib/protocol.mjs";

const sample = (name, questions, gold) => ({
  name,
  items: questions.map((question, index) => ({ question, goldIds: gold[index] })),
});

describe("bench protocol", () => {
  test("waitForIndex polls until the count is stable and returns the settle time", async () => {
    let polls = 0;
    const countFn = () => {
      polls += 1;
      return 42;
    };
    const result = await waitForIndex(() => true, countFn, 10, { pollMs: 2 });
    expect(result.count).toBe(42);
    expect(result.healthy).toBe(true);
    expect(result.settleMs).toBeGreaterThanOrEqual(0);
    expect(polls).toBeGreaterThan(1);
  });

  test("waitForIndex refuses to proceed when the index never becomes ready", async () => {
    await expect(waitForIndex(() => false, () => 7, 10, { pollMs: 2, timeoutMs: 30 })).rejects.toThrow(/index not ready after 30ms/);
  });

  test("assertSameQuestions fails when the counts differ", () => {
    const a = sample("a", ["one", "two"], [["g1"], ["g2"]]);
    const b = sample("b", ["one"], [["g1"]]);
    expect(() => assertSameQuestions([a, b])).toThrow(/a has 2 questions but b has 1/);
  });

  test("assertSameQuestions fails when a question is missing", () => {
    const a = sample("a", ["one", "two"], [["g1"], ["g2"]]);
    const b = sample("b", ["one", "three"], [["g1"], ["g3"]]);
    expect(() => assertSameQuestions([a, b])).toThrow(/missing from b/);
  });

  test("assertSameGoldIds fails when the gold ids differ", () => {
    const a = sample("a", ["one"], [["g1", "g2"]]);
    const b = sample("b", ["one"], [["g1", "g3"]]);
    expect(() => assertSameGoldIds([a, b])).toThrow(/gold ids differ/);
  });

  test("assertSameQuestions and assertSameGoldIds pass on identical inputs", () => {
    const a = sample("a", ["One", "Two questions"], [["g1", "g2"], ["g3"]]);
    const b = sample("b", ["  one  ", "TWO QUESTIONS"], [["g2", "g1"], ["g3"]]);
    expect(assertSameQuestions([a, b])).toBe(2);
    expect(assertSameGoldIds([a, b])).toBe(2);
  });

  test("normalizeQuestion folds case and whitespace", () => {
    expect(normalizeQuestion("  What  is  the answer? ")).toBe("what is the answer?");
  });
});
