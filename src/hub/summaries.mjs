// Observations and summaries built from facts. A summary is derived data: it never replaces or deletes its sources,
// it stores the ids it came from, and it is only written when at least one source fact exists. The session writer
// also replaces the Stop hook's raw "last assistant message" row, so a real summary wins over a paste.
import { sha256 } from "../lib/hash.mjs";
import { estimateTokens } from "./usage.mjs";

export const SUMMARY_SCOPES = ["session", "project", "entity"];
export const MAX_SUMMARY_CHARS = 1200;
export const MAX_SUMMARY_FACTS = 40;
const DAY = 86_400_000;

const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

/** Compact bullet list of facts, capped so a summary stays smaller than the episodes it summarises. */
export function summaryText(facts, heading) {
  const lines = facts.slice(0, MAX_SUMMARY_FACTS).map((fact) => `- ${oneLine(fact.text).slice(0, 180)}`);
  const body = `${heading}\n${lines.join("\n")}`;
  return body.length > MAX_SUMMARY_CHARS ? `${body.slice(0, MAX_SUMMARY_CHARS - 1).trimEnd()}…` : body;
}

export function sessionFacts(store, { project, sessionId, limit = 200 } = {}) {
  if (!sessionId) return [];
  return store.db
    .prepare(`SELECT DISTINCT f.* FROM facts f JOIN episodes e ON e.id = f.episode_id
              WHERE f.project = ? AND e.session_id = ? AND f.status = 'active'
              ORDER BY coalesce(f.valid_from_epoch, f.recorded_at_epoch), f.id LIMIT ?`)
    .all(project, sessionId, Math.min(Number(limit) || 200, 1000));
}

export function projectFacts(store, { project, sinceEpoch = 0, limit = 200 } = {}) {
  return store.db
    .prepare(`SELECT * FROM facts WHERE project = ? AND status = 'active' AND recorded_at_epoch >= ?
              ORDER BY recorded_at_epoch DESC, id DESC LIMIT ?`)
    .all(project, Number(sinceEpoch) || 0, Math.min(Number(limit) || 200, 1000));
}

export function entityFacts(store, { entityId, limit = 200 } = {}) {
  return store.db
    .prepare(`SELECT f.* FROM facts f JOIN fact_entities fe ON fe.fact_id = f.id
              WHERE fe.entity_id = ? AND f.status = 'active' ORDER BY f.recorded_at_epoch DESC, f.id DESC LIMIT ?`)
    .all(Number(entityId), Math.min(Number(limit) || 200, 1000));
}

/** Insert a summary row. A summary with no source ids is refused: the rule is provenance or nothing. */
export function addSummary(store, { project, scope, fromEpoch, toEpoch, text, sourceIds, now = Date.now() }) {
  if (!SUMMARY_SCOPES.includes(scope)) throw new RangeError(`A summary scope must be one of: ${SUMMARY_SCOPES.join(", ")}.`);
  const ids = [...new Set((sourceIds ?? []).map(Number).filter(Number.isSafeInteger))];
  if (!ids.length) throw new RangeError("A summary needs at least one source id.");
  const clean = String(text ?? "").trim();
  if (!clean) throw new RangeError("A summary needs text.");
  const existing = store.db.prepare("SELECT * FROM summaries WHERE project = ? AND scope = ? AND text = ? AND source_ids = ?").get(project, scope, clean, JSON.stringify(ids));
  if (existing) return { id: existing.id, created: false, summary: existing };
  const tokens = estimateTokens(clean);
  const info = store.db
    .prepare("INSERT INTO summaries (project, scope, period_start_epoch, period_end_epoch, text, source_ids, token_count, created_at_epoch) VALUES (?,?,?,?,?,?,?,?)")
    .run(project, scope, Number(fromEpoch) || now, Number(toEpoch) || now, clean, JSON.stringify(ids), tokens, now);
  const id = Number(info.lastInsertRowid);
  store.audit("extract", "summary.add", { id, scope, sources: ids.length, tokens });
  return { id, created: true, summary: store.db.prepare("SELECT * FROM summaries WHERE id = ?").get(id) };
}

/**
 * The observation that carries the summary in the observation network. It links to every source fact and to the
 * episodes those facts came from. Idempotent on the observation content hash.
 */
export function addSummaryObservation(store, { project, scope, text, sourceIds, now = Date.now() }) {
  const facts = store.getFactsByIds(sourceIds);
  const title = `Summary (${scope}): ${oneLine(facts[0]?.text ?? text).slice(0, 90)}`;
  const result = store.addObservation({ project, type: "summary", title, narrative: text, origin: `summary:${scope}`, createdAtEpoch: now }, { actor: "extract" });
  if (result.created) {
    for (const fact of facts) {
      store.link({ fromType: "observation", fromId: result.id, toType: "fact", toId: fact.id, relation: "derived_from" });
      store.link({ fromType: "observation", fromId: result.id, toType: "episode", toId: fact.episode_id, relation: "derived_from" });
    }
  }
  return result.id;
}

/**
 * Replace the Stop hook's pasted assistant message with the generated summary. The row keeps its id (stable
 * citations); the change is audited. When there is no fallback row, add one, because a summary that search cannot
 * see is not useful.
 */
export function writeSummaryMemory(store, { project, sessionId, text, now = Date.now() }) {
  const title = `Session summary: ${oneLine(text.split("\n")[1] ?? text).slice(0, 100)}`;
  const hash = sha256(JSON.stringify([project, "summary", title, text]));
  const fallback = sessionId
    ? store.db.prepare("SELECT * FROM memories WHERE project = ? AND session_id = ? AND kind = 'summary' AND (origin IS NULL OR origin NOT LIKE 'summary:%') ORDER BY created_at_epoch DESC, id DESC LIMIT 1").get(project, sessionId)
    : null;
  if (fallback) {
    const clash = store.db.prepare("SELECT id FROM memories WHERE content_hash = ?").get(hash);
    if (clash && clash.id !== fallback.id) return { id: fallback.id, replaced: false, reason: "duplicate" };
    store.db.prepare("UPDATE memories SET title = ?, narrative = ?, origin = 'summary:session', content_hash = ?, updated_at_epoch = ? WHERE id = ?")
      .run(title, text, hash, now, fallback.id);
    store.audit("extract", "summary.replace", { id: fallback.id, sessionId: sessionId ?? null });
    return { id: fallback.id, replaced: true };
  }
  const added = store.add({ project, kind: "summary", type: "summary", title, narrative: text, sessionId: sessionId ?? undefined, tool: "worker", origin: "summary:session", createdAtEpoch: now }, { actor: "extract" });
  return { id: added.id, replaced: false, created: added.created };
}

/**
 * Session summary: the facts learned in one session. Returns null when the session has no active fact, so a summary
 * can never outlive its evidence.
 */
export function buildSessionSummary(store, { project, sessionId, now = Date.now() } = {}) {
  const facts = sessionFacts(store, { project, sessionId });
  if (!facts.length) return null;
  const text = summaryText(facts, `Session summary for ${project} (${facts.length} fact(s))`);
  const sourceIds = facts.map((fact) => fact.id);
  const summary = addSummary(store, { project, scope: "session", fromEpoch: facts[0].recorded_at_epoch, toEpoch: now, text, sourceIds, now });
  const observationId = addSummaryObservation(store, { project, scope: "session", text, sourceIds, now });
  const memory = writeSummaryMemory(store, { project, sessionId, text, now });
  return { ...summary, observationId, memory, factIds: sourceIds, tokenCount: estimateTokens(text) };
}

/** Project summary: decisions and facts from the last `days` days, not a diary. */
export function buildProjectSummary(store, { project, now = Date.now(), days = 7 } = {}) {
  const facts = projectFacts(store, { project, sinceEpoch: now - Number(days) * DAY });
  if (!facts.length) return null;
  const text = summaryText(facts, `Project summary for ${project} (last ${days} day(s), ${facts.length} fact(s))`);
  const sourceIds = facts.map((fact) => fact.id);
  const summary = addSummary(store, { project, scope: "project", fromEpoch: now - Number(days) * DAY, toEpoch: now, text, sourceIds, now });
  const observationId = addSummaryObservation(store, { project, scope: "project", text, sourceIds, now });
  return { ...summary, observationId, factIds: sourceIds, tokenCount: estimateTokens(text) };
}

/** Entity summary: one paragraph, built from the active facts linked to that entity. */
export function buildEntitySummary(store, { entityId, now = Date.now() } = {}) {
  const entity = store.db.prepare("SELECT * FROM entities WHERE id = ?").get(Number(entityId));
  if (!entity) throw new RangeError(`No entity #${entityId}.`);
  const facts = entityFacts(store, { entityId: entity.id });
  if (!facts.length) return null;
  const text = summaryText(facts, `Entity summary: ${entity.name} (${entity.type})`);
  const sourceIds = facts.map((fact) => fact.id);
  const summary = addSummary(store, { project: entity.project, scope: "entity", fromEpoch: facts.at(-1).recorded_at_epoch, toEpoch: now, text, sourceIds, now });
  const observationId = addSummaryObservation(store, { project: entity.project, scope: "entity", text, sourceIds, now });
  return { ...summary, observationId, factIds: sourceIds, tokenCount: estimateTokens(text), entity };
}

export function listSummaries(store, { project, scope, limit = 50 } = {}) {
  const where = [];
  const params = [];
  if (project) { where.push("project = ?"); params.push(project); }
  if (scope) { where.push("scope = ?"); params.push(scope); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return store.db.prepare(`SELECT * FROM summaries ${clause} ORDER BY created_at_epoch DESC, id DESC LIMIT ?`).all(...params, Math.min(Number(limit) || 50, 500));
}
