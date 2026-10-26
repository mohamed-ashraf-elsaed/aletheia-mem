// Windsurf / Devin Desktop Cascade hook adapter. Hooks live in ~/.codeium/windsurf/hooks.json with a flat
// per-event array: {hooks: {pre_user_prompt: [{command, show_output?, working_directory?}]}}. The events and
// tool_info fields below come from https://docs.windsurf.com/windsurf/cascade/hooks, fetched 2026-10-26.
//
// Cascade has no session-start or session-end event, so this adapter captures and never injects context.
// The hook command runs from the workspace root by default (working_directory defaults to it), so a payload
// without a cwd falls back to the process cwd.
import { projectKeyForHook, promptMemory, summaryMemory, toolMemory } from "./shared.mjs";

export const EVENTS = ["pre_user_prompt", "post_run_command", "post_write_code", "post_cascade_response"];
export const MISSING_EVENTS = ["SessionStart", "SessionEnd"];

const CANONICAL = new Map(EVENTS.map((event) => [event, event]));

export function canonicalEvent(event) {
  return CANONICAL.get(String(event ?? "").toLowerCase()) ?? null;
}

export const projectFor = (payload) => projectKeyForHook(payload?.tool_info?.cwd ?? payload?.cwd ?? process.cwd());

export const windsurf = {
  id: "windsurf",
  name: "Windsurf",
  events: EVENTS,
  missingEvents: MISSING_EVENTS,
  notes: [
    "Cascade has no session-start/session-end hook, so no context is injected and no session-end summary is stored.",
    "Hooks run from the workspace root; a payload without a cwd uses the hook process cwd.",
    "Docs now describe the product as Devin Desktop; the legacy Windsurf user paths are used here.",
  ],

  project: projectFor,

  capture(event, payload) {
    const name = canonicalEvent(event);
    const tool = payload.tool_info ?? {};
    const base = { project: projectFor(payload), tool: "windsurf", sessionId: payload.trajectory_id ?? null };
    if (name === "pre_user_prompt") return { memory: promptMemory(tool.user_prompt, base), compress: null };
    if (name === "post_run_command") return { memory: toolMemory({ name: "Shell", input: { command: tool.command_line }, response: "" }, base), compress: null };
    if (name === "post_write_code") return { memory: toolMemory({ name: "Write", input: { file_path: tool.file_path, edits: tool.edits }, response: "" }, base), compress: null };
    if (name === "post_cascade_response") return { memory: summaryMemory(tool.response, base), compress: { project: base.project, sessionId: base.sessionId } };
    return { memory: null, compress: null };
  },

  context() {
    return "";
  },
};

export default windsurf;
