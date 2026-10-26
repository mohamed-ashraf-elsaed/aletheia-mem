// Hybrid search: keyword channels always answer; when an embedder is available, fact and memory vectors join the
// fusion, and the result states which channels ran.
import { describe, expect, test } from "bun:test";
import { embedMissingFacts, formatChannels, searchMemory } from "../src/hub/search.mjs";
import { HubStore } from "../src/hub/store.mjs";

const fakeEmbedder = {
  model: "fake-2d",
  dim: 2,
  embedDocs: async (texts) => texts.map((text) => (String(text).toLowerCase().includes("alpha") ? [1, 0] : [0, 1])),
  embedQuery: async (query) => (String(query).toLowerCase().includes("gamma") ? [1, 0] : [0, 1]),
};

function seed(store) {
  const episode = store.addEpisode({ project: "shop", text: "The alpha subsystem lives here.", sourceRef: "alpha:1", createdAtEpoch: 1_000 });
  const fact = store.addFact({
    project: "shop", subject: "alpha subsystem", predicate: "uses", object: "a queue", text: "The alpha subsystem uses a queue",
    episodeId: episode.id, confidence: 0.9, recordedAtEpoch: 1_000,
  });
  const memory = store.add({ project: "shop", kind: "note", type: "note", title: "Alpha subsystem note", narrative: "The alpha subsystem uses a queue" });
  return { episode, fact: fact.fact, memory };
}

describe("hybrid search", () => {
  test("keyword search answers without an embedder and says vectors are off", async () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const { results, channels } = await searchMemory({ store, query: "alpha subsystem", project: "shop" });
      expect(results.length).toBeGreaterThan(0);
      expect(channels.facts.vector).toBe(false);
      expect(channels.episodes.vector).toBe(false);
      expect(formatChannels(channels)).toContain("facts lexical=on");
      expect(formatChannels(channels)).toContain("vectors=off");
    } finally {
      store.close();
    }
  });

  test("a fact vector is written automatically and rescues a lexically absent query", async () => {
    const store = new HubStore(":memory:");
    try {
      const { fact } = seed(store);
      expect(await embedMissingFacts(store, fakeEmbedder)).toBe(1);
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM fact_vectors").get().n).toBe(1);

      const keywordOnly = await searchMemory({ store, query: "gamma", project: "shop" });
      expect(keywordOnly.results).toHaveLength(0);
      expect(keywordOnly.channels.facts.vector).toBe(false);

      const dense = await searchMemory({ store, query: "gamma", project: "shop", embedder: fakeEmbedder });
      expect(dense.results.some((row) => row.kind === "fact" && row.id === fact.id)).toBe(true);
      expect(dense.channels.facts.vector).toBe(true);
      expect(formatChannels(dense.channels)).toContain("vectors=on");
    } finally {
      store.close();
    }
  });

  test("facts and episodes are fused with RRF and both kinds are present", async () => {
    const store = new HubStore(":memory:");
    try {
      const { fact, memory } = seed(store);
      const vec = (await fakeEmbedder.embedDocs(["alpha subsystem"]))[0];
      store.setVector(memory.id, fakeEmbedder.model, vec);
      const { results, channels } = await searchMemory({ store, query: "alpha subsystem", project: "shop", embedder: fakeEmbedder });
      expect(channels.episodes.vector).toBe(true);
      expect(results.some((row) => row.kind === "fact" && row.id === fact.id)).toBe(true);
      expect(results.some((row) => row.kind === "memory" && row.id === memory.id)).toBe(true);
      expect(channels.fused).toBe("rrf");
    } finally {
      store.close();
    }
  });

  test("scope and history are stated in the channel report", async () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const { channels } = await searchMemory({ store, query: "alpha", project: "shop", scope: "all", includeHistory: true });
      expect(channels.scope).toBe("all");
      expect(channels.history).toBe(true);
      expect(formatChannels(channels)).toContain("history=on");
    } finally {
      store.close();
    }
  });
});
