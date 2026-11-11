// Product search: facts, episodes, keys and optional dense channels, fused with reciprocal rank fusion. Kept async
// because a dense query needs an embedding call; when no runtime is present the same function answers from keyword
// channels alone and says so in `channels`.
import { RERANK_BUDGET_MS, RERANK_TOP_N, rerankCandidates, sharedReranker } from "./rerank.mjs";
import { expandQuery, timeFilter } from "./query.mjs";
import { rrf, topKByVector, unpackVector } from "./retrieval.mjs";

export const FUSION = { factWeight: 1, episodeWeight: 0.9 };

// ---- CJK channel ------------------------------------------------------------------------------------
// Chinese, Japanese and Korean put no space between words, and the unicode61 tokenizer keeps a whole run of these
// characters as one token, so a word inside a sentence never matched. The CJK channel indexes each run as
// overlapping two-character grams plus the run's last character: a two-character word is one gram, a longer word is a
// phrase of consecutive grams, and a single character is a prefix of a gram. HubStore keeps the grams in their own
// FTS5 tables (memories_cjk, facts_cjk), so English ranking and the main indexes do not change.

/** Unicode ranges treated as CJK: Han, Hiragana, Katakana and Hangul, with their extension blocks. */
export const CJK_RANGES = [
  [0x1100, 0x11ff], // Hangul Jamo
  [0x3005, 0x3007], // 々 〆 〇
  [0x3041, 0x309f], // Hiragana
  [0x30a1, 0x30fa], // Katakana
  [0x30fc, 0x30ff], // ー and the Katakana iteration marks
  [0x3130, 0x318f], // Hangul compatibility Jamo
  [0x31f0, 0x31ff], // Katakana phonetic extensions
  [0x3400, 0x4dbf], // CJK extension A
  [0x4e00, 0x9fff], // CJK unified ideographs
  [0xa960, 0xa97f], // Hangul Jamo extended A
  [0xac00, 0xd7ff], // Hangul syllables and Jamo extended B
  [0xf900, 0xfaff], // CJK compatibility ideographs
  [0xff66, 0xff9f], // halfwidth Katakana
  [0x20000, 0x3134f], // CJK extensions B to G
];

const CJK_CLASS = CJK_RANGES.map(([from, to]) => `\\u{${from.toString(16)}}-\\u{${to.toString(16)}}`).join("");
const CJK_RUN = new RegExp(`[${CJK_CLASS}]+`, "gu");
const CJK_ANY = new RegExp(`[${CJK_CLASS}]`, "u");

// SQLite's GLOB tests every range of a character class at every position, so its cost grows with the number of
// ranges (measured over 900-character English rows: 14 ranges 100 µs, 5 ranges 19 µs). The store's SQL filter uses
// these five wider ranges, a superset of CJK_RANGES; cjkGrams() then keeps only the CJK characters.
const CJK_GLOB_RANGES = [[0x1100, 0x11ff], [0x2e80, 0xd7ff], [0xf900, 0xfaff], [0xff66, 0xff9f], [0x20000, 0x3134f]];

/** SQLite GLOB pattern, true for every text that holds a CJK character (and for some other East Asian text). */
export const CJK_GLOB = `*[${CJK_GLOB_RANGES.map(([from, to]) => `${String.fromCodePoint(from)}-${String.fromCodePoint(to)}`).join("")}]*`;

export const hasCjk = (text) => CJK_ANY.test(String(text ?? ""));

/** Runs of CJK characters, after NFKC so halfwidth Katakana and compatibility ideographs match their usual forms. */
export const cjkRuns = (text) => String(text ?? "").normalize("NFKC").match(CJK_RUN) ?? [];

const bigrams = (run) => {
  const chars = [...run];
  if (chars.length === 1) return chars;
  const out = [];
  for (let i = 0; i + 1 < chars.length; i++) out.push(chars[i] + chars[i + 1]);
  return out;
};

/** The space-separated grams stored for one text: each run's bigrams, then its last character. "" when no CJK. */
export function cjkGrams(text) {
  const out = [];
  for (const run of cjkRuns(text)) {
    const chars = [...run];
    if (chars.length > 1) out.push(...bigrams(run));
    out.push(chars[chars.length - 1]);
  }
  return out.join(" ");
}

/**
 * FTS5 expressions for the CJK channel, or null when the text has no CJK. `exact` matches rows that contain any
 * query run as written. `loose` matches rows that share any bigram, so a CJK question with no spaces still finds
 * rows that hold its words; it is null when it would match nothing `exact` does not. Capped at `max` terms.
 */
export function cjkMatch(text, { max = 24 } = {}) {
  const runs = [...new Set(cjkRuns(text))].slice(0, max);
  if (!runs.length) return null;
  const term = (gram) => ([...gram].length === 1 ? `"${gram}"*` : `"${gram}"`);
  const exact = runs.map((run) => term(bigrams(run).join(" "))).join(" OR ");
  const grams = [...new Set(runs.flatMap(bigrams))].slice(0, max);
  const loose = runs.some((run) => [...run].length > 2) ? grams.map(term).join(" OR ") : null;
  return { exact, loose };
}

/** [{id, vec}] for facts that already have a vector. */
export function factVectorRows(store) {
  return store.db.prepare("SELECT fact_id AS id, vec FROM fact_vectors").all().map((row) => ({ id: row.id, vec: unpackVector(row.vec) }));
}

/**
 * Embed facts that have no `fact_vectors` row yet. `embedder` = {model, embedDocs}, or a function that returns one (or
 * null): the function runs only when there is something to embed, so a lazy embedder is not loaded for nothing.
 * Returns how many were written.
 */
export async function embedMissingFacts(store, embedder, { limit = 5000, batch = 64 } = {}) {
  if (!embedder) return 0;
  const todo = store.db
    .prepare("SELECT f.id, f.text FROM facts f LEFT JOIN fact_vectors v ON v.fact_id = f.id WHERE v.fact_id IS NULL ORDER BY f.id LIMIT ?")
    .all(Math.min(Number(limit) || 5000, 50_000));
  if (!todo.length) return 0;
  if (typeof embedder === "function") {
    embedder = await embedder();
    if (!embedder) return 0;
  }
  for (let i = 0; i < todo.length; i += batch) {
    const part = todo.slice(i, i + batch);
    const vecs = await embedder.embedDocs(part.map((fact) => fact.text));
    store.db.exec("BEGIN");
    try {
      part.forEach((fact, j) => store.setFactVector(fact.id, embedder.model, vecs[j]));
      store.db.exec("COMMIT");
    } catch (error) {
      try { store.db.exec("ROLLBACK"); } catch { /* ignore */ }
      throw error;
    }
  }
  return todo.length;
}

/**
 * Search facts and episodes together. `channels` records what actually ran: lexical always when the query has a
 * term, vector only when a query vector was produced and at least one row has a vector. `explain` is part of every
 * result so a caller can state why a hit appeared.
 */
export async function searchMemory({ store, query, project, limit = 20, scope = "current", includeHistory = false, asOf = null, embedder = null, rerank = false, reranker = null, rerankBudgetMs = RERANK_BUDGET_MS, since = null, until = null } = {}) {
  // A time expression in the query ("last week", "yesterday") narrows the range unless the caller gave one.
  const parsed = since == null && until == null ? timeFilter(expandQuery(query)) : null;
  if (parsed) ({ since, until } = parsed);
  let queryVec = null;
  if (embedder) {
    try {
      queryVec = await embedder.embedQuery(query);
    } catch {
      queryVec = null;
    }
  }
  const factVectors = queryVec ? factVectorRows(store).length : 0;
  const episodeVectors = queryVec ? store.vectorRows({ project, scope }).length : 0;
  const pool = rerank ? Math.max(Number(limit) || 20, RERANK_TOP_N) : limit; // rerank needs a pool to reorder, not only the page asked for
  const facts = store.searchFacts({ query, project, limit: pool, includeHistory, asOf, queryVec, scope, since, until });
  const episodes = store.ranked({ query, project, limit: pool, queryVec, includeHistory, scope, since, until });
  const channels = {
    facts: { lexical: true, keys: true, vector: factVectors > 0 },
    episodes: { lexical: true, vector: episodeVectors > 0 },
    factVectorRows: factVectors,
    episodeVectorRows: episodeVectors,
    fused: "rrf",
  };
  if (hasCjk(query)) {
    channels.facts.cjk = true;
    channels.episodes.cjk = true;
  }
  if (includeHistory) channels.history = true;
  if (asOf != null) channels.asOf = asOf;
  if (scope === "all") channels.scope = "all";
  if (parsed) channels.time = { since: parsed.since, until: parsed.until };

  const fused = rrf([
    facts.map((fact) => `fact:${fact.id}`),
    episodes.map((memory) => `memory:${memory.id}`),
  ], { weights: [FUSION.factWeight, FUSION.episodeWeight] });
  const factById = new Map(facts.map((fact) => [`fact:${fact.id}`, fact]));
  const episodeById = new Map(episodes.map((memory) => [`memory:${memory.id}`, { ...memory, kind: "memory", at: new Date(memory.created_at_epoch).toISOString(), source: { type: "memory", id: memory.id } }]));
  let ordered = fused.map((entry) => factById.get(entry.id) ?? episodeById.get(entry.id)).filter(Boolean);
  if (rerank) {
    const outcome = await rerankWithBudget({ query, ordered, reranker, budgetMs: rerankBudgetMs });
    ordered = outcome.ordered;
    channels.rerank = outcome.channel;
  }
  const results = ordered.slice(0, Math.min(Math.max(Number(limit) || 20, 1), 200));
  return { results, channels };
}

const candidateText = (row) => (row.kind === "fact" ? String(row.text ?? "") : [row.title, row.narrative ?? row.text].filter(Boolean).join(". "));

/**
 * Optional cross-encoder rerank of the fused list. Never throws and never waits past the budget: a missing package, a
 * scorer error, a bad score list or a timeout all keep the fused order and say why in the channel note. The model load
 * counts against the budget, and a load that outlives it keeps running so a later call in the same process can use it.
 */
async function rerankWithBudget({ query, ordered, reranker, budgetMs }) {
  const started = performance.now();
  const fallback = (reason, model = null) => ({ ordered, channel: { status: "fallback", reason, ...(model ? { model } : {}), ms: Math.round(performance.now() - started) } });
  if (ordered.length < 2) return { ordered, channel: { status: "on", model: reranker?.model ?? null, candidates: ordered.length, ms: 0 } };
  let timer;
  const timeout = new Promise((resolve) => { timer = setTimeout(() => resolve("budget"), Math.max(Number(budgetMs) || RERANK_BUDGET_MS, 1)); });
  let model = reranker?.model ?? null;
  try {
    const work = (async () => {
      const ce = reranker ?? (await sharedReranker());
      model = ce.model ?? model;
      const items = ordered.map((row) => ({ row, text: candidateText(row) }));
      return (await rerankCandidates(ce, query, items, { topN: RERANK_TOP_N })).map((item) => item.row);
    })();
    work.catch(() => {}); // a late failure after the timeout is not an unhandled rejection
    const winner = await Promise.race([work, timeout]);
    if (winner === "budget") return fallback(`over the ${budgetMs} ms budget, kept the fused order`, model);
    return { ordered: winner, channel: { status: "on", model, candidates: Math.min(ordered.length, RERANK_TOP_N), ms: Math.round(performance.now() - started) } };
  } catch (error) {
    const missing = /optional package/.test(String(error?.message));
    return fallback(missing ? "needs the optional package @huggingface/transformers, kept the fused order" : `failed (${String(error?.message ?? error).slice(0, 120)}), kept the fused order`, model);
  } finally {
    clearTimeout(timer);
  }
}

export const formatChannels = (channels) => {
  const on = (value) => (value ? "on" : "off");
  const cjk = (value) => (value ? " cjk=on" : ""); // shown only when the query had CJK text, so English output is unchanged
  const parts = [
    `facts lexical=${on(channels.facts?.lexical)} keys=${on(channels.facts?.keys)} vectors=${on(channels.facts?.vector)}${cjk(channels.facts?.cjk)}`,
    `episodes lexical=${on(channels.episodes?.lexical)} vectors=${on(channels.episodes?.vector)}${cjk(channels.episodes?.cjk)}`,
    `fusion=${channels.fused}`,
  ];
  if (channels.rerank) {
    const r = channels.rerank;
    parts.push(r.status === "on" ? `rerank=on (${r.model ?? "cross-encoder"}, top ${r.candidates}, ${r.ms} ms)` : `rerank=fallback (${r.reason})`);
  }
  if (channels.time) parts.push(`time=${new Date(channels.time.since).toISOString().slice(0, 10)}..${channels.time.until == null ? "now" : new Date(channels.time.until).toISOString().slice(0, 10)}`);
  if (channels.history) parts.push("history=on");
  if (channels.scope) parts.push(`scope=${channels.scope}`);
  return `channels: ${parts.join("; ")}`;
};
