// Search over facts: fact text and extracted keys are indexed in FTS5, current facts are the default, history and
// as-of are explicit, and every hit cites the episode that produced it.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";

function seed() {
  const store = new HubStore(":memory:");
  const episode = store.addEpisode({ project: "shop", tool: "claude-code", kind: "prompt", text: "The checkout retry uses exponential backoff.", sourceRef: "turn:7", createdAtEpoch: 1000 });
  const older = store.addFact({ project: "shop", subject: "checkout retry", predicate: "uses", object: "fibonacci jitter", text: "The checkout retry uses fibonacci jitter", episodeId: episode.id, validFromEpoch: 1000, recordedAtEpoch: 2000 });
  return { store, episode, older: store.getFact(older.id) };
}

describe("fact search", () => {
  test("a word in the fact text or an extracted key finds the fact and its source", () => {
    const { store, episode, older } = seed();
    const byText = store.searchFacts({ query: "fibonacci", project: "shop" });
    expect(byText).toHaveLength(1);
    expect(byText[0]).toMatchObject({ kind: "fact", id: older.id, project: "shop", status: "active" });
    expect(byText[0].source).toMatchObject({ type: "fact", episodeId: episode.id, sourceRef: "turn:7" });
    expect(byText[0].source.episodeText).toContain("exponential backoff");

    // An extracted key can carry a word the raw turn and the fact sentence do not.
    store.addKey({ ownerType: "fact", ownerId: older.id, keyType: "entity", text: "delivery-schedule" });
    const byKey = store.searchFacts({ query: "delivery-schedule", project: "shop" });
    expect(byKey.map((hit) => hit.id)).toEqual([older.id]);
    expect(byKey[0].source.episodeId).toBe(episode.id);
    store.close();
  });

  test("searchAll returns the fact hit and the memory hit, both with a source", () => {
    const { store } = seed();
    store.add({ project: "shop", title: "Retry notes", narrative: "we discussed exponential backoff twice", tool: "codex" });
    const factHits = store.searchAll({ query: "fibonacci jitter", project: "shop" });
    expect(factHits.some((hit) => hit.kind === "fact")).toBe(true);
    const memoryHits = store.searchAll({ query: "exponential backoff", project: "shop" });
    expect(memoryHits.some((hit) => hit.kind === "memory")).toBe(true);
    for (const hit of [...factHits, ...memoryHits]) expect(hit.source).toBeTruthy();
    store.close();
  });

  test("a superseded fact is hidden by default, history returns both newest-current first, and as-of sees the old one", () => {
    const { store, episode, older } = seed();
    const newer = store.addFact({ project: "shop", subject: "checkout retry", predicate: "uses", object: "linear backoff", text: "The checkout retry uses linear backoff", episodeId: episode.id, validFromEpoch: 3000, recordedAtEpoch: 3000 });
    store.closeFact(older.id, { validToEpoch: 3000 });

    const current = store.searchFacts({ query: "checkout retry", project: "shop" });
    expect(current.map((hit) => hit.id)).toEqual([newer.id]);

    const history = store.searchFacts({ query: "checkout retry", project: "shop", includeHistory: true });
    expect(history.map((hit) => hit.id)).toEqual([newer.id, older.id]);
    expect(history[0].status).toBe("active");
    expect(history[1].status).toBe("superseded");

    const before = store.factsAsOf(2000, { project: "shop", subject: "checkout retry" });
    expect(before.map((fact) => fact.id)).toEqual([older.id]);
    const asOfHits = store.searchFacts({ query: "checkout retry", project: "shop", asOf: 2500 });
    expect(asOfHits.map((hit) => hit.id)).toEqual([older.id]);
    store.close();
  });

  test("an optional fact vector can surface a fact the words do not match", () => {
    const { store } = seed();
    const otherEpisode = store.addEpisode({ project: "shop", text: "Billing queues invoices.", createdAtEpoch: 1000 });
    const other = store.addFact({ project: "shop", subject: "billing", predicate: "uses", object: "queues", text: "Billing uses queues", episodeId: otherEpisode.id, validFromEpoch: 1000 });
    store.setFactVector(other.id, "test", [0, 1]);
    const hits = store.searchFacts({ query: "checkout", project: "shop", queryVec: [0, 1] });
    expect(hits.map((hit) => hit.id)).toContain(other.id);
    store.close();
  });
});
