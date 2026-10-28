// graph retrieval walks entity links from seed memories and fuses the neighbours as a fourth RRF list,
// behind a flag that is off by default. Synthetic entities and edges; the real LoCoMo part is UNVERIFIED.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { graphWalk, linkMemoryEntity } from "../src/hub/graph.mjs";

function seed(store) {
  const a = store.add({ project: "p", kind: "note", type: "note", title: "seed alpha", narrative: "alpha beta topic_one" }, { actor: "import" });
  const b = store.add({ project: "p", kind: "note", type: "note", title: "neighbour", narrative: "gamma delta topic_one" }, { actor: "import" });
  const c = store.add({ project: "p", kind: "note", type: "note", title: "two-hop", narrative: "epsilon zeta topic_two" }, { actor: "import" });
  const d = store.add({ project: "q", kind: "note", type: "note", title: "other project", narrative: "gamma topic_one" }, { actor: "import" });
  linkMemoryEntity(store, { memoryId: a.id, entity: "topic_one" });
  linkMemoryEntity(store, { memoryId: b.id, entity: "topic_one" });
  linkMemoryEntity(store, { memoryId: b.id, entity: "topic_two" });
  linkMemoryEntity(store, { memoryId: c.id, entity: "topic_two" });
  linkMemoryEntity(store, { memoryId: d.id, entity: "topic_one" });
  return { a, b, c, d };
}

describe("graph retrieval", () => {
  test("walks one and two hops over shared entities without crossing projects", () => {
    const store = new HubStore(":memory:");
    const { a, b, c, d } = seed(store);
    const one = graphWalk(store, { seeds: [a.id], project: "p", maxHops: 1 });
    expect(one.ids).toContain(b.id);
    expect(one.ids).not.toContain(c.id);
    expect(one.ids).not.toContain(d.id);

    const two = graphWalk(store, { seeds: [a.id], project: "p", maxHops: 2 });
    expect(two.ids).toContain(b.id);
    expect(two.ids).toContain(c.id);
    expect(two.ids).not.toContain(d.id);
    store.close();
  });

  test("refuses an unscoped walk and honours a zero deadline", () => {
    const store = new HubStore(":memory:");
    const { a } = seed(store);
    expect(graphWalk(store, { seeds: [a.id], project: null }).ids).toEqual([]);
    const timed = graphWalk(store, { seeds: [a.id], project: "p", deadlineMs: 0 });
    expect(timed.trace.some((line) => line.includes("timeout"))).toBe(true);
    store.close();
  });

  test("the graph channel is off by default and opt-in fuses neighbours", () => {
    const store = new HubStore(":memory:");
    const { a, b } = seed(store);
    const off = store.ranked({ query: "alpha", project: "p", limit: 10 });
    expect(off.map((m) => m.id)).toContain(a.id);
    expect(off.map((m) => m.id)).not.toContain(b.id);

    const on = store.ranked({ query: "alpha", project: "p", limit: 10, graph: true });
    expect(on.map((m) => m.id)).toContain(a.id);
    expect(on.map((m) => m.id)).toContain(b.id);
    store.close();
  });
});
