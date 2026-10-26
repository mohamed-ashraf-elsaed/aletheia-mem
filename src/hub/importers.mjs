// Importers: bring memory from another system into the hub. Idempotent (the store de-duplicates by content).
import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { safeAll } from "../lib/util.mjs";

const TYPE_MAP = { bugfix: "bugfix", feature: "feature", refactor: "refactor", change: "change", discovery: "discovery", decision: "decision" };

const firstLine = (t, n = 120) => String(t ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * claude-mem (any 15.x) database -> hub. Reads observations, session summaries and prompts. Read-only.
 * options: { includePrompts = true, project }
 */
export function importClaudeMem(store, dbPath, { includePrompts = true, project = null } = {}) {
  if (!existsSync(dbPath)) throw new RangeError(`No claude-mem database at ${dbPath}.`);
  const src = new Database(dbPath, { readonly: true, create: false });
  src.exec("PRAGMA query_only = ON");
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
