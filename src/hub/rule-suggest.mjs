// Rule suggestions: detect explicit user corrections in captured prompts and propose a rule for review. Nothing is
// written to `rules`: a suggestion is a row in `rule_suggestions` plus a pending item in `review_queue`. The owner
// decides whether it becomes a rule.
export const SUGGESTION_SOURCES = ["prompt", "episode"];
export const MAX_SUGGESTION_CHARS = 300;

const SENTENCE = /[^.!?\n]{4,240}/g;

// Order matters: the more specific "use A, not B" wins over the plain "use A".
const PATTERNS = [
  { name: "use_not", confidence: 0.8, re: /\b(?:no[,.]?\s*)?(?:please\s+)?use\s+(.{2,100}?)\s+(?:instead of|rather than|not)\s+(.{2,100})$/i, build: (m) => `Use ${tidy(m[1]).replace(/[,;]+$/, "")}, not ${tidy(m[2]).replace(/[,;]+$/, "")}` },
  { name: "always", confidence: 0.75, re: /\b(?:no[,.]?\s*)?(?:please\s+)?always\s+(.{3,180})$/i, build: (m) => `Always ${m[1]}` },
  { name: "never", confidence: 0.75, re: /\b(?:no[,.]?\s*)?(?:please\s+)?never\s+(.{3,180})$/i, build: (m) => `Never ${m[1]}` },
  { name: "dont", confidence: 0.7, re: /\b(?:no[,.]?\s*)?(?:please\s+)?(?:don'?t|do not)\s+(?:ever\s+)?(.{3,180})$/i, build: (m) => `Do not ${m[1]}` },
  { name: "no_use", confidence: 0.75, re: /\bno[,.]?\s+(?:please\s+)?use\s+(.{2,140})$/i, build: (m) => `Use ${m[1]}` },
  { name: "from_now", confidence: 0.8, re: /\b(?:from now on|going forward)[,:]?\s+(.{3,180})$/i, build: (m) => m[1].charAt(0).toUpperCase() + m[1].slice(1) },
];

const tidy = (text) => String(text ?? "").replace(/\s+/g, " ").replace(/^[\s,;:-]+|[\s,;:-]+$/g, "").trim();

/** Return the proposed rule text and confidence for one sentence, or null. */
export function matchCorrection(sentence) {
  const text = tidy(sentence);
  if (text.length < 6 || text.length > 240) return null;
  for (const pattern of PATTERNS) {
    const match = pattern.re.exec(text);
    if (!match) continue;
    const rule = tidy(pattern.build(match)).slice(0, MAX_SUGGESTION_CHARS);
    if (rule.length < 6) continue;
    return { text: rule, confidence: pattern.confidence, pattern: pattern.name };
  }
  return null;
}

/** All correction candidates in a block of text, one per sentence. */
export function correctionsIn(text) {
  const out = [];
  const seen = new Set();
  for (const sentence of String(text ?? "").match(SENTENCE) ?? []) {
    const found = matchCorrection(sentence);
    if (!found || seen.has(found.text.toLowerCase())) continue;
    seen.add(found.text.toLowerCase());
    out.push(found);
  }
  return out;
}

function sources(store, { project, limit = 500 } = {}) {
  const prompts = store.db
    .prepare(`SELECT 'memory' AS source_type, id AS source_id, project, coalesce(narrative, title, '') AS text, created_at_epoch AS at
              FROM memories WHERE kind = 'prompt' ${project ? "AND project = ?" : ""} ORDER BY id DESC LIMIT ?`)
    .all(...(project ? [project] : []), Math.min(Number(limit) || 500, 5000));
  const episodes = store.db
    .prepare(`SELECT 'episode' AS source_type, id AS source_id, project, text, created_at_epoch AS at
              FROM episodes WHERE role = 'user' ${project ? "AND project = ?" : ""} ORDER BY id DESC LIMIT ?`)
    .all(...(project ? [project] : []), Math.min(Number(limit) || 500, 5000));
  return [...prompts, ...episodes];
}

/**
 * Scan captured prompts and user episodes for corrections and queue each one for review. Idempotent on
 * (project, rule text). Returns {proposed, skipped, ids}.
 */
export function suggestRules(store, { project = null, limit = 500, now = Date.now() } = {}) {
  const seen = new Set();
  const existing = new Set(store.db.prepare("SELECT project || '\\n' || lower(text) AS key FROM rule_suggestions").all().map((row) => row.key));
  let proposed = 0;
  let skipped = 0;
  const ids = [];
  for (const row of sources(store, { project, limit })) {
    for (const candidate of correctionsIn(row.text)) {
      const key = `${row.project}\n${candidate.text.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (existing.has(key)) { skipped++; continue; }
      const info = store.db
        .prepare("INSERT OR IGNORE INTO rule_suggestions (project, text, when_text, confidence, source_type, source_id, status, created_at_epoch) VALUES (?,?,?,?,?,?, 'pending', ?)")
        .run(row.project, candidate.text, "", candidate.confidence, row.source_type, Number(row.source_id), now);
      if (!info.changes) { skipped++; continue; }
      const id = Number(info.lastInsertRowid);
      store.addReview({ itemType: "rule", itemId: id, reason: "rule_suggestion", proposedBy: "extractor", now });
      store.audit("extract", "rule.suggest", { id, project: row.project, pattern: candidate.pattern, source: `${row.source_type}:${row.source_id}` });
      proposed++;
      ids.push(id);
    }
  }
  return { proposed, skipped, ids };
}

export function listSuggestions(store, { project, status = "pending", limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (project) { where.push("project = ?"); params.push(project); }
  if (status) { where.push("status = ?"); params.push(status); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return store.db.prepare(`SELECT * FROM rule_suggestions ${clause} ORDER BY created_at_epoch DESC, id DESC LIMIT ?`).all(...params, Math.min(Number(limit) || 100, 500));
}
