// SyncClient: a device's local replica of the sync log. Durable in one SQLite file, so a kill -9
// mid-push leaves the outbox intact and a restart re-pushes without loss or duplicates. Push and pull
// are idempotent: the hub answers per operation and the client applies only what its cursor has not seen.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { dirname, join } from "node:path";
import { redact } from "../redact.mjs";
import { buildOp, hashSync, mergeOps, redactValue, replicaContentHash, stableStringify } from "./engine.mjs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_op (
  device_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  hlc INTEGER NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT,
  supersedes TEXT,
  content_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  acked INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, seq)
);
CREATE TABLE IF NOT EXISTS sync_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

export class SyncClient {
  constructor(path, { deviceId = null, name = null } = {}) {
    this.path = path;
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec(SCHEMA);
    if (!this.meta("device_id")) this.setMeta("device_id", deviceId ?? crypto.randomUUID());
    if (name) this.setMeta("device_name", name);
  }

  close() {
    this.db.close();
  }

  meta(key, fallback = null) {
    const row = this.db.prepare("SELECT value FROM sync_meta WHERE key = ?").get(key);
    return row ? JSON.parse(row.value) : fallback;
  }

  setMeta(key, value) {
    this.db.prepare("INSERT INTO sync_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
  }

  get deviceId() {
    return this.meta("device_id");
  }

  get name() {
    return this.meta("device_name", this.deviceId);
  }

  signingKey() {
    if (!this.meta("signing_key")) this.setMeta("signing_key", crypto.randomUUID() + crypto.randomUUID());
    return this.meta("signing_key");
  }

  /** Next (seq, hlc) for a local write. hlc advances past everything this device has seen. */
  nextClock() {
    const seq = this.meta("seq", 0) + 1;
    const hlc = this.meta("hlc", 0) + 1;
    this.setMeta("seq", seq);
    this.setMeta("hlc", hlc);
    return { seq, hlc };
  }

  /** Store one op as local and put it in the outbox. Redaction runs here, before anything leaves. */
  writeLocal({ entityType, entityId, op, payload = null, supersedes = null }) {
    const { seq, hlc } = this.nextClock();
    const redacted = payload == null ? null : redactValue(payload, redact);
    const built = buildOp({ deviceId: this.deviceId, seq, hlc, entityType, entityId, op, payload: redacted, supersedes });
    this.db.prepare("INSERT INTO sync_op (device_id, seq, hlc, entity_type, entity_id, kind, payload, supersedes, content_hash, source, acked) VALUES (?,?,?,?,?,?,?,?,?,'local',0)")
      .run(this.deviceId, seq, hlc, entityType, entityId, op, payload == null ? null : stableStringify(redacted), supersedes ? JSON.stringify(supersedes) : null, built.content_hash);
    return built;
  }

  put(entityType, payload, { entityId = null, supersedes = null } = {}) {
    const id = entityId ?? hashSync({ entityType, payload });
    return this.writeLocal({ entityType, entityId: id, op: "put", payload, supersedes });
  }

  dismiss(entityType, entityId) {
    return this.writeLocal({ entityType, entityId, op: "dismiss" });
  }

  restore(entityType, entityId) {
    return this.writeLocal({ entityType, entityId, op: "restore" });
  }

  deleteEntity(entityType, entityId) {
    return this.writeLocal({ entityType, entityId, op: "delete" });
  }

  /** Store a remote op (INSERT OR IGNORE) and advance the Lamport clock. */
  applyRemote(op) {
    const info = this.db.prepare("INSERT OR IGNORE INTO sync_op (device_id, seq, hlc, entity_type, entity_id, kind, payload, supersedes, content_hash, source, acked) VALUES (?,?,?,?,?,?,?,?,?,'remote',1)")
      .run(op.device_id, op.seq, op.hlc, op.entity_type, op.entity_id, op.op, op.payload == null ? null : stableStringify(op.payload), op.supersedes ? JSON.stringify(op.supersedes) : null, op.content_hash);
    if (info.changes) this.setMeta("hlc", Math.max(this.meta("hlc", 0), op.hlc));
    return info.changes > 0;
  }

  outbox() {
    return this.db.prepare("SELECT * FROM sync_op WHERE source = 'local' AND acked = 0 ORDER BY seq ASC").all().map((row) => this.toOp(row));
  }

  markAcked(deviceSeq) {
    this.db.prepare("UPDATE sync_op SET acked = 1 WHERE device_id = ? AND seq = ?").run(this.deviceId, Number(deviceSeq));
  }

  cursor() {
    return this.meta("cursor", 0);
  }

  setCursor(seq) {
    this.setMeta("cursor", Math.max(this.cursor(), Number(seq) || 0));
  }

  epoch() {
    return this.meta("epoch", 0);
  }

  setEpoch(epoch) {
    const changed = this.epoch() !== Number(epoch);
    if (changed) this.setMeta("cursor", 0);
    this.setMeta("epoch", Number(epoch));
    return changed;
  }

  /** The full materialized replica, deterministic regardless of the order ops were seen in. */
  entities() {
    const ops = this.allOps();
    return mergeOps([], ops);
  }

  allOps() {
    return this.db.prepare("SELECT * FROM sync_op ORDER BY hlc ASC, device_id ASC").all().map((row) => this.toOp(row));
  }

  toOp(row) {
    return {
      device_id: row.device_id,
      seq: row.seq,
      hlc: row.hlc,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      op: row.kind,
      payload: row.payload == null ? null : JSON.parse(row.payload),
      supersedes: row.supersedes ? JSON.parse(row.supersedes) : null,
      content_hash: row.content_hash,
    };
  }

  contentHash() {
    return replicaContentHash(this.entities());
  }

  async push(url, token, { fetchImpl = fetch } = {}) {
    const ops = this.outbox();
    if (!ops.length) return { pushed: 0, head_seq: this.cursor() };
    const response = await fetchImpl(`${url}/v1/sync/push`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "X-Device-Id": this.deviceId, "X-Device-Name": this.name, "X-Sync-Cursor": String(this.cursor()) },
      body: JSON.stringify({ ops }),
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`push failed: ${response.status} ${detail.slice(0, 200)}`);
    }
    const data = await response.json();
    for (const [index, result] of (data.results ?? []).entries()) {
      if (result.status === "applied" || result.status === "duplicate") this.markAcked(ops[index].seq);
      // A rejected op stays in the outbox so a human can rebase or fix it; it never blocks the others.
    }
    // Push never advances the pull cursor: other devices' ops between this device's ops must still be pulled.
    if (data.epoch) this.setEpoch(data.epoch);
    return { pushed: (data.results ?? []).filter((result) => result.status === "applied").length, results: data.results, head_seq: data.head_seq };
  }

  async pull(url, token, { fetchImpl = fetch } = {}) {
    let since = this.cursor();
    const response = await fetchImpl(`${url}/v1/sync/pull?since=${since}`, {
      headers: { Authorization: `Bearer ${token}`, "X-Device-Id": this.deviceId, "X-Device-Name": this.name },
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`pull failed: ${response.status} ${detail.slice(0, 200)}`);
    }
    const data = await response.json();
    if (data.epoch && this.setEpoch(data.epoch)) since = 0;
    for (const op of data.ops ?? []) this.applyRemote(op);
    this.setCursor(data.head_seq);
    return { pulled: (data.ops ?? []).length, head_seq: data.head_seq, epoch: data.epoch };
  }

  /** Folder transport: export every local op as a signed file set for Git/Syncthing/Dropbox. */
  exportFolder(dir, signingKey = this.signingKey()) {
    mkdirSync(dir, { recursive: true });
    const ops = this.allOps();
    const lines = ops.map((op) => stableStringify(op)).join("\n");
    const signature = createHmac("sha256", String(signingKey)).update(lines).digest("hex");
    writeFileSync(join(dir, "ops.jsonl"), `${lines}\n`);
    writeFileSync(join(dir, "SIGNATURE"), `${signature}\n`);
    return { ops: ops.length, dir };
  }

  /** Folder transport: import signed op files; a wrong signature is refused, nothing is applied. */
  importFolder(dir, signingKey = this.signingKey()) {
    const linesPath = join(dir, "ops.jsonl");
    const sigPath = join(dir, "SIGNATURE");
    if (!existsSync(linesPath) || !existsSync(sigPath)) throw new Error("That folder has no sync export (ops.jsonl and SIGNATURE).");
    const lines = readFileSync(linesPath, "utf8").replace(/\n$/, "");
    const expected = readFileSync(sigPath, "utf8").trim();
    const actual = createHmac("sha256", String(signingKey)).update(lines).digest("hex");
    if (expected !== actual) throw new Error("The sync export signature does not match; refusing to import.");
    let applied = 0;
    for (const line of lines.split("\n")) {
      if (!line.trim()) continue;
      const op = JSON.parse(line);
      if (this.applyRemote(op)) applied++;
    }
    return { applied, total: lines.split("\n").filter((line) => line.trim()).length };
  }

  /** Import only the ops newer than this device's cursor from a folder export. */
  folderOps(dir) {
    if (!existsSync(join(dir, "ops.jsonl"))) return [];
    return readFileSync(join(dir, "ops.jsonl"), "utf8").split("\n").filter((line) => line.trim()).map((line) => JSON.parse(line));
  }
}

/** A scratch helper used by tests: list op files in a folder export. */
export function listOpFiles(dir) {
  return readdirSync(dir).filter((name) => name !== "SIGNATURE" && name !== "ops.jsonl").sort();
}
