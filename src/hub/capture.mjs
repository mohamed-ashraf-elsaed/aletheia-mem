// Capture: turn what an AI tool tells a hook into a memory. Works for any tool that can run a command on a
// hook: pipe the hook's JSON into `bun bin/aletheia.mjs capture --tool <name>`.
// Secrets are redacted BEFORE anything is stored, and <private>...</private> is dropped entirely.
import { projectKeyForPath } from "../readmodel/project.mjs";

const REDACTIONS = [
  [/\bsk-ant-[A-Za-z0-9_-]{20,}/g, "[redacted:anthropic-key]"],
  [/\bsk-[A-Za-z0-9_-]{20,}/g, "[redacted:api-key]"], // OpenAI (sk-proj-...), OpenRouter (sk-or-v1-...), others
  [/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/g, "[redacted:stripe-key]"],
  [/\bglpat-[A-Za-z0-9_-]{20,}/g, "[redacted:gitlab-token]"],
  [/\bnpm_[A-Za-z0-9]{30,}/g, "[redacted:npm-token]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[redacted:jwt]"],
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)[^\s@/]{3,}(@)/gi, "$1[redacted]$2"], // credentials inside a URL
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/g, "[redacted:github-token]"],
  [/\bgithub_pat_[A-Za-z0-9_]{40,}/g, "[redacted:github-token]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[redacted:aws-key-id]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[redacted:slack-token]"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, "[redacted:google-key]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted:private-key]"],
  [/\b(authorization\s*[:=]\s*bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, "$1[redacted]"],
  [/\b((?:password|passwd|secret|token|api[_-]?key)\s*[:=]\s*)["']?[^\s"',;]{6,}["']?/gi, "$1[redacted]"],
];

export function redact(text) {
  if (typeof text !== "string") return text;
  let out = text.replace(/<private>[\s\S]*?<\/private>/gi, "[private]");
  for (const [re, sub] of REDACTIONS) out = out.replace(re, sub);
  return out;
}

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
