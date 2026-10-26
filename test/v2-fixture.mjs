// A schema-v2 hub database, created directly so the v3 migration runs against the real old shape.
// Tests only: no user data, no HOME writes.
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const V2_SCHEMA = `
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL DEFAULT 'default',
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
CREATE INDEX idx_memories_project_time ON memories(project, created_at_epoch DESC);
CREATE INDEX idx_memories_order ON memories(pinned DESC, created_at_epoch DESC, id DESC);
CREATE INDEX idx_memories_project_order ON memories(project, pinned DESC, created_at_epoch DESC, id DESC);
CREATE INDEX idx_memories_kind ON memories(kind, created_at_epoch DESC);
CREATE INDEX idx_memories_tool ON memories(tool);
CREATE VIRTUAL TABLE memories_fts USING fts5(title, subtitle, narrative, facts, concepts, content='memories', content_rowid='id', tokenize='porter unicode61 remove_diacritics 2');
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, title, subtitle, narrative, facts, concepts) VALUES (new.id, new.title, new.subtitle, new.narrative, new.facts, new.concepts);
END;
CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, subtitle, narrative, facts, concepts) VALUES ('delete', old.id, old.title, old.subtitle, old.narrative, old.facts, old.concepts);
END;
CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, title, subtitle, narrative, facts, concepts) VALUES ('delete', old.id, old.title, old.subtitle, old.narrative, old.facts, old.concepts);
  INSERT INTO memories_fts(rowid, title, subtitle, narrative, facts, concepts) VALUES (new.id, new.title, new.subtitle, new.narrative, new.facts, new.concepts);
END;
CREATE TABLE rules (
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
CREATE VIRTUAL TABLE memories_vocab USING fts5vocab(memories_fts, 'row');
CREATE TABLE memory_vectors (
  memory_id INTEGER PRIMARY KEY REFERENCES memories(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  dim INTEGER NOT NULL,
  vec BLOB NOT NULL
);
CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at_epoch INTEGER NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, detail TEXT);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

/**
 * Build a v2 database. `notes`, `prompts` and `events` are row counts. Every row carries a unique hash.
 * Returns the ids of the first row of each kind plus the totals.
 */
export function makeV2Store(path, { notes = 0, prompts = 0, events = 0, vectors = 0 } = {}) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(V2_SCHEMA);
  db.exec("PRAGMA user_version = 2");
  const insert = db.prepare(`INSERT INTO memories (project, kind, type, title, subtitle, narrative, facts, concepts, files, tool, session_id, pinned, origin, content_hash, created_at_epoch, updated_at_epoch)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  const first = {};
  const at = 1_700_000_000_000;
  db.exec("BEGIN");
  try {
    let n = 0;
    const add = (kind, type) => {
      n++;
      const info = insert.run(
        n % 3 === 0 ? "second" : "legacy", kind, type,
        `legacy ${kind} ${n}`,
        kind === "observation" ? `subtitle ${n}` : null,
        `narrative about legacy memory number ${n}`,
        kind === "observation" ? JSON.stringify(["legacy fact"]) : null,
        kind === "observation" ? JSON.stringify(["legacy concept"]) : null,
        kind === "observation" ? JSON.stringify(["src/legacy.js"]) : null,
        "claude-code", "legacy-session", 0, `seed:${kind}:${n}`, `hash-${kind}-${n}`, at + n, at + n,
      );
      if (!first[kind]) first[kind] = Number(info.lastInsertRowid);
    };
    for (let i = 0; i < notes; i++) add("observation", i % 2 ? "note" : "decision");
    for (let i = 0; i < prompts; i++) add("prompt", "note");
    for (let i = 0; i < events; i++) add("event", "event");
    for (let i = 0; i < vectors; i++) db.prepare("INSERT INTO memory_vectors (memory_id, model, dim, vec) VALUES (?,?,?,?)").run(i + 1, "test", 2, new Uint8Array(8));
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    db.close();
    throw error;
  }
  const counts = db.prepare("SELECT kind, COUNT(*) AS n FROM memories GROUP BY kind").all();
  db.close();
  return { dbPath: path, first, counts: Object.fromEntries(counts.map((r) => [r.kind, r.n])), total: notes + prompts + events };
}

/** A v2 database whose `observations` table is wrong, so the additive migration must roll back. */
export function makeBrokenV2Store(path, { notes = 3 } = {}) {
  const made = makeV2Store(path, { notes });
  const db = new Database(path);
  db.exec("CREATE TABLE observations (id INTEGER PRIMARY KEY AUTOINCREMENT, wrong TEXT)");
  db.close();
  return made;
}
