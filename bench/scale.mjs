#!/usr/bin/env bun
// Scale check: how the store behaves with tens of thousands of memories.
//   bun bench/scale.mjs [rows=50000] [vectors=20000] [--index tuned] [--queries 200] [--out /tmp/scale.json]
// Synthetic text (Zipf-like word frequencies) and random unit vectors. Measures insert rate, BM25 search latency
// (p50/p95), a synthetic Recall@5 (does a query taken from a known narrative return that memory), and database size.
// Numbers depend on the machine; run it on yours.
import { writeFileSync } from "node:fs";
import { statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HubStore } from "../src/hub/store.mjs";
import { topKByVector } from "../src/hub/retrieval.mjs";
import { RetrievalCache } from "../src/hub/cache.mjs";

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const flags = new Set(process.argv.slice(2).filter((arg) => arg.startsWith("--")));
const flagValue = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] && !process.argv[index + 1].startsWith("--") ? process.argv[index + 1] : fallback;
};
const INDEX = flagValue("--index", null);
const OPTIMIZE = flags.has("--optimize") || INDEX === "tuned";
const N = Number(positional[0]) || 50_000;
const V = Number(positional[1]) || 20_000;
const QUERIES = Number(flagValue("--queries", "200")) || 200;
const OUT = flagValue("--out", null);
const SEED = Number(flagValue("--seed", "1")) || 1;
const path = join(tmpdir(), `wv-scale-${process.pid}.db`);
const store = new HubStore(path);
// mulberry32: a deterministic PRNG so --seed makes the rows and queries reproducible across runs.
let rngState = SEED >>> 0;
const random = () => { rngState = (rngState + 0x6d2b79f5) >>> 0; let t = rngState; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const vocab = Array.from({ length: 5000 }, (_, i) => `w${i.toString(36)}${i % 7 === 0 ? "ing" : ""}`);
const zipf = () => vocab[Math.min(vocab.length - 1, Math.floor(Math.exp(random() * Math.log(vocab.length))) - 1)];
const sentence = (n) => Array.from({ length: n }, zipf).join(" ");
const pct = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.floor((arr.length - 1) * p)];

let t0 = performance.now();
store.db.exec("BEGIN");
for (let i = 0; i < N; i++) {
  store.add({ project: `p${i % 40}`, kind: "observation", type: "note", title: sentence(8), narrative: sentence(60), tool: `t${i % 6}`, createdAtEpoch: 1_000_000 + i }, { actor: "import" });
  if (i % 5000 === 4999) { store.db.exec("COMMIT"); store.db.exec("BEGIN"); }
}
store.db.exec("COMMIT");
const insertMs = performance.now() - t0;
console.log(`insert   ${N} memories in ${(insertMs / 1000).toFixed(1)} s  (${Math.round(N / (insertMs / 1000))}/s), db ${(statSync(path).size / 1e6).toFixed(0)} MB`);
if (OPTIMIZE) {
  const started = performance.now();
  store.optimizeFts();
  console.log(`optimize FTS segments and ANALYZE in ${((performance.now() - started) / 1000).toFixed(2)} s`);
  const plan = store.db.prepare("EXPLAIN QUERY PLAN SELECT m.id FROM memories_fts CROSS JOIN memories m ON m.id = memories_fts.rowid WHERE memories_fts MATCH 'w0' AND m.project = 'p7' ORDER BY bm25(memories_fts) LIMIT 10").all().map((r) => r.detail).join("; ");
  console.log(`plan     ${plan}`);
}

const lat = (fn, n) => { const xs = []; for (let i = 0; i < n; i++) { const t = performance.now(); fn(); xs.push(performance.now() - t); } return xs; };
const queries = Array.from({ length: QUERIES }, () => sentence(9));
let qi = 0;
const searchRows = [];
for (const [label, opts] of [["bm25 all projects", {}], ["bm25 one project", { project: "p7" }], ["bm25 one tool+project", { project: "p7", tool: "t3" }]]) {
  qi = 0;
  const xs = lat(() => store.search({ query: queries[qi++ % queries.length], limit: 10, ...opts }), QUERIES);
  searchRows.push({ label, p50_ms: Number(pct(xs, 0.5).toFixed(1)), p95_ms: Number(pct(xs, 0.95).toFixed(1)) });
  console.log(`search   ${label.padEnd(22)} p50 ${pct(xs, 0.5).toFixed(1)} ms   p95 ${pct(xs, 0.95).toFixed(1)} ms`);
}
const xs = lat(() => store.list({ limit: 30 }), 100);
console.log(`list     newest 30             p50 ${pct(xs, 0.5).toFixed(1)} ms   p95 ${pct(xs, 0.95).toFixed(1)} ms`);
const ys = lat(() => store.stats(), 20);
console.log(`stats    whole store            p50 ${pct(ys, 0.5).toFixed(1)} ms   p95 ${pct(ys, 0.95).toFixed(1)} ms`);

// Synthetic Recall@5: each query is three words lifted from one real narrative; the source memory is the gold answer.
const recallRows = store.db.prepare("SELECT id, narrative FROM memories ORDER BY id LIMIT ?").all(QUERIES);
let recallHits = 0;
for (const row of recallRows) {
  const words = [...new Set(String(row.narrative).split(/\s+/).filter(Boolean))].slice(0, 3).join(" ");
  const ids = store.ranked({ query: words, project: null, limit: 5 }).map((m) => m.id);
  if (ids.includes(row.id)) recallHits += 1;
}
const recall5 = recallHits / (recallRows.length || 1);
console.log(`recall@5 synthetic (n=${recallRows.length})  ${(recall5 * 100).toFixed(1)}%`);

// vectors
const dim = 384;
const rnd = () => { const v = new Float32Array(dim); for (let i = 0; i < dim; i++) v[i] = random() - 0.5; return v; };
const ids = store.db.prepare("SELECT id FROM memories ORDER BY id LIMIT ?").all(V).map((r) => r.id);
t0 = performance.now();
store.db.exec("BEGIN");
for (const id of ids) store.setVector(id, "synthetic", rnd());
store.db.exec("COMMIT");
console.log(`vectors  stored ${ids.length} x ${dim} dims in ${((performance.now() - t0) / 1000).toFixed(1)} s`);
t0 = performance.now();
const rows = store.vectorRows();
console.log(`vectors  first load (cache fill) ${(performance.now() - t0).toFixed(0)} ms, ~${Math.round((rows.length * dim * 4) / 1e6)} MB resident`);
const qv = rnd();
const vs = lat(() => topKByVector(qv, rows, 100), 50);
console.log(`vectors  brute-force top-100    p50 ${pct(vs, 0.5).toFixed(1)} ms   p95 ${pct(vs, 0.95).toFixed(1)} ms   (${rows.length} vectors)`);
qi = 0;
const hs = lat(() => store.search({ query: queries[qi++ % queries.length], limit: 10, queryVec: qv }), 50);
console.log(`hybrid   bm25 + vectors         p50 ${pct(hs, 0.5).toFixed(1)} ms   p95 ${pct(hs, 0.95).toFixed(1)} ms`);

// Query/result cache over a synthetic replayed session: each of QUERIES queries is repeated three times. A miss runs
// the real search; a hit returns the cached ids. Reports hit rate and the cold-vs-warm latency split.
let cacheSummary = null;
if (flags.has("--cache")) {
  const cache = new RetrievalCache({ capacity: 512, revision: () => 0 });
  const cold = [];
  const warm = [];
  const replay = Array.from({ length: QUERIES * 3 }, (_, i) => queries[i % queries.length]);
  for (const query of replay) {
    const key = cache.key({ query, project: "p7", limit: 10 });
    const t = performance.now();
    const cached = cache.get(key);
    if (cached === undefined) {
      cache.set(key, store.search({ query, project: "p7", limit: 10 }).map((m) => m.id));
      cold.push(performance.now() - t);
    } else {
      warm.push(performance.now() - t);
    }
  }
  cacheSummary = {
    replayQueries: replay.length,
    hits: cache.hits,
    misses: cache.misses,
    hit_rate: Number((cache.hitRate * 100).toFixed(1)),
    cold_p50_ms: Number(pct(cold, 0.5).toFixed(1)),
    cold_p95_ms: Number(pct(cold, 0.95).toFixed(1)),
    warm_p50_ms: Number(pct(warm, 0.5).toFixed(1)),
    warm_p95_ms: Number(pct(warm, 0.95).toFixed(1)),
  };
  console.log(`cache    replay ${replay.length} q      hit rate ${cacheSummary.hit_rate}%   cold p50 ${cacheSummary.cold_p50_ms} ms / p95 ${cacheSummary.cold_p95_ms} ms   warm p50 ${cacheSummary.warm_p50_ms} ms / p95 ${cacheSummary.warm_p95_ms} ms`);
}

const summary = {
  generatedAt: new Date().toISOString(),
  synthetic: true,
  rows: N,
  vectors: V,
  queries: QUERIES,
  seed: SEED,
  index: INDEX ?? (OPTIMIZE ? "tuned" : "default"),
  search: searchRows,
  recall5_synthetic: Number((recall5 * 100).toFixed(1)),
  cache: cacheSummary,
};
if (OUT) writeFileSync(OUT, JSON.stringify(summary, null, 2));
store.close();
