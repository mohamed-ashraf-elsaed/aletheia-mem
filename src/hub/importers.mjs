// Importers: bring memory from another system into the hub. Idempotent (the store de-duplicates by content).
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { safeAll } from "../lib/util.mjs";

const TYPE_MAP = { bugfix: "bugfix", feature: "feature", refactor: "refactor", change: "change", discovery: "discovery", decision: "decision" };

const firstLine = (t, n = 120) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/** Tables and columns this importer reads. A missing one is a schema change, not an empty import. */
export const REQUIRED_SCHEMA = {
  sdk_sessions: ["id", "memory_session_id", "content_session_id", "platform_source", "project"],
  observations: ["id", "memory_session_id", "project", "type", "title", "text", "subtitle", "narrative", "facts", "concepts", "files_read", "files_modified", "created_at_epoch"],
  session_summaries: ["id", "memory_session_id", "project", "request", "investigated", "learned", "completed", "next_steps", "notes", "created_at_epoch"],
  user_prompts: ["id", "session_db_id", "prompt_text", "created_at_epoch"],
};

/**
 * Fail loudly when an upstream claude-mem schema moved. Returns the tables it checked. Throws a RangeError that
 * names the database, the missing table or the missing column. Call it before reading any row.
 */
export function probeClaudeMemSchema(src, dbPath, { includePrompts = true } = {}) {
  const tables = new Set(src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
  const checked = [];
  for (const [table, columns] of Object.entries(REQUIRED_SCHEMA)) {
    if (table === "user_prompts" && !includePrompts) continue;
    if (!tables.has(table)) throw new RangeError(`claude-mem database ${dbPath} has no "${table}" table. The upstream schema changed; this importer cannot read it.`);
    const present = new Set(src.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
    for (const column of columns) {
      if (!present.has(column)) throw new RangeError(`claude-mem database ${dbPath} has no "${table}.${column}" column. The upstream schema changed; this importer cannot read it.`);
    }
    checked.push(table);
  }
  return { tables: checked };
}

/**
 * claude-mem (any 15.x) database -> hub. Reads observations, session summaries and prompts. Read-only.
 * options: { includePrompts = true, project }
 */
export function importClaudeMem(store, dbPath, { includePrompts = true, project = null } = {}) {
  if (!existsSync(dbPath)) throw new RangeError(`No claude-mem database at ${dbPath}.`);
  const src = new Database(dbPath, { readonly: true, create: false });
  src.exec("PRAGMA query_only = ON");
  try {
    probeClaudeMemSchema(src, dbPath, { includePrompts });
  } catch (error) {
    src.close();
    throw error;
  }
  const counts = { observations: { added: 0, skipped: 0 }, summaries: { added: 0, skipped: 0 }, prompts: { added: 0, skipped: 0 } };
  try {
    const sessions = new Map(safeAll(src, "SELECT memory_session_id, content_session_id, platform_source FROM sdk_sessions").map((s) => [s.memory_session_id, s]));
    const bySessionId = new Map(safeAll(src, "SELECT id, content_session_id, platform_source, project FROM sdk_sessions").map((s) => [s.id, s]));
    const where = project ? "WHERE project = ?" : "";
    const p = project ? [project] : [];
    store.db.exec("BEGIN");
    try {
      for (const o of safeAll(src, `SELECT * FROM observations ${where} ORDER BY id`, p)) {
        const s = sessions.get(o.memory_session_id);
        const files = [...new Set([...(tryJson(o.files_modified) ?? []), ...(tryJson(o.files_read) ?? [])])];
        const r = store.add({
          project: o.project, kind: "observation", type: TYPE_MAP[o.type] ?? o.type ?? "change", title: o.title ?? firstLine(o.text), subtitle: o.subtitle,
          narrative: o.narrative ?? o.text, facts: tryJson(o.facts) ?? undefined, concepts: tryJson(o.concepts) ?? undefined, files: files.length ? files : undefined,
          tool: s?.platform_source ?? "claude", sessionId: s?.content_session_id, origin: `claude-mem:obs:${o.id}`, createdAtEpoch: o.created_at_epoch,
        }, { actor: "import" });
        counts.observations[r.created ? "added" : "skipped"]++;
      }
      for (const m of safeAll(src, `SELECT * FROM session_summaries ${where} ORDER BY id`, p)) {
        const s = sessions.get(m.memory_session_id);
        const body = [["Request", m.request], ["Investigated", m.investigated], ["Learned", m.learned], ["Completed", m.completed], ["Next steps", m.next_steps], ["Notes", m.notes]]
          .filter(([, v]) => v && String(v).trim()).map(([k, v]) => `**${k}.** ${String(v).trim()}`).join("\n\n");
        if (!body) continue;
        const r = store.add({ project: m.project, kind: "summary", type: "note", title: firstLine(m.request || m.completed || "Session summary"), narrative: body, tool: s?.platform_source ?? "claude", sessionId: s?.content_session_id, origin: `claude-mem:sum:${m.id}`, createdAtEpoch: m.created_at_epoch }, { actor: "import" });
        counts.summaries[r.created ? "added" : "skipped"]++;
      }
      if (includePrompts) {
        for (const u of safeAll(src, "SELECT * FROM user_prompts ORDER BY id")) {
          const s = bySessionId.get(u.session_db_id);
          if (project && s?.project !== project) continue;
          const r = store.add({ project: s?.project ?? "default", kind: "prompt", type: "note", title: firstLine(u.prompt_text), narrative: u.prompt_text, tool: s?.platform_source ?? "claude", sessionId: s?.content_session_id, origin: `claude-mem:prompt:${u.id}`, createdAtEpoch: u.created_at_epoch }, { actor: "import" });
          counts.prompts[r.created ? "added" : "skipped"]++;
        }
      }
      store.audit("import", "claude-mem.import", counts);
      store.db.exec("COMMIT");
    } catch (error) {
      store.db.exec("ROLLBACK");
      throw error;
    }
  } finally {
    src.close();
  }
  return counts;
}

function tryJson(v) {
  if (v == null || v === "") return null;
  try {
    const x = JSON.parse(v);
    return Array.isArray(x) ? x : null;
  } catch {
    return null;
  }
}
