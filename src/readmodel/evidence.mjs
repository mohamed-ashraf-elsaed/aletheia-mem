// Evidence: the raw recorded row behind a card, served at /api/work-view/evidence/:kind/:id.
import { safeAll } from "../lib/util.mjs";
import { OVERLAY_ID_BASE } from "../store/overlay.mjs";

export const EVIDENCE_KINDS = ["work-state", "observation", "prompt", "summary", "session", "tool-use"];

const SQL = {
  "work-state": "SELECT id, project, list_name, fields, created_at_epoch FROM work_state_entries WHERE id = ?",
  observation: "SELECT id, project, title, subtitle, narrative, created_at_epoch FROM observations WHERE id = ?",
  prompt: "SELECT id, session_db_id, prompt_number, prompt_text, created_at_epoch FROM user_prompts WHERE id = ?",
  summary: "SELECT id, project, request, completed, next_steps, created_at_epoch FROM session_summaries WHERE id = ?",
  session: "SELECT id, project, platform_source, user_prompt, custom_title, status, started_at_epoch FROM sdk_sessions WHERE id = ?",
  "tool-use": "SELECT id, project, tool_name, substr(tool_input, 1, 4000) AS tool_input, substr(tool_response, 1, 4000) AS tool_response, created_at_epoch FROM tool_uses WHERE id = ?",
};

/** `{kind, ...row}` or null. Overlay work-state ids are looked up in the overlay store. */
export function evidenceRow(db, overlay, kind, id) {
  if (!Number.isSafeInteger(id) || id < 1 || !SQL[kind]) return null;
  if (kind === "work-state" && id >= OVERLAY_ID_BASE) {
    const row = overlay?.get(id);
    return row ? { kind, ...row, id } : null;
  }
  const row = safeAll(db, SQL[kind], [id])[0];
  return row ? { kind, ...row } : null;
}
