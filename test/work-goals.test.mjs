import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { goalAction, imperativeTopic, proposeGoals } from "../src/hub/goals.mjs";
import { makeFixture } from "./fixture.mjs";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const at = (minutes) => NOW - minutes * 60_000;
const fx = makeFixture();
let seeded;

function seedGoalsDatabase(path) {
  const store = new HubStore(path);
  const prompt = (project, sessionId, text, minutes) => store.add({ project, kind: "prompt", type: "note", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes) });
  prompt("shop", "s1", "Add a retry button to checkout", 40);
  prompt("shop", "s2", "please add retry button for payments", 30);
  prompt("shop", "s1", "Add a retry button to the refund page", 20);
  prompt("shop", "s2", "Fix the login timeout", 10);
  prompt("docs", "d1", "fix login timeout", 5);
  prompt("shop", "s1", "the retry button looks good", 15);
  store.add({ project: "shop", kind: "event", type: "event", title: "add a retry button to checkout", narrative: "add a retry button to checkout", sessionId: "s1", tool: "claude-code", createdAtEpoch: at(35) });
  store.add({ project: "shop", kind: "summary", type: "summary", title: "add a retry button", narrative: "add a retry button to checkout", sessionId: "s1", tool: "claude-code", createdAtEpoch: at(25) });
  store.close();
}

beforeAll(() => {
  const dbPath = join(fx.dir, "goals.db");
  seedGoalsDatabase(dbPath);
  const cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir: fx.makeDir("goals-data"),
    overlayDb: join(fx.dir, "goals-overlay.db"),
    reviewDb: join(fx.dir, "goals-review.db"),
    ledgerDir: fx.makeDir("goals-ledger"),
    humanCopyCache: join(fx.dir, "goals-human.json"),
    rulesFile: join(fx.dir, "GOALS-RULES.md"),
    claudeInstructionsFile: join(fx.dir, "GOALS-CLAUDE.md"),
    hubDb: dbPath,
    provider: "none",
    extra: { home: fx.makeDir("goals-home") },
  });
  seeded = { app: startServer(cfg) };
  seeded.base = `http://127.0.0.1:${seeded.app.server.port}`;
});

afterAll(() => seeded.app.stop());

describe("owner goals", () => {
  test("an imperative topic repeated across sessions is a counted goal with dated quote ids", () => {
    const store = new HubStore(join(fx.dir, "goals.db"));
    const data = proposeGoals(store, { project: "shop", now: NOW });
    const retry = data.goals.find((goal) => goal.label.toLowerCase().includes("retry"));
    expect(retry).toBeTruthy();
    expect(retry).toMatchObject({ sessionCount: 2, count: 3, dismissed: false, pinned: false });
    expect(retry.quotes).toHaveLength(3);
    for (const quote of retry.quotes) {
      expect(quote.id).toBeGreaterThan(0);
      expect(quote.at).toContain("T");
      expect(quote.text.toLowerCase()).toContain("retry");
    }
    expect(retry.quotes.every((quote) => quote.text !== "add a retry button to checkout" || quote.sessionId === "s1")).toBe(true);
    const promptIds = new Set(store.db.prepare("SELECT id FROM memories WHERE kind = 'prompt'").all().map((row) => row.id));
    expect(retry.quotes.every((quote) => promptIds.has(quote.id))).toBe(true);
    expect(data.goals.some((goal) => goal.label.toLowerCase().includes("login"))).toBe(false);
    expect(imperativeTopic("the retry button looks good")).toBeNull();
    expect(imperativeTopic("add a retry button to checkout")).toMatchObject({ verb: "add", key: "add retry button" });
    store.close();
  });

  test("tool events, summaries and non-imperative notes are not used", () => {
    const store = new HubStore(join(fx.dir, "goals.db"));
    const data = proposeGoals(store, { project: "shop", now: NOW });
    const retry = data.goals.find((goal) => goal.label.toLowerCase().includes("retry"));
    const texts = retry.quotes.map((quote) => quote.text.toLowerCase());
    expect(texts).not.toContain("the retry button looks good");
    expect(texts).toHaveLength(3);
    expect(texts.every((text) => text.includes("retry"))).toBe(true);
    expect(data.goals.every((goal) => goal.quotes.every((quote) => quote.id > 0))).toBe(true);
    store.close();
  });

  test("all projects can form a goal that one project cannot", () => {
    const store = new HubStore(join(fx.dir, "goals.db"));
    const all = proposeGoals(store, { now: NOW });
    const login = all.goals.find((goal) => goal.label.toLowerCase().includes("login"));
    expect(login).toMatchObject({ sessionCount: 2 });
    expect(login.projects.sort()).toEqual(["docs", "shop"]);
    store.close();
  });

  test("pin, dismiss and restore are reversible settings, not deletes", () => {
    const store = new HubStore(join(fx.dir, "goals.db"));
    const first = proposeGoals(store, { project: "shop", now: NOW }).goals[0];
    expect(goalAction(store, first.id, { action: "pin" }).pinned).toBe(true);
    let data = proposeGoals(store, { project: "shop", now: NOW });
    expect(data.goals[0]).toMatchObject({ id: first.id, pinned: true });
    expect(goalAction(store, first.id, { action: "dismiss" }).dismissed).toBe(true);
    data = proposeGoals(store, { project: "shop", now: NOW });
    expect(data.goals.some((goal) => goal.id === first.id)).toBe(false);
    expect(data.dismissedGoals.some((goal) => goal.id === first.id)).toBe(true);
    expect(store.db.prepare("SELECT COUNT(*) AS n FROM memories").get().n).toBe(8);
    expect(goalAction(store, first.id, { action: "restore" }).dismissed).toBe(false);
    data = proposeGoals(store, { project: "shop", now: NOW });
    expect(data.goals.some((goal) => goal.id === first.id)).toBe(true);
    expect(() => goalAction(store, "not-a-goal", { action: "pin" })).toThrow();
    store.close();
  });

  test("back-filled transcript user turns count as goals and dedupe against the hook prompt in the same session", () => {
    const store = new HubStore(join(fx.dir, "goals-episodes.db"));
    store.add({ project: "shop", kind: "prompt", type: "note", title: "Add a retry button", narrative: "Add a retry button", sessionId: "h1", tool: "claude-code", createdAtEpoch: at(40) });
    store.addEpisode({ project: "shop", tool: "claude-code", sessionId: "h1", role: "user", kind: "message", text: "Add a retry button", sourceRef: "t:h1:0", createdAtEpoch: at(39) });
    store.addEpisode({ project: "shop", tool: "claude-code", sessionId: "h2", role: "user", kind: "message", text: "please add retry button to payments", sourceRef: "t:h2:0", createdAtEpoch: at(30) });
    const data = proposeGoals(store, { project: "shop", now: NOW });
    const retry = data.goals.find((goal) => goal.label.toLowerCase().includes("retry"));
    expect(retry).toBeTruthy();
    expect(retry).toMatchObject({ sessionCount: 2, count: 2 });
    expect(retry.quotes.filter((quote) => quote.source === "episode")).toHaveLength(1);
    expect(retry.quotes.filter((quote) => quote.source === "memory")).toHaveLength(1);
    store.close();
  });

  test("the goals route lists, pins, dismisses and restores through the API", async () => {
    const get = (path) => fetch(`${seeded.base}${path}`);
    const post = (path, body) => fetch(`${seeded.base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const listed = await (await get("/v1/work/goals?project=shop")).json();
    const retry = listed.goals.find((goal) => goal.label.toLowerCase().includes("retry"));
    expect(retry).toBeTruthy();
    expect((await post(`/api/hub/goals/${retry.id}`, { action: "dismiss" })).status).toBe(200);
    const after = await (await get("/v1/work/goals?project=shop")).json();
    expect(after.goals.some((goal) => goal.id === retry.id)).toBe(false);
    expect(after.dismissedGoals.some((goal) => goal.id === retry.id)).toBe(true);
    expect((await post(`/api/hub/goals/${retry.id}`, { action: "restore" })).status).toBe(200);
    expect((await (await get("/v1/work/goals?project=shop")).json()).goals.some((goal) => goal.id === retry.id)).toBe(true);
    expect((await post(`/api/hub/goals/${retry.id}`, { action: "explode" })).status).toBe(400);
  });
});
