// T-017: schema v3 is additive. A v2 database migrates without losing rows, a broken migration rolls back,
// the old routes still answer, and the CLI backs up before it writes.
import { afterAll, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";
import { HubStore, inspectMigration } from "../src/hub/store.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";
import { makeBrokenV2Store, makeV2Store } from "./v2-fixture.mjs";

const root = join(import.meta.dir, "..");
const temp = () => tempDir("aletheia-migrate-");

const cli = async (args, env) => {
  const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env: { ...process.env, ...env } });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
};

describe("schema v3 migration", () => {
  test("a 50k-row v2 database migrates with identical counts and resolvable ids", () => {
    const dir = temp();
    const dbPath = join(dir, "hub.db");
    const before = makeV2Store(dbPath, { notes: 30_000, prompts: 10_000, events: 10_000, vectors: 5 });
    expect(before.total).toBe(50_000);

    const store = new HubStore(dbPath);
    const counts = store.migrationCounts();
    expect(counts.memories).toBe(50_000);
    expect(counts.episodes).toBe(20_000);
    expect(counts.observations).toBe(30_000);
    expect(store.db.prepare("PRAGMA user_version").get().user_version).toBe(3);

    const legacyObservation = store.db.prepare("SELECT * FROM observations WHERE legacy_memory_id = ?").get(before.first.observation);
    expect(legacyObservation).toMatchObject({ project: "legacy", title: `legacy observation ${before.first.observation}` });
    const legacyEpisode = store.db.prepare("SELECT * FROM episodes WHERE source_ref = ?").get(`memory:${before.first.prompt}`);
    expect(legacyEpisode).toMatchObject({ project: "legacy", kind: "prompt", role: "user" });
    expect(legacyEpisode.text).toContain("narrative about legacy memory");

    const vector = store.db.prepare("SELECT owner_type, owner_id FROM memory_vectors WHERE memory_id = 1").get();
    expect(vector).toEqual({ owner_type: "observation", owner_id: 1 });

    // The old read paths still see every row.
    expect(store.list({ limit: 1 }).total).toBe(50_000);
    expect(store.search({ query: "legacy", limit: 3 }).length).toBe(3);
    expect(store.context({ project: "legacy", maxChars: 500 })).toContain("# Memory for legacy");
    store.close();
  }, 60_000);

  test("a failed step rolls back and leaves user_version=2 with every memory intact", () => {
    const dir = temp();
    const dbPath = join(dir, "broken.db");
    const made = makeBrokenV2Store(dbPath, { notes: 7 });
    expect(() => new HubStore(dbPath)).toThrow();
    const raw = new Database(dbPath, { readonly: true });
    expect(raw.prepare("PRAGMA user_version").get().user_version).toBe(2);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM memories").get().n).toBe(made.total);
    expect(raw.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'facts'").get().n).toBe(0);
    raw.close();
  });

  test("the old Hub routes answer after migration", async () => {
    const dir = temp();
    const dbPath = join(dir, "hub.db");
    makeV2Store(dbPath, { notes: 40, prompts: 10, events: 10 });
    const fx = makeFixture();
    const cfg = loadConfig({
      port: 0,
      sourceDb: fx.dbPath,
      dataDir: dir,
      overlayDb: join(dir, "overlay.db"),
      reviewDb: join(dir, "review.db"),
      ledgerDir: join(dir, "ledger"),
      humanCopyCache: join(dir, "human-copy.json"),
      rulesFile: join(dir, "RULES.md"),
      claudeInstructionsFile: join(dir, "CLAUDE.md"),
      hubDb: dbPath,
      provider: "none",
      extra: { home: dir },
    });
    const app = startServer(cfg);
    try {
      const base = `http://127.0.0.1:${app.server.port}`;
      const list = await fetch(`${base}/api/hub/memories?limit=2`);
      expect(list.status).toBe(200);
      const body = await list.json();
      expect(body.total).toBe(60);
      expect(body.items.length).toBe(2);
      expect((await fetch(`${base}/v1/info`)).status).toBe(200);
      expect((await fetch(`${base}/api/hub/overview`)).status).toBe(200);
    } finally {
      app.stop();
    }
  });

  test("aletheia migrate: dry run writes nothing; a real run backs up first", async () => {
    const dir = temp();
    const dbPath = join(dir, "hub.db");
    makeV2Store(dbPath, { notes: 5, prompts: 2, events: 2 });
    const env = { HOME: dir, ALETHEIA_DATA_DIR: dir, ALETHEIA_HUB_DB: dbPath };

    const dry = await cli(["migrate", "--dry-run"], env);
    expect(dry.exitCode).toBe(0);
    const plan = JSON.parse(dry.stdout);
    expect(plan).toMatchObject({ version: 2, target: 3, needsMigration: true, dryRun: true });
    expect(new Database(dbPath, { readonly: true }).prepare("PRAGMA user_version").get().user_version).toBe(2);

    const backup = join(dir, "before.db");
    const real = await cli(["migrate", "--backup", backup], env);
    expect(real.exitCode).toBe(0);
    expect(real.stdout).toContain("Migrated schema v2 -> v3");
    expect(existsSync(backup)).toBe(true);
    expect(inspectMigration(dbPath).version).toBe(3);
    expect(new Database(backup, { readonly: true }).prepare("PRAGMA user_version").get().user_version).toBe(2);
  });
});

afterAll(() => cleanupTempDirs());
