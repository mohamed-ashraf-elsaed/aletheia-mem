// T-206: the status bar's model and controller, without a browser. Time, network and the socket are fakes.
import { describe, expect, test } from "bun:test";
import { POLL_MS, createStatusController } from "../public/ui-status.js";
import { bannerText, buildIndicators, frameKind, newErrors, overallState, recovered, retryDelaySeconds } from "../public/ui-status-model.js";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const HEALTH_OK = { status: "ok", db: { ok: true, detail: "quick_check ok" }, fts: { ok: true, detail: "FTS5 query answered" }, vectors: { memories: 0, facts: 0 }, model: "Xenova/bge-small-en-v1.5" };
const WORK = { queue: { pending: 0, running: 0, failed: 0, done: 4, depth: 0 }, mode: "code", lastCapture: [{ tool: "claude-code", at: "2026-10-27T11:57:00Z", count: 12 }, { tool: "cursor", at: "2026-10-27T09:00:00Z", count: 3 }] };
const SYNC_OFF = { epoch: 1, headSeq: 0, deviceCount: 0, devices: [] };
const byId = (list, id) => list.find((entry) => entry.id === id);

describe("T-206: indicators", () => {
  test("a healthy store gives the nine indicators plus live", () => {
    const list = buildIndicators({ health: HEALTH_OK, work: WORK, sync: SYNC_OFF, overview: { provider: "none" }, now: NOW });
    expect(list.map((entry) => entry.id)).toEqual(["server", "database", "fts", "vectors", "model", "queue", "extractor", "capture", "sync", "live"]);
    expect(byId(list, "server").state).toBe("ok");
    expect(byId(list, "database").state).toBe("ok");
    expect(byId(list, "fts").state).toBe("ok");
  });
  test("nothing is shown as fine before it has answered", () => {
    const list = buildIndicators({});
    for (const id of ["server", "database", "fts", "vectors", "model", "queue", "extractor", "capture", "sync"]) expect(byId(list, id).state).toBe("unknown");
  });
  test("a failed database check is an error with the doctor command", () => {
    const list = buildIndicators({ health: { ...HEALTH_OK, status: "error", db: { ok: false, detail: "database disk image is malformed" } }, now: NOW });
    expect(byId(list, "database")).toMatchObject({ state: "error", fix: "aletheia doctor" });
    expect(byId(list, "database").details).toContain("database disk image is malformed");
    expect(byId(list, "server").state).toBe("error");
  });
  test("a failed index check offers the optimize command", () => {
    const list = buildIndicators({ health: { ...HEALTH_OK, fts: { ok: false, detail: "no such table" } }, now: NOW });
    expect(byId(list, "fts")).toMatchObject({ state: "error", fix: "aletheia optimize" });
  });
  test("vectors are idle with no rows and ok with rows; the model follows", () => {
    expect(byId(buildIndicators({ health: HEALTH_OK, now: NOW }), "vectors")).toMatchObject({ state: "idle", fix: "aletheia embed" });
    const withVectors = buildIndicators({ health: { ...HEALTH_OK, vectors: { memories: 5, facts: 2 } }, now: NOW });
    expect(byId(withVectors, "vectors").state).toBe("ok");
    expect(byId(withVectors, "model").state).toBe("ok");
    expect(byId(withVectors, "model").details).toContain("model: Xenova/bge-small-en-v1.5");
  });
  test("queue states: empty ok, waiting warn, running working, failed error", () => {
    const q = (queue) => byId(buildIndicators({ work: { ...WORK, queue }, now: NOW }), "queue");
    expect(q({ pending: 0, running: 0, failed: 0, done: 1, depth: 0 }).state).toBe("ok");
    expect(q({ pending: 3, running: 0, failed: 0, done: 1, depth: 3 })).toMatchObject({ state: "warn", label: "Queue 3", fix: "aletheia compress" });
    expect(q({ pending: 2, running: 1, failed: 0, done: 1, depth: 3 }).state).toBe("working");
    expect(q({ pending: 0, running: 0, failed: 2, done: 1, depth: 0 }).state).toBe("error");
  });
  test("extractor shows the mode and whether a model provider is set", () => {
    const rules = byId(buildIndicators({ work: WORK, overview: { provider: "none" }, now: NOW }), "extractor");
    expect(rules.label).toBe("Extractor code");
    expect(rules.summary).toContain("rule-based");
    expect(rules.fix).toContain("ALETHEIA_PROVIDER");
    const provider = byId(buildIndicators({ work: WORK, overview: { provider: "claude-cli" }, now: NOW }), "extractor");
    expect(provider.summary).toContain("claude-cli");
    expect(provider.fix).toBeNull();
  });
  test("capture shows the newest tool and a line per tool; an old capture is idle", () => {
    const fresh = byId(buildIndicators({ work: WORK, now: NOW }), "capture");
    expect(fresh).toMatchObject({ state: "ok", label: "Capture 3 min ago" });
    expect(fresh.details).toEqual(["claude-code: 3 min ago (12 rows)", "cursor: 3 h ago (3 rows)"]);
    const stale = byId(buildIndicators({ work: { ...WORK, lastCapture: [{ tool: "cursor", at: "2026-10-26T09:00:00Z", count: 1 }] }, now: NOW }), "capture");
    expect(stale.state).toBe("idle");
    const none = byId(buildIndicators({ work: { ...WORK, lastCapture: [] }, now: NOW }), "capture");
    expect(none).toMatchObject({ state: "idle", label: "No capture yet", fix: "aletheia install claude-code --write" });
  });
  test("sync: off, connected, syncing with a count, behind, error", () => {
    const sync = (value) => byId(buildIndicators({ sync: value, now: NOW }), "sync");
    expect(sync(SYNC_OFF)).toMatchObject({ state: "idle", label: "Sync off", fix: "aletheia sync pair" });
    const base = { epoch: 1, headSeq: 10 };
    expect(sync({ ...base, devices: [{ deviceId: "d1", name: "laptop", pendingOps: 0, lastSync: "2026-10-27T11:59:00Z" }] })).toMatchObject({ state: "ok", label: "Sync connected" });
    expect(sync({ ...base, devices: [{ deviceId: "d1", pendingOps: 7, lastSync: "2026-10-27T11:59:00Z" }] })).toMatchObject({ state: "working", label: "Syncing 7" });
    expect(sync({ ...base, devices: [{ deviceId: "d1", pendingOps: 7, lastSync: "2026-10-27T08:00:00Z" }] })).toMatchObject({ state: "warn", label: "Sync behind 7" });
    expect(sync({ error: "HTTP 500" })).toMatchObject({ state: "error", label: "Sync error" });
    expect(sync({ ...base, devices: [{ deviceId: "d1", pendingOps: 4, revoked: true }] }).state).toBe("idle");
  });
  test("offline turns the server red and says what to run", () => {
    const list = buildIndicators({ offline: true, now: NOW });
    expect(byId(list, "server")).toMatchObject({ state: "error", fix: "bun bin/aletheia-server.mjs" });
  });
  test("live says WebSocket or polling", () => {
    expect(byId(buildIndicators({ live: "on", now: NOW }), "live")).toMatchObject({ state: "ok", label: "Live" });
    expect(byId(buildIndicators({ live: "off", now: NOW }), "live")).toMatchObject({ state: "idle", label: "Polling" });
  });
  test("overall: error beats working beats idle, and a sync error alone does not turn the favicon red", () => {
    const ok = buildIndicators({ health: HEALTH_OK, work: WORK, sync: SYNC_OFF, now: NOW });
    expect(overallState(ok)).toBe("idle");
    expect(overallState(ok, { refreshing: true })).toBe("working");
    expect(overallState(buildIndicators({ health: HEALTH_OK, work: { ...WORK, queue: { ...WORK.queue, running: 1, depth: 1 } }, now: NOW }))).toBe("working");
    expect(overallState(buildIndicators({ health: { ...HEALTH_OK, db: { ok: false } }, now: NOW }))).toBe("error");
    expect(overallState(buildIndicators({ health: HEALTH_OK, work: WORK, sync: { error: "x" }, now: NOW }))).toBe("idle");
  });
  test("new errors and recoveries are found by comparing two lists", () => {
    const before = buildIndicators({ health: HEALTH_OK, now: NOW });
    const after = buildIndicators({ health: { ...HEALTH_OK, db: { ok: false, detail: "bad" } }, now: NOW });
    expect(newErrors(before, after).map((entry) => entry.id)).toContain("database");
    expect(newErrors(after, after)).toEqual([]);
    expect(recovered(after, before).map((entry) => entry.id)).toContain("database");
  });
  test("retry delays double and cap at 30 s; the banner counts down", () => {
    expect([1, 2, 3, 4, 5, 9].map(retryDelaySeconds)).toEqual([2, 4, 8, 16, 30, 30]);
    expect(bannerText(5, 2)).toContain("in 5 s");
    expect(bannerText(0, 2)).toContain("now");
  });
  test("only known frame kinds count", () => {
    expect(frameKind('{"kind":"fact","id":1}')).toBe("fact");
    expect(frameKind('{"kind":"session"}')).toBe("session");
    expect(frameKind('{"kind":"other"}')).toBeNull();
    expect(frameKind("not json")).toBeNull();
  });
});

// ---- the controller, with a manual clock ----------------------------------------------------------------

function harness({ responses = {}, hidden = false, withSocket = true } = {}) {
  let clock = NOW;
  let nextId = 1;
  const timers = new Map();
  const calls = [];
  const snapshots = [];
  const connections = [];
  const sockets = [];
  const state = { hidden, down: false, responses: { ...responses } };
  const reply = (path) => {
    calls.push(path);
    if (state.down) return Promise.reject(new Error("network down"));
    const key = Object.keys(state.responses).find((prefix) => path.startsWith(prefix));
    const value = key ? state.responses[key] : { ok: false, status: 404, data: {} };
    return Promise.resolve(typeof value === "function" ? value() : value);
  };
  const controller = createStatusController({
    fetchJson: reply,
    now: () => clock,
    isHidden: () => state.hidden,
    project: () => state.project ?? "",
    openSocket: withSocket ? (project) => { const socket = { project, closed: false, close() { this.closed = true; this.onclose?.(); } }; sockets.push(socket); return socket; } : null,
    timers: { set: (fn, ms) => { const id = nextId++; timers.set(id, { at: clock + ms, fn }); return id; }, clear: (id) => timers.delete(id) },
    onChange: (snap) => snapshots.push(snap),
    onConnection: (info) => connections.push(info),
  });
  const advance = async (ms) => {
    const end = clock + ms;
    for (;;) {
      const due = [...timers.entries()].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      clock = due[1].at;
      timers.delete(due[0]);
      due[1].fn();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    clock = end;
  };
  return { controller, state, calls, snapshots, connections, sockets, advance, timers, last: () => snapshots.at(-1) };
}
const OK = (data) => ({ ok: true, status: 200, data });
const GOOD = { "/v1/health": OK(HEALTH_OK), "/v1/work": OK(WORK), "/api/hub/sync/status": OK(SYNC_OFF), "/api/hub/overview": OK({ provider: "none" }) };
const flush = () => new Promise((resolve) => setTimeout(resolve, 5));

describe("T-206: controller", () => {
  test("the first refresh asks every source once and reports indicators", async () => {
    const h = harness({ responses: GOOD });
    await h.controller.start();
    expect(h.calls.filter((path) => path.startsWith("/v1/health")).length).toBe(1);
    expect(h.calls.some((path) => path.startsWith("/v1/work"))).toBe(true);
    expect(h.calls.some((path) => path.startsWith("/api/hub/sync/status"))).toBe(true);
    expect(h.calls.some((path) => path.startsWith("/api/hub/overview"))).toBe(true);
    const snap = h.last();
    expect(snap.offline).toBe(false);
    expect(snap.refreshing).toBe(false);
    expect(snap.updatedAt).toBe(NOW);
    expect(byId(snap.indicators, "database").state).toBe("ok");
    expect(h.snapshots[0].refreshing).toBe(true);
  });
  test("the work request carries the project and asks for a small answer", async () => {
    const h = harness({ responses: GOOD });
    h.state.project = "shop";
    await h.controller.start();
    expect(h.calls.find((path) => path.startsWith("/v1/work"))).toBe("/v1/work?sessions=1&facts=1&review=1&project=shop");
  });
  test("polling runs on a timer, every 10 s without a socket", async () => {
    const h = harness({ responses: GOOD, withSocket: false });
    await h.controller.start();
    const first = h.calls.filter((path) => path.startsWith("/v1/health")).length;
    await h.advance(POLL_MS.polling - 1);
    expect(h.calls.filter((path) => path.startsWith("/v1/health")).length).toBe(first);
    await h.advance(2);
    await flush();
    expect(h.calls.filter((path) => path.startsWith("/v1/health")).length).toBe(first + 1);
  });
  test("no timer runs while the page is hidden, and showing it pulls at once", async () => {
    const h = harness({ responses: GOOD, hidden: true, withSocket: false });
    await h.controller.start();
    expect(h.timers.size).toBe(0);
    const before = h.calls.length;
    await h.advance(120_000);
    expect(h.calls.length).toBe(before);
    h.state.hidden = false;
    h.controller.visibilityChanged();
    await flush();
    expect(h.calls.length).toBeGreaterThan(before);
  });
  test("hiding the page cancels the pending poll", async () => {
    const h = harness({ responses: GOOD, withSocket: false });
    await h.controller.start();
    expect(h.timers.size).toBeGreaterThan(0);
    h.state.hidden = true;
    h.controller.visibilityChanged();
    expect(h.timers.size).toBe(0);
  });
  test("a socket that opens switches to the slow poll and marks live", async () => {
    const h = harness({ responses: GOOD });
    await h.controller.start();
    expect(h.sockets.length).toBe(1);
    h.sockets[0].onopen();
    expect(byId(h.last().indicators, "live").state).toBe("ok");
    const health = h.calls.filter((path) => path.startsWith("/v1/health")).length;
    await h.advance(POLL_MS.polling + 100);
    expect(h.calls.filter((path) => path.startsWith("/v1/health")).length).toBe(health);
    await h.advance(POLL_MS.live);
    await flush();
    expect(h.calls.filter((path) => path.startsWith("/v1/health")).length).toBe(health + 1);
  });
  test("a frame triggers one light refresh after a short pause, without the health check", async () => {
    const h = harness({ responses: GOOD });
    await h.controller.start();
    h.sockets[0].onopen();
    const health = h.calls.filter((path) => path.startsWith("/v1/health")).length;
    const work = h.calls.filter((path) => path.startsWith("/v1/work")).length;
    for (let i = 0; i < 5; i += 1) h.sockets[0].onmessage({ data: '{"kind":"session","id":1}' });
    h.sockets[0].onmessage({ data: "garbage" });
    await h.advance(450);
    await flush();
    expect(h.calls.filter((path) => path.startsWith("/v1/work")).length).toBe(work + 1);
    expect(h.calls.filter((path) => path.startsWith("/v1/health")).length).toBe(health);
  });
  test("when the socket closes it falls back to polling and reconnects with a delay", async () => {
    const h = harness({ responses: GOOD });
    await h.controller.start();
    h.sockets[0].onopen();
    h.sockets[0].close();
    expect(byId(h.last().indicators, "live").state).toBe("idle");
    expect(h.sockets.length).toBe(1);
    await h.advance(5_100);
    expect(h.sockets.length).toBe(2);
    h.sockets[1].close();
    await h.advance(10_100);
    expect(h.sockets.length).toBe(3);
  });
  test("losing the server turns on offline mode, counts down and retries", async () => {
    const h = harness({ responses: GOOD, withSocket: false });
    await h.controller.start();
    h.state.down = true;
    await h.controller.refresh();
    expect(h.last().offline).toBe(true);
    expect(byId(h.last().indicators, "server").state).toBe("error");
    expect(h.connections.at(-1)).toMatchObject({ up: false, secondsLeft: 2, attempt: 1 });
    await h.advance(1000);
    expect(h.connections.at(-1).secondsLeft).toBe(1);
    const callsBefore = h.calls.length;
    h.state.down = false;
    await h.advance(1100);
    await flush();
    expect(h.calls.length).toBeGreaterThan(callsBefore);
    expect(h.last().offline).toBe(false);
    expect(h.connections.at(-1)).toMatchObject({ up: true, recovered: true });
  });
  test("each failed retry waits longer", async () => {
    const h = harness({ responses: GOOD, withSocket: false });
    await h.controller.start();
    h.state.down = true;
    await h.controller.refresh();
    expect(h.connections.at(-1).secondsLeft).toBe(2);
    await h.advance(2100);
    await flush();
    expect(h.connections.at(-1).secondsLeft).toBe(4);
    await h.advance(4100);
    await flush();
    expect(h.connections.at(-1).secondsLeft).toBe(8);
  });
  test("a manual refresh during the wait retries now", async () => {
    const h = harness({ responses: GOOD, withSocket: false });
    await h.controller.start();
    h.state.down = true;
    await h.controller.refresh();
    h.state.down = false;
    await h.controller.refresh();
    expect(h.last().offline).toBe(false);
  });
  test("a new error is reported once, and recovery once", async () => {
    const h = harness({ responses: GOOD, withSocket: false });
    await h.controller.start();
    h.state.responses["/v1/health"] = OK({ ...HEALTH_OK, status: "error", db: { ok: false, detail: "bad page" } });
    await h.controller.refresh();
    expect(h.last().newErrors.map((entry) => entry.id)).toContain("database");
    await h.controller.refresh();
    expect(h.last().newErrors.map((entry) => entry.id)).not.toContain("database");
    h.state.responses["/v1/health"] = OK(HEALTH_OK);
    await h.controller.refresh();
    expect(h.last().recovered.map((entry) => entry.id)).toContain("database");
  });
  test("an unhealthy 503 answer is data, not a lost connection", async () => {
    const h = harness({ responses: { ...GOOD, "/v1/health": { ok: false, status: 503, data: { ...HEALTH_OK, status: "error", fts: { ok: false, detail: "x" } } } }, withSocket: false });
    await h.controller.start();
    expect(h.last().offline).toBe(false);
    expect(byId(h.last().indicators, "fts").state).toBe("error");
  });
  test("a failing sync route shows a sync error and leaves the rest alone", async () => {
    const h = harness({ responses: { ...GOOD, "/api/hub/sync/status": { ok: false, status: 500, data: { error: "no account" } } }, withSocket: false });
    await h.controller.start();
    expect(byId(h.last().indicators, "sync")).toMatchObject({ state: "error" });
    expect(byId(h.last().indicators, "database").state).toBe("ok");
  });
  test("a failing work route is not a lost connection", async () => {
    const h = harness({ responses: { ...GOOD, "/v1/work": { ok: false, status: 500, data: {} } }, withSocket: false });
    await h.controller.start();
    expect(h.last().offline).toBe(false);
  });
  test("two refreshes at once share one request set", async () => {
    const h = harness({ responses: GOOD, withSocket: false });
    const a = h.controller.refresh();
    const b = h.controller.refresh();
    await Promise.all([a, b]);
    expect(h.calls.filter((path) => path.startsWith("/v1/health")).length).toBe(1);
  });
  test("stopping clears every timer and closes the socket", async () => {
    const h = harness({ responses: GOOD });
    await h.controller.start();
    h.controller.stop();
    expect(h.timers.size).toBe(0);
    expect(h.sockets[0].closed).toBe(true);
  });
  test("changing the project reconnects the socket", async () => {
    const h = harness({ responses: GOOD });
    await h.controller.start();
    h.state.project = "shop";
    await h.controller.setProject();
    await flush();
    expect(h.sockets.at(-1).project).toBe("shop");
  });
});
