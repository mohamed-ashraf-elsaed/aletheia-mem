// batch extraction, cap the input, and record tokens and estimated cost per call. A rejected answer is
// recorded with its raw output; a provider error is recorded and re-thrown so the queue can retry.
import { describe, expect, test } from "bun:test";
import { chunkEpisodes, extractWithUsage, storeFacts } from "../src/hub/facts.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { formatTotals, pricesFrom, totals } from "../src/hub/usage.mjs";

const episodes = (n, size = 40) => Array.from({ length: n }, (_, i) => ({ episodeId: i + 1, text: `${i}:${"x".repeat(size)}`, createdAtEpoch: 1000 + i }));
const answer = (episodeId) => JSON.stringify({
  facts: [{ subject: "checkout service", predicate: "uses", object: "Postgres", text: "The checkout service uses Postgres", valid_from: null, valid_to: null, confidence: 0.9, episode_ids: [episodeId] }],
});

describe("batching", () => {
  test("a window never exceeds the configured episode count or character budget", () => {
    const chunks = chunkEpisodes(episodes(10, 40), { maxEpisodes: 3, maxChars: 10_000 });
    expect(chunks.map((chunk) => chunk.length)).toEqual([3, 3, 3, 1]);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(3);
      expect(chunk.reduce((sum, item) => sum + item.text.length, 0)).toBeLessThanOrEqual(10_000);
    }

    const tight = chunkEpisodes(episodes(8, 60), { maxEpisodes: 40, maxChars: 100 });
    expect(tight.every((chunk) => chunk.reduce((sum, item) => sum + item.text.length, 0) <= 100)).toBe(true);
    expect(tight.map((chunk) => chunk.length)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });

  test("one oversized episode is truncated, and the count cap stays in 20-40", () => {
    const [chunk] = chunkEpisodes([{ episodeId: 1, text: "y".repeat(500) }], { maxEpisodes: 100, maxChars: 200 });
    expect(chunk[0].text.length).toBe(200);
    const many = chunkEpisodes(episodes(45, 1), { maxEpisodes: 100, maxChars: 100_000 });
    expect(Math.max(...many.map((c) => c.length))).toBe(40);
  });
});

describe("cost record", () => {
  test("one usage row per call, with tokens and dollars from configured prices", async () => {
    const store = new HubStore(":memory:");
    const first = store.addEpisode({ project: "shop", text: "The checkout service uses Postgres.", createdAtEpoch: 1000 });
    const second = store.addEpisode({ project: "shop", text: "The retry worker requires idempotency keys.", createdAtEpoch: 2000 });
    const ask = async (prompt) => answer(Number(/#(\d+)/.exec(prompt)[1]));
    const prices = pricesFrom({ prices: { inputPer1k: 1, outputPer1k: 2 } });

    const a = await extractWithUsage(store, { window: [{ episodeId: first.id, text: first.text }], project: "shop", ask, model: "small", batchId: "b1", prices, now: 5000 });
    const b = await extractWithUsage(store, { window: [{ episodeId: second.id, text: second.text }], project: "shop", ask, model: "small", batchId: "b2", prices, now: 5001 });
    expect(a.facts.length).toBe(1);
    expect(b.facts.length).toBe(1);
    storeFacts(store, { facts: a.facts, project: "shop", mode: "provider", model: "small", now: 5000 });
    storeFacts(store, { facts: b.facts, project: "shop", mode: "provider", model: "small", now: 5001 });

    const summary = totals(store);
    expect(summary.calls).toBe(2);
    expect(summary.input_tokens).toBeGreaterThan(0);
    expect(summary.output_tokens).toBeGreaterThan(0);
    expect(summary.estimated_usd).toBeCloseTo((summary.input_tokens / 1000) * 1 + (summary.output_tokens / 1000) * 2, 8);
    expect(summary.facts).toBe(2);
    expect(formatTotals(summary)).toContain("2 call(s)");
    const rows = store.db.prepare("SELECT batch_id, model, mode FROM fact_usage ORDER BY id").all();
    expect(rows).toEqual([{ batch_id: "b1", model: "small", mode: "provider" }, { batch_id: "b2", model: "small", mode: "provider" }]);
    store.close();
  });

  test("a rejected answer is recorded with its raw output and stores no fact", async () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "shop", text: "The checkout service uses Postgres." });
    const result = await extractWithUsage(store, { window: [{ episodeId: episode.id, text: episode.text }], project: "shop", ask: async () => "garbage", model: "small", now: 7000 });
    expect(result.rejected).toBe(true);
    const row = store.db.prepare("SELECT status, facts, raw_output, error FROM fact_usage ORDER BY id DESC LIMIT 1").get();
    expect(row.status).toBe("rejected");
    expect(row.facts).toBe(0);
    expect(row.raw_output).toBe("garbage");
    expect(row.error).toMatch(/JSON/);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n).toBe(0);
    store.close();
  });

  test("a provider error writes an error row and is re-thrown, so the queue retries", async () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "shop", text: "The checkout service uses Postgres." });
    await expect(extractWithUsage(store, { window: [{ episodeId: episode.id, text: episode.text }], project: "shop", ask: async () => { throw new Error("502 from provider"); }, model: "small", now: 8000 })).rejects.toThrow("502");
    const row = store.db.prepare("SELECT status, error, facts FROM fact_usage ORDER BY id DESC LIMIT 1").get();
    expect(row).toMatchObject({ status: "error", facts: 0 });
    expect(row.error).toContain("502");
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n).toBe(0);
    store.close();
  });
});
