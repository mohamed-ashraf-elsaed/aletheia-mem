// Importers: bring memory from another system into the hub. Idempotent (the store de-duplicates by content).
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";
import { safeAll } from "../lib/util.mjs";
import { sha256 } from "../lib/hash.mjs";
import { redact } from "./redact.mjs";
import { projectKeyForHook } from "./hooks/shared.mjs";

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

// ---- Claude Code auto memory: <projects>/<project>/memory/*.md (https://code.claude.com/docs/en/memory, 2026-11-11) ----

/** Split a memory file into frontmatter fields and body. Frontmatter is flat `key: value` lines between --- markers. */
export function parseMemoryFile(text) {
  const match = String(text).replace(/^\uFEFF/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: String(text) };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (kv) meta[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: match[2] };
}

/** Body -> [{ heading, text }]: one section per `## ` heading, or the whole body when there is none. */
function sectionsOf(body) {
  const parts = body.split(/^(?=##\s)/m).map((part) => part.trim()).filter(Boolean);
  if (parts.length <= 1 && !/^##\s/.test(parts[0] ?? "")) return parts.length ? [{ heading: "", text: parts[0] }] : [];
  return parts.map((part) => {
    const heading = part.match(/^##\s+(.*)$/m);
    return /^##\s/.test(part) ? { heading: heading[1].trim(), text: part.replace(/^##\s+.*\n?/, "").trim() || heading[1].trim() } : { heading: "", text: part };
  });
}

/** Claude Code names a project folder after the project path with separators turned into "-". Walk the disk to undo it. */
export function decodeProjectFolder(name) {
  const parts = name.replace(/^-/, "").split("-");
  const walk = (base, i) => {
    if (i >= parts.length) return base;
    for (let j = parts.length; j > i; j--) {
      const next = join(base, parts.slice(i, j).join("-"));
      try {
        if (!statSync(next).isDirectory()) continue;
      } catch {
        continue;
      }
      const found = walk(next, j);
      if (found) return found;
    }
    return null;
  };
  return walk(sep, 0);
}

function memoryFolders(path, home) {
  const root = path ?? join(home, ".claude", "projects");
  if (!existsSync(root)) throw new RangeError(`No auto-memory folder at ${root}.`);
  const own = readdirSync(root).filter((f) => f.endsWith(".md"));
  if (own.length) return [{ folder: root, name: root.split(sep).slice(-2, -1)[0] ?? "", mdFiles: own }];
  const out = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = join(root, entry.name, "memory");
    if (existsSync(dir)) out.push({ folder: dir, name: entry.name, mdFiles: readdirSync(dir).filter((f) => f.endsWith(".md")) });
  }
  return out;
}

/**
 * Claude Code auto-memory files -> hub. Read-only on the source. MEMORY.md is the index and is skipped; every other
 * .md file becomes one memory per `## ` section (or one for the file). Text is redacted and <private> dropped before
 * storage; the store de-duplicates by content, so a re-run adds nothing.
 * options: { path, home, project, dryRun }
 */
export function importClaudeMemory(store, { path = null, home, project = null, dryRun = false } = {}) {
  const result = { folders: 0, files: 0, sections: 0, added: 0, skipped: 0, unmapped: [], dryRun, items: [] };
  const pending = [];
  for (const { folder, name, mdFiles } of memoryFolders(path, home)) {
    let key = project;
    if (!key) {
      const root = decodeProjectFolder(name);
      key = root ? projectKeyForHook(root) : null;
    }
    if (!key) {
      result.unmapped.push(name);
      continue;
    }
    result.folders++;
    for (const file of mdFiles.sort()) {
      if (file === "MEMORY.md") continue;
      const full = join(folder, file);
      const { meta, body } = parseMemoryFile(readFileSync(full, "utf8"));
      const modified = Date.parse(meta.modified ?? "");
      const at = Number.isFinite(modified) ? modified : statSync(full).mtimeMs;
      const label = meta.name || file.replace(/\.md$/, "");
      result.files++;
      for (const section of sectionsOf(body)) {
        const text = redact(section.text).trim();
        if (text.length < 3) continue;
        const title = (section.heading ? `${label}: ${section.heading}` : label).slice(0, 120);
        const hash = sha256(`claude-memory\n${key}\n${file}\n${section.heading}\n${text}`).slice(0, 16);
        pending.push({ project: key, kind: "note", type: "note", title: redact(title), narrative: text, concepts: meta.type ? [meta.type] : undefined, tool: "claude-code", origin: `claude-memory:${file}#${hash}`, createdAtEpoch: at });
        result.sections++;
      }
    }
  }
  if (dryRun) {
    for (const item of pending) {
      const exists = store.db.prepare("SELECT 1 FROM memories WHERE origin = ?").get(item.origin);
      result[exists ? "skipped" : "added"]++;
      result.items.push(`${item.project}: ${item.title}`);
    }
    return result;
  }
  store.db.exec("BEGIN");
  try {
    for (const item of pending) {
      const exists = store.db.prepare("SELECT 1 FROM memories WHERE origin = ?").get(item.origin);
      if (exists) {
        result.skipped++;
        continue;
      }
      result[store.add(item, { actor: "import" }).created ? "added" : "skipped"]++;
    }
    store.audit("import", "claude-memory.import", { folders: result.folders, files: result.files, added: result.added, skipped: result.skipped });
    store.db.exec("COMMIT");
  } catch (error) {
    store.db.exec("ROLLBACK");
    throw error;
  }
  return result;
}
