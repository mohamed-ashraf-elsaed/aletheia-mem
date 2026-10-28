// Aletheia Sync core. A replicated, append-only operation log between devices through a self-hosted
// hub, with per-operation accept/reject so one bad op never rejects a batch. Tests use two temp data dirs
// (device A and device B) and one hub on a random loopback port; the kill -9 test spawns a real hub process.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SyncClient } from "../src/hub/sync/client.mjs";
import { SyncStore } from "../src/hub/sync/store.mjs";
import { startSyncServer } from "../src/hub/sync/server.mjs";
import { computeContentHash, entityIdFor, mergeOps, replicaContentHash } from "../src/hub/sync/engine.mjs";
import { removeDir } from "./temp-dirs.mjs";

const root = join(import.meta.dir, "..");
const temp = mkdtempSync(join(tmpdir(), "aletheia-sync-core-"));

let hub;
const dirA = join(temp, "a");
const dirB = join(temp, "b");
let a;
let b;
let tokenA;
let tokenB;

beforeAll(() => {
  hub = startSyncServer({ syncDb: join(temp, "hub", "sync.db"), host: "127.0.0.1", port: 0, name: "default" });
  const accountId = hub.store.ensureAccount("default").id;
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

const push = (url, token, ops) => fetch(`${url}/v1/sync/push`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Device-Id": "device-a", "X-Device-Name": "A" },
  body: JSON.stringify({ ops }),
});
const pull = (url, token, since = 0) => fetch(`${url}/v1/sync/pull?since=${since}`, { headers: { Authorization: `Bearer ${token}`, "X-Device-Id": "device-b", "X-Device-Name": "B" } });

describe("replicated log with per-operation results", () => {
  test("(a) A writes, B pulls, same rows", async () => {
    const before = a.outbox().length;
    a.put("memory", { project: "shop", title: "Retry policy", narrative: "Payment retries use exponential backoff and jitter" });
    a.put("fact", { project: "shop", subject: "checkout", predicate: "uses", object: "Postgres 16" });
    expect(a.outbox().length).toBe(before + 2);

    await a.push(hub.url, tokenA);
    await b.pull(hub.url, tokenB);

    expect(b.entities().length).toBe(a.entities().length);
    expect(b.contentHash()).toBe(a.contentHash());
    expect(b.entities().some((e) => e.payload?.title === "Retry policy")).toBe(true);
  });

  test("(b) both write offline, both sync, converge to identical content hash", async () => {
    a.put("memory", { project: "shop", title: "A only", narrative: "written on A offline" });
    b.put("memory", { project: "shop", title: "B only", narrative: "written on B offline" });

    await a.push(hub.url, tokenA);
    await b.push(hub.url, tokenB);
    await a.pull(hub.url, tokenA);
    await b.pull(hub.url, tokenB);

    expect(a.contentHash()).toBe(b.contentHash());
    expect(a.entities().length).toBe(b.entities().length);
  });

  test("(c) a batch with one malformed op returns per-op results and applies the rest", async () => {
    const good1 = a.put("memory", { project: "shop", title: "Good one", narrative: "kept" });
    const good2 = a.put("memory", { project: "shop", title: "Good two", narrative: "also kept" });
    const malformed = { ...good1, content_hash: "0".repeat(64) }; // hash no longer matches

    const response = await push(hub.url, tokenA, [good1, malformed, good2]);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.results.map((r) => r.status)).toEqual(["applied", "rejected", "applied"]);
    expect(data.results[1].reason).toContain("content_hash");

    // The two valid ops are on the hub; the malformed one is not.
    const sync = new SyncClient(join(temp, "c", "client.db"), { deviceId: "device-c", name: "C" });
    await sync.pull(hub.url, hub.store.mintToken(1, { scope: "sync", deviceId: "device-c" }).token);
    expect(sync.entities().some((e) => e.payload?.title === "Good one")).toBe(true);
    expect(sync.entities().some((e) => e.payload?.title === "Good two")).toBe(true);
    sync.close();
  });

  test("(d) replay of the same batch changes nothing", async () => {
    const op = a.put("memory", { project: "shop", title: "Replay target", narrative: "stored once" });
    const first = await (await push(hub.url, tokenA, [op])).json();
    const second = await (await push(hub.url, tokenA, [op])).json();
    expect(second.results[0].status).toBe("duplicate");
    expect(second.head_seq).toBe(first.head_seq);
    const count = hub.store.db.prepare("SELECT COUNT(*) AS n FROM sync_op WHERE entity_id = ?").get(op.entity_id).n;
    expect(count).toBe(1);
  });

  test("conflict rules: facts are append-only, edits are last-writer-wins by (hlc, device_id), supersedes union", () => {
    const factA = { device_id: "device-a", seq: 1, hlc: 1, entity_type: "fact", entity_id: "f1", op: "put", payload: { subject: "a" }, supersedes: null, content_hash: null };
    const factB = { device_id: "device-b", seq: 1, hlc: 1, entity_type: "fact", entity_id: "f2", op: "put", payload: { subject: "b" }, supersedes: null, content_hash: null };
    factA.content_hash = computeContentHash(factA);
    factB.content_hash = computeContentHash(factB);
    const merged = mergeOps([], [factA, factB]);
    expect(merged.length).toBe(2); // distinct facts coexist

    const editOld = { device_id: "device-a", seq: 1, hlc: 1, entity_type: "memory", entity_id: "m1", op: "put", payload: { title: "old" }, supersedes: null, content_hash: null };
    const editNew = { device_id: "device-b", seq: 2, hlc: 2, entity_type: "memory", entity_id: "m1", op: "put", payload: { title: "new" }, supersedes: null, content_hash: null };
    editOld.content_hash = computeContentHash(editOld);
    editNew.content_hash = computeContentHash(editNew);
    const winner = mergeOps([], [editOld, editNew])[0];
    expect(winner.payload.title).toBe("new");

    const s1 = { device_id: "device-a", seq: 1, hlc: 1, entity_type: "fact", entity_id: "f3", op: "put", payload: { x: 1 }, supersedes: ["a", "b"], content_hash: null };
    const s2 = { device_id: "device-b", seq: 2, hlc: 1, entity_type: "fact", entity_id: "f3", op: "put", payload: { x: 2 }, supersedes: ["b", "c"], content_hash: null };
    s1.content_hash = computeContentHash(s1);
    s2.content_hash = computeContentHash(s2);
    const fact = mergeOps([], [s1, s2]).find((e) => e.entity_id === "f3");
    expect(fact.supersedes).toEqual(["a", "b", "c"]);
  });

  test("redaction runs before any operation leaves the machine", async () => {
    const c = new SyncClient(join(temp, "redact", "client.db"), { deviceId: "device-r", name: "R" });
    c.put("memory", { project: "shop", title: "Secret note", narrative: "The key is sk-ant-abcdefghijklmnopqrstuvwxyz and Authorization: Bearer abcdefghijklmnop" });
    const op = c.outbox()[0];
    expect(op.payload.narrative).not.toContain("sk-ant-");
    expect(op.payload.narrative).not.toContain("Bearer abcdef");
    await c.push(hub.url, hub.store.mintToken(1, { scope: "sync", deviceId: "device-r" }).token);
    const body = hub.store.allOps(1).find((stored) => stored.entity_id === op.entity_id);
    expect(body.payload.narrative).not.toContain("sk-ant-");
    expect(body.payload.narrative).not.toContain("Bearer abcdef");
    c.close();
  });

  test("folder transport exports and imports signed op files that converge", () => {
    const exporter = new SyncClient(join(temp, "folder-a", "client.db"), { deviceId: "device-fa", name: "FA" });
    exporter.put("memory", { project: "shop", title: "Via folder", narrative: "moved through a shared folder" });
    const dir = join(temp, "folder-export");
    const result = exporter.exportFolder(dir, "shared-signing-key");
    expect(result.ops).toBeGreaterThan(0);

    const importer = new SyncClient(join(temp, "folder-b", "client.db"), { deviceId: "device-fb", name: "FB" });
    const imported = importer.importFolder(dir, "shared-signing-key");
    expect(imported.applied).toBe(result.ops);
    expect(importer.contentHash()).toBe(exporter.contentHash());
    exporter.close();
    importer.close();
  });
});

describe("crash safety", () => {
  test("(e) kill -9 mid-push, restart, no loss and no duplicates", async () => {
    const dir = join(temp, "kill");
    const port = 30000 + Math.floor(Math.random() * 20000);
    const syncDb = join(dir, "sync.db");
    const url = `http://127.0.0.1:${port}`;
    const spawn = () => Bun.spawn([process.execPath, join(root, "bin", "aletheia-sync.mjs"), "--port", String(port), "--db", syncDb, "--name", "default"], {
      cwd: root, stdout: "pipe", stderr: "pipe", env: { ...process.env },
    });
    const waitHealthy = async () => {
      for (let i = 0; i < 200; i++) {
        try { if ((await fetch(`${url}/healthz`)).ok) return; } catch { /* not up yet */ }
        await Bun.sleep(25);
      }
    };

    let proc = spawn();
    await waitHealthy();
    const token = mintTokenFromFile(syncDb, "device-k");

    const client = new SyncClient(join(dir, "client.db"), { deviceId: "device-k", name: "K" });
    client.put("memory", { project: "shop", title: "Before crash", narrative: "already pushed" });
    await client.push(url, token);

    // A crash mid-push leaves the next batch in the outbox with no ack. Simulate it: write the batch,
    // kill -9 the hub before it can ack, and restart on the same file.
    client.put("memory", { project: "shop", title: "During crash", narrative: "the batch in flight" });
    client.put("memory", { project: "shop", title: "During crash two", narrative: "same batch" });
    expect(client.outbox().length).toBe(2);
    proc.kill();
    await proc.exited.catch(() => {});
    expect(client.outbox().length).toBe(2); // nothing was acked

    proc = spawn();
    await waitHealthy();

    const pushed = await client.push(url, token);
    expect(pushed.pushed).toBe(2); // no loss: the unacked batch reached the hub
    expect(client.outbox().length).toBe(0);

    // No duplicates: a raw replay of the already-applied ops is answered as duplicate and the count is exact.
    const replay = await fetch(`${url}/v1/sync/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Device-Id": "device-k", "X-Device-Name": "K" },
      body: JSON.stringify({ ops: [client.allOps()[0], client.allOps()[1], client.allOps()[2]] }),
    });
    const replayData = await replay.json();
    expect(replayData.results.map((r) => r.status)).toEqual(["duplicate", "duplicate", "duplicate"]);
    expect(hubStoreOpCount(syncDb)).toBe(3);

    const other = new SyncClient(join(dir, "other.db"), { deviceId: "device-k2", name: "K2" });
    const otherToken = mintTokenFromFile(syncDb, "device-k2");
    await other.pull(url, otherToken);
    expect(other.entities().length).toBe(3);
    expect(other.entities().some((e) => e.payload?.title === "Before crash")).toBe(true);
    expect(other.entities().some((e) => e.payload?.title === "During crash")).toBe(true);
    other.close();
    client.close();
    proc.kill();
    await proc.exited.catch(() => {});
  });
});

function mintTokenFromFile(syncDb, deviceId) {
  const store = new SyncStore(syncDb);
  try {
    store.ensureAccount("default");
    return store.mintToken(1, { scope: "sync", deviceId, name: deviceId }).token;
  } finally {
    store.close();
  }
}

function hubStoreOpCount(syncDb) {
  const store = new SyncStore(syncDb);
  try {
    return store.db.prepare("SELECT COUNT(*) AS n FROM sync_op").get().n;
  } finally {
    store.close();
  }
}
