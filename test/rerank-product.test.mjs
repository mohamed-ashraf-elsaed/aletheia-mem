// Opt-in cross-encoder rerank in product search: off by default, a fake cross-encoder is injected (no model download),
// a time budget falls back to the fused order, and the missing optional package never breaks search.
import { describe, expect, test } from "bun:test";
import { createReranker, rerankCandidates } from "../src/hub/rerank.mjs";
import { formatChannels, searchMemory } from "../src/hub/search.mjs";
import { readSettings, validateSetting } from "../src/hub/settings.mjs";
import { HubStore } from "../src/hub/store.mjs";

function seed(store) {
  store.add({ project: "shop", kind: "note", type: "note", title: "Queue alpha", narrative: "alpha queue notes about retries" });
  store.add({ project: "shop", kind: "note", type: "note", title: "Queue beta", narrative: "alpha queue notes about the answer: use pm2" });
  store.add({ project: "shop", kind: "note", type: "note", title: "Queue gamma", narrative: "alpha queue notes about logging" });
}
const base = (store) => ({ store, query: "alpha queue", project: "shop" });
// Scores a text higher when it holds "answer", like a cross-encoder that reads the question and the candidate together.
const fake = { model: "fake-ce", score: async (_q, texts) => texts.map((t) => (/answer/.test(t) ? 10 : 0)) };

describe("rerank in product search", () => {
  test("off by default: no rerank channel, fused order unchanged", async () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const { channels } = await searchMemory({ ...base(store), reranker: fake });
      expect(channels.rerank).toBeUndefined();
      expect(formatChannels(channels)).not.toContain("rerank");
    } finally { store.close(); }
  });

  test("on with a fake cross-encoder: the best candidate moves to the top and the channel says so", async () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const plain = await searchMemory(base(store));
      const { results, channels } = await searchMemory({ ...base(store), rerank: true, reranker: fake });
      expect(results[0].title).toBe("Queue beta");
      expect(results.length).toBe(plain.results.length);
      expect(channels.rerank).toMatchObject({ model: "fake-ce", status: "on" });
      expect(formatChannels(channels)).toContain("rerank=on (fake-ce,");
    } finally { store.close(); }
  });

  test("over the time budget falls back to the fused order", async () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const plain = await searchMemory(base(store));
      const slow = { model: "slow", score: () => new Promise((resolve) => setTimeout(() => resolve([0, 0, 9]), 500)) };
      const t0 = performance.now();
      const { results, channels } = await searchMemory({ ...base(store), rerank: true, reranker: slow, rerankBudgetMs: 30 });
      expect(performance.now() - t0).toBeLessThan(400);
      expect(results.map((r) => r.id)).toEqual(plain.results.map((r) => r.id));
      expect(channels.rerank.status).toBe("fallback");
      expect(channels.rerank.reason).toContain("budget");
      expect(formatChannels(channels)).toContain("rerank=fallback");
    } finally { store.close(); }
  });

  test("a scorer that throws, or returns the wrong count, falls back", async () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const plain = await searchMemory(base(store));
      for (const bad of [{ model: "x", score: async () => { throw new Error("boom"); } }, { model: "y", score: async () => [1] }]) {
        const { results, channels } = await searchMemory({ ...base(store), rerank: true, reranker: bad });
        expect(results.map((r) => r.id)).toEqual(plain.results.map((r) => r.id));
        expect(channels.rerank.status).toBe("fallback");
      }
    } finally { store.close(); }
  });

  test("without the optional package, rerank=true falls back and says so", async () => {
    const store = new HubStore(":memory:");
    const prior = process.env.ALETHEIA_TRANSFORMERS_FROM;
    process.env.ALETHEIA_TRANSFORMERS_FROM = "/nonexistent-dir";
    try {
      seed(store);
      const { results, channels } = await searchMemory({ ...base(store), rerank: true });
      expect(results.length).toBe(3);
      expect(channels.rerank.status).toBe("fallback");
      expect(channels.rerank.reason).toContain("@huggingface/transformers");
      await expect(createReranker()).rejects.toThrow("optional package");
    } finally {
      if (prior === undefined) delete process.env.ALETHEIA_TRANSFORMERS_FROM; else process.env.ALETHEIA_TRANSFORMERS_FROM = prior;
      store.close();
    }
  });

  test("rerankCandidates reorders only the head and keeps the tail", async () => {
    const items = ["a", "b", "c", "d"].map((id) => ({ id, text: id === "c" ? "answer" : id }));
    const out = await rerankCandidates(fake, "q", items, { topN: 3 });
    expect(out.map((i) => i.id)).toEqual(["c", "a", "b", "d"]);
  });

  test("the setting exists, is off by default, and validates", () => {
    const store = new HubStore(":memory:");
    expect(readSettings(store).find((s) => s.key === "search.rerank").value).toBe(false);
    expect(validateSetting("search.rerank", true).ok).toBe(true);
    expect(validateSetting("search.rerank", "yes").ok).toBe(false);
    store.close();
  });
});
