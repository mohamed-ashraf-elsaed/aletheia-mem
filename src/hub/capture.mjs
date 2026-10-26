// Capture: turn what an AI tool tells a hook into a memory. Works for any tool that can run a command on a
// hook: pipe the hook's JSON into `bun bin/aletheia.mjs capture --tool <name>`.
// Secrets are redacted BEFORE anything is stored, and <private>...</private> is dropped entirely.
import { projectKeyForPath } from "../readmodel/project.mjs";
import { redact } from "./redact.mjs";

export { redact } from "./redact.mjs";

const cut = (t, n) => (typeof t === "string" && t.length > n ? `${t.slice(0, n - 1)}…` : t);
const asText = (v) => (typeof v === "string" ? v : v == null ? "" : JSON.stringify(v));
const SKIP_TOOLS = new Set(["TodoWrite", "TaskCreate", "TaskUpdate", "ToolSearch"]);

function brief(toolName, input) {
  const i = typeof input === "object" && input ? input : {};
  return cut(i.command ?? i.file_path ?? i.path ?? i.pattern ?? i.query ?? i.url ?? i.description ?? asText(input), 160).replace(/\s+/g, " ");
}

/**
 * Normalise one hook payload to a memory input, or null when it should not be stored.
 * Understands Claude Code style hooks ({hook_event_name, prompt, tool_name, tool_input, tool_response, session_id, cwd})
 * and a generic shape ({kind|event, title, text, project, session}).
 */
export function normalizeHook(payload, { tool = "unknown", project } = {}) {
  if (!payload || typeof payload !== "object") return null;
  const cwd = payload.cwd ?? payload.workspace ?? payload.project_dir;
  const proj = project ?? payload.project ?? (cwd ? projectKeyForPath(cwd) : "default");
  const session = payload.session_id ?? payload.sessionId ?? payload.session;
  const event = payload.hook_event_name ?? payload.event ?? payload.type;
  const base = { project: proj, tool, sessionId: session };
  if (typeof payload.prompt === "string" || /prompt/i.test(String(event))) {
    const prompt = redact(payload.prompt ?? payload.text ?? "");
    if (!prompt.trim() || prompt.trim().length < 3) return null;
    return { ...base, kind: "prompt", type: "note", title: cut(prompt.replace(/\s+/g, " ").trim(), 120), narrative: cut(prompt, 8000) };
  }
  if (payload.tool_name) {
    if (SKIP_TOOLS.has(payload.tool_name)) return null;
    const out = redact(asText(payload.tool_response));
    return { ...base, kind: "event", type: "event", title: `${payload.tool_name}: ${redact(brief(payload.tool_name, payload.tool_input))}`, narrative: cut(`input: ${redact(asText(payload.tool_input))}\n\noutput: ${out}`, 1500) };
  }
  if (payload.title || payload.text || payload.narrative) {
    return { ...base, kind: payload.kind ?? "observation", type: payload.memoryType ?? payload.type_ ?? "note", title: redact(payload.title ?? cut(String(payload.text), 100)), narrative: redact(payload.narrative ?? payload.text), facts: payload.facts, concepts: payload.concepts, files: payload.files };
  }
  return null;
}
