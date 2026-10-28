// tombstones, compaction and purge. Deletes converge as tombstones; compaction drops superseded
// bodies older than the retention window that every device has acked past; purge removes content everywhere
// and leaves only the tombstone. A device whose cursor is behind the retained window re-bootstraps from a
// snapshot.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SyncClient } from "../src/hub/sync/client.mjs";
import { SyncStore } from "../src/hub/sync/store.mjs";
import { startSyncServer } from "../src/hub/sync/server.mjs";
import { removeDir } from "./temp-dirs.mjs";

const temp = mkdtempSync(join(tmpdir(), "aletheia-sync-tomb-"));
let hub;
let accountId;
const dirA = join(temp, "a");
const dirB = join(temp, "b");
let a;
let b;
let tokenA;
let tokenB;

beforeAll(() => {
  hub = startSyncServer({ syncDb: join(temp, "hub", "sync.db"), host: "127.0.0.1", port: 0, name: "default" });
  accountId = hub.store.ensureAccount("default").id;
  tokenA = hub.store.mintToken(accountId, { scope: "sync", deviceId: "device-a", name: "A" }).token;
  tokenB = hub.store.mintToken(accountId, { scope: "sync", deviceId: "device-b", name: "B" }).token;
  a = new SyncClient(join(dirA, "client.db"), { deviceId: "device-a", name: "A" });
  b = new SyncClient(join(dirB, "client.db"), { deviceId: "device-b", name: "B" });
});

afterAll(() => {
  a.close();
  b.close();
  hub.stop();
  removeDir(temp, { recursive: true, force: true });
});

const mint = (deviceId) => hub.store.mintToken(accountId, { scope: "sync", deviceId, name: deviceId }).token;

describe("tombstones, compaction and purge", () => {
  test("(f) a tombstone propagates and compaction keeps convergence", async () => {
    const op = a.put("memory", { project: "shop", title: "Old note", narrative: "will be deleted" });
    await a.push(hub.url, tokenA);
    await b.pull(hub.url, tokenB);
    expect(b.entities().some((e) => e.entity_id === op.entity_id && e.payload?.title === "Old note")).toBe(true);

    a.deleteEntity("memory", op.entity_id);
    await a.push(hub.url, tokenA);
    await b.pull(hub.url, tokenB);
    expect(b.entities().find((e) => e.entity_id === op.entity_id).deleted).toBe(true);
    expect(b.entities().find((e) => e.entity_id === op.entity_id).payload).toBeNull();

    // Both devices ack past the tombstone before compaction.
    await a.pull(hub.url, tokenA);
    await b.pull(hub.url, tokenB);

    const compacted = hub.store.compact(accountId, { retentionMs: 0 });
    expect(compacted.dropped).toBeGreaterThanOrEqual(1);

    // A fresh device that replays the log still converges to the tombstoned state.
    const fresh = new SyncClient(join(temp, "fresh", "client.db"), { deviceId: "device-fresh", name: "F" });
    const pull = await fresh.pull(hub.url, mint("device-fresh"));
    expect(pull.snapshot_required).toBe(true); // its cursor 0 is older than the retained window
    expect(fresh.contentHash()).toBe(a.contentHash());
    fresh.close();
  });

  test("a device older than the window re-bootstraps from a snapshot", async () => {
    const stale = new SyncClient(join(temp, "stale", "client.db"), { deviceId: "device-stale", name: "S" });
    const response = await fetch(`${hub.url}/v1/sync/snapshot`, { headers: { Authorization: `Bearer ${mint("device-stale")}` } });
    const snapshot = await response.json();
    expect(response.status).toBe(200);
    expect(snapshot.entities.length).toBeGreaterThan(0);
    stale.applySnapshot(snapshot);
    expect(stale.contentHash()).toBe(a.contentHash());
    stale.close();
  });

  test("dismiss and restore keep their content through compaction", async () => {
    const d = new SyncClient(join(temp, "dismiss", "client.db"), { deviceId: "device-d", name: "D" });
    const op = d.put("memory", { project: "shop", title: "Dismissed note", narrative: "hidden but present" });
    await d.push(hub.url, mint("device-d"));
    d.dismiss("memory", op.entity_id);
    await d.push(hub.url, mint("device-d2"));
    await d.pull(hub.url, mint("device-d2"));

    hub.store.compact(accountId, { retentionMs: 0 });
    const replay = new SyncClient(join(temp, "dismiss-replay", "client.db"), { deviceId: "device-dr", name: "DR" });
    await replay.pull(hub.url, mint("device-dr"));
    const entity = replay.entities().find((e) => e.entity_id === op.entity_id);
    expect(entity.dismissed).toBe(true);
    expect(entity.payload?.title).toBe("Dismissed note"); // content survived compaction
    replay.close();
    d.close();
  });

  test("purge removes content everywhere and leaves only the tombstone", async () => {
    const p = new SyncClient(join(temp, "purge", "client.db"), { deviceId: "device-p", name: "P" });
    const op = p.put("memory", { project: "shop", title: "To be purged", narrative: "sensitive content" });
    await p.push(hub.url, mint("device-p"));
    await p.pull(hub.url, mint("device-p2"));

    const purged = hub.store.purgeEntity(accountId, op.entity_id);
    expect(purged.purged).toBe(true);

    const other = new SyncClient(join(temp, "purge-other", "client.db"), { deviceId: "device-po", name: "PO" });
    await other.pull(hub.url, mint("device-po"));
    const entity = other.entities().find((e) => e.entity_id === op.entity_id);
    expect(entity.deleted).toBe(true);
    expect(entity.payload).toBeNull();
    // No op body on the hub still carries the purged content.
    const stored = hub.store.allOps(accountId).filter((stored) => stored.entity_id === op.entity_id);
    expect(stored.every((stored) => stored.op === "delete" || !stored.payload)).toBe(true);
    other.close();
    p.close();
  });
});
