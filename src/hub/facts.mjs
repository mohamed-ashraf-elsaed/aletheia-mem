// Fact extraction: turn a window of episodes into 0-5 atomic facts. The output is untrusted, so every field is
// validated and capped before it reaches the store. With no provider, a deterministic rule extractor runs instead;
// each stored fact records which mode and prompt version produced it.
import { readFileSync } from "node:fs";
import { redact } from "./redact.mjs";

export const FACTS_PROMPT_VERSION = "facts-v1";
export const MAX_FACTS = 5;
export const MAX_FACT_EPISODES = 20;
export const MAX_ENTITIES = 8;
export const LIMITS = { subject: 120, predicate: 80, object: 300, text: 400, entityName: 100, confidence: 1 };

const FACT_PROMPT = readFileSync(new URL("./prompts/facts.txt", import.meta.url), "utf8").trim();

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

// ---- provider path ---------------------------------------------------------------------------------------

const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : "unknown");

/** Build the prompt from already-redacted text. Nothing else may be added to what leaves the machine. */
export function factsPrompt({ window, project, modeInstruction = "", existing = [] }) {
  const log = window
    .map((episode) => `[#${episode.episodeId} ${iso(episode.createdAtEpoch)} ${episode.tool ?? "unknown"} ${episode.kind ?? "message"}] ${redact(String(episode.text ?? "")).slice(0, 2000)}`)
    .join("\n---\n");
  const ids = window.map((episode) => Number(episode.episodeId)).filter(Number.isSafeInteger);
  const known = existing.length
    ? `\n\nEXISTING ACTIVE FACTS (cite one in "supersedes" only if the new fact contradicts it):\n${existing.map((fact) => `#${fact.id} ${fact.text}`).join("\n")}`
    : "";
  return `${FACT_PROMPT}${modeInstruction ? `\n\n${modeInstruction}` : ""}\n\nPROJECT: ${project}\nEPISODE_IDS: [${ids.join(", ")}]${known}\n\nLOG:\n${log}`;
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
      return { facts: validateFacts(parseJsonObject(answer), { episodeIds: allowed }), mode: "provider", raw: answer, rejected: false };
    } catch (error) {
      refusal = error instanceof Error ? error.message : String(error);
    }
  }
  return { facts: [], mode: "provider", raw: answer, rejected: true, error: refusal };
}

/** One window in one call: the provider when there is one, the rule extractor otherwise. */
export async function extractWindow({ window, project = "default", ask = null, modeInstruction = "", existing = [] }) {
  if (!ask) return extractFactsByRules(window);
  return extractFactsWithProvider({ window, project, ask, modeInstruction, existing });
}

// ---- storage ---------------------------------------------------------------------------------------------

/**
 * Store validated facts with their provenance and keys. Fields are redacted again here: a provider could echo a
 * secret the gate missed, and nothing unredacted belongs in the database. Returns ids and how many were new.
 */
export function storeFacts(store, { facts, project, mode = "rules", model = null, promptVersion = FACTS_PROMPT_VERSION, observationId = null, now = Date.now() }) {
  const added = [];
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
    if (result.created) added.push(result.id);
  }
  return { added: added.length, ids: added };
}
