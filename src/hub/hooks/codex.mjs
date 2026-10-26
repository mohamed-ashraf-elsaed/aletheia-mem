// Codex CLI hook adapter. Hooks live in ~/.codex/hooks.json (or inline [hooks] in config.toml); the JSON
// shape is {hooks: {Event: [{matcher?, hooks: [{type: "command", command, timeout?}]}]}}. Event names, the
// common input fields (session_id, transcript_path, cwd, hook_event_name, model, permission_mode) and the
// event fields used here come from https://developers.openai.com/codex/hooks, fetched 2026-10-26.
//
// Codex requires non-managed hooks to be reviewed and trusted once (/hooks in the CLI). The installer says so.
import { projectOf, promptMemory, sessionContext, sessionStartOutput, summaryMemory, toolMemory } from "./shared.mjs";

export const EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"];
export const MISSING_EVENTS = [];

const CANONICAL = new Map(EVENTS.map((event) => [event.toLowerCase(), event]));

export function canonicalEvent(event) {
  return CANONICAL.get(String(event ?? "").toLowerCase()) ?? null;
}

export const codex = {
  id: "codex",
  name: "Codex CLI",
  events: EVENTS,
  missingEvents: MISSING_EVENTS,
  notes: [
    "Codex requires non-managed hooks to be reviewed once with /hooks before they run.",
    "Hooks are enabled by default; [features] hooks = false turns them off.",
    "No global Codex rules file was verified. Rules sync writes AGENTS.md in the project.",
  ],

  capture(event, payload) {
    const name = canonicalEvent(event);
    const base = { project: projectOf(payload), tool: "codex", sessionId: payload.session_id ?? null };
    if (name === "UserPromptSubmit") return { memory: promptMemory(payload.prompt, base), compress: null };
    if (name === "PostToolUse") return { memory: toolMemory({ name: payload.tool_name, input: payload.tool_input, response: payload.tool_response }, base), compress: null };
    if (name === "Stop") return { memory: summaryMemory(payload.last_assistant_message, base), compress: { project: base.project, sessionId: base.sessionId }, sessionEnd: { project: base.project, sessionId: base.sessionId } };
    if (name === "SessionEnd") return { memory: null, compress: { project: base.project, sessionId: base.sessionId }, sessionEnd: { project: base.project, sessionId: base.sessionId } };
    return { memory: null, compress: null };
  },

  context(event, payload, store) {
    if (canonicalEvent(event) !== "SessionStart") return "";
    if ((payload.source ?? "startup") === "resume") return "";
    return sessionStartOutput(sessionContext(store, { project: projectOf(payload), tool: "codex" }));
  },
};

export default codex;
