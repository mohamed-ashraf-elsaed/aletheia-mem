import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { sessionDetail, workOverview } from "../src/hub/work.mjs";
import { makeFixture } from "./fixture.mjs";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const at = (minutes) => NOW - minutes * 60_000;
const fx = makeFixture();
let seeded;

function seedWorkDatabase(path) {
  const store = new HubStore(path);
  const prompt = (sessionId, text, minutes, extra = {}) => store.add({ project: "shop", kind: "prompt", type: "note", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes), ...extra });
  const event = (sessionId, text, minutes, tool = "claude-code") => store.add({ project: "shop", kind: "event", type: "event", title: text, narrative: text, sessionId, tool, createdAtEpoch: at(minutes) });
  const episode = (sessionId, role, kind, text, minutes, sourceRef) => store.addEpisode({ project: "shop", tool: "claude-code", sessionId, role, kind, text, sourceRef, createdAtEpoch: at(minutes) });

  const e1 = episode("s1", "user", "prompt", "Add a retry button to checkout", 30, "w:s1:1");
  episode("s1", "tool", "event", "Edited checkout/RetryButton.tsx", 25, "w:s1:2");
  const e3 = episode("s1", "user", "prompt", "fix the retry button state", 20, "w:s1:3");
  const fact = store.addFact({ project: "shop", episodeId: e3.id, subject: "retry button", predicate: "uses", object: "exponential backoff", text: "The retry button uses exponential backoff", confidence: 0.91 }).row;
  const factId = fact?.id ?? store.db.prepare("SELECT id FROM facts ORDER BY id DESC LIMIT 1").get().id;
  store.db.prepare("UPDATE facts SET status = 'active' WHERE id = ?").run(factId);
  store.add({ project: "shop", kind: "summary", type: "summary", title: "Session summary: retry", narrative: "Session summary: the retry work is done", sessionId: "s1", tool: "claude-code", createdAtEpoch: at(10) });

  prompt("s2", "Add retry button analytics", 120);
  event("s2", "Ran the analytics tests", 118, "codex");
  prompt("s4", "fix the retry button copy", 2, { tool: "codex" });

  store.add({ project: "docs", kind: "prompt", type: "note", title: "Rewrite the onboarding guide", narrative: "Rewrite the onboarding guide so a new hire can finish alone", sessionId: "d1", tool: "codex", createdAtEpoch: at(300) });

  const pinned = store.add({ project: "shop", kind: "observation", type: "decision", title: "Pinned checkout rule", narrative: "Retries must be idempotent", pinned: true, tool: "claude-code", createdAtEpoch: at(15) });
  const dismissed = store.add({ project: "shop", kind: "note", type: "note", title: "Old note", narrative: "This is no longer useful", tool: "claude-code", createdAtEpoch: at(200) });
  store.dismiss("memory", dismissed.id, { actor: "test", reason: "stale", now: at(60) });

  store.addReview({ itemType: "fact", itemId: factId, reason: "contradiction", now: at(5) });
  store.db.prepare("INSERT INTO rule_suggestions (project, text, when_text, confidence, source_type, source_id, status, created_at_epoch) VALUES (?,?,?,?,?,?,'pending',?)")
    .run("shop", "Use pnpm, not npm", "editing checkout", 0.8, "prompt", 1, at(4));
  store.db.prepare("INSERT INTO jobs (type, payload, status, created_at_epoch, updated_at_epoch) VALUES ('extract_session','{\"project\":\"shop\"}','pending',?,?)").run(at(3), at(3));
  store.db.prepare("INSERT INTO jobs (type, payload, status, created_at_epoch, updated_at_epoch) VALUES ('extract_session','{\"project\":\"shop\",\"n\":2}','pending',?,?)").run(at(2), at(2));
  store.db.prepare("INSERT INTO jobs (type, payload, status, created_at_epoch, updated_at_epoch) VALUES ('extract_session','{\"project\":\"shop\",\"n\":3}','running',?,?)").run(at(1), at(1));

  const ids = { factId, pinnedId: pinned.id, dismissedId: dismissed.id, episodeId: e1.id };
  store.close();
  return ids;
}

beforeAll(() => {
  const dbPath = join(fx.dir, "work.db");
  seeded = seedWorkDatabase(dbPath);
  const cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir: fx.makeDir("work-data"),
    overlayDb: join(fx.dir, "overlay.db"),
    reviewDb: join(fx.dir, "work-reviews.db"),
    ledgerDir: fx.makeDir("work-ledger"),
    humanCopyCache: join(fx.dir, "work-human-copy.json"),
    rulesFile: join(fx.dir, "WORK-RULES.md"),
    claudeInstructionsFile: join(fx.dir, "WORK-CLAUDE.md"),
    hubDb: dbPath,
    provider: "none",
    extra: { home: fx.makeDir("work-home") },
  });
  seeded.app = startServer(cfg);
  seeded.base = `http://127.0.0.1:${seeded.app.server.port}`;
});

afterAll(() => seeded.app.stop());

describe("T-142: the Work query layer", () => {
  test("a project shows its sessions newest first, with counts, the last prompt, summary and source facts", () => {
    const store = new HubStore(join(fx.dir, "work.db"));
    const data = workOverview(store, { project: "shop", now: NOW, activeMinutes: 5, windowHours: 24 });
    expect(data.project).toBe("shop");
    expect(data.sessions.length).toBe(3);
    expect(data.sessions[0]).toMatchObject({ id: "s4", state: "in_progress", promptCount: 1 });
    const s1 = data.sessions.find((session) => session.id === "s1");
    expect(s1).toMatchObject({ promptCount: 2, toolCount: 1, state: "finished" });
    expect(s1.lastPrompt.text).toContain("fix the retry button state");
    expect(s1.summary.text).toContain("retry work");
    expect(s1.sourceFacts.some((fact) => fact.id === seeded.factId)).toBe(true);
    expect(s1.sourceFacts[0].source.episodeId).toBeGreaterThan(0);
    expect(s1.href).toBe("#/work/session/s1?project=shop");
    store.close();
  });

  test("facts, pinned items, review, queue, dismissals and last capture all come from rows", () => {
    const store = new HubStore(join(fx.dir, "work.db"));
    const data = workOverview(store, { project: "shop", now: NOW, dismissedHours: 24 });
    expect(data.recentFacts.some((fact) => fact.id === seeded.factId)).toBe(true);
    expect(data.recentFacts[0].source.episodeId).toBeGreaterThan(0);
    expect(data.pinned.map((item) => item.id)).toContain(seeded.pinnedId);
    expect(data.review.pending).toBe(1);
    expect(data.review.items[0]).toMatchObject({ type: "fact", reason: "contradiction" });
    expect(data.review.items[0].label).toContain("retry button");
    expect(data.ruleSuggestions).toHaveLength(1);
    expect(data.ruleSuggestions[0].text).toBe("Use pnpm, not npm");
    expect(data.queue).toMatchObject({ pending: 2, running: 1, failed: 0, depth: 3 });
    expect(data.lastCapture.map((row) => row.tool)).toEqual(expect.arrayContaining(["claude-code", "codex"]));
    expect(data.dismissed[0]).toMatchObject({ type: "memory", itemId: seeded.dismissedId, label: "Old note" });
    expect(data.empty).toBe(false);
    store.close();
  });

  test("all projects and one project differ; an empty store says so", () => {
    const store = new HubStore(join(fx.dir, "work.db"));
    const all = workOverview(store, { now: NOW, windowHours: 24 });
    expect(all.sessions.some((session) => session.id === "d1" && session.project === "docs")).toBe(true);
    const docs = workOverview(store, { project: "docs", now: NOW });
    expect(docs.sessions).toHaveLength(1);
    expect(docs.recentFacts).toEqual([]);
    store.close();

    const empty = new HubStore(":memory:");
    const none = workOverview(empty, { now: NOW });
    expect(none.empty).toBe(true);
    expect(none.sessions).toEqual([]);
    expect(none.recentFacts).toEqual([]);
    expect(none.queue.depth).toBe(0);
    expect(none.health.status).toBe("ok");
    empty.close();
  });

  test("a session detail has the timeline, summary and facts with sources", () => {
    const store = new HubStore(join(fx.dir, "work.db"));
    const detail = sessionDetail(store, { sessionId: "s1", project: "shop" });
    expect(detail).toMatchObject({ id: "s1", project: "shop", promptCount: 2, toolCount: 1 });
    expect(detail.timeline.map((item) => item.kind)).toEqual(["prompt", "tool", "prompt", "summary"]);
    expect(detail.summary.text).toContain("retry work");
    expect(detail.facts.some((fact) => fact.id === seeded.factId)).toBe(true);
    expect(detail.facts[0].source.episodeId).toBeGreaterThan(0);
    expect(detail.facts[0].validAt).toContain("T");
    expect(sessionDetail(store, { sessionId: "missing" })).toBeNull();
    store.close();
  });

  test("the /v1/work routes answer with the same shapes", async () => {
    const get = (path) => fetch(`${seeded.base}${path}`);
    const response = await get("/v1/work?project=shop&windowHours=24");
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toHaveProperty("sessions");
    expect(data).toHaveProperty("recentFacts");
    expect(data).toHaveProperty("pinned");
    expect(data).toHaveProperty("review");
    expect(data).toHaveProperty("queue");
    expect(data).toHaveProperty("lastCapture");
    expect(data).toHaveProperty("dismissed");
    expect(data).toHaveProperty("ruleSuggestions");
    expect(data).toHaveProperty("mode");
    expect(data.sessions.length).toBe(3);

    const session = await get("/v1/work/session/s1?project=shop");
    expect(session.status).toBe(200);
    expect((await session.json()).session.timeline.length).toBe(4);
    expect((await get("/v1/work/session/missing")).status).toBe(404);

    const all = await (await get("/v1/work")).json();
    expect(all.project).toBe("all");
    expect(all.sessions.some((row) => row.project === "docs")).toBe(true);
  });

  test("/v1/work on an empty hub says empty, not fake", async () => {
    const emptyDb = join(fx.dir, "empty-work.db");
    const cfg = loadConfig({
      port: 0,
      sourceDb: fx.dbPath,
      dataDir: fx.makeDir("empty-work-data"),
      overlayDb: join(fx.dir, "empty-overlay.db"),
      reviewDb: join(fx.dir, "empty-review.db"),
      ledgerDir: fx.makeDir("empty-ledger"),
      humanCopyCache: join(fx.dir, "empty-human.json"),
      rulesFile: join(fx.dir, "EMPTY-RULES.md"),
      claudeInstructionsFile: join(fx.dir, "EMPTY-CLAUDE.md"),
      hubDb: emptyDb,
      provider: "none",
      extra: { home: fx.makeDir("empty-home") },
    });
    const app = startServer(cfg);
    try {
      const response = await fetch(`http://127.0.0.1:${app.server.port}/v1/work`);
      const data = await response.json();
      expect(data.empty).toBe(true);
      expect(data.sessions).toEqual([]);
      expect(data.recentFacts).toEqual([]);
      expect(data.lastCapture).toEqual([]);
      expect(data.health.status).toBe("ok");
    } finally {
      app.stop();
    }
  });
});
