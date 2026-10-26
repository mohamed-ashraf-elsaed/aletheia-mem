// Command Code hook adapter. Field names and the settings shape come from the Command Code hooks reference
// (generated from https://commandcode.ai/docs/hooks) and were checked against the CLI v1.88.0 on this machine.
//
// Command Code supports PreToolUse, PostToolUse, Stop and SessionStart. It has no UserPromptSubmit and no
// SessionEnd hook, and its SessionStart source is startup|resume|clear (no compact). Prompts and session-end
// summaries therefore cannot be captured here; the installer says so and docs/25-installers.md records it.
import { projectOf, sessionContext, sessionStartOutput, toolMemory } from "./shared.mjs";

export const EVENTS = ["SessionStart", "PostToolUse", "Stop"];
export const MISSING_EVENTS = ["UserPromptSubmit", "SessionEnd"];

const CANONICAL = new Map(EVENTS.map((event) => [event.toLowerCase(), event]));
CANONICAL.set("pretooluse", "PreToolUse");

export function canonicalEvent(event) {
  return CANONICAL.get(String(event ?? "").toLowerCase()) ?? null;
}

export const commandCode = {
  id: "command-code",
  name: "Command Code",
  events: EVENTS,
  missingEvents: MISSING_EVENTS,
  missingSources: ["compact"],
  notes: [
    "Command Code has no UserPromptSubmit hook, so user prompts are not captured.",
    "Command Code has no SessionEnd hook, so session-end summaries are not captured.",
    "Command Code SessionStart reports startup, resume or clear only; there is no compact source.",
  ],

  capture(event, payload) {
    const name = canonicalEvent(event);
    const base = { project: projectOf(payload), tool: "command-code", sessionId: payload.session_id ?? payload.sessionId ?? null };
    if (name === "PostToolUse") return { memory: toolMemory({ name: payload.tool_name, display: payload.tool_display_name, input: payload.tool_input, response: payload.tool_response }, base), compress: null };
    if (name === "Stop") return { memory: null, compress: { project: base.project, sessionId: base.sessionId }, sessionEnd: { project: base.project, sessionId: base.sessionId } };
    return { memory: null, compress: null };
  },

  context(event, payload, store) {
    if (canonicalEvent(event) !== "SessionStart") return "";
    if ((payload.source ?? "startup") === "resume") return "";
    return sessionStartOutput(sessionContext(store, { project: projectOf(payload), tool: "command-code" }));
  },
};

export default commandCode;
