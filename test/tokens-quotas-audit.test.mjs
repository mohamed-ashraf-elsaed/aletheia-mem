// scoped API tokens, quotas and an audit log. Token scopes (sync/read/mcp/admin) are limited to
// named projects; per-token ops/day and bytes/day quotas are local settings off by default; the audit table
// is append-only and never holds payloads or secrets.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SyncClient } from "../src/hub/sync/client.mjs";
import { SyncStore } from "../src/hub/sync/store.mjs";
import { startSyncServer } from "../src/hub/sync/server.mjs";
import { removeDir } from "./temp-dirs.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-sync-token-"));
let hub;
let accountId;

beforeAll(() => {
  hub = startSyncServer({ syncDb: join(temp, "hub", "sync.db"), host: "127.0.0.1", port: 0, name: "default" });
  accountId = hub.store.ensureAccount("default").id;
});

afterAll(() => {
  hub.stop();
  removeDir(temp, { recursive: true, force: true });
});

const push = (token, deviceId, ops) => fetch(`${hub.url}/v1/sync/push`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Device-Id": deviceId, "X-Device-Name": deviceId },
  body: JSON.stringify({ ops }),
});

describe("scoped tokens, quotas and audit", () => {
  test("(j) a read token cannot push", async () => {
    const read = hub.store.mintToken(accountId, { scope: "read", deviceId: "device-read", name: "Read" }).token;
    const response = await push(read, "device-read", []);
    expect(response.status).toBe(403);
  });

  test("a sync token is limited to its named projects", async () => {
    const client = new SyncClient(join(temp, "scoped", "client.db"), { deviceId: "device-scoped", name: "Scoped" });
    const shopOp = client.put("memory", { project: "shop", title: "Allowed", narrative: "in scope" });
    const docsOp = client.put("memory", { project: "docs", title: "Denied", narrative: "out of scope" });
    const token = hub.store.mintToken(accountId, { scope: "sync", deviceId: "device-scoped", projects: ["shop"] }).token;
    const response = await push(token, "device-scoped", [shopOp, docsOp]);
    const { results } = await response.json();
    expect(results.map((r) => r.status)).toEqual(["applied", "rejected"]);
    expect(results[1].reason).toContain("project not allowed");
    client.close();
  });

  test("an ops-per-day quota blocks writes once reached and never reads", async () => {
    const client = new SyncClient(join(temp, "quota", "client.db"), { deviceId: "device-quota", name: "Quota" });
    const op1 = client.put("memory", { project: "shop", title: "Quota one", narrative: "first" });
    const op2 = client.put("memory", { project: "shop", title: "Quota two", narrative: "second" });
    const token = hub.store.mintToken(accountId, { scope: "sync", deviceId: "device-quota", opsPerDay: 1 }).token;

    const first = await push(token, "device-quota", [op1]);
    expect(first.status).toBe(200);
    const second = await push(token, "device-quota", [op2]);
    expect(second.status).toBe(402);
    expect((await second.json()).error).toContain("quota");

    // Reads still work under a write quota.
    const read = await fetch(`${hub.url}/v1/sync/pull?since=0`, { headers: { Authorization: `Bearer ${token}`, "X-Device-Id": "device-quota" } });
    expect(read.status).toBe(200);
    client.close();
  });

  test("the audit log is append-only and never holds secrets or payloads", async () => {
    const client = new SyncClient(join(temp, "audit", "client.db"), { deviceId: "device-audit", name: "Audit" });
    client.put("memory", { project: "shop", title: "Secret note", narrative: "key sk-ant-abcdefghijklmnopqrstuvwxyz and Bearer abcdefghijklmnop" });
    const token = hub.store.mintToken(accountId, { scope: "sync", deviceId: "device-audit" }).token;
    await push(token, "device-audit", client.outbox());

    const rows = hub.store.auditLog(accountId, 100);
    expect(rows.length).toBeGreaterThan(0);
    const joined = JSON.stringify(rows);
    expect(joined).not.toContain("sk-ant-");
    expect(joined).not.toContain("Bearer abcdef");
    // The audit detail is counts only, never a payload.
    expect(joined).not.toContain("Secret note");
    client.close();
  });

  test("admin can mint a scoped token and read the audit log", async () => {
    const admin = hub.store.mintToken(accountId, { scope: "admin", deviceId: "device-admin", name: "Admin" }).token;
    const minted = await fetch(`${hub.url}/v1/sync/tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${admin}` },
      body: JSON.stringify({ scope: "read", name: "readonly", projects: ["shop"] }),
    });
    expect(minted.status).toBe(201);
    const { token, scope, projects } = await minted.json();
    expect(scope).toBe("read");
    expect(projects).toEqual(["shop"]);

    const audit = await fetch(`${hub.url}/v1/sync/audit`, { headers: { Authorization: `Bearer ${admin}` } });
    expect(audit.status).toBe(200);
    expect((await audit.json()).audit.length).toBeGreaterThan(0);
  });
});
