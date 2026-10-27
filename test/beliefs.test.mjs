// T-098: entity summaries cite their source facts, a contested belief stays visible with both sides, and
// regeneration is deterministic. Rule-based only; model-generated summary prose is UNVERIFIED.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { attachFactEntities, upsertEntity } from "../src/hub/entities.mjs";
import { buildEntitySummary } from "../src/hub/summaries.mjs";
import { beliefSignature, beliefView, changedBeyond, contestedFacts, entitySummaryStale } from "../src/hub/beliefs.mjs";

function seed(store) {
  const entity = upsertEntity(store, { project: "p", name: "database", type: "concept" });
  const episode = store.addEpisode({ project: "p", text: "the database changed from Postgres 15 to 16", createdAtEpoch: 1 });
  const older = store.addFact({ project: "p", episodeId: episode.id, subject: "database", predicate: "uses", object: "Postgres 15", text: "database uses Postgres 15" });
  const newer = store.addFact({ project: "p", episodeId: episode.id, subject: "database", predicate: "uses", object: "Postgres 16", text: "database uses Postgres 16" });
  attachFactEntities(store, { factId: older.id, project: "p", subject: "database", object: "Postgres 15", text: "database uses Postgres 15", entities: [{ name: "database", type: "concept" }] });
  attachFactEntities(store, { factId: newer.id, project: "p", subject: "database", object: "Postgres 16", text: "database uses Postgres 16", entities: [{ name: "database", type: "concept" }] });
  return { entity, older, newer };
}

describe("beliefs", () => {
  test("a contested belief stays visible with both sides", () => {
    const store = new HubStore(":memory:");
    const { older, newer } = seed(store);
    const groups = contestedFacts(store, { project: "p" });
    expect(groups.length).toBe(1);
    expect(groups[0].map((fact) => fact.id)).toEqual(expect.arrayContaining([older.id, newer.id]));
    expect(beliefView(older.fact)).toMatchObject({ subject: "database", object: "Postgres 15", status: "active" });
    store.close();
  });

  test("an entity summary cites its source facts and is deterministic", () => {
    const store = new HubStore(":memory:");
    const { entity, older, newer } = seed(store);
    const first = buildEntitySummary(store, { entityId: entity.id, now: 1000 });
    const second = buildEntitySummary(store, { entityId: entity.id, now: 2000 });
    expect(first.factIds).toEqual(expect.arrayContaining([older.id, newer.id]));
    expect(second.summary.text).toBe(first.summary.text);
    expect(beliefSignature([older, newer])).toBe(beliefSignature([older, newer]));
    store.close();
  });

  test("regeneration is gated on a >20% source-fact change", () => {
    expect(changedBeyond([1, 2, 3, 4, 5], [1, 2, 3, 4])).toBe(false);
    expect(changedBeyond([1, 2, 3, 4, 5], [1, 2, 3])).toBe(true);

    const store = new HubStore(":memory:");
    const { entity, older } = seed(store);
    const summary = buildEntitySummary(store, { entityId: entity.id, now: 1000 });
    expect(entitySummaryStale(store, { entityId: entity.id, summary: summary.summary })).toBe(false);
    const episode = store.addEpisode({ project: "p", text: "database now uses MySQL", createdAtEpoch: 2 });
    const third = store.addFact({ project: "p", episodeId: episode.id, subject: "database", predicate: "uses", object: "MySQL", text: "database uses MySQL" });
    attachFactEntities(store, { factId: third.id, project: "p", subject: "database", object: "MySQL", text: "database uses MySQL", entities: [{ name: "database", type: "concept" }] });
    expect(entitySummaryStale(store, { entityId: entity.id, summary: summary.summary })).toBe(true);
    store.close();
  });
});
