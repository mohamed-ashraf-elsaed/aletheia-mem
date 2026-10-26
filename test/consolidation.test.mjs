// Summaries are derived from facts, always carry their source ids, and never delete or replace their sources.
import { describe, expect, test } from "bun:test";
import { storeFacts } from "../src/hub/facts.mjs";
import { estimateTokens } from "../src/hub/usage.mjs";
import { addSummary, buildEntitySummary, buildProjectSummary, buildSessionSummary, listSummaries } from "../src/hub/summaries.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { listEntities } from "../src/hub/entities.mjs";

const NOW = Date.UTC(2026, 9, 26, 12);
const LONG = "Tool output that says very little. ".repeat(160); // ~5,600 chars of noise per episode

function seed(store, project = "shop", sessionId = "s1") {
  const episode = store.addEpisode({ project, sessionId, tool: "claude-code", text: LONG, sourceRef: `${sessionId}:1`, createdAtEpoch: NOW - 60_000 });
  const facts = [
    { subject: "checkout service", predicate: "uses", object: "exponential backoff", text: "The checkout service uses exponential backoff", entities: [{ name: "checkout service", type: "service" }] },
    { subject: "retry button", predicate: "is", object: "disabled while a retry is in flight", text: "The retry button is disabled while a retry is in flight", entities: [] },
    { subject: "analytics event", predicate: "fires", object: "on every retry", text: "The analytics event fires on every retry", entities: [] },
  ].map((fact) => ({ ...fact, confidence: 0.9, episodeIds: [episode.id], validFromEpoch: null, validToEpoch: null, dated: false, supersedesId: null }));
  const stored = storeFacts(store, { facts, project, now: NOW });
  return { episode, ids: stored.ids, stored };
}

describe("summaries", () => {
  test("a summary always carries its source ids and never exists without them", () => {
    const store = new HubStore(":memory:");
    try {
      expect(() => addSummary(store, { project: "shop", scope: "session", text: "x", sourceIds: [] })).toThrow(/source id/);
      const { ids } = seed(store);
      const result = buildSessionSummary(store, { project: "shop", sessionId: "s1", now: NOW });
      expect(result).toBeTruthy();
      const row = store.db.prepare("SELECT * FROM summaries WHERE id = ?").get(result.id);
      expect(JSON.parse(row.source_ids)).toEqual(ids);
      expect(row.scope).toBe("session");
    } finally {
      store.close();
    }
  });

  test("a session summary links its observation to the facts and replaces the raw Stop summary", () => {
    const store = new HubStore(":memory:");
    try {
      const raw = store.add({ project: "shop", kind: "summary", type: "summary", title: "Session summary: raw", narrative: "I added the retry button.", sessionId: "s1", tool: "claude-code" });
      const { ids } = seed(store);
      const result = buildSessionSummary(store, { project: "shop", sessionId: "s1", now: NOW });
      const observation = store.getObservation(result.observationId);
      expect(observation.origin).toBe("summary:session");
      const links = store.db.prepare("SELECT to_id FROM memory_links WHERE from_type = 'observation' AND from_id = ? AND to_type = 'fact'").all(observation.id).map((row) => row.to_id);
      expect(links.sort((a, b) => a - b)).toEqual([...ids].sort((a, b) => a - b));
      const memory = store.get(raw.id);
      expect(memory.origin).toBe("summary:session");
      expect(memory.narrative).toContain("exponential backoff");
      expect(memory.narrative).not.toContain("I added the retry button");
      expect(store.db.prepare("SELECT 1 FROM audit WHERE action = 'summary.replace' AND detail LIKE ?").get(`%"id":${raw.id}%`)).toBeTruthy();
    } finally {
      store.close();
    }
  });

  test("the footprint drops 40% with no fact or episode deleted", () => {
    const store = new HubStore(":memory:");
    try {
      const { episode, ids } = seed(store);
      const before = { facts: store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n, episodes: store.db.prepare("SELECT COUNT(*) AS n FROM episodes").get().n };
      const sourceTokens = estimateTokens(store.getEpisode(episode.id).text);
      const result = buildSessionSummary(store, { project: "shop", sessionId: "s1", now: NOW });
      expect(result.tokenCount).toBeLessThanOrEqual(sourceTokens * 0.4); // a 60% reduction clears the 40% bar
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n).toBe(before.facts);
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM episodes").get().n).toBe(before.episodes);
      expect(store.getFactsByIds(ids)).toHaveLength(ids.length);
    } finally {
      store.close();
    }
  });

  test("project and entity summaries use the same provenance rule", () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const project = buildProjectSummary(store, { project: "shop", now: NOW, days: 7 });
      expect(project.factIds.length).toBe(3);
      expect(listSummaries(store, { project: "shop", scope: "project" })).toHaveLength(1);

      const entity = listEntities(store, { project: "shop" }).find((row) => row.canonical_name === "checkout service");
      expect(entity).toBeTruthy();
      const entitySummary = buildEntitySummary(store, { entityId: entity.id, now: NOW });
      expect(entitySummary.factIds.length).toBeGreaterThan(0);
      expect(entitySummary.entity.name).toBe("checkout service");
      expect(listSummaries(store, { project: "shop", scope: "entity" })).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  test("a session with no fact gets no summary", () => {
    const store = new HubStore(":memory:");
    try {
      store.addEpisode({ project: "shop", sessionId: "empty", text: "nothing durable here", sourceRef: "empty:1", createdAtEpoch: NOW });
      expect(buildSessionSummary(store, { project: "shop", sessionId: "empty", now: NOW })).toBe(null);
      expect(listSummaries(store, { project: "shop" })).toHaveLength(0);
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM observations").get().n).toBe(0);
    } finally {
      store.close();
    }
  });
});
