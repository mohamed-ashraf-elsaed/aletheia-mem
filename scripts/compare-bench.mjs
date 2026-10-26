#!/usr/bin/env bun
// Print the measured LoCoMo table from bench/results/<date>/*.json. No network, no dependencies.
//   bun scripts/compare-bench.mjs [results-dir]
// The numbers in docs/22 are the previous claims; a row says REPRODUCED only when this run is within 0.5 points.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "bench", "results");
const latest = () => {
  if (!existsSync(root)) return null;
  const dirs = readdirSync(root).filter((name) => statSync(join(root, name)).isDirectory()).sort();
  return dirs.at(-1) ? join(root, dirs.at(-1)) : null;
};
const dir = process.argv[2] ?? latest();
if (!dir || !existsSync(dir)) {
  console.error("No results directory. Run bun run bench:locomo with --out bench/results/<date>/<name>.json first.");
  process.exit(1);
}

const files = readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
if (!files.length) {
  console.error(`No .json result files in ${dir}.`);
  process.exit(1);
}

const runs = files.map((file) => {
  const doc = JSON.parse(readFileSync(join(dir, file), "utf8"));
  return { file, ...doc };
});

const pct = (value) => (typeof value === "number" ? `${(value * 100).toFixed(1)}%` : "n/a");
const ratio = (result, count, key) => (result && count ? (result[key] ?? 0) / count : null);
const strategyOf = (run, name) => run.results?.[name] ?? null;

console.log(`LoCoMo results from ${dir}`);
const sha = [...new Set(runs.map((run) => run.datasetSha256).filter(Boolean))];
const models = [...new Set(runs.map((run) => run.model).filter(Boolean))];
console.log(`dataset sha256 ${sha.join(", ") || "unknown"}; model ${models.join(", ") || "unknown"}`);
console.log("");

console.log("| run | facts | n | strategy | R@1 | R@3 | R@5 | R@10 | MRR | ms/q |");
console.log("|---|---|---:|---|---:|---:|---:|---:|---:|---:|");
for (const run of runs) {
  for (const [name, result] of Object.entries(run.results ?? {})) {
    const n = result.n ?? run.questions;
    console.log(`| ${run.file} | ${run.factsMode ?? "?"} | ${run.questions} | ${name} | ${pct(ratio(result, n, "R@1"))} | ${pct(ratio(result, n, "R@3"))} | ${pct(ratio(result, n, "R@5"))} | ${pct(ratio(result, n, "R@10"))} | ${(result.mrr / n).toFixed(3)} | ${(result.ms / n).toFixed(2)} |`);
  }
}

const find = (predicate) => runs.find(predicate);

// The previous claims in docs/22 and docs/14, with the exact row that produced each.
const previous = [
  { label: "raw turns, all 10, hybrid R@5", value: 57.5, run: find((r) => /^raw-turns\.json$/.test(r.file)), strategy: "hybrid" },
  { label: "dataset facts, all 10, hybrid+facts R@5", value: 65.2, run: find((r) => /^dataset-facts\.json$/.test(r.file)), strategy: "hybrid+facts" },
  { label: "dataset facts, 3 conversations, hybrid+facts R@5", value: 67.6, run: find((r) => /dataset-facts-3.*\.json$/.test(r.file)), strategy: "hybrid+facts" },
  { label: "dataset facts, 3 conversations, +rerank R@5", value: 73.7, run: find((r) => /dataset-facts-3.*\.json$/.test(r.file)), strategy: "hybrid+facts+rerank" },
  { label: "dataset facts, 3 conversations, +rerank MRR", value: 0.686, run: find((r) => /dataset-facts-3.*\.json$/.test(r.file)), strategy: "hybrid+facts+rerank", mrr: true },
  { label: "dataset facts, all 10, +rerank R@5", value: 72.5, run: find((r) => /^dataset-facts-rerank\.json$/.test(r.file)), strategy: "hybrid+facts+rerank" },
  { label: "dataset facts, all 10, +rerank MRR", value: 0.679, run: find((r) => /^dataset-facts-rerank\.json$/.test(r.file)), strategy: "hybrid+facts+rerank", mrr: true },
];

console.log("");
console.log("| claim | previous | measured | delta | status |");
console.log("|---|---:|---:|---:|---|");
for (const claim of previous) {
  const result = claim.run && strategyOf(claim.run, claim.strategy);
  if (!result) {
    console.log(`| ${claim.label} | ${claim.mrr ? claim.value.toFixed(3) : `${claim.value.toFixed(1)}%`} | n/a | n/a | not rerun |`);
    continue;
  }
  const n = result.n ?? claim.run.questions;
  const measured = claim.mrr ? result.mrr / n : ratio(result, n, "R@5") * 100;
  const delta = measured - claim.value;
  const status = Math.abs(delta) <= 0.5 ? "REPRODUCED" : "changed";
  console.log(`| ${claim.label} | ${claim.mrr ? claim.value.toFixed(3) : `${claim.value.toFixed(1)}%`} | ${claim.mrr ? measured.toFixed(3) : `${measured.toFixed(1)}%`} | ${delta >= 0 ? "+" : ""}${delta.toFixed(claim.mrr ? 3 : 1)} | ${status} |`);
}

const ruleRun = find((r) => /rules/.test(r.file));
if (ruleRun) {
  const hybrid = strategyOf(ruleRun, "hybrid");
  const facts = strategyOf(ruleRun, "hybrid+facts");
  const n = facts?.n ?? ruleRun.questions;
  console.log("");
  console.log(`Our rule extractor: hybrid ${pct(ratio(hybrid, n, "R@5"))} -> hybrid+facts ${pct(ratio(facts, n, "R@5"))} (${ruleRun.questions} questions).`);
}
