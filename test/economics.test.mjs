// context economics counts per-observation read tokens from stored text, reports work tokens only from a
// real usage record (else null, labelled), and answers through the route and the CLI.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { economics } from "../src/hub/economics.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";
import { makeFixture } from "./fixture.mjs";

const fx = makeFixture();
let seeded;

function seed(path) {
  const store = new HubStore(path);
  store.add({ project: "shop", kind: "observation", type: "note", title: "RetryButton uses backoff", narrative: "The retry button uses exponential backoff so failed payments can be retried safely.", createdAtEpoch: Date.now() - 60_000 });
  store.add({ project: "shop", kind: "note", type: "note", title: "Checkout note", narrative: "Checkout must stay idempotent.", createdAtEpoch: Date.now() - 30_000 });
  store.close();
}

beforeAll(() => {
  const dbPath = join(fx.dir, "economics.db");
  seed(dbPath);
  const cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir: fx.makeDir("economics-data"),
    overlayDb: join(fx.dir, "economics-overlay.db"),
    reviewDb: join(fx.dir, "economics-review.db"),
    ledgerDir: fx.makeDir("economics-ledger"),
    humanCopyCache: join(fx.dir, "economics-human.json"),
    rulesFile: join(fx.dir, "ECON-RULES.md"),
    claudeInstructionsFile: join(fx.dir, "ECON-CLAUDE.md"),
    hubDb: dbPath,
    provider: "none",
    extra: { home: fx.makeDir("economics-home") },
  });
  seeded = { app: startServer(cfg) };
  seeded.base = `http://127.0.0.1:${seeded.app.server.port}`;
});

afterAll(() => {
  seeded.app.stop();
  cleanupTempDirs();
});

describe("context economics", () => {
  test("read tokens are counted from text; work tokens come from the usage ledger", () => {
    const store = new HubStore(":memory:");
    try {
      store.add({ project: "shop", kind: "observation", type: "note", title: "A", narrative: "a".repeat(40) });
      store.recordUsage({ inputTokens: 1000, outputTokens: 500, mode: "rules", model: "test", episodes: 1, facts: 2, status: "ok" });
      const data = economics(store, { project: "shop" });
      expect(data.observations).toHaveLength(1);
      expect(data.observations[0].readTokens).toBeGreaterThan(0);
      expect(data.observations[0].workTokens).toBeNull();
      expect(data.observations[0].workTokensSource).toContain("per extraction call");
      expect(data.totals.readTokens).toBe(data.observations[0].readTokens);
      expect(data.totals.workTokens).toBe(1500);
      expect(data.totals.workTokensSource).toBe("fact_usage input + output tokens");
      expect(data.counter).toContain("/ 4");
    } finally {
      store.close();
    }
  });

  test("no usage record means work tokens are null and labelled", () => {
    const store = new HubStore(":memory:");
    try {
      store.add({ project: "shop", kind: "note", type: "note", title: "A note", narrative: "Some text." });
      const data = economics(store, { project: "shop" });
      expect(data.totals.workTokens).toBeNull();
      expect(data.totals.workTokensSource).toBe("no usage record");
      expect(data.totals.savingsPercent).toBeNull();
      expect(data.empty).toBe(false);
    } finally {
      store.close();
    }
  });

  test("the route answers with the economics shape", async () => {
    const response = await fetch(`${seeded.base}/v1/context/economics?project=shop`);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("observations");
    expect(data.totals.observations).toBe(2);
    expect(data.totals.readTokens).toBeGreaterThan(0);
    expect(data.totals.workTokens).toBeNull();
  });

  test("aletheia context economics prints the same data", async () => {
    const dir = tempDir("aletheia-econ-");
    const dbPath = join(dir, "hub.db");
    seed(dbPath);
    const env = { HOME: dir, ALETHEIA_DATA_DIR: dir, ALETHEIA_HUB_DB: dbPath };
    const proc = Bun.spawn([process.execPath, join(import.meta.dir, "..", "bin", "aletheia.mjs"), "context", "economics", "--project", "shop"], { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: join(import.meta.dir, ".."), env: { ...process.env, ...env } });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    expect(exitCode).toBe(0);
    const data = JSON.parse(stdout);
    expect(data.totals.observations).toBe(2);
    expect(data.totals.readTokens).toBeGreaterThan(0);
    expect(stderr).toBe("");
  });
});
