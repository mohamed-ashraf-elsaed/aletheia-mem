// valid time and record time are separate. valid_to is the only way a fact stops being current.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";

const seed = (store) => {
  const episode = store.addEpisode({ project: "shop", text: "The API uses Postgres 15.", sourceRef: "turn:1", createdAtEpoch: 1_000 });
  const first = store.addFact({
    project: "shop", subject: "API", predicate: "uses", object: "Postgres 15",
    text: "The API uses Postgres 15", episodeId: episode.id, validFromEpoch: 100, validToEpoch: 200, recordedAtEpoch: 150,
  });
  const second = store.addFact({
    project: "shop", subject: "API", predicate: "uses", object: "Postgres 16",
    text: "The API uses Postgres 16", episodeId: episode.id, validFromEpoch: 200, recordedAtEpoch: 200,
  });
  return { episode, first: first.fact, second: second.fact };
};

describe("bi-temporal facts", () => {
  test("a fact with valid_to is excluded from current results", () => {
    const store = new HubStore(":memory:");
    const { first, second } = seed(store);
    const current = store.factsCurrent({ project: "shop" });
    expect(current.map((f) => f.id)).toEqual([second.id]);
    expect(store.factsCurrent({ project: "shop", now: 150 }).map((f) => f.id)).toEqual([first.id]);
    store.close();
  });

  test("an as-of query returns the fact that was true inside its range", () => {
    const store = new HubStore(":memory:");
    const { first, second } = seed(store);
    expect(store.factsAsOf(150, { project: "shop" }).map((f) => f.id)).toEqual([first.id]);
    expect(store.factsAsOf(199, { project: "shop" }).map((f) => f.id)).toEqual([first.id]);
    expect(store.factsAsOf(200, { project: "shop" }).map((f) => f.id)).toEqual([second.id]);
    expect(store.factsAsOf(50, { project: "shop" })).toEqual([]);
    store.close();
  });

  test("closing a fact changes valid_to and status but never recorded_at", () => {
    const store = new HubStore(":memory:");
    const { first } = seed(store);
    const before = store.getFact(first.id);
    const closed = store.closeFact(first.id, { validToEpoch: 300 });
    expect(closed).toMatchObject({ status: "superseded", valid_to_epoch: 300, recorded_at_epoch: before.recorded_at_epoch, created_at_epoch: before.created_at_epoch });
    expect(store.getFact(first.id).valid_from_epoch).toBe(100);
    store.close();
  });

  test("history keeps both rows, oldest first, after the newer fact supersedes the older", () => {
    const store = new HubStore(":memory:");
    const { first, second } = seed(store);
    store.closeFact(first.id, { validToEpoch: second.valid_from_epoch });
    const history = store.factsHistory({ project: "shop", subject: "API" });
    expect(history.map((f) => [f.id, f.status])).toEqual([[first.id, "superseded"], [second.id, "active"]]);
    expect(history[0].valid_to_epoch).toBe(second.valid_from_epoch);
    store.close();
  });
});
