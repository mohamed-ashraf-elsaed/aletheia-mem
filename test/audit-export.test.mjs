// audit export. The append-only sync audit log renders as JSONL (default) or CSV with an inclusive
// date range, is admin-only over HTTP, round-trips into a fresh store, and never carries a secret or payload.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SyncClient } from "../src/hub/sync/client.mjs";
import { SyncStore } from "../src/hub/sync/store.mjs";
import { startSyncServer } from "../src/hub/sync/server.mjs";
import { auditExportRows, epochOrNull, exportAudit, exportAuditCsv, exportAuditJsonl } from "../src/hub/audit-export.mjs";
import { removeDir } from "./temp-dirs.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-audit-export-"));

/** Insert audit rows with an explicit timestamp so date-range tests are deterministic. */
function seed(store, accountId, rows) {
  const insert = store.db.prepare("INSERT INTO sync_audit (account_id, token_id, device_id, action, detail, result, ts) VALUES (?,?,?,?,?,?,?)");
  for (const row of rows) {
    insert.run(Number(accountId), row.token_id ?? null, row.device_id ?? null, row.action, row.detail ?? null, row.result, row.ts);
  }
}

const T0 = 1700000000000;

describe("audit export", () => {
  test("epochOrNull accepts epoch ms and ISO dates and rejects garbage", () => {
    expect(epochOrNull("1700000000000")).toBe(1700000000000);
    expect(epochOrNull("2026-01-31")).toBe(Date.parse("2026-01-31"));
    expect(epochOrNull(null)).toBeNull();
    expect(epochOrNull("")).toBeNull();
    expect(epochOrNull("not-a-date")).toBeNull();
  });

  test("exports every audit row as stable JSONL and round-trips into a fresh store", () => {
    const store = new SyncStore(":memory:");
    const accountId = store.ensureAccount("default").id;
    seed(store, accountId, [
      { token_id: null, device_id: "server", action: "sync.compact", detail: JSON.stringify({ dropped: 3 }), result: "ok", ts: T0 },
      { token_id: 5, device_id: null, action: "token.mint", detail: JSON.stringify({ scope: "sync" }), result: "ok", ts: T0 + 1000 },
      { token_id: null, device_id: "dev", action: "sync.push", detail: JSON.stringify({ applied: 1 }), result: "ok", ts: T0 + 2000 },
    ]);
    const { body, contentType, count } = exportAudit(store, accountId, { format: "jsonl" });
    expect(count).toBe(3);
    expect(contentType).toContain("ndjson");
    const lines = body.trim().split("\n").map((line) => JSON.parse(line));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({
      id: lines[0].id, account_id: accountId, ts: T0, token_id: null, device_id: "server",
      action: "sync.compact", result: "ok", target: { dropped: 3 },
    });
    expect(lines[2].target).toEqual({ applied: 1 });

    // Round-trip: the export is self-contained, so re-inserting it into a fresh store restores the same rows.
    const fresh = new SyncStore(":memory:");
    const freshId = fresh.ensureAccount("default").id;
    seed(fresh, freshId, lines.map((line) => ({
      token_id: line.token_id, device_id: line.device_id, action: line.action,
      detail: JSON.stringify(line.target), result: line.result, ts: line.ts,
    })));
    const source = auditExportRows(store, accountId).map(({ id, ...rest }) => rest);
    const restored = auditExportRows(fresh, freshId).map(({ id, ...rest }) => rest);
    expect(restored).toEqual(source);
    store.close();
    fresh.close();
  });

  test("a date range filters inclusively", () => {
    const store = new SyncStore(":memory:");
    const accountId = store.ensureAccount("default").id;
    seed(store, accountId, [
      { token_id: null, device_id: "a", action: "one", detail: null, result: "ok", ts: T0 },
      { token_id: null, device_id: "b", action: "two", detail: null, result: "ok", ts: T0 + 1000 },
      { token_id: null, device_id: "c", action: "three", detail: null, result: "ok", ts: T0 + 2000 },
    ]);
    expect(exportAudit(store, accountId, { from: T0 + 1000 }).count).toBe(2);
    expect(exportAudit(store, accountId, { to: T0 + 1000 }).count).toBe(2);
    expect(exportAudit(store, accountId, { from: T0, to: T0 + 2000 }).count).toBe(3);
    expect(exportAudit(store, accountId, { from: T0 + 1000, to: T0 + 1000 }).count).toBe(1);
    expect(exportAudit(store, accountId, { from: T0 + 5000 }).count).toBe(0);
    store.close();
  });

  test("CSV has a header row and actor/target columns", () => {
    const store = new SyncStore(":memory:");
    const accountId = store.ensureAccount("default").id;
    seed(store, accountId, [
      { token_id: 7, device_id: null, action: "token.revoke", detail: JSON.stringify({ id: 7 }), result: "ok", ts: T0 },
      { token_id: null, device_id: "laptop", action: "device.revoke", detail: null, result: "missing", ts: T0 + 1 },
    ]);
    const csv = exportAuditCsv(auditExportRows(store, accountId));
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("id,account_id,ts,iso,actor,action,result,target");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("token:7");
    expect(lines[1]).toContain("token.revoke");
    // The JSON target cell is CSV-quoted with doubled quotes.
    expect(lines[1]).toContain('"{""id"":7}"');
    expect(lines[2]).toContain("device:laptop");
    expect(lines[2]).toContain("missing");
    store.close();
  });

  test("a secret written through a push never appears in the export", () => {
    const store = new SyncStore(":memory:");
    const accountId = store.ensureAccount("default").id;
    const client = new SyncClient(":memory:", { deviceId: "device-secret", name: "Secret" });
    client.put("memory", { project: "shop", title: "note", narrative: "api key sk-ant-secret-123456789" });
    store.pushOps(accountId, client.outbox(), { actor: { tokenId: null, deviceId: "device-secret" } });
    const body = exportAudit(store, accountId, { format: "jsonl" }).body;
    expect(body).not.toContain("sk-ant-secret");
    expect(body).not.toContain("123456789");
    expect(body).not.toContain("api key");
    client.close();
    store.close();
  });
});

describe("audit export over HTTP", () => {
  let hub;
  let accountId;
  let admin;
  let syncToken;
  let revoked;

  beforeAll(() => {
    hub = startSyncServer({ syncDb: join(temp, "hub", "sync.db"), host: "127.0.0.1", port: 0, name: "default" });
    accountId = hub.store.ensureAccount("default").id;
    admin = hub.store.mintToken(accountId, { scope: "admin", name: "Admin" }).token;
    syncToken = hub.store.mintToken(accountId, { scope: "sync", name: "Sync" }).token;
    revoked = hub.store.mintToken(accountId, { scope: "admin", name: "Revoked" });
    hub.store.revokeToken(accountId, revoked.id);
    // One row far in the past, so a `to` filter isolates it from the mint rows created just now.
    seed(hub.store, accountId, [
      { token_id: null, device_id: "archive", action: "archive.one", detail: JSON.stringify({ n: 1 }), result: "ok", ts: 946684800000 },
    ]);
  });

  afterAll(() => {
    hub.stop();
    removeDir(temp, { recursive: true, force: true });
  });

  const exportRequest = (token, query = "") => fetch(`${hub.url}/v1/audit/export${query}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  test("an admin token downloads JSONL with the attachment headers", async () => {
    const response = await exportRequest(admin);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("ndjson");
    expect(response.headers.get("content-disposition")).toContain("attachment; filename=");
    const body = await response.text();
    const lines = body.trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toHaveProperty("action");
    expect(lines[0]).toHaveProperty("target");
  });

  test("a date range filters over HTTP and format=csv answers text/csv", async () => {
    const past = await exportRequest(admin, "?to=2001-01-01");
    expect(past.status).toBe(200);
    const lines = (await past.text()).trim().split("\n").map((line) => JSON.parse(line));
    expect(lines.map((line) => line.action)).toEqual(["archive.one"]);

    const csv = await exportRequest(admin, "?format=csv&to=2001-01-01");
    expect(csv.status).toBe(200);
    expect(csv.headers.get("content-type")).toContain("text/csv");
    expect((await csv.text()).split("\n")[0]).toContain("actor");
  });

  test("missing, revoked and wrong-scope tokens cannot export", async () => {
    expect((await exportRequest(null)).status).toBe(401);
    expect((await exportRequest(revoked.token)).status).toBe(401);
    expect((await exportRequest("not-a-real-token")).status).toBe(401);
    expect((await exportRequest(syncToken)).status).toBe(403);
  });

  test("an invalid format or date range is a 400", async () => {
    expect((await exportRequest(admin, "?format=xml")).status).toBe(400);
    expect((await exportRequest(admin, "?from=not-a-date")).status).toBe(400);
    expect((await exportRequest(admin, "?to=not-a-date")).status).toBe(400);
  });
});
