// T-050: a bounded retrieval cache keyed on the normalised query + filters + store revision. A revision bump changes
// the key, so a write can never return a stale result; the size is bounded and the hit rate is tracked.
import { describe, expect, test } from "bun:test";
import { RetrievalCache } from "../src/hub/cache.mjs";

describe("RetrievalCache", () => {
  test("a revision bump invalidates the previous result", () => {
    let rev = 0;
    const cache = new RetrievalCache({ revision: () => rev });
    const first = cache.key({ query: "Payment retry", project: "shop" });
    cache.set(first, ["a"]);
    expect(cache.get(first)).toEqual(["a"]);
    rev = 1; // a write happened
    const after = cache.key({ query: "Payment retry", project: "shop" });
    expect(after).not.toBe(first);
    expect(cache.get(after)).toBeUndefined();
  });

  test("the cache is bounded and evicts the least recently used entry", () => {
    const cache = new RetrievalCache({ capacity: 2, revision: () => 0 });
    const a = cache.key({ query: "a" });
    const b = cache.key({ query: "b" });
    const c = cache.key({ query: "c" });
    cache.set(a, 1);
    cache.set(b, 2);
    cache.get(a); // refresh a
    cache.set(c, 3); // evicts b
    expect(cache.map.size).toBe(2);
    expect(cache.get(a)).toBe(1);
    expect(cache.get(b)).toBeUndefined();
    expect(cache.get(c)).toBe(3);
  });

  test("filters are part of the key", () => {
    const cache = new RetrievalCache({ revision: () => 0 });
    expect(cache.key({ query: "q", project: "p1" })).not.toBe(cache.key({ query: "q", project: "p2" }));
    expect(cache.key({ query: "q", kind: "observation" })).not.toBe(cache.key({ query: "q", kind: "summary" }));
  });

  test("a repeated query hits and the hit rate is tracked", () => {
    const cache = new RetrievalCache({ revision: () => 0 });
    const key = cache.key({ query: "payment", project: "shop" });
    cache.set(key, ["x"]);
    cache.get(key);
    cache.get(cache.key({ query: "other" }));
    expect(cache.hits).toBe(1);
    expect(cache.misses).toBe(1);
    expect(cache.hitRate).toBe(0.5);
  });
});
