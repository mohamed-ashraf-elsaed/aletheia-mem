// SyncClient: a device's local replica of the sync log. Durable in one SQLite file, so a kill -9
// mid-push leaves the outbox intact and a restart re-pushes without loss or duplicates. Push and pull
// are idempotent: the hub answers per operation and the client applies only what its cursor has not seen.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { dirname, join } from "node:path";
import { redact } from "../redact.mjs";
import { buildOp, canonicalOp, computeContentHash, hashSync, mergeOps, redactValue, replicaContentHash, stableStringify } from "./engine.mjs";
import { decryptPayload, deriveKek, encryptPayload, isEnvelope, unwrapKey } from "./e2ee.mjs";

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

  // ---- end-to-end encryption (T-117) -------------------------------------------------------------

  /** The local keyring: kid -> data key (base64). The device already holds the plaintext replica. */
  keyRing() {
    return this.meta("e2ee_keys", {});
  }

  dataKey(kid) {
    const key = this.keyRing()[String(kid)];
    return key ? Buffer.from(key, "base64") : null;
  }

  /** Fetch the account's wrapped keys and unwrap them with the passphrase. A wrong passphrase throws. */
  async unlockE2ee({ url, token, passphrase, fetchImpl = fetch } = {}) {
    const response = await fetchImpl(`${url}/v1/sync/e2ee`, { headers: { Authorization: `Bearer ${token}`, "X-Device-Id": this.deviceId } });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`could not read the E2EE keys: ${response.status} ${detail.slice(0, 200)}`);
    }
    const data = await response.json();
    if (!data.enabled) {
      this.setMeta("e2ee_enabled", false);
      this.setMeta("e2ee_account", false);
      return { enabled: false };
    }
    const ring = {};
    for (const key of data.keys ?? []) {
      try {
        ring[String(key.kid)] = unwrapKey(key.wrappedKey, deriveKek(passphrase, key.salt, key.params)).toString("base64");
      } catch {
        throw new Error("Wrong passphrase.");
      }
    }
    this.setMeta("e2ee_keys", ring);
    this.setMeta("e2ee_current_kid", Number(data.currentKid) || 0);
    this.setMeta("e2ee_enabled", true);
    this.setMeta("e2ee_account", true);
    return { enabled: true, kid: data.currentKid };
  }

  /** Import an exported recovery key file (the keyring itself). */
  importRecoveryKey(text) {
    const parsed = JSON.parse(String(text));
    if (parsed.version !== 1 || !parsed.keys || typeof parsed.keys !== "object") throw new Error("That file is not an Aletheia recovery key.");
    const ring = {};
    for (const [kid, key] of Object.entries(parsed.keys)) {
      const buffer = Buffer.from(String(key), "base64");
      if (buffer.length !== 32) throw new Error("That file is not an Aletheia recovery key.");
      ring[kid] = buffer.toString("base64");
    }
    this.setMeta("e2ee_keys", ring);
    this.setMeta("e2ee_current_kid", Number(parsed.currentKid) || Math.max(0, ...Object.keys(ring).map(Number)));
    this.setMeta("e2ee_enabled", true);
    this.setMeta("e2ee_account", true);
    return { imported: Object.keys(ring).length };
  }

  /** The recovery key file content: the device's keyring. Losing this and the passphrase loses the data. */
  exportRecoveryKey() {
    return JSON.stringify({ version: 1, currentKid: this.meta("e2ee_current_kid", 0), keys: this.keyRing() }, null, 2);
  }

  /** The AAD that binds a ciphertext to its op: the canonical op minus payload and content_hash. */
  e2eeAad(op) {
    const { payload, content_hash, ...base } = op ?? {};
    return canonicalOp(base);
  }

  /** Encrypt a payload for the local outbox, or return it unchanged when E2EE is off. */
  sealPayload(payload, { seq, hlc, entityType, entityId, op, supersedes }) {
    if (payload == null || !this.meta("e2ee_enabled")) return payload;
    const kid = this.meta("e2ee_current_kid", 0);
    const key = this.dataKey(kid);
    if (!key) throw new Error("This device has no E2EE key. Run: aletheia sync unlock-e2ee --passphrase <p>");
    const base = { device_id: this.deviceId, seq, hlc, entity_type: entityType, entity_id: entityId, op, supersedes: supersedes ?? null };
    return encryptPayload(Buffer.from(stableStringify(payload), "utf8"), key, this.e2eeAad(base), kid);
  }

  /** Store one op as local and put it in the outbox. Redaction runs here, then E2EE sealing, before anything leaves. */
  writeLocal({ entityType, entityId, op, payload = null, supersedes = null }) {
    const { seq, hlc } = this.nextClock();
    const redacted = payload == null ? null : redactValue(payload, redact);
    let sealed = redacted;
    if (redacted != null) {
      if (this.meta("e2ee_enabled")) {
        sealed = this.sealPayload(redacted, { seq, hlc, entityType, entityId, op, supersedes });
      } else if (this.meta("e2ee_account") && op === "put") {
        throw new Error("This sync account is E2EE but this device has no key. Run: aletheia sync unlock-e2ee --passphrase <p>");
      }
    }
    const built = buildOp({ deviceId: this.deviceId, seq, hlc, entityType, entityId, op, payload: sealed, supersedes });
    this.db.prepare("INSERT INTO sync_op (device_id, seq, hlc, entity_type, entity_id, kind, payload, supersedes, content_hash, source, acked) VALUES (?,?,?,?,?,?,?,?,?,'local',0)")
      .run(this.deviceId, seq, hlc, entityType, entityId, op, sealed == null ? null : stableStringify(sealed), supersedes ? JSON.stringify(supersedes) : null, built.content_hash);
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

  /** Re-bootstrap this device from a hub snapshot (self-contained heads). */
  applySnapshot(snapshot) {
    let applied = 0;
    for (const entity of snapshot?.entities ?? []) {
      const op = { device_id: entity.device_id, seq: entity.device_seq, hlc: entity.hlc, entity_type: entity.entity_type, entity_id: entity.entity_id, op: entity.op, payload: entity.payload ?? null, supersedes: entity.supersedes ?? null, content_hash: entity.content_hash };
      if (this.applyRemote(op)) applied++;
    }
    if (snapshot?.epoch != null) this.setMeta("epoch", snapshot.epoch);
    this.setCursor(snapshot?.head_seq ?? 0);
    return { applied, head_seq: snapshot?.head_seq ?? 0 };
  }

  outbox() {
    return this.db.prepare("SELECT * FROM sync_op WHERE source = 'local' AND acked = 0 ORDER BY seq ASC").all().map((row) => this.toOp(row, { decrypt: false }));
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

  toOp(row, { decrypt = true } = {}) {
    let payload = row.payload == null ? null : JSON.parse(row.payload);
    if (decrypt && payload != null && isEnvelope(payload) && this.meta("e2ee_enabled")) {
      const key = this.dataKey(payload.kid);
      if (key) {
        try {
          payload = JSON.parse(decryptPayload(payload, key, this.e2eeAad({ device_id: row.device_id, seq: row.seq, hlc: row.hlc, entity_type: row.entity_type, entity_id: row.entity_id, op: row.kind, supersedes: row.supersedes ? JSON.parse(row.supersedes) : null })));
        } catch {
          throw new Error(`The ciphertext for ${row.entity_type} ${row.entity_id} does not verify (wrong key or tampered).`);
        }
      }
    }
    return {
      device_id: row.device_id,
      seq: row.seq,
      hlc: row.hlc,
      entity_type: row.entity_type,
      entity_id: row.entity_id,
      op: row.kind,
      payload,
      supersedes: row.supersedes ? JSON.parse(row.supersedes) : null,
      content_hash: row.content_hash,
    };
  }

  contentHash() {
    return replicaContentHash(this.entities());
  }

  async push(url, token, { fetchImpl = fetch } = {}) {
    let ops = this.outbox();
    if (!ops.length) return { pushed: 0, head_seq: this.cursor() };
    // E2EE: an op that was queued before the device unlocked must be sealed before it leaves; a plaintext
    // op on an E2EE account is refused instead of leaked.
    if (this.meta("e2ee_account")) {
      if (!this.meta("e2ee_enabled")) throw new Error("This sync account is E2EE but this device has no key. Run: aletheia sync unlock-e2ee --passphrase <p>");
      const kid = this.meta("e2ee_current_kid", 0);
      const key = this.dataKey(kid);
      ops = ops.map((op) => {
        if (op.op !== "put" || op.payload == null || isEnvelope(op.payload)) return op;
        if (!key) throw new Error("This device has no E2EE key. Run: aletheia sync unlock-e2ee --passphrase <p>");
        const base = { device_id: op.device_id, seq: op.seq, hlc: op.hlc, entity_type: op.entity_type, entity_id: op.entity_id, op: op.op, supersedes: op.supersedes ?? null };
        const envelope = encryptPayload(Buffer.from(stableStringify(op.payload), "utf8"), key, this.e2eeAad(base), kid);
        const updated = { ...op, payload: envelope, content_hash: computeContentHash({ ...op, payload: envelope }) };
        this.db.prepare("UPDATE sync_op SET payload = ?, content_hash = ? WHERE device_id = ? AND seq = ?").run(stableStringify(envelope), updated.content_hash, this.deviceId, op.seq);
        return updated;
      });
    }
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
    if (typeof data.e2ee === "boolean") this.setMeta("e2ee_account", data.e2ee);
    for (const op of data.ops ?? []) this.applyRemote(op);
    this.setCursor(data.head_seq);
    return { pulled: (data.ops ?? []).length, head_seq: data.head_seq, epoch: data.epoch, snapshot_required: !!data.snapshot_required, e2ee: !!data.e2ee };
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
