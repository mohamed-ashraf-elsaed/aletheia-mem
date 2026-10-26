// FTS maintenance after a bulk write: the index still answers and the call is idempotent.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";

describe("optimizeFts", () => {
  test("rebuilds the three FTS indexes and leaves search working", () => {
    const store = new HubStore(":memory:");
    try {
      for (let i = 0; i < 200; i++) store.add({ project: "shop", kind: "note", type: "note", title: `Retry note ${i}`, narrative: `Retry policy number ${i}` }, { actor: "import" });
      const first = store.optimizeFts();
      expect(first.optimized).toEqual(["memories_fts", "facts_fts", "memory_keys_fts"]);
      expect(store.search({ query: "retry", project: "shop", limit: 5 }).length).toBe(5);
      expect(() => store.optimizeFts()).not.toThrow();
      expect(store.search({ query: "policy 42", project: "shop", limit: 5 }).length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });
});
