// Cursor hook adapter. The user-level hooks file is ~/.cursor/hooks.json with a flat per-event array
// ({version: 1, hooks: {event: [{command, timeout?}]}}). Payloads and the prefixed `event` names below come
// from https://cursor.com/docs/agent/hooks, fetched 2026-10-26.
//
// Cursor's `stop` payload has no assistant text (status and loop_count only). The assistant text arrives on
// `afterAgentResponse`, so that event stores the summary and `stop` only queues compression.
import { projectKeyForHook, promptMemory, sessionContext, summaryMemory, toolMemory } from "./shared.mjs";

export const EVENTS = ["sessionStart", "beforeSubmitPrompt", "postToolUse", "afterAgentResponse", "stop", "sessionEnd"];
export const MISSING_EVENTS = [];

const CANONICAL = new Map(EVENTS.map((event) => [event.toLowerCase(), event]));

export function canonicalEvent(event) {
  return CANONICAL.get(String(event ?? "").toLowerCase()) ?? null;
}

/** Cursor sends workspace_roots; cwd is present on tool hooks. */
export const projectFor = (payload) => projectKeyForHook(payload?.workspace_roots?.[0] ?? payload?.cwd ?? process.cwd());

export const cursor = {
  id: "cursor",
  name: "Cursor",
  events: EVENTS,
  missingEvents: MISSING_EVENTS,
  notes: [
    "Cursor user hooks live in ~/.cursor/hooks.json; project hooks use .cursor/hooks.json.",
    "The stop hook carries no assistant text, so afterAgentResponse stores the summary.",
    "Cursor has no global rules file; aletheia rules sync writes .cursor/rules/aletheia.mdc per project.",
  ],

  project: projectFor,

  capture(event, payload) {
    const name = canonicalEvent(event);
    const base = { project: projectFor(payload), tool: "cursor", sessionId: payload.session_id ?? payload.conversation_id ?? null };
    if (name === "beforeSubmitPrompt") return { memory: promptMemory(payload.prompt, base), compress: null };
    if (name === "postToolUse") return { memory: toolMemory({ name: payload.tool_name, input: payload.tool_input, response: payload.tool_output }, base), compress: null };
    if (name === "afterAgentResponse") return { memory: summaryMemory(payload.text, base), compress: null };
    if (name === "stop" || name === "sessionEnd") return { memory: null, compress: { project: base.project, sessionId: base.sessionId }, sessionEnd: { project: base.project, sessionId: base.sessionId } };
    return { memory: null, compress: null };
  },

  context(event, payload, store) {
    if (canonicalEvent(event) !== "sessionStart") return "";
    const context = sessionContext(store, { project: projectFor(payload), tool: "cursor" });
    return context ? JSON.stringify({ additional_context: context }) : "";
  },
};

export default cursor;
