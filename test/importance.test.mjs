// T-030: importance is a transparent weighted sum. The score and every input are stored, a pin wins the user
// component, and a synthetic 200-item rank gives the Spearman number below.
import { describe, expect, test } from "bun:test";
import { HALF_LIFE_DAYS, IMPORTANCE_VERSION, WEIGHTS, importanceFor, recomputeImportance, recency, spearman, typeWeight } from "../src/hub/importance.mjs";
import { HubStore } from "../src/hub/store.mjs";

const DAY = 86_400_000;

describe("importance formula", () => {
  test("the weights sum to one and every component is inspectable", () => {
    const total = Object.values(WEIGHTS).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 10);
    const { importance, components } = importanceFor({ type: "decision", createdAtEpoch: Date.now(), reinforcement: 3, hasProvenance: true, now: Date.now() });
    expect(components).toMatchObject({ formula: IMPORTANCE_VERSION, type_weight: 1, provenance_quality: 1, reinforcement: 0.6, user_signal: 0 });
    expect(importance).toBeCloseTo(0.35 + 0.25 + 0.2 * 0.6 + 0.1, 3);
    expect(typeWeight("nonsense")).toBe(0.4);
  });

  test("pinned items score 1.0 on the user component and do not decay", () => {
    const old = Date.now() - 10 * HALF_LIFE_DAYS * DAY;
    const { components, importance } = importanceFor({ type: "gotcha", createdAtEpoch: old, pinned: true, hasProvenance: true });
    expect(components.user_signal).toBe(1);
    expect(components.recency).toBe(1);
    expect(importance).toBeGreaterThanOrEqual(0.8);
    expect(recency(old)).toBeLessThan(0.01); // ten half-lives
    expect(importanceFor({ type: "gotcha", createdAtEpoch: old, hasProvenance: true }).components.recency).toBeLessThan(0.01);
  });

  test("recompute stores the score and its inputs on each observation", () => {
    const store = new HubStore(":memory:");
    const episode = store.addEpisode({ project: "p", text: "we chose Postgres", createdAtEpoch: Date.now() });
    const sourced = store.addObservation({ project: "p", type: "decision", title: "Database", narrative: "we chose Postgres", episodeId: episode.id });
    const manual = store.addObservation({ project: "p", type: "note", title: "Manual", narrative: "a note with no source" });
    const pinned = store.addObservation({ project: "p", type: "feature", title: "Pinned", narrative: "keep this", episodeId: episode.id, pinned: true });
    const result = recomputeImportance(store, { project: "p" });
    expect(result).toMatchObject({ updated: 3, formula: IMPORTANCE_VERSION });

    const components = JSON.parse(store.getObservation(sourced.id).importance_components);
    expect(components).toMatchObject({ type_weight: 1, provenance_quality: 1, user_signal: 0 });
    expect(store.getObservation(sourced.id).importance).toBeGreaterThan(0.6);
    expect(JSON.parse(store.getObservation(manual.id).importance_components).provenance_quality).toBe(0.5);
    expect(JSON.parse(store.getObservation(pinned.id).importance_components).user_signal).toBe(1);
    store.close();
  });

  test("a 200-item synthetic human rank gives Spearman >= 0.5", () => {
    const types = ["decision", "gotcha", "bugfix", "feature", "discovery", "refactor", "change", "note"];
    let seed = 42;
    const random = () => {
      seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
      return seed / 2 ** 32;
    };
    const now = Date.now();
    const ours = [];
    const human = [];
    for (let i = 0; i < 200; i++) {
      const type = types[i % types.length];
      const createdAtEpoch = now - Math.floor(random() * 365) * DAY;
      const pinned = i % 29 === 0;
      const reinforcement = i % 6;
      ours.push(importanceFor({ type, createdAtEpoch, reinforcement, hasProvenance: true, pinned, now }).importance);
      // An independent ranking with noise. This is a synthetic fixture, not a human study.
      human.push(0.45 * typeWeight(type) + 0.35 * recency(createdAtEpoch, now) + 0.2 * (pinned ? 1 : 0) + (random() - 0.5) * 0.3);
    }
    const rho = spearman(ours, human);
    console.log(`importance synthetic rank: Spearman ${rho.toFixed(3)} over 200 items`);
    expect(rho).toBeGreaterThanOrEqual(0.5);
  });
});
