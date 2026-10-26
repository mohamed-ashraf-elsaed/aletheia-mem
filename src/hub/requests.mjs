// Requests: group sessions into one card per human request. A request is a set of sessions in one project that
// share a goal (the owner's own imperative prompt, via goals.mjs) and are close in time. Every number and status
// comes from a stored row; nothing is simulated. Sessions with no imperative prompt share the "no-goal" key.
//
// This module is read-only except for pin/dismiss settings, which are keyed by a stable request id.
import { sha256 } from "../lib/hash.mjs";
import { imperativeTopic } from "./goals.mjs";

const MINUTE = 60_000;
const HOUR = 3_600_000;
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);
const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : fallback;
};
const promptKey = (text) => sha256(oneLine(text).slice(0, 2000));
const NO_GOAL = "no-goal";

function settingSet(store, key) {
  const value = store.setting(key, []);
  return new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
}

/** One session as a merged memory + episode view, with its prompts and tool events as evidence rows. */
function sessionGroups(store, scope) {
  const memories = store.db
    .prepare(`SELECT id, project, session_id, kind, title, narrative, tool, created_at_epoch FROM memories
      WHERE session_id IS NOT NULL AND session_id <> '' ${scope ? "AND project = ?" : ""}
      ORDER BY created_at_epoch ASC, id ASC`)
    .all(...(scope ? [scope] : []));
  const episodes = store.db
    .prepare(`SELECT id, project, session_id, role, kind, text, tool, created_at_epoch FROM episodes
      WHERE session_id IS NOT NULL AND session_id <> '' ${scope ? "AND project = ?" : ""}
      ORDER BY created_at_epoch ASC, id ASC`)
    .all(...(scope ? [scope] : []));

  const map = new Map();
  const key = (project, sessionId) => `${project}\u0000${sessionId}`;
  const get = (project, sessionId) => {
    const k = key(project, sessionId);
    if (!map.has(k)) map.set(k, { project, sessionId, firstAt: null, lastAt: null, prompts: [], tools: [] });
    return map.get(k);
  };
  const touch = (session, at) => {
    session.firstAt = Math.min(session.firstAt ?? at, at);
    session.lastAt = Math.max(session.lastAt ?? at, at);
  };

  for (const m of memories) {
    const session = get(m.project, m.session_id);
    touch(session, m.created_at_epoch);
    const text = oneLine(m.narrative || m.title);
    if (m.kind === "prompt") session.prompts.push({ id: m.id, text, at: m.created_at_epoch, source: "memory" });
    else if (m.kind === "event") session.tools.push({ id: m.id, text, at: m.created_at_epoch, source: "memory" });
  }
  for (const e of episodes) {
    const session = get(e.project, e.session_id);
    touch(session, e.created_at_epoch);
    const text = oneLine(e.text);
    if (e.role === "user" || e.kind === "prompt") session.prompts.push({ id: e.id, text, at: e.created_at_epoch, source: "episode" });
    else if (e.role === "tool" || e.kind === "event") session.tools.push({ id: e.id, text, at: e.created_at_epoch, source: "episode" });
  }

  for (const session of map.values()) {
    // A hook-captured prompt and its back-filled transcript episode are the same turn; dedupe by text hash.
    const seen = new Set();
    session.prompts = session.prompts
      .filter((p) => (seen.has(promptKey(p.text)) ? false : (seen.add(promptKey(p.text)), true)))
      .sort((a, b) => a.at - b.at || a.id - b.id);
    session.tools.sort((a, b) => a.at - b.at || a.id - b.id);
    session.ended = store.sessionEnd(session.project, session.sessionId) ?? null;
  }
  return [...map.values()];
}

function requestTitle(sessions) {
  const first = sessions[0];
  if (!first) return null;
  const prompt = first.prompts[0];
  const text = prompt ? prompt.text : oneLine(first.tools[0]?.text);
  return text ? text.slice(0, 200) : "Untitled request";
}

function requestStatus(sessions, { now, activeMs }) {
  const last = sessions[sessions.length - 1];
  const lastAt = Math.max(...sessions.map((session) => session.lastAt ?? 0));
  const lastPromptAt = Math.max(0, ...sessions.flatMap((session) => session.prompts.map((p) => p.at)));
  const lastToolAt = sessions.flatMap((session) => session.tools.map((t) => t.at)).reduce((max, at) => Math.max(max, at), 0);
  const active = !last.ended && now - lastAt <= activeMs;
  if (active) return "Working";
  if (last.ended) return "Shipped";
  if (lastPromptAt > lastToolAt) return "Waiting on you";
  return "Idle";
}

function buildRequest(sessions, { now, activeMs, project }) {
  const sorted = sessions.slice().sort((a, b) => (a.firstAt ?? 0) - (b.firstAt ?? 0) || String(a.sessionId).localeCompare(String(b.sessionId)));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstAt = first.firstAt ?? null;
  const lastAt = Math.max(...sorted.map((session) => session.lastAt ?? 0));
  const firstPrompt = first.prompts[0];
  const topic = firstPrompt ? imperativeTopic(firstPrompt.text) : null;
  const status = requestStatus(sorted, { now, activeMs });
  const goalKey = topic?.key ?? NO_GOAL;
  const id = sha256(`${first.project}\u0000${goalKey}\u0000${first.sessionId}`).slice(0, 16);
  const ended = !!last.ended;
  return {
    id,
    project: first.project,
    goalKey: goalKey === NO_GOAL ? null : goalKey,
    goal: topic?.object ?? null,
    title: requestTitle(sorted),
    askedBy: "you",
    status,
    stage: topic?.object ?? null,
    startedAt: iso(firstAt),
    startedAtEpoch: firstAt,
    lastAt: iso(lastAt),
    lastAtEpoch: lastAt,
    runningTimeMs: Math.max(0, (ended ? lastAt : now) - firstAt),
    sessionCount: sorted.length,
    promptCount: sorted.reduce((sum, session) => sum + session.prompts.length, 0),
    toolCount: sorted.reduce((sum, session) => sum + session.tools.length, 0),
    ended,
    evidence: {
      sessionIds: sorted.map((session) => session.sessionId),
      promptIds: sorted.flatMap((session) => session.prompts.map((p) => p.id)),
      toolIds: sorted.flatMap((session) => session.tools.map((t) => t.id)),
    },
    projectFilter: project ?? null,
  };
}

/** Group sessions into requests. Read-only. */
export function proposeRequests(store, { project = null, now = Date.now(), maxGapHours, activeMinutes, limit } = {}) {
  const scope = typeof project === "string" && project.trim() ? project.trim() : null;
  const gapMs = clamp(maxGapHours, 1, 24 * 30, 24) * HOUR;
  const activeMs = clamp(activeMinutes, 1, 1440, 5) * MINUTE;
  const sessions = sessionGroups(store, scope);

  const groups = new Map();
  for (const session of sessions) {
    const firstPrompt = session.prompts[0];
    const topic = firstPrompt ? imperativeTopic(firstPrompt.text) : null;
    const goalKey = topic?.key ?? NO_GOAL;
    const key = `${session.project}\u0000${goalKey}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(session);
  }

  const clusters = [];
  for (const list of groups.values()) {
    list.sort((a, b) => (a.firstAt ?? 0) - (b.firstAt ?? 0) || String(a.sessionId).localeCompare(String(b.sessionId)));
    let cluster = [];
    for (const session of list) {
      const previous = cluster[cluster.length - 1];
      if (previous && (session.firstAt ?? 0) - (previous.lastAt ?? 0) > gapMs) {
        clusters.push(cluster);
        cluster = [];
      }
      cluster.push(session);
    }
    if (cluster.length) clusters.push(cluster);
  }

  const dismissed = settingSet(store, "work.requests.dismissed");
  const all = clusters
    .map((cluster) => buildRequest(cluster, { now, activeMs, project: scope }))
    .sort((a, b) => (b.lastAtEpoch ?? 0) - (a.lastAtEpoch ?? 0) || b.startedAtEpoch - a.startedAtEpoch || String(b.id).localeCompare(String(a.id)));
  const max = clamp(limit, 1, 100, 20);
  return {
    project: scope ?? "all",
    generatedAt: iso(now),
    requests: all.filter((request) => !dismissed.has(request.id)).slice(0, max),
    dismissedRequests: all.filter((request) => dismissed.has(request.id)),
    counts: {
      working: all.filter((request) => request.status === "Working").length,
      idle: all.filter((request) => request.status === "Idle").length,
      shipped: all.filter((request) => request.status === "Shipped").length,
      waitingOnYou: all.filter((request) => request.status === "Waiting on you").length,
      total: all.length,
    },
    empty: all.length === 0,
  };
}

/** One request's "where this came from": its sessions, the owner's prompts, tool events and source facts. */
export function requestDetail(store, { requestId, project = null, now = Date.now() } = {}) {
  const id = String(requestId ?? "").trim();
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  const { requests } = proposeRequests(store, { project, now, limit: 100 });
  const request = requests.find((candidate) => candidate.id === id);
  if (!request) return null;

  const sessions = request.evidence.sessionIds.map((sessionId) => {
    const prompts = store.db
      .prepare(`SELECT id, coalesce(nullif(narrative, ''), title) AS text, created_at_epoch AS at FROM memories WHERE project = ? AND session_id = ? AND kind = 'prompt' ORDER BY created_at_epoch, id`)
      .all(request.project, sessionId);
    const episodePrompts = store.db
      .prepare(`SELECT id, text, created_at_epoch AS at FROM episodes WHERE project = ? AND session_id = ? AND (role = 'user' OR kind = 'prompt') ORDER BY created_at_epoch, id`)
      .all(request.project, sessionId);
    const tools = store.db
      .prepare(`SELECT id, created_at_epoch AS at FROM memories WHERE project = ? AND session_id = ? AND kind = 'event' UNION ALL
        SELECT id, created_at_epoch AS at FROM episodes WHERE project = ? AND session_id = ? AND (role = 'tool' OR kind = 'event')`)
      .all(request.project, sessionId, request.project, sessionId);
    const facts = store.db
      .prepare(`SELECT f.*, e.source_ref AS sourceRef FROM facts f JOIN episodes e ON e.id = f.episode_id
        WHERE f.project = ? AND e.session_id = ?
        AND NOT EXISTS (SELECT 1 FROM dismissals d WHERE d.item_type = 'fact' AND d.item_id = f.id)
        ORDER BY f.recorded_at_epoch DESC, f.id DESC LIMIT 20`)
      .all(request.project, sessionId)
      .map((row) => ({ id: row.id, text: row.text, subject: row.subject, predicate: row.predicate, object: row.object, status: row.status, recordedAt: iso(row.recorded_at_epoch), sourceRef: row.sourceRef ?? null }));
    const ended = store.sessionEnd(request.project, sessionId);
    const times = [...prompts, ...episodePrompts, ...tools].map((row) => row.at).filter(Number.isFinite);
    const firstAt = times.length ? Math.min(...times) : null;
    const lastAt = times.length ? Math.max(...times) : null;
    return {
      sessionId,
      project: request.project,
      firstAt: iso(firstAt),
      lastAt: iso(lastAt),
      prompts: [...prompts, ...episodePrompts].map((row) => ({ id: row.id, text: oneLine(row.text).slice(0, 500), at: iso(row.at) })),
      facts,
      ended: ended ? iso(ended.ended_at_epoch) : null,
    };
  });

  return { ...request, whereThisCameFrom: { sessions, promptCount: sessions.reduce((sum, session) => sum + session.prompts.length, 0), factCount: sessions.reduce((sum, session) => sum + session.facts.length, 0) } };
}

/** Dismiss or restore a request. Reversible: dismiss only adds an id to a settings list. */
export function requestAction(store, id, { action, actor = "ui", now = Date.now() } = {}) {
  const requestId = String(id ?? "").trim();
  if (!/^[a-f0-9]{16}$/.test(requestId)) throw new RangeError("A request id is 16 hex characters.");
  if (!["dismiss", "restore"].includes(action)) throw new RangeError("action must be dismiss or restore.");
  const dismissed = settingSet(store, "work.requests.dismissed");
  if (action === "dismiss") dismissed.add(requestId);
  else dismissed.delete(requestId);
  store.setSetting("work.requests.dismissed", [...dismissed].slice(-200));
  store.audit(actor, `request.${action}`, { id: requestId, at: now });
  return { id: requestId, action, dismissed: dismissed.has(requestId) };
}
