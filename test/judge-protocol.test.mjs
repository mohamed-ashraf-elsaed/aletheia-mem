import { describe, expect, test } from "bun:test";
import { JUDGE_PROMPT_VERSION, READER_PROMPT_VERSION, hashPrompt, judgePrompt, parseJudgeVerdict, readerPrompt } from "../bench/lib/judge.mjs";

describe("bench/lib/judge.mjs", () => {
  test("the judge prompt is blind and never names the system", () => {
    const prompt = judgePrompt("What is the value?", "value-7", "7");
    expect(prompt).toContain("Question:");
    expect(prompt).toContain("Reference answer:");
    expect(prompt).toContain("Predicted answer:");
    expect(prompt).not.toContain("Aletheia");
    expect(prompt).not.toMatch(/\b(system|tool|model)\b/i);
  });

  test("prompt versions and hashes are pinned and stable", () => {
    expect(READER_PROMPT_VERSION).toBe("reader-v1");
    expect(JUDGE_PROMPT_VERSION).toBe("judge-v1");
    expect(hashPrompt(judgePrompt("Q", "G", "P"))).toBe(hashPrompt(judgePrompt("Q", "G", "P")));
    expect(hashPrompt(judgePrompt("Q", "G", "P"))).toMatch(/^[0-9a-f]{64}$/);
  });

  test("parseJudgeVerdict accepts strict JSON and a JSON substring", () => {
    expect(parseJudgeVerdict('{"correct": true}').correct).toBe(true);
    expect(parseJudgeVerdict('prefix {"correct": false}').correct).toBe(false);
    expect(parseJudgeVerdict("not json").correct).toBe(null);
  });

  test("readerPrompt shows the evidence or a none marker", () => {
    expect(readerPrompt("Q", ["E1", "E2"])).toContain("1. E1");
    expect(readerPrompt("Q", ["E1", "E2"])).toContain("2. E2");
    expect(readerPrompt("Q", [])).toContain("(no evidence)");
  });
});
