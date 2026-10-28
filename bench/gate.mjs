#!/usr/bin/env bun
// Recall@5 and p95 latency regression gate. Synthetic and deterministic: a seeded corpus, no model, no
// network, no downloaded data. The corpus generator and the seeded PRNG are the same as bench/scale.mjs.
//
//   bun bench/gate.mjs                        check the current numbers against bench/baseline.json
//   bun bench/gate.mjs --write bench/baseline.json   (re)write the baseline from the current numbers
//   bun bench/gate.mjs --baseline /path.json  check against a different baseline
//
// Queries carry distractors (near-duplicate documents sharing a topic vocabulary and the answer needle), so
// the answer is not always ranked first and Recall@5 has headroom to drop. The corpus is large enough that p95
// sits above the 5 ms floor on the CI runner, which makes the latency rule enforceable instead of report-only.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { HubStore } from "../src/hub/store.mjs";

export const RECALL_TOLERANCE = 0.01; // one point of Recall@5 (a fraction in [0, 1])
export const LATENCY_TOLERANCE_PCT = 20;
export const LATENCY_FLOOR_MS = 5;

export const DEFAULTS = { rows: 50000, queries: 100, seed: 1, runs: 5, topics: 10 };
const BASELINE_RUNS = 5; // independent measurements the --write baseline is the median of, to dodge p95 noise

// mulberry32, the deterministic PRNG from bench/scale.mjs, so --seed reproduces the corpus across runs.
function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Zipf-like vocab and sentence builder, again from bench/scale.mjs, to make filler noise reproducible.
const vocab = Array.from({ length: 5000 }, (_, i) => `w${i.toString(36)}${i % 7 === 0 ? "ing" : ""}`);
const zipf = (random) => vocab[Math.min(vocab.length - 1, Math.floor(Math.exp(random() * Math.log(vocab.length))) - 1)];
const sentence = (random, n) => Array.from({ length: n }, () => zipf(random)).join(" ");

const pct = (arr, p) => arr.slice().sort((a, b) => a - b)[Math.floor((arr.length - 1) * p)];
const median = (arr) => arr.slice().sort((a, b) => a - b)[Math.floor((arr.length - 1) / 2)];

/**
 * Build the fixed corpus. Every query has four distractors that share its topic vocabulary and (for most
 * difficulties) its needle, so the answer competes with 3-5 plausible near-duplicates. Difficulty is seeded from
 * the query index: most answers are ranked first, a share are pushed to rank 3, and every tenth answer is pushed
 * to rank 6 so Recall@5 lands near 0.9 instead of 1.0. Document length is the only ranking lever; everything
 * stays deterministic under the seeded PRNG. Returns the gold list [{ query, answerId }].
 */
export function buildCorpus(store, { rows = DEFAULTS.rows, queries = DEFAULTS.queries, seed = DEFAULTS.seed, topics = DEFAULTS.topics } = {}) {
  const random = mulberry32(seed);
  const distractors = 4;
  let hardCount = 0;
  for (let q = 0; q < queries; q++) if (q % 10 === 9) hardCount += 1;
  const nonFiller = queries * (1 + distractors) + hardCount;
  const fillerCount = rows - nonFiller;
  const shared = (topic) => `topic${topic}share0 topic${topic}share1`;
  const needle = (q) => `needle${q}`;
  const gold = [];
  store.db.exec("BEGIN");
  try {
    for (let i = 0; i < fillerCount; i++) {
      const topic = i % topics;
      store.add({
        project: "gate", kind: "observation", type: "note",
        title: `filler ${i}`,
        narrative: `${shared(topic)} ${sentence(random, 8)}`,
        tool: "gate",
      }, { actor: "import" });
    }
    for (let q = 0; q < queries; q++) {
      const topic = q % topics;
      const difficulty = q % 10;
      const sharedWords = shared(topic);
      const answerToken = needle(q);
      const docs = [];
      const push = (title, narrative, answer) => docs.push({ title, narrative, answer });
      if (difficulty <= 5) {
        push(`q${q} answer`, `${sharedWords} ${answerToken} ${sentence(random, 4)}`, true);
        for (let j = 0; j < distractors; j++) push(`q${q} d${j}`, `${sharedWords} ${answerToken} dup${q}${j} ${sentence(random, 6)}`, false);
      } else if (difficulty <= 8) {
        push(`q${q} answer`, `${sharedWords} ${answerToken} ${sentence(random, 12)}`, true);
        push(`q${q} d0`, `${sharedWords} ${answerToken} dup${q}0 ${sentence(random, 1)}`, false);
        push(`q${q} d1`, `${sharedWords} ${answerToken} dup${q}1 ${sentence(random, 2)}`, false);
        push(`q${q} d2`, `${sharedWords} other${q}0 ${sentence(random, 6)}`, false);
        push(`q${q} d3`, `${sharedWords} other${q}1 ${sentence(random, 6)}`, false);
      } else {
        push(`q${q} answer`, `${sharedWords} ${answerToken} ${sentence(random, 14)}`, true);
        for (let j = 0; j < distractors; j++) push(`q${q} d${j}`, `${sharedWords} ${answerToken} dup${q}${j} ${sentence(random, 1 + j)}`, false);
        push(`q${q} extra`, `${sharedWords} ${answerToken} dup${q}x ${sentence(random, 5)}`, false);
      }
      let answerId = null;
      for (const doc of docs) {
        const memory = store.add({
          project: "gate", kind: "observation", type: "note",
          title: doc.title,
          narrative: doc.narrative,
          tool: "gate",
        }, { actor: "import" });
        if (doc.answer) answerId = memory.id;
      }
      gold.push({ query: `${sharedWords} ${answerToken}`, answerId });
    }
    store.db.exec("COMMIT");
  } catch (error) {
    store.db.exec("ROLLBACK");
    throw error;
  }
  return gold;
}

/** Recall@5 over the gold queries: the answer id must appear in the top 5 ranked memories. */
export function measureRecall5(store, gold) {
  let hits = 0;
  for (const item of gold) {
    const ids = store.ranked({ query: item.query, project: "gate", limit: 5 }).map((memory) => memory.id);
    if (ids.includes(item.answerId)) hits += 1;
  }
  return hits / (gold.length || 1);
}

/** Median p95 search latency across `runs` independent passes over the gold queries. */
export function measureP95Latency(store, gold, { runs = DEFAULTS.runs } = {}) {
  const queries = gold.map((item) => item.query);
  for (const query of queries) store.search({ query, project: "gate", limit: 10 }); // warm the FTS path
  const p95s = [];
  for (let run = 0; run < runs; run++) {
    const samples = [];
    for (const query of queries) {
      const started = performance.now();
      store.search({ query, project: "gate", limit: 10 });
      samples.push(performance.now() - started);
    }
    p95s.push(pct(samples, 0.95));
  }
  return median(p95s);
}

/** Compare a measured result with the stored baseline. Pure and unit-testable; never writes or exits. */
export function evaluate(baseline, current) {
  const recall5 = Number(current.recall5);
  const p95Ms = Number(current.p95_ms);
  const baselineRecall5 = Number(baseline.recall5);
  const baselineP95 = Number(baseline.p95_ms);
  const recallDelta = recall5 - baselineRecall5;
  const p95DeltaPct = baselineP95 > 0 ? ((p95Ms - baselineP95) / baselineP95) * 100 : 0;
  const recallPass = recallDelta >= -RECALL_TOLERANCE;
  const latencyEnforced = baselineP95 >= LATENCY_FLOOR_MS;
  const latencyPass = !latencyEnforced || p95DeltaPct <= LATENCY_TOLERANCE_PCT;
  const pass = recallPass && latencyPass;
  return {
    recall5, p95Ms, baselineRecall5, baselineP95,
    recallDelta, p95DeltaPct,
    recallPass, latencyPass, latencyEnforced, pass,
    reasons: [
      ...(recallPass ? [] : [`Recall@5 dropped ${recallDelta.toFixed(4)} (more than ${RECALL_TOLERANCE})`]),
      ...(latencyPass ? [] : [`p95 latency rose ${p95DeltaPct.toFixed(1)}% (more than ${LATENCY_TOLERANCE_PCT}%)`]),
    ],
  };
}

/** Read and validate a baseline file. A missing file is a hard failure with the command that would create it. */
export function loadBaseline(path) {
  if (!existsSync(path)) {
    throw new Error(`No baseline at ${path}. Run "bun bench/gate.mjs --write ${path}" to create it.`);
  }
  const doc = JSON.parse(readFileSync(path, "utf8"));
  for (const key of ["recall5", "p95_ms"]) {
    if (!Number.isFinite(doc[key])) throw new Error(`Baseline ${path} is missing a numeric "${key}".`);
  }
  return doc;
}

/** Run the synthetic benchmark once and return the two numbers plus the reproduction parameters. */
export function computeMetrics({ rows = DEFAULTS.rows, queries = DEFAULTS.queries, seed = DEFAULTS.seed, runs = DEFAULTS.runs, topics = DEFAULTS.topics } = {}) {
  const store = new HubStore(":memory:");
  try {
    const gold = buildCorpus(store, { rows, queries, seed, topics });
    const recall5 = Number(measureRecall5(store, gold).toFixed(4));
    const p95Ms = Number(measureP95Latency(store, gold, { runs }).toFixed(3));
    return { recall5, p95_ms: p95Ms, rows, queries, seed, runs, topics };
  } finally {
    store.close();
  }
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function flagValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  const value = args[index + 1];
  return value && !value.startsWith("--") ? value : fallback;
}

function mismatchParams(baseline, current) {
  const out = [];
  for (const key of ["rows", "queries", "seed", "runs", "topics"]) {
    if (baseline[key] !== undefined && Number(baseline[key]) !== Number(current[key])) {
      out.push(`${key} baseline ${baseline[key]} != current ${current[key]}`);
    }
  }
  return out;
}

function printResult(verdict) {
  const latencyNote = verdict.latencyEnforced ? "" : ` (report only: baseline p95 < ${LATENCY_FLOOR_MS} ms)`;
  console.log(`gate: recall@5 ${verdict.recall5.toFixed(4)} (baseline ${verdict.baselineRecall5.toFixed(4)}, delta ${verdict.recallDelta >= 0 ? "+" : ""}${verdict.recallDelta.toFixed(4)})`);
  console.log(`gate: p95 latency ${verdict.p95Ms.toFixed(3)} ms (baseline ${verdict.baselineP95.toFixed(3)} ms, ${verdict.p95DeltaPct >= 0 ? "+" : ""}${verdict.p95DeltaPct.toFixed(1)}%)${latencyNote}`);
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const baselinePath = flagValue(args, "--baseline", "bench/baseline.json");
  const rows = Number(flagValue(args, "--rows", String(DEFAULTS.rows)));
  const queries = Number(flagValue(args, "--queries", String(DEFAULTS.queries)));
  const seed = Number(flagValue(args, "--seed", String(DEFAULTS.seed)));
  const runs = Number(flagValue(args, "--runs", String(DEFAULTS.runs)));
  const topics = Number(flagValue(args, "--topics", String(DEFAULTS.topics)));

  if (write) {
    const samples = [];
    for (let i = 0; i < BASELINE_RUNS; i++) samples.push(computeMetrics({ rows, queries, seed, runs, topics }));
    const current = {
      ...samples[0],
      recall5: Number(median(samples.map((sample) => sample.recall5)).toFixed(4)),
      p95_ms: Number(median(samples.map((sample) => sample.p95_ms)).toFixed(3)),
    };
    const baseline = {
      date: new Date().toISOString().slice(0, 10),
      commit: gitCommit(),
      command: `bun bench/gate.mjs --write ${baselinePath}`,
      ...current,
      machine: `${process.platform} ${process.arch} bun ${process.versions.bun}`,
    };
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`gate: wrote ${baselinePath} (recall@5 ${current.recall5.toFixed(4)}, p95 ${current.p95_ms.toFixed(3)} ms, rows ${rows}, queries ${queries}, seed ${seed}, runs ${runs}, median of ${BASELINE_RUNS})`);
    return;
  }

  // Load first so a missing or malformed baseline fails before the (slower) corpus build.
  const baseline = loadBaseline(baselinePath);
  const current = computeMetrics({ rows, queries, seed, runs, topics });
  const paramProblems = mismatchParams(baseline, current);
  if (paramProblems.length) {
    console.error(`gate: baseline parameters do not match the current run: ${paramProblems.join("; ")}`);
    process.exit(1);
  }
  const verdict = evaluate(baseline, current);
  printResult(verdict);
  if (!verdict.pass) {
    for (const reason of verdict.reasons) console.error(`gate: FAIL — ${reason}`);
    process.exit(1);
  }
  console.log("gate: PASS");
}

if (import.meta.main) {
  main();
}
