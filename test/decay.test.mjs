// Decay and pruning: a documented cold rule, episode shortening with a pointer, an audit row for every change,
// and an explicit --apply. Nothing is deleted, and pinned or high-importance items never move.
import { describe, expect, test } from "bun:test";
import { DEFAULT_RETENTION, TRUNCATION_MARK, coldCandidates, episodeCandidates, prune } from "../src/hub/retention.mjs";
import { HubStore } from "../src/hub/store.mjs";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 26, 12);
const OLD = NOW - 200 * DAY;
const RECENT = NOW - 5 * DAY;
const LONG = `HEAD ${"noise ".repeat(300)} TAIL`;

function episodeAt(store, text, at, ref, project = "shop") {
  return store.addEpisode({ project, text, sourceRef: ref, createdAtEpoch: at });
}

function factAt(store, { episodeIds, confidence = 0.6, at = OLD, confidenceText = "confidence", project = "shop", observationId = null, subject = "retry service" }) {
  const episode = store.getEpisode(episodeIds[0]);
  return store.addFact({
    project, subject, predicate: "uses", object: `${confidenceText} policy`, text: `The ${subject} uses ${confidenceText} policy`,
    episodeId: episode.id, episodeIds, observationId, recordedAtEpoch: at, validFromEpoch: at, confidence, extractorMode: "rules",
  });
}

describe("decay and pruning", () => {
  test("an old low-confidence single-source fact goes cold and leaves default search, but history keeps it", () => {
    const store = new HubStore(":memory:");
    try {
      const episode = episodeAt(store, "The retry service uses an old policy.", OLD, "old");
      const fact = factAt(store, { episodeIds: [episode.id], confidence: 0.6 }).fact;
      expect(coldCandidates(store, { now: NOW }).map((row) => row.id)).toContain(fact.id);

      const report = prune(store, { now: NOW, apply: false });
      expect(report.factsCold).toBe(1);
      expect(store.getFact(fact.id).status).toBe("active"); // a report changes nothing
      expect(store.context({ project: "shop" })).toContain("The retry service uses confidence policy");

      const applied = prune(store, { now: NOW, apply: true });
      expect(applied.applied.factsCold).toBe(1);
      expect(store.getFact(fact.id).status).toBe("cold");
      expect(store.context({ project: "shop" })).not.toContain("old policy");
      expect(store.factsCurrent({ project: "shop", now: NOW })).toHaveLength(0);
      expect(store.factsHistory({ project: "shop" }).map((row) => row.id)).toContain(fact.id);
      expect(store.db.prepare("SELECT 1 FROM audit WHERE action = 'fact.cold' AND detail LIKE ?").get(`%"id":${fact.id}%`)).toBeTruthy();
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM facts").get().n).toBe(1);
    } finally {
      store.close();
    }
  });

  test("high confidence, a second source and a pinned or important observation protect a fact", () => {
    const store = new HubStore(":memory:");
    try {
      const one = episodeAt(store, "High confidence policy.", OLD, "one");
      const high = factAt(store, { episodeIds: [one.id], confidence: 0.9, subject: "high" }).fact;

      const two = episodeAt(store, "Second source policy.", OLD, "two");
      const three = episodeAt(store, "Second source again.", OLD, "three");
      const confirmed = factAt(store, { episodeIds: [two.id, three.id], confidence: 0.6, subject: "confirmed" }).fact;

      const pinnedEpisode = episodeAt(store, "Pinned policy.", OLD, "pinned");
      const pinned = store.addObservation({ project: "shop", type: "note", title: "Pinned note", narrative: "Keep me", episodeId: pinnedEpisode.id, pinned: true });
      const pinnedFact = factAt(store, { episodeIds: [pinnedEpisode.id], confidence: 0.6, subject: "pinned", observationId: pinned.id }).fact;

      const importantEpisode = episodeAt(store, "Important policy.", OLD, "important");
      const important = store.addObservation({ project: "shop", type: "decision", title: "Important note", narrative: "Keep me too", episodeId: importantEpisode.id, importance: 0.9 });
      const importantFact = factAt(store, { episodeIds: [importantEpisode.id], confidence: 0.6, subject: "important", observationId: important.id }).fact;

      const ids = coldCandidates(store, { now: NOW }).map((row) => row.id);
      expect(ids).not.toContain(high.id);
      expect(ids).not.toContain(confirmed.id);
      expect(ids).not.toContain(pinnedFact.id);
      expect(ids).not.toContain(importantFact.id);
      expect(prune(store, { now: NOW, apply: true }).applied.factsCold).toBe(0);
    } finally {
      store.close();
    }
  });

  test("old episode text is shortened with a pointer and an audit row; pinned and evidentiary episodes stay", () => {
    const store = new HubStore(":memory:");
    try {
      const plain = episodeAt(store, LONG, OLD, "plain");
      const pinnedEpisode = episodeAt(store, LONG, OLD, "pinned-episode");
      store.addObservation({ project: "shop", type: "note", title: "Pinned", narrative: "x", episodeId: pinnedEpisode.id, pinned: true });
      const factEpisode = episodeAt(store, LONG, OLD, "fact-episode");
      factAt(store, { episodeIds: [factEpisode.id], confidence: 0.95, subject: "current" });

      const candidates = episodeCandidates(store, { now: NOW }).map((row) => row.id);
      expect(candidates).toEqual([plain.id]);
      const report = prune(store, { now: NOW, apply: true });
      expect(report.applied.episodesShortened).toBe(1);
      const shortened = store.getEpisode(plain.id);
      expect(shortened).toBeTruthy();
      expect(shortened.text.length).toBeLessThan(LONG.length);
      expect(shortened.text).toContain(TRUNCATION_MARK);
      expect(shortened.text.startsWith("HEAD")).toBe(true);
      expect(shortened.text.endsWith("TAIL")).toBe(true);
      expect(store.getEpisode(pinnedEpisode.id).text).toBe(LONG);
      expect(store.getEpisode(factEpisode.id).text).toBe(LONG);
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action = 'episode.truncate'").get().n).toBe(1);
      expect(store.db.prepare("SELECT COUNT(*) AS n FROM episodes").get().n).toBe(3);

      // A second apply is idempotent: the marker keeps the row out of the candidate set.
      expect(prune(store, { now: NOW, apply: true }).applied.episodesShortened).toBe(0);
    } finally {
      store.close();
    }
  });

  test("property: a pinned item is never pruned, for every old pinned observation", () => {
    const store = new HubStore(":memory:");
    try {
      const pinnedEpisodes = [];
      for (let i = 0; i < 20; i++) {
        const episode = episodeAt(store, `${LONG} pinned-${i}`, OLD, `pinned-${i}`);
        const observation = store.addObservation({ project: "shop", type: "note", title: `Pinned ${i}`, narrative: "keep", episodeId: episode.id, pinned: true, importance: 0.9 });
        const fact = factAt(store, { episodeIds: [episode.id], confidence: 0.55, subject: `pinned-${i}`, observationId: observation.id });
        pinnedEpisodes.push({ episode, observation, fact: fact.fact });
      }
      for (let i = 0; i < 20; i++) episodeAt(store, `${LONG} loose-${i}`, OLD, `loose-${i}`);
      prune(store, { now: NOW, apply: true });
      for (const item of pinnedEpisodes) {
        expect(store.getEpisode(item.episode.id).text).toBe(`${LONG} pinned-${pinnedEpisodes.indexOf(item)}`);
        expect(store.getObservation(item.observation.id)).toBeTruthy();
        expect(store.getFact(item.fact.id).status).toBe("active");
      }
    } finally {
      store.close();
    }
  });

  test("recall on the retained fixture loses at most one point", () => {
    const store = new HubStore(":memory:");
    try {
      const recentIds = [];
      for (let i = 0; i < 5; i++) {
        const episode = episodeAt(store, `Recent fact ${i}.`, RECENT, `recent-${i}`);
        const fact = factAt(store, { episodeIds: [episode.id], confidence: 0.9, at: RECENT, confidenceText: `recent${i}`, subject: `recent${i}` });
        recentIds.push(fact.fact.id);
      }
      for (let i = 0; i < 5; i++) {
        const episode = episodeAt(store, `Old fact ${i}.`, OLD, `old-${i}`);
        factAt(store, { episodeIds: [episode.id], confidence: 0.5, confidenceText: `old${i}`, subject: `old${i}` });
      }
      const queries = recentIds.map((id) => store.getFact(id).object);
      const recall = (now) => {
        let hits = 0;
        queries.forEach((query) => {
          if (store.searchFacts({ query, project: "shop" }).some((hit) => recentIds.includes(hit.id))) hits++;
        });
        return hits / queries.length;
      };
      const before = recall(NOW);
      prune(store, { now: NOW, apply: true });
      const after = recall(NOW);
      expect(before).toBe(1);
      expect(before - after).toBeLessThanOrEqual(0.01);
    } finally {
      store.close();
    }
  });

  test("default retention windows are the documented ones", () => {
    expect(DEFAULT_RETENTION).toMatchObject({ retentionDays: 90, coldDays: 180 });
  });
});
