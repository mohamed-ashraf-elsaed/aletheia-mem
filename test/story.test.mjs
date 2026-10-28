// the build story reports shipped/working/waiting counts, a velocity line from shipped dates, and what it
// learned about how you work from repeated corrections in the owner's prompts.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { buildStory, learnedPreferences } from "../src/hub/story.mjs";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const at = (minutes) => NOW - minutes * 60_000;

function prompt(store, sessionId, text, minutes) {
  return store.add({ project: "shop", kind: "prompt", type: "note", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes) });
}
function event(store, sessionId, text, minutes) {
  return store.add({ project: "shop", kind: "event", type: "event", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes) });
}

function seedRequests(store) {
  prompt(store, "ship1", "Build a retry button", 400);
  event(store, "ship1", "Released the retry button", 390);
  store.markSessionEnded("shop", "ship1", { source: "SessionEnd", now: at(380) });

  prompt(store, "ship2", "Rewrite the onboarding guide", 3000);
  event(store, "ship2", "Published the guide", 2990);
  store.markSessionEnded("shop", "ship2", { source: "SessionEnd", now: at(2980) });

  prompt(store, "work1", "Fix the login timeout", 3);
}

function seedCorrections(store) {
  prompt(store, "r1", "No, use pnpm instead of npm.", 200);
  prompt(store, "r2", "Use pnpm, not npm.", 100);
  prompt(store, "r3", "Never commit to main.", 50);
}

describe("the build story", () => {
  test("counts and velocity come from shipped and working requests", () => {
    const store = new HubStore(":memory:");
    try {
      seedRequests(store);
      const story = buildStory(store, { project: "shop", now: NOW, activeMinutes: 5 });
      expect(story.counts).toMatchObject({ shipped: 2, working: 1, total: 3 });
      expect(story.velocity.totalShipped).toBe(2);
      expect(story.velocity.perWeek.reduce((sum, row) => sum + row.shipped, 0)).toBe(2);
      expect(story.velocity.averageDaysToShip).toBeGreaterThanOrEqual(0);
    } finally {
      store.close();
    }
  });

  test("repeated corrections become learned preferences with dated quotes", () => {
    const store = new HubStore(":memory:");
    try {
      seedCorrections(store);
      const learned = learnedPreferences(store, { project: "shop" });
      const pnpm = learned.find((item) => item.text === "Use pnpm, not npm");
      expect(pnpm).toBeTruthy();
      expect(pnpm.timesSeen).toBe(2);
      expect(pnpm.quotes).toHaveLength(2);
      for (const quote of pnpm.quotes) {
        expect(quote.at).toContain("T");
        expect(quote.sourceId).toBeGreaterThan(0);
      }
      const never = learned.find((item) => item.text === "Never commit to main");
      expect(never.timesSeen).toBe(1);
    } finally {
      store.close();
    }
  });

  test("an empty store says empty with no invented numbers", () => {
    const store = new HubStore(":memory:");
    try {
      const story = buildStory(store, { project: "shop", now: NOW });
      expect(story.empty).toBe(true);
      expect(story.counts.total).toBe(0);
      expect(story.velocity.perWeek).toEqual([]);
      expect(story.learned).toEqual([]);
    } finally {
      store.close();
    }
  });
});
