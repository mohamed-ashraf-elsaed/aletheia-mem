// Paged list queries for the UI (T-203). Each function takes the store and returns { rows or items, total } for one
// page. Orders always end with a unique id so consecutive pages never overlap or skip a row. Nothing here writes.
import { slicePage } from "./paging.mjs";

const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const like = (text) => `%${String(text).replace(/[\\%_]/g, "\\$&")}%`;
const MINUTE = 60_000;

/** Review queue rows. Pending is oldest first (the order to work through); resolved is newest first. */
export function reviewRows(hub, { status = "pending", limit, offset, type = null, project = null } = {}) {
  const where = ["r.status = ?"];
  const params = [status];
  if (type) { where.push("r.item_type = ?"); params.push(type); }
  if (project) {
    where.push(`(
      (r.item_type = 'fact' AND EXISTS (SELECT 1 FROM facts f WHERE f.id = r.item_id AND f.project = ?))
      OR (r.item_type = 'rule' AND EXISTS (SELECT 1 FROM rule_suggestions s WHERE s.id = r.item_id AND s.project = ?))
      OR (r.item_type = 'entity' AND EXISTS (SELECT 1 FROM entities e WHERE e.id = r.item_id AND e.project = ?))
    )`);
    params.push(project, project, project);
  }
  const clause = `WHERE ${where.join(" AND ")}`;
  const total = hub.db.prepare(`SELECT COUNT(*) AS n FROM review_queue r ${clause}`).get(...params).n;
  const order = status === "pending" ? "r.created_at_epoch ASC, r.id ASC" : "coalesce(r.resolved_at_epoch, r.created_at_epoch) DESC, r.id DESC";
  const rows = hub.db.prepare(`SELECT r.* FROM review_queue r ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { rows, total };
}

/** The text and project behind a dismissed row, so the list can say what was hidden. */
function dismissedLabel(hub, type, id) {
  const table = { memory: ["memories", "title"], fact: ["facts", "text"], observation: ["observations", "title"], episode: ["episodes", "text"] }[type];
  if (!table) return null;
  try {
    const row = hub.db.prepare(`SELECT project, ${table[1]} AS label FROM ${table[0]} WHERE id = ?`).get(id);
    return row ? { project: row.project, label: oneLine(row.label).slice(0, 240) } : null;
  } catch {
    return null;
  }
}

export function dismissedPage(hub, { limit, offset, type = null, project = null } = {}) {
  hub.ensureDismissals?.();
  const where = [];
  const params = [];
  if (type) { where.push("d.item_type = ?"); params.push(type); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  // A project filter needs the target's project, so it is applied after the lookup and the total follows suit.
  if (project) {
    const all = hub.db.prepare(`SELECT d.item_type, d.item_id, d.reason, d.at_epoch FROM dismissals d ${clause} ORDER BY d.at_epoch DESC, d.item_type ASC, d.item_id DESC`).all(...params)
      .map((row) => ({ ...row, target: dismissedLabel(hub, row.item_type, row.item_id) }))
      .filter((row) => row.target?.project === project);
    return { total: all.length, items: slicePage(all, { limit, offset }).map(dismissedItem) };
  }
  const total = hub.db.prepare(`SELECT COUNT(*) AS n FROM dismissals d ${clause}`).get(...params).n;
  const rows = hub.db.prepare(`SELECT d.item_type, d.item_id, d.reason, d.at_epoch FROM dismissals d ${clause} ORDER BY d.at_epoch DESC, d.item_type ASC, d.item_id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return { total, items: rows.map((row) => dismissedItem({ ...row, target: dismissedLabel(hub, row.item_type, row.item_id) })) };
}

const dismissedItem = (row) => ({
  item_type: row.item_type,
  item_id: row.item_id,
  reason: row.reason,
  at_epoch: row.at_epoch,
  label: row.target?.label ?? null,
  project: row.target?.project ?? null,
});

export function auditPage(hub, { limit, offset, actor = null, action = null, since = null, until = null } = {}) {
  const where = [];
  const params = [];
  if (actor) { where.push("actor = ?"); params.push(actor); }
  if (action) { where.push("action LIKE ? ESCAPE '\\'"); params.push(like(action)); }
  if (Number.isFinite(since)) { where.push("at_epoch >= ?"); params.push(since); }
  if (Number.isFinite(until)) { where.push("at_epoch < ?"); params.push(until); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const total = hub.db.prepare(`SELECT COUNT(*) AS n FROM audit ${clause}`).get(...params).n;
  const rows = hub.db.prepare(`SELECT * FROM audit ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const parse = (value) => { try { return value ? JSON.parse(value) : null; } catch { return null; } };
  return { total, audit: rows.map((row) => ({ ...row, detail: parse(row.detail) })) };
}

export function ruleSuggestionsPage(hub, { limit, offset, project = null, status = null, q = null, sort = "newest" } = {}) {
  const where = [];
  const params = [];
  if (project) { where.push("project = ?"); params.push(project); }
  if (status) { where.push("status = ?"); params.push(status); }
  if (q) { where.push("(text LIKE ? ESCAPE '\\' OR when_text LIKE ? ESCAPE '\\')"); params.push(like(q), like(q)); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const order = sort === "confidence" ? "confidence DESC, id DESC" : sort === "oldest" ? "created_at_epoch ASC, id ASC" : "created_at_epoch DESC, id DESC";
  const total = hub.db.prepare(`SELECT COUNT(*) AS n FROM rule_suggestions ${clause}`).get(...params).n;
  const rows = hub.db.prepare(`SELECT * FROM rule_suggestions ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`).all(...params, limit, offset);
  return {
    total,
    items: rows.map((row) => ({ id: row.id, project: row.project, text: row.text, when: row.when_text, confidence: row.confidence, status: row.status, sourceType: row.source_type, createdAt: iso(row.created_at_epoch) })),
  };
}

/**
 * One page of sessions. A session is a (project, session id) pair seen in memories or in episodes; both sources
 * are merged the way the Work overview does it. Only the rows on the page get their last prompt looked up.
 */
export function sessionsPage(hub, { limit, offset, project = null, state = null, since = null, until = null, q = null, now = Date.now(), activeMinutes = 5 } = {}) {
  const pf = project ? "AND project = ?" : "";
  const pp = project ? [project] : [];
  const source = (table, promptExpr) => `SELECT project, session_id AS sid, MIN(created_at_epoch) AS firstAt, MAX(created_at_epoch) AS lastAt,
      SUM(CASE WHEN ${promptExpr} THEN 1 ELSE 0 END) AS prompts, SUM(CASE WHEN kind = 'event' THEN 1 ELSE 0 END) AS tools
    FROM ${table} WHERE session_id IS NOT NULL AND session_id <> '' ${pf} GROUP BY project, session_id`;
  const merged = `SELECT project, sid, MIN(firstAt) AS firstAt, MAX(lastAt) AS lastAt, MAX(prompts) AS prompts, MAX(tools) AS tools
    FROM (${source("memories", "kind = 'prompt'")} UNION ALL ${source("episodes", "role = 'user' OR kind = 'prompt'")}) GROUP BY project, sid`;
  const having = [];
  const params = [...pp, ...pp];
  const cutoff = now - activeMinutes * MINUTE;
  if (state === "in_progress") { having.push("lastAt >= ?"); params.push(cutoff); }
  if (state === "finished") { having.push("lastAt < ?"); params.push(cutoff); }
  if (Number.isFinite(since)) { having.push("lastAt >= ?"); params.push(since); }
  if (Number.isFinite(until)) { having.push("lastAt < ?"); params.push(until); }
  if (q) { having.push("sid LIKE ? ESCAPE '\\'"); params.push(like(q)); }
  const filtered = `SELECT * FROM (${merged}) ${having.length ? `WHERE ${having.join(" AND ")}` : ""}`;
  const total = hub.db.prepare(`SELECT COUNT(*) AS n FROM (${filtered})`).get(...params).n;
  const rows = hub.db.prepare(`${filtered} ORDER BY lastAt DESC, sid DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);
  const one = (sql, ...args) => { try { return hub.db.prepare(sql).get(...args) ?? null; } catch { return null; } };
  return {
    total,
    items: rows.map((row) => {
      const prompt = one("SELECT text FROM episodes WHERE project = ? AND session_id = ? AND (role = 'user' OR kind = 'prompt') ORDER BY created_at_epoch DESC, id DESC LIMIT 1", row.project, row.sid)
        ?? one("SELECT coalesce(nullif(narrative, ''), title) AS text FROM memories WHERE project = ? AND session_id = ? AND kind = 'prompt' ORDER BY created_at_epoch DESC, id DESC LIMIT 1", row.project, row.sid);
      const tool = one("SELECT tool FROM memories WHERE project = ? AND session_id = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1", row.project, row.sid)
        ?? one("SELECT tool FROM episodes WHERE project = ? AND session_id = ? ORDER BY created_at_epoch DESC, id DESC LIMIT 1", row.project, row.sid);
      return {
        id: row.sid,
        project: row.project,
        tool: tool?.tool ?? null,
        firstAt: iso(row.firstAt),
        lastAt: iso(row.lastAt),
        promptCount: row.prompts ?? 0,
        toolCount: row.tools ?? 0,
        state: row.lastAt >= cutoff ? "in_progress" : "finished",
        lastPrompt: prompt ? oneLine(prompt.text).slice(0, 300) : null,
        href: `#/work/session/${encodeURIComponent(row.sid)}?project=${encodeURIComponent(row.project)}`,
      };
    }),
  };
}

const SEARCH_CAP = 300;

/**
 * Search as one ordered list (facts first, then memories; `mix` alternates them) with a window. `totals` counts each kind; `capped` says the
 * ranking pool was full, so more may exist than the total shows.
 */
export function searchPage(hub, { query, project, kind, type, tool, scope = "current", includeHistory = false, asOf = null, since = null, until = null, limit, offset, mix = false } = {}) {
  const inRange = (item) => {
    const at = Date.parse(item.at);
    return (!Number.isFinite(since) || at >= since) && (!Number.isFinite(until) || at < until);
  };
  const facts = hub.searchFacts({ query, project, limit: SEARCH_CAP, pool: SEARCH_CAP, includeHistory, asOf, scope, cap: SEARCH_CAP }).filter(inRange);
  const memories = hub.ranked({ query, project, kind, type, tool, limit: SEARCH_CAP, pool: SEARCH_CAP, scope, includeHistory, cap: SEARCH_CAP })
    .map((m) => ({ id: m.id, kind: m.kind, type: m.type, title: m.title, project: m.project, tool: m.tool, pinned: m.pinned, at: new Date(m.created_at_epoch).toISOString() }))
    .filter(inRange);
  // mix alternates the two kinds so a short window (the header dropdown) shows both; the default lists facts first.
  const combined = mix
    ? Array.from({ length: Math.max(facts.length, memories.length) }, (_, i) => [facts[i], memories[i]]).flat().filter(Boolean)
    : [...facts, ...memories];
  const window = slicePage(combined, { limit, offset });
  return {
    total: combined.length,
    totals: { facts: facts.length, memories: memories.length },
    capped: facts.length >= SEARCH_CAP || memories.length >= SEARCH_CAP,
    facts: window.filter((item) => item.kind === "fact"),
    results: window.filter((item) => item.kind !== "fact"),
  };
}
