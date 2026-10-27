// Belief tracking (T-098): a belief is a fact with a confidence and a review state. A contested belief (same subject
// and predicate, different object) is never collapsed — both sides stay visible. Regeneration of an entity summary is
// deterministic and gated on a >20% change to the source facts. Rule-based only; model-generated prose is UNVERIFIED.
import { sha256 } from "../lib/hash.mjs";
import { entityFacts, buildEntitySummary } from "./summaries.mjs";

export const REGEN_THRESHOLD = 0.2;

/** A deterministic signature of a set of source facts. */
export function beliefSignature(facts) {
  return sha256((facts ?? []).map((fact) => `${fact.id}:${fact.text}`).join("\n"));
}

/** One fact as a belief: confidence and review state ride on the fact, both sides stay visible. */
export function beliefView(fact) {
  if (!fact) return null;
  return {
    id: fact.id,
    subject: fact.subject,
    predicate: fact.predicate,
    object: fact.object,
    text: fact.text,
    confidence: fact.confidence,
    status: fact.status,
  };
}

/**
 * Active facts grouped by (subject, predicate) that disagree on the object. Every group keeps both sides; a group with
 * a single object is a settled belief and is excluded.
 */
export function contestedFacts(store, { project = null, subject = null, predicate = null, limit = 100 } = {}) {
  const where = ["f.status = 'active'"];
  const params = [];
  if (project) { where.push("f.project = ?"); params.push(project); }
  if (subject) { where.push("f.subject = ?"); params.push(subject); }
  if (predicate) { where.push("f.predicate = ?"); params.push(predicate); }
  const facts = store.db
    .prepare(`SELECT * FROM facts f WHERE ${where.join(" AND ")} ORDER BY f.recorded_at_epoch DESC, f.id DESC`)
    .all(...params);
  const groups = new Map();
  for (const fact of facts) {
    const key = `${fact.subject}\u0000${fact.predicate}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fact);
  }
  return [...groups.values()].filter((group) => new Set(group.map((fact) => fact.object)).size > 1).slice(0, Math.min(Number(limit) || 100, 1000));
}

/** True when the source fact set changed by more than `threshold` (added + removed over the larger set). */
export function changedBeyond(currentIds, previousIds, threshold = REGEN_THRESHOLD) {
  const current = new Set((currentIds ?? []).map(Number));
  const previous = new Set((previousIds ?? []).map(Number));
  const added = [...current].filter((id) => !previous.has(id)).length;
  const removed = [...previous].filter((id) => !current.has(id)).length;
  const denom = Math.max(current.size, previous.size, 1);
  return (added + removed) / denom > threshold;
}

/** Whether the entity's current summary is stale: its recorded source ids differ from the active facts by >20%. */
export function entitySummaryStale(store, { entityId, summary, threshold = REGEN_THRESHOLD } = {}) {
  if (!summary) return true;
  const currentIds = entityFacts(store, { entityId }).map((fact) => fact.id);
  const previousIds = JSON.parse(summary.source_ids ?? "[]").map(Number);
  return changedBeyond(currentIds, previousIds, threshold);
}

/** Rule-based entity summary. Uses the existing deterministic builder; the model-generated paragraph is UNVERIFIED. */
export function regenerateEntitySummary(store, { entityId, now = Date.now() } = {}) {
  return buildEntitySummary(store, { entityId, now });
}
