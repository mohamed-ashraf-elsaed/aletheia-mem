// T-168: goals roll-up links requests to goals, gives each goal Stalled / Moving / Nothing on it, aggregates
// progress, and splits open asks into "nothing is working on these" and "being worked on".
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { proposeGoalsRollup } from "../src/hub/goals-rollup.mjs";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const at = (minutes) => NOW - minutes * 60_000;

function prompt(store, sessionId, text, minutes) {
  return store.add({ project: "shop", kind: "prompt", type: "note", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes) });
}
function event(store, sessionId, text, minutes) {
  return store.add({ project: "shop", kind: "event", type: "event", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes) });
}

function seed(store) {
  // build retry button -> one request, latest session active -> Moving / open / being worked on.
  prompt(store, "a1", "Build a retry button", 300);
  event(store, "a1", "Edited RetryButton.tsx", 290);
  prompt(store, "a2", "Build a retry button for payments", 3);

  // rewrite onboarding guide -> one request, latest session ended -> Shipped (not an open ask).
  prompt(store, "b1", "Rewrite the onboarding guide", 200);
  event(store, "b1", "Wrote the guide", 190);
  prompt(store, "b2", "Rewrite the onboarding guide for new hires", 100);
  event(store, "b2", "Published the guide", 90);
  store.markSessionEnded("shop", "b2", { source: "SessionEnd", now: at(80) });

  // fix login timeout -> one request, latest session idle -> Stalled / open / nothing working on it.
  prompt(store, "c1", "Fix the login timeout", 150);
  event(store, "c1", "Read the auth code", 140);
  prompt(store, "c2", "Fix the login timeout on mobile", 60);
  event(store, "c2", "Ran the auth tests", 55);

  // no imperative prompt -> a request that serves no goal.
  prompt(store, "d1", "the retry button looks good", 40);
}

describe("T-168: goals roll-up", () => {
  test("goals are linked to requests with status and aggregate progress", () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const rollup = proposeGoalsRollup(store, { project: "shop", now: NOW, activeMinutes: 5 });
      const retry = rollup.goals.find((goal) => goal.object.includes("retry button"));
      const onboarding = rollup.goals.find((goal) => goal.object.includes("onboarding"));
      const login = rollup.goals.find((goal) => goal.object.includes("login timeout"));

      expect(retry).toMatchObject({ status: "Moving", aggregateProgress: 0, requestCount: 1, workingCount: 1 });
      expect(retry.requests[0].title).toContain("retry button");

      expect(onboarding).toMatchObject({ status: "Moving", aggregateProgress: 100, shippedCount: 1 });
      expect(onboarding.requests[0].progress).toBe(100);

      expect(login).toMatchObject({ status: "Stalled", aggregateProgress: 0, requestCount: 1 });
    } finally {
      store.close();
    }
  });

  test("the no-goal bucket holds requests serving none of the goals", () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const rollup = proposeGoalsRollup(store, { project: "shop", now: NOW, activeMinutes: 5 });
      expect(rollup.noGoal.count).toBe(1);
      expect(rollup.noGoal.requests[0].title).toContain("retry button looks good");
      expect(rollup.noGoal.requests[0].goalKey).toBeNull();
    } finally {
      store.close();
    }
  });

  test("open asks split into nothing-working and being-worked-on", () => {
    const store = new HubStore(":memory:");
    try {
      seed(store);
      const rollup = proposeGoalsRollup(store, { project: "shop", now: NOW, activeMinutes: 5 });
      expect(rollup.openAsks.total).toBe(2);
      expect(rollup.openAsks.beingWorked.map((goal) => goal.object).join(" ")).toContain("retry button");
      expect(rollup.openAsks.nothingWorking.map((goal) => goal.object).join(" ")).toContain("login timeout");
    } finally {
      store.close();
    }
  });

  test("an empty store says empty with no invented numbers", () => {
    const store = new HubStore(":memory:");
    try {
      const rollup = proposeGoalsRollup(store, { project: "shop", now: NOW });
      expect(rollup.empty).toBe(true);
      expect(rollup.goals).toEqual([]);
      expect(rollup.noGoal.count).toBe(0);
      expect(rollup.openAsks.total).toBe(0);
    } finally {
      store.close();
    }
  });
});
