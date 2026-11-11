// a since/until range filters search, a query with a time expression reports its parsed range, and a query
// with no time expression reports an unparsed range (null) instead of silently guessing. The Recall@5 temporal-subset
// gain is a benchmark and is left UNVERIFIED.
import { describe, expect, test } from "bun:test";
import { searchMemory } from "../src/hub/search.mjs";
import { searchPage } from "../src/hub/lists.mjs";
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

  test("a time expression in the query narrows search and paged search; an explicit range wins", async () => {
    const store = new HubStore(":memory:");
    try {
      const day = 86_400_000;
      store.add({ project: "shop", kind: "note", type: "note", title: "recent deploy", narrative: "deployment recent", createdAtEpoch: Date.now() - day }, { actor: "import" });
      store.add({ project: "shop", kind: "note", type: "note", title: "old deploy", narrative: "deployment old", createdAtEpoch: Date.now() - 60 * day }, { actor: "import" });
      const titles = (rows) => rows.filter((r) => r.kind !== "fact").map((r) => r.title);
      const plain = await searchMemory({ store, query: "deployment", project: "shop" });
      expect(titles(plain.results).sort()).toEqual(["old deploy", "recent deploy"]);
      expect(plain.channels.time).toBeUndefined();
      const timed = await searchMemory({ store, query: "deployment yesterday", project: "shop" });
      expect(titles(timed.results)).toEqual(["recent deploy"]);
      expect(timed.channels.time.since).toBeNumber();
      const explicit = await searchMemory({ store, query: "deployment yesterday", project: "shop", since: 0, until: Date.now() + day });
      expect(titles(explicit.results).sort()).toEqual(["old deploy", "recent deploy"]);
      const paged = searchPage(store, { query: "deployment yesterday", project: "shop", limit: 10, offset: 0 });
      expect(paged.results.map((r) => r.title)).toEqual(["recent deploy"]);
    } finally {
      store.close();
    }
  });
});
