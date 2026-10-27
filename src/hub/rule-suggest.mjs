// Rule suggestions: detect explicit user corrections in captured prompts and propose a rule for review. Nothing is
// written to `rules`: a suggestion is a row in `rule_suggestions` plus a pending item in `review_queue`. The owner
// decides whether it becomes a rule. Each suggestion records how often it was seen, its latest date and dated quotes,
// so strength (Strong / Steady / Light) comes from stored rows.
export const SUGGESTION_SOURCES = ["prompt", "episode"];
export const MAX_SUGGESTION_CHARS = 300;

const SENTENCE = /[^.!?\n]{4,240}/g;
const oneLine = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);

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

/** Strength from how often a suggestion was seen. Thresholds are documented here. */
export function ruleStrength(timesSeen) {
  const n = Number(timesSeen) || 0;
  if (n >= 5) return "Strong";
  if (n >= 3) return "Steady";
  return "Light";
}

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
    .prepare(`SELECT 'memory' AS source_type, id AS source_id, project, session_id, coalesce(narrative, title, '') AS text, created_at_epoch AS at
              FROM memories WHERE kind = 'prompt' ${project ? "AND project = ?" : ""} ORDER BY id DESC LIMIT ?`)
    .all(...(project ? [project] : []), Math.min(Number(limit) || 500, 5000));
  const episodes = store.db
    .prepare(`SELECT 'episode' AS source_type, id AS source_id, project, session_id, text, created_at_epoch AS at
              FROM episodes WHERE role = 'user' ${project ? "AND project = ?" : ""} ORDER BY id DESC LIMIT ?`)
    .all(...(project ? [project] : []), Math.min(Number(limit) || 500, 5000));
  return [...prompts, ...episodes];
}

/**
 * Scan captured prompts and user episodes for corrections, count how often each one was seen, and record dated
 * quotes. Idempotent on (project, rule text): a second run updates times_seen and latest_at and adds no duplicate
 * quotes. Returns {proposed, skipped, ids}.
 */
export function suggestRules(store, { project = null, limit = 500, now = Date.now() } = {}) {
  const groups = new Map();
  for (const row of sources(store, { project, limit })) {
    for (const candidate of correctionsIn(row.text)) {
      const key = `${row.project}\n${candidate.text.toLowerCase()}`;
      if (!groups.has(key)) groups.set(key, { project: row.project, text: candidate.text, confidence: candidate.confidence, pattern: candidate.pattern, quotes: [] });
      groups.get(key).quotes.push({ text: oneLine(row.text).slice(0, 240), at: row.at, sourceType: row.source_type, sourceId: Number(row.source_id), sessionId: row.session_id ?? null });
    }
  }

  let proposed = 0;
  let skipped = 0;
  const ids = [];
  for (const group of groups.values()) {
    const timesSeen = group.quotes.length;
    const latestAt = Math.max(...group.quotes.map((quote) => quote.at));
    const existing = store.db.prepare("SELECT * FROM rule_suggestions WHERE project = ? AND lower(text) = lower(?)").get(group.project, group.text);
    let id;
    if (existing) {
      store.db.prepare("UPDATE rule_suggestions SET times_seen = ?, latest_at_epoch = ? WHERE id = ?").run(timesSeen, latestAt, existing.id);
      id = existing.id;
      skipped++;
    } else {
      const info = store.db
        .prepare("INSERT INTO rule_suggestions (project, text, when_text, confidence, source_type, source_id, status, created_at_epoch, times_seen, latest_at_epoch) VALUES (?,?,?,?,?,?, 'pending', ?, ?, ?)")
        .run(group.project, group.text, "", group.confidence, group.quotes[0].sourceType, group.quotes[0].sourceId, now, timesSeen, latestAt);
      id = Number(info.lastInsertRowid);
      store.addReview({ itemType: "rule", itemId: id, reason: "rule_suggestion", proposedBy: "extractor", now });
      store.audit("extract", "rule.suggest", { id, project: group.project, pattern: group.pattern, source: `${group.quotes[0].sourceType}:${group.quotes[0].sourceId}` });
      proposed++;
      ids.push(id);
    }
    const insertQuote = store.db.prepare("INSERT INTO rule_suggestion_quotes (suggestion_id, project, text, at_epoch, source_type, source_id, session_id) VALUES (?,?,?,?,?,?,?)");
    const hasQuote = store.db.prepare("SELECT 1 FROM rule_suggestion_quotes WHERE suggestion_id = ? AND text = ? AND at_epoch = ?");
    for (const quote of group.quotes) {
      if (hasQuote.get(id, quote.text, quote.at)) continue;
      insertQuote.run(id, group.project, quote.text, quote.at, quote.sourceType, quote.sourceId, quote.sessionId);
    }
  }
  return { proposed, skipped, ids };
}

function suggestionView(store, row) {
  const quotes = store.db.prepare("SELECT id, text, at_epoch, source_type, source_id, session_id FROM rule_suggestion_quotes WHERE suggestion_id = ? ORDER BY at_epoch DESC, id DESC").all(row.id);
  const timesSeen = Number(row.times_seen ?? quotes.length) || 1;
  return {
    ...row,
    timesSeen,
    strength: ruleStrength(timesSeen),
    latestAt: iso(row.latest_at_epoch ?? Math.max(0, ...quotes.map((quote) => quote.at_epoch))),
    quotes: quotes.map((quote) => ({ id: quote.id, text: quote.text, at: iso(quote.at_epoch), sourceType: quote.source_type, sourceId: quote.source_id, sessionId: quote.session_id ?? null })),
    moreQuotes: Math.max(0, quotes.length - 2),
  };
}

export function listSuggestions(store, { project, status = "pending", limit = 100 } = {}) {
  const where = [];
  const params = [];
  if (project) { where.push("project = ?"); params.push(project); }
  if (status) { where.push("status = ?"); params.push(status); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return store.db.prepare(`SELECT * FROM rule_suggestions ${clause} ORDER BY created_at_epoch DESC, id DESC LIMIT ?`)
    .all(...params, Math.min(Number(limit) || 100, 500))
    .map((row) => suggestionView(store, row));
}
