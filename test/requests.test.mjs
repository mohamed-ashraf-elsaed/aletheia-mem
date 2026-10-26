// T-152: sessions of one goal in one project group into a request, with status, stage, running time and
// "where this came from". Every value is read from a row; an empty store says empty.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { startServer } from "../src/server.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { proposeRequests, requestAction, requestDetail } from "../src/hub/requests.mjs";
import { makeFixture } from "./fixture.mjs";

const NOW = Date.UTC(2026, 9, 26, 12, 0, 0);
const at = (minutes) => NOW - minutes * 60_000;
const fx = makeFixture();
let seeded;

function prompt(store, project, sessionId, text, minutes) {
  return store.add({ project, kind: "prompt", type: "note", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes) });
}
function event(store, project, sessionId, text, minutes) {
  return store.add({ project, kind: "event", type: "event", title: text, narrative: text, sessionId, tool: "claude-code", createdAtEpoch: at(minutes) });
}
function episode(store, project, sessionId, role, kind, text, minutes, sourceRef) {
  return store.addEpisode({ project, tool: "claude-code", sessionId, role, kind, text, sourceRef, createdAtEpoch: at(minutes) });
}

function seedGrouping(path) {
  const store = new HubStore(path);
  prompt(store, "shop", "s1", "Build a retry button on checkout", 300);
  event(store, "shop", "s1", "Edited RetryButton.tsx", 290);
  const e = episode(store, "shop", "s1", "tool", "event", "Ran the retry tests", 280, "r:s1:1");
  store.addFact({ project: "shop", episodeId: e.id, subject: "retry button", predicate: "uses", object: "exponential backoff", text: "The retry button uses exponential backoff", confidence: 0.9 });
  prompt(store, "shop", "s2", "Build a retry button for payments", 120);
  prompt(store, "shop", "s3", "Rewrite the onboarding guide", 200);
  store.close();
}

beforeAll(() => {
  const dbPath = join(fx.dir, "requests.db");
  seedGrouping(dbPath);
  const cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir: fx.makeDir("requests-data"),
    overlayDb: join(fx.dir, "requests-overlay.db"),
    reviewDb: join(fx.dir, "requests-review.db"),
    ledgerDir: fx.makeDir("requests-ledger"),
    humanCopyCache: join(fx.dir, "requests-human.json"),
    rulesFile: join(fx.dir, "REQUESTS-RULES.md"),
    claudeInstructionsFile: join(fx.dir, "REQUESTS-CLAUDE.md"),
    hubDb: dbPath,
    provider: "none",
    extra: { home: fx.makeDir("requests-home") },
  });
  seeded = { app: startServer(cfg) };
  seeded.base = `http://127.0.0.1:${seeded.app.server.port}`;
});

afterAll(() => seeded.app.stop());

describe("T-152: the request layer", () => {
  test("sessions of one goal in one project form one request; a different goal is another", () => {
    const store = new HubStore(join(fx.dir, "requests.db"));
    const data = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 });
    const retry = data.requests.find((request) => request.goalKey === "build retry button");
    const onboarding = data.requests.find((request) => request.goalKey === "rewrite onboarding guide");
    expect(retry).toBeTruthy();
    expect(onboarding).toBeTruthy();
    expect(retry.sessionCount).toBe(2);
    expect(retry.evidence.sessionIds.sort()).toEqual(["s1", "s2"]);
    expect(retry.promptCount).toBe(2);
    expect(retry.toolCount).toBe(2);
    expect(retry.stage).toContain("retry button");
    expect(retry.startedAt).toContain("T");
    expect(retry.runningTimeMs).toBeGreaterThan(0);
    expect(onboarding.sessionCount).toBe(1);
    store.close();
  });

  test("status comes from stored rows: Working, Shipped, Waiting on you and Idle", () => {
    const store = new HubStore(":memory:");
    try {
      prompt(store, "shop", "w", "Build a retry button", 3);
      event(store, "shop", "w", "Edited RetryButton.tsx", 2);
      const working = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 }).requests[0];
      expect(working.status).toBe("Working");

      prompt(store, "shop", "ship", "Ship the retry button", 300);
      event(store, "shop", "ship", "Ran the release", 290);
      store.markSessionEnded("shop", "ship", { source: "SessionEnd", now: at(280) });
      const shipped = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 }).requests.find((r) => r.status === "Shipped");
      expect(shipped).toBeTruthy();
      expect(shipped.ended).toBe(true);

      prompt(store, "shop", "wait", "Should the retry button show a spinner?", 60);
      const waiting = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 }).requests.find((r) => r.status === "Waiting on you");
      expect(waiting).toBeTruthy();

      prompt(store, "shop", "idle", "Investigate the retry latency", 90);
      event(store, "shop", "idle", "Read the latency report", 80);
      const idle = proposeRequests(store, { project: "shop", now: NOW, activeMinutes: 5 }).requests.find((r) => r.status === "Idle");
      expect(idle).toBeTruthy();
    } finally {
      store.close();
    }
  });

  test("detail returns where this came from: sessions, prompts and facts", () => {
    const store = new HubStore(join(fx.dir, "requests.db"));
    const data = proposeRequests(store, { project: "shop", now: NOW });
    const retry = data.requests.find((request) => request.goalKey === "build retry button");
    const detail = requestDetail(store, { requestId: retry.id, project: "shop", now: NOW });
    expect(detail).toBeTruthy();
    expect(detail.whereThisCameFrom.sessions.map((s) => s.sessionId).sort()).toEqual(["s1", "s2"]);
    expect(detail.whereThisCameFrom.promptCount).toBe(2);
    const s1 = detail.whereThisCameFrom.sessions.find((s) => s.sessionId === "s1");
    expect(s1.prompts.some((p) => p.text.includes("retry button"))).toBe(true);
    expect(s1.facts.some((f) => f.text.includes("exponential backoff"))).toBe(true);
    expect(requestDetail(store, { requestId: "not-a-request" })).toBeNull();
    store.close();
  });

  test("dismiss and restore are reversible settings, not deletes", () => {
    const store = new HubStore(join(fx.dir, "requests.db"));
    const first = proposeRequests(store, { project: "shop", now: NOW }).requests[0];
    expect(requestAction(store, first.id, { action: "dismiss" }).dismissed).toBe(true);
    let data = proposeRequests(store, { project: "shop", now: NOW });
    expect(data.requests.some((request) => request.id === first.id)).toBe(false);
    expect(data.dismissedRequests.some((request) => request.id === first.id)).toBe(true);
    expect(requestAction(store, first.id, { action: "restore" }).dismissed).toBe(false);
    data = proposeRequests(store, { project: "shop", now: NOW });
    expect(data.requests.some((request) => request.id === first.id)).toBe(true);
    expect(() => requestAction(store, "bad", { action: "dismiss" })).toThrow();
    store.close();
  });

  test("the /v1/work/requests routes answer with the same shapes and an empty store says empty", async () => {
    const get = (path) => fetch(`${seeded.base}${path}`);
    const post = (path, body) => fetch(`${seeded.base}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

    const listed = await (await get("/v1/work/requests?project=shop")).json();
    expect(listed.requests.length).toBe(2);
    expect(listed.counts.total).toBe(2);
    expect(listed.empty).toBe(false);
    const retry = listed.requests.find((request) => request.goalKey === "build retry button");
    expect(retry).toMatchObject({ sessionCount: 2, status: "Waiting on you" });

    const detail = await (await get(`/v1/work/requests/${retry.id}?project=shop`)).json();
    expect(detail.request.whereThisCameFrom.sessions).toHaveLength(2);
    expect((await get("/v1/work/requests/0000000000000000")).status).toBe(404);

    expect((await post(`/api/hub/requests/${retry.id}`, { action: "dismiss" })).status).toBe(200);
    const after = await (await get("/v1/work/requests?project=shop")).json();
    expect(after.requests.some((request) => request.id === retry.id)).toBe(false);
    expect(after.dismissedRequests.some((request) => request.id === retry.id)).toBe(true);
    expect((await post(`/api/hub/requests/${retry.id}`, { action: "explode" })).status).toBe(400);

    const empty = new HubStore(":memory:");
    const none = proposeRequests(empty, { now: NOW });
    expect(none.empty).toBe(true);
    expect(none.requests).toEqual([]);
    empty.close();
  });
});
