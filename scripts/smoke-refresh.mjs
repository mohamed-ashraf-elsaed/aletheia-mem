#!/usr/bin/env bun
// Real-provider smoke test on SYNTHETIC data: runs the whole refresh (minus the goals step, which reads your
// own transcripts) with the configured provider against test/fixture.mjs data, and prints what it wrote.
//   ALETHEIA_PROVIDER=claude-cli bun scripts/smoke-refresh.mjs
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { configureLedger, refreshNeeds } from "../src/ledger/commands.mjs";
import { readLedger } from "../src/ledger/read.mjs";
import { createRefreshJob } from "../src/refresh/orchestrator.mjs";
import { makeProvider } from "../src/refresh/providers.mjs";
import { makeFixture } from "../test/fixture.mjs";

const fx = makeFixture();
const config = loadConfig({
  port: 0, sourceDb: fx.dbPath, dataDir: fx.makeDir("data"), overlayDb: join(fx.dir, "overlay.db"), ledgerDir: fx.makeDir("ledger"),
  promptsDir: join(import.meta.dir, "..", "prompts"), vendorDir: join(import.meta.dir, "..", "vendor"),
  provider: process.env.ALETHEIA_PROVIDER ?? "claude-cli",
});
configureLedger({ overlayDb: config.overlayDb });
const db = new Database(fx.dbPath, { readonly: true });
const needs = { ...refreshNeeds({ dir: config.ledgerDir, database: db }), goalsStale: false };
db.close();
console.log("needs", needs);
const started = Date.now();
const job = createRefreshJob({ config, needs, ask: makeProvider(config) });
const result = await job.run();
const ledger = readLedger(config.ledgerDir);
console.log("result:", result, `(${Math.round((Date.now() - started) / 1000)}s)`);
console.log("steps :", job.steps.map((s) => `${s.step}:${Math.round((Date.parse(s.finishedAt) - Date.parse(s.startedAt)) / 1000)}s`).join(" "));
for (const [id, g] of Object.entries(ledger.groups.groups)) {
  const p = ledger.progress[id];
  console.log(`- ${id} "${g.title}" conv=${Object.values(ledger.groups.conversations).filter((x) => x === id).length} -> ${p?.state} ${p?.percent}%  goals=${JSON.stringify((ledger.alignment?.links?.[id] ?? []).map((l) => l.goal))}`);
}
console.log("story chars:", ledger.story?.narrative?.length, "preferences:", ledger.story?.preferences?.length);
