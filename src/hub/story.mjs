// Build story: counts (shipped, working, waiting on you), a shipping-velocity line from stored shipped dates, and
// "what it learned about how you work" from repeated corrections in the owner's own prompts. Rule-based only.
import { sha256 } from "../lib/hash.mjs";
import { correctionsIn } from "./rule-suggest.mjs";
import { proposeRequests } from "./requests.mjs";

const DAY = 86_400_000;
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);
const promptKey = (text) => sha256(oneLine(text).slice(0, 2000));

function isoWeek(epoch) {
  const date = new Date(epoch);
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((d - yearStart) / 86_400_000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Repeated corrections in the owner's own prompts, grouped by rule text with dated quotes. */
export function learnedPreferences(store, { project = null } = {}) {
  const scope = typeof project === "string" && project.trim() ? project.trim() : null;
  const memories = store.db
    .prepare(`SELECT id, coalesce(nullif(narrative, ''), title) AS text, created_at_epoch AS at, session_id, project FROM memories
      WHERE kind = 'prompt' ${scope ? "AND project = ?" : ""} ORDER BY created_at_epoch ASC, id ASC`)
    .all(...(scope ? [scope] : []))
    .map((row) => ({ ...row, source: "memory" }));
  const episodes = store.db
    .prepare(`SELECT id, text, created_at_epoch AS at, session_id, project FROM episodes
      WHERE role = 'user' ${scope ? "AND project = ?" : ""} ORDER BY created_at_epoch ASC, id ASC`)
    .all(...(scope ? [scope] : []))
    .map((row) => ({ ...row, source: "episode" }));

  const groups = new Map();
  const seen = new Set();
  for (const row of [...memories, ...episodes]) {
    const key = `${row.project}\u0000${row.session_id ?? ""}\u0000${promptKey(row.text)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    for (const correction of correctionsIn(row.text)) {
      const lower = correction.text.toLowerCase();
      if (!groups.has(lower)) groups.set(lower, { text: correction.text, pattern: correction.pattern, confidence: correction.confidence, quotes: [] });
      groups.get(lower).quotes.push({ text: oneLine(row.text).slice(0, 240), at: iso(row.at), atEpoch: row.at, sessionId: row.session_id ?? null, source: row.source, sourceId: row.id });
    }
  }

  return [...groups.values()]
    .map((group) => ({ ...group, timesSeen: group.quotes.length, latestAt: iso(Math.max(...group.quotes.map((quote) => quote.atEpoch))) }))
    .sort((a, b) => b.timesSeen - a.timesSeen || String(b.latestAt ?? "").localeCompare(String(a.latestAt ?? "")));
}

export function buildStory(store, { project = null, now = Date.now(), maxGapHours, activeMinutes, limit } = {}) {
  const requests = proposeRequests(store, { project, now, maxGapHours, activeMinutes, limit }).requests;
  const shipped = requests.filter((request) => request.status === "Shipped");
  const perWeek = new Map();
  for (const request of shipped) {
    if (!Number.isFinite(request.lastAtEpoch)) continue;
    const week = isoWeek(request.lastAtEpoch);
    perWeek.set(week, (perWeek.get(week) ?? 0) + 1);
  }
  const velocityLine = [...perWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, count]) => ({ week, shipped: count }));
  const durations = shipped
    .map((request) => request.lastAtEpoch - request.startedAtEpoch)
    .filter((ms) => Number.isFinite(ms) && ms >= 0);
  const averageDaysToShip = durations.length ? Math.round((durations.reduce((sum, ms) => sum + ms, 0) / durations.length) / DAY * 10) / 10 : null;
  const learned = learnedPreferences(store, { project });

  return {
    project: typeof project === "string" && project.trim() ? project.trim() : "all",
    generatedAt: iso(now),
    counts: {
      shipped: shipped.length,
      working: requests.filter((request) => request.status === "Working").length,
      waitingOnYou: requests.filter((request) => request.status === "Waiting on you").length,
      idle: requests.filter((request) => request.status === "Idle").length,
      total: requests.length,
    },
    velocity: {
      totalShipped: shipped.length,
      averageDaysToShip,
      perWeek: velocityLine,
    },
    learned,
    empty: requests.length === 0 && learned.length === 0,
  };
}
