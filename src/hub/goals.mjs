// Owner goals, rule-based only. The source is `memories.kind = 'prompt'`: the text a person typed into a host's
// prompt box. Tool events, assistant text and summaries are never read here. A goal is a repeated imperative
// topic across different sessions; a goal with one session is not shown, because it is not repeated work.
//
// Pin and dismiss are settings arrays keyed by a stable goal id derived from (scope, verb, object). Nothing is
// applied to the database from this module; it only reads prompt rows and writes those two settings.
import { sha256 } from "../lib/hash.mjs";

const MINUTE = 60_000;
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);
const clamp = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : fallback;
};
const promptKey = (text) => sha256(oneLine(text).slice(0, 2000));

const VERBS = new Set([
  "add", "build", "create", "fix", "make", "update", "change", "remove", "delete", "refactor", "rename",
  "move", "write", "document", "test", "improve", "reduce", "increase", "support", "migrate", "investigate",
  "check", "ensure", "use", "avoid", "replace", "split", "merge", "optimize", "speed", "clean", "implement",
  "introduce", "extract", "convert", "upgrade", "downgrade", "review", "verify", "rewrite", "simplify",
]);

const LEAD = /^(please\s+|can you\s+|could you\s+|would you\s+|i want to\s+|i need to\s+|we need to\s+|let'?s\s+|help me\s+)+/i;
const STOP = new Set([
  "a", "an", "the", "to", "for", "of", "in", "on", "at", "by", "with", "and", "or", "but", "from", "into",
  "this", "that", "these", "those", "it", "its", "my", "our", "your", "be", "is", "are", "was", "were", "so",
  "up", "down", "out", "off", "again", "also", "please", "can", "you", "i", "we", "need", "want", "now", "then",
  "when", "while", "after", "before", "should", "must", "have", "has", "do", "does", "not", "no", "yes", "all",
]);

/** "please add a retry button to checkout" -> {verb: "add", key: "add retry"}. Null for anything not imperative. */
export function imperativeTopic(text) {
  const clean = oneLine(text).toLowerCase().replace(LEAD, "");
  const words = clean.match(/[a-z][a-z0-9'’-]*/g) ?? [];
  if (!words.length) return null;
  const verb = words[0];
  if (!VERBS.has(verb)) return null;
  const object = words.slice(1).filter((word) => !STOP.has(word) && word.length > 1);
  if (object.length < 2) return null;
  return { verb, key: `${verb} ${object.slice(0, 2).join(" ")}`, object: object.slice(0, 5).join(" ") };
}

function settingSet(store, key) {
  const value = store.setting(key, []);
  return new Set(Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
}

/** Goals repeated in at least two different sessions. Sorted pinned first, then by session count. */
export function proposeGoals(store, { project = null, now = Date.now(), minSessions, limit } = {}) {
  const scope = typeof project === "string" && project.trim() ? project.trim() : null;
  const memoryRows = store.db
    .prepare(`SELECT id, project, session_id, title, narrative, created_at_epoch FROM memories
      WHERE kind = 'prompt' ${scope ? "AND project = ?" : ""}
      ORDER BY created_at_epoch ASC, id ASC`)
    .all(...(scope ? [scope] : []));
  const episodeRows = store.db
    .prepare(`SELECT id, project, session_id, text, created_at_epoch FROM episodes
      WHERE role = 'user' AND session_id IS NOT NULL AND session_id <> '' ${scope ? "AND project = ?" : ""}
      ORDER BY created_at_epoch ASC, id ASC`)
    .all(...(scope ? [scope] : []));

  const pinned = settingSet(store, "work.goals.pinned");
  const dismissed = settingSet(store, "work.goals.dismissed");
  const groups = new Map();

  // A hook-captured prompt and its back-filled transcript episode are the same turn; dedupe by text hash
  // within the same session so an episode does not double-count a prompt already captured by the hook.
  const sessionKey = (project, sessionId) => `${project}\u0000${sessionId}`;
  const promptKeys = new Map();
  for (const row of memoryRows) {
    if (!row.session_id) continue;
    const text = oneLine(row.narrative || row.title);
    if (!text) continue;
    const key = sessionKey(row.project, row.session_id);
    let set = promptKeys.get(key);
    if (!set) promptKeys.set(key, (set = new Set()));
    set.add(promptKey(text));
  }

  const addRow = (id, project, sessionId, text, at, source) => {
    const cleanText = oneLine(text);
    if (!cleanText) return;
    const topic = imperativeTopic(cleanText);
    if (!topic) return;
    const key = `${scope ?? "all"}|${topic.key}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, verb: topic.verb, object: topic.object, id: sha256(key).slice(0, 16), quotes: [], sessions: new Set(), projects: new Set(), firstAt: at, lastAt: at };
      groups.set(key, group);
    }
    const qid = source === "episode" ? `episode:${id}` : id;
    if (group.quotes.some((quote) => quote.id === qid)) return;
    group.quotes.push({ id: qid, sessionId: sessionId ?? null, project, at: iso(at), text: cleanText.slice(0, 240), source });
    group.sessions.add(sessionId ? sessionKey(project, sessionId) : `${source}:${id}`);
    group.projects.add(project);
    group.firstAt = Math.min(group.firstAt, at);
    group.lastAt = Math.max(group.lastAt, at);
  };

  for (const row of memoryRows) addRow(row.id, row.project, row.session_id, row.narrative || row.title, row.created_at_epoch, "memory");
  for (const row of episodeRows) {
    const text = oneLine(row.text);
    if (promptKeys.get(sessionKey(row.project, row.session_id))?.has(promptKey(text))) continue;
    addRow(row.id, row.project, row.session_id, row.text, row.created_at_epoch, "episode");
  }

  const all = [...groups.values()]
    .filter((group) => group.sessions.size >= clamp(minSessions, 2, 20, 2))
    .map((group) => ({
      id: group.id,
      key: group.key,
      verb: group.verb,
      object: group.object,
      label: group.quotes[0].text.slice(0, 120),
      count: group.quotes.length,
      sessionCount: group.sessions.size,
      projects: [...group.projects],
      firstSeen: iso(group.firstAt),
      lastSeen: iso(group.lastAt),
      lastSeenEpoch: group.lastAt,
      pinned: pinned.has(group.id),
      dismissed: dismissed.has(group.id),
      quotes: group.quotes.slice(-20),
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.sessionCount - a.sessionCount || b.count - a.count || b.lastSeenEpoch - a.lastSeenEpoch);

  const max = clamp(limit, 1, 100, 20);
  return {
    project: scope ?? "all",
    generatedAt: iso(now),
    goals: all.filter((goal) => !goal.dismissed).slice(0, max),
    dismissedGoals: all.filter((goal) => goal.dismissed),
    pinned: [...pinned],
  };
}

/** pin, unpin, dismiss, restore. Reversible: dismiss only adds an id to a settings list. */
export function goalAction(store, id, { action, actor = "ui", now = Date.now() } = {}) {
  const goalId = String(id ?? "").trim();
  if (!/^[a-f0-9]{16}$/.test(goalId)) throw new RangeError("A goal id is 16 hex characters.");
  if (!["pin", "unpin", "dismiss", "restore"].includes(action)) throw new RangeError("action must be pin, unpin, dismiss or restore.");
  const pinned = settingSet(store, "work.goals.pinned");
  const dismissed = settingSet(store, "work.goals.dismissed");
  if (action === "pin") { pinned.add(goalId); dismissed.delete(goalId); }
  if (action === "unpin") pinned.delete(goalId);
  if (action === "dismiss") { dismissed.add(goalId); pinned.delete(goalId); }
  if (action === "restore") dismissed.delete(goalId);
  store.setSetting("work.goals.pinned", [...pinned].slice(-200));
  store.setSetting("work.goals.dismissed", [...dismissed].slice(-200));
  store.audit(actor, `goal.${action}`, { id: goalId, at: now });
  return { id: goalId, action, pinned: pinned.has(goalId), dismissed: dismissed.has(goalId) };
}
