// Which prompts count as a human request, and how a request is keyed and titled.
// Port of the original's request text rules (request-projection.mjs / request-groups.mjs).

const STRIPPED_BLOCKS =
  /<(environment_context|instructions|system-reminder|turn_aborted|permissions|collaboration_mode|skills_instructions)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Prompt text with agent scaffolding removed, cut to `max`. null when nothing human is left. */
export function requestText(value, max = 1200) {
  if (typeof value !== "string") return null;
  const body = (value.match(/^\s*#{1,2}\s+My request\s*:\s*(?:\r?\n)?([\s\S]*)$/im)?.[1] ?? value)
    .replace(STRIPPED_BLOCKS, " ")
    .replace(/^\s*#\s*AGENTS\.md instructions[^\n]*(?:\n|$)/gim, " ")
    .replace(/<\/?pasted_content\b[^>]*>/gi, "")
    .trim();
  if (
    /^\s*#{1,2}\s+Files mentioned by the user\s*:/i.test(body) ||
    !body ||
    /^\s*<(?:environment_context|instructions|system-reminder)\b/i.test(body)
  ) {
    return null;
  }
  return body.length > max ? `${body.slice(0, max - 1).trimEnd()}…` : body;
}

const ACTION_VERBS =
  /\b(?:make|build|create|implement|design|fix|investigate|audit|review|write|rewrite|show|see|find|search|explain|compare|help|convert|add|remove|update|rename|run|test|verify|deploy|analyze|analyse|read|tell|open|generate|ship|merge|commit|push|release|publish|set up|i want|i need|can you|could you|would you|how (?:can|do|does|is)|what (?:is|are|does|did)|why (?:is|are|does|did)|do we|do you|(?:is|are|seems?|looks?) (?:broken|failing|wrong)|doesn'?t work|not working)\b/i;
const LEADING_VERB = /^(?:please\s+)?([a-z]{3,})\s+(?:the|this|that|these|those|all|every|each|my|our|your|its|it|them|any|some|a|an)\b/i;
const NOT_A_VERB =
  /^(?:the|and|for|with|from|now|then|just|not|about|after|before|into|onto|over|under|like|also|here|there|when|where|what|which|who|why|how|but|yet|all|any|some|its|our|your|this|that|these|those|they|she|his|her|one|two|three)$/i;
const FUNCTION_WORDS =
  /\b(?:the|a|an|this|that|it|is|are|to|of|and|for|with|in|on|my|me|you|we|please|just|all|so|now|then|from|be|not)\b/i;

/** True when the prompt reads as an actual ask rather than a greeting, an ack, or an agent launcher. */
export function isHumanActionRequest(value) {
  const text = requestText(value);
  if (!text) return false;
  const flat = text.replace(/[*_`#]/g, "").replace(/\s+/g, " ").trim();
  if (
    /^(?:please\s+)?read\s+(?:the\s+)?[\w./ -]*(?:AGENTS|KICKOFF|CLAUDE)\.md(?:\s+and\s+(?:follow|obey|read|apply)(?:\s+it|\s+the\s+instructions)?\s*)?[.!]?$/i.test(flat) ||
    /^(?:hi|hello|hey|thanks|thank you|ok(?:ay)?|yes|no|sure|continue|go ahead|keep going|resume|done)[.!\s]*$/i.test(flat) ||
    /^(?:You are (?:Codex|an AI)|Available skills|Environment context)\b/i.test(flat) ||
    /^(?:(?:please|just)\s+)?make sure (?:this|that|it|everything) (?:is |will be |keeps? )?(?:working|works|ok|okay|correct)(?:[.!\s]*)$/i.test(flat) ||
    (/^you can (?:def(?:initely)? )?do (?:real )?tests?[,;.!\s]/i.test(flat) &&
      !/\b(?:fix|build|create|implement|change|update|rename|remove|add)\b/i.test(flat))
  ) {
    return false;
  }
  if (/(?:^|\s)GOAL\s*:\s*\S/i.test(flat) || ACTION_VERBS.test(flat)) return true;
  const lead = LEADING_VERB.exec(flat);
  if (lead && !NOT_A_VERB.test(lead[1])) return true;
  if (/[^\x00-\x7F]/.test(flat)) return new RegExp("\\p{L}.*\\p{L}", "u").test(flat);
  return !FUNCTION_WORDS.test(flat) && (flat.match(/\b[a-z]{3,}\b/gi) ?? []).length >= 2;
}

/** Looser cleanup used for session-summary requests and initial prompts (500 chars, no human test). */
export function sessionRequestText(value) {
  if (typeof value !== "string") return null;
  const body = value
    .replace(STRIPPED_BLOCKS, " ")
    .replace(/^\s*#\s*AGENTS\.md instructions[^\n]*(?:\n|$)/gim, " ")
    .trim();
  if (!body || /^\s*(?:<\/?(?:environment_context|instructions|system-reminder)\b|You are (?:Codex|an AI)\b)/i.test(body)) {
    return null;
  }
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > 500 ? `${flat.slice(0, 499).trimEnd()}…` : flat;
}

/** A short title taken from the request itself: the GOAL line, else the first line, first sentence, <= 100 chars. */
export function titleFromRequest(value) {
  const text = requestText(typeof value === "string" ? value : value?.text);
  if (!text) return "";
  const goal = text.match(/(?:^|\n)\s*GOAL\s*:\s*([^\n]+)/i);
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const first = goal?.[1] ?? lines[0] ?? "";
  const continued = /\bcalled\s*$/i.test(first) && /^["“'‘]/.test(lines[1] ?? "") ? ` ${lines[1]}` : "";
  const sentence = `${first}${continued}`
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^#{1,6}\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s|;\s/)[0];
  if (sentence.length <= 100) return sentence;
  const cut = sentence.slice(0, 99);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > 60 ? space : 99).trimEnd()}…`;
}

export function isConversationKey(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed[0] === "conversation" && parsed.length === 3;
  } catch {
    return false;
  }
}

/** Identity of a conversation: JSON ["conversation", platform_source, content_session_id]. */
export function conversationKey(session) {
  return !session?.content_session_id || !session?.platform_source
    ? null
    : JSON.stringify(["conversation", session.platform_source, session.content_session_id]);
}

/** Key of one prompt inside a session: JSON ["request", platform, sessionDbId, promptNumber]. */
export function requestKey(session, promptNumber) {
  if (!session || !Number.isInteger(Number(promptNumber)) || Number(promptNumber) < 0 || promptNumber == null) return null;
  return JSON.stringify(["request", session.platform_source ?? "unknown", String(session.id), Number(promptNumber)]);
}

/** Compare two [epoch, deviceId, localId] sort keys. */
export function compareSourceOrder(a = null, b = null) {
  if (!a || !b) return 0;
  const epoch = a[0] - b[0];
  const device = a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  const x = BigInt(a[2]);
  const y = BigInt(b[2]);
  return epoch || device || (x < y ? -1 : x > y ? 1 : 0);
}

/** The first substantive human ask of a session: its initial prompt or its earliest real user_prompt row. */
export function originalFor(session, prompts) {
  const firstReal = prompts
    .filter((prompt) => prompt.session_db_id === session.id)
    .sort(
      (a, b) =>
        (a.prompt_number ?? Infinity) - (b.prompt_number ?? Infinity) ||
        (a.created_at_epoch ?? 0) - (b.created_at_epoch ?? 0) ||
        a.id - b.id,
    )
    .find((prompt) => isHumanActionRequest(prompt.prompt_text));
  const initial = () => ({
    text: requestText(session.user_prompt),
    source: "session-initial-request",
    sourceId: session.id,
    url: `/api/work-view/evidence/session/${session.id}`,
    promptNumber: 1,
    atEpoch: session.started_at_epoch ?? null,
  });
  if (isHumanActionRequest(session.user_prompt) && (!firstReal || firstReal.prompt_number > 1)) return initial();
  if (firstReal) {
    return {
      text: requestText(firstReal.prompt_text),
      source: "user-prompt",
      sourceId: firstReal.id,
      url: `/api/work-view/evidence/prompt/${firstReal.id}`,
      promptNumber: firstReal.prompt_number,
      atEpoch: firstReal.created_at_epoch ?? null,
    };
  }
  return isHumanActionRequest(session.user_prompt) ? initial() : null;
}
