// Aletheia Sync engine: the op model, deterministic hashing, conflict rules and replica merge.
// Pure functions only; no storage and no network. Both the hub and a device load this module.
//
// Conflict rules (tested in test/sync-core.test.mjs):
//   1. Total order is (hlc, device_id). Higher hlc wins; equal hlc is broken by device_id, so two
//      devices that write offline still converge to the same winner.
//   2. Facts are append-only: a put with a new entity id always coexists with older rows.
//   3. Edits (put on an existing entity id) and dismissals (dismiss/restore) are last-writer-wins
//      by (hlc, device_id).
//   4. Deletes are tombstones and are also last-writer-wins; the tombstone replaces the content.
//   5. Supersession links merge by union: the supersedes set for a fact is the union across every
//      op that named it, regardless of which op won the write.
import { sha256 } from "../../lib/hash.mjs";

export const OPS = ["put", "dismiss", "restore", "delete"];

/** Deterministic JSON with sorted object keys. Used for every hash so two devices hash the same value. */
export function stableStringify(value) {
  if (value === undefined || typeof value === "function") return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export const hashSync = (value) => sha256(stableStringify(value));

/** The op's content hash is over the whole op minus the content_hash field itself. */
export function canonicalOp(op) {
  const { content_hash, ...rest } = op ?? {};
  return stableStringify(rest);
}

export function computeContentHash(op) {
  return hashSync(canonicalOp(op));
}

/** A stable entity id from a type and a stable key (project + title, or subject/predicate/object). */
export function entityIdFor(entityType, key) {
  return hashSync({ entityType, key });
}

/** Total order. Returns a negative number when a sorts before b. */
export function compareOps(a, b) {
  const ah = Number(a?.hlc ?? 0);
  const bh = Number(b?.hlc ?? 0);
  if (ah !== bh) return ah - bh;
  return String(a?.device_id ?? "").localeCompare(String(b?.device_id ?? ""));
}

/** Validate one op. Returns { ok, reason }. The hub answers per op, never for a whole batch. */
export function validateOp(op) {
  if (!op || typeof op !== "object") return { ok: false, reason: "op is not an object" };
  if (typeof op.device_id !== "string" || !op.device_id) return { ok: false, reason: "device_id is required" };
  if (!Number.isSafeInteger(op.seq) || op.seq < 1) return { ok: false, reason: "seq must be a positive integer" };
  if (!Number.isSafeInteger(op.hlc)) return { ok: false, reason: "hlc must be an integer" };
  if (typeof op.entity_type !== "string" || !op.entity_type) return { ok: false, reason: "entity_type is required" };
  if (typeof op.entity_id !== "string" || !op.entity_id) return { ok: false, reason: "entity_id is required" };
  if (!OPS.includes(op.op)) return { ok: false, reason: `op must be one of ${OPS.join(", ")}` };
  if (op.op === "put" && (op.payload == null || typeof op.payload !== "object")) return { ok: false, reason: "a put needs a payload object" };
  if (op.op !== "put" && op.payload != null) return { ok: false, reason: "only a put carries a payload" };
  if (op.supersedes != null && !Array.isArray(op.supersedes)) return { ok: false, reason: "supersedes must be an array" };
  if (typeof op.content_hash !== "string" || !/^[a-f0-9]{64}$/.test(op.content_hash)) return { ok: false, reason: "content_hash must be a sha256 hex string" };
  if (computeContentHash(op) !== op.content_hash) return { ok: false, reason: "content_hash does not match the op" };
  return { ok: true };
}

/** Build a valid op with its content_hash. `redactPayload` must already have run on `payload`. */
export function buildOp({ deviceId, seq, hlc, entityType, entityId, op, payload = null, supersedes = null }) {
  const base = { device_id: deviceId, seq, hlc, entity_type: entityType, entity_id: entityId, op, payload, supersedes };
  return { ...base, content_hash: computeContentHash(base) };
}

/** Turn one winning op into the materialized entity state it represents. */
export function materialize(op, prev = null) {
  const state = {
    entity_id: op.entity_id,
    entity_type: op.entity_type,
    op: op.op,
    hlc: Number(op.hlc ?? 0),
    device_id: op.device_id,
    content_hash: op.content_hash ?? "",
    payload: op.payload ?? null,
    dismissed: prev?.dismissed ?? false,
    deleted: prev?.deleted ?? false,
    supersedes: [],
  };
  if (op.op === "put") {
    state.payload = op.payload ?? null;
    state.dismissed = false;
    state.deleted = false;
  } else if (op.op === "dismiss") {
    state.dismissed = true;
    state.payload = prev?.payload ?? op.payload ?? null;
  } else if (op.op === "restore") {
    state.dismissed = false;
    state.payload = prev?.payload ?? op.payload ?? null;
  } else if (op.op === "delete") {
    state.deleted = true;
    state.dismissed = false;
    state.payload = null;
  }
  return state;
}

/**
 * Apply a list of ops to a replica. `entities` is an array of materialized entity states (or empty).
 * The result is deterministic and independent of input order because the winner is chosen by total
 * order and supersession links are unioned across all ops. Returns a new array.
 */
export function mergeOps(entities = [], ops = []) {
  const map = new Map(entities.map((entity) => [entity.entity_id, entity]));
  const supersedes = new Map(entities.map((entity) => [entity.entity_id, new Set(entity.supersedes ?? [])]));
  for (const op of ops) {
    if (!op || !op.entity_id) continue;
    const seen = supersedes.get(op.entity_id) ?? new Set();
    for (const id of op.supersedes ?? []) seen.add(String(id));
    supersedes.set(op.entity_id, seen);
    const cur = map.get(op.entity_id);
    if (!cur || compareOps(op, cur) > 0) map.set(op.entity_id, materialize(op, cur));
  }
  for (const [entityId, state] of map) state.supersedes = [...(supersedes.get(entityId) ?? [])].sort();
  return [...map.values()];
}

/** The replica's content hash: a deterministic hash of the sorted materialized entities. */
export function replicaContentHash(entities = []) {
  const sorted = [...entities].sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  return hashSync(sorted.map((entity) => ({ ...entity, supersedes: entity.supersedes ?? [] })));
}

/** Redact every string leaf in a value before it leaves the machine. */
export function redactValue(value, redact) {
  if (typeof value === "string") return redact(value);
  if (Array.isArray(value)) return value.map((item) => redactValue(item, redact));
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) out[key] = redactValue(item, redact);
    return out;
  }
  return value;
}
