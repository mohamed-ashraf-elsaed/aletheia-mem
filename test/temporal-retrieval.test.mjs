// T-043: a since/until range filters search, a query with a time expression reports its parsed range, and a query
// with no time expression reports an unparsed range (null) instead of silently guessing. The Recall@5 temporal-subset
// gain is a benchmark and is left UNVERIFIED.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { expandQuery, timeFilter } from "../src/hub/query.mjs";

describe("temporal retrieval", () => {
  test("a since/until range filters search results", () => {
    const store = new HubStore(":memory:");
    try {
      store.add({ project: "shop", kind: "note", type: "note", title: "old", narrative: "old deployment", createdAtEpoch: Date.UTC(2026, 9, 1) }, { actor: "import" });
      store.add({ project: "shop", kind: "note", type: "note", title: "new", narrative: "new deployment", createdAtEpoch: Date.UTC(2026, 9, 25) }, { actor: "import" });
      const hits = store.search({ query: "deployment", project: "shop", since: Date.UTC(2026, 9, 20), limit: 10 });
      expect(hits.map((m) => m.title)).toEqual(["new"]);
    } finally {
      store.close();
    }
  });

  test("a query with a time expression reports the parsed range", () => {
    const base = Date.UTC(2026, 9, 26, 12);
    const expanded = expandQuery("what did we deploy last week", { baseEpoch: base });
    expect(expanded.path).toBe("time");
    expect(timeFilter(expanded)).toEqual({ since: Date.UTC(2026, 9, 19), until: Date.UTC(2026, 9, 26) });
  });

  test("a query with no time expression reports an unparsed range, not a guess", () => {
    const expanded = expandQuery("what did we deploy", { baseEpoch: Date.UTC(2026, 9, 26, 12) });
    expect(expanded.time).toBeNull();
    expect(expanded.path).toBe("none");
    expect(timeFilter(expanded)).toBeNull();
  });
});
