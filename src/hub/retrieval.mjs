// Retrieval building blocks: query shaping for BM25, vector packing and cosine, and rank fusion.
// Kept free of I/O so each piece is unit-testable and the benchmark exercises the same code the product runs.

const STOP = new Set(
  "a about above after again all also am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the their theirs them themselves then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself yourselves".split(" "),
);

/** Lower-case word tokens (letters and digits, any script). */
export const tokens = (text) => String(text ?? "").toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? [];

/** Content words only: stopwords and 1-character tokens removed, duplicates collapsed, order kept. */
export function contentTerms(text) {
  const seen = new Set();
  const out = [];
  for (const t of tokens(text)) {
    if (t.length < 2 || STOP.has(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
  }
  return out;
}

/**
 * FTS5 expression for a natural-language question: ANY content word may match (BM25 ranks by how many and how rare).
 * The older all-words-must-match form returns nothing for most real questions. Capped at 24 terms. null when no terms.
 */
export function ftsAnyQuery(text, { max = 24 } = {}) {
  const terms = contentTerms(text).slice(0, max);
  return terms.length ? terms.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ") : null;
}

/** FTS5 OR-expression from an explicit term list (already chosen). null when empty. */
export const orExpr = (terms) => (terms.length ? terms.map((t) => `"${t.replace(/"/g, "")}"`).join(" OR ") : null);

// ---- vectors ----------------------------------------------------------------------------------------

export const packVector = (v) => new Uint8Array(Float32Array.from(v).buffer);
export const unpackVector = (blob) => new Float32Array(blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength));

export function normalize(v) {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  const out = new Float32Array(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
  return out;
}

/** Dot product of two equal-length vectors (cosine when both are normalised). */
export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/** Top-k by cosine over [{id, vec}] (brute force). Returns [{id, score}] best first. */
export function topKByVector(query, rows, k) {
  const q = normalize(query);
  const best = [];
  for (const r of rows) {
    const score = dot(q, r.vec);
    if (best.length < k || score > best[best.length - 1].score) {
      best.push({ id: r.id, score });
      best.sort((x, y) => y.score - x.score);
      if (best.length > k) best.pop();
    }
  }
  return best;
}

// ---- fusion -----------------------------------------------------------------------------------------

/**
 * Reciprocal rank fusion. Each list is ids best-first; weights default to 1. Score = sum w / (k + rank).
 * Robust to incomparable score scales (BM25 vs cosine), which is why it is the default blend.
 */
export function rrf(lists, { k = 60, weights = [] } = {}) {
  const score = new Map();
  lists.forEach((ids, li) => {
    const w = weights[li] ?? 1;
    ids.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + w / (k + rank + 1)));
  });
  return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([id, s]) => ({ id, score: s }));
}
