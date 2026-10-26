// Retention: facts go cold by a rule, old episode text is shortened to a head, a tail and a pointer. Nothing is
// deleted, and nothing changes without an audited run. The default is a report; `--apply` performs the same plan.
//
// The cold rule (documented in docs/26-memory-pipeline.md):
//   status = active, recorded more than `coldDays` (180) ago, confidence < 0.8, only one episode source, and no
//   pinned or high-importance observation. A fact confirmed by a second session, or attached to a pinned or
//   importance >= 0.8 observation, never goes cold.
//
// Episode rule:
//   older than `retentionDays` (90), longer than 400 characters, not already shortened, and not the evidence of a
//   pinned observation or of any active fact. The first and last 200 characters stay, plus a pointer and the
//   removed count.
import { estimateTokens } from "./usage.mjs";

export const DAY = 86_400_000;
export const DEFAULT_RETENTION = { retentionDays: 90, coldDays: 180, coldConfidence: 0.8, highImportance: 0.8 };
export const TRUNCATION_MARK = "[aletheia:truncated";

export function retentionSettings(store) {
  const saved = store.setting("retention", {});
  return {
    retentionDays: Number(saved?.retentionDays ?? DEFAULT_RETENTION.retentionDays),
    coldDays: Number(saved?.coldDays ?? DEFAULT_RETENTION.coldDays),
    coldConfidence: Number(saved?.coldConfidence ?? DEFAULT_RETENTION.coldConfidence),
    highImportance: Number(saved?.highImportance ?? DEFAULT_RETENTION.highImportance),
  };
}

/** A fact is protected when an observation that owns it is pinned or important. */
export function factIsProtected(store, fact, { highImportance = DEFAULT_RETENTION.highImportance } = {}) {
  if (!fact.observation_id) return false;
  const observation = store.getObservation(fact.observation_id);
  if (!observation) return false;
  return !!observation.pinned || Number(observation.importance ?? 0) >= highImportance;
}

export function factSources(store, factId) {
  const fact = store.getFact(factId);
  const primary = Number(fact?.episode_id);
  const linked = store.db.prepare("SELECT COUNT(DISTINCT to_id) AS n FROM memory_links WHERE from_type = 'fact' AND from_id = ? AND to_type = 'episode' AND to_id != ?").get(Number(factId), Number.isSafeInteger(primary) ? primary : -1).n;
  return (Number.isSafeInteger(primary) ? 1 : 0) + linked;
}

/** Facts that meet the cold rule right now. Read-only: the caller decides whether to apply it. */
export function coldCandidates(store, { now = Date.now(), settings = retentionSettings(store) } = {}) {
  const cutoff = now - Number(settings.coldDays) * DAY;
  const rows = store.db
    .prepare("SELECT * FROM facts WHERE status = 'active' AND recorded_at_epoch < ? AND confidence < ? ORDER BY recorded_at_epoch, id")
    .all(cutoff, Number(settings.coldConfidence));
  return rows.filter((fact) => !factIsProtected(store, fact, settings) && factSources(store, fact.id) <= 1);
}

function protectedEpisodes(store) {
  const pinned = store.db
    .prepare(`SELECT episode_id AS id FROM observations WHERE pinned = 1 AND episode_id IS NOT NULL
              UNION SELECT l.to_id FROM memory_links l JOIN observations o ON o.id = l.from_id
              WHERE l.from_type = 'observation' AND l.to_type = 'episode' AND o.pinned = 1`)
    .all().map((row) => row.id);
  const evidenced = store.db.prepare("SELECT DISTINCT episode_id AS id FROM facts WHERE status = 'active' AND episode_id IS NOT NULL").all().map((row) => row.id);
  return new Set([...pinned, ...evidenced].filter(Number.isSafeInteger));
}

/** Episodes whose text can be shortened now. Read-only. */
export function episodeCandidates(store, { now = Date.now(), settings = retentionSettings(store) } = {}) {
  const cutoff = now - Number(settings.retentionDays) * DAY;
  const protectedIds = protectedEpisodes(store);
  return store.db
    .prepare("SELECT * FROM episodes WHERE created_at_epoch < ? AND length(text) > 400 AND instr(text, ?) = 0 ORDER BY created_at_epoch, id")
    .all(cutoff, TRUNCATION_MARK)
    .filter((episode) => !protectedIds.has(episode.id));
}

/** Replace old text with its head, tail, pointer and removed count. Returns the new text. */
export function shortenEpisodeText(episode, { head = 200, tail = 200 } = {}) {
  const text = String(episode.text ?? "");
  const removed = text.length - head - tail;
  if (removed <= 0) return text;
  const pointer = `\n${TRUNCATION_MARK} ${removed} chars removed; source ${episode.source_ref ?? `episode:${episode.id}`}]\n`;
  return `${text.slice(0, head)}${pointer}${text.slice(-tail)}`;
}

/**
 * Build the plan. `apply: false` is the report. Every applied change writes one audit row; rows are never deleted.
 */
export function prune(store, { now = Date.now(), apply = false, settings = retentionSettings(store) } = {}) {
  const cold = coldCandidates(store, { now, settings });
  const episodes = episodeCandidates(store, { now, settings });
  const report = {
    now,
    apply,
    settings,
    factsCold: cold.length,
    factsColdIds: cold.slice(0, 100).map((fact) => fact.id),
    episodesShortened: episodes.length,
    episodeIds: episodes.slice(0, 100).map((episode) => episode.id),
    charsRemoved: episodes.reduce((sum, episode) => sum + Math.max(0, String(episode.text ?? "").length - 400), 0),
    applied: { factsCold: 0, episodesShortened: 0 },
  };
  if (!apply) return report;
  store.db.exec("BEGIN IMMEDIATE");
  try {
    for (const fact of cold) {
      const info = store.db.prepare("UPDATE facts SET status = 'cold', expired_at_epoch = ? WHERE id = ? AND status = 'active'").run(now, fact.id);
      if (info.changes) {
        store.audit("system", "fact.cold", { id: fact.id, reason: "age_confidence_single_source", recordedAt: fact.recorded_at_epoch });
        report.applied.factsCold++;
      }
    }
    for (const episode of episodes) {
      const before = String(episode.text ?? "");
      const text = shortenEpisodeText(episode);
      const info = store.db.prepare("UPDATE episodes SET text = ?, token_count = ? WHERE id = ? AND instr(text, ?) = 0").run(text, estimateTokens(text), episode.id, TRUNCATION_MARK);
      if (info.changes) {
        store.audit("system", "episode.truncate", { id: episode.id, removedChars: before.length - text.length, sourceRef: episode.source_ref ?? null });
        report.applied.episodesShortened++;
      }
    }
    store.db.exec("COMMIT");
  } catch (error) {
    try { store.db.exec("ROLLBACK"); } catch { /* ignore */ }
    throw error;
  }
  return report;
}

export const formatPruneReport = (report) => {
  const lines = [
    `Retention plan for ${new Date(report.now).toISOString()}${report.apply ? " (applied)" : " (report only; add --apply)"}`,
    `  cold days ${report.settings.coldDays}, retention days ${report.settings.retentionDays}`,
    `  facts to cold: ${report.factsCold}${report.factsColdIds.length ? ` (ids ${report.factsColdIds.join(", ")})` : ""}`,
    `  episodes to shorten: ${report.episodesShortened}, about ${report.charsRemoved} chars removed${report.episodeIds.length ? ` (ids ${report.episodeIds.join(", ")})` : ""}`,
  ];
  if (report.apply) lines.push(`  applied: ${report.applied.factsCold} fact(s) cold, ${report.applied.episodesShortened} episode(s) shortened`);
  lines.push("  no row was deleted");
  return lines.join("\n");
};
