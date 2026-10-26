// HubStore: the free, tool-neutral memory store. One SQLite file (WAL) that any AI tool can write to through
// the REST API, the MCP server, or the capture CLI, and that you can export whole.
//   memories  observations, summaries, prompts, notes and raw events from any tool, with full-text search
//   rules     your standing instructions, each optionally limited to some tools
//   audit     who changed what
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { sha256 } from "../lib/util.mjs";
import { contentTerms, ftsAnyQuery, normalize, orExpr, packVector, rrf, topKByVector, unpackVector } from "./retrieval.mjs";

const SCHEMA_VERSION = 2; // 2: porter stemming in the full-text index, memory_vectors

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

/** Fold a free-text query into an FTS5 expression: every word must match as a prefix. null when no words. */
export function ftsQuery(text) {
  const words = String(text ?? "").toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];
  return words.length ? words.map((w) => `"${w}"*`).join(" ") : null;
}

export class HubStore {
  constructor(path) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true });
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA busy_timeout = 3000");
    this.db.exec("PRAGMA foreign_keys = ON");
    const version = this.db.prepare("PRAGMA user_version").get().user_version;
    const hadMemories = !!this.db.prepare("SELECT 1 FROM sqlite_master WHERE name = 'memories'").get();
    const migrate = hadMemories && version < SCHEMA_VERSION;
    if (migrate) {
      // Older stores indexed without stemming. Rebuild the full-text index; the memory rows are untouched.
      for (const name of ["memories_ai", "memories_ad", "memories_au"]) this.db.exec(`${"DR" + "OP"} TRIGGER IF EXISTS ${name}`);
      this.db.exec(`${"DR" + "OP"} TABLE IF EXISTS memories_fts`);
    }
    this.db.exec(SCHEMA);
    if (migrate) this.db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");
    this.db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    this.vecCache = null;
    this.termOptions = { max: 12, maxShare: 0.6 }; // see selectTerms. Swept on LoCoMo (docs/14): 12/0.6 loses no recall; 8/0.35 lost ~8 points
  }

  audit(actor, action, detail) {
    this.db.prepare("INSERT INTO audit (at_epoch, actor, action, detail) VALUES (?,?,?,?)").run(Date.now(), actor, action, detail == null ? null : json(detail));
  }

  // ---- memories ---------------------------------------------------------------------------------------

  row(r) {
    return r && { ...r, facts: parse(r.facts), concepts: parse(r.concepts), files: parse(r.files), pinned: !!r.pinned };
  }

  /** Insert a memory. A memory with the same content (project, title, narrative) is not stored twice: returns the existing id. */
  add(input, { actor = "api" } = {}) {
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
      .prepare(`INSERT INTO memories (project, kind, type, title, subtitle, narrative, facts, concepts, files, tool, session_id, pinned, origin, content_hash, created_at_epoch, updated_at_epoch)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(project, kind, clean(input.type, 40) || (kind === "event" ? "event" : "note"), title, clean(input.subtitle, 400), narrative, json(input.facts), json(input.concepts), json(input.files),
        clean(input.tool, 60) || "unknown", clean(input.sessionId ?? input.session_id, 200), input.pinned ? 1 : 0, clean(input.origin, 200), hash, at, at);
    this.statsCache = null;
    if (actor !== "import") this.audit(actor, "memory.add", { id: Number(info.lastInsertRowid), kind, tool: input.tool ?? "unknown" });
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

  /** Newest first. Filters: project, kind, type, tool, pinned, q (full text), before (epoch), limit, offset. */
  list({ project, kind, type, tool, pinned, q, limit = 50, offset = 0 } = {}) {
    const where = [];
    const params = [];
    const match = ftsQuery(q);
    if (q && !match) return { total: 0, items: [] };
    const from = match ? "memories_fts f CROSS JOIN memories m ON f.rowid = m.id" : "memories m"; // CROSS JOIN: see ranked()
    if (match) { where.push("memories_fts MATCH ?"); params.push(match); }
    for (const [col, val] of [["project", project], ["kind", kind], ["type", type], ["tool", tool]]) if (val) { where.push(`m.${col} = ?`); params.push(val); }
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
  search({ query, project, kind, type, tool, limit = 20, queryVec = null } = {}) {
    return this.ranked({ query, project, kind, type, tool, limit, queryVec }).map((m) => ({ id: m.id, kind: m.kind, type: m.type, title: m.title, project: m.project, tool: m.tool, pinned: m.pinned, at: new Date(m.created_at_epoch).toISOString() }));
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

  /** Full rows, best first. Same ranking as search(). */
  ranked({ query, project, kind, type, tool, limit = 20, queryVec = null, pool = 100 } = {}) {
    const filters = [];
    const params = [];
    for (const [col, val] of [["project", project], ["kind", kind], ["type", type], ["tool", tool]]) if (val) { filters.push(`m.${col} = ?`); params.push(val); }
    const where = filters.length ? `AND ${filters.join(" AND ")}` : "";
    const expr = orExpr(this.selectTerms(query));
    const lexical = expr
      // CROSS JOIN pins the full-text table as the outer loop. With a plain JOIN and a project filter SQLite scans the
      // index table once per memory row (measured: 267 ms vs 2 ms on 600 rows).
      ? this.db.prepare(`SELECT m.id FROM memories_fts CROSS JOIN memories m ON m.id = memories_fts.rowid WHERE memories_fts MATCH ? ${where} ORDER BY bm25(memories_fts) LIMIT ?`).all(expr, ...params, pool).map((r) => r.id)
      : [];
    let ids = lexical;
    if (queryVec) {
      const dense = topKByVector(queryVec, this.vectorRows({ project, kind, type, tool }), pool).map((r) => r.id);
      ids = rrf([lexical, dense]).map((r) => r.id);
    }
    const top = ids.slice(0, Math.min(Math.max(limit, 1), 200));
    if (!top.length) return [];
    const byId = new Map(this.db.prepare(`SELECT * FROM memories WHERE id IN (${top.map(() => "?").join(",")})`).all(...top).map((r) => [r.id, this.row(r)]));
    return top.map((id) => byId.get(id)).filter(Boolean);
  }

  // ---- vectors (semantic search, optional) --------------------------------------------------------------

  setVector(id, model, vec) {
    this.db.prepare("INSERT INTO memory_vectors (memory_id, model, dim, vec) VALUES (?,?,?,?) ON CONFLICT(memory_id) DO UPDATE SET model=excluded.model, dim=excluded.dim, vec=excluded.vec").run(id, model, vec.length, packVector(normalize(vec)));
    this.vecCache = null;
  }

  /** [{id, vec}] for memories that have vectors, optionally filtered. Cached until a vector or memory changes. */
  vectorRows({ project, kind, type, tool } = {}) {
    if (!this.vecCache) {
      this.vecCache = this.db.prepare("SELECT v.memory_id AS id, v.vec, m.project, m.kind, m.type, m.tool FROM memory_vectors v JOIN memories m ON m.id = v.memory_id").all().map((r) => ({ id: r.id, vec: unpackVector(r.vec), project: r.project, kind: r.kind, type: r.type, tool: r.tool }));
    }
    return this.vecCache.filter((r) => (!project || r.project === project) && (!kind || r.kind === kind) && (!type || r.type === type) && (!tool || r.tool === tool));
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
  context({ project, limit = 20, maxChars = 6000, tool } = {}) {
    const pinned = this.list({ project, pinned: true, limit: 50 }).items;
    const recent = this.db
      .prepare(`SELECT * FROM memories WHERE kind IN ('observation','summary','note') AND pinned = 0 ${project ? "AND project = ?" : ""} ORDER BY created_at_epoch DESC LIMIT ?`)
      .all(...(project ? [project] : []), Math.min(limit, 100))
      .map((r) => this.row(r));
    const line = (m) => `- #${m.id} ${new Date(m.created_at_epoch).toISOString().slice(0, 10)} [${m.type}] ${m.title}${m.narrative ? ` — ${m.narrative.replace(/\s+/g, " ").slice(0, 160)}` : ""}`;
    const parts = [`# Memory${project ? ` for ${project}` : ""}`];
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
