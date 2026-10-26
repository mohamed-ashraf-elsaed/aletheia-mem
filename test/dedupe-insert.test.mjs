// One fact seen twice is one current fact with two sources; a near-duplicate observation is merged through the
// audited path, never deleted silently.
import { describe, expect, test } from "bun:test";
import { mergeNearDuplicates } from "../src/hub/dedupe.mjs";
import { storeFacts } from "../src/hub/facts.mjs";
import { HubStore } from "../src/hub/store.mjs";

const episode = (store, id, text, at) => store.addEpisode({ project: "shop", tool: "test", sessionId: id, text, sourceRef: `m:${id}`, createdAtEpoch: at });

describe("dedupe on the insert path", () => {
  test("two sessions saying the same fact produce one current fact with two sources", () => {
    const store = new HubStore(":memory:");
    try {
      const first = episode(store, "s1", "The checkout service uses exponential backoff.", 1_000);
      const second = episode(store, "s2", "Confirmed: the checkout service uses exponential backoff.", 2_000);
      const fact = {
        subject: "checkout service", predicate: "uses", object: "exponential backoff",
        text: "The checkout service uses exponential backoff", confidence: 0.9, episodeIds: [first.id],
        validFromEpoch: null, validToEpoch: null, dated: false, entities: [], supersedesId: null,
      };
      const a = storeFacts(store, { facts: [fact], project: "shop", now: 3_000 });
      const b = storeFacts(store, { facts: [{ ...fact, episodeIds: [second.id] }], project: "shop", now: 4_000 });
      expect(a.added).toBe(1);
      expect(b.added).toBe(0);
      expect(b.deduped).toEqual([a.ids[0]]);
      const current = store.factsCurrent({ project: "shop" });
      expect(current).toHaveLength(1);
      const sources = store.db.prepare("SELECT to_id FROM memory_links WHERE from_type = 'fact' AND from_id = ? AND to_type = 'episode' ORDER BY to_id").all(current[0].id).map((row) => row.to_id);
      expect(sources).toEqual([first.id, second.id]);
    } finally {
      store.close();
    }
  });

  test("the worker dedupe pass merges a near-duplicate observation and keeps an audit row", () => {
    const store = new HubStore(":memory:");
    try {
      const fillers = [
        ["Kubernetes ingress", "The ingress controller terminates tls certificates at the edge"],
        ["Database pooling", "Postgres connection pool tuned to twenty connections"],
        ["Cache invalidation", "Redis keys expire after fifteen minutes by default"],
        ["Log rotation", "Daily gzip rotation keeps fourteen compressed archives"],
        ["Metrics export", "Prometheus scrapes the sidecar every thirty seconds"],
        ["Backup policy", "Nightly snapshots retained for thirty days in cold storage"],
      ];
      for (const [title, narrative] of fillers) store.addObservation({ project: "shop", type: "note", title, narrative });

      const text = "deploy pipeline service uses blue green switch and canary rollout";
      const a = store.addObservation({ project: "shop", type: "note", title: "Deploy pipeline", narrative: text });
      const b = store.addObservation({ project: "shop", type: "note", title: "Deploy pipeline", narrative: `${text} today` });
      expect(a.created && b.created).toBe(true);

      const result = mergeNearDuplicates(store, { project: "shop" });
      expect(result.merged).toBe(1);
      const rows = store.listObservations({ project: "shop" });
      expect(rows.filter((row) => row.status === "active")).toHaveLength(7);
      const merged = rows.find((row) => row.status === "merged");
      expect(merged).toBeTruthy();
      const link = store.db.prepare("SELECT 1 FROM memory_links WHERE relation = 'duplicate_of' AND (from_id = ? OR to_id = ?)").get(merged.id, merged.id);
      expect(link).toBeTruthy();
      const audit = store.db.prepare("SELECT 1 FROM audit WHERE action = 'observation.merge'").get();
      expect(audit).toBeTruthy();
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM observations").get().n).toBe(8);
    } finally {
      store.close();
    }
  });
});
