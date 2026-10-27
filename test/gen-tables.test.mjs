// T-118: comparison, tool and benchmark tables come from data, never from hand-edited cells.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBlocks, renderBench, renderCapabilities, renderTools, replaceBlock } from "../scripts/gen-tables.mjs";

const root = join(import.meta.dir, "..");
const dirs = [];
const make = () => {
  const dir = mkdtempSync(join(tmpdir(), "aletheia-gen-tables-"));
  dirs.push(dir);
  return dir;
};

afterAll(() => {
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe("gen-tables", () => {
  // The source files for these two tests are kept only on the maintainers' machines; skipped in a fresh clone.
  const withSources = existsSync(join(root, "docs/28-competitor-report.json")) ? test : test.skip;
  withSources("the capability table is generated from the JSON and keeps unknown cells UNVERIFIED", () => {
    const markdown = renderCapabilities("md", root);
    expect(markdown).toContain("| Capability | Aletheia (today) | claude-mem |");
    expect(markdown).toContain("| MCP |");
    expect(markdown).not.toMatch(/T-\d+/);
    expect(markdown).not.toContain("✅");
    expect(markdown).not.toContain("❌");
    expect(markdown).toContain("UNVERIFIED");
  });

  test("the tool table says not tested on a real install for every current host", () => {
    const markdown = renderTools("md");
    for (const tool of ["claude-code", "command-code", "cursor", "codex", "gemini-cli", "windsurf", "opencode"]) {
      expect(markdown).toContain(`| ${tool} |`);
    }
    expect(markdown).toContain("config written from docs, not tested on a real install");
    expect(markdown).not.toContain("| tested on a real install |");
  });

  (existsSync(join(root, "docs/14-research-ai-memory.md")) ? test : test.skip)("the benchmark table is computed from result files and includes the parsed baseline", () => {
    const dir = make();
    const n = 100;
    writeFileSync(join(dir, "raw-turns.json"), JSON.stringify({ questions: n, results: { hybrid: { n, "R@5": 57.4, mrr: 49.7, ms: 400 } } }));
    writeFileSync(join(dir, "dataset-facts.json"), JSON.stringify({ questions: n, results: { "hybrid+facts": { n, "R@5": 64.8, mrr: 59.1, ms: 500 } } }));
    const markdown = renderBench("md", dir, root);
    expect(markdown).toContain("| claude-mem 15.2.0 (as shipped), raw turns — measured-by-us | 1,536 | 36.0% | 0.285 |");
    expect(markdown).toContain("| Raw turns, all 10 conversations | 100 | 57.4% | 0.497 | 4.00 |");
    expect(markdown).toContain("| Dataset facts, all 10 | 100 | 64.8% | 0.591 | 5.00 |");
    expect(markdown).toContain("not run");
    expect(markdown).toContain("It is not answer accuracy");
  });

  test("a changed block is drift and replaceBlock repairs it", () => {
    const original = "before\n<!-- gen:bench -->\nhand typed\n<!-- /gen:bench -->\nafter\n";
    expect(checkBlocks(original, "bench", "generated").ok).toBe(false);
    const fixed = replaceBlock(original, "bench", "generated");
    expect(checkBlocks(fixed, "bench", "generated").ok).toBe(true);
    expect(fixed).toContain("before");
    expect(fixed).toContain("after");
  });

  test("the committed files are current", async () => {
    const proc = Bun.spawn([process.execPath, "scripts/gen-tables.mjs", "--check"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    expect(stderr).toBe("");
    expect(code).toBe(0);
    expect(stdout).toContain("6 blocks current");
  });
});
