import { describe, expect, test } from "bun:test";
import { parseRoute } from "../public/ui-core.js";
import { factLineView, goalView, goalsView, sessionCardView, sessionDetailView, workEmptyView, workHeaderView, workNeedsView, WORK_EMPTY } from "../public/work-view.js";

const fact = {
  id: 7,
  text: "The checkout uses Postgres 16",
  confidence: 0.83,
  scope: "project",
  status: "active",
  extractorMode: "provider",
  validAt: "2026-10-20T09:00:00.000Z",
  source: { episodeId: 12, sourceRef: "memory:4", episodeText: "raw source text" },
};

const session = {
  id: "s1",
  project: "shop",
  state: "in_progress",
  lastAt: "2026-10-26T10:00:00.000Z",
  promptCount: 2,
  toolCount: 1,
  tool: "claude-code",
  href: "#/work/session/s1?project=shop",
  lastPrompt: { text: "fix the retry button state", at: "2026-10-26T09:55:00.000Z" },
  summary: { id: 4, text: "Session summary: retry work", at: "2026-10-26T09:58:00.000Z" },
  sourceFacts: [fact],
};

const data = {
  project: "shop",
  generatedAt: "2026-10-26T10:00:00.000Z",
  health: { status: "ok" },
  mode: "code",
  lastCapture: [{ tool: "claude-code", at: "2026-10-26T09:58:00.000Z", count: 6 }],
  queue: { pending: 2, running: 1, failed: 0, depth: 3 },
  sessions: [session],
  recentFacts: [fact],
  pinned: [{ id: 2 }],
  review: { pending: 1, items: [{ id: 3, type: "fact", itemId: 7, reason: "contradiction", label: "The checkout uses Postgres 16", project: "shop" }] },
  ruleSuggestions: [{ id: 5, project: "shop", text: "Use pnpm, not npm", when: "editing checkout" }],
  dismissed: [{ type: "memory", itemId: 8, reason: "stale", at: "2026-10-26T08:00:00.000Z", label: "Old note", project: "shop" }],
  empty: false,
};

describe("the Work overview view", () => {
  test("the header strip derives every value from the response", () => {
    const header = workHeaderView(data);
    expect(header).toMatchObject({ project: "shop", mode: "code", sessions: 1, facts: 1, review: 1, pinned: 1, empty: false });
    expect(header.health).toMatchObject({ state: "ok" });
    expect(header.lastCapture).toContain("claude-code");
    expect(header.queue).toBe("3 queued");
    expect(header.queueDetail).toContain("2 pending");
  });

  test("a session card has state, counts, prompt, summary, source facts and a session link", () => {
    const view = sessionCardView(session);
    expect(view).toMatchObject({ id: "s1", state: "in_progress", stateLabel: "In progress", promptLabel: "2 prompts", toolLabel: "1 tool event" });
    expect(view.href).toBe("#/work/session/s1?project=shop");
    expect(view.lastPrompt).toContain("retry button");
    expect(view.summary).toContain("retry work");
    expect(view.sourceFacts[0]).toMatchObject({ id: 7, sourceLabel: "episode #12 · memory:4", importanceLabel: "0.83 (confidence)" });
  });

  test("a long prompt is truncated in the card and keeps the full text for expansion", () => {
    const long = "x".repeat(320);
    const view = sessionCardView({ ...session, lastPrompt: { text: long, at: "2026-10-26T09:55:00.000Z" } });
    expect(view.lastPromptTruncated).toBe(true);
    expect(view.lastPrompt.length).toBeLessThanOrEqual(201);
    expect(view.lastPrompt.endsWith("…")).toBe(true);
    expect(view.lastPromptFull).toBe(long);
    const short = sessionCardView(session);
    expect(short.lastPromptTruncated).toBe(false);
    expect(short.lastPrompt).toContain("retry button");
  });

  test("the card labels whether a session-end event or the heuristic decided the end", () => {
    expect(sessionCardView({ ...session, state: "finished", endedBy: "event" }).stateDetail).toBe("session-end event");
    expect(sessionCardView({ ...session, state: "finished", endedBy: "heuristic" }).stateDetail).toBe("5-minute quiet");
    expect(sessionCardView({ ...session, state: "in_progress", endedBy: "heuristic" }).stateDetail).toBeNull();
  });

  test("needs-you has review, rule and dismissed items with actions", () => {
    const needs = workNeedsView(data);
    expect(needs.map((item) => item.kind)).toEqual(["review", "rule", "dismissed"]);
    expect(needs[0].actions.map((action) => action.id)).toEqual(["accept", "reject"]);
    expect(needs[1].actions.map((action) => action.id)).toEqual(["accept", "dismiss"]);
    expect(needs[2].actions.map((action) => action.id)).toEqual(["restore"]);
    expect(needs[2].type).toBe("memory");
  });

  test("an empty response gives an instruction, not a fake session", () => {
    const empty = { project: "shop", health: { status: "ok" }, mode: "code", sessions: [], recentFacts: [], pinned: [], review: { pending: 0, items: [] }, ruleSuggestions: [], dismissed: [], lastCapture: [], queue: { pending: 0, running: 0, failed: 0, depth: 0 }, empty: true };
    const header = workHeaderView(empty);
    expect(header.empty).toBe(true);
    expect(header.sessions).toBe(0);
    expect(header.lastCapture).toBe("never");
    const view = workEmptyView(empty);
    expect(view).toMatchObject({ title: "No captures yet", command: WORK_EMPTY.command, project: "shop" });
    expect(view.command).toBe("aletheia install claude-code --write");
    expect(workNeedsView(empty)).toEqual([]);
  });

  test("fact lines carry the source and the importance label", () => {
    const view = factLineView(fact);
    expect(view).toMatchObject({ id: 7, sourceLabel: "episode #12 · memory:4", importanceLabel: "0.83 (confidence)", scope: "project" });
    expect(view.sourceText).toContain("raw source");
  });

  test("the session hash still routes to Work", () => {
    expect(parseRoute("#/work/session/s1?project=shop")).toBe("work");
    expect(parseRoute("#/work")).toBe("work");
  });
});

describe("the goal view", () => {
  test("a goal shows its count, session count, last-seen date and dated quote ids", () => {
    const goal = {
      id: "0123456789abcdef",
      label: "Add a retry button to checkout",
      count: 3,
      sessionCount: 2,
      projects: ["shop"],
      firstSeen: "2026-10-26T09:00:00.000Z",
      lastSeen: "2026-10-26T11:40:00.000Z",
      pinned: true,
      dismissed: false,
      quotes: [
        { id: 11, at: "2026-10-26T09:00:00.000Z", project: "shop", sessionId: "s1", text: "Add a retry button to checkout" },
        { id: 12, at: "2026-10-26T11:40:00.000Z", project: "shop", sessionId: "s2", text: "please add retry button for payments" },
      ],
    };
    const view = goalView(goal);
    expect(view).toMatchObject({ id: "0123456789abcdef", countLabel: "3 quotes", sessionLabel: "2 sessions", pinned: true });
    expect(view.lastSeen).toContain("2026-10-26 11:40");
    expect(view.quotes.map((quote) => quote.id)).toEqual([11, 12]);
    expect(view.quotes[0].at).toContain("2026-10-26");

    const all = goalsView({ project: "shop", goals: [goal], dismissedGoals: [{ ...goal, id: "fedcba9876543210", dismissed: true }] });
    expect(all.goals).toHaveLength(1);
    expect(all.dismissedGoals[0]).toMatchObject({ id: "fedcba9876543210", dismissed: true });
  });
});

describe("the session page view", () => {
  test("a session detail shows the ordered timeline, summary and facts with sources, and no actions", () => {
    const detail = {
      id: "s1",
      project: "shop",
      tool: "claude-code",
      firstAt: "2026-10-26T09:00:00.000Z",
      lastAt: "2026-10-26T09:58:00.000Z",
      promptCount: 2,
      toolCount: 1,
      summary: { id: 4, text: "Session summary: retry work", at: "2026-10-26T09:58:00.000Z" },
      timeline: [
        { id: 1, kind: "prompt", text: "Add a retry button", at: "2026-10-26T09:00:00.000Z", tool: "claude-code", source: "w:s1:1" },
        { id: 2, kind: "tool", text: "Edited RetryButton.tsx", at: "2026-10-26T09:05:00.000Z", tool: "claude-code", source: "w:s1:2" },
        { id: 3, kind: "prompt", text: "fix the retry state", at: "2026-10-26T09:10:00.000Z", tool: "claude-code", source: "w:s1:3" },
        { id: 4, kind: "summary", text: "Session summary: retry work", at: "2026-10-26T09:58:00.000Z", tool: null, source: "memory" },
      ],
      facts: [{ ...fact, id: 7 }],
    };
    const view = sessionDetailView(detail);
    expect(view).toMatchObject({ id: "s1", project: "shop", title: "Session s1", promptLabel: "2 prompts", toolLabel: "1 tool event" });
    expect(view.timeline.map((item) => item.kind)).toEqual(["prompt", "tool", "prompt", "summary"]);
    expect(view.timeline.map((item) => item.kindLabel)).toEqual(["Prompt", "Tool event", "Prompt", "Summary"]);
    expect(view.timeline[0].source).toBe("w:s1:1");
    expect(view.summary).toContain("retry work");
    expect(view.facts[0]).toMatchObject({ id: 7, sourceLabel: "episode #12 · memory:4" });
    expect(view).not.toHaveProperty("actions");
  });

  test("a session with no rows still has a readable empty timeline", () => {
    const view = sessionDetailView({ id: "s9", project: "shop", timeline: [], facts: [], promptCount: 0, toolCount: 0 });
    expect(view.timeline).toEqual([]);
    expect(view.facts).toEqual([]);
    expect(view.summary).toBe("No summary yet.");
  });
});
