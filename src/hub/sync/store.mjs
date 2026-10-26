// SyncStore: the hub's side of Aletheia Sync. One SQLite file (sync.db) that holds the append-only
// operation log, device registry, token hashes, one-time pairing codes, quotas and an append-only audit
// table. Tokens are 256-bit random values; only their sha256 is stored.
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { computeContentHash, compareOps, hashSync, stableStringify, validateOp } from "./engine.mjs";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sync_account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  epoch INTEGER NOT NULL DEFAULT 1,
  head_seq INTEGER NOT NULL DEFAULT 0,
  min_seq INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_device (
  account_id INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  last_ack_seq INTEGER NOT NULL DEFAULT 0,
  last_seen INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, device_id)
);
CREATE TABLE IF NOT EXISTS sync_token (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  scope TEXT NOT NULL,
  token_sha256 TEXT NOT NULL UNIQUE,
  device_id TEXT,
  name TEXT,
  projects TEXT NOT NULL DEFAULT '[]',
  ops_per_day INTEGER,
  bytes_per_day INTEGER,
  expires_at INTEGER,
  revoked_at INTEGER,
  last_used_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS pair_code (
  code_sha256 TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_op (
  account_id INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  epoch INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL,
  hlc INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  body TEXT NOT NULL,
  deleted INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, seq)
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_op_device ON sync_op(account_id, device_id, device_seq);
CREATE INDEX IF NOT EXISTS idx_sync_op_entity ON sync_op(account_id, entity_id, seq);
CREATE TABLE IF NOT EXISTS sync_head (
  account_id INTEGER NOT NULL,
  entity_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  hlc INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  device_seq INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  deleted INTEGER NOT NULL,
  seq INTEGER NOT NULL,
  supersedes TEXT NOT NULL DEFAULT '[]',
  payload TEXT,
  PRIMARY KEY (account_id, entity_id)
);
CREATE TABLE IF NOT EXISTS sync_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  token_id INTEGER,
  device_id TEXT,
  action TEXT NOT NULL,
  detail TEXT,
  result TEXT,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sync_usage (
  token_id INTEGER NOT NULL,
  day TEXT NOT NULL,
  ops INTEGER NOT NULL DEFAULT 0,
  bytes INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (token_id, day)
);
`;

const parse = (value, fallback) => {
  if (value == null || value === "") return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export function randomHex(bytes = 32) {
  const array = new Uint8Array(bytes);
  crypto.getRandomValues(array);
  return [...array].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two equal-length hex strings. */
export function safeEqualHex(a, b) {
  const left = String(a ?? "");
  const right = String(b ?? "");
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let i = 0; i < left.length; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

export class SyncStore {
  constructor(path) {
    this.path = path;
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.db.exec("PRAGMA foreign_keys = ON");
    this.db.exec(SCHEMA);
    this.ensureSyncColumns();
  }

  /** Additive columns for databases created before they existed. */
  ensureSyncColumns() {
    const accountColumns = this.db.prepare("PRAGMA table_info(sync_account)").all().map((column) => column.name);
    if (!accountColumns.includes("min_seq")) this.db.exec("ALTER TABLE sync_account ADD COLUMN min_seq INTEGER NOT NULL DEFAULT 0");
    const headColumns = this.db.prepare("PRAGMA table_info(sync_head)").all().map((column) => column.name);
    if (!headColumns.includes("payload")) this.db.exec("ALTER TABLE sync_head ADD COLUMN payload TEXT");
    if (!headColumns.includes("device_seq")) this.db.exec("ALTER TABLE sync_head ADD COLUMN device_seq INTEGER NOT NULL DEFAULT 0");
  }

  close() {
    this.db.close();
  }

  // ---- accounts ---------------------------------------------------------------------------------

  ensureAccount(name = "default") {
    const existing = this.db.prepare("SELECT * FROM sync_account WHERE name = ?").get(name);
    if (existing) return existing;
    const info = this.db.prepare("INSERT INTO sync_account (name, epoch, head_seq, created_at) VALUES (?,1,0,?)").run(name, Date.now());
    return this.db.prepare("SELECT * FROM sync_account WHERE id = ?").get(Number(info.lastInsertRowid));
  }

  accountById(id) {
    return this.db.prepare("SELECT * FROM sync_account WHERE id = ?").get(Number(id));
  }

  // ---- devices ----------------------------------------------------------------------------------

  upsertDevice(accountId, deviceId, name) {
    this.db.prepare("INSERT INTO sync_device (account_id, device_id, name, last_ack_seq, last_seen, created_at) VALUES (?,?,?,0,?,?) ON CONFLICT(account_id, device_id) DO UPDATE SET name = excluded.name, last_seen = excluded.last_seen, revoked_at = NULL")
      .run(Number(accountId), deviceId, name, Date.now(), Date.now());
    return this.device(accountId, deviceId);
  }

  device(accountId, deviceId) {
    return this.db.prepare("SELECT * FROM sync_device WHERE account_id = ? AND device_id = ?").get(Number(accountId), deviceId);
  }

  listDevices(accountId) {
    return this.db.prepare("SELECT * FROM sync_device WHERE account_id = ? ORDER BY created_at").all(Number(accountId)).map((device) => ({
      deviceId: device.device_id,
      name: device.name,
      lastAckSeq: device.last_ack_seq,
      lastSeen: device.last_seen,
      revoked: !!device.revoked_at,
      createdAt: device.created_at,
    }));
  }

  revokeDevice(accountId, deviceId) {
    const info = this.db.prepare("UPDATE sync_device SET revoked_at = ? WHERE account_id = ? AND device_id = ?").run(Date.now(), Number(accountId), deviceId);
    this.db.prepare("UPDATE sync_token SET revoked_at = ? WHERE account_id = ? AND device_id = ? AND revoked_at IS NULL").run(Date.now(), Number(accountId), deviceId);
    return info.changes > 0;
  }

  ackDevice(accountId, deviceId, seq) {
    this.db.prepare("UPDATE sync_device SET last_ack_seq = max(last_ack_seq, ?), last_seen = ? WHERE account_id = ? AND device_id = ?").run(Number(seq) || 0, Date.now(), Number(accountId), deviceId);
  }

  // ---- tokens -----------------------------------------------------------------------------------

  mintToken(accountId, { scope = "sync", deviceId = null, name = null, projects = [], opsPerDay = null, bytesPerDay = null, expiresAt = null } = {}) {
    const raw = randomHex(32);
    const tokenSha = hashSync(raw);
    const info = this.db.prepare("INSERT INTO sync_token (account_id, scope, token_sha256, device_id, name, projects, ops_per_day, bytes_per_day, expires_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(Number(accountId), scope, tokenSha, deviceId, name, JSON.stringify(projects ?? []), opsPerDay == null ? null : Number(opsPerDay), bytesPerDay == null ? null : Number(bytesPerDay), expiresAt == null ? null : Number(expiresAt), Date.now());
    return { id: Number(info.lastInsertRowid), token: raw, tokenSha, scope, deviceId, name, projects: projects ?? [] };
  }

  tokenByRaw(raw) {
    const sha = hashSync(raw);
    const row = this.db.prepare("SELECT * FROM sync_token WHERE token_sha256 = ?").get(sha);
    return row ? { ...row, tokenSha: sha, projects: parse(row.projects, []) } : null;
  }

  /** Constant-time token lookup: hash the raw token and compare to the stored hash. */
  findToken(raw) {
    const sha = hashSync(String(raw ?? ""));
    const rows = this.db.prepare("SELECT * FROM sync_token").all();
    for (const row of rows) {
      if (safeEqualHex(row.token_sha256, sha)) return { ...row, projects: parse(row.projects, []) };
    }
    return null;
  }

  revokeToken(accountId, tokenId) {
    const info = this.db.prepare("UPDATE sync_token SET revoked_at = ? WHERE account_id = ? AND id = ?").run(Date.now(), Number(accountId), Number(tokenId));
    return info.changes > 0;
  }

  listTokens(accountId) {
    return this.db.prepare("SELECT id, account_id, scope, device_id, name, projects, ops_per_day, bytes_per_day, expires_at, revoked_at, last_used_at, created_at FROM sync_token WHERE account_id = ? ORDER BY id").all(Number(accountId))
      .map((token) => ({ ...token, projects: parse(token.projects, []), token: null }));
  }

  touchToken(tokenId) {
    this.db.prepare("UPDATE sync_token SET last_used_at = ? WHERE id = ?").run(Date.now(), Number(tokenId));
  }

  // ---- pairing ----------------------------------------------------------------------------------

  createPairCode(accountId, { ttlMs = 10 * 60_000, code = null } = {}) {
    const raw = code ?? randomHex(4).slice(0, 8);
    const codeSha = hashSync(raw);
    this.db.prepare("INSERT INTO pair_code (code_sha256, account_id, expires_at, created_at) VALUES (?,?,?,?)").run(codeSha, Number(accountId), Date.now() + ttlMs, Date.now());
    return raw;
  }

  redeemPairCode(accountId, raw, { deviceId, name } = {}) {
    const codeSha = hashSync(String(raw ?? ""));
    const row = this.db.prepare("SELECT * FROM pair_code WHERE code_sha256 = ?").get(codeSha);
    if (!row) return { ok: false, status: 404, reason: "Unknown pairing code." };
    this.db.prepare("UPDATE pair_code SET attempts = attempts + 1 WHERE code_sha256 = ?").run(codeSha);
    if (row.used_at) return { ok: false, status: 403, reason: "That pairing code was already used." };
    if (row.expires_at < Date.now()) return { ok: false, status: 403, reason: "That pairing code has expired." };
    this.db.prepare("UPDATE pair_code SET used_at = ? WHERE code_sha256 = ?").run(Date.now(), codeSha);
    this.upsertDevice(accountId, deviceId, name);
    const token = this.mintToken(accountId, { scope: "sync", deviceId, name });
    this.audit(accountId, { tokenId: token.id, deviceId, action: "device.pair", result: "ok", detail: { deviceId, name } });
    return { ok: true, status: 200, token: token.token, deviceId };
  }

  /** Brute-force guard: at most 5 failed attempts across the recent window. */
  pairingAttempts(accountId, since = Date.now() - 60_000) {
    return this.db.prepare("SELECT COUNT(*) AS n FROM pair_code WHERE account_id = ? AND created_at > ? AND (used_at IS NOT NULL OR attempts > 0)").get(Number(accountId), since).n;
  }

  // ---- ops -------------------------------------------------------------------------------------

  /** Per-operation push. One malformed op is rejected; the rest still apply. Returns {results, head_seq, epoch}. */
  pushOps(accountId, ops, { actor = {} } = {}) {
    const account = this.accountById(accountId);
    let headSeq = account.head_seq;
    const results = [];
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const insertOp = this.db.prepare(`INSERT INTO sync_op (account_id, seq, epoch, entity_id, entity_type, kind, device_id, device_seq, hlc, content_hash, body, deleted, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`);
      const findHead = this.db.prepare("SELECT * FROM sync_head WHERE account_id = ? AND entity_id = ?");
      const upsertHead = this.db.prepare(`INSERT INTO sync_head (account_id, entity_id, entity_type, kind, hlc, device_id, device_seq, content_hash, deleted, seq, supersedes, payload) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(account_id, entity_id) DO UPDATE SET entity_type=excluded.entity_type, kind=excluded.kind, hlc=excluded.hlc, device_id=excluded.device_id, device_seq=excluded.device_seq, content_hash=excluded.content_hash, deleted=excluded.deleted, seq=excluded.seq, supersedes=excluded.supersedes, payload=excluded.payload`);
      for (const op of ops ?? []) {
        const check = validateOp(op);
        if (!check.ok) {
          results.push({ status: "rejected", reason: check.reason, entity_id: op?.entity_id ?? null });
          continue;
        }
        const existing = this.db.prepare("SELECT * FROM sync_op WHERE account_id = ? AND device_id = ? AND device_seq = ?").get(Number(accountId), op.device_id, op.seq);
        if (existing) {
          if (existing.content_hash === op.content_hash) results.push({ status: "duplicate", seq: existing.seq, entity_id: op.entity_id });
          else results.push({ status: "rejected", reason: "seq already used with different content", entity_id: op.entity_id });
          continue;
        }
        headSeq += 1;
        insertOp.run(Number(accountId), headSeq, account.epoch, op.entity_id, op.entity_type, op.op, op.device_id, op.seq, op.hlc, op.content_hash, stableStringify(op), op.op === "delete" ? 1 : 0, Date.now());
        const head = findHead.get(Number(accountId), op.entity_id);
        const supersedes = [...new Set([...(parse(head?.supersedes, [])), ...(op.supersedes ?? [])])];
        if (!head || compareOps(op, head) > 0) {
          const payload = op.op === "put" ? stableStringify(op.payload) : op.op === "delete" ? null : head?.payload ?? null;
          upsertHead.run(Number(accountId), op.entity_id, op.entity_type, op.op, op.hlc, op.device_id, op.seq, op.content_hash, op.op === "delete" ? 1 : 0, headSeq, JSON.stringify(supersedes), payload);
        } else if (op.supersedes?.length) {
          this.db.prepare("UPDATE sync_head SET supersedes = ? WHERE account_id = ? AND entity_id = ?").run(JSON.stringify(supersedes), Number(accountId), op.entity_id);
        }
        results.push({ status: "applied", seq: headSeq, entity_id: op.entity_id });
      }
      this.db.prepare("UPDATE sync_account SET head_seq = ? WHERE id = ?").run(headSeq, Number(accountId));
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    }
    this.audit(accountId, { tokenId: actor.tokenId ?? null, deviceId: actor.deviceId ?? null, action: "sync.push", result: "ok", detail: { applied: results.filter((r) => r.status === "applied").length, rejected: results.filter((r) => r.status === "rejected").length, duplicate: results.filter((r) => r.status === "duplicate").length } });
    this.recordUsage(accountId, actor.tokenId, ops, results);
    return { results, head_seq: headSeq, epoch: account.epoch };
  }

  /** Pull ops with seq > since. Returns {epoch, head_seq, ops, has_more, snapshot_required}. */
  pullOps(accountId, since = 0, { limit = 500 } = {}) {
    const account = this.accountById(accountId);
    const lim = Math.min(Math.max(Number(limit) || 500, 1), 1000);
    const sinceSeq = Number(since) || 0;
    const rows = this.db.prepare("SELECT * FROM sync_op WHERE account_id = ? AND seq > ? AND epoch = ? ORDER BY seq ASC LIMIT ?").all(Number(accountId), sinceSeq, account.epoch, lim);
    const ops = rows.filter((row) => row.body).map((row) => JSON.parse(row.body));
    const hasMore = rows.length === lim;
    // A cursor older than the oldest body we still serve must re-bootstrap from the snapshot.
    const snapshotRequired = sinceSeq < account.min_seq;
    return { epoch: account.epoch, head_seq: account.head_seq, ops, has_more: hasMore, snapshot_required: snapshotRequired };
  }

  status(accountId) {
    const account = this.accountById(accountId);
    return {
      epoch: account.epoch,
      headSeq: account.head_seq,
      devices: this.listDevices(accountId),
      deviceCount: this.db.prepare("SELECT COUNT(*) AS n FROM sync_device WHERE account_id = ? AND revoked_at IS NULL").get(Number(accountId)).n,
    };
  }

  /**
   * Snapshot of the winning state per entity, self-contained (payload included). A device whose cursor is
   * older than the retention window re-bootstraps from this instead of replaying the log.
   */
  snapshot(accountId) {
    const account = this.accountById(accountId);
    const heads = this.db.prepare("SELECT * FROM sync_head WHERE account_id = ? ORDER BY entity_id").all(Number(accountId)).map((head) => ({
      entity_id: head.entity_id,
      entity_type: head.entity_type,
      op: head.kind,
      hlc: head.hlc,
      device_id: head.device_id,
      device_seq: head.device_seq,
      content_hash: head.content_hash,
      deleted: !!head.deleted,
      supersedes: parse(head.supersedes, []),
      seq: head.seq,
      payload: head.payload == null ? null : JSON.parse(head.payload),
    }));
    return { epoch: account.epoch, head_seq: account.head_seq, entities: heads };
  }

  /**
   * Compaction: drop op bodies older than `retentionMs` that every non-revoked device has acked past
   * and that a newer head op superseded. The head op body is kept so snapshot recovery still works.
   */
  compact(accountId, { retentionMs = 30 * 24 * 60 * 60_000 } = {}) {
    const account = this.accountById(accountId);
    const devices = this.listDevices(accountId).filter((device) => !device.revoked);
    const safeSeq = devices.length ? Math.min(...devices.map((device) => device.lastAckSeq)) : account.head_seq;
    const cutoff = Date.now() - retentionMs;
    // Drop only bodies that a newer put or delete superseded. dismiss/restore heads keep their content bodies.
    const superseded = this.db.prepare(`
      SELECT op.seq FROM sync_op op
      JOIN sync_head head ON head.account_id = op.account_id AND head.entity_id = op.entity_id
      WHERE op.account_id = ? AND op.epoch = ? AND op.seq <= ? AND op.created_at < ? AND op.seq < head.seq
        AND head.kind IN ('put', 'delete')
    `).all(Number(accountId), account.epoch, safeSeq, cutoff).map((row) => row.seq);
    let dropped = 0;
    if (superseded.length) {
      const placeholders = superseded.map(() => "?").join(",");
      const info = this.db.prepare(`UPDATE sync_op SET body = '' WHERE account_id = ? AND seq IN (${placeholders})`).run(Number(accountId), ...superseded);
      dropped = info.changes;
    }
    this.db.prepare("UPDATE sync_account SET min_seq = ? WHERE id = ?").run(safeSeq, Number(accountId));
    this.audit(accountId, { action: "sync.compact", result: "ok", detail: { dropped, safeSeq, retentionMs } });
    return { dropped, safeSeq, retentionMs };
  }

  /** Purge one entity everywhere: write a tombstone head and drop every body for that entity. */
  purgeEntity(accountId, entityId, { actor = {} } = {}) {
    const account = this.accountById(accountId);
    const head = this.db.prepare("SELECT * FROM sync_head WHERE account_id = ? AND entity_id = ?").get(Number(accountId), entityId);
    if (!head) return { purged: false };
    let headSeq = account.head_seq;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.prepare("UPDATE sync_op SET body = '' WHERE account_id = ? AND entity_id = ?").run(Number(accountId), entityId);
      const tombstone = { device_id: "server", seq: 0, hlc: Number(head.hlc) + 1, entity_type: head.entity_type, entity_id: entityId, op: "delete", payload: null, supersedes: null, content_hash: null };
      tombstone.content_hash = computeContentHash(tombstone);
      headSeq += 1;
      this.db.prepare("INSERT INTO sync_op (account_id, seq, epoch, entity_id, entity_type, kind, device_id, device_seq, hlc, content_hash, body, deleted, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)")
        .run(Number(accountId), headSeq, account.epoch, entityId, head.entity_type, "delete", "server", 0, tombstone.hlc, tombstone.content_hash, stableStringify(tombstone), 1, Date.now());
      this.db.prepare("UPDATE sync_head SET kind='delete', hlc=?, device_id='server', content_hash=?, deleted=1, seq=?, supersedes=? WHERE account_id = ? AND entity_id = ?")
        .run(tombstone.hlc, tombstone.content_hash, headSeq, head.supersedes, Number(accountId), entityId);
      this.db.prepare("UPDATE sync_account SET head_seq = ? WHERE id = ?").run(headSeq, Number(accountId));
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    }
    this.audit(accountId, { tokenId: actor.tokenId ?? null, deviceId: actor.deviceId ?? null, action: "sync.purge", result: "ok", detail: { entityId } });
    return { purged: true, head_seq: headSeq, epoch: account.epoch };
  }

  // ---- quotas and audit -------------------------------------------------------------------------

  recordUsage(accountId, tokenId, ops, results) {
    if (!tokenId) return;
    const applied = results.filter((result) => result.status === "applied");
    if (!applied.length) return;
    const day = new Date().toISOString().slice(0, 10);
    const bytes = applied.reduce((sum, _, index) => sum + Buffer.byteLength(stableStringify(ops[index] ?? {})), 0);
    this.db.prepare("INSERT INTO sync_usage (token_id, day, ops, bytes) VALUES (?,?,?,?) ON CONFLICT(token_id, day) DO UPDATE SET ops = ops + excluded.ops, bytes = bytes + excluded.bytes")
      .run(Number(tokenId), day, applied.length, bytes);
  }

  usageToday(tokenId) {
    const day = new Date().toISOString().slice(0, 10);
    return this.db.prepare("SELECT ops, bytes FROM sync_usage WHERE token_id = ? AND day = ?").get(Number(tokenId), day) ?? { ops: 0, bytes: 0 };
  }

  /** Append-only audit. Never stores payloads or secrets. */
  audit(accountId, { tokenId = null, deviceId = null, action, detail = null, result = "ok" } = {}) {
    this.db.prepare("INSERT INTO sync_audit (account_id, token_id, device_id, action, detail, result, ts) VALUES (?,?,?,?,?,?,?)")
      .run(Number(accountId), tokenId == null ? null : Number(tokenId), deviceId, action, detail == null ? null : stableStringify(detail), result, Date.now());
  }

  auditLog(accountId, limit = 100) {
    return this.db.prepare("SELECT id, account_id, token_id, device_id, action, detail, result, ts FROM sync_audit WHERE account_id = ? ORDER BY id DESC LIMIT ?").all(Number(accountId), Math.min(Math.max(Number(limit) || 100, 1), 500))
      .map((row) => ({ ...row, detail: row.detail ? parse(row.detail, null) : null }));
  }

  /** True when a token's per-day quota is on and already spent. Returns null when under quota or off. */
  quotaExceeded(tokenId) {
    const token = this.db.prepare("SELECT ops_per_day, bytes_per_day FROM sync_token WHERE id = ?").get(Number(tokenId));
    if (!token) return null;
    const usage = this.usageToday(tokenId);
    if (token.ops_per_day != null && usage.ops >= token.ops_per_day) return "ops";
    if (token.bytes_per_day != null && usage.bytes >= token.bytes_per_day) return "bytes";
    return null;
  }

  // ---- folder transport -------------------------------------------------------------------------

  /** All ops with a body, oldest first, for the folder export (signed op files). */
  allOps(accountId) {
    return this.db.prepare("SELECT * FROM sync_op WHERE account_id = ? ORDER BY seq ASC").all(Number(accountId)).filter((row) => row.body).map((row) => JSON.parse(row.body));
  }
}
