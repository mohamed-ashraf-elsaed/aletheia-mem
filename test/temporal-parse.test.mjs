// Relative dates resolve against the episode timestamp, not the extraction time, and become half-open ranges.
import { describe, expect, test } from "bun:test";
import { parseTemporal } from "../src/hub/temporal.mjs";
import { storeFacts } from "../src/hub/facts.mjs";
import { HubStore } from "../src/hub/store.mjs";

const BASE = Date.UTC(2026, 9, 26, 12, 0, 0); // Monday 2026-10-26, midday UTC
const at = (y, m, d) => Date.UTC(y, m - 1, d);
const range = (text, base = BASE) => {
  const parsed = parseTemporal(text, { baseEpoch: base });
  return parsed && [parsed.fromEpoch, parsed.toEpoch];
};

describe("temporal parser", () => {
  test("an ISO day is explicit and a range includes the last day", () => {
    expect(range("deployed on 2026-05-01")).toEqual([at(2026, 5, 1), at(2026, 5, 2)]);
    const parsed = parseTemporal("2026-05-01", { baseEpoch: BASE });
    expect(parsed.inferred).toBe(false);
    expect(range("2026-05-01 to 2026-05-03")).toEqual([at(2026, 5, 1), at(2026, 5, 4)]);
  });

  test("today, yesterday and tomorrow use the base day", () => {
    expect(range("yesterday")).toEqual([at(2026, 10, 25), at(2026, 10, 26)]);
    expect(range("today")).toEqual([at(2026, 10, 26), at(2026, 10, 27)]);
    expect(range("tomorrow")).toEqual([at(2026, 10, 27), at(2026, 10, 28)]);
  });

  test("relative counts and calendar units", () => {
    expect(range("3 days ago")).toEqual([at(2026, 10, 23), at(2026, 10, 24)]);
    expect(range("last week")).toEqual([at(2026, 10, 19), at(2026, 10, 26)]);
    expect(range("this week")).toEqual([at(2026, 10, 26), at(2026, 11, 2)]);
    expect(range("next week")).toEqual([at(2026, 11, 2), at(2026, 11, 9)]);
    expect(range("last month")).toEqual([at(2026, 9, 1), at(2026, 10, 1)]);
    expect(range("2 months ago")).toEqual([at(2026, 8, 1), at(2026, 9, 1)]);
    expect(range("last year")).toEqual([at(2025, 1, 1), at(2026, 1, 1)]);
  });

  test("months, quarters and weekdays", () => {
    expect(range("in March")).toEqual([at(2026, 3, 1), at(2026, 4, 1)]);
    expect(range("March 2025")).toEqual([at(2025, 3, 1), at(2025, 4, 1)]);
    expect(range("last March")).toEqual([at(2025, 3, 1), at(2025, 4, 1)]);
    expect(range("Q1 2026")).toEqual([at(2026, 1, 1), at(2026, 4, 1)]);
    expect(range("last quarter")).toEqual([at(2026, 7, 1), at(2026, 10, 1)]);
    expect(range("last Monday")).toEqual([at(2026, 10, 19), at(2026, 10, 20)]);
  });

  test("since keeps the start and leaves the fact open", () => {
    const parsed = parseTemporal("we have used it since last week", { baseEpoch: BASE });
    expect(parsed.fromEpoch).toBe(at(2026, 10, 19));
    expect(parsed.toEpoch).toBe(null);
    expect(parsed.kind).toBe("since");
  });

  test("an ambiguous expression is null, not a guess", () => {
    expect(parseTemporal("recently", { baseEpoch: BASE })).toBe(null);
    expect(parseTemporal("a while ago", { baseEpoch: BASE })).toBe(null);
    expect(parseTemporal("the service may use a queue", { baseEpoch: BASE })).toBe(null);
    expect(parseTemporal("", { baseEpoch: BASE })).toBe(null);
  });

  test("the same expression moves with the event clock", () => {
    expect(range("yesterday", at(2025, 1, 2))).toEqual([at(2025, 1, 1), at(2025, 1, 2)]);
    expect(range("in March", at(2025, 1, 2))).toEqual([at(2024, 3, 1), at(2024, 4, 1)]);
    expect(range("in March", at(2025, 6, 2))).toEqual([at(2025, 3, 1), at(2025, 4, 1)]);
  });

  test("stored facts use the episode clock and lose 0.1 confidence when the date was inferred", () => {
    const store = new HubStore(":memory:");
    try {
      const episode = store.addEpisode({ project: "shop", text: "The deploy happened yesterday.", sourceRef: "clock", createdAtEpoch: BASE });
      storeFacts(store, {
        project: "shop",
        facts: [{
          subject: "deploy", predicate: "happened", object: "yesterday", text: "The deploy happened yesterday",
          confidence: 0.9, episodeIds: [episode.id], validFromEpoch: null, validToEpoch: null, dated: false, entities: [], supersedesId: null,
        }],
        now: BASE + 86_400_000,
      });
      const inferred = store.factsHistory({ project: "shop" })[0];
      expect(inferred.valid_from_epoch).toBe(at(2026, 10, 25));
      expect(inferred.valid_to_epoch).toBe(at(2026, 10, 26));
      expect(inferred.confidence).toBeCloseTo(0.8, 5);

      storeFacts(store, {
        project: "shop",
        facts: [{
          subject: "release", predicate: "shipped", object: "2026-05-01", text: "The release shipped on 2026-05-01",
          confidence: 0.9, episodeIds: [episode.id], validFromEpoch: null, validToEpoch: null, dated: false, entities: [], supersedesId: null,
        }],
        now: BASE + 86_400_000,
      });
      const explicit = store.factsHistory({ project: "shop" }).find((fact) => fact.subject === "release");
      expect(explicit.valid_from_epoch).toBe(at(2026, 5, 1));
      expect(explicit.valid_to_epoch).toBe(at(2026, 5, 2));
      expect(explicit.confidence).toBeCloseTo(0.9, 5);
    } finally {
      store.close();
    }
  });
});
