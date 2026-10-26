// Erasure (T-113): count, export, delete and receipt. A plan is computed first and changes nothing. `--apply`
// deletes the rows from the hub store, removes the matching rows from a device replica and outbox, asks the sync
// store for a T-103 purge (which drops every op body and leaves a tombstone), and writes an HMAC-signed receipt
// that lists counts and ids, never content.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { sha256 } from "../lib/hash.mjs";
import { stableStringify } from "./sync/engine.mjs";

const RECEIPT_KIND = "aletheia-erasure-receipt";
const ID_TYPES = ["memory", "observation", "episode", "fact"];
const TYPE_TABLE = { memory: "memories", observation: "observations", episode: "episodes", fact: "facts" };

export class EraseError extends Error {}

const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);

/** `12` is memory #12; `fact:12` names another id type. */
export function parseEraseIds(values = []) {
  const out = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value) continue;
    const match = /^(memory|observation|episode|fact):(\d+)$/.exec(value);
    if (match) {
      out.push({ type: match[1], id: Number(match[2]) });
      continue;
    }
    if (/^\d+$/.test(value)) {
      out.push({ type: "memory", id: Number(value) });
      continue;
    }
    throw new EraseError(`Unknown id "${value}". Use 12, memory:12, fact:12, observation:12 or episode:12.`);
  }
  return out;
}

const take = (set, cap = 5000) => [...set].sort((a, b) => a - b).slice(0, cap);
const placeholders = (n) => Array.from({ length: n }, () => "?").join(",");

function idsFrom(hub, table, where, params) {
  if (!where.length) return new Set();
  return new Set(hub.db.prepare(`SELECT id FROM ${table} WHERE ${where.join(" AND ")}`).all(...params).map((row) => row.id));
}

/** Work out every row the erase would touch. Reads only; never throws away content. */
export function erasePlan(hub, { project = null, ids = [], before = null } = {}) {
  const selectors = parseEraseIds(ids);
  if (!project && !selectors.length && !Number.isFinite(before)) {
    throw new EraseError("Choose --project, --id or --before.");
  }
  const projectName = project == null ? null : String(project);
  const cutoff = Number.isFinite(before) ? Number(before) : null;
  const rangeWhere = [];
  const rangeParams = [];
  if (projectName) { rangeWhere.push("project = ?"); rangeParams.push(projectName); }
  if (cutoff != null) { rangeWhere.push("created_at_epoch < ?"); rangeParams.push(cutoff); }

  const memoryIds = idsFrom(hub, "memories", [...rangeWhere], [...rangeParams]);
  const observationIds = idsFrom(hub, "observations", [...rangeWhere], [...rangeParams]);
  const episodeIds = idsFrom(hub, "episodes", [...rangeWhere], [...rangeParams]);
  const factIds = idsFrom(hub, "facts", [...rangeWhere], [...rangeParams]);
  for (const entry of selectors) {
    if (entry.type === "memory") memoryIds.add(entry.id);
    if (entry.type === "observation") observationIds.add(entry.id);
    if (entry.type === "episode") episodeIds.add(entry.id);
    if (entry.type === "fact") factIds.add(entry.id);
  }

  // Follow provenance links until the sets stop growing. A memory's episode, an observation's facts and a fact's
  // episode all belong to the same erasure.
  for (let pass = 0; pass < 3; pass++) {
    if (memoryIds.size) {
      for (const row of hub.db.prepare(`SELECT id FROM observations WHERE legacy_memory_id IN (${placeholders(memoryIds.size)})`).all(...memoryIds)) observationIds.add(row.id);
      for (const row of hub.db.prepare(`SELECT id FROM episodes WHERE source_ref IN (${placeholders(memoryIds.size)})`).all(...[...memoryIds].map((id) => `memory:${id}`))) episodeIds.add(row.id);
    }
    if (observationIds.size) {
      for (const row of hub.db.prepare(`SELECT episode_id AS id FROM observations WHERE id IN (${placeholders(observationIds.size)}) AND episode_id IS NOT NULL`).all(...observationIds)) episodeIds.add(row.id);
      for (const row of hub.db.prepare(`SELECT id FROM facts WHERE observation_id IN (${placeholders(observationIds.size)})`).all(...observationIds)) factIds.add(row.id);
    }
    if (episodeIds.size) {
      for (const row of hub.db.prepare(`SELECT id FROM facts WHERE episode_id IN (${placeholders(episodeIds.size)})`).all(...episodeIds)) factIds.add(row.id);
    }
    if (factIds.size) {
      for (const row of hub.db.prepare(`SELECT episode_id AS id FROM facts WHERE id IN (${placeholders(factIds.size)}) AND episode_id IS NOT NULL`).all(...factIds)) episodeIds.add(row.id);
      for (const row of hub.db.prepare(`SELECT observation_id AS id FROM facts WHERE id IN (${placeholders(factIds.size)}) AND observation_id IS NOT NULL`).all(...factIds)) observationIds.add(row.id);
    }
  }

  const ownIds = { memory: memoryIds, observation: observationIds, episode: episodeIds, fact: factIds };
  const summaries = new Set();
  for (const row of hub.db.prepare("SELECT id, project, source_ids, created_at_epoch FROM summaries").all()) {
    if (projectName && row.project === projectName) { summaries.add(row.id); continue; }
    if (cutoff != null && row.created_at_epoch < cutoff) { summaries.add(row.id); continue; }
    let source = [];
    try { source = JSON.parse(row.source_ids ?? "[]"); } catch { source = []; }
    if (source.some((value) => Object.values(ownIds).some((set) => set.has(Number(value))))) summaries.add(row.id);
  }

  const ruleSuggestions = new Set();
  for (const row of hub.db.prepare("SELECT id, project, source_id FROM rule_suggestions").all()) {
    if (projectName && row.project === projectName) { ruleSuggestions.add(row.id); continue; }
    if (row.source_id != null && (factIds.has(Number(row.source_id)) || observationIds.has(Number(row.source_id)))) ruleSuggestions.add(row.id);
  }

  const counts = {
    memories: memoryIds.size, observations: observationIds.size, episodes: episodeIds.size, facts: factIds.size,
    summaries: summaries.size, ruleSuggestions: ruleSuggestions.size,
  };
  const scope = {
    project: projectName,
    ids: selectors.map((entry) => `${entry.type}:${entry.id}`),
    before: iso(cutoff),
  };
  return {
    scope,
    counts,
    ids: {
      memories: take(memoryIds), observations: take(observationIds), episodes: take(episodeIds), facts: take(factIds),
      summaries: take(summaries), ruleSuggestions: take(ruleSuggestions),
    },
    internal: { memoryIds, observationIds, episodeIds, factIds, summaries, ruleSuggestions },
  };
}

/** A short operator report. It shows ids, never entry text. */
export function formatEraseReport(plan) {
  const where = plan.scope.project ? `project "${plan.scope.project}"` : plan.scope.ids.length ? `ids ${plan.scope.ids.join(", ")}` : `before ${plan.scope.before}`;
  const lines = [`Erasure report for ${where}`, ""];
  const show = (label, ids, count) => {
    const head = ids.slice(0, 20).join(", ");
    lines.push(`  ${label.padEnd(16)} ${String(count).padStart(6)}${count ? `  ids ${head}${count > ids.length ? " …" : ""}` : ""}`);
  };
  show("memories", plan.ids.memories, plan.counts.memories);
  show("observations", plan.ids.observations, plan.counts.observations);
  show("episodes", plan.ids.episodes, plan.counts.episodes);
  show("facts", plan.ids.facts, plan.counts.facts);
  show("summaries", plan.ids.summaries, plan.counts.summaries);
  show("rule suggestions", plan.ids.ruleSuggestions, plan.counts.ruleSuggestions);
  lines.push("", "Nothing was deleted. Add --apply to erase, export first with --export <file>.");
  return lines.join("\n");
}

function deleteIn(hub, table, column, set) {
  if (!set.size) return 0;
  return hub.db.prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders(set.size)})`).run(...set).changes;
}

function deleteLinksTo(hub, type, set) {
  if (!set.size) return 0;
  const sql = `DELETE FROM memory_links WHERE (from_type = ? AND from_id IN (${placeholders(set.size)})) OR (to_type = ? AND to_id IN (${placeholders(set.size)}))`;
  return hub.db.prepare(sql).run(type, ...set, type, ...set).changes;
}

/** The pre-erase export. It is the one file that is expected to hold the content; it exists so the user has a copy. */
export function writePreEraseExport(hub, { path, project = null } = {}) {
  if (!path) throw new EraseError("An export path is required.");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, hub.exportBundle({ project, includeEvents: true }));
  return path;
}

/**
 * Apply a plan. Local rows go first, then the device replica/outbox, then a T-103 purge per sync entity. The
 * server tombstone is content-free. Returns the deleted counts plus what the sync layer did.
 */
export function applyErase(hub, plan, { syncStore = null, syncClient = null, accountId = null, teamStore = null, project = null, ids = [] } = {}) {
  const { memoryIds, observationIds, episodeIds, factIds, summaries, ruleSuggestions } = plan.internal;
  const allHubIds = [...memoryIds, ...observationIds, ...episodeIds, ...factIds];
  const sync = { entities: 0, localRows: 0 };
  if (syncStore && Number.isSafeInteger(Number(accountId))) {
    const found = syncStore.findEntities({ project, ids: allHubIds });
    for (const row of found) syncStore.purgeEntity(Number(accountId), row.entityId, { actor: { tokenId: null, deviceId: "erase" } });
    sync.entities = found.length;
  }
  if (syncClient) sync.localRows = syncClient.erase({ project, ids: allHubIds }).rows;

  hub.db.exec("BEGIN IMMEDIATE");
  try {
    deleteIn(hub, "fact_vectors", "fact_id", factIds);
    deleteIn(hub, "memory_vectors", "memory_id", memoryIds);
    const vectorColumns = hub.db.prepare("PRAGMA table_info(memory_vectors)").all().map((column) => column.name);
    if (observationIds.size && vectorColumns.includes("owner_type") && vectorColumns.includes("owner_id")) {
      hub.db.prepare(`DELETE FROM memory_vectors WHERE owner_type = 'observation' AND owner_id IN (${placeholders(observationIds.size)})`).run(...observationIds);
    }
    deleteIn(hub, "facts", "id", factIds);
    for (const type of ID_TYPES) {
      const owner = { memory: memoryIds, observation: observationIds, episode: episodeIds, fact: factIds }[type];
      if (!owner.size) continue;
      hub.db.prepare(`DELETE FROM memory_keys WHERE owner_type = ? AND owner_id IN (${placeholders(owner.size)})`).run(type, ...owner);
      hub.db.prepare(`DELETE FROM dismissals WHERE item_type = ? AND item_id IN (${placeholders(owner.size)})`).run(type, ...owner);
      hub.db.prepare(`DELETE FROM review_queue WHERE item_type = ? AND item_id IN (${placeholders(owner.size)})`).run(type, ...owner);
      deleteLinksTo(hub, type, owner);
    }
    deleteIn(hub, "summaries", "id", summaries);
    deleteIn(hub, "rule_suggestions", "id", ruleSuggestions);
    deleteIn(hub, "observations", "id", observationIds);
    deleteIn(hub, "episodes", "id", episodeIds);
    deleteIn(hub, "memories", "id", memoryIds);
    if (plan.scope.project) hub.db.prepare("DELETE FROM session_end WHERE project = ?").run(plan.scope.project);
    hub.db.exec("COMMIT");
  } catch (error) {
    try { hub.db.exec("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  }
  if (teamStore && plan.scope.project) {
    teamStore.db.prepare("DELETE FROM team_entry WHERE project = ?").run(plan.scope.project);
  }
  hub.statsCache = null;
  hub.vecCache = null;
  hub.audit("cli", "erase.apply", { scope: plan.scope, counts: plan.counts, sync, team: teamStore && plan.scope.project ? plan.scope.project : null });
  return { counts: plan.counts, sync };
}

// ---- signed receipt -------------------------------------------------------------------------------

export function loadEraseKey(path, { create = true } = {}) {
  if (existsSync(path)) {
    const key = readFileSync(path, "utf8").trim();
    if (!key) throw new EraseError(`The erasure key at ${path} is empty.`);
    return key;
  }
  if (!create) throw new EraseError(`No erasure key at ${path}; cannot verify the receipt.`);
  mkdirSync(dirname(path), { recursive: true });
  const key = randomBytes(32).toString("hex");
  writeFileSync(path, `${key}\n`, { mode: 0o600 });
  return key;
}

export function receiptId() {
  return randomBytes(8).toString("hex");
}

/** The signature covers every field except `signature`; the body holds counts and ids, never content. */
export function signReceipt(plan, { key, id = receiptId(), at = new Date().toISOString(), exports = [] } = {}) {
  if (!key) throw new EraseError("A receipt needs a key.");
  const body = {
    version: 1,
    kind: RECEIPT_KIND,
    id,
    at,
    scope: plan.scope,
    counts: plan.counts,
    ids: plan.ids,
    exports,
    alg: "HMAC-SHA256",
    keyId: sha256(key).slice(0, 16),
  };
  const signature = createHmac("sha256", key).update(stableStringify(body)).digest("hex");
  return { ...body, signature };
}

export function verifyReceipt(receipt, key) {
  if (!receipt || receipt.kind !== RECEIPT_KIND || receipt.version !== 1) return { ok: false, reason: "not an Aletheia erasure receipt" };
  if (typeof receipt.signature !== "string" || !receipt.signature) return { ok: false, reason: "the receipt has no signature" };
  if (receipt.keyId !== sha256(key).slice(0, 16)) return { ok: false, reason: "the receipt was signed with a different key" };
  const { signature, ...body } = receipt;
  const expected = createHmac("sha256", key).update(stableStringify(body)).digest("hex");
  const left = Buffer.from(signature, "hex");
  const right = Buffer.from(expected, "hex");
  if (left.length !== right.length || !timingSafeEqual(left, right)) return { ok: false, reason: "the signature does not match the receipt" };
  return { ok: true, reason: null };
}

export function writeReceipt(receipt, path) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`, { mode: 0o600 });
  return path;
}

export function readReceipt(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export { TYPE_TABLE };
