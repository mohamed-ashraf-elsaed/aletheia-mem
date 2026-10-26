// Fact extraction: turn a window of episodes into 0-5 atomic facts. The output is untrusted, so every field is
// validated and capped before it reaches the store. With no provider, a deterministic rule extractor runs instead;
// each stored fact records which mode and prompt version produced it.
import { readFileSync } from "node:fs";
import { redact } from "./redact.mjs";
import { attachFactEntities } from "./entities.mjs";
import { estimateTokens, pricesFrom, recordCall } from "./usage.mjs";

export const FACTS_PROMPT_VERSION = "facts-v1";
export const MAX_FACTS = 5;
export const MAX_FACT_EPISODES = 20;
export const MAX_ENTITIES = 8;
export const EPISODE_PROMPT_CHARS = 2000;
export const DEFAULT_BUDGET = { maxEpisodes: 20, maxChars: 12_000 };
export const LIMITS = { subject: 120, predicate: 80, object: 300, text: 400, entityName: 100, confidence: 1 };

const PROMPT_URL = new URL("./prompts/facts.txt", import.meta.url);
let factPromptText = null;
// Lazy: a hook bundle must load without reading a file, and only the extraction path needs the prompt.
function factsPromptText() {
  if (factPromptText == null) factPromptText = readFileSync(PROMPT_URL, "utf8").trim();
  return factPromptText;
}

const MODES_DIR = new URL("./modes/", import.meta.url);
const modeCache = new Map();
export const MODE_IDS = ["code", "chill", "language-en", "language-es"];

/** Load one mode JSON. An unknown mode is a configuration error with the known ids in the message. */
export function loadMode(id = "code") {
  const key = String(id || "code");
  if (modeCache.has(key)) return modeCache.get(key);
  if (!/^[a-z0-9-]+$/.test(key)) throw new RangeError(`Invalid extraction mode "${key}". Use one of: ${MODE_IDS.join(", ")}.`);
  let doc;
  try {
    doc = JSON.parse(readFileSync(new URL(`${key}.json`, MODES_DIR), "utf8"));
  } catch {
    throw new RangeError(`Unknown extraction mode "${key}". Use one of: ${MODE_IDS.join(", ")}.`);
  }
  if (typeof doc.instruction !== "string" || typeof doc.language !== "string") throw new RangeError(`Mode "${key}" needs instruction and language.`);
  modeCache.set(key, doc);
  return doc;
}

/** The text appended to the fact prompt. It changes style and output language, never the schema. */
export function modeInstruction(id = "code") {
  const mode = loadMode(id);
  return `MODE: ${mode.id}. Output language: ${mode.language} (${mode.languageName ?? mode.language}). ${mode.instruction}`;
}

const ENTITY_TYPES = ["person", "service", "file", "repo", "library", "concept", "org"];

// An imperative sentence is a rule or an instruction, not a fact about the world. Keep this list narrow so a real
// fact such as "the service must run on Node 20" is not thrown away.
const INSTRUCTION_PATTERNS = [
  /^\s*(?:ignore|disregard|forget|override)\b/i,
  /\b(?:ignore|disregard|forget|override)\s+(?:all\s+|any\s+|the\s+)?(?:previous|prior|above|system|developer)\b/i,
  /\bsystem prompt\b/i,
  /\bdeveloper message\b/i,
  /\byou (?:must|should|are|will|need to)\b/i,
  /^\s*(?:assistant|system|user|tool)\s*:/i,
  /<\|[^|>]{1,40}\|>/,
  /\bdo not (?:tell|reveal|mention|disclose)\b/i,
];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ].*)?$/;

export function isInstruction(text) {
  return INSTRUCTION_PATTERNS.some((pattern) => pattern.test(String(text ?? "")));
}

/** JSON object between the first "{" and the last "}", without importing the refresh orchestrator. */
export function parseJsonObject(text) {
  const raw = String(text ?? "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new TypeError("The answer held no JSON object.");
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new TypeError("The answer's JSON object did not parse.");
  }
}

function textField(value, name, max) {
  if (typeof value !== "string" || !value.trim()) throw new TypeError(`${name} must be a non-empty string.`);
  const text = value.replace(/\s+/g, " ").trim();
  if (text.length > max) throw new TypeError(`${name} is longer than ${max} characters.`);
  if (isInstruction(text)) throw new TypeError(`${name} is an instruction, not a fact.`);
  return text;
}

function dateField(value, name) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !ISO_DATE.test(value.trim())) throw new TypeError(`${name} must be YYYY-MM-DD or null.`);
  const ms = Date.parse(value.trim().length === 10 ? `${value.trim()}T00:00:00Z` : value.trim());
  if (!Number.isFinite(ms)) throw new TypeError(`${name} is not a real date.`);
  return ms;
}

/**
 * Strict validator. `episodeIds` is the set the extractor was shown; a fact may only cite one of those, so an
 * orphan is impossible. Returns normalised facts, or throws a message the retry can quote.
 */
export function validateFacts(answer, { episodeIds } = {}) {
  const allowed = new Set((episodeIds ?? []).map(Number).filter(Number.isSafeInteger));
  if (!answer || typeof answer !== "object" || !Array.isArray(answer.facts)) throw new TypeError('The answer needs a "facts" array.');
  if (answer.facts.length > MAX_FACTS) throw new TypeError(`At most ${MAX_FACTS} facts.`);
  return answer.facts.map((fact, index) => {
    if (!fact || typeof fact !== "object") throw new TypeError(`facts[${index}] must be an object.`);
    const subject = textField(fact.subject, `facts[${index}].subject`, LIMITS.subject);
    const predicate = textField(fact.predicate, `facts[${index}].predicate`, LIMITS.predicate);
    const object = textField(fact.object, `facts[${index}].object`, LIMITS.object);
    const text = textField(fact.text, `facts[${index}].text`, LIMITS.text);
    if (!Number.isFinite(fact.confidence) || fact.confidence < 0 || fact.confidence > 1) throw new TypeError(`facts[${index}].confidence must be a number from 0 to 1.`);
    const cited = Array.isArray(fact.episode_ids) ? fact.episode_ids.map(Number) : [];
    if (!cited.length) throw new TypeError(`facts[${index}].episode_ids needs at least one episode id.`);
    if (cited.length > MAX_FACT_EPISODES) throw new TypeError(`facts[${index}].episode_ids has more than ${MAX_FACT_EPISODES} ids.`);
    for (const id of cited) {
      if (!Number.isSafeInteger(id)) throw new TypeError(`facts[${index}].episode_ids must be whole numbers.`);
      if (allowed.size && !allowed.has(id)) throw new TypeError(`facts[${index}] cites episode #${id}, which was not in this window.`);
    }
    const validFromEpoch = dateField(fact.valid_from ?? fact.validFrom, `facts[${index}].valid_from`);
    const validToEpoch = dateField(fact.valid_to ?? fact.validTo, `facts[${index}].valid_to`);
    if (validFromEpoch != null && validToEpoch != null && validToEpoch <= validFromEpoch) throw new TypeError(`facts[${index}].valid_to must be after valid_from.`);
    const entities = Array.isArray(fact.entities)
      ? fact.entities.slice(0, MAX_ENTITIES).map((entity, j) => {
        if (!entity || typeof entity.name !== "string" || !entity.name.trim()) throw new TypeError(`facts[${index}].entities[${j}].name must be a string.`);
        if (!ENTITY_TYPES.includes(entity.type)) throw new TypeError(`facts[${index}].entities[${j}].type must be one of ${ENTITY_TYPES.join(", ")}.`);
        return { name: entity.name.trim().slice(0, LIMITS.entityName), type: entity.type };
      })
      : [];
    const supersedes = Number(fact.supersedes);
    return {
      subject, predicate, object, text, confidence: fact.confidence,
      episodeIds: [...new Set(cited)],
      validFromEpoch, validToEpoch,
      dated: validFromEpoch != null,
      entities,
      supersedesId: Number.isSafeInteger(supersedes) && supersedes > 0 ? supersedes : null,
    };
  });
}

// ---- rule-based fallback ---------------------------------------------------------------------------------

const SENTENCE = /[^.!?\n]{8,400}(?:[.!?]|$)/g;
const PRONOUN_SUBJECT = /^(?:it|they|this|that|these|those|he|she|we|i)$/i;
const FACT_PATTERN = /^(?:the\s+)?([\p{L}\p{N}][\p{L}\p{N} _./-]{1,80}?)\s+(uses?|is|are|was|were|runs?|requires?|supports?|stores?|returns?|keeps?|adds?|depends on|consists of|must|should)\s+([\p{L}\p{N}][^.!?\n]{1,180})$/iu;

/**
 * A deterministic extractor for the no-provider path. It only accepts a plain "subject verb object" sentence, so
 * it is quiet rather than clever. That is deliberate: a wrong fact is worse than no fact.
 */
export function extractFactsByRules(window = []) {
  const facts = [];
  const seen = new Set();
  for (const episode of window) {
    for (const sentence of String(episode.text ?? "").match(SENTENCE) ?? []) {
      if (facts.length >= MAX_FACTS) return { facts, mode: "rules", raw: null, rejected: false };
      const clean = sentence.replace(/\s+/g, " ").trim().replace(/[.!?]$/, "");
      if (clean.length < 10 || isInstruction(clean)) continue;
      if (/^(?:input|output|error|stack|diff|commit)\s*:/i.test(clean)) continue;
      const match = FACT_PATTERN.exec(clean);
      if (!match) continue;
      const subject = match[1].trim().replace(/\s+/g, " ");
      if (PRONOUN_SUBJECT.test(subject) || subject.length < 2) continue;
      const predicate = match[2].toLowerCase();
      const object = match[3].trim().replace(/\s+/g, " ");
      if (object.length < 2) continue;
      const text = `${subject} ${predicate} ${object}`.slice(0, LIMITS.text);
      if (seen.has(text)) continue;
      seen.add(text);
      facts.push({
        subject: subject.slice(0, LIMITS.subject), predicate, object: object.slice(0, LIMITS.object), text,
        confidence: 0.55, episodeIds: [Number(episode.episodeId)], validFromEpoch: null, validToEpoch: null,
        dated: false, entities: [], supersedesId: null,
      });
    }
  }
  return { facts, mode: "rules", raw: null, rejected: false };
}

// ---- batching ---------------------------------------------------------------------------------------------

/**
 * Split episodes into windows bounded by episode count and characters. One oversized episode is truncated to the
 * character budget, so a window never exceeds it. The count is clamped to the 20-40 range D4 asks for.
 */
export function chunkEpisodes(episodes = [], { maxEpisodes = DEFAULT_BUDGET.maxEpisodes, maxChars = DEFAULT_BUDGET.maxChars } = {}) {
  const countCap = Math.max(1, Math.min(40, Number(maxEpisodes) || DEFAULT_BUDGET.maxEpisodes));
  const charCap = Math.max(32, Number(maxChars) || DEFAULT_BUDGET.maxChars);
  const chunks = [];
  let current = [];
  let chars = 0;
  for (const episode of episodes) {
    const text = String(episode.text ?? "").slice(0, Math.min(EPISODE_PROMPT_CHARS, charCap));
    if (current.length && (current.length >= countCap || chars + text.length > charCap)) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
    current.push({ ...episode, text });
    chars += text.length;
    if (current.length >= countCap) {
      chunks.push(current);
      current = [];
      chars = 0;
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

// ---- provider path ---------------------------------------------------------------------------------------

const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : "unknown");

/** Build the prompt from already-redacted text. Nothing else may be added to what leaves the machine. */
export function factsPrompt({ window, project, modeInstruction = "", existing = [] }) {
  const log = window
    .map((episode) => `[#${episode.episodeId} ${iso(episode.createdAtEpoch)} ${episode.tool ?? "unknown"} ${episode.kind ?? "message"}] ${redact(String(episode.text ?? "")).slice(0, EPISODE_PROMPT_CHARS)}`)
    .join("\n---\n");
  const ids = window.map((episode) => Number(episode.episodeId)).filter(Number.isSafeInteger);
  const known = existing.length
    ? `\n\nEXISTING ACTIVE FACTS (cite one in "supersedes" only if the new fact contradicts it):\n${existing.map((fact) => `#${fact.id} ${fact.text}`).join("\n")}`
    : "";
  return `${factsPromptText()}${modeInstruction ? `\n\n${modeInstruction}` : ""}\n\nPROJECT: ${project}\nEPISODE_IDS: [${ids.join(", ")}]${known}\n\nLOG:\n${log}`;
}

/**
 * Ask, validate, retry once with the refusal quoted. A second refusal is returned, not stored, so the caller can
 * record the bad output. Provider errors are re-thrown: the queue must retry those, not throw the work away.
 */
export async function extractFactsWithProvider({ window, project, ask, modeInstruction = "", existing = [] }) {
  const allowed = window.map((episode) => Number(episode.episodeId));
  const prompt = factsPrompt({ window, project, modeInstruction, existing });
  let refusal = null;
  let answer = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    answer = await ask(refusal ? `${prompt}\n\nYour previous answer was refused: ${refusal}\nFix it and answer again.` : prompt, { stage: "extract" });
    try {
      return { facts: validateFacts(parseJsonObject(answer), { episodeIds: allowed }), mode: "provider", raw: answer, prompt, rejected: false };
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
  }
  return { facts: [], mode: "provider", raw: answer, prompt, rejected: true, error: refusal };
}

/** One window in one call: the provider when there is one, the rule extractor otherwise. */
export async function extractWindow({ window, project = "default", ask = null, modeInstruction = "", existing = [] }) {
  if (!ask) return extractFactsByRules(window);
  return extractFactsWithProvider({ window, project, ask, modeInstruction, existing });
}

/**
 * Extract one window and record its cost. A provider error still writes an error row and is re-thrown, so the queue
 * can retry; the work is not lost and the cost is not hidden.
 */
export async function extractWithUsage(store, { window, project = "default", ask = null, modeInstruction = "", existing = [], model = null, batchId = null, prices = null, now = Date.now() } = {}) {
  let result;
  try {
    result = await extractWindow({ window, project, ask, modeInstruction, existing });
  } catch (error) {
    recordCall(store, { atEpoch: now, batchId, model: model ?? "none", mode: ask ? "provider" : "rules", episodes: window.length, status: "error", error: error instanceof Error ? error.message : String(error), prices });
    throw error;
  }
  const inputTokens = result.mode === "provider" ? estimateTokens(result.prompt) : 0;
  const outputTokens = result.raw ? estimateTokens(result.raw) : 0;
  recordCall(store, {
    atEpoch: now, batchId, model: result.mode === "provider" ? model ?? "unknown" : "rules", mode: result.mode,
    inputTokens, outputTokens, episodes: window.length, facts: result.facts.length,
    status: result.rejected ? "rejected" : "ok", error: result.error ?? null, rawOutput: result.rejected ? result.raw : null,
    prices: prices ?? pricesFrom({}),
  });
  return result;
}

// ---- storage ---------------------------------------------------------------------------------------------

/**
 * Store validated facts with their provenance and keys. Fields are redacted again here: a provider could echo a
 * secret the gate missed, and nothing unredacted belongs in the database. Returns ids and how many were new.
 */
export function storeFacts(store, { facts, project, mode = "rules", model = null, promptVersion = FACTS_PROMPT_VERSION, observationId = null, now = Date.now() }) {
  const added = [];
  const deduped = [];
  const superseded = [];
  const reviews = [];
  for (const fact of facts) {
    const subject = redact(fact.subject).slice(0, LIMITS.subject);
    const predicate = redact(fact.predicate).slice(0, LIMITS.predicate);
    const object = redact(fact.object).slice(0, LIMITS.object);
    const text = redact(fact.text).slice(0, LIMITS.text);
    if (isInstruction(text)) continue;
    const episodeIds = (fact.episodeIds ?? []).map(Number).filter(Number.isSafeInteger);
    if (!episodeIds.length) continue;
    const episode = store.getEpisode(episodeIds[0]);
    if (!episode) continue;
    const result = store.addFact({
      project, subject, predicate, object, text,
      episodeId: episode.id, episodeIds,
      observationId,
      validFromEpoch: fact.validFromEpoch ?? episode.created_at_epoch,
      validToEpoch: fact.validToEpoch ?? null,
      recordedAtEpoch: now,
      confidence: Math.max(0, Math.min(1, (fact.confidence ?? 0.7) - (fact.dated ? 0 : 0.1))),
      extractorMode: mode, promptVersion, model,
    });
    store.addKey({ ownerType: "fact", ownerId: result.id, keyType: "fact", text });
    for (const entity of fact.entities ?? []) store.addKey({ ownerType: "fact", ownerId: result.id, keyType: "entity", text: entity.name });
    attachFactEntities(store, { factId: result.id, project, subject, object, text, entities: fact.entities ?? [], now });
    if (result.created) {
      added.push(result.id);
      const resolved = resolveContradictions(store, { factId: result.id, explicitSupersedes: fact.supersedesId, now });
      superseded.push(...resolved.superseded);
      reviews.push(...resolved.reviews);
    } else {
      // The same fact seen again is not a new row, but the new session is a source of the current one.
      deduped.push(result.id);
      for (const episodeId of episodeIds) store.link({ fromType: "fact", fromId: result.id, toType: "episode", toId: episodeId, relation: "mentions" });
    }
  }
  return { added: added.length, ids: added, deduped, superseded, reviews };
}

// ---- contradiction handling ------------------------------------------------------------------------------

/**
 * A newer fact on the same (project, subject, predicate) with a different object replaces the older one. The
 * older row is closed, never deleted, and both are linked. A same-time disagreement keeps both rows, lowers both
 * confidences and goes to the review queue. An incoming older fact is stored as history, so the newest stays current.
 */
export function resolveContradictions(store, { factId, explicitSupersedes = null, now = Date.now() } = {}) {
  const fact = store.getFact(factId);
  if (!fact || fact.status !== "active") return { superseded: [], reviews: [], fact };
  const newFrom = fact.valid_from_epoch ?? fact.recorded_at_epoch;
  const superseded = [];
  const reviews = [];

  const closeOlder = (older, newer) => {
    const olderFrom = older.valid_from_epoch ?? older.recorded_at_epoch;
    const boundary = Math.max(newFrom, olderFrom + 1);
    store.closeFact(older.id, { validToEpoch: boundary });
    store.setFactSupersedes(newer.id, older.id);
    store.link({ fromType: "fact", fromId: newer.id, toType: "fact", toId: older.id, relation: "supersedes" });
    store.audit("extract", "fact.supersede", { older: older.id, newer: newer.id, boundary });
    superseded.push(older.id);
  };

  // An incoming fact that started before the current one is history, not the new current fact.
  const closeIncoming = (older, newer) => {
    const olderFrom = older.valid_from_epoch ?? older.recorded_at_epoch;
    store.closeFact(newer.id, { validToEpoch: olderFrom });
    store.setFactSupersedes(newer.id, older.id);
    store.link({ fromType: "fact", fromId: newer.id, toType: "fact", toId: older.id, relation: "supersedes" });
    store.audit("extract", "fact.supersede", { older: older.id, newer: newer.id, boundary: olderFrom });
    superseded.push(newer.id);
  };

  if (Number.isSafeInteger(explicitSupersedes) && explicitSupersedes !== fact.id) {
    const named = store.getFact(explicitSupersedes);
    if (named && named.project === fact.project && named.status === "active") closeOlder(named, fact);
  }

  const active = store.db
    .prepare("SELECT * FROM facts WHERE project = ? AND subject = ? AND predicate = ? AND status = 'active' AND id != ? ORDER BY coalesce(valid_from_epoch, recorded_at_epoch), id")
    .all(fact.project, fact.subject, fact.predicate, fact.id);
  for (const older of active) {
    if (older.object === fact.object) continue;
    const olderFrom = older.valid_from_epoch ?? older.recorded_at_epoch;
    if (newFrom > olderFrom) {
      closeOlder(older, fact);
    } else if (newFrom === olderFrom) {
      store.setFactConfidence(older.id, Math.max(0, older.confidence - 0.1));
      store.setFactConfidence(fact.id, Math.max(0, fact.confidence - 0.1));
      const already = store.db.prepare("SELECT 1 FROM review_queue WHERE item_type = 'fact' AND item_id = ? AND reason = 'contradiction' AND status = 'pending'").get(fact.id);
      if (!already) store.addReview({ itemType: "fact", itemId: fact.id, reason: "contradiction", proposedBy: "extractor", now });
      reviews.push(fact.id);
    } else {
      closeIncoming(older, fact);
      break;
    }
  }
  return { superseded, reviews, fact: store.getFact(fact.id) };
}



