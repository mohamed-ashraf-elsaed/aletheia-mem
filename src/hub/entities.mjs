// Entities: project-scoped named things (people, services, files, repos, libraries, concepts, orgs) and the
// alias resolver. Candidates come from extractor output and from cheap rules over the fact text. Resolution is
// deliberately conservative: exact canonical name, then normalised name, then an explicit alias, then a single
// high-confidence string match. An ambiguous match creates the new row and goes to the review queue.
export const ENTITY_TYPES = ["person", "service", "file", "repo", "library", "concept", "org"];

export const ALIAS_AUTO = 0.95;
export const ALIAS_REVIEW = 0.9;
export const MAX_ENTITY_CANDIDATES = 12;

const SUFFIXES = new Set(["inc", "ltd", "llc", "corp", "co", "gmbh"]);
const FILE_EXT = /\.(?:mjs|cjs|js|ts|tsx|jsx|json|md|markdown|py|rb|go|rs|java|kt|kts|php|c|h|cpp|hpp|sh|bash|yml|yaml|toml|ini|sql)$/i;
const PATH = /(?:^|[\s(`"'])((?:[\w.@-]+\/)+[\w.@-]+(?:\.[\w]+)?)(?=$|[\s)`"',:;])/g;
const GITHUB = /github\.com[/:]([\w.-]+)\/([\w.-]+)/g;
const AUTHOR = /^\s*Author:\s*([^<\n]{2,80})</gim;
const SERVICE = /\b(?:the\s+)?([\w.-]+(?:\s+[\w.-]+)?)\s+(?:service|api|worker)\b/gi;

/** Lower-case, trim, collapse separators, and drop a trailing company suffix. Paths keep their slashes. */
export function normalizeName(name) {
  const clean = String(name ?? "")
    .trim()
    .replace(/^[.\/]+/, "")
    .replace(/[_\s]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (!clean) return "";
  const parts = clean.split(" ");
  if (parts.length > 1 && SUFFIXES.has(parts.at(-1))) parts.pop();
  return parts.join(" ");
}

const aliasKey = (name) => String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** Jaro similarity, then the Winkler prefix boost. Returns 0 for empty input. */
export function jaroWinkler(a, b) {
  const s1 = String(a ?? "");
  const s2 = String(b ?? "");
  if (!s1.length || !s2.length) return 0;
  if (s1 === s2) return 1;
  const window = Math.max(0, Math.floor(Math.max(s1.length, s2.length) / 2) - 1);
  const m1 = new Array(s1.length).fill(false);
  const m2 = new Array(s2.length).fill(false);
  let matches = 0;
  for (let i = 0; i < s1.length; i++) {
    for (let j = Math.max(0, i - window); j < Math.min(i + window + 1, s2.length); j++) {
      if (!m2[j] && s1[i] === s2[j]) {
        m1[i] = true;
        m2[j] = true;
        matches++;
        break;
      }
    }
  }
  if (!matches) return 0;
  let transpositions = 0;
  let k = 0;
  for (let i = 0; i < s1.length; i++) {
    if (!m1[i]) continue;
    while (!m2[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  const jaro = (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  let prefix = 0;
  while (prefix < 4 && prefix < s1.length && prefix < s2.length && s1[prefix] === s2[prefix]) prefix++;
  return jaro + prefix * 0.1 * (1 - jaro);
}

/** The declared type wins; otherwise infer from the shape of the name. */
export function inferType(name, declared = null) {
  if (ENTITY_TYPES.includes(declared)) return declared;
  const text = String(name ?? "");
  if (/^https?:\/\//i.test(text) && /github\.com/i.test(text)) return "repo";
  if (FILE_EXT.test(text) || text.includes("/")) return "file";
  if (/^@[\w.-]+\/[\w.-]+$/.test(text)) return "library";
  if (/\b(service|api|worker|server)\b/i.test(text)) return "service";
  return "concept";
}

/** Cheap, deterministic candidates from one piece of text. Never invents a type it cannot support. */
export function ruleCandidates(text) {
  const out = new Map();
  const add = (name, type) => {
    const clean = String(name ?? "").trim().replace(/[.,;:]+$/, "");
    if (clean.length < 2 || clean.length > 120) return;
    const key = `${normalizeName(clean)}|${type}`;
    if (!out.has(key)) out.set(key, { name: clean, type });
  };
  for (const match of String(text ?? "").matchAll(PATH)) {
    const value = match[1];
    if (value.startsWith("http") || value.includes("://")) continue;
    add(value, "file");
  }
  for (const match of String(text ?? "").matchAll(GITHUB)) add(`${match[1]}/${match[2]}`, "repo");
  for (const match of String(text ?? "").matchAll(AUTHOR)) add(match[1].trim(), "person");
  for (const match of String(text ?? "").matchAll(SERVICE)) add(`${match[1].trim()} service`, "service");
  return [...out.values()].slice(0, MAX_ENTITY_CANDIDATES);
}

export function getEntity(store, id) {
  return store.db.prepare("SELECT * FROM entities WHERE id = ?").get(Number(id)) ?? null;
}

export function listEntities(store, { project, type, limit = 500 } = {}) {
  const where = [];
  const params = [];
  if (project) { where.push("project = ?"); params.push(project); }
  if (type) { where.push("type = ?"); params.push(type); }
  const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return store.db.prepare(`SELECT * FROM entities ${clause} ORDER BY id LIMIT ?`).all(...params, Math.min(Number(limit) || 500, 5000));
}

export function aliasesOf(store, entityId) {
  return store.db.prepare("SELECT alias, confidence FROM entity_aliases WHERE entity_id = ? ORDER BY alias").all(Number(entityId));
}

const addAlias = (store, entityId, alias, confidence = 1) => {
  const key = aliasKey(alias);
  if (!key) return false;
  const info = store.db.prepare("INSERT OR IGNORE INTO entity_aliases (alias, entity_id, confidence) VALUES (?,?,?)").run(key, Number(entityId), confidence);
  return info.changes > 0;
};

function findExact(store, { project, canonical, type }) {
  return store.db.prepare("SELECT * FROM entities WHERE project = ? AND canonical_name = ? AND type = ?").get(project, canonical, type) ?? null;
}

function findAlias(store, { project, alias, type }) {
  const key = aliasKey(alias);
  if (!key) return null;
  return store.db
    .prepare("SELECT e.* FROM entity_aliases a JOIN entities e ON e.id = a.entity_id WHERE a.alias = ? AND e.project = ? AND e.type = ? ORDER BY a.confidence DESC, e.id LIMIT 1")
    .get(key, project, type) ?? null;
}

function pendingReview(store, entityId, reason) {
  return store.db.prepare("SELECT 1 FROM review_queue WHERE item_type = 'entity' AND item_id = ? AND reason = ? AND status = 'pending'").get(Number(entityId), reason);
}

/**
 * Find or create one entity. `confirm` means the two names were seen together (same fact) or a model said so, which
 * is what allows a 0.90-0.95 string match outside the exact path. An ambiguous match still creates the row and
 * queues a review instead of guessing.
 */
export function upsertEntity(store, { project, name, type = null, now = Date.now(), confirm = false } = {}) {
  const raw = String(name ?? "").trim();
  const canonical = normalizeName(raw);
  if (!canonical) return { id: null, created: false, reason: "empty" };
  const entityType = inferType(raw, type);
  const exact = findExact(store, { project, canonical, type: entityType });
  if (exact) {
    addAlias(store, exact.id, raw);
    return { id: exact.id, created: false, matched: "canonical", entity: exact };
  }
  const aliased = findAlias(store, { project, alias: raw, type: entityType });
  if (aliased) return { id: aliased.id, created: false, matched: "alias", entity: aliased };

  const candidates = store.db.prepare("SELECT * FROM entities WHERE project = ? AND type = ?").all(project, entityType)
    .map((entity) => ({ entity, score: jaroWinkler(canonical, entity.canonical_name) }))
    .filter((item) => item.score >= ALIAS_REVIEW)
    .sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const ambiguous = candidates.length > 1 && candidates[1].score >= ALIAS_REVIEW;
  if (best && !ambiguous && (best.score >= ALIAS_AUTO || confirm)) {
    addAlias(store, best.entity.id, raw, Math.round(best.score * 1000) / 1000);
    store.audit("extract", "entity.alias", { alias: raw, entity: best.entity.id, score: Math.round(best.score * 1000) / 1000, confirmed: !!confirm });
    return { id: best.entity.id, created: false, matched: "similar", score: best.score, entity: getEntity(store, best.entity.id) };
  }

  const info = store.db.prepare("INSERT OR IGNORE INTO entities (project, name, canonical_name, type, created_at_epoch) VALUES (?,?,?,?,?)")
    .run(project, raw, canonical, entityType, now);
  const entity = findExact(store, { project, canonical, type: entityType });
  const created = info.changes > 0;
  addAlias(store, entity.id, raw);
  store.audit("extract", "entity.add", { id: entity.id, name: raw, type: entityType, created });
  if (ambiguous) {
    if (!pendingReview(store, entity.id, "ambiguous_alias")) {
      store.addReview({ itemType: "entity", itemId: entity.id, reason: "ambiguous_alias", proposedBy: "extractor", now });
    }
  }
  return { id: entity.id, created, matched: "new", entity, review: ambiguous ? "ambiguous_alias" : null };
}

/** Which role the name plays in one fact. A name that appears in both sides is the subject. */
export function roleFor(name, subject, object) {
  const key = normalizeName(name);
  if (!key) return "participant";
  if (normalizeName(subject).includes(key) || key.includes(normalizeName(subject))) return "subject";
  if (normalizeName(object).includes(key) || key.includes(normalizeName(object))) return "object";
  return "participant";
}

/**
 * Create entities for one stored fact and link them. Uses the extractor's own `entities` first, then the rule
 * candidates that are literally in the fact text. Returns { entities, created, reviews }.
 */
export function attachFactEntities(store, { factId, project, subject, object, text, entities = [], now = Date.now() } = {}) {
  const fact = store.getFact(factId);
  if (!fact) return { entities: 0, created: 0, reviews: [] };
  const declared = [...(entities ?? [])];
  const known = new Set(declared.map((entity) => normalizeName(entity.name)));
  for (const candidate of ruleCandidates(`${subject} ${object} ${text}`)) {
    if (!known.has(normalizeName(candidate.name))) {
      declared.push(candidate);
      known.add(normalizeName(candidate.name));
    }
  }
  let created = 0;
  const reviews = [];
  for (const candidate of declared.slice(0, MAX_ENTITY_CANDIDATES)) {
    const result = upsertEntity(store, { project, name: candidate.name, type: candidate.type, now, confirm: true });
    if (!result.id) continue;
    const role = roleFor(result.entity?.canonical_name ?? candidate.name, fact.subject, fact.object);
    store.db.prepare("INSERT OR IGNORE INTO fact_entities (fact_id, entity_id, role) VALUES (?,?,?)").run(fact.id, result.id, role);
    store.addKey({ ownerType: "fact", ownerId: fact.id, keyType: "entity", text: result.entity?.name ?? candidate.name });
    if (result.created) created++;
    if (result.review) reviews.push({ entityId: result.id, reason: result.review });
  }
  return { entities: declared.length, created, reviews };
}

/** Resolve one name against a project without creating anything. Used by alias tests and inspection. */
export function resolveEntity(store, { project, name, type = null } = {}) {
  const canonical = normalizeName(name);
  const entityType = inferType(name, type);
  const exact = findExact(store, { project, canonical, type: entityType });
  if (exact) return { matched: "canonical", entity: exact };
  const alias = findAlias(store, { project, alias: name, type: entityType });
  if (alias) return { matched: "alias", entity: alias };
  const candidates = store.db.prepare("SELECT * FROM entities WHERE project = ? AND type = ?").all(project, entityType)
    .map((entity) => ({ entity, score: jaroWinkler(canonical, entity.canonical_name) }))
    .filter((item) => item.score >= ALIAS_REVIEW)
    .sort((a, b) => b.score - a.score);
  if (!candidates.length) return { matched: null, entity: null };
  if (candidates.length > 1) return { matched: "ambiguous", candidates: candidates.map((item) => item.entity) };
  return { matched: candidates[0].score >= ALIAS_AUTO ? "similar" : "review", entity: candidates[0].entity, score: candidates[0].score };
}
