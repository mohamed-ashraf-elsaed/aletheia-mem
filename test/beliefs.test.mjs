// entity summaries cite their source facts, and a contested belief stays visible with both sides, in the summary too.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { attachFactEntities, upsertEntity } from "../src/hub/entities.mjs";
import { buildEntitySummary } from "../src/hub/summaries.mjs";
import { contestedFacts } from "../src/hub/beliefs.mjs";

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
    store.close();
  });

  test("an entity summary cites its source facts, names the contested belief and is deterministic", () => {
    const store = new HubStore(":memory:");
    const { entity, older, newer } = seed(store);
    const first = buildEntitySummary(store, { entityId: entity.id, now: 1000 });
    const second = buildEntitySummary(store, { entityId: entity.id, now: 2000 });
    expect(first.factIds).toEqual(expect.arrayContaining([older.id, newer.id]));
    expect(first.summary.text).toContain("Contested:");
    expect(first.summary.text).toMatch(/database uses: Postgres 1[56] vs Postgres 1[56]/);
    expect(second.summary.text).toBe(first.summary.text);
    store.close();
  });

  test("a settled entity has no Contested section", () => {
    const store = new HubStore(":memory:");
    const entity = upsertEntity(store, { project: "p", name: "cache", type: "concept" });
    const episode = store.addEpisode({ project: "p", text: "cache uses Redis", createdAtEpoch: 1 });
    const fact = store.addFact({ project: "p", episodeId: episode.id, subject: "cache", predicate: "uses", object: "Redis", text: "cache uses Redis" });
    attachFactEntities(store, { factId: fact.id, project: "p", subject: "cache", object: "Redis", text: "cache uses Redis", entities: [{ name: "cache", type: "concept" }] });
    expect(buildEntitySummary(store, { entityId: entity.id, now: 1000 }).summary.text).not.toContain("Contested:");
    store.close();
  });
});
