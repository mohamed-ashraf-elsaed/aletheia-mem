// progress and ETA per request are computed from stored rows (session ends, summaries, facts), with
// evidence ids. ETA is reported only when the data supports a pace, otherwise null.
import { describe, expect, test } from "bun:test";
import { HubStore } from "../src/hub/store.mjs";
import { proposeRequests } from "../src/hub/requests.mjs";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const at = (minutes) => NOW - minutes * 60_000;

function prompt(store, sessionId, text, minutes) {
  return store.add({ project: "shop", kind: "prompt", type: "note", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes) });
}
function event(store, sessionId, text, minutes) {
  return store.add({ project: "shop", kind: "event", type: "event", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes) });
}

describe("progress and ETA", () => {
  test("a shipped request is 100% complete with no ETA", () => {
    const store = new HubStore(":memory:");
    try {
      prompt(store, "ship", "Build a retry button", 300);
      event(store, "ship", "Released the retry button", 290);
      store.markSessionEnded("shop", "ship", { source: "SessionEnd", now: at(280) });
      const request = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 }).requests[0];
      expect(request.status).toBe("Shipped");
      expect(request.progress).toBe(100);
      expect(request.eta).toBeNull();
      expect(request.etaEpoch).toBeNull();
      expect(request.progressEvidence.completedSessions).toBe(1);
    } finally {
      store.close();
    }
  });

  test("one of three sessions completed gives 33% and a paced ETA", () => {
    const store = new HubStore(":memory:");
    try {
      prompt(store, "s1", "Build a retry button", 300);
      event(store, "s1", "Edited RetryButton.tsx", 290);
      store.markSessionEnded("shop", "s1", { source: "SessionEnd", now: at(280) });
      prompt(store, "s2", "Build a retry button for payments", 150);
      prompt(store, "s3", "Build a retry button for mobile", 60);
      const request = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 }).requests[0];
      expect(request.sessionCount).toBe(3);
      expect(request.progress).toBe(33);
      expect(request.progressEvidence.completedSessionIds).toEqual(["s1"]);
      expect(request.progressEvidence.sessionCount).toBe(3);
      expect(request.eta).toContain("T");
      expect(request.etaEvidence.remainingSessions).toBe(2);
      expect(request.etaEvidence.paceMs).toBeGreaterThan(0);
    } finally {
      store.close();
    }
  });

  test("one session has no pace, and no completed session has no ETA", () => {
    const store = new HubStore(":memory:");
    try {
      prompt(store, "one", "Build a retry button", 30);
      const single = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 }).requests[0];
      expect(single.progress).toBe(0);
      expect(single.eta).toBeNull();

      prompt(store, "a", "Build a retry button", 300);
      prompt(store, "b", "Build a retry button for payments", 150);
      const none = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 }).requests.find((r) => r.goalKey === "build retry button");
      expect(none.progress).toBe(0);
      expect(none.eta).toBeNull();
      expect(none.progressEvidence.completedSessions).toBe(0);
    } finally {
      store.close();
    }
  });

  test("a summary marks a session complete and feeds progress evidence", () => {
    const store = new HubStore(":memory:");
    try {
      prompt(store, "sum", "Build a retry button", 300);
      store.add({ project: "shop", kind: "summary", type: "summary", title: "Session summary: retry", narrative: "The retry work is done", sessionId: "sum", tool: "claude-code", createdAtEpoch: at(280) });
      const request = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 }).requests[0];
      expect(request.progress).toBe(99);
      expect(request.progressEvidence.completedSessionIds).toEqual(["sum"]);
      expect(request.progressEvidence.summaryIds.length).toBe(1);
    } finally {
      store.close();
    }
  });
});
