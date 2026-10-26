// Near-duplicate detection for observations. TF-IDF cosine over title + narrative, with common terms dropped so
// boilerplate cannot make two different memories look alike. 0.92 auto-merges, 0.85 is a review candidate. The scan
// is bounded: 50,000 rows by default, and only pairs that share a rare term are scored.
import { tokens } from "./retrieval.mjs";
import { sha256 } from "../lib/hash.mjs";

const STOP = new Set(
  "a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves".split(" "),
);

export const AUTO_MERGE = 0.92;
export const REVIEW_CANDIDATE = 0.85;
export const MAX_SCAN = 50_000;

/** Lower-case content tokens, duplicates kept so term frequency is real. */
export const docTokens = (text) => tokens(text).filter((token) => token.length >= 2 && !STOP.has(token));

/**
 * Build weighted sparse vectors for a list of {id, text}. Terms present in more than `commonShare` of documents
 * are dropped: they carry no discriminating signal (the "IDF veto").
 */
export function buildVectors(docs, { commonShare = 0.8 } = {}) {
  const total = docs.length || 1;
  const df = new Map();
  for (const doc of docs) for (const term of new Set(docTokens(doc.text))) df.set(term, (df.get(term) ?? 0) + 1);
  const idf = (term) => Math.log((total + 1) / ((df.get(term) ?? 0) + 1)) + 1;
  const common = new Set([...df.entries()].filter(([, count]) => count / total > commonShare).map(([term]) => term));
  const vectors = docs.map((doc) => {
    const tf = new Map();
    for (const term of docTokens(doc.text)) tf.set(term, (tf.get(term) ?? 0) + 1);
    const weighted = new Map();
    let norm = 0;
    for (const [term, count] of tf) {
      if (common.has(term)) continue;
      const weight = (1 + Math.log(count)) * idf(term);
      weighted.set(term, weight);
      norm += weight * weight;
    }
    return { id: doc.id, text: doc.text, weighted, norm: Math.sqrt(norm) };
  });
  return { vectors, common };
}

/** Cosine similarity of two weighted vectors. 0 when either has no rare term or they share none. */
export function cosine(a, b) {
  if (!a?.norm || !b?.norm) return 0;
  const [small, large] = a.weighted.size <= b.weighted.size ? [a.weighted, b.weighted] : [b.weighted, a.weighted];
  let dot = 0;
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other) dot += weight * other;
  }
  return dot / (a.norm * b.norm);
}

/** Cosine for two plain strings, useful for a labelled evaluation set. */
export function similarity(textA, textB) {
  const { vectors } = buildVectors([{ id: "a", text: textA }, { id: "b", text: textB }], { commonShare: 1 });
  return cosine(vectors[0], vectors[1]);
}

/**
 * Compare observations inside one project. Returns candidate pairs and how many rows were scanned. The inverted
 * index keeps this to pairs that share at least one rare term; a project with 50k disjoint memories costs little.
 */
export function nearDuplicates(store, { project, maxRows = MAX_SCAN, candidateThreshold = REVIEW_CANDIDATE, autoThreshold = AUTO_MERGE } = {}) {
  const rows = store.listObservations({ project, status: "active", limit: Math.min(Number(maxRows) || MAX_SCAN, MAX_SCAN) });
  const docs = rows.map((row) => ({ id: row.id, text: `${row.title}\n${row.narrative ?? ""}` }));
  const { vectors } = buildVectors(docs);
  const index = new Map();
  for (const vector of vectors) for (const term of vector.weighted.keys()) {
    if (!index.has(term)) index.set(term, []);
    index.get(term).push(vector);
  }
  const seen = new Set();
  const pairs = [];
  for (const bucket of index.values()) {
    if (bucket.length < 2) continue;
    for (let i = 0; i < bucket.length; i++) for (let j = i + 1; j < bucket.length; j++) {
      const a = bucket[i];
      const b = bucket[j];
      const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const score = cosine(a, b);
      if (score < candidateThreshold) continue;
      pairs.push({ a: Math.min(a.id, b.id), b: Math.max(a.id, b.id), score, auto: score >= autoThreshold });
    }
  }
  pairs.sort((x, y) => y.score - x.score || x.a - y.a || x.b - y.b);
  return { scanned: docs.length, pairs, auto: pairs.filter((pair) => pair.auto).length, candidateThreshold, autoThreshold };
}

/** Exact duplicates in the new model collapse on the observation content hash. */
export const exactHash = ({ project, type, title, narrative }) => sha256(JSON.stringify([project, type, title, narrative]));

/** Merge through the store so the whole change is one transaction with an audit row. */
export const mergeDuplicates = (store, firstId, secondId, opts = {}) => store.mergeObservations(firstId, secondId, opts);

/**
 * Merge every auto pair in one scan. The scan reads active rows once; a row that a merge already retired is skipped,
 * so one pass cannot merge the same memory twice. Returns counts, never throws on a missing row.
 */
export function mergeNearDuplicates(store, { project, maxRows = MAX_SCAN, autoThreshold = AUTO_MERGE } = {}) {
  const scan = nearDuplicates(store, { project, maxRows, autoThreshold });
  let merged = 0;
  for (const pair of scan.pairs) {
    if (!pair.auto) continue;
    const a = store.getObservation(pair.a);
    const b = store.getObservation(pair.b);
    if (!a || !b || a.status !== "active" || b.status !== "active") continue;
    store.mergeObservations(pair.a, pair.b, { actor: "extract" });
    merged++;
  }
  return { merged, candidates: scan.pairs.length, scanned: scan.scanned };
}
