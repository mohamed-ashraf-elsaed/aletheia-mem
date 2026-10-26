// Gemini CLI hook adapter. Hooks live in ~/.gemini/settings.json under `hooks.<Event>[]`, each with a nested
// `hooks: [{type: "command", command, timeout?}]`. Event names, the common input fields (session_id,
// transcript_path, cwd, hook_event_name, timestamp) and the fields used here come from
// https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md, fetched 2026-10-26.
//
// Gemini has no UserPromptSubmit; BeforeAgent carries the prompt and AfterAgent carries prompt_response.
import { projectOf, promptMemory, sessionContext, sessionStartOutput, summaryMemory, toolMemory } from "./shared.mjs";

export const EVENTS = ["SessionStart", "BeforeAgent", "AfterTool", "AfterAgent", "SessionEnd"];
export const MISSING_EVENTS = [];

const CANONICAL = new Map(EVENTS.map((event) => [event.toLowerCase(), event]));

export function canonicalEvent(event) {
  return CANONICAL.get(String(event ?? "").toLowerCase()) ?? null;
}

export const geminiCli = {
  id: "gemini-cli",
  name: "Gemini CLI",
  events: EVENTS,
  missingEvents: MISSING_EVENTS,
  notes: [
    "Gemini hooks and MCP servers share ~/.gemini/settings.json.",
    "Hook timeouts are milliseconds in Gemini (the installer writes 10000).",
    "No real Gemini hook has run here; the payloads are from the official hooks reference.",
  ],

  capture(event, payload) {
    const name = canonicalEvent(event);
    const base = { project: projectOf(payload), tool: "gemini-cli", sessionId: payload.session_id ?? null };
    if (name === "BeforeAgent") return { memory: promptMemory(payload.prompt, base), compress: null };
    if (name === "AfterTool") return { memory: toolMemory({ name: payload.tool_name, input: payload.tool_input, response: payload.tool_response }, base), compress: null };
    if (name === "AfterAgent") return { memory: summaryMemory(payload.prompt_response, base), compress: { project: base.project, sessionId: base.sessionId } };
    if (name === "SessionEnd") return { memory: null, compress: { project: base.project, sessionId: base.sessionId } };
    return { memory: null, compress: null };
  },

  context(event, payload, store) {
    if (canonicalEvent(event) !== "SessionStart") return "";
    if ((payload.source ?? "startup") === "resume") return "";
    return sessionStartOutput(sessionContext(store, { project: projectOf(payload), tool: "gemini-cli" }));
  },
};

export default geminiCli;
