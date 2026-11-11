// The Stop hook queues a finished session for compression. The queue is the `jobs` table, so there is no cap
// and nothing is dropped when no worker runs. A restart drains it oldest first.
import { afterAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { enqueueCompression, compressionQueue } from "../src/hub/hooks/shared.mjs";
import { JOB_TYPE, claimNext, completeJob, jobCounts, runWorker } from "../src/hub/queue.mjs";
import { healthReport } from "../src/hub/health.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

afterAll(cleanupTempDirs);

describe("compress queue has no silent cap", () => {
  test("250 sessions queued with no worker are all kept", () => {
    const store = new HubStore(":memory:");
    for (let i = 0; i < 250; i++) expect(enqueueCompression(store, { project: "p", sessionId: `s${i}`, at: 1000 + i })).toBe(true);
    expect(compressionQueue(store)).toHaveLength(250);
    expect(compressionQueue(store)[0].sessionId).toBe("s0");
    expect(jobCounts(store).pending).toBe(250);
    const health = healthReport(store);
    expect(health.queue).toMatchObject({ pending: 250, dropped: 0 });
    store.close();
  });

  test("a second stop for the same session refreshes the job instead of adding one", () => {
    const store = new HubStore(":memory:");
    expect(enqueueCompression(store, { project: "p", sessionId: "s", at: 1 })).toBe(true);
    expect(enqueueCompression(store, { project: "p", sessionId: "s", at: 2 })).toBe(false);
    expect(enqueueCompression(store, { project: "q", sessionId: "s", at: 3 })).toBe(true);
    expect(compressionQueue(store)).toEqual([{ project: "p", sessionId: "s", at: 2 }, { project: "q", sessionId: "s", at: 3 }]);
    store.close();
  });

  test("a session queued again after its job finished gets a new job", () => {
    const store = new HubStore(":memory:");
    enqueueCompression(store, { project: "p", sessionId: "s", at: 1 });
    completeJob(store, claimNext(store, { now: 10 }).id, { now: 11 });
    expect(enqueueCompression(store, { project: "p", sessionId: "s", at: 5 })).toBe(true);
    expect(jobCounts(store).pending).toBe(1);
    store.close();
  });

  test("an old settings queue over 200 entries is migrated whole, and counted until then", async () => {
    const store = new HubStore(":memory:");
    store.setSetting("compress.queue", Array.from({ length: 230 }, (_, i) => ({ project: "p", sessionId: `old${i}`, at: i })));
    expect(healthReport(store).queue.pending).toBe(230);
    const result = await runWorker({ store, maxJobs: 0 });
    expect(result.enqueued).toBe(230);
    expect(store.setting("compress.queue", [])).toEqual([]);
    expect(jobCounts(store).pending).toBe(230);
    store.close();
  });

  test("after a restart the worker drains in the order sessions finished", async () => {
    const dir = tempDir("aletheia-queue-cap-");
    const path = join(dir, "hub.db");
    const first = new HubStore(path);
    for (let i = 0; i < 250; i++) enqueueCompression(first, { project: "p", sessionId: `s${i}`, at: 1000 + i });
    first.close();

    const second = new HubStore(path);
    expect(jobCounts(second).pending).toBe(250);
    const peek = second.db.prepare("SELECT payload FROM jobs WHERE type = ? ORDER BY id").all(JOB_TYPE).map((row) => JSON.parse(row.payload).sessionId);
    expect(peek).toEqual(Array.from({ length: 250 }, (_, i) => `s${i}`));
    const seen = [];
    const result = await runWorker({
      store: second,
      onError: () => {},
      config: {},
      now: (() => { let t = 1_000_000; return () => t++; })(),
    });
    for (const row of second.db.prepare("SELECT payload FROM jobs WHERE status = 'done' ORDER BY updated_at_epoch, id").all()) seen.push(JSON.parse(row.payload).sessionId);
    expect(result.processed).toBe(250);
    expect(result.counts).toMatchObject({ pending: 0, done: 250 });
    expect(seen).toEqual(peek);
    second.close();
  });

  test("enqueue stays cheap with a deep queue", () => {
    const store = new HubStore(":memory:");
    for (let i = 0; i < 1000; i++) enqueueCompression(store, { project: "p", sessionId: `s${i}`, at: i });
    const started = performance.now();
    for (let i = 1000; i < 1100; i++) enqueueCompression(store, { project: "p", sessionId: `s${i}`, at: i });
    const perCall = (performance.now() - started) / 100;
    // The hook budget is about 100 ms. This bound is loose on purpose so a slow CI box does not flake.
    expect(perCall).toBeLessThan(25);
    store.close();
  });
});
