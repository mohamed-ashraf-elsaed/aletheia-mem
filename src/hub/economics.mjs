// Context economics: per-observation read tokens and work tokens. Read tokens are counted from the stored text with
// one documented counter (estimateTokens, four characters per token). Work tokens come only from a real usage record
// in the extraction ledger; where no record exists the value is null and labelled, never guessed.
import { estimateTokens } from "./usage.mjs";

const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();

export const READ_TOKEN_COUNTER = "estimateTokens: ceil(text.length / 4)";
export const CONTEXT_KINDS = ["observation", "summary", "note"];

/** Observations a next session would read, newest first, with their read-token cost. */
export function economics(store, { project = null, limit = 50, now = Date.now() } = {}) {
  const scope = typeof project === "string" && project.trim() ? project.trim() : null;
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const dismiss = store.hasDismissals("memory") ? "AND NOT EXISTS (SELECT 1 FROM dismissals d WHERE d.item_type = 'memory' AND d.item_id = memories.id)" : "";
  const rows = store.db
    .prepare(`SELECT id, title, narrative, kind, project, created_at_epoch FROM memories
      WHERE kind IN (${CONTEXT_KINDS.map(() => "?").join(",")}) ${scope ? "AND project = ?" : ""} ${dismiss}
      ORDER BY created_at_epoch DESC, id DESC LIMIT ?`)
    .all(...CONTEXT_KINDS, ...(scope ? [scope] : []), lim);

  const observations = rows.map((row) => ({
    id: row.id,
    project: row.project,
    kind: row.kind,
    title: oneLine(row.title).slice(0, 120),
    text: oneLine(row.narrative).slice(0, 200),
    readTokens: estimateTokens(`${row.title}\n${row.narrative ?? ""}`),
    workTokens: null,
    workTokensSource: "usage is recorded per extraction call, not per observation",
    at: iso(row.created_at_epoch),
  }));

  const readTokens = observations.reduce((sum, row) => sum + row.readTokens, 0);
  const usage = store.usageSummary();
  const workTokens = usage && usage.calls > 0 ? (usage.input_tokens ?? 0) + (usage.output_tokens ?? 0) : null;
  const workTokensSource = workTokens == null ? "no usage record" : "fact_usage input + output tokens";
  const savingsPercent = workTokens != null && workTokens > 0 ? Math.round(((workTokens - readTokens) / workTokens) * 100) : null;

  return {
    project: scope ?? "all",
    generatedAt: iso(now),
    counter: READ_TOKEN_COUNTER,
    observations,
    totals: {
      observations: observations.length,
      readTokens,
      workTokens,
      workTokensSource,
      savingsPercent,
    },
    label: {
      read: "Read: tokens to read this observation.",
      work: "Work: tokens spent on work that produced this record, from the extraction ledger.",
      savings: "Savings: the reduction from reusing past work instead of re-doing it.",
    },
    empty: observations.length === 0 && workTokens == null,
  };
}
