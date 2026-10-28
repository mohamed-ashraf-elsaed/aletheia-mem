// the graph channel stays bounded and timed out, an entity page resolves every link, and turning the flag
// off restores the old ranking exactly. Synthetic entities, facts and edges; no model, no network.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { attachFactEntities, upsertEntity } from "../src/hub/entities.mjs";
import { entityPage, graphEnabled, graphWalk, linkMemoryEntity } from "../src/hub/graph.mjs";
import { entityPageView, graphTraceView } from "../public-hub/graph.js";

describe("graph production channel", () => {
  test("the walk records provenance and stays bounded and timed out", () => {
    const store = new HubStore(":memory:");
    const a = store.add({ project: "p", kind: "note", type: "note", title: "seed", narrative: "alpha shared" }, { actor: "import" });
    const b = store.add({ project: "p", kind: "note", type: "note", title: "neighbour", narrative: "beta shared" }, { actor: "import" });
    linkMemoryEntity(store, { memoryId: a.id, entity: "shared" });
    linkMemoryEntity(store, { memoryId: b.id, entity: "shared" });

    const walked = graphWalk(store, { seeds: [a.id], project: "p", maxHops: 1 });
    expect(walked.ids).toContain(b.id);
    expect(walked.provenance[b.id]).toContain("shared");
    expect(walked.trace.length).toBeGreaterThan(0);

    const timed = graphWalk(store, { seeds: [a.id], project: "p", deadlineMs: 0 });
    expect(timed.trace.some((line) => line.includes("timeout"))).toBe(true);
    expect(graphEnabled(store)).toBe(false);
    store.close();
  });

  test("an entity page resolves its aliases, facts and memories", () => {
    const store = new HubStore(":memory:");
    const entity = upsertEntity(store, { project: "p", name: "checkout service", type: "service" });
    const memory = store.add({ project: "p", kind: "note", type: "note", title: "checkout note", narrative: "the checkout service retries" }, { actor: "import" });
    linkMemoryEntity(store, { memoryId: memory.id, entity: entity.entity.canonical_name });
    const episode = store.addEpisode({ project: "p", text: "the checkout service uses Postgres", createdAtEpoch: 1 });
    const fact = store.addFact({ project: "p", episodeId: episode.id, subject: "checkout service", predicate: "uses", object: "Postgres", text: "checkout service uses Postgres" });
    attachFactEntities(store, { factId: fact.id, project: "p", subject: fact.fact.subject, object: fact.fact.object, text: fact.fact.text });

    const page = entityPage(store, { id: entity.id });
    expect(page.found).toBe(true);
    expect(page.aliases.length).toBeGreaterThan(0);
    expect(page.facts.map((f) => f.id)).toContain(fact.id);
    expect(page.memories.map((m) => m.id)).toContain(memory.id);

    const view = entityPageView(page);
    expect(view.title).toBe("checkout service");
    expect(view.memories.length).toBeGreaterThan(0);
    expect(graphTraceView(["hop 1: 1 entities -> 1 memories"]).length).toBe(1);
    store.close();
  });

  test("disabling the flag restores the old ranking exactly", () => {
    const store = new HubStore(":memory:");
    const a = store.add({ project: "p", kind: "note", type: "note", title: "seed", narrative: "alpha shared" }, { actor: "import" });
    const b = store.add({ project: "p", kind: "note", type: "note", title: "neighbour", narrative: "beta shared" }, { actor: "import" });
    linkMemoryEntity(store, { memoryId: a.id, entity: "shared" });
    linkMemoryEntity(store, { memoryId: b.id, entity: "shared" });

    const off = store.ranked({ query: "alpha", project: "p", limit: 10, graph: false });
    const defaultOff = store.ranked({ query: "alpha", project: "p", limit: 10 });
    expect(off.map((m) => m.id)).toEqual(defaultOff.map((m) => m.id));
    expect(off.map((m) => m.id)).not.toContain(b.id);

    const on = store.ranked({ query: "alpha", project: "p", limit: 10, graph: true });
    expect(on.map((m) => m.id)).toContain(b.id);
    store.close();
  });
});
