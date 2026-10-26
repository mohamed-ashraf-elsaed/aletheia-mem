// The comparison script prints the measured table from raw result files, and only says REPRODUCED within 0.5 points.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs = [];
const make = () => {
  const dir = mkdtempSync(join(tmpdir(), "aletheia-compare-"));
  dirs.push(dir);
  return dir;
};
const write = (dir, name, doc) => writeFileSync(join(dir, name), JSON.stringify(doc, null, 2));

function run(dir) {
  const proc = Bun.spawn([process.execPath, "scripts/compare-bench.mjs", dir], { cwd: join(import.meta.dir, ".."), stdout: "pipe", stderr: "pipe" });
  return Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
}

afterAll(() => {
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe("compare-bench", () => {
  test("prints the table and marks the previous numbers as reproduced", async () => {
    const dir = make();
    const n = 100;
    write(dir, "raw-turns.json", { questions: n, factsMode: "none", model: "fake", datasetSha256: "abc", results: { hybrid: { n, "R@5": 57.5, mrr: 49.7, ms: 100 } } });
    write(dir, "dataset-facts.json", { questions: n, factsMode: "dataset", model: "fake", datasetSha256: "abc", results: { "hybrid+facts": { n, "R@5": 65.2, mrr: 58.8, ms: 100 } } });
    write(dir, "dataset-facts-3-rerank.json", { questions: n, factsMode: "dataset", model: "fake", datasetSha256: "abc", results: {
      "hybrid+facts": { n, "R@5": 67.6, mrr: 61.6, ms: 100 },
      "hybrid+facts+rerank": { n, "R@5": 73.7, mrr: 68.6, ms: 100 },
    } });
    const [stdout, stderr, code] = await run(dir);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("| run | facts | n | strategy |");
    expect(stdout).toContain("raw turns, all 10, hybrid R@5");
    expect(stdout).toContain("REPRODUCED");
    expect(stdout).not.toContain("| changed |");
  });

  test("says changed when a number moves and not rerun when a file is absent", async () => {
    const dir = make();
    const n = 100;
    write(dir, "raw-turns.json", { questions: n, factsMode: "none", results: { hybrid: { n, "R@5": 50, mrr: 40, ms: 100 } } });
    const [stdout] = await run(dir);
    expect(stdout).toContain("changed");
    expect(stdout).toContain("not rerun");
  });

  test("fails loudly on an empty directory", async () => {
    const dir = make();
    const [stdout, stderr, code] = await run(dir);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("No .json result files");
  });
});
