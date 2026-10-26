// T-025: a newer fact on the same subject and predicate supersedes the older one. Nothing is deleted; history
// keeps both rows with their ranges; a same-time disagreement goes to the review queue.
import { describe, expect, test } from "bun:test";
import { resolveContradictions, storeFacts } from "../src/hub/facts.mjs";
import { HubStore } from "../src/hub/store.mjs";

const fact = (subject, object, episodeId, validFromEpoch, extra = {}) => ({
  subject, predicate: "uses", object, text: `The ${subject} uses ${object}`,
  confidence: 0.9, episodeIds: [episodeId], validFromEpoch, validToEpoch: null, dated: true, entities: [], supersedesId: null, ...extra,
});

describe("contradictions", () => {
  test("30 update pairs resolve newest-wins 30/30, no row is deleted, and history returns both", () => {
    const store = new HubStore(":memory:");
    const pairs = [];
    for (let i = 0; i < 30; i++) {
      const first = store.addEpisode({ project: "p", text: `service${i} uses v1`, createdAtEpoch: 1000 + i * 100 });
      const a = storeFacts(store, { facts: [fact(`service${i}`, "v1", first.id, first.created_at_epoch)], project: "p", mode: "provider", now: 1000 });
      const second = store.addEpisode({ project: "p", text: `service${i} now uses v2`, createdAtEpoch: 1050 + i * 100 });
      const b = storeFacts(store, { facts: [fact(`service${i}`, "v2", second.id, second.created_at_epoch)], project: "p", mode: "provider", now: 2000 });
      expect(b.superseded).toEqual([a.ids[0]]);
      pairs.push([a.ids[0], b.ids[0], second.created_at_epoch]);
    }

    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n).toBe(60); // nothing deleted
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE status = 'active'").get().n).toBe(30);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE status = 'superseded'").get().n).toBe(30);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'fact.supersede'").get().n).toBe(30);

    let correct = 0;
    for (const [older, newer, boundary] of pairs) {
      const a = store.getFact(older);
      const b = store.getFact(newer);
      if (a.status === "superseded" && a.valid_to_epoch === boundary && b.status === "active" && b.supersedes_id === older) correct++;
      const history = store.factsHistory({ project: "p", subject: a.subject });
      expect(history.map((row) => row.id)).toEqual([older, newer]);
      expect(history[0].valid_to_epoch).toBe(history[1].valid_from_epoch);
    }
    expect(correct).toBe(30);
    store.close();
  });

  test("a same-time disagreement keeps both facts, lowers confidence and queues a review", () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "p", text: "The API uses Postgres or MySQL", createdAtEpoch: 5000 });
    storeFacts(store, { facts: [fact("API", "Postgres", episode.id, 5000)], project: "p", mode: "provider", now: 5000 });
    const result = storeFacts(store, { facts: [fact("API", "MySQL", episode.id, 5000)], project: "p", mode: "provider", now: 5001 });
    expect(result.reviews).toHaveLength(1);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE status = 'active'").get().n).toBe(2);
    expect(store.reviewQueue()).toHaveLength(1);
    expect(store.reviewQueue()[0]).toMatchObject({ item_type: "fact", reason: "contradiction", status: "pending" });
    const confidences = store.db.prepare("SELECT confidence FROM facts ORDER BY id").all().map((row) => row.confidence);
    expect(confidences.every((value) => value < 0.9)).toBe(true);
    store.close();
  });

  test("an incoming fact that started earlier is stored as history and keeps the newer fact current", () => {
    const store = new HubStore(":memory:");
    const newerEpisode = store.addEpisode({ project: "p", text: "newer", createdAtEpoch: 2000 });
    const olderEpisode = store.addEpisode({ project: "p", text: "older", createdAtEpoch: 1000 });
    const newer = storeFacts(store, { facts: [fact("API", "Postgres 16", newerEpisode.id, 2000)], project: "p", mode: "provider", now: 3000 });
    const older = storeFacts(store, { facts: [fact("API", "Postgres 15", olderEpisode.id, 1000)], project: "p", mode: "provider", now: 3001 });
    expect(older.superseded).toEqual(older.ids);
    expect(store.getFact(older.ids[0])).toMatchObject({ status: "superseded", valid_to_epoch: 2000, supersedes_id: newer.ids[0] });
    expect(store.factsCurrent({ project: "p" }).map((row) => row.id)).toEqual(newer.ids);
    store.close();
  });

  test("a different predicate is a different sense and does not invalidate", () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "p", text: "API uses and runs", createdAtEpoch: 1000 });
    storeFacts(store, { facts: [fact("API", "Postgres", episode.id, 1000)], project: "p", mode: "provider", now: 1000 });
    storeFacts(store, { facts: [fact("API", "Node 20", episode.id, 1000, { predicate: "runs", text: "The API runs Node 20" })], project: "p", mode: "provider", now: 1001 });
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE status = 'active'").get().n).toBe(2);
    store.close();
  });

  test("an explicit supersedes id from the model closes that fact", () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "p", text: "config", createdAtEpoch: 1000 });
    const first = storeFacts(store, { facts: [fact("API", "Postgres 15", episode.id, 1000)], project: "p", mode: "provider", now: 1000 });
    const second = storeFacts(store, {
      facts: [fact("API", "Postgres 16", episode.id, 1000, { predicate: "database", text: "The API database is Postgres 16", supersedesId: first.ids[0] })],
      project: "p", mode: "provider", now: 1001,
    });
    expect(store.getFact(first.ids[0]).status).toBe("superseded");
    expect(store.getFact(second.ids[0]).supersedes_id).toBe(first.ids[0]);
    store.close();
  });

  test("resolveContradictions is idempotent for a fact that is no longer active", () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "p", text: "a", createdAtEpoch: 1000 });
    const first = storeFacts(store, { facts: [fact("API", "A", episode.id, 1000)], project: "p", mode: "provider", now: 1000 });
    const second = storeFacts(store, { facts: [fact("API", "B", episode.id, 2000)], project: "p", mode: "provider", now: 2000 });
    expect(resolveContradictions(store, { factId: first.ids[0] })).toMatchObject({ superseded: [] });
    expect(store.getFact(second.ids[0]).status).toBe("active");
    store.close();
  });
});
