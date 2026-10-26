// HubStore: the free, tool-neutral memory store. One SQLite file (WAL) that any AI tool can write to through
// the REST API, the MCP server, or the capture CLI, and that you can export whole.
//   memories  observations, summaries, prompts, notes and raw events from any tool, with full-text search
//   rules     your standing instructions, each optionally limited to some tools
//   audit     who changed what
import { Database } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { sha256 } from "../lib/hash.mjs";
import { contentTerms, ftsAnyQuery, normalize, orExpr, packVector, rrf, topKByVector, unpackVector } from "./retrieval.mjs";

const SCHEMA_VERSION = 3; // 3: episodes, observations, facts, entities, keys, links, queue and usage

export const KINDS = ["observation", "summary", "prompt", "note", "event"];
export const TYPES = ["bugfix", "feature", "refactor", "change", "discovery", "decision", "note", "gotcha", "event"];
export const BUNDLE_VERSION = 1;

const json = (v) => (v == null ? null : typeof v === "string" ? v : JSON.stringify(v));
const parse = (v) => {
  if (v == null || v === "") return [];
  try {
    return JSON.parse(v);
  } catch {
    return [String(v)];
  }
};
const clean = (v, max) => (typeof v === "string" ? v.slice(0, max) : v == null ? null : String(v).slice(0, max));

const SCHEMA = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL DEFAULT 'default',
  scope TEXT NOT NULL DEFAULT 'project',
  kind TEXT NOT NULL DEFAULT 'observation',
  type TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT,
  narrative TEXT,
  facts TEXT,
  concepts TEXT,
  files TEXT,
  tool TEXT NOT NULL DEFAULT 'unknown',
  session_id TEXT,
  pinned INTEGER NOT NULL DEFAULT 0,
  origin TEXT,
  content_hash TEXT NOT NULL UNIQUE,
  created_at_epoch INTEGER NOT NULL,
  updated_at_epoch INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_memories_project_time ON memories(project, created_at_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_memories_order ON memories(pinned DESC, created_at_epoch DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_memories_project_order ON memories(project, pinned DESC, created_at_epoch DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind, created_at_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_memories_tool ON memories(tool);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(title, subtitle, narrative, facts, concepts, content='memories', content_rowid='id', tokenize='porter unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, subtitle, narrative, facts, concepts) VALUES (new.id, new.title, new.subtitle, new.narrative, new.facts, new.concepts);
END;
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, subtitle, narrative, facts, concepts) VALUES ('delete', old.id, old.title, old.subtitle, old.narrative, old.facts, old.concepts);
END;
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, subtitle, narrative, facts, concepts) VALUES ('delete', old.id, old.title, old.subtitle, old.narrative, old.facts, old.concepts);
  INSERT INTO memories_fts(rowid, title, subtitle, narrative, facts, concepts) VALUES (new.id, new.title, new.subtitle, new.narrative, new.facts, new.concepts);
END;
CREATE TABLE IF NOT EXISTS rules (
  id TEXT PRIMARY KEY,
  scope_tier TEXT NOT NULL DEFAULT 'everywhere',
  scope_name TEXT NOT NULL DEFAULT 'Everywhere',
  when_text TEXT NOT NULL DEFAULT '',
  then_text TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  tools TEXT,
  source TEXT NOT NULL DEFAULT 'you',
  created_at_epoch INTEGER NOT NULL,
  updated_at_epoch INTEGER NOT NULL
);
CREATE VIRTUAL TABLE IF NOT EXISTS memories_vocab USING fts5vocab(memories_fts, 'row');
CREATE TABLE IF NOT EXISTS memory_vectors (
  memory_id INTEGER PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vec BLOB NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at_epoch INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/** Schema v3 adds the memory-building tables. Every statement is CREATE IF NOT EXISTS and additive. */
export const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'project',
  tool TEXT NOT NULL DEFAULT 'unknown',
  session_id TEXT,
  turn_index INTEGER,
  role TEXT NOT NULL DEFAULT 'user',
  kind TEXT NOT NULL DEFAULT 'message',
  text TEXT NOT NULL,
  source_ref TEXT,
  content_hash TEXT NOT NULL UNIQUE,
  token_count INTEGER,
  extracted_at_epoch INTEGER,
  created_at_epoch INTEGER NOT NULL,
  recorded_at_epoch INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_episodes_project_time ON episodes(project, created_at_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_session ON episodes(session_id, turn_index);
CREATE INDEX IF NOT EXISTS idx_episodes_hash ON episodes(content_hash);
CREATE INDEX IF NOT EXISTS idx_episodes_pending ON episodes(extracted_at_epoch, id);

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  legacy_memory_id INTEGER UNIQUE,
  project TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'project',
  session_id TEXT,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL DEFAULT '',
  subtitle TEXT,
  narrative TEXT NOT NULL DEFAULT '',
  importance REAL NOT NULL DEFAULT 0.5,
  importance_components TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  pinned INTEGER NOT NULL DEFAULT 0,
  edited_at_epoch INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  origin TEXT,
  content_hash TEXT NOT NULL UNIQUE,
  created_at_epoch INTEGER NOT NULL,
  updated_at_epoch INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_observations_project_time ON observations(project, created_at_epoch DESC);
CREATE INDEX IF NOT EXISTS idx_observations_episode ON observations(episode_id);

CREATE TABLE IF NOT EXISTS facts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id INTEGER REFERENCES observations(id) ON DELETE SET NULL,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE RESTRICT,
  project TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'project',
  subject TEXT NOT NULL,
  predicate TEXT NOT NULL,
  object TEXT NOT NULL,
  text TEXT NOT NULL,
  valid_from_epoch INTEGER,
  valid_to_epoch INTEGER,
  recorded_at_epoch INTEGER NOT NULL,
  expired_at_epoch INTEGER,
  confidence REAL NOT NULL DEFAULT 0.8,
  supersedes_id INTEGER REFERENCES facts(id),
  status TEXT NOT NULL DEFAULT 'active',
  extractor_mode TEXT NOT NULL DEFAULT 'rules',
  prompt_version TEXT,
  model TEXT,
  content_hash TEXT NOT NULL UNIQUE,
  created_at_epoch INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_facts_project_subject ON facts(project, subject);
CREATE INDEX IF NOT EXISTS idx_facts_valid ON facts(project, valid_from_epoch, valid_to_epoch);
CREATE INDEX IF NOT EXISTS idx_facts_observation ON facts(observation_id);
CREATE INDEX IF NOT EXISTS idx_facts_episode ON facts(episode_id);
CREATE VIRTUAL TABLE IF NOT EXISTS facts_fts USING fts5(text, subject, predicate, object, content='facts', content_rowid='id', tokenize='porter unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS facts_ai AFTER INSERT ON facts BEGIN
  INSERT INTO facts_fts(rowid, text, subject, predicate, object) VALUES (new.id, new.text, new.subject, new.predicate, new.object);
END;
CREATE TRIGGER IF NOT EXISTS facts_ad AFTER DELETE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, text, subject, predicate, object) VALUES ('delete', old.id, old.text, old.subject, old.predicate, old.object);
END;
CREATE TRIGGER IF NOT EXISTS facts_au AFTER UPDATE ON facts BEGIN
  INSERT INTO facts_fts(facts_fts, rowid, text, subject, predicate, object) VALUES ('delete', old.id, old.text, old.subject, old.predicate, old.object);
  INSERT INTO facts_fts(rowid, text, subject, predicate, object) VALUES (new.id, new.text, new.subject, new.predicate, new.object);
END;

CREATE TABLE IF NOT EXISTS entities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  name TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  type TEXT NOT NULL,
  created_at_epoch INTEGER NOT NULL,
  UNIQUE(project, canonical_name, type)
);
CREATE TABLE IF NOT EXISTS entity_aliases (
  alias TEXT NOT NULL,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  confidence REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY(alias, entity_id)
);
CREATE TABLE IF NOT EXISTS fact_entities (
  fact_id INTEGER NOT NULL REFERENCES facts(id) ON DELETE CASCADE,
  entity_id INTEGER NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  PRIMARY KEY(fact_id, entity_id, role)
);
CREATE TABLE IF NOT EXISTS memory_links (
  from_type TEXT NOT NULL, from_id INTEGER NOT NULL,
  to_type TEXT NOT NULL, to_id INTEGER NOT NULL,
  relation TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  PRIMARY KEY(from_type, from_id, to_type, to_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_links_from ON memory_links(from_type, from_id);
CREATE INDEX IF NOT EXISTS idx_links_to ON memory_links(to_type, to_id);

CREATE TABLE IF NOT EXISTS memory_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_type TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  key_type TEXT NOT NULL,
  text TEXT NOT NULL,
  source TEXT NOT NULL,
  UNIQUE(owner_type, owner_id, key_type, text)
);
CREATE INDEX IF NOT EXISTS idx_keys_owner ON memory_keys(owner_type, owner_id);
CREATE VIRTUAL TABLE IF NOT EXISTS memory_keys_fts USING fts5(text, content='memory_keys', content_rowid='id', tokenize='porter unicode61 remove_diacritics 2');
CREATE TRIGGER IF NOT EXISTS memory_keys_ai AFTER INSERT ON memory_keys BEGIN
  INSERT INTO memory_keys_fts(rowid, text) VALUES (new.id, new.text);
END;
CREATE TRIGGER IF NOT EXISTS memory_keys_ad AFTER DELETE ON memory_keys BEGIN
  INSERT INTO memory_keys_fts(memory_keys_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
CREATE TRIGGER IF NOT EXISTS memory_keys_au AFTER UPDATE ON memory_keys BEGIN
  INSERT INTO memory_keys_fts(memory_keys_fts, rowid, text) VALUES ('delete', old.id, old.text);
  INSERT INTO memory_keys_fts(rowid, text) VALUES (new.id, new.text);
END;

CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  scope TEXT NOT NULL,
  period_start_epoch INTEGER NOT NULL,
  period_end_epoch INTEGER NOT NULL,
  text TEXT NOT NULL,
  source_ids TEXT NOT NULL,
  token_count INTEGER,
  created_at_epoch INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS review_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  proposed_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at_epoch INTEGER NOT NULL,
  resolved_at_epoch INTEGER
);
CREATE INDEX IF NOT EXISTS idx_review_pending ON review_queue(status, created_at_epoch);

CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_epoch INTEGER NOT NULL DEFAULT 0,
  locked_at_epoch INTEGER,
  worker_id TEXT,
  last_error TEXT,
  created_at_epoch INTEGER NOT NULL,
  updated_at_epoch INTEGER NOT NULL,
  UNIQUE(type, payload)
);
CREATE INDEX IF NOT EXISTS idx_jobs_claim ON jobs(status, next_attempt_epoch, id);

CREATE TABLE IF NOT EXISTS fact_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at_epoch INTEGER NOT NULL,
  batch_id TEXT,
  model TEXT,
  mode TEXT NOT NULL DEFAULT 'rules',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  estimated_usd REAL NOT NULL DEFAULT 0,
  episodes INTEGER NOT NULL DEFAULT 0,
  facts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ok',
  error TEXT,
  raw_output TEXT
);
CREATE INDEX IF NOT EXISTS idx_usage_time ON fact_usage(at_epoch DESC);

CREATE TABLE IF NOT EXISTS fact_vectors (
  fact_id INTEGER PRIMARY KEY REFERENCES facts(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vec BLOB NOT NULL
);

CREATE TABLE IF NOT EXISTS rule_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  text TEXT NOT NULL,
  when_text TEXT NOT NULL DEFAULT '',
  confidence REAL NOT NULL DEFAULT 0.7,
  source_type TEXT NOT NULL DEFAULT 'prompt',
  source_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at_epoch INTEGER NOT NULL,
  UNIQUE(project, text)
);
CREATE INDEX IF NOT EXISTS idx_rule_suggestions_status ON rule_suggestions(status, created_at_epoch);
`;

export const targetSchemaVersion = SCHEMA_VERSION;

/** Read-only view of a database before migrating. Used by `aletheia migrate --dry-run`. */
export function inspectMigration(path) {
  if (!existsSync(path)) return { exists: false, path, version: 0, target: SCHEMA_VERSION, needsMigration: false, counts: null };
  const db = new Database(path, { readonly: true });
  try {
    const version = db.prepare("PRAGMA user_version").get().user_version;
    const number = (table) => {
      try {
        return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      } catch {
        return null;
      }
    };
    return {
      exists: true,
      path,
      version,
      target: SCHEMA_VERSION,
      needsMigration: version < SCHEMA_VERSION,
      counts: { memories: number("memories"), episodes: number("episodes"), observations: number("observations"), facts: number("facts") },
    };
  } finally {
    db.close();
  }
}

/** Fold a free-text query into an FTS5 expression: every word must match as a prefix. null when no words. */
export function ftsQuery(text) {
  const words = String(text ?? "").toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  return words.length ? words.map((w) => `"${w}"*`).join(" ") : null;
}

export class HubStore {
  constructor(path) {
    this.path = path;
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = NORMAL");
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.db.exec("PRAGMA foreign_keys = ON");
    const version = this.db.prepare("PRAGMA user_version").get().user_version;
    const hadMemories = !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'memories'").get();
    if (version > SCHEMA_VERSION) {
      this.db.close();
      throw new RangeError(`This database is schema v${version}; this build understands up to v${SCHEMA_VERSION}.`);
    }
    // v1 indexed without stemming. Drop the old index before the additive v3 migration so SCHEMA can rebuild it.
    if (hadMemories && version < 2) {
      for (const name of ["memories_ai", "memories_ad", "memories_au"]) this.db.exec(`DROP TRIGGER IF EXISTS ${name}`);
      this.db.exec("DROP TABLE IF EXISTS memories_fts");
      this.db.exec("DROP TABLE IF EXISTS memories_vocab");
    }
    // A hook opens the store on every event. Re-running the whole schema costs several milliseconds, so skip it
    // when this database already carries the current version (the version is written only after the schema runs).
    const ready = hadMemories && version === SCHEMA_VERSION;
    if (!ready) {
      this.db.exec(SCHEMA);
      if (hadMemories && version < 2) this.db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");
      if (hadMemories) {
        this.migrateV3();
      } else {
        this.db.exec(SCHEMA_V3);
        this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      }
    }
    this.vecCache = null;
    this.termOptions = { max: 12, maxShare: 0.6 }; // see selectTerms. Swept on LoCoMo (docs/14): 12/0.6 loses no recall; 8/0.35 lost ~8 points
    this.ensureScopeColumns();
    this.ensureRuleSuggestions();
  }

  /** Add the T-035 suggestion table to databases created before it existed. */
  ensureRuleSuggestions() {
    if (this.setting("schema.rule_suggestions", false)) return false;
    this.db.exec(`CREATE TABLE IF NOT EXISTS rule_suggestions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project TEXT NOT NULL,
      text TEXT NOT NULL,
      when_text TEXT NOT NULL DEFAULT '',
      confidence REAL NOT NULL DEFAULT 0.7,
      source_type TEXT NOT NULL DEFAULT 'prompt',
      source_id INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at_epoch INTEGER NOT NULL,
      UNIQUE(project, text)
    );
    CREATE INDEX IF NOT EXISTS idx_rule_suggestions_status ON rule_suggestions(status, created_at_epoch);`);
    this.setSetting("schema.rule_suggestions", true);
    return true;
  }

  /**
   * Add the T-033 `scope` column to databases created before it existed. Idempotent and recorded in settings, so a
   * hot hook path pays for the PRAGMA check once. Existing rows are project-scoped, which is the old behaviour.
   */
  ensureScopeColumns() {
    if (this.setting("schema.scope", false)) return { added: [] };
    const added = [];
    for (const table of ["memories", "episodes", "observations", "facts"]) {
      const columns = this.db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name);
      if (!columns.includes("scope")) {
        this.db.exec(`ALTER TABLE ${table} ADD COLUMN scope TEXT NOT NULL DEFAULT 'project'`);
        added.push(table);
      }
    }
    this.setSetting("schema.scope", true);
    return { added };
  }

  /** Promote one row to global scope. Project reads include global rows; nothing moves between projects. */
  promote(type, id, { actor = "ui" } = {}) {
    const table = { memory: "memories", episode: "episodes", observation: "observations", fact: "facts" }[String(type)];
    if (!table) throw new RangeError("Promote a memory, episode, observation or fact.");
    const key = Number(id);
    if (!Number.isSafeInteger(key)) throw new RangeError("A promotion needs a numeric id.");
    const row = this.db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(key);
    if (!row) throw new RangeError(`No ${type} #${key}.`);
    this.db.prepare(`UPDATE ${table} SET scope = 'global' WHERE id = ?`).run(key);
    this.audit(actor, "scope.promote", { type, id: key, project: row.project });
    return { type, id: key, scope: "global", project: row.project };
  }

  /**
   * Copy v2 memories into episodes and observations, add the v3 tables, and set the version, all in one
   * transaction. A failure rolls back and leaves user_version at 2 so the old code can still open the file.
   */
  migrateV3() {
    const already = this.db.prepare("PRAGMA user_version").get().user_version;
    if (already >= SCHEMA_VERSION) return { migrated: false, version: already };
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.db.exec(SCHEMA_V3);
      this.db.exec(`
        INSERT OR IGNORE INTO episodes (project, tool, session_id, turn_index, role, kind, text, source_ref, content_hash, created_at_epoch, recorded_at_epoch)
        SELECT project, tool, session_id, NULL, CASE WHEN kind = 'prompt' THEN 'user' ELSE 'tool' END, kind,
               CASE WHEN coalesce(narrative, '') <> '' THEN narrative ELSE title END,
               'memory:' || id, 'legacy-episode-' || id, created_at_epoch, created_at_epoch
        FROM memories WHERE kind IN ('prompt', 'event')
      `);
      this.db.exec(`
        INSERT OR IGNORE INTO observations (legacy_memory_id, project, session_id, episode_id, type, title, subtitle, narrative, origin, content_hash, created_at_epoch, updated_at_epoch)
        SELECT id, project, session_id, NULL, type, title, subtitle, coalesce(narrative, ''), origin, 'legacy-memory-' || id, created_at_epoch, updated_at_epoch
        FROM memories WHERE kind NOT IN ('prompt', 'event')
      `);
      const vectorColumns = this.db.prepare("PRAGMA table_info(memory_vectors)").all().map((column) => column.name);
      if (!vectorColumns.includes("owner_type")) this.db.exec("ALTER TABLE memory_vectors ADD COLUMN owner_type TEXT");
      if (!vectorColumns.includes("owner_id")) this.db.exec("ALTER TABLE memory_vectors ADD COLUMN owner_id INTEGER");
      this.db.exec("UPDATE memory_vectors SET owner_type = 'observation', owner_id = (SELECT legacy_memory_id FROM observations o WHERE o.legacy_memory_id = memory_vectors.memory_id) WHERE owner_type IS NULL");
      this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
      this.db.exec("COMMIT");
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // leave the file as it was
      }
      try {
        this.db.close();
      } catch {
        // ignore
      }
      throw error;
    }
    this.vecCache = null;
    return { migrated: true, version: SCHEMA_VERSION };
  }

  /** Row counts for the migration report. */
  migrationCounts() {
    const count = (table) => {
      try {
        return this.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
      } catch {
        return null;
      }
    };
    return { memories: count("memories"), episodes: count("episodes"), observations: count("observations"), facts: count("facts") };
  }

  audit(actor, action, detail) {
    this.db.prepare("INSERT INTO audit (at_epoch, actor, action, detail) VALUES (?,?,?,?)").run(Date.now(), actor, action, detail == null ? null : json(detail));
  }

  // ---- memories ---------------------------------------------------------------------------------------

  row(r) {
    return r && { ...r, facts: parse(r.facts), concepts: parse(r.concepts), files: parse(r.files), pinned: !!r.pinned };
  }

  /** Insert a memory. A memory with the same content (project, title, narrative) is not stored twice: returns the existing id. */
  add(input, { actor = "api", audit = true } = {}) {
    const title = clean(input.title, 400) ?? "";
    const narrative = clean(input.narrative ?? input.text, 20000);
    if (!title.trim() && !(narrative ?? "").trim()) throw new RangeError("A memory needs a title or text.");
    const project = clean(input.project, 200)?.trim() || "default";
    const kind = KINDS.includes(input.kind) ? input.kind : "observation";
    const hash = sha256(JSON.stringify([project, kind, title, narrative ?? ""]));
    const existing = this.db.prepare("SELECT id FROM memories WHERE content_hash = ?").get(hash);
    if (existing) return { id: existing.id, created: false };
    const at = Number.isFinite(input.createdAtEpoch) ? input.createdAtEpoch : Date.now();
    const info = this.db
      .prepare(`INSERT INTO memories (project, scope, kind, type, title, subtitle, narrative, facts, concepts, files, tool, session_id, pinned, origin, content_hash, created_at_epoch, updated_at_epoch)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(project, input.scope === "global" ? "global" : "project", kind, clean(input.type, 40) || (kind === "event" ? "event" : "note"), title, clean(input.subtitle, 400), narrative, json(input.facts), json(input.concepts), json(input.files),
        clean(input.tool, 60) || "unknown", clean(input.sessionId ?? input.session_id, 200), input.pinned ? 1 : 0, clean(input.origin, 200), hash, at, at);
    this.statsCache = null;
    if (actor !== "import" && audit) this.audit(actor, "memory.add", { id: Number(info.lastInsertRowid), kind, tool: input.tool ?? "unknown" });
    return { id: Number(info.lastInsertRowid), created: true };
  }

  get(id) {
    return this.row(this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id));
  }

  getMany(ids) {
    const list = [...new Set(ids.map(Number).filter(Number.isSafeInteger))].slice(0, 200);
    if (!list.length) return [];
    return this.db.prepare(`SELECT * FROM memories WHERE id IN (${list.map(() => "?").join(",")}) ORDER BY created_at_epoch DESC`).all(...list).map((r) => this.row(r));
  }

  update(id, patch, { actor = "ui" } = {}) {
    const cur = this.db.prepare("SELECT * FROM memories WHERE id = ?").get(id);
    if (!cur) return null;
    const next = {
      title: patch.title !== undefined ? clean(patch.title, 400) : cur.title,
      subtitle: patch.subtitle !== undefined ? clean(patch.subtitle, 400) : cur.subtitle,
      narrative: patch.narrative !== undefined ? clean(patch.narrative, 20000) : cur.narrative,
      type: patch.type !== undefined ? clean(patch.type, 40) : cur.type,
      project: patch.project !== undefined ? clean(patch.project, 200).trim() || cur.project : cur.project,
      pinned: patch.pinned !== undefined ? (patch.pinned ? 1 : 0) : cur.pinned,
      facts: patch.facts !== undefined ? json(patch.facts) : cur.facts,
      concepts: patch.concepts !== undefined ? json(patch.concepts) : cur.concepts,
    };
    this.db
      .prepare("UPDATE memories SET title=?, subtitle=?, narrative=?, type=?, project=?, pinned=?, facts=?, concepts=?, updated_at_epoch=? WHERE id=?")
      .run(next.title, next.subtitle, next.narrative, next.type, next.project, next.pinned, next.facts, next.concepts, Date.now(), id);
    this.statsCache = null;
    this.audit(actor, "memory.update", { id, fields: Object.keys(patch) });
    return this.get(id);
  }

  remove(id, { actor = "ui" } = {}) {
    const info = this.db.prepare("DELETE FROM memories WHERE id = ?").run(id);
    if (info.changes) { this.vecCache = null; this.statsCache = null; this.audit(actor, "memory.delete", { id }); }
    return info.changes > 0;
  }

  // ---- episodes, facts, provenance (schema v3) ---------------------------------------------------------

  /** One raw turn or tool step. Episodes are append-only; `source_ref` makes a memory's episode idempotent. */
  addEpisode(input = {}) {
    const project = clean(input.project, 200)?.trim() || "default";
    const sourceRef = clean(input.sourceRef ?? input.source_ref, 300);
    if (sourceRef) {
      const existing = this.db.prepare("SELECT * FROM episodes WHERE source_ref = ?").get(sourceRef);
      if (existing) return existing;
    }
    const text = String(input.text ?? "").slice(0, 20_000);
    if (!text.trim()) throw new RangeError("An episode needs text.");
    const hash = input.contentHash ?? sha256(`episode\n${project}\n${sourceRef ?? ""}\n${text}`);
    const at = Number.isFinite(input.createdAtEpoch) ? input.createdAtEpoch : Date.now();
    this.db
      .prepare(`INSERT OR IGNORE INTO episodes (project, scope, tool, session_id, turn_index, role, kind, text, source_ref, content_hash, token_count, created_at_epoch, recorded_at_epoch)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(project, input.scope === "global" ? "global" : "project", clean(input.tool, 60) || "unknown", clean(input.sessionId ?? input.session_id, 200), Number.isFinite(input.turnIndex) ? input.turnIndex : null,
        clean(input.role, 20) || "user", clean(input.kind, 30) || "message", text, sourceRef, hash, Number.isFinite(input.tokenCount) ? input.tokenCount : null, at, at);
    return this.db.prepare("SELECT * FROM episodes WHERE content_hash = ?").get(hash);
  }

  /** The episode for one `memories` row, created once. Capture does not write episodes (a hook stays cheap). */
  ensureEpisodeForMemory(memory) {
    const sourceRef = `memory:${memory.id}`;
    const found = this.db.prepare("SELECT * FROM episodes WHERE source_ref = ?").get(sourceRef);
    if (found) return found;
    const kind = memory.kind ?? "message";
    return this.addEpisode({
      project: memory.project,
      tool: memory.tool,
      sessionId: memory.session_id,
      role: kind === "prompt" ? "user" : kind === "summary" ? "assistant" : "tool",
      kind,
      text: memory.narrative || memory.title || "",
      sourceRef,
      contentHash: sha256(`memory-episode\n${memory.id}`),
      createdAtEpoch: memory.created_at_epoch,
    });
  }

  getEpisode(id) {
    return this.db.prepare("SELECT * FROM episodes WHERE id = ?").get(Number(id)) ?? null;
  }

  /** Insert one derived observation. Idempotent on (project, type, title, narrative) unless a hash is given. */
  addObservation(input = {}, { actor = "extract" } = {}) {
    const project = clean(input.project, 200)?.trim() || "default";
    const type = clean(input.type, 40) || "note";
    const title = clean(input.title, 400) || "";
    const narrative = clean(input.narrative, 20_000) || "";
    if (!title.trim() && !narrative.trim()) throw new RangeError("An observation needs a title or narrative.");
    const hash = input.contentHash ?? sha256(JSON.stringify([project, type, title, narrative]));
    const existing = this.db.prepare("SELECT * FROM observations WHERE content_hash = ?").get(hash);
    if (existing) return { id: existing.id, created: false, observation: existing };
    const at = Number.isFinite(input.createdAtEpoch) ? input.createdAtEpoch : Date.now();
    const episodeId = Number(input.episodeId ?? input.episode_id);
    if (Number.isSafeInteger(episodeId) && episodeId > 0 && !this.getEpisode(episodeId)) throw new RangeError(`episode #${episodeId} does not exist.`);
    const info = this.db
      .prepare(`INSERT INTO observations (legacy_memory_id, project, scope, session_id, episode_id, type, title, subtitle, narrative, importance, importance_components,
                confidence, pinned, edited_at_epoch, status, origin, content_hash, created_at_epoch, updated_at_epoch)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(Number.isSafeInteger(input.legacyMemoryId) ? input.legacyMemoryId : null, project, input.scope === "global" ? "global" : "project", clean(input.sessionId ?? input.session_id, 200),
        Number.isSafeInteger(episodeId) && episodeId > 0 ? episodeId : null, type, title, clean(input.subtitle, 400), narrative,
        Number.isFinite(input.importance) ? input.importance : 0.5, input.importanceComponents ? json(input.importanceComponents) : null,
        Number.isFinite(input.confidence) ? input.confidence : 1, input.pinned ? 1 : 0, Number.isFinite(input.editedAtEpoch) ? input.editedAtEpoch : null,
        clean(input.status, 20) || "active", clean(input.origin, 200), hash, at, at);
    const id = Number(info.lastInsertRowid);
    if (Number.isSafeInteger(episodeId) && episodeId > 0) this.link({ fromType: "observation", fromId: id, toType: "episode", toId: episodeId, relation: "derived_from" });
    if (actor !== "import") this.audit(actor, "observation.add", { id, episodeId: episodeId || null });
    return { id, created: true, observation: this.getObservation(id) };
  }

  getObservation(id) {
    return this.db.prepare("SELECT * FROM observations WHERE id = ?").get(Number(id)) ?? null;
  }

  listObservations({ project, status, limit = 500, offset = 0 } = {}) {
    const where = [];
    const params = [];
    if (project) { where.push("project = ?"); params.push(project); }
    if (status) { where.push("status = ?"); params.push(status); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM observations ${clause} ORDER BY created_at_epoch DESC, id DESC LIMIT ? OFFSET ?`).all(...params, Math.min(Number(limit) || 500, 50_000), Math.max(Number(offset) || 0, 0));
  }

  /**
   * Merge one observation into the older id. The loser row stays with status 'merged'; its facts move to the
   * survivor, the narrative is appended under a "Merged from" line, and an audit row names both ids.
   */
  mergeObservations(firstId, secondId, { actor = "ui" } = {}) {
    const a = this.getObservation(firstId);
    const b = this.getObservation(secondId);
    if (!a || !b) throw new RangeError("Both observations must exist.");
    if (a.id === b.id) throw new RangeError("Pick two different observations.");
    if (a.project !== b.project) throw new RangeError("Refusing to merge observations across projects.");
    const [keep, drop] = a.created_at_epoch < b.created_at_epoch || (a.created_at_epoch === b.created_at_epoch && a.id < b.id) ? [a, b] : [b, a];
    this.db.exec("BEGIN IMMEDIATE");
    let moved = 0;
    try {
      const marker = `Merged from #${drop.id}`;
      const narrative = String(keep.narrative ?? "").includes(marker)
        ? keep.narrative
        : `${keep.narrative ?? ""}${keep.narrative ? "\n\n" : ""}${marker}: ${drop.narrative ?? ""}`.slice(0, 20_000);
      this.db.prepare("UPDATE observations SET narrative = ?, importance = max(importance, ?), pinned = max(pinned, ?), importance_components = coalesce(importance_components, ?), updated_at_epoch = ? WHERE id = ?")
        .run(narrative, drop.importance, drop.pinned, drop.importance_components, Date.now(), keep.id);
      moved = this.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE observation_id = ?").get(drop.id).n;
      this.db.prepare("UPDATE facts SET observation_id = ? WHERE observation_id = ?").run(keep.id, drop.id);
      this.db.prepare("UPDATE memory_keys SET owner_id = ? WHERE owner_type = 'observation' AND owner_id = ?").run(keep.id, drop.id);
      this.db.prepare("UPDATE observations SET status = 'merged', updated_at_epoch = ? WHERE id = ?").run(Date.now(), drop.id);
      this.link({ fromType: "observation", fromId: keep.id, toType: "observation", toId: drop.id, relation: "duplicate_of" });
      this.db.exec("COMMIT");
    } catch (error) {
      try { this.db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    }
    this.audit(actor, "observation.merge", { keep: keep.id, drop: drop.id, facts: moved });
    return { keepId: keep.id, dropId: drop.id, facts: moved, keep: this.getObservation(keep.id), drop: this.getObservation(drop.id) };
  }

  updateObservation(id, patch = {}, { actor = "ui" } = {}) {
    const cur = this.getObservation(id);
    if (!cur) return null;
    const next = {
      title: patch.title !== undefined ? clean(patch.title, 400) : cur.title,
      narrative: patch.narrative !== undefined ? clean(patch.narrative, 20_000) : cur.narrative,
      importance: Number.isFinite(patch.importance) ? patch.importance : cur.importance,
      importanceComponents: patch.importanceComponents !== undefined ? patch.importanceComponents : cur.importance_components,
      pinned: patch.pinned !== undefined ? (patch.pinned ? 1 : 0) : cur.pinned,
      status: patch.status !== undefined ? clean(patch.status, 20) : cur.status,
      editedAtEpoch: patch.editedAtEpoch !== undefined ? patch.editedAtEpoch : cur.edited_at_epoch,
    };
    this.db.prepare("UPDATE observations SET title=?, narrative=?, importance=?, importance_components=?, pinned=?, status=?, edited_at_epoch=?, updated_at_epoch=? WHERE id=?")
      .run(next.title, next.narrative, next.importance, next.importanceComponents ? json(next.importanceComponents) : null, next.pinned, next.status, next.editedAtEpoch, Date.now(), Number(id));
    if (actor !== "import") this.audit(actor, "observation.update", { id: Number(id), fields: Object.keys(patch) });
    return this.getObservation(id);
  }

  /** Refuse to delete an episode a fact still cites. Nothing in the extraction path deletes episodes. */
  deleteEpisode(id) {
    const key = Number(id);
    const facts = this.db.prepare("SELECT COUNT(*) AS n FROM facts WHERE episode_id = ?").get(key).n;
    if (facts) throw new RangeError(`Cannot delete episode #${key}: ${facts} fact(s) reference it.`);
    const info = this.db.prepare("DELETE FROM episodes WHERE id = ?").run(key);
    if (info.changes) this.audit("system", "episode.delete", { id: key });
    return info.changes > 0;
  }

  link({ fromType, fromId, toType, toId, relation, confidence = 1 }) {
    this.db
      .prepare("INSERT OR IGNORE INTO memory_links (from_type, from_id, to_type, to_id, relation, confidence) VALUES (?,?,?,?,?,?)")
      .run(fromType, Number(fromId), toType, Number(toId), relation, confidence);
  }

  addKey({ ownerType, ownerId, keyType, text, source = "extracted" }) {
    const value = String(text ?? "").trim();
    if (!value) return;
    this.db
      .prepare("INSERT OR IGNORE INTO memory_keys (owner_type, owner_id, key_type, text, source) VALUES (?,?,?,?,?)")
      .run(ownerType, Number(ownerId), keyType, value.slice(0, 500), source);
  }

  /**
   * Insert one atomic fact. `episode_id` is required: an orphan fact is rejected here, not only by the validator.
   * A duplicate (project, subject, predicate, object) returns the existing row instead of writing a second one.
   */
  addFact(input = {}, { actor = "extract" } = {}) {
    const project = clean(input.project, 200)?.trim() || "default";
    const subject = clean(input.subject, 200)?.trim();
    const predicate = clean(input.predicate, 120)?.trim();
    const object = clean(input.object, 400)?.trim();
    const text = clean(input.text, 600)?.trim();
    if (!subject || !predicate || !object || !text) throw new RangeError("A fact needs subject, predicate, object and text.");
    const episodeId = Number(input.episodeId ?? input.episode_id);
    if (!Number.isSafeInteger(episodeId) || !this.getEpisode(episodeId)) throw new RangeError("A fact needs an existing episode_id.");
    const hash = sha256(JSON.stringify([project, subject, predicate, object]));
    const existing = this.db.prepare("SELECT * FROM facts WHERE content_hash = ?").get(hash);
    if (existing) return { id: existing.id, created: false, fact: existing };
    const observationId = Number(input.observationId ?? input.observation_id);
    if (Number.isSafeInteger(observationId) && observationId > 0 && !this.db.prepare("SELECT 1 FROM observations WHERE id = ?").get(observationId)) {
      throw new RangeError(`observation #${observationId} does not exist.`);
    }
    const episode = this.getEpisode(episodeId);
    const recordedAt = Number.isFinite(input.recordedAtEpoch) ? input.recordedAtEpoch : Date.now();
    const validFrom = Number.isFinite(input.validFromEpoch) ? input.validFromEpoch : episode.created_at_epoch;
    const validTo = Number.isFinite(input.validToEpoch) ? input.validToEpoch : null;
    const confidence = Number.isFinite(input.confidence) ? Math.max(0, Math.min(1, input.confidence)) : 0.8;
    const info = this.db
      .prepare(`INSERT INTO facts (observation_id, episode_id, project, scope, subject, predicate, object, text, valid_from_epoch, valid_to_epoch,
                recorded_at_epoch, expired_at_epoch, confidence, supersedes_id, status, extractor_mode, prompt_version, model, content_hash, created_at_epoch)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(Number.isSafeInteger(observationId) && observationId > 0 ? observationId : null, episodeId, project, input.scope === "global" ? "global" : "project", subject, predicate, object, text,
        validFrom, validTo, recordedAt, Number.isFinite(input.expiredAtEpoch) ? input.expiredAtEpoch : null, confidence,
        Number.isSafeInteger(input.supersedesId) ? input.supersedesId : null, clean(input.status, 20) || "active",
        clean(input.extractorMode, 20) || "rules", clean(input.promptVersion, 40), clean(input.model, 120), hash, recordedAt);
    const id = Number(info.lastInsertRowid);
    for (const other of Array.isArray(input.episodeIds) ? input.episodeIds : []) {
      const otherId = Number(other);
      if (Number.isSafeInteger(otherId) && this.getEpisode(otherId)) this.link({ fromType: "fact", fromId: id, toType: "episode", toId: otherId, relation: "mentions" });
    }
    if (actor !== "import") this.audit(actor, "fact.add", { id, episodeId, subject, predicate });
    return { id, created: true, fact: this.getFact(id) };
  }

  getFact(id) {
    return this.db.prepare("SELECT * FROM facts WHERE id = ?").get(Number(id)) ?? null;
  }

  /** Only update the closing side of a fact. recorded_at and created_at are never touched. */
  closeFact(id, { validToEpoch, status = "superseded" } = {}) {
    const fact = this.getFact(id);
    if (!fact) return null;
    this.db.prepare("UPDATE facts SET valid_to_epoch = ?, status = ? WHERE id = ?")
      .run(Number.isFinite(validToEpoch) ? validToEpoch : fact.recorded_at_epoch, status, Number(id));
    return this.getFact(id);
  }

  /** Record which older fact this row replaced. Only supersedes_id changes; the timing columns stay put. */
  setFactSupersedes(id, supersedesId) {
    this.db.prepare("UPDATE facts SET supersedes_id = ? WHERE id = ?").run(Number(supersedesId), Number(id));
    return this.getFact(id);
  }

  setFactConfidence(id, confidence) {
    this.db.prepare("UPDATE facts SET confidence = ? WHERE id = ?").run(Math.max(0, Math.min(1, Number(confidence) || 0)), Number(id));
    return this.getFact(id);
  }

  addReview({ itemType, itemId, reason, proposedBy = "extractor", now = Date.now() }) {
    const info = this.db.prepare("INSERT INTO review_queue (item_type, item_id, reason, proposed_by, status, created_at_epoch) VALUES (?,?,?,?, 'pending', ?)")
      .run(itemType, Number(itemId), reason, proposedBy, now);
    return Number(info.lastInsertRowid);
  }

  reviewQueue({ status = "pending", limit = 100 } = {}) {
    return this.db.prepare("SELECT * FROM review_queue WHERE status = ? ORDER BY created_at_epoch, id LIMIT ?").all(status, Math.min(Number(limit) || 100, 500));
  }

  /** Current facts: no valid_to (or one in the future), not expired, status active. */
  factsCurrent({ project, subject, predicate, limit = 100, now = Date.now() } = {}) {
    const where = ["status = 'active'", "coalesce(valid_from_epoch, recorded_at_epoch) <= ?", "(valid_to_epoch IS NULL OR valid_to_epoch > ?)", "(expired_at_epoch IS NULL OR expired_at_epoch > ?)"];
    const params = [now, now, now];
    if (project) { where.push("project = ?"); params.push(project); }
    if (subject) { where.push("subject = ?"); params.push(subject); }
    if (predicate) { where.push("predicate = ?"); params.push(predicate); }
    return this.db.prepare(`SELECT * FROM facts WHERE ${where.join(" AND ")} ORDER BY recorded_at_epoch DESC, id DESC LIMIT ?`).all(...params, Math.min(Number(limit) || 100, 1000));
  }

  /** Every row for a subject or predicate, including superseded ones, oldest first. */
  factsHistory({ project, subject, predicate, limit = 200 } = {}) {
    const where = [];
    const params = [];
    if (project) { where.push("project = ?"); params.push(project); }
    if (subject) { where.push("subject = ?"); params.push(subject); }
    if (predicate) { where.push("predicate = ?"); params.push(predicate); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return this.db.prepare(`SELECT * FROM facts ${clause} ORDER BY coalesce(valid_from_epoch, recorded_at_epoch), recorded_at_epoch, id LIMIT ?`).all(...params, Math.min(Number(limit) || 200, 1000));
  }

  /** The fact that was true at `atEpoch`, using valid time and refusing facts recorded later. */
  factsAsOf(atEpoch, { project, subject, predicate, limit = 100 } = {}) {
    const at = typeof atEpoch === "string" ? Date.parse(atEpoch) : Number(atEpoch);
    if (!Number.isFinite(at)) throw new RangeError("as-of needs an epoch or a date.");
    const where = ["status != 'retracted'", "coalesce(valid_from_epoch, recorded_at_epoch) <= ?", "(valid_to_epoch IS NULL OR valid_to_epoch > ?)", "recorded_at_epoch <= ?"];
    const params = [at, at, at];
    if (project) { where.push("project = ?"); params.push(project); }
    if (subject) { where.push("subject = ?"); params.push(subject); }
    if (predicate) { where.push("predicate = ?"); params.push(predicate); }
    return this.db.prepare(`SELECT * FROM facts WHERE ${where.join(" AND ")} ORDER BY recorded_at_epoch DESC, id DESC LIMIT ?`).all(...params, Math.min(Number(limit) || 100, 1000));
  }

  /**
   * Fact search over the FTS index and the extracted keys. Current facts are the default; `includeHistory` and
   * `asOf` expose the older rows. Every hit carries the episode that produced it.
   */
  searchFacts({ query, project, limit = 20, includeHistory = false, asOf = null, queryVec = null, pool = 100, scope = "current" } = {}) {
    const expr = ftsAnyQuery(query);
    if (!expr) return [];
    const now = Date.now();
    const asOfEpoch = asOf == null ? null : typeof asOf === "string" ? Date.parse(asOf) : Number(asOf);
    const at = Number.isFinite(asOfEpoch) ? asOfEpoch : null;
    const where = [];
    const params = [];
    if (project && scope !== "all") {
      if (this.hasGlobal("facts")) { where.push("(f.project = ? OR f.scope = 'global')"); } else { where.push("f.project = ?"); }
      params.push(project);
    }
    if (at != null) {
      where.push("f.status != 'retracted'", "coalesce(f.valid_from_epoch, f.recorded_at_epoch) <= ?", "(f.valid_to_epoch IS NULL OR f.valid_to_epoch > ?)", "f.recorded_at_epoch <= ?");
      params.push(at, at, at);
    } else if (!includeHistory) {
      where.push("f.status = 'active'", "coalesce(f.valid_from_epoch, f.recorded_at_epoch) <= ?", "(f.valid_to_epoch IS NULL OR f.valid_to_epoch > ?)", "(f.expired_at_epoch IS NULL OR f.expired_at_epoch > ?)");
      params.push(now, now, now);
    }
    const clause = where.length ? `AND ${where.join(" AND ")}` : "";
    const lexical = this.db
      .prepare(`SELECT f.id FROM facts_fts CROSS JOIN facts f ON f.id = facts_fts.rowid WHERE facts_fts MATCH ? ${clause} ORDER BY bm25(facts_fts) LIMIT ?`)
      .all(expr, ...params, pool)
      .map((row) => row.id);
    const keyed = this.db
      .prepare("SELECT k.owner_id AS id FROM memory_keys_fts JOIN memory_keys k ON k.id = memory_keys_fts.rowid WHERE memory_keys_fts MATCH ? AND k.owner_type = 'fact' LIMIT ?")
      .all(expr, pool)
      .map((row) => row.id);
    let ids = [...new Set([...lexical, ...keyed])];
    if (queryVec) {
      const vecRows = this.db.prepare("SELECT fact_id AS id, vec FROM fact_vectors").all().map((row) => ({ id: row.id, vec: unpackVector(row.vec) }));
      if (vecRows.length) ids = rrf([ids, topKByVector(queryVec, vecRows, pool).map((row) => row.id)]).map((row) => row.id);
    }
    const facts = this.getFactsByIds(ids).filter((fact) => {
      if (project && scope !== "all" && fact.project !== project && fact.scope !== "global") return false;
      if (at != null) {
        return fact.status !== "retracted" && (fact.valid_from_epoch ?? fact.recorded_at_epoch) <= at && fact.recorded_at_epoch <= at && (fact.valid_to_epoch == null || fact.valid_to_epoch > at);
      }
      if (includeHistory) return true;
      const from = fact.valid_from_epoch ?? fact.recorded_at_epoch;
      return fact.status === "active" && from <= now && (fact.valid_to_epoch == null || fact.valid_to_epoch > now) && (fact.expired_at_epoch == null || fact.expired_at_epoch > now);
    });
    facts.sort((a, b) => {
      const active = Number(b.status === "active") - Number(a.status === "active");
      if (active) return active;
      return b.recorded_at_epoch - a.recorded_at_epoch || b.id - a.id;
    });
    return facts.slice(0, Math.min(Math.max(Number(limit) || 20, 1), 200)).map((fact) => this.factHit(fact));
  }

  getFactsByIds(ids) {
    const list = [...new Set(ids.map(Number).filter(Number.isSafeInteger))].slice(0, 500);
    if (!list.length) return [];
    return this.db.prepare(`SELECT * FROM facts WHERE id IN (${list.map(() => "?").join(",")})`).all(...list);
  }

  /** One search hit, always with the source episode it came from. */
  factHit(fact) {
    const episode = fact.episode_id ? this.getEpisode(fact.episode_id) : null;
    return {
      kind: "fact", id: fact.id, type: "fact", title: fact.text, text: fact.text, subject: fact.subject, predicate: fact.predicate, object: fact.object,
      project: fact.project, status: fact.status, confidence: fact.confidence, pinned: false,
      at: new Date(fact.recorded_at_epoch).toISOString(),
      validFrom: fact.valid_from_epoch ? new Date(fact.valid_from_epoch).toISOString() : null,
      validTo: fact.valid_to_epoch ? new Date(fact.valid_to_epoch).toISOString() : null,
      source: { type: "fact", episodeId: fact.episode_id ?? null, episodeText: episode?.text?.slice(0, 1000) ?? null, sourceRef: episode?.source_ref ?? null, observationId: fact.observation_id ?? null },
    };
  }

  setFactVector(factId, model, vec) {
    this.db.prepare("INSERT INTO fact_vectors (fact_id, model, dim, vec) VALUES (?,?,?,?) ON CONFLICT(fact_id) DO UPDATE SET model=excluded.model, dim=excluded.dim, vec=excluded.vec")
      .run(Number(factId), model, vec.length, packVector(normalize(vec)));
  }

  /** Memory hits first? No: a fact can carry a word the raw turn does not, so fact hits come first and cite it. */
  searchAll({ query, project, limit = 20, includeHistory = false, asOf = null, queryVec = null, scope = "current" } = {}) {
    const facts = this.searchFacts({ query, project, limit, includeHistory, asOf, queryVec, scope });
    const memories = this.ranked({ query, project, limit, queryVec, includeHistory, scope }).map((memory) => ({ ...memory, kind: "memory", at: new Date(memory.created_at_epoch).toISOString(), source: { type: "memory", id: memory.id } }));
    return [...facts, ...memories];
  }

  /**
   * A generated summary is a historical artifact. Once every fact it cites is superseded, default search must not
   * surface it as if it were current knowledge. History mode keeps it. A legacy or raw summary has no row here.
   */
  summaryIsCurrent(memory, { includeHistory = false, now = Date.now() } = {}) {
    if (includeHistory || !memory || memory.kind !== "summary") return true;
    const row = this.db.prepare("SELECT source_ids FROM summaries WHERE project = ? AND text = ? ORDER BY id DESC LIMIT 1").get(memory.project, memory.narrative ?? "");
    if (!row) return true;
    const ids = parse(row.source_ids).map(Number).filter(Number.isSafeInteger);
    if (!ids.length) return true;
    const placeholders = ids.map(() => "?").join(",");
    const active = this.db.prepare(`SELECT COUNT(*) AS n FROM facts WHERE id IN (${placeholders}) AND status = 'active' AND (valid_to_epoch IS NULL OR valid_to_epoch > ?)`).get(...ids, now).n;
    return active > 0;
  }

  /**
   * Where a fact, observation or memory came from: the episode text, the source ref, the links and the memory row.
   * Returns { found: false } when the id is unknown.
   */
  provenance(type, id) {
    const key = Number(id);
    if (!Number.isSafeInteger(key)) return { found: false };
    const out = { type, id: key, found: false, episode: null, episodes: [], observation: null, memory: null, links: [] };
    const episodeByIds = (ids) => [...new Set(ids.filter(Number.isSafeInteger))].map((episodeId) => this.getEpisode(episodeId)).filter(Boolean);
    if (type === "episode") {
      const episode = this.getEpisode(key);
      if (!episode) return out;
      return { ...out, found: true, episode, episodes: [episode] };
    }
    if (type === "fact") {
      const fact = this.getFact(key);
      if (!fact) return out;
      const linked = this.db.prepare("SELECT to_id FROM memory_links WHERE from_type = 'fact' AND from_id = ? AND to_type = 'episode'").all(key).map((r) => r.to_id);
      const episodes = episodeByIds([fact.episode_id, ...linked]);
      return { ...out, found: true, fact, episode: episodes[0] ?? null, episodes, observation: fact.observation_id ? this.db.prepare("SELECT * FROM observations WHERE id = ?").get(fact.observation_id) ?? null : null, links: this.db.prepare("SELECT * FROM memory_links WHERE (from_type = ? AND from_id = ?) OR (to_type = ? AND to_id = ?)").all("fact", key, "fact", key) };
    }
    if (type === "observation") {
      const observation = this.db.prepare("SELECT * FROM observations WHERE id = ?").get(key);
      if (!observation) return out;
      const linked = this.db.prepare("SELECT to_id FROM memory_links WHERE from_type = 'observation' AND from_id = ? AND to_type = 'episode'").all(key).map((r) => r.to_id);
      const episodes = episodeByIds([observation.episode_id, ...linked]);
      return { ...out, found: true, observation, episode: episodes[0] ?? null, episodes };
    }
    if (type === "memory") {
      const memory = this.get(key);
      if (!memory) return out;
      const episodes = episodeByIds([this.db.prepare("SELECT id FROM episodes WHERE source_ref = ?").get(`memory:${key}`)?.id]);
      return { ...out, found: true, memory, episode: episodes[0] ?? null, episodes };
    }
    return out;
  }

  recordUsage(usage = {}) {
    this.db
      .prepare(`INSERT INTO fact_usage (at_epoch, batch_id, model, mode, input_tokens, output_tokens, estimated_usd, episodes, facts, status, error, raw_output)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(Number.isFinite(usage.atEpoch) ? usage.atEpoch : Date.now(), clean(usage.batchId, 80), clean(usage.model, 120), clean(usage.mode, 20) || "rules",
        Number(usage.inputTokens) || 0, Number(usage.outputTokens) || 0, Number(usage.estimatedUsd) || 0, Number(usage.episodes) || 0, Number(usage.facts) || 0,
        clean(usage.status, 20) || "ok", clean(usage.error, 400), clean(usage.rawOutput, 8000));
  }

  usageSummary({ sinceEpoch = 0 } = {}) {
    return this.db.prepare(`SELECT COUNT(*) AS calls, coalesce(SUM(input_tokens),0) AS input_tokens, coalesce(SUM(output_tokens),0) AS output_tokens,
      coalesce(SUM(estimated_usd),0) AS estimated_usd, coalesce(SUM(facts),0) AS facts, SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
      MAX(at_epoch) AS last_at_epoch FROM fact_usage WHERE at_epoch >= ?`).get(Number(sinceEpoch) || 0);
  }

  /** Newest first. Filters: project, kind, type, tool, pinned, q (full text), before (epoch), limit, offset. */
  list({ project, kind, type, tool, pinned, q, limit = 50, offset = 0, scope = "current" } = {}) {
    const where = [];
    const params = [];
    const match = ftsQuery(q);
    if (q && !match) return { total: 0, items: [] };
    const from = match ? "memories_fts f CROSS JOIN memories m ON f.rowid = m.id" : "memories m"; // CROSS JOIN: see ranked()
    if (match) { where.push("memories_fts MATCH ?"); params.push(match); }
    if (project && scope !== "all") { where.push(this.hasGlobal("memories") ? "(m.project = ? OR m.scope = 'global')" : "m.project = ?"); params.push(project); }
    for (const [col, val] of [["kind", kind], ["type", type], ["tool", tool]]) if (val) { where.push(`m.${col} = ?`); params.push(val); }
    if (pinned) where.push("m.pinned = 1");
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 500);
    const off = Math.max(Number(offset) || 0, 0);
    const total = this.db.prepare(`SELECT COUNT(*) AS n FROM ${from} ${clause}`).get(...params).n;
    const order = match ? "ORDER BY bm25(memories_fts), m.created_at_epoch DESC" : "ORDER BY m.pinned DESC, m.created_at_epoch DESC, m.id DESC";
    const items = this.db.prepare(`SELECT m.* FROM ${from} ${clause} ${order} LIMIT ? OFFSET ?`).all(...params, lim, off).map((r) => this.row(r));
    return { total, items };
  }

  /**
   * The 3-layer pattern's first layer: a compact index (no narrative), best matches first.
   * Natural-language queries work: ANY content word may match and BM25 ranks (see retrieval.mjs). When `queryVec` is
   * given and memories have vectors, keyword and semantic rankings are fused with reciprocal rank fusion.
   */
  search({ query, project, kind, type, tool, limit = 20, queryVec = null, scope = "current" } = {}) {
    return this.ranked({ query, project, kind, type, tool, limit, queryVec, scope }).map((m) => ({ id: m.id, kind: m.kind, type: m.type, title: m.title, project: m.project, tool: m.tool, pinned: m.pinned, at: new Date(m.created_at_epoch).toISOString() }));
  }

  /** The index's own (stemmed) form of a word, via SQLite's tokenizer so it matches what is stored. Cached. */
  stem(word) {
    this.stems ??= new Map();
    if (this.stems.has(word)) return this.stems.get(word);
    if (!this.stemReady) {
      this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS temp.stem_f USING fts5(x, tokenize='porter unicode61 remove_diacritics 2')");
      this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS temp.stem_v USING fts5vocab(stem_f, 'row')");
      this.stemReady = true;
    }
    this.db.prepare("INSERT INTO temp.stem_f(x) VALUES (?)").run(word);
    const row = this.db.prepare("SELECT term FROM temp.stem_v LIMIT 1").get();
    this.db.exec("DELETE FROM temp.stem_f");
    const stem = row?.term ?? word;
    this.stems.set(word, stem);
    return stem;
  }

  /**
   * Choose the query terms. A word that appears in most memories adds cost and almost no signal, so words found in more
   * than `maxShare` of memories are dropped (when others remain) and at most `max` of the rarest are kept.
   * Aggressive settings cost recall (8 terms / 35%: -8 points Recall@5 on LoCoMo, because a person's name is in many turns), so the defaults are gentle.
   */
  selectTerms(text, { max = this.termOptions.max, maxShare = this.termOptions.maxShare } = {}) {
    const words = contentTerms(text);
    if (words.length <= 1) return words;
    const total = this.db.prepare("SELECT COUNT(*) AS n FROM memories").get().n || 1;
    const dfStmt = this.db.prepare("SELECT doc FROM memories_vocab WHERE term = ?");
    const scored = words.map((w, order) => ({ w, order, df: dfStmt.get(this.stem(w))?.doc ?? 0 }));
    const present = scored.filter((s) => s.df > 0); // a word nothing contains cannot help (and costs nothing to skip)
    const pool = present.length ? present : scored;
    const rare = pool.filter((s) => s.df / total <= maxShare);
    const keep = (rare.length ? rare : pool).sort((a, b) => a.df - b.df || a.order - b.order).slice(0, max);
    return keep.sort((a, b) => a.order - b.order).map((s) => s.w);
  }

  /** Rebuild the FTS index segments after a bulk write. Search stays correct without it; this keeps p95 low. */
  optimizeFts() {
    for (const table of ["memories_fts", "facts_fts", "memory_keys_fts"]) {
      this.db.exec(`INSERT INTO ${table}(${table}) VALUES('optimize')`);
    }
    this.db.exec("PRAGMA optimize");
    return { optimized: ["memories_fts", "facts_fts", "memory_keys_fts"] };
  }

  /** True when at least one row was promoted to global scope. Avoids an OR in the hot FTS plan when none has. */
  hasGlobal(table) {
    return !!this.db.prepare(`SELECT 1 FROM ${table} WHERE scope = 'global' LIMIT 1`).get();
  }

  /** Full rows, best first. Same ranking as search(). */
  ranked({ query, project, kind, type, tool, limit = 20, queryVec = null, pool = 100, includeHistory = false, scope = "current" } = {}) {
    const filters = [];
    const params = [];
    if (project && scope !== "all") {
      // A plain equality keeps the CROSS JOIN plan that pins FTS as the outer loop; an OR only appears when a global
      // row can actually match.
      if (this.hasGlobal("memories")) { filters.push("(m.project = ? OR m.scope = 'global')"); } else { filters.push("m.project = ?"); }
      params.push(project);
    }
    for (const [col, val] of [["kind", kind], ["type", type], ["tool", tool]]) if (val) { filters.push(`m.${col} = ?`); params.push(val); }
    const where = filters.length ? `AND ${filters.join(" AND ")}` : "";
    const expr = orExpr(this.selectTerms(query));
    const lexical = expr
      // CROSS JOIN pins the full-text table as the outer loop. With a plain JOIN and a project filter SQLite scans the
      // index table once per memory row (measured: 267 ms vs 2 ms on 600 rows).
      ? this.db.prepare(`SELECT m.id FROM memories_fts CROSS JOIN memories m ON m.id = memories_fts.rowid WHERE memories_fts MATCH ? ${where} ORDER BY bm25(memories_fts) LIMIT ?`).all(expr, ...params, pool).map((r) => r.id)
      : [];
    let ids = lexical;
    if (queryVec) {
      const dense = topKByVector(queryVec, this.vectorRows({ project, kind, type, tool, scope }), pool).map((r) => r.id);
      ids = rrf([lexical, dense]).map((r) => r.id);
    }
    const top = ids.slice(0, Math.min(Math.max(limit, 1), 200));
    if (!top.length) return [];
    const byId = new Map(this.db.prepare(`SELECT * FROM memories WHERE id IN (${top.map(() => "?").join(",")})`).all(...top).map((r) => [r.id, this.row(r)]));
    return top.map((id) => byId.get(id)).filter(Boolean).filter((memory) => this.summaryIsCurrent(memory, { includeHistory }));
  }

  /**
   * ranked() plus the reason an empty result is empty: no_terms (nothing to search for), no_rows (the store has no
   * rows at all), filtered (rows exist but the project/kind/type/tool filter or the terms excluded every one).
   */
  searchDetailed({ query, project, kind, type, tool, limit = 20, queryVec = null, includeHistory = false, scope = "current" } = {}) {
    const items = this.ranked({ query, project, kind, type, tool, limit, queryVec, includeHistory, scope });
    if (items.length) return { items, reason: null };
    if (!contentTerms(query).length) return { items, reason: "no_terms" };
    const where = [];
    const params = [];
    const filtered = Boolean(project || kind || type || tool);
    if (project && scope !== "all") { where.push(this.hasGlobal("memories") ? "(project = ? OR scope = 'global')" : "project = ?"); params.push(project); }
    for (const [column, value] of [["kind", kind], ["type", type], ["tool", tool]]) if (value) { where.push(`${column} = ?`); params.push(value); }
    const clause = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const rows = this.db.prepare(`SELECT COUNT(*) AS n FROM memories ${clause}`).get(...params).n;
    if (rows === 0) return { items, reason: filtered ? "filtered" : "no_rows" };
    return { items, reason: "filtered" };
  }

  // ---- vectors (semantic search, optional) --------------------------------------------------------------

  setVector(id, model, vec) {
    this.db.prepare("INSERT INTO memory_vectors (memory_id, model, dim, vec) VALUES (?,?,?,?) ON CONFLICT(memory_id) DO UPDATE SET model=excluded.model, dim=excluded.dim, vec=excluded.vec").run(id, model, vec.length, packVector(normalize(vec)));
    this.vecCache = null;
  }

  /** [{id, vec}] for memories that have vectors, optionally filtered. Cached until a vector or memory changes. */
  vectorRows({ project, kind, type, tool, scope = "current" } = {}) {
    if (!this.vecCache) {
      this.vecCache = this.db.prepare("SELECT v.memory_id AS id, v.vec, m.project, m.scope, m.kind, m.type, m.tool FROM memory_vectors v JOIN memories m ON m.id = v.memory_id").all().map((r) => ({ id: r.id, vec: unpackVector(r.vec), project: r.project, scope: r.scope, kind: r.kind, type: r.type, tool: r.tool }));
    }
    return this.vecCache.filter((r) => (!project || scope === "all" || r.project === project || r.scope === "global") && (!kind || r.kind === kind) && (!type || r.type === type) && (!tool || r.tool === tool));
  }

  /** Embed every memory that has no vector yet. `embedder` = {model, embedDocs(texts)}. Returns how many were embedded. */
  async embedMissing(embedder, { limit = 5000, batch = 64 } = {}) {
    const todo = this.db.prepare("SELECT m.id, m.title, m.narrative FROM memories m LEFT JOIN memory_vectors v ON v.memory_id = m.id WHERE v.memory_id IS NULL AND m.kind != 'event' ORDER BY m.id LIMIT ?").all(limit);
    for (let i = 0; i < todo.length; i += batch) {
      const part = todo.slice(i, i + batch);
      const vecs = await embedder.embedDocs(part.map((m) => `${m.title}\n${m.narrative ?? ""}`));
      this.db.exec("BEGIN");
      try { part.forEach((m, j) => this.setVector(m.id, embedder.model, vecs[j])); this.db.exec("COMMIT"); } catch (e) { this.db.exec("ROLLBACK"); throw e; }
    }
    return todo.length;
  }

  /** Second layer: what happened around a memory (or the best match for a query), in time order. */
  timeline({ anchor, query, project, before = 5, after = 5 } = {}) {
    let center = anchor != null ? this.get(Number(anchor)) : null;
    if (!center && query) {
      const [hit] = this.list({ q: query, project, limit: 1 }).items;
      center = hit ?? null;
    }
    if (!center) return { anchor: null, items: [] };
    const scope = project ? "AND project = ?" : "";
    const p = project ? [project] : [];
    const prev = this.db.prepare(`SELECT * FROM memories WHERE (created_at_epoch < ? OR (created_at_epoch = ? AND id < ?)) ${scope} AND kind != 'event' ORDER BY created_at_epoch DESC, id DESC LIMIT ?`).all(center.created_at_epoch, center.created_at_epoch, center.id, ...p, Math.min(before, 50));
    const next = this.db.prepare(`SELECT * FROM memories WHERE (created_at_epoch > ? OR (created_at_epoch = ? AND id > ?)) ${scope} AND kind != 'event' ORDER BY created_at_epoch ASC, id ASC LIMIT ?`).all(center.created_at_epoch, center.created_at_epoch, center.id, ...p, Math.min(after, 50));
    return { anchor: center.id, items: [...prev.reverse().map((r) => this.row(r)), center, ...next.map((r) => this.row(r))] };
  }

  projects() {
    return this.db.prepare("SELECT project AS name, COUNT(*) AS memories, MAX(created_at_epoch) AS lastAtEpoch FROM memories GROUP BY project ORDER BY lastAtEpoch DESC").all();
  }

  mergeProjects(from, into, { actor = "ui" } = {}) {
    if (!from || !into || from === into) throw new RangeError("Pick two different projects.");
    // Re-hash so merged duplicates collapse instead of violating the unique content hash.
    const rows = this.db.prepare("SELECT id, kind, title, narrative FROM memories WHERE project = ?").all(from);
    let moved = 0;
    let dropped = 0;
    for (const r of rows) {
      const hash = sha256(JSON.stringify([into, r.kind, r.title, r.narrative ?? ""]));
      if (this.db.prepare("SELECT 1 FROM memories WHERE content_hash = ?").get(hash)) {
        this.db.prepare("DELETE FROM memories WHERE id = ?").run(r.id);
        dropped++;
      } else {
        this.db.prepare("UPDATE memories SET project = ?, content_hash = ?, updated_at_epoch = ? WHERE id = ?").run(into, hash, Date.now(), r.id);
        moved++;
      }
    }
    this.statsCache = null;
    this.audit(actor, "project.merge", { from, into, moved, dropped });
    return { moved, dropped };
  }

  /** Counts for the overview. Cached for 3 s and cleared on any write (a full scan costs ~110 ms at 50k rows). */
  stats() {
    if (this.statsCache && Date.now() - this.statsCache.at < 3000) return this.statsCache.value;
    const value = this.computeStats();
    this.statsCache = { at: Date.now(), value };
    return value;
  }

  computeStats() {
    const q = (sql, ...p) => this.db.prepare(sql).all(...p);
    return {
      total: q("SELECT COUNT(*) AS n FROM memories")[0].n,
      byKind: Object.fromEntries(q("SELECT kind, COUNT(*) AS n FROM memories GROUP BY kind").map((r) => [r.kind, r.n])),
      byTool: Object.fromEntries(q("SELECT tool, COUNT(*) AS n FROM memories GROUP BY tool ORDER BY n DESC").map((r) => [r.tool, r.n])),
      byType: Object.fromEntries(q("SELECT type, COUNT(*) AS n FROM memories WHERE kind IN ('observation','summary','note') GROUP BY type ORDER BY n DESC").map((r) => [r.type, r.n])),
      pinned: q("SELECT COUNT(*) AS n FROM memories WHERE pinned = 1")[0].n,
      rules: q("SELECT COUNT(*) AS n FROM rules WHERE enabled = 1")[0].n,
      projects: q("SELECT COUNT(DISTINCT project) AS n FROM memories")[0].n,
      newestAtEpoch: q("SELECT MAX(created_at_epoch) AS t FROM memories")[0].t,
    };
  }

  /** Markdown a session-start hook can inject into ANY tool: pinned and recent memories, then the rules. */
  context({ project, limit = 20, maxChars = 6000, tool, scope = "current" } = {}) {
    const pinned = this.list({ project, pinned: true, limit: 50, scope }).items;
    const scopeClause = scope === "all" ? "" : project ? this.hasGlobal("memories") ? "AND (project = ? OR scope = 'global')" : "AND project = ?" : "";
    const recent = this.db
      .prepare(`SELECT * FROM memories WHERE kind IN ('observation','summary','note') AND pinned = 0 ${scopeClause} ORDER BY created_at_epoch DESC LIMIT ?`)
      .all(...(scopeClause ? [project] : []), Math.min(limit, 100))
      .map((r) => this.row(r));
    const line = (m) => `- #${m.id} ${new Date(m.created_at_epoch).toISOString().slice(0, 10)} [${m.type}] ${m.title}${m.narrative ? ` — ${m.narrative.replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
    const parts = [`# Memory${scope === "all" ? " (all projects)" : project ? ` for ${project}` : ""}`];
    if (pinned.length) parts.push("", "## Pinned", ...pinned.map(line));
    if (recent.length) parts.push("", "## Recent", ...recent.map(line));
    const rules = this.rules.list().filter((r) => r.enabled && (!r.tools || !tool || r.tools.includes(tool)));
    if (rules.length) parts.push("", "## Rules", ...rules.map((r) => (r.when ? `- When ${r.when}: ${r.then}` : `- ${r.then}`)));
    let out = parts.join("\n");
    if (out.length > maxChars) out = `${out.slice(0, maxChars - 1).trimEnd()}…`;
    return out;
  }

  // ---- rules ------------------------------------------------------------------------------------------

  get rules() {
    const db = this.db;
    const shape = (r) => r && { id: r.id, scopeTier: r.scope_tier, scopeName: r.scope_name, when: r.when_text, then: r.then_text, enabled: !!r.enabled, tools: r.tools ? parse(r.tools) : null, source: r.source, createdAtEpoch: r.created_at_epoch, updatedAtEpoch: r.updated_at_epoch };
    const audit = (a, d) => this.audit("ui", a, d);
    return {
      list: () => db.prepare("SELECT * FROM rules ORDER BY enabled DESC, scope_tier, scope_name, created_at_epoch").all().map(shape),
      get: (id) => shape(db.prepare("SELECT * FROM rules WHERE id = ?").get(id)),
      add: ({ then, when = "", scopeTier = "everywhere", scopeName = "Everywhere", tools = null, source = "you", enabled = true }) => {
        const text = String(then ?? "").trim();
        if (!text) throw new RangeError("Write the rule before saving it.");
        if (text.length > 800) throw new RangeError("A rule is at most 800 characters.");
        if (!["everywhere", "project", "situation"].includes(scopeTier)) throw new RangeError("scopeTier must be everywhere, project or situation.");
        if (scopeTier !== "everywhere" && !String(scopeName).trim()) throw new RangeError("Name the project or situation this rule is for.");
        const dup = db.prepare("SELECT id FROM rules WHERE lower(then_text) = lower(?) AND when_text = ? AND scope_tier = ? AND scope_name = ?").get(text, String(when).trim(), scopeTier, scopeTier === "everywhere" ? "Everywhere" : String(scopeName).trim());
        if (dup) return { id: dup.id, created: false };
        const id = `r_${sha256(`${Date.now()}${Math.random()}${text}`).slice(0, 10)}`;
        const now = Date.now();
        db.prepare("INSERT INTO rules (id, scope_tier, scope_name, when_text, then_text, enabled, tools, source, created_at_epoch, updated_at_epoch) VALUES (?,?,?,?,?,?,?,?,?,?)")
          .run(id, scopeTier, scopeTier === "everywhere" ? "Everywhere" : String(scopeName).trim(), String(when).trim(), text, enabled ? 1 : 0, tools && tools.length ? JSON.stringify(tools) : null, source, now, now);
        audit("rule.add", { id });
        return { id, created: true };
      },
      update: (id, patch) => {
        const cur = db.prepare("SELECT * FROM rules WHERE id = ?").get(id);
        if (!cur) return null;
        const then = patch.then !== undefined ? String(patch.then).trim() : cur.then_text;
        if (!then) throw new RangeError("Write the rule before saving it.");
        db.prepare("UPDATE rules SET then_text=?, when_text=?, scope_tier=?, scope_name=?, enabled=?, tools=?, updated_at_epoch=? WHERE id=?").run(
          then, patch.when !== undefined ? String(patch.when).trim() : cur.when_text, patch.scopeTier ?? cur.scope_tier,
          (patch.scopeTier ?? cur.scope_tier) === "everywhere" ? "Everywhere" : (patch.scopeName ?? cur.scope_name),
          patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : cur.enabled,
          patch.tools !== undefined ? (patch.tools && patch.tools.length ? JSON.stringify(patch.tools) : null) : cur.tools, Date.now(), id);
        audit("rule.update", { id, fields: Object.keys(patch) });
        return this.rules.get(id);
      },
      remove: (id) => {
        const info = db.prepare("DELETE FROM rules WHERE id = ?").run(id);
        if (info.changes) audit("rule.delete", { id });
        return info.changes > 0;
      },
    };
  }

  // ---- settings, audit --------------------------------------------------------------------------------

  setting(key, fallback = null) {
    const r = this.db.prepare("SELECT value FROM settings WHERE key = ?").get(key);
    return r ? JSON.parse(r.value) : fallback;
  }
  setSetting(key, value) {
    this.db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, JSON.stringify(value));
  }
  auditLog(limit = 100) {
    return this.db.prepare("SELECT * FROM audit ORDER BY id DESC LIMIT ?").all(Math.min(limit, 500)).map((r) => ({ ...r, detail: r.detail ? parse(r.detail) : null }));
  }

  // ---- bundles: the portable format -------------------------------------------------------------------

  /** JSON Lines: a manifest, then one memory or rule per line. Stable, versioned, tool-neutral. */
  exportBundle({ project, includeEvents = false } = {}) {
    const memories = this.db
      .prepare(`SELECT * FROM memories ${project ? "WHERE project = ?" : ""} ORDER BY created_at_epoch, id`)
      .all(...(project ? [project] : []))
      .filter((m) => includeEvents || m.kind !== "event")
      .map((r) => this.row(r));
    const rules = this.rules.list();
    const lines = [{ type: "manifest", format: "aletheia-bundle", version: BUNDLE_VERSION, exportedAt: new Date().toISOString(), project: project ?? null, counts: { memories: memories.length, rules: rules.length } }];
    for (const m of memories) {
      lines.push({ type: "memory", project: m.project, kind: m.kind, memoryType: m.type, title: m.title, subtitle: m.subtitle, narrative: m.narrative, facts: m.facts, concepts: m.concepts, files: m.files, tool: m.tool, sessionId: m.session_id, pinned: m.pinned, origin: m.origin, createdAtEpoch: m.created_at_epoch });
    }
    for (const r of rules) lines.push({ type: "rule", scopeTier: r.scopeTier, scopeName: r.scopeName, when: r.when, then: r.then, enabled: r.enabled, tools: r.tools, source: r.source });
    return lines.map((l) => JSON.stringify(l)).join("\n") + "\n";
  }

  /** Import a bundle. Idempotent: the same bundle twice adds nothing the second time. */
  importBundle(text, { actor = "import" } = {}) {
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    let manifest;
    try {
      manifest = JSON.parse(lines[0]);
    } catch {
      throw new RangeError("Not an aletheia bundle: the first line is not JSON.");
    }
    if (manifest.type !== "manifest" || manifest.format !== "aletheia-bundle") throw new RangeError("Not an aletheia bundle: missing manifest.");
    if (manifest.version > BUNDLE_VERSION) throw new RangeError(`Bundle version ${manifest.version} is newer than this server supports (${BUNDLE_VERSION}).`);
    const out = { memories: { added: 0, skipped: 0 }, rules: { added: 0, skipped: 0 }, errors: [] };
    this.db.exec("BEGIN");
    try {
      for (const [i, line] of lines.slice(1).entries()) {
        let o;
        try { o = JSON.parse(line); } catch { out.errors.push(`line ${i + 2}: not JSON`); continue; }
        try {
          if (o.type === "memory") {
            const r = this.add({ ...o, type: o.memoryType ?? o.type, kind: o.kind }, { actor });
            out.memories[r.created ? "added" : "skipped"]++;
          } else if (o.type === "rule") {
            const r = this.rules.add({ then: o.then, when: o.when, scopeTier: o.scopeTier, scopeName: o.scopeName, tools: o.tools, source: o.source ?? "import", enabled: o.enabled !== false });
            out.rules[r.created ? "added" : "skipped"]++;
          }
        } catch (error) {
          out.errors.push(`line ${i + 2}: ${error.message}`);
        }
      }
      this.audit(actor, "bundle.import", { memories: out.memories, rules: out.rules, errors: out.errors.length });
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    return out;
  }

  /** Human-readable export: one markdown document per project, newest first. Useful as a paste-in for any chat tool. */
  exportMarkdown({ project } = {}) {
    const projects = project ? [{ name: project }] : this.projects();
    const out = ["# Memory export", `_${new Date().toISOString()}_`, ""];
    const rules = this.rules.list().filter((r) => r.enabled);
    if (rules.length) out.push("## Rules", ...rules.map((r) => (r.when ? `- When ${r.when}: ${r.then}` : `- ${r.then}`)), "");
    for (const p of projects) {
      const { items } = this.list({ project: p.name, limit: 500 });
      const notes = items.filter((m) => m.kind !== "event" && m.kind !== "prompt");
      if (!notes.length) continue;
      out.push(`## ${p.name}`, "");
      for (const m of notes) out.push(`### ${m.title || "(untitled)"}`, `_${new Date(m.created_at_epoch).toISOString().slice(0, 10)} · ${m.type} · ${m.tool}${m.pinned ? " · pinned" : ""}_`, "", m.narrative ?? "", "");
    }
    return `${out.join("\n").trimEnd()}\n`;
  }

  close() {
    this.db.close();
  }
}
