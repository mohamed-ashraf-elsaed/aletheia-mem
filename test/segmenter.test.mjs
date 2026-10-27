// T-037: a fixture of interleaved user turns and tool calls produces the expected rounds; the 2-minute gap splits a
// round and each round keeps its episode ids and boundaries.
import { describe, expect, test } from "bun:test";
import { segmentRounds } from "../src/hub/segmenter.mjs";

describe("segmentRounds", () => {
  test("the fixture produces the expected round count", () => {
    const rounds = segmentRounds([
      { id: "u1", role: "user", createdAtEpoch: 0 },
      { id: "t1", role: "tool", createdAtEpoch: 10_000 },
      { id: "t2", role: "tool", createdAtEpoch: 20_000 },
      { id: "u2", role: "user", createdAtEpoch: 30_000 },
      { id: "t3", role: "tool", createdAtEpoch: 40_000 },
      { id: "t4", role: "tool", createdAtEpoch: 220_000 }, // 3 minutes after t3
    ]);
    expect(rounds.length).toBe(3);
    expect(rounds.map((r) => r.episodeIds)).toEqual([["u1", "t1", "t2"], ["u2", "t3"], ["t4"]]);
    expect(rounds[0].startedAt).toBe(0);
    expect(rounds[0].endedAt).toBe(20_000);
    expect(rounds[2].startedAt).toBe(220_000);
  });

  test("a gap under two minutes keeps the round together", () => {
    const rounds = segmentRounds([
      { id: "u1", role: "user", createdAtEpoch: 0 },
      { id: "t1", role: "tool", createdAtEpoch: 119_999 },
    ]);
    expect(rounds.length).toBe(1);
    expect(rounds[0].episodeIds).toEqual(["u1", "t1"]);
  });

  test("consecutive tool calls with no user message stay in one round", () => {
    const rounds = segmentRounds([
      { id: "t1", role: "tool", createdAtEpoch: 1000 },
      { id: "t2", role: "tool", createdAtEpoch: 2000 },
    ]);
    expect(rounds.length).toBe(1);
  });
});
