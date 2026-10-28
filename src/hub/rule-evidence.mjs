// Rule dates, evidence and staleness. A rule carries the date it was made, where it came from, the memories and facts
// it rests on, and the date someone last confirmed it. Staleness is computed from those rows on every read and is only
// a flag with reasons: nothing here disables, edits or deletes a rule, and a flagged rule keeps syncing.
//
// A rule is flagged when any of these is true:
//   evidence_fact_superseded  an evidence fact was superseded or closed after the rule was last confirmed
//   evidence_fact_expired     an evidence fact's valid_to or expiry passed after the rule was last confirmed
//   evidence_memory_dismissed an evidence memory was dismissed after the rule was last confirmed
//   newer_fact                a newer active fact states a different object for the same project, subject and predicate
//   review_overdue            no confirmation for more than the review window (setting rules.reviewDays, default 90)
// Confirming a rule moves last_confirmed_epoch to now, so a change that happened before it no longer counts.
import { redact } from "./redact.mjs";

export const DEFAULT_REVIEW_DAYS = 90;
const DAY = 86_400_000;
const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);
const day = (epoch) => new Date(epoch).toISOString().slice(0, 10);

/** The review window in days: setting rules.reviewDays (7..730), else 90. */
export function reviewDays(store) {
  const value = Number(store.setting("ui.settings.rules.reviewDays", DEFAULT_REVIEW_DAYS));
  return Number.isInteger(value) && value >= 7 && value <= 730 ? value : DEFAULT_REVIEW_DAYS;
}

/** Evidence rows as the API shows them: dates as epoch and ISO, recalled quotes redacted. */
export function evidenceView(rows) {
  return rows.map((row) => ({ kind: row.kind, id: row.id, at_epoch: row.at_epoch, at: iso(row.at_epoch), quote: row.quote ? redact(row.quote) : null, session_id: row.session_id ?? null }));
}

/**
 * Evidence for a rule made from an approved suggestion: the suggestion itself plus each dated quote, pointing at the
 * prompt memory or episode it came from.
 */
export function evidenceFromSuggestion(store, suggestionId) {
  const row = store.db.prepare("SELECT id, created_at_epoch FROM rule_suggestions WHERE id = ?").get(Number(suggestionId));
  if (!row) return [];
  const quotes = store.db.prepare("SELECT text, at_epoch, source_type, source_id, session_id FROM rule_suggestion_quotes WHERE suggestion_id = ? ORDER BY at_epoch DESC, id DESC").all(row.id);
  const out = [{ kind: "suggestion", id: row.id, atEpoch: row.created_at_epoch }];
  for (const quote of quotes) {
    if (!Number.isSafeInteger(quote.source_id) || quote.source_id <= 0) continue;
    out.push({ kind: quote.source_type === "episode" ? "episode" : "memory", id: quote.source_id, atEpoch: quote.at_epoch, quote: quote.text, sessionId: quote.session_id });
  }
  return out;
}

/**
 * Check caller-supplied evidence ids: each must be {kind: memory|fact, id} of a row that exists (and, when `allowed`
 * is given, in a project the caller may read). Returns the clean list or throws RangeError.
 */
export function checkEvidenceInput(store, items, { allowed = null } = {}) {
  if (items == null) return [];
  if (!Array.isArray(items) || items.length > 50) throw new RangeError("evidence must be a list of at most 50 {kind, id} items.");
  return items.map((item) => {
    const id = Number(item?.id);
    if (!["memory", "fact"].includes(item?.kind) || !Number.isSafeInteger(id) || id <= 0) throw new RangeError("Each evidence item needs kind memory or fact and a numeric id.");
    const row = item.kind === "memory" ? store.db.prepare("SELECT project FROM memories WHERE id = ?").get(id) : store.getFact(id);
    if (!row) throw new RangeError(`Evidence ${item.kind} #${id} does not exist.`);
    if (allowed && !allowed(row.project)) throw new RangeError(`Evidence ${item.kind} #${id} is in a project this token cannot read.`);
    return { kind: item.kind, id };
  });
}

/**
 * Staleness of one rule. `rule` is a store rule (lastConfirmedEpoch, createdAtEpoch) and `evidence` its raw evidence rows.
 * Returns {stale, reasons: [{code, message, evidence?}], last_confirmed_epoch, age_days}; age_days counts whole days since
 * the rule was last confirmed (or created, when it never was).
 */
export function ruleStaleness(store, rule, evidence, { now = Date.now(), days = reviewDays(store) } = {}) {
  const confirmed = rule.lastConfirmedEpoch ?? rule.createdAtEpoch;
  const reasons = [];
  const after = (epoch) => Number.isFinite(epoch) && epoch > confirmed;
  for (const item of evidence) {
    const ref = { kind: item.kind, id: item.id };
    if (item.kind === "fact") {
      const fact = store.getFact(item.id);
      if (!fact) continue;
      const ended = fact.valid_to_epoch ?? fact.expired_at_epoch ?? null;
      const closedAt = ended ?? fact.recorded_at_epoch;
      if (fact.status !== "active" && after(closedAt)) {
        reasons.push({ code: "evidence_fact_superseded", message: `Fact #${fact.id} behind this rule is ${fact.status}${ended ? ` since ${day(ended)}` : ""}.`, evidence: ref });
        continue;
      }
      const endedAt = [fact.valid_to_epoch, fact.expired_at_epoch].filter((epoch) => Number.isFinite(epoch) && epoch <= now).sort((a, b) => a - b)[0];
      if (endedAt != null && after(endedAt)) {
        reasons.push({ code: "evidence_fact_expired", message: `Fact #${fact.id} behind this rule expired on ${day(endedAt)}.`, evidence: ref });
        continue;
      }
      const newer = store.factsCurrent({ project: fact.project, subject: fact.subject, predicate: fact.predicate, now })
        .find((other) => other.id !== fact.id && other.recorded_at_epoch > fact.recorded_at_epoch && other.object !== fact.object && after(other.recorded_at_epoch));
      if (newer) reasons.push({ code: "newer_fact", message: `A newer fact #${newer.id} (${day(newer.recorded_at_epoch)}) covers the same subject and predicate as fact #${fact.id}.`, evidence: ref });
    } else if (item.kind === "memory") {
      const gone = store.db.prepare("SELECT at_epoch FROM dismissals WHERE item_type = 'memory' AND item_id = ?").get(item.id);
      if (gone && after(gone.at_epoch)) reasons.push({ code: "evidence_memory_dismissed", message: `Memory #${item.id} behind this rule was dismissed on ${day(gone.at_epoch)}.`, evidence: ref });
    }
  }
  const age = Math.max(0, Math.floor((now - confirmed) / DAY));
  if (now - confirmed > days * DAY) reasons.push({ code: "review_overdue", message: `Not confirmed for ${age} days (review window ${days} days, last confirmed ${day(confirmed)}).` });
  return { stale: reasons.length > 0, reasons, last_confirmed_epoch: confirmed, age_days: age };
}

/**
 * Every rule with its dates, evidence and staleness, for the API, CLI, MCP and lint. Filters: `stale` (true keeps only
 * flagged rules) and `olderThanDays` (only rules last confirmed more than N days ago). Read-only.
 */
export function describeRules(store, { stale = null, olderThanDays = null, now = Date.now() } = {}) {
  const days = reviewDays(store);
  const out = [];
  for (const rule of store.rules.list()) {
    const evidence = store.rules.evidence(rule.id);
    const staleness = ruleStaleness(store, rule, evidence, { now, days });
    out.push({ ...rule, created_at_epoch: rule.createdAtEpoch, evidence: evidenceView(evidence), ...staleness });
  }
  const older = Number(olderThanDays);
  return out.filter((rule) => (stale === true ? rule.stale : true) && (Number.isFinite(older) && older > 0 ? rule.age_days > Math.floor(older) : true));
}

export const describeRule = (store, id, options) => describeRules(store, options).find((rule) => rule.id === id) ?? null;

/** One line for a rule's date and source, for MCP and the CLI: "added 2026-08-03, source you, last confirmed 2026-09-01, 2 evidence". */
export function provenanceLine(rule) {
  const parts = [`added ${day(rule.createdAtEpoch)}`, `source: ${rule.source}`, `last confirmed ${day(rule.last_confirmed_epoch ?? rule.lastConfirmedEpoch)}`];
  if (rule.evidence?.length) parts.push(`${rule.evidence.length} evidence`);
  return parts.join(", ");
}

export const recheckMarker = (rule) => (rule.stale ? ` [re-check: ${rule.reasons.map((reason) => reason.message).join(" ")}]` : "");

/**
 * The note appended to a flagged rule when it is written into a rules file or handed to an agent as context. A flagged rule
 * is still delivered (flag, not delete); the note says why it is flagged and tells the reader to verify before applying.
 */
export const recheckNote = (rule) => (rule.stale ? ` [re-check: ${rule.reasons.map((reason) => reason.message).join(" ")} Verify before applying.]` : "");

/** Remove a trailing recheckNote from rule text read back from a rules file, so a note never becomes part of the rule. */
export const stripRecheckNote = (text) => text.replace(/ \[re-check: .*? Verify before applying\.\]\s*$/, "");
