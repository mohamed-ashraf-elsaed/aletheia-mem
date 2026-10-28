// The original save_goals.py (vendored, unmodified) talks to a claude-mem worker over HTTP:
// GET /api/work-view, then POST /api/work-state/entries. This proves the clone speaks that dialect.
import { afterAll, beforeAll, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";

const fx = makeFixture();
let app;
let base;
beforeAll(() => {
  app = startServer(loadConfig({
    port: 0, sourceDb: fx.dbPath, dataDir: fx.makeDir("data"), overlayDb: join(fx.dir, "overlay.db"), reviewDb: join(fx.dir, "reviews.db"),
    ledgerDir: fx.makeDir("ledger"), humanCopyCache: join(fx.dir, "hc.json"), rulesFile: join(fx.dir, "R.md"), claudeInstructionsFile: join(fx.dir, "C.md"), provider: "none",
  }));
  base = `http://127.0.0.1:${app.server.port}`;
});
afterAll(() => app.stop());

// Async spawn: the server runs in this process, a blocking spawn would deadlock its event loop.
async function run(args) {
  const PYTHON = Bun.which("python3") ?? Bun.which("python") ?? "python3";
  const proc = Bun.spawn([PYTHON, join(import.meta.dir, "..", "vendor", "owner-goals", "save_goals.py"), ...args], {
    env: { ...process.env, CLAUDE_MEM_WORKER_PORT: String(app.server.port), CLAUDE_MEM_WORKER_HOST: "127.0.0.1" },
    stdout: "pipe", stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

test("save_goals.py saves goals through the clone, replaces the previous snapshot and the view shows them", async () => {
  const prompts = join(fx.dir, "owner-prompts.md");
  writeFileSync(prompts, "## 2026-10-25 09:00 · claude · shop\n\nPlease make checkout reliable and fast\n\n## 2026-10-25 09:30 · claude · docs\n\nRewrite the onboarding guide\n");
  const goals = join(fx.dir, "owner-goals.json");
  writeFileSync(goals, JSON.stringify({
    generated_at: "2026-10-25T10:30:00+00:00", window_days: 31, source_prompt_count: 2, human_summary: "Checkout and docs.",
    priorities: [{ rank: 1, title: "Fast checkout", product: "shop", latest_at: "2026-10-25 09:00", times_asked: 1, evidence: [{ at: "2026-10-25 09:00", quote: "make checkout reliable and fast" }] }],
    open_asks: [{ rank: 1, title: "Onboarding guide", product: "docs", latest_at: "2026-10-25 09:30", times_asked: 1, evidence: [{ at: "2026-10-25 09:30", quote: "Rewrite the onboarding guide" }] }],
  }));
  const result = await run(["--goals", goals, "--prompts", prompts]);
  expect(result.exitCode).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({ saved_items: 2, dropped_previous_items: 1, history: false });

  const view = await (await fetch(`${base}/api/work-view`)).json();
  expect(view.goals.priorities.map((g) => g.title)).toEqual(["Fast checkout"]); // old "Reliable checkout" was dropped
  expect(view.goals.openAsks.map((g) => g.title)).toEqual(["Onboarding guide"]);
  expect(view.goals.priorities[0].evidence).toEqual([{ at: "2026-10-25 09:00", quote: "make checkout reliable and fast" }]);
  expect(view.goals.summary).toBe("Checkout and docs.");
});

test("a quote that is not the owner's words is refused before anything is saved", async () => {
  const prompts = join(fx.dir, "p2.md");
  writeFileSync(prompts, "## 2026-10-25 09:00 · claude · shop\n\nfix checkout\n");
  const goals = join(fx.dir, "g2.json");
  writeFileSync(goals, JSON.stringify({ generated_at: "2026-10-25T11:00:00+00:00", priorities: [{ rank: 1, title: "Invented", evidence: [{ at: "2026-10-25 09:00", quote: "words nobody typed" }] }], open_asks: [] }));
  const result = await run(["--goals", goals, "--prompts", prompts]);
  expect(result.exitCode).not.toBe(0);
  expect(result.stderr).toContain("not the owner's words");
});
