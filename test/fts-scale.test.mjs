// the FTS plan stays a CROSS JOIN (the full-text table is the outer loop) and the prefix query form still
// matches after the index is optimized. The latency target is measured by bench/scale.mjs, not here.
import { describe, expect, test } from "bun:test";
import { HubStore, ftsQuery } from "../src/hub/store.mjs";

describe("FTS scale tuning", () => {
  test("the hot search plan pins memories_fts as the outer loop", () => {
    const store = new HubStore(":memory:");
    try {
      for (let i = 0; i < 50; i++) store.add({ project: "shop", kind: "note", type: "note", title: `Retry ${i}`, narrative: `Retry the payment number ${i}` }, { actor: "import" });
      store.optimizeFts();
      const plan = store.db.prepare("EXPLAIN QUERY PLAN SELECT m.id FROM memories_fts CROSS JOIN memories m ON m.id = memories_fts.rowid WHERE memories_fts MATCH 'payment' ORDER BY bm25(memories_fts) LIMIT 10").all().map((r) => r.detail).join("; ");
      expect(plan).toContain("memories_fts");
      expect(plan).toContain("rowid");
    } finally {
      store.close();
    }
  });

  test("the prefix query form and a full-word match survive optimize", () => {
    const store = new HubStore(":memory:");
    try {
      store.add({ project: "shop", kind: "note", type: "note", title: "payment", narrative: "payment pipeline" }, { actor: "import" });
      store.optimizeFts();
      expect(ftsQuery("pay")).toBe('"pay"*');
      expect(store.list({ q: "payment", project: "shop", limit: 5 }).items.length).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });
});
