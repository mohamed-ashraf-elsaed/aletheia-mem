// The extraction queue: capture writes a job and returns; a worker claims one job at a time, survives a restart,
// retries provider errors with exponential backoff, and never runs inside a hook. Jobs are rows, so a kill -9
// leaves the work claimable again. Progress is recorded on the episode, so a resumed job does not redo a window.
import { chunkEpisodes, storeFacts, extractWithUsage, FACTS_PROMPT_VERSION, modeInstruction as modeInstructionFor } from "./facts.mjs";
import { mergeNearDuplicates } from "./dedupe.mjs";
import { buildProjectSummary, buildSessionSummary } from "./summaries.mjs";
import { embedMissingFacts } from "./search.mjs";
import { modelFor } from "../refresh/providers.mjs";
import { pricesFrom } from "./usage.mjs";

export const JOB_TYPE = "extract_session";
export const LEASE_MS = 60_000;
export const MAX_ATTEMPTS = 5;
export const MAX_MEMORIES_PER_JOB = 400;

export const backoffFor = (attempts) => Math.min(60_000, 1000 * 2 ** Math.max(0, Number(attempts) - 1));

export function enqueueJob(store, type, payload, { now = Date.now(), maxAttempts = MAX_ATTEMPTS, nextAttemptEpoch = 0 } = {}) {
  const text = JSON.stringify(payload ?? {});
  const info = store.db
    .prepare("INSERT OR IGNORE INTO jobs (type, payload, status, attempts, max_attempts, next_attempt_epoch, created_at_epoch, updated_at_epoch) VALUES (?, ?, 'pending', 0, ?, ?, ?, ?)")
    .run(type, text, Math.max(1, Number(maxAttempts) || MAX_ATTEMPTS), nextAttemptEpoch, now, now);
  if (info.changes) return { id: Number(info.lastInsertRowid), created: true };
  const row = store.db.prepare("SELECT * FROM jobs WHERE type = ? AND payload = ?").get(type, text);
  return { id: row?.id ?? null, created: false, job: row ?? null };
}

/** Move what the Stop hook queued in `settings` into real job rows, then clear the setting. */
export function enqueueFromSettings(store, { now = Date.now() } = {}) {
  const queued = store.setting("compress.queue", []);
  if (!Array.isArray(queued) || !queued.length) return { enqueued: 0 };
  let enqueued = 0;
  store.db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of queued) {
      if (!item || typeof item !== "object") continue;
      enqueueJob(store, JOB_TYPE, { project: item.project ?? "default", sessionId: item.sessionId ?? null, at: item.at ?? now }, { now });
      enqueued++;
    }
    store.setSetting("compress.queue", []);
    store.db.exec("COMMIT");
  } catch (error) {
    store.db.exec("ROLLBACK");
    throw error;
  }
  return { enqueued };
}

/** A running job whose lease expired belongs to a process that died. Put it back in the queue. */
export function recoverStale(store, { now = Date.now(), leaseMs = LEASE_MS } = {}) {
  const info = store.db
    .prepare("UPDATE jobs SET status = 'pending', worker_id = NULL, updated_at_epoch = ? WHERE status = 'running' AND (locked_at_epoch IS NULL OR locked_at_epoch <= ?)")
    .run(now, now - Number(leaseMs));
  return info.changes;
}

/** Claim the oldest due job in one immediate transaction. Returns the row, or null. */
export function claimNext(store, { workerId = `pid-${process.pid}`, now = Date.now(), leaseMs = LEASE_MS } = {}) {
  store.db.exec("BEGIN IMMEDIATE");
  try {
    const row = store.db
      .prepare(`SELECT * FROM jobs WHERE next_attempt_epoch <= ?
                AND (status = 'pending' OR (status = 'running' AND (locked_at_epoch IS NULL OR locked_at_epoch <= ?)))
                ORDER BY id LIMIT 1`)
      .get(now, now - Number(leaseMs));
    if (!row) {
      store.db.exec("COMMIT");
      return null;
    }
    store.db.prepare("UPDATE jobs SET status = 'running', locked_at_epoch = ?, worker_id = ?, attempts = attempts + 1, updated_at_epoch = ? WHERE id = ?")
      .run(now, workerId, now, row.id);
    const claimed = store.db.prepare("SELECT * FROM jobs WHERE id = ?").get(row.id);
    store.db.exec("COMMIT");
    return claimed;
  } catch (error) {
    try { store.db.exec("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  }
}

export function completeJob(store, id, { now = Date.now() } = {}) {
  store.db.prepare("UPDATE jobs SET status = 'done', locked_at_epoch = NULL, worker_id = NULL, last_error = NULL, updated_at_epoch = ? WHERE id = ?").run(now, Number(id));
}

export function failJob(store, job, error, { now = Date.now(), backoffMs = null } = {}) {
  const attempts = Number(job.attempts) || 1;
  const failed = attempts >= (Number(job.max_attempts) || MAX_ATTEMPTS);
  const delay = backoffMs != null ? Number(backoffMs) : backoffFor(attempts);
  const message = String(error instanceof Error ? error.message : error).slice(0, 800);
  store.db.prepare("UPDATE jobs SET status = ?, next_attempt_epoch = ?, locked_at_epoch = NULL, worker_id = NULL, last_error = ?, updated_at_epoch = ? WHERE id = ?")
    .run(failed ? "failed" : "pending", failed ? 0 : now + delay, message, now, Number(job.id));
  return { failed, nextAttemptEpoch: failed ? null : now + delay, attempts, message };
}

export function jobCounts(store) {
  const byStatus = Object.fromEntries(store.db.prepare("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").all().map((row) => [row.status, row.n]));
  const oldest = store.db.prepare("SELECT MIN(created_at_epoch) AS at FROM jobs WHERE status = 'pending'").get().at;
  return { pending: byStatus.pending ?? 0, running: byStatus.running ?? 0, done: byStatus.done ?? 0, failed: byStatus.failed ?? 0, oldestPendingEpoch: oldest ?? null };
}

function pendingMemories(store, payload, limit = MAX_MEMORIES_PER_JOB) {
  // A summary memory is derived data, not a source: extracting facts from it would feed the output back in.
  const where = ["m.kind IN ('prompt', 'event')", "(e.id IS NULL OR e.extracted_at_epoch IS NULL)", "(coalesce(m.narrative, '') <> '' OR coalesce(m.title, '') <> '')"];
  const params = [];
  if (payload.project) { where.push("m.project = ?"); params.push(payload.project); }
  if (payload.sessionId) { where.push("m.session_id = ?"); params.push(payload.sessionId); }
  return store.db
    .prepare(`SELECT m.* FROM memories m LEFT JOIN episodes e ON e.source_ref = 'memory:' || m.id WHERE ${where.join(" AND ")} ORDER BY m.id LIMIT ?`)
    .all(...params, Math.min(Number(limit) || MAX_MEMORIES_PER_JOB, MAX_MEMORIES_PER_JOB));
}

function markExtracted(store, episodeIds, at) {
  const update = store.db.prepare("UPDATE episodes SET extracted_at_epoch = ? WHERE id = ?");
  for (const id of episodeIds) update.run(at, Number(id));
}

/**
 * Run one job: make episodes for the captured memories, split them into windows, extract each window, store the
 * facts and mark the window done in one transaction. A window that already completed is never asked for again.
 */
export async function executeJob(store, job, { ask = null, config = {}, now = () => Date.now(), batchSize = null, charBudget = null, modeInstruction = "", prices = null, embedder = null } = {}) {
  const payload = JSON.parse(job.payload ?? "{}");
  const memories = pendingMemories(store, payload);
  if (!memories.length) return { memories: 0, windows: 0, facts: 0, rejected: 0, mode: ask ? "provider" : "rules" };
  const episodes = memories.map((memory) => store.ensureEpisodeForMemory(memory));
  const budget = {
    maxEpisodes: batchSize ?? config.factBudget?.maxEpisodes ?? 20,
    maxChars: charBudget ?? config.factBudget?.maxChars ?? 12_000,
  };
  const windows = chunkEpisodes(episodes.map((episode) => ({ episodeId: episode.id, text: episode.text, createdAtEpoch: episode.created_at_epoch, tool: episode.tool, kind: episode.kind })), budget);
  const model = ask ? ask.modelFor?.("extract") || modelFor(config, "extract") || "unknown" : "rules";
  const instruction = modeInstruction || modeInstructionFor(config.mode ?? "code");
  const language = store.outputLanguage(payload.project ?? "default", config.outputLanguage ?? "");
  const priceTable = prices ?? pricesFrom(config);
  let facts = 0;
  let deduped = 0;
  let rejected = 0;
  const startedAt = now();
  const mode = ask ? "provider" : "rules";

  for (const [index, window] of windows.entries()) {
    const result = await extractWithUsage(store, {
      window, project: payload.project ?? "default", ask, modeInstruction: instruction, outputLanguage: language,
      model, batchId: `${job.id}:${index}`, prices: priceTable, now: now(),
    });
    if (result.rejected) {
      rejected++;
      markExtracted(store, window.map((episode) => episode.episodeId), now());
      continue;
    }
    store.db.exec("BEGIN IMMEDIATE");
    try {
      const stored = storeFacts(store, {
        facts: result.facts, project: payload.project ?? "default", mode, model,
        promptVersion: FACTS_PROMPT_VERSION, now: now(),
      });
      markExtracted(store, window.map((episode) => episode.episodeId), now());
      store.db.exec("COMMIT");
      facts += stored.added;
      deduped += stored.deduped?.length ?? 0;
    } catch (error) {
      try { store.db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    }
  }
  const observations = mergeNearDuplicates(store, { project: payload.project ?? "default", maxRows: 2000 });
  let summaries = 0;
  try {
    if (payload.sessionId && buildSessionSummary(store, { project: payload.project ?? "default", sessionId: payload.sessionId, now: now() })) summaries++;
    if (buildProjectSummary(store, { project: payload.project ?? "default", now: now() })) summaries++;
  } catch (error) {
    store.audit("extract", "summary.error", { message: String(error instanceof Error ? error.message : error).slice(0, 300) });
  }
  let embedded = 0;
  if (embedder) {
    try {
      embedded = await embedMissingFacts(store, embedder, { limit: 500 });
    } catch (error) {
      store.audit("extract", "embed.error", { message: String(error instanceof Error ? error.message : error).slice(0, 300) });
    }
  }
  return { memories: memories.length, windows: windows.length, facts, deduped, rejected, mode, language, startedAt, merged: observations.merged, summaries, embedded };
}

/**
 * Drain due jobs oldest-first. One failing job is rescheduled, not lost; the loop stops when no job is due.
 * Recovering stale rows first is what makes a restart after kill -9 safe.
 */
export async function runWorker({ store, ask = null, config = {}, now = () => Date.now(), maxJobs = Infinity, workerId = `pid-${process.pid}`, leaseMs = LEASE_MS, batchSize = null, charBudget = null, modeInstruction = "", prices = null, onError = null, embedder = null } = {}) {
  const at = now();
  const recovered = recoverStale(store, { now: at, leaseMs });
  const fromSettings = enqueueFromSettings(store, { now: at });
  let processed = 0;
  let failed = 0;
  let lastResult = null;
  while (processed < maxJobs) {
    const job = claimNext(store, { workerId, now: now(), leaseMs });
    if (!job) break;
    try {
      lastResult = await executeJob(store, job, { ask, config, now, batchSize, charBudget, modeInstruction, prices, embedder });
      completeJob(store, job.id, { now: now() });
    } catch (error) {
      failed++;
      failJob(store, job, error, { now: now() });
      onError?.(error, job);
    }
    processed++;
  }
  return { processed, failed, recovered, enqueued: fromSettings.enqueued, last: lastResult, counts: jobCounts(store) };
}

/**
 * A lazy background task: the server (or `aletheia compress --daemon`) owns one. The timer is unref'd so it never
 * holds the process open, and a tick that is still running is not started twice.
 */
export function startBackgroundWorker({ store, ask = null, config = {}, intervalMs = 2000, maxJobs = 5, onError = null, onTick = null, embedder = null } = {}) {
  let stopped = false;
  let running = false;
  const tick = async () => {
    if (stopped || running) return null;
    running = true;
    try {
      const result = await runWorker({ store, ask, config, maxJobs, onError, embedder });
      onTick?.(result);
      return result;
    } catch (error) {
      onError?.(error, null);
      return null;
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, Math.max(250, Number(intervalMs) || 2000));
  timer.unref?.();
  tick();
  return {
    tick,
    get running() { return running; },
    get stopped() { return stopped; },
    stop() { stopped = true; clearInterval(timer); },
  };
}
