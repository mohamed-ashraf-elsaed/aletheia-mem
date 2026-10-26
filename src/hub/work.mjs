// The Work view's query layer. One place turns the hub tables into the sessions, facts, review items, queue
// state and captures the Work tab shows. It is read-only and every number comes from a row; no value is made up.
// Sessions are derived from episodes and memories: the worker writes one episode per captured memory, and a
// back-filled transcript writes episodes directly, so both sources are merged by (project, session_id).
import { healthReport } from "./health.mjs";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : fallback;
};

const memoryView = (memory) => ({
  id: memory.id,
  project: memory.project,
  kind: memory.kind,
  type: memory.type,
  title: memory.title,
  narrative: memory.narrative,
  tool: memory.tool,
  sessionId: memory.session_id ?? null,
  pinned: !!memory.pinned,
  at: iso(memory.created_at_epoch),
  createdAtEpoch: memory.created_at_epoch,
});

const factRow = (row) => ({
  id: row.id,
  project: row.project,
  text: row.text,
  subject: row.subject,
  predicate: row.predicate,
  object: row.object,
  status: row.status,
  confidence: row.confidence,
  recordedAt: iso(row.recorded_at_epoch),
  source: {
    episodeId: row.episode_id ?? null,
    sourceRef: row.sourceRef ?? row.source_ref ?? null,
    episodeText: (row.episodeText ?? row.episode_text ?? "").slice(0, 600) || null,
  },
});

function projectClause(project, alias = "") {
  return project ? `AND ${alias}project = ?` : "";
}

function reviewFilter(project) {
  if (!project) return { clause: "", params: [] };
  return {
    clause: `AND (
      (r.item_type = 'fact' AND EXISTS (SELECT 1 FROM facts f WHERE f.id = r.item_id AND f.project = ?))
      OR (r.item_type = 'rule' AND EXISTS (SELECT 1 FROM rule_suggestions s WHERE s.id = r.item_id AND s.project = ?))
      OR (r.item_type = 'entity' AND EXISTS (SELECT 1 FROM entities e WHERE e.id = r.item_id AND e.project = ?))
    )`,
    params: [project, project, project],
  };
}

function reviewItem(store, row) {
  const base = { id: row.id, type: row.item_type, itemId: row.item_id, reason: row.reason, status: row.status, createdAt: iso(row.created_at_epoch), label: `${row.item_type} #${row.item_id}`, project: null };
  try {
    if (row.item_type === "fact") {
      const fact = store.getFact(row.item_id);
      if (fact) return { ...base, label: fact.text, project: fact.project, factStatus: fact.status, confidence: fact.confidence };
    } else if (row.item_type === "rule") {
      const rule = store.db.prepare("SELECT text, project, confidence FROM rule_suggestions WHERE id = ?").get(row.item_id);
      if (rule) return { ...base, label: rule.text, project: rule.project, confidence: rule.confidence };
    } else if (row.item_type === "entity") {
      const entity = store.db.prepare("SELECT name, canonical_name, project FROM entities WHERE id = ?").get(row.item_id);
      if (entity) return { ...base, label: entity.canonical_name || entity.name, project: entity.project };
    }
  } catch {
    // a row whose target vanished stays as its id
  }
  return base;
}

function reviewData(store, project, limit) {
  const filter = reviewFilter(project);
  const pending = store.db.prepare(`SELECT COUNT(*) AS n FROM review_queue r WHERE r.status = 'pending' ${filter.clause}`).get(...filter.params).n;
  const rows = store.db.prepare(`SELECT r.* FROM review_queue r WHERE r.status = 'pending' ${filter.clause} ORDER BY r.created_at_epoch DESC, r.id DESC LIMIT ?`).all(...filter.params, limit);
  return { pending, items: rows.map((row) => reviewItem(store, row)) };
}

function lastCaptureByTool(store, project) {
  return store.db
    .prepare(`SELECT tool, MAX(created_at_epoch) AS at, COUNT(*) AS count FROM memories WHERE 1 = 1 ${projectClause(project)} GROUP BY tool ORDER BY at DESC`)
    .all(...(project ? [project] : []))
    .map((row) => ({ tool: row.tool, at: iso(row.at), count: row.count }));
}

function queueState(store) {
  const counts = { pending: 0, running: 0, failed: 0, done: 0 };
  for (const row of store.db.prepare("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").all()) {
    if (row.status in counts) counts[row.status] = row.n;
  }
  return { ...counts, depth: counts.pending + counts.running };
}

function dismissedRecent(store, project, now, hours) {
  const rows = store.db.prepare("SELECT item_type, item_id, reason, at_epoch FROM dismissals WHERE at_epoch >= ? ORDER BY at_epoch DESC, item_id DESC LIMIT 200").all(now - hours * HOUR);
  const out = [];
  for (const row of rows) {
    let target = null;
    try {
      if (row.item_type === "memory") target = store.db.prepare("SELECT project, title AS label FROM memories WHERE id = ?").get(row.item_id);
      else if (row.item_type === "fact") target = store.db.prepare("SELECT project, text AS label FROM facts WHERE id = ?").get(row.item_id);
      else if (row.item_type === "observation") target = store.db.prepare("SELECT project, title AS label FROM observations WHERE id = ?").get(row.item_id);
      else if (row.item_type === "episode") target = store.db.prepare("SELECT project, text AS label FROM episodes WHERE id = ?").get(row.item_id);
    } catch {
      target = null;
    }
    if (!target) continue;
    if (project && target.project !== project) continue;
    out.push({ type: row.item_type, itemId: row.item_id, reason: row.reason, at: iso(row.at_epoch), label: oneLine(target.label).slice(0, 180), project: target.project });
    if (out.length >= 20) break;
  }
  return out;
}

function latest(store, sql, ...params) {
  try {
    return store.db.prepare(sql).get(...params) ?? null;
  } catch {
    return null;
  }
}

/** Merge the memory and episode views of a session; use the larger count when both saw the same event. */
function sessionRows(store, project, now, activeMinutes, windowHours, limit) {
  const memories = store.db
    .prepare(`SELECT project, session_id AS sessionId, MIN(created_at_epoch) AS firstAt, MAX(created_at_epoch) AS lastAt,
      SUM(CASE WHEN kind = 'prompt' THEN 1 ELSE 0 END) AS promptCount,
      SUM(CASE WHEN kind = 'event' THEN 1 ELSE 0 END) AS toolCount,
      COUNT(*) AS rows
      FROM memories WHERE session_id IS NOT NULL AND session_id <> '' ${projectClause(project)}
      GROUP BY project, session_id`)
    .all(...(project ? [project] : []));
  const episodes = store.db
    .prepare(`SELECT project, session_id AS sessionId, MIN(created_at_epoch) AS firstAt, MAX(created_at_epoch) AS lastAt,
      SUM(CASE WHEN role = 'user' OR kind = 'prompt' THEN 1 ELSE 0 END) AS promptCount,
      SUM(CASE WHEN kind = 'event' THEN 1 ELSE 0 END) AS toolCount,
      COUNT(*) AS rows
      FROM episodes WHERE session_id IS NOT NULL AND session_id <> '' ${projectClause(project)}
      GROUP BY project, session_id`)
    .all(...(project ? [project] : []));

  const merged = new Map();
  const add = (row) => {
    const key = `${row.project}\u0000${row.sessionId}`;
    const current = merged.get(key);
    if (!current) {
      merged.set(key, { project: row.project, id: row.sessionId, firstAt: row.firstAt, lastAt: row.lastAt, promptCount: row.promptCount ?? 0, toolCount: row.toolCount ?? 0, sources: 1 });
      return;
    }
    current.firstAt = Math.min(current.firstAt ?? row.firstAt, row.firstAt);
    current.lastAt = Math.max(current.lastAt ?? row.lastAt, row.lastAt);
    current.promptCount = Math.max(current.promptCount, row.promptCount ?? 0);
    current.toolCount = Math.max(current.toolCount, row.toolCount ?? 0);
    current.sources++;
  };
  for (const row of episodes) add(row);
  for (const row of memories) add(row);

  const cutoff = now - windowHours * HOUR;
  return [...merged.values()]
    .filter((session) => (session.lastAt ?? 0) >= cutoff)
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0) || String(b.id).localeCompare(String(a.id)))
    .slice(0, limit)
    .map((session) => {
      const promptEpisode = latest(store, "SELECT text, created_at_epoch AS at, tool FROM episodes WHERE project = ? AND session_id = ? AND (role = 'user' OR kind = 'prompt') ORDER BY created_at_epoch DESC, id DESC LIMIT 1", session.project, session.id);
      const promptMemory = latest(store, "SELECT coalesce(nullif(narrative, ''), title) AS text, created_at_epoch AS at, tool FROM memories WHERE project = ? AND session_id = ? AND kind = 'prompt' ORDER BY created_at_epoch DESC, id DESC LIMIT 1", session.project, session.id);
      const lastPromptRow = promptEpisode ?? promptMemory;
      const summaryRow = latest(store, "SELECT id, coalesce(nullif(narrative, ''), title) AS text, created_at_epoch AS at, tool FROM memories WHERE project = ? AND session_id = ? AND kind = 'summary' ORDER BY created_at_epoch DESC, id DESC LIMIT 1", session.project, session.id);
      const toolRow = latest(store, "SELECT tool FROM memories WHERE project = ? AND session_id = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1", session.project, session.id)
        ?? latest(store, "SELECT tool FROM episodes WHERE project = ? AND session_id = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1", session.project, session.id);
      const sourceFacts = store.db
        .prepare(`SELECT f.*, e.source_ref AS sourceRef, e.text AS episodeText FROM facts f JOIN episodes e ON e.id = f.episode_id
          WHERE f.project = ? AND e.session_id = ?
          AND NOT EXISTS (SELECT 1 FROM dismissals d WHERE d.item_type = 'fact' AND d.item_id = f.id)
          ORDER BY CASE f.status WHEN 'active' THEN 0 ELSE 1 END, f.recorded_at_epoch DESC, f.id DESC LIMIT 8`)
        .all(session.project, session.id)
        .map(factRow);
      return {
        id: session.id,
        project: session.project,
        tool: toolRow?.tool ?? null,
        firstAt: iso(session.firstAt),
        lastAt: iso(session.lastAt),
        lastAtEpoch: session.lastAt,
        promptCount: session.promptCount,
        toolCount: session.toolCount,
        state: now - (session.lastAt ?? 0) <= activeMinutes * MINUTE ? "in_progress" : "finished",
        lastPrompt: lastPromptRow ? { text: oneLine(lastPromptRow.text).slice(0, 500), at: iso(lastPromptRow.at) } : null,
        summary: summaryRow ? { id: summaryRow.id, text: summaryRow.text, at: iso(summaryRow.at) } : null,
        sourceFacts,
        href: `#/work/session/${encodeURIComponent(session.id)}?project=${encodeURIComponent(session.project)}`,
      };
    });
}

/** The whole Work overview, filtered to one project or all of them. */
export function workOverview(store, { project = null, now = Date.now(), sessionLimit, factLimit, reviewLimit, activeMinutes, windowHours, dismissedHours } = {}) {
  const scope = typeof project === "string" && project.trim() ? project.trim() : null;
  const sessions = sessionRows(store, scope, now, clamp(activeMinutes, 1, 1440, 5), clamp(windowHours, 1, 168, 24), clamp(sessionLimit, 1, 100, 20));
  const recentFacts = store.listFacts({ project: scope ?? undefined, history: false, limit: clamp(factLimit, 1, 100, 12), now }).items;
  const pinned = store.list({ project: scope ?? undefined, pinned: true, limit: 8 }).items.map(memoryView);
  const review = reviewData(store, scope, clamp(reviewLimit, 1, 50, 5));
  const ruleSuggestions = store.db
    .prepare(`SELECT id, project, text, when_text, confidence, created_at_epoch FROM rule_suggestions WHERE status = 'pending' ${projectClause(scope)} ORDER BY created_at_epoch DESC, id DESC LIMIT 5`)
    .all(...(scope ? [scope] : []))
    .map((row) => ({ id: row.id, project: row.project, text: row.text, when: row.when_text, confidence: row.confidence, createdAt: iso(row.created_at_epoch) }));
  const queue = queueState(store);
  const lastCapture = lastCaptureByTool(store, scope);
  const dismissed = dismissedRecent(store, scope, now, clamp(dismissedHours, 1, 168, 24));
  const health = healthReport(store);
  const empty = !sessions.length && !recentFacts.length && !pinned.length && review.pending === 0 && !ruleSuggestions.length && !lastCapture.length && queue.depth === 0;
  return {
    project: scope ?? "all",
    generatedAt: iso(now),
    health,
    sessions,
    recentFacts,
    pinned,
    review,
    ruleSuggestions,
    dismissed,
    queue,
    lastCapture,
    empty,
  };
}

/** One session's timeline, summary and facts. Read-only. */
export function sessionDetail(store, { sessionId, project = null, factLimit = 100 } = {}) {
  const id = String(sessionId ?? "").trim();
  if (!id) return null;
  const candidates = store.db
    .prepare(`SELECT project, MAX(at) AS at FROM (
      SELECT project, created_at_epoch AS at FROM episodes WHERE session_id = ?
      UNION ALL SELECT project, created_at_epoch AS at FROM memories WHERE session_id = ?
    ) GROUP BY project ORDER BY at DESC`)
    .all(id, id);
  if (!candidates.length) return null;
  const chosen = typeof project === "string" && project.trim() && candidates.some((row) => row.project === project.trim()) ? project.trim() : candidates[0].project;
  const episodes = store.db.prepare("SELECT * FROM episodes WHERE session_id = ? AND project = ? ORDER BY coalesce(turn_index, 1000000), created_at_epoch, id").all(id, chosen);
  const memories = store.db.prepare("SELECT * FROM memories WHERE session_id = ? AND project = ? ORDER BY created_at_epoch, id").all(id, chosen);
  const summaryRow = store.db.prepare("SELECT id, coalesce(nullif(narrative, ''), title) AS text, created_at_epoch AS at FROM memories WHERE session_id = ? AND project = ? AND kind = 'summary' ORDER BY created_at_epoch DESC, id DESC LIMIT 1").get(id, chosen);
  const summaryEpisodeIds = new Set(episodes.filter((episode) => episode.kind === "summary").map((episode) => episode.id));

  const timeline = episodes.length
    ? episodes
        .filter((episode) => !summaryEpisodeIds.has(episode.id) || String(episode.text) !== String(summaryRow?.text ?? ""))
        .map((episode) => ({
          id: episode.id,
          kind: episode.role === "user" || episode.kind === "prompt" ? "prompt" : episode.kind === "event" ? "tool" : episode.kind,
          text: episode.text,
          at: iso(episode.created_at_epoch),
          tool: episode.tool,
          source: episode.source_ref,
        }))
    : memories
        .filter((memory) => memory.kind !== "summary")
        .map((memory) => ({
          id: memory.id,
          kind: memory.kind === "prompt" ? "prompt" : memory.kind === "event" ? "tool" : memory.kind,
          text: memory.narrative || memory.title,
          at: iso(memory.created_at_epoch),
          tool: memory.tool,
          source: `memory:${memory.id}`,
        }));
  if (summaryRow) timeline.push({ id: summaryRow.id, kind: "summary", text: summaryRow.text, at: iso(summaryRow.at), tool: null, source: "memory" });
  timeline.sort((a, b) => String(a.at ?? "").localeCompare(String(b.at ?? "")) || Number(a.id) - Number(b.id));

  const facts = store.db
    .prepare(`SELECT f.*, e.source_ref AS sourceRef, e.text AS episodeText FROM facts f JOIN episodes e ON e.id = f.episode_id
      WHERE e.session_id = ? AND f.project = ?
      AND NOT EXISTS (SELECT 1 FROM dismissals d WHERE d.item_type = 'fact' AND d.item_id = f.id)
      ORDER BY CASE f.status WHEN 'active' THEN 0 ELSE 1 END, f.recorded_at_epoch DESC, f.id DESC LIMIT ?`)
    .all(id, chosen, clamp(factLimit, 1, 500, 100))
    .map(factRow);

  const firstAt = [episodes[0]?.created_at_epoch, memories[0]?.created_at_epoch].filter(Number.isFinite).sort((a, b) => a - b)[0] ?? null;
  const lastAt = [episodes.at(-1)?.created_at_epoch, memories.at(-1)?.created_at_epoch].filter(Number.isFinite).sort((a, b) => b - a)[0] ?? null;
  return {
    id,
    project: chosen,
    projects: candidates.map((row) => row.project),
    tool: memories.at(-1)?.tool ?? episodes.at(-1)?.tool ?? null,
    firstAt: iso(firstAt),
    lastAt: iso(lastAt),
    promptCount: timeline.filter((item) => item.kind === "prompt").length,
    toolCount: timeline.filter((item) => item.kind === "tool").length,
    summary: summaryRow ? { id: summaryRow.id, text: summaryRow.text, at: iso(summaryRow.at) } : null,
    timeline,
    facts,
  };
}
