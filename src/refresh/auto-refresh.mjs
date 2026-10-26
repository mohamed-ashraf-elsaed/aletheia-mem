// Auto refresh: every `checkMs` ask the ledger whether anything is due; if so run the refresh job once.
// State is written to <ledgerDir>/refresh.json (state: running | ok | failed | idle | waiting-for-agent).
import { Database } from "bun:sqlite";
import { join } from "node:path";
import { refreshNeeds } from "../ledger/commands.mjs";
import { pidAlive, readJson, writeJsonAtomic } from "../lib/util.mjs";
import { createRefreshJob } from "./orchestrator.mjs";
import { makeProvider } from "./providers.mjs";

export class AutoRefresh {
  constructor({ dir, openDatabase, runJob, enabled = () => true, checkMs = 10 * 60_000, now = Date.now, log = () => {} }) {
    Object.assign(this, { dir, openDatabase, runJob, enabled, checkMs, now, log });
    this.timer = null;
    this.closed = false;
    this.busy = false;
  }

  path() { return join(this.dir, "refresh.json"); }
  status() { return readJson(this.path(), null); }
  write(value) { writeJsonAtomic(this.path(), value); }
  iso(ms = this.now()) { return new Date(ms).toISOString(); }

  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), this.checkMs);
    this.timer.unref?.();
  }
  tick() { this.check().catch((error) => this.log("warn", "Work view refresh check failed", { error: String(error?.message ?? error) })); }
  close() { this.closed = true; clearInterval(this.timer); }

  readNeeds() {
    const db = this.openDatabase();
    try { return refreshNeeds({ dir: this.dir, database: db, now: this.now() }); } finally { db.close(); }
  }

  async check() {
    if (this.closed) return "closed";
    if (!this.enabled()) return "disabled";
    if (this.busy) return "running";
    const status = this.status();
    if (status?.state === "running" && status.pid !== process.pid && status.pid && pidAlive(status.pid)) return "running";
    const needs = this.readNeeds();
    if (!needs.needed) {
      const wasRunning = status?.state === "running";
      this.write({ ...status, state: wasRunning ? "failed" : (status?.state ?? "idle"), ...(wasRunning ? { error: "The previous refresh stopped before finishing." } : {}), checkedAt: this.iso(), nextAt: this.iso(this.now() + this.checkMs), needs });
      return "idle";
    }
    return this.run(needs, "scheduled");
  }

  /** Run now (the "Refresh" button / CLI), if anything is due. */
  async runNow({ reason }) {
    if (this.closed) return "closed";
    if (this.busy) return "running";
    const needs = this.readNeeds();
    return needs.needed ? this.run(needs, reason) : "idle";
  }

  async run(needs, reason) {
    this.busy = true;
    try {
      const startedAt = this.iso();
      this.write({ state: "running", pid: process.pid, reason, startedAt, needs, nextAt: null });
      this.log("info", `Work view refresh started (${reason})`, { needs });
      let outcome;
      try {
        outcome = await this.runJob({ needs, reason });
      } catch (error) {
        outcome = { state: "failed", agent: null, result: null, error: String(error?.message ?? error).slice(0, 500) };
      }
      this.write({
        state: outcome.state, reason, agent: outcome.agent ?? null, startedAt, finishedAt: this.iso(), needs,
        result: outcome.result ?? null, error: outcome.error ?? null, nextAt: this.iso(this.now() + this.checkMs),
        ...(outcome.steps ? { steps: outcome.steps } : {}),
      });
      this.log(outcome.state === "ok" ? "info" : "warn", `Work view refresh ${outcome.state} (${reason})`, { agent: outcome.agent, error: outcome.error });
      return outcome.state;
    } finally {
      this.busy = false;
    }
  }
}

/** Wire an AutoRefresh to the configured provider. */
export function createAutoRefresh(config) {
  const ask = makeProvider(config);
  if (!ask) throw new Error(`No provider for ALETHEIA_PROVIDER=${config.provider}.`);
  const openDatabase = () => {
    const db = new Database(config.sourceDb, { readonly: true, create: false });
    db.exec("PRAGMA busy_timeout = 1500");
    return db;
  };
  return new AutoRefresh({
    dir: config.ledgerDir,
    openDatabase,
    checkMs: config.refreshCheckMs,
    log: (level, message, data) => (level === "info" ? console.log : console.warn)(`[refresh] ${message}`, data ?? ""),
    runJob: async ({ needs }) => {
      const job = createRefreshJob({ config, needs, ask });
      try {
        await job.prepare?.();
        const result = await job.run();
        return { state: "ok", agent: config.provider, result: result.slice(0, 4000), error: null, steps: job.steps };
      } catch (error) {
        return { state: "failed", agent: config.provider, result: null, error: String(error?.message ?? error).slice(0, 500), steps: job.steps };
      }
    },
  });
}
