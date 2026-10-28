// the answer-accuracy harness runs the reader and judge over a synthetic fixture with the fake provider,
// so the whole path (reader, judge, exact + judge scoring, bootstrap CI and the results JSON) works offline.
import { afterAll, describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

const root = join(import.meta.dir, "..");

afterAll(() => cleanupTempDirs());

function syntheticFixture(n = 20) {
  const items = [];
  for (let i = 1; i <= n; i++) {
    items.push({
      id: `q${String(i).padStart(2, "0")}`,
      question: `What is the value of item ${i}?`,
      answer: `value-${i}`,
      evidence: [`Item ${i} holds the value value-${i}.`, `A related note about item ${i}.`],
    });
  }
  return items;
}

async function runCli(args) {
  const proc = Bun.spawn([process.execPath, join(root, "bench", "accuracy.mjs"), ...args], { stdout: "pipe", stderr: "pipe", cwd: root });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("bench/accuracy.mjs", () => {
  test("--dry-run prints the plan and the estimated model calls without a provider", async () => {
    const dir = tempDir("aletheia-accuracy-");
    const dataPath = join(dir, "questions.json");
    writeFileSync(dataPath, JSON.stringify(syntheticFixture(20), null, 2));
    const run = await runCli(["--provider", "fake", "--data", dataPath, "--dry-run"]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("questions: 20");
    expect(run.stdout).toContain("totalModelCalls: 160");
    expect(run.stdout).toContain("readerPromptVersion: reader-v1");
  });

  test("a fake provider runs all four arms offline and writes the results JSON", async () => {
    const dir = tempDir("aletheia-accuracy-");
    const dataPath = join(dir, "questions.json");
    const outPath = join(dir, "accuracy.json");
    writeFileSync(dataPath, JSON.stringify(syntheticFixture(4), null, 2));
    const run = await runCli(["--provider", "fake", "--data", dataPath, "--out", outPath]);
    expect(run.exitCode).toBe(0);

    const result = JSON.parse(readFileSync(outPath, "utf8"));
    expect(result.harness).toBe("bench/accuracy.mjs");
    expect(result.provider).toBe("fake");
    expect(result.readerPromptVersion).toBe("reader-v1");
    expect(result.judgePromptVersion).toBe("judge-v1");
    expect(result.datasetSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(result.machine).toBeTruthy();
    expect(Object.keys(result.arms)).toEqual(["no-memory", "full-context", "retrieval", "packed"]);
    for (const arm of Object.values(result.arms)) {
      expect(arm.perQuestion.length).toBe(4);
      expect(arm.exact.n).toBe(4);
      expect(arm.judge.n).toBe(4);
      expect(Array.isArray(arm.exact.ci95)).toBe(true);
      expect(Array.isArray(arm.judge.ci95)).toBe(true);
    }
    expect(result.arms["no-memory"].judge.mean).toBe(1);
    expect(result.arms["no-memory"].exact.mean).toBe(0);
  });

  test("--limit runs a subset", async () => {
    const dir = tempDir("aletheia-accuracy-");
    const dataPath = join(dir, "questions.json");
    writeFileSync(dataPath, JSON.stringify(syntheticFixture(10), null, 2));
    const run = await runCli(["--provider", "fake", "--data", dataPath, "--limit", "3", "--dry-run"]);
    expect(run.exitCode).toBe(0);
    expect(run.stdout).toContain("questions: 3");
    expect(run.stdout).toContain("totalModelCalls: 24");
  });
});
