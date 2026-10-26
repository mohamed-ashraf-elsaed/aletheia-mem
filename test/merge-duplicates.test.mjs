// T-029: merge a duplicate into the older id. The loser is kept with status 'merged', its facts move to the
// survivor, and the audit trail names both ids.
import { describe, expect, test } from "bun:test";
import { mergeDuplicates } from "../src/hub/dedupe.mjs";
import { HubStore } from "../src/hub/store.mjs";

function seed() {
  const store = new HubStore(":memory:");
  const older = store.addObservation({ project: "p", type: "bugfix", title: "retry loop", narrative: "the retry loop applied the delay twice", createdAtEpoch: 1000, importance: 0.4 });
  const newer = store.addObservation({ project: "p", type: "bugfix", title: "retry loop", narrative: "the timer reset applied the delay twice", createdAtEpoch: 2000, importance: 0.9 });
  const episode = store.addEpisode({ project: "p", text: "retry loop fix", createdAtEpoch: 500 });
  store.addFact({ project: "p", subject: "retry loop", predicate: "resets", object: "the timer", text: "The retry loop resets the timer", episodeId: episode.id, observationId: newer.id });
  store.addFact({ project: "p", subject: "retry loop", predicate: "applies", object: "the delay twice", text: "The retry loop applies the delay twice", episodeId: episode.id, observationId: newer.id });
  return { store, older, newer };
}

describe("merge duplicates", () => {
  test("the older id survives, facts are unioned, and the loser is kept as merged", () => {
    const { store, older, newer } = seed();
    const result = mergeDuplicates(store, newer.id, older.id);

    expect(result.keepId).toBe(older.id);
    expect(result.dropId).toBe(newer.id);
    expect(result.facts).toBe(2);
    expect(store.getObservation(older.id).narrative).toContain(`Merged from #${newer.id}:`);
    expect(store.getObservation(older.id).importance).toBe(0.9); // the higher importance wins
    expect(store.getObservation(newer.id).status).toBe("merged");
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM observations").get().n).toBe(2); // no silent delete
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE observation_id = ?").get(older.id).n).toBe(2);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE observation_id = ?").get(newer.id).n).toBe(0);
    const link = store.db.prepare("SELECT * FROM memory_links WHERE relation = 'duplicate_of'").get();
    expect(link).toMatchObject({ from_type: "observation", from_id: older.id, to_type: "observation", to_id: newer.id });
    store.close();
  });

  test("the audit row names both ids and the merge is idempotent", () => {
    const { store, older, newer } = seed();
    mergeDuplicates(store, older.id, newer.id);
    const audit = store.auditLog().find((row) => row.action === "observation.merge");
    expect(audit.detail).toMatchObject({ keep: older.id, drop: newer.id, facts: 2 });
    const again = mergeDuplicates(store, older.id, newer.id);
    expect(again.keepId).toBe(older.id);
    expect(store.getObservation(older.id).narrative.match(/Merged from/g)).toHaveLength(1);
    store.close();
  });

  test("a merge across projects and a self merge are refused", () => {
    const store = new HubStore(":memory:");
    const a = store.addObservation({ project: "p", title: "a", narrative: "one" });
    const b = store.addObservation({ project: "q", title: "b", narrative: "two" });
    expect(() => mergeDuplicates(store, a.id, b.id)).toThrow(/across projects/);
    expect(() => mergeDuplicates(store, a.id, a.id)).toThrow(/different observations/);
    expect(() => mergeDuplicates(store, a.id, 9999)).toThrow(/must exist/);
    store.close();
  });
});
