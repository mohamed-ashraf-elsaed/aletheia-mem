// T-114: alert rules and delivery. A rule fires on an event, queues one delivery, signs the webhook body with
// HMAC-SHA256, retries 5xx with backoff, times out, refuses private/loopback/link-local targets without the
// per-rule opt-in, and can append to a local file. No external network is used: every receiver is on loopback.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AlertStore, deliverDue, signPayload } from "../src/hub/alerts.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { runWorker } from "../src/hub/queue.mjs";
import { startSyncServer } from "../src/hub/sync/server.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-alerts-"));
let receiver;
let base;
let receiverState;

beforeAll(() => {
  receiverState = { attempts: 0, body: null, signature: null, mode: "ok" };
  receiver = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      receiverState.attempts += 1;
      receiverState.body = await request.text();
      receiverState.signature = request.headers.get("x-aletheia-signature");
      if (receiverState.mode === "retry-twice" && receiverState.attempts <= 2) return new Response("fail", { status: 500 });
      if (receiverState.mode === "slow") {
        await Bun.sleep(200);
        return new Response("late", { status: 200 });
      }
      return new Response("ok", { status: 200 });
    },
  });
  base = `http://127.0.0.1:${receiver.port}/hook`;
});

afterAll(() => {
  receiver.stop(true);
  rmSync(temp, { recursive: true, force: true });
});

let store;
beforeEach(() => {
  store = new AlertStore(":memory:");
  receiverState.attempts = 0;
  receiverState.body = null;
  receiverState.signature = null;
  receiverState.mode = "ok";
});
afterEach(() => store.close());

describe("T-114: alert rules and webhooks", () => {
  test("a rule fires once and signs the body with HMAC-SHA256", async () => {
    const rule = store.addRule({ name: "pair", event: "device.paired", target: "webhook", url: base, secret: "s3cret", allowPrivate: true });
    expect(rule.hasSecret).toBe(true);
    expect(store.listRules()[0].secret).toBeUndefined();
    expect(store.emit("device.paired", { detail: { deviceId: "d1" } })).toHaveLength(1);
    const result = await deliverDue(store);
    expect(result.delivered).toBe(1);
    expect(receiverState.attempts).toBe(1);
    expect(receiverState.signature).toBe(signPayload("s3cret", receiverState.body));
    expect(JSON.parse(receiverState.body).detail.deviceId).toBe("d1");
    expect(store.feed()[0].status).toBe("delivered");
    expect(JSON.stringify(store.feed())).not.toContain("s3cret");
  });

  test("the SSRF guard refuses loopback unless the rule allows private targets", async () => {
    store.addRule({ name: "unsafe", event: "token.revoked", target: "webhook", url: base });
    store.emit("token.revoked", { detail: { deviceId: "d2" } });
    const result = await deliverDue(store);
    expect(result.blocked).toBe(1);
    expect(receiverState.attempts).toBe(0);
    expect(store.feed()[0].status).toBe("failed");
    expect(store.feed()[0].lastError).toContain("private");
  });

  test("a 5xx retries with backoff and then delivers", async () => {
    store.addRule({ name: "retry", event: "sync.error", target: "webhook", url: base, allowPrivate: true });
    receiverState.mode = "retry-twice";
    store.emit("sync.error", { detail: { path: "/v1/sync/push" }, now: 1000 });
    const first = await deliverDue(store, { now: 1000 });
    expect(first.retried).toBe(1);
    expect(store.feed()[0].attempts).toBe(1);
    expect(store.feed()[0].nextAttemptEpoch).toBe(2000);
    const second = await deliverDue(store, { now: 2000 });
    expect(second.retried).toBe(1);
    const third = await deliverDue(store, { now: 4000 });
    expect(third.delivered).toBe(1);
    expect(receiverState.attempts).toBe(3);
    expect(store.feed()[0].status).toBe("delivered");
  });

  test("a slow webhook times out and is retried", async () => {
    store.addRule({ name: "slow", event: "quota.hit", target: "webhook", url: base, allowPrivate: true });
    receiverState.mode = "slow";
    store.emit("quota.hit", { detail: { tokenId: 1 }, now: 1000 });
    const result = await deliverDue(store, { now: 1000, timeoutMs: 30 });
    expect(result.retried).toBe(1);
    expect(store.feed()[0].status).toBe("pending");
    expect(store.feed()[0].lastError).toMatch(/abort|timeout/i);
  });

  test("a per-rule rate limit stops an alert storm", () => {
    store.addRule({ name: "storm", event: "device.paired", target: "file", path: join(temp, "storm.jsonl"), rateLimitS: 3600 });
    expect(store.emit("device.paired", { now: 1000 })).toHaveLength(1);
    expect(store.emit("device.paired", { now: 2000 })).toHaveLength(0);
    expect(store.feed()).toHaveLength(1);
  });

  test("a count threshold waits for N events in the window", () => {
    store.addRule({ name: "three", event: "extraction.failed", target: "file", path: join(temp, "three.jsonl"), countThreshold: 3, windowS: 60 });
    expect(store.emit("extraction.failed", { now: 1000 })).toHaveLength(0);
    expect(store.emit("extraction.failed", { now: 2000 })).toHaveLength(0);
    expect(store.emit("extraction.failed", { now: 3000 })).toHaveLength(1);
  });

  test("a minimum value gates a queue-depth rule", () => {
    store.addRule({ name: "deep", event: "queue.depth", target: "file", path: join(temp, "depth.jsonl"), minValue: 10 });
    expect(store.emit("queue.depth", { value: 5, now: 1000 })).toHaveLength(0);
    expect(store.emit("queue.depth", { value: 10, now: 2000 })).toHaveLength(1);
  });

  test("a file target appends the event and makes no network call", async () => {
    const path = join(temp, "feed.jsonl");
    store.addRule({ name: "file", event: "token.revoked", target: "file", path });
    store.emit("token.revoked", { detail: { deviceId: "d3" }, now: 1000 });
    const result = await deliverDue(store, { now: 1000 });
    expect(result.delivered).toBe(1);
    expect(receiverState.attempts).toBe(0);
    const line = JSON.parse(readFileSync(path, "utf8").trim());
    expect(line.event).toBe("token.revoked");
    expect(line.detail.deviceId).toBe("d3");
  });

  test("the sync hub emits device.paired for a real join", async () => {
    const path = join(temp, "paired.jsonl");
    const server = startSyncServer({ syncDb: join(temp, "sync", "sync.db"), alertsDb: join(temp, "sync", "alerts.db"), port: 0, name: "default", alertDeliveryMs: 0 });
    try {
      server.alerts.addRule({ name: "pair", event: "device.paired", target: "file", path });
      const accountId = server.store.ensureAccount("default").id;
      const code = server.store.createPairCode(accountId);
      const response = await fetch(`${server.url}/v1/sync/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, device_id: "device-pair", name: "Laptop" }) });
      expect(response.status).toBe(200);
      const result = await deliverDue(server.alerts);
      expect(result.delivered).toBe(1);
      expect(readFileSync(path, "utf8")).toContain("device.paired");
      expect(readFileSync(path, "utf8")).toContain("device-pair");
    } finally {
      server.stop();
    }
  });

  test("the extraction worker emits a failure and queue depth", async () => {
    const hub = new HubStore(":memory:");
    try {
      const failures = join(temp, "failed.jsonl");
      const depth = join(temp, "depth-worker.jsonl");
      store.addRule({ name: "failed", event: "extraction.failed", target: "file", path: failures });
      store.addRule({ name: "depth", event: "queue.depth", target: "file", path: depth, minValue: 0 });
      hub.db.prepare("INSERT INTO jobs (type, payload, status, attempts, max_attempts, next_attempt_epoch, created_at_epoch, updated_at_epoch) VALUES ('extract_session', ?, 'pending', 0, 1, 0, 1000, 1000)")
        .run("{not-json");
      const result = await runWorker({ store: hub, alerts: store, maxJobs: 1, now: () => 1000 });
      expect(result.failed).toBe(1);
      await deliverDue(store, { now: 1000 });
      expect(readFileSync(failures, "utf8")).toContain("extraction.failed");
      expect(readFileSync(depth, "utf8")).toContain("queue.depth");
    } finally {
      hub.close();
    }
  });
});
