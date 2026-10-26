// Claude Code hook adapter. Field names are those Claude Code sends on stdin and the settings shape is the one
// Claude Code documents; both were checked against a real installed plugin hook file on 2026-10-26:
// ~/.claude/plugins/marketplaces/thedotmack/plugin/hooks/hooks.json and the Claude Code adapter in claude-mem.
import { projectOf, promptMemory, sessionContext, sessionStartOutput, summaryMemory, toolMemory } from "./shared.mjs";

export const EVENTS = ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"];
export const MISSING_EVENTS = [];

const CANONICAL = new Map(EVENTS.map((event) => [event.toLowerCase(), event]));

export function canonicalEvent(event) {
  return CANONICAL.get(String(event ?? "").toLowerCase()) ?? null;
}

export const claudeCode = {
  id: "claude-code",
  name: "Claude Code",
  events: EVENTS,
  missingEvents: MISSING_EVENTS,
  missingSources: [],

  /** What to store for this event, already redacted. Pure: no database, no side effects. */
  capture(event, payload) {
    const name = canonicalEvent(event);
    const base = { project: projectOf(payload), tool: "claude-code", sessionId: payload.session_id ?? payload.sessionId ?? null };
    if (name === "UserPromptSubmit") return { memory: promptMemory(payload.prompt, base), compress: null };
    if (name === "PostToolUse") return { memory: toolMemory({ name: payload.tool_name, input: payload.tool_input, response: payload.tool_response }, base), compress: null };
    if (name === "Stop" || name === "SessionEnd") return { memory: summaryMemory(payload.last_assistant_message, base), compress: { project: base.project, sessionId: base.sessionId }, sessionEnd: { project: base.project, sessionId: base.sessionId } };
    return { memory: null, compress: null };
  },

  /** Context to inject, or "" when this fire should stay silent. Resume already has the conversation. */
  context(event, payload, store) {
    if (canonicalEvent(event) !== "SessionStart") return "";
    if ((payload.source ?? "startup") === "resume") return "";
    return sessionStartOutput(sessionContext(store, { project: projectOf(payload), tool: "claude-code" }));
  },
};

export default claudeCode;
