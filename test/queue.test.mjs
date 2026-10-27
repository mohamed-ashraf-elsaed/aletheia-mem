// T-020: the extraction queue is resumable. One claim at a time, exponential backoff, stale rows recovered, and a
// kill -9 mid-run loses no window and duplicates no fact.
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { enqueueCompression, compressionQueue } from "../src/hub/hooks/shared.mjs";
import { JOB_TYPE, claimNext, completeJob, enqueueFromSettings, enqueueJob, executeJob, failJob, jobCounts, recoverStale, runWorker } from "../src/hub/queue.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

const root = join(import.meta.dir, "..");
const config = { factBudget: { maxEpisodes: 20, maxChars: 10_000 } };
const factAnswer = (prompt, suffix = "") => {
  const id = Number(/EPISODE_IDS: \[(\d+)/.exec(prompt)?.[1]);
  return JSON.stringify({ facts: [{ subject: "checkout service", predicate: "uses", object: `postgres${suffix} ${id}`, text: `The checkout service uses postgres${suffix} ${id}`, valid_from: null, valid_to: null, confidence: 0.9, episode_ids: [id] }] });
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("queue mechanics", () => {
  test("enqueue is idempotent, one claim at a time, and completion is counted", () => {
    const store = new HubStore(":memory:");
    const a = enqueueJob(store, JOB_TYPE, { project: "p", sessionId: "s", at: 1 }, { now: 1000 });
    const duplicate = enqueueJob(store, JOB_TYPE, { project: "p", sessionId: "s", at: 1 }, { now: 1000 });
    expect(a.created).toBe(true);
    expect(duplicate).toMatchObject({ created: false, id: a.id });
    const job = claimNext(store, { now: 1000, workerId: "w1" });
    expect(job).toMatchObject({ status: "running", attempts: 1, worker_id: "w1" });
    expect(claimNext(store, { now: 1000, workerId: "w2" })).toBeNull();
    completeJob(store, job.id, { now: 1001 });
    expect(jobCounts(store)).toMatchObject({ pending: 0, running: 0, done: 1, failed: 0 });
    store.close();
  });

  test("a failed job backs off exponentially and then is claimable again", () => {
    const store = new HubStore(":memory:");
    enqueueJob(store, JOB_TYPE, { project: "p" }, { now: 1000, maxAttempts: 3 });
    const job = claimNext(store, { now: 1000 });
    const failed = failJob(store, job, new Error("provider down"), { now: 1000, backoffMs: 500 });
    expect(failed).toMatchObject({ failed: false, nextAttemptEpoch: 1500, attempts: 1 });
    expect(claimNext(store, { now: 1400 })).toBeNull();
    const again = claimNext(store, { now: 1501 });
    expect(again).toMatchObject({ id: job.id, attempts: 2 });
    expect(failJob(store, again, new Error("still down"), { now: 1600, backoffMs: 200 }).failed).toBe(false);
    const last = claimNext(store, { now: 1801 });
    expect(failJob(store, last, new Error("third"), { now: 1900 }).failed).toBe(true);
    expect(jobCounts(store)).toMatchObject({ pending: 0, failed: 1 });
    expect(claimNext(store, { now: 999_999 })).toBeNull();
    store.close();
  });

  test("a running job whose lease expired is recovered after a restart", () => {
    const store = new HubStore(":memory:");
    enqueueJob(store, JOB_TYPE, { project: "p" }, { now: 1000 });
    const job = claimNext(store, { now: 1000, leaseMs: 500 });
    expect(job.status).toBe("running");
    store.db.prepare("UPDATE jobs SET locked_at_epoch = 100 WHERE id = ?").run(job.id);
    expect(recoverStale(store, { now: 5000, leaseMs: 500 })).toBe(1);
    expect(claimNext(store, { now: 5000, leaseMs: 500 })).toMatchObject({ id: job.id, status: "running" });
    store.close();
  });

  test("the Stop hook only writes a setting; the worker turns it into jobs", () => {
    const store = new HubStore(":memory:");
    const memory = store.add({ project: "p", kind: "prompt", title: "t", narrative: "The checkout service uses Postgres." });
    expect(enqueueCompression(store, { project: "p", sessionId: "s", at: 1 })).toBe(true);
    expect(compressionQueue(store)).toHaveLength(1);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n).toBe(0); // nothing extracted in the hook path
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n).toBe(0);
    const moved = enqueueFromSettings(store, { now: 2000 });
    expect(moved.enqueued).toBe(1);
    expect(compressionQueue(store)).toEqual([]);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM jobs").get().n).toBe(1);
    expect(memory.created).toBe(true);
    store.close();
  });
});

describe("worker", () => {
  test("a provider error is retried later and the job is not lost", async () => {
    const store = new HubStore(":memory:");
    store.add({ project: "p", kind: "prompt", title: "t", narrative: "The checkout service uses Postgres." });
    enqueueJob(store, JOB_TYPE, { project: "p", sessionId: null, at: 1 }, { now: 1000 });

    let calls = 0;
    const bad = async () => {
      calls++;
      throw new Error("502 from provider");
    };
    const first = await runWorker({ store, ask: bad, config, now: () => 1000 });
    expect(first.failed).toBe(1);
    expect(calls).toBe(1);
    expect(store.db.prepare("SELECT status, attempts, last_error FROM jobs").get()).toMatchObject({ status: "pending", attempts: 1 });
    expect(store.db.prepare("SELECT last_error FROM jobs").get().last_error).toContain("502");
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n).toBe(0);

    const second = await runWorker({ store, ask: async (prompt) => factAnswer(prompt), config, now: () => 3000 });
    expect(second.processed).toBe(1);
    expect(second.failed).toBe(0);
    expect(jobCounts(store)).toMatchObject({ pending: 0, done: 1, failed: 0 });
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n).toBe(1);
    const episode = store.db.prepare("SELECT extracted_at_epoch FROM episodes").get();
    expect(episode.extracted_at_epoch).not.toBeNull();

    const third = await runWorker({ store, ask: async (prompt) => factAnswer(prompt), config, now: () => 4000 });
    expect(third.processed).toBe(0);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n).toBe(1);
    store.close();
  });

  test("executeJob batches by the configured budget and marks each window done", async () => {
    const store = new HubStore(":memory:");
    for (let i = 0; i < 3; i++) store.add({ project: "p", kind: "prompt", title: `t${i}`, narrative: `The service${i} uses store${i}.` });
    enqueueJob(store, JOB_TYPE, { project: "p", sessionId: null, at: 1 }, { now: 1000 });
    const job = claimNext(store, { now: 1000 });
    let prompts = 0;
    const ask = async (prompt) => {
      prompts++;
      return factAnswer(prompt);
    };
    const result = await executeJob(store, job, { ask, config, batchSize: 1, charBudget: 10_000, now: () => 2000 });
    expect(result).toMatchObject({ memories: 3, windows: 3, facts: 3, rejected: 0 });
    expect(prompts).toBe(3);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM episodes WHERE extracted_at_epoch IS NOT NULL").get().n).toBe(3);
    store.close();
  });
});

describe("kill -9 resume", () => {
  test("a killed worker leaves the unprocessed window claimable, with no duplicate and no loss", async () => {
    const dir = tempDir("aletheia-kill-");
    const dbPath = join(dir, "hub.db");
    const parent = new HubStore(dbPath);
    const first = parent.add({ project: "p", kind: "prompt", title: "one", narrative: "The checkout service uses Postgres one." });
    const second = parent.add({ project: "p", kind: "prompt", title: "two", narrative: "The checkout service uses Postgres two." });
    expect(first.created && second.created).toBe(true);
    enqueueJob(parent, JOB_TYPE, { project: "p", sessionId: null, at: 1 }, { now: 1000 });

    const child = Bun.spawn([process.execPath, join(root, "test", "fixtures", "slow-worker.mjs"), dbPath], {
      stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env: { ...process.env, HOME: dir, ALETHEIA_DATA_DIR: dir },
    });
    const deadline = Date.now() + 15_000;
    let seen = 0;
    while (Date.now() < deadline) {
      seen = parent.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n;
      if (seen >= 1) break;
      await sleep(25);
    }
    expect(seen).toBe(1); // the first window committed before the hang
    child.kill("SIGKILL");
    const exited = await child.exited;
    expect(exited).not.toBe(0);

    const resumed = await runWorker({
      store: parent,
      ask: async (prompt) => factAnswer(prompt, "-resumed"),
      config,
      batchSize: 1,
      leaseMs: 0,
      now: () => Date.now(),
    });
    expect(resumed.failed).toBe(0);
    const facts = parent.db.prepare("SELECT text FROM facts ORDER BY id").all().map((row) => row.text);
    expect(facts).toHaveLength(2); // no loss, no duplicate
    expect(new Set(facts).size).toBe(2);
    expect(parent.db.prepare("SELECT COUNT(*) AS n FROM episodes WHERE extracted_at_epoch IS NOT NULL").get().n).toBe(2);
    expect(jobCounts(parent)).toMatchObject({ pending: 0, running: 0, done: 1, failed: 0 });
    parent.close();
  }, 30_000);
});

afterAll(() => cleanupTempDirs());
