// near-duplicate detection with TF-IDF cosine and an IDF veto. Exact duplicates still collapse on the
// content hash. The scan is bounded, and the labelled fixture reports precision and recall at the auto threshold.
import { describe, expect, test } from "bun:test";
import { AUTO_MERGE, buildVectors, cosine, nearDuplicates, similarity } from "../src/hub/dedupe.mjs";
import { HubStore } from "../src/hub/store.mjs";

function labelledPairs() {
  const pairs = [];
  for (let i = 0; i < 100; i++) {
    const base = Array.from({ length: 10 }, (_, j) => `pair${i}term${j}`);
    // 90 true duplicates are bag-of-words copies; 10 gain two new terms and fall below the auto threshold.
    const copy = i < 10 ? [...base, `extra${i}left`, `extra${i}right`] : [...base].reverse();
    pairs.push({ a: base.join(" "), b: copy.join(" "), duplicate: true });
  }
  for (let i = 0; i < 100; i++) {
    const a = Array.from({ length: 10 }, (_, j) => `negative${i}alpha${j}`).join(" ");
    const b = Array.from({ length: 10 }, (_, j) => `negative${i}beta${j}`).join(" ");
    pairs.push({ a, b, duplicate: false });
  }
  return pairs;
}

describe("near duplicates", () => {
  test("a 200-pair labelled set reaches precision >= 0.95 at the auto threshold", () => {
    const pairs = labelledPairs().map((pair) => ({ ...pair, score: similarity(pair.a, pair.b) }));
    const auto = pairs.filter((pair) => pair.score >= AUTO_MERGE);
    const truePositives = auto.filter((pair) => pair.duplicate).length;
    const duplicates = pairs.filter((pair) => pair.duplicate);
    const precision = auto.length ? truePositives / auto.length : 1;
    const recall = duplicates.length ? duplicates.filter((pair) => pair.score >= AUTO_MERGE).length / duplicates.length : 0;
    expect(precision).toBeGreaterThanOrEqual(0.95);
    expect(recall).toBeGreaterThanOrEqual(0.8);
    expect(auto.every((pair) => pair.duplicate)).toBe(true);
    console.log(`dedupe labelled set: precision ${precision.toFixed(2)}, recall ${recall.toFixed(2)} at ${AUTO_MERGE}`);
  });

  test("the IDF veto stops boilerplate from making different memories look alike", () => {
    const { vectors } = buildVectors([
      { id: 1, text: "we changed the payment retry loop timeout" },
      { id: 2, text: "we changed the onboarding document wording" },
      { id: 3, text: "we changed the notification email subject" },
    ]);
    expect(cosine(vectors[0], vectors[1])).toBeLessThan(0.3);
    expect(cosine(vectors[0], vectors[1])).toBe(cosine(vectors[1], vectors[0]));
  });

  test("the store scan finds a near pair and ignores an unrelated one", () => {
    const store = new HubStore(":memory:");
    const a = store.addObservation({ project: "p", type: "bugfix", title: "retry loop delay", narrative: "the retry loop applied the delay twice because the timer was reset", createdAtEpoch: 1000 });
    const b = store.addObservation({ project: "p", type: "bugfix", title: "retry loop delay", narrative: "because the timer was reset the retry loop applied the delay twice", createdAtEpoch: 1001 });
    store.addObservation({ project: "p", type: "feature", title: "onboarding copy", narrative: "the onboarding guide now names the support channel", createdAtEpoch: 1002 });
    const result = nearDuplicates(store, { project: "p" });
    expect(result.scanned).toBe(3);
    expect(result.pairs).toHaveLength(1);
    expect(result.pairs[0]).toMatchObject({ a: a.id, b: b.id, auto: true });
    expect(result.pairs[0].score).toBeGreaterThanOrEqual(AUTO_MERGE);
    store.close();
  });

  test("the scan is bounded and exact duplicates collapse", () => {
    const store = new HubStore(":memory:");
    for (let i = 0; i < 20; i++) store.addObservation({ project: "p", title: `note ${i}`, narrative: `distinct narrative ${i} with words ${i * 7}` });
    expect(nearDuplicates(store, { project: "p", maxRows: 5 }).scanned).toBe(5);
    const first = store.addObservation({ project: "p", title: "same", narrative: "exactly the same text" });
    const second = store.addObservation({ project: "p", title: "same", narrative: "exactly the same text" });
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, id: first.id });
    store.close();
  });
});
