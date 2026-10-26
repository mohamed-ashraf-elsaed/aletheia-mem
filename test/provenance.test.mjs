// T-023: every fact resolves to the episodes that produced it, and provenance returns the original turn text.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";

describe("provenance", () => {
  test("a fact without an episode is refused", () => {
    const store = new HubStore(":memory:");
    expect(() => store.addFact({ project: "p", subject: "a", predicate: "uses", object: "b", text: "a uses b" })).toThrow(/episode_id/);
    expect(() => store.addFact({ project: "p", subject: "a", predicate: "uses", object: "b", text: "a uses b", episodeId: 999 })).toThrow(/episode_id/);
    store.close();
  });

  test("provenance returns the episode text and source ref for a fact", () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "shop", tool: "claude-code", kind: "prompt", text: "The checkout retry uses fibonacci jitter.", sourceRef: "turn:42", createdAtEpoch: 1000 });
    const fact = store.addFact({ project: "shop", subject: "checkout retry", predicate: "uses", object: "fibonacci jitter", text: "The checkout retry uses fibonacci jitter", episodeId: episode.id });
    const p = store.provenance("fact", fact.id);
    expect(p.found).toBe(true);
    expect(p.episode).toMatchObject({ id: episode.id, source_ref: "turn:42" });
    expect(p.episode.text).toContain("fibonacci jitter");
    expect(store.provenance("episode", episode.id).found).toBe(true);
    expect(store.provenance("fact", 9999)).toMatchObject({ found: false });
    store.close();
  });

  test("a captured memory becomes an episode once, and the chain resolves", () => {
    const store = new HubStore(":memory:");
    const added = store.add({ project: "shop", kind: "prompt", title: "Use Postgres 15", narrative: "The API uses Postgres 15 for storage", tool: "claude-code" });
    const memory = store.get(added.id);
    const episode = store.ensureEpisodeForMemory(memory);
    const again = store.ensureEpisodeForMemory(memory);
    expect(again.id).toBe(episode.id);
    const fact = store.addFact({ project: "shop", subject: "API", predicate: "uses", object: "Postgres 15", text: "The API uses Postgres 15", episodeId: episode.id });
    const p = store.provenance("memory", added.id);
    expect(p.episode.id).toBe(episode.id);
    expect(p.episode.text).toBe("The API uses Postgres 15 for storage");
    expect(store.provenance("fact", fact.id).episode.id).toBe(episode.id);
    store.close();
  });

  test("deleting an episode is refused while a fact references it", () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "p", text: "The API uses Postgres 15." });
    store.addFact({ project: "p", subject: "API", predicate: "uses", object: "Postgres 15", text: "The API uses Postgres 15", episodeId: episode.id });
    expect(() => store.deleteEpisode(episode.id)).toThrow(/fact\(s\) reference it/);
    expect(store.getEpisode(episode.id)).not.toBeNull();

    const lonely = store.addEpisode({ project: "p", text: "A turn nothing references." });
    expect(store.deleteEpisode(lonely.id)).toBe(true);
    expect(store.getEpisode(lonely.id)).toBeNull();
    store.close();
  });

  test("an observation with a source episode keeps that link", () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "p", text: "We fixed the retry loop." });
    const observation = store.addObservation({ project: "p", type: "bugfix", title: "Retry loop fixed", narrative: "The delay was applied twice.", episodeId: episode.id });
    const p = store.provenance("observation", observation.id);
    expect(p.found).toBe(true);
    expect(p.episode.id).toBe(episode.id);
    expect(p.episodes.map((e) => e.text)).toContain("We fixed the retry loop.");
    store.close();
  });
});
