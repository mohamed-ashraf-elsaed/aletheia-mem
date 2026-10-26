#!/usr/bin/env bun
// Generate the comparison, tool-support and measured-number tables from their data sources.
// Sources: docs/28-competitor-report.json, src/hub/install.mjs and bench/results/<date>/*.json.
// Usage: bun scripts/gen-tables.mjs [--check] [--results <dir>]
//   --check  exit 1 when a marked block is missing or differs from the generated text
// Blocks are delimited by <!-- gen:name --> ... <!-- /gen:name --> in .md and .html files.
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { INSTALLERS } from "../src/hub/install.mjs";

const DEFAULT_ROOT = join(import.meta.dir, "..");
const CHECK = process.argv.includes("--check");
const flag = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

export const TARGETS = [
  { file: "README.md", blocks: ["tools", "capabilities", "bench"] },
  { file: "docs/28-competitor-report.md", blocks: ["capabilities"] },
  { file: "site/index.html", blocks: ["bench", "tools"] },
];

const read = (root, path) => readFileSync(join(root, path), "utf8");
const cell = (value) => String(value ?? "").replace(/\|/g, "\\|").replace(/\s*\n\s*/g, " ").trim();

export function humanCell(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "?" || /^unverified$/i.test(text)) return "UNVERIFIED";
  if (text.startsWith("✅")) return `yes${text.slice(1)}`.trim();
  if (text.startsWith("❌")) return `no${text.slice(1)}`.trim();
  return text;
}

export function mdTable(headers, rows) {
  const line = (values) => `| ${values.map(cell).join(" | ")} |`;
  return [line(headers), `|${headers.map(() => "---").join("|")}|`, ...rows.map(line)].join("\n");
}

const escapeHtml = (value) => String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const inlineHtml = (value) =>
  escapeHtml(value).replace(/`([^`]+)`/g, "<code>$1</code>");

export function htmlTable(headers, rows) {
  return [
    "<table>",
    "<thead><tr>" + headers.map((header) => `<th>${inlineHtml(header)}</th>`).join("") + "</tr></thead>",
    "<tbody>",
    ...rows.map((row) => "<tr>" + row.map((value) => `<td>${inlineHtml(value)}</td>`).join("") + "</tr>"),
    "</tbody>",
    "</table>",
  ].join("\n");
}

const table = (format, headers, rows) => (format === "html" ? htmlTable(headers, rows) : mdTable(headers, rows));
const note = (format, text) =>
  format === "html" ? `<p class="note">${inlineHtml(text)}</p>` : `_${text}_`;

export function renderTools(format = "md", installers = INSTALLERS) {
  const headers = ["Tool", "Level", "Verification", "Hook events installed"];
  const rows = installers.map((installer) => [
    installer.id,
    installer.capabilities,
    installer.verification === "tested-on-real-install"
      ? "tested on a real install"
      : "config written from docs, not tested on a real install",
    installer.events?.length ? installer.events.join(", ") : "none (MCP and rules only)",
  ]);
  const lines = [table(format, headers, rows)];
  lines.push(note(format, "Generated from src/hub/install.mjs via `aletheia install --list`. A row says tested on a real install only when that column says so; today none do."));
  return lines.join("\n\n");
}

function capabilityRows(root) {
  const source = JSON.parse(read(root, "docs/28-competitor-report.json"));
  const rows = source.rows.filter((row) => row.cells?.Capability);
  if (!rows.length) throw new Error("docs/28-competitor-report.json has no table with a Capability column");
  return rows;
}

export function renderCapabilities(format = "md", root = DEFAULT_ROOT) {
  const wanted = ["Capability", "Aletheia (today)", "claude-mem", "Mem0", "Zep/Graphiti", "Supermemory", "Basic Memory"];
  const rows = capabilityRows(root).map((row) => wanted.map((header) => humanCell(row.cells[header])));
  const lines = [table(format, wanted, rows)];
  lines.push(note(format, "Generated from docs/28-competitor-report.json (rows copied from docs/21-competitor-landscape.md, fetched 2026-10-26). Aletheia cells updated 2026-10-26 from validated tasks; see docs/20 and docs/25. Cells the source did not state read UNVERIFIED."));
  return lines.join("\n\n");
}

export function latestResultsDir(resultsRoot) {
  if (!existsSync(resultsRoot)) return null;
  const dirs = readdirSync(resultsRoot).filter((name) => statSync(join(resultsRoot, name)).isDirectory()).sort();
  return dirs.at(-1) ? join(resultsRoot, dirs.at(-1)) : null;
}

const withCommas = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const RUNS = [
  { file: "raw-turns.json", strategy: "hybrid", label: "Raw turns, all 10 conversations" },
  { file: "dataset-facts.json", strategy: "hybrid+facts", label: "Dataset facts, all 10" },
  { file: "dataset-facts-3-rerank.json", strategy: "hybrid+facts", label: "Dataset facts, 3 conversations" },
  { file: "dataset-facts-3-rerank.json", strategy: "hybrid+facts+rerank", label: "Dataset facts, 3 conversations, + rerank" },
  { file: "dataset-facts-rerank.json", strategy: "hybrid+facts+rerank", label: "Dataset facts, all 10, + rerank" },
  { file: "our-facts-rules.json", strategy: "hybrid+facts", label: "Our rule-extracted facts, all 10" },
];

function loadRun(dir, file) {
  const path = join(dir, file);
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
}

export function baselineRow(root = DEFAULT_ROOT) {
  const path = join(root, "docs/14-research-ai-memory.md");
  if (!existsSync(path)) return null;
  const text = readFileSync(path, "utf8");
  const line = text.split("\n").find((candidate) => candidate.includes("**claude-mem**") && candidate.includes("|"));
  const questions = (text.match(/\*\*(\d{1,3}(?:,\d{3})*)\s+questions\*\*/) || [])[1];
  if (!line) return null;
  const cells = line.replace(/^\||\|$/g, "").split("|").map((value) => value.trim());
  const recall = (cells[3] ?? "").replace(/\*/g, "").trim();
  const mrr = (cells[6] ?? "").replace(/\*/g, "").trim();
  const latency = (cells[8] ?? "").replace(/\*/g, "").trim();
  if (!recall || !mrr || !latency) return null;
  return {
    label: "claude-mem 15.2.0 (as shipped), raw turns — measured-by-us",
    questions: questions ?? "UNVERIFIED",
    recall: `${recall}%`,
    mrr,
    latency,
    source: "docs/14 §14.6",
  };
}

export function renderBench(format = "md", resultsDir = latestResultsDir(join(DEFAULT_ROOT, "bench/results")), root = DEFAULT_ROOT) {
  if (!resultsDir || !existsSync(resultsDir)) {
    return note(format, "No benchmark results found. Run `bun run bench:locomo` and write JSON under bench/results/<date>/ first.");
  }
  const headers = ["Run", "Questions", "Recall@5", "MRR", "ms/query"];
  const rows = [];
  const sources = [];
  const baseline = baselineRow(root);
  if (baseline) {
    rows.push([baseline.label, baseline.questions, baseline.recall, baseline.mrr, baseline.latency]);
    sources.push(baseline.source);
  }
  for (const spec of RUNS) {
    const run = loadRun(resultsDir, spec.file);
    const result = run?.results?.[spec.strategy];
    if (!result) {
      rows.push([spec.label, run?.questions ?? "n/a", "not run", "not run", "not run"]);
      sources.push(spec.file);
      continue;
    }
    const n = result.n ?? run.questions;
    rows.push([
      spec.label,
      withCommas(run.questions),
      `${((result["R@5"] / n) * 100).toFixed(1)}%`,
      (result.mrr / n).toFixed(3),
      (result.ms / n).toFixed(2),
    ]);
    sources.push(`${spec.file} (${spec.strategy})`);
  }
  const date = (resultsDir.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] ?? "unknown date";
  const lines = [table(format, headers, rows)];
  lines.push(note(format, `Retrieval only: Recall@5 asks whether the gold evidence is in the top five results. It is not answer accuracy. Every row is measured-by-us on the same LoCoMo questions; no vendor-claimed benchmark number is in this table. Generated from bench/results/${date}/ (${sources.join(", ")}); re-run with \`bun scripts/compare-bench.mjs\`.`));
  return lines.join("\n\n");
}

export const RENDERERS = {
  tools: (format, root) => renderTools(format),
  capabilities: (format, root) => renderCapabilities(format, root),
  bench: (format, root, resultsDir) => renderBench(format, resultsDir, root),
};

const MARK = (name) => [`<!-- gen:${name} -->`, `<!-- /gen:${name} -->`];

export function replaceBlock(text, name, body) {
  const [begin, end] = MARK(name);
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start >= 0 && stop > start) {
    return `${text.slice(0, start + begin.length)}\n${body}\n${text.slice(stop)}`;
  }
  return `${text.replace(/\s*$/, "")}\n\n${begin}\n${body}\n${end}\n`;
}

export function checkBlocks(text, name, body) {
  const [begin, end] = MARK(name);
  const start = text.indexOf(begin);
  const stop = text.indexOf(end);
  if (start < 0 || stop < start) return { ok: false, reason: "marker missing" };
  const current = text.slice(start + begin.length, stop).trim();
  return { ok: current === body.trim(), reason: current === body.trim() ? "" : "block differs from generated text" };
}

function main() {
  const root = process.env.GEN_TABLES_ROOT ? resolve(process.env.GEN_TABLES_ROOT) : DEFAULT_ROOT;
  const resultsDir = flag("results")
    ? resolve(flag("results"))
    : latestResultsDir(join(root, "bench/results"));
  const problems = [];
  let changed = 0;

  for (const target of TARGETS) {
    const path = join(root, target.file);
    if (!existsSync(path)) {
      problems.push(`${target.file}: file not found`);
      continue;
    }
    let text = readFileSync(path, "utf8");
    const format = target.file.endsWith(".html") ? "html" : "md";
    for (const name of target.blocks) {
      const body = RENDERERS[name](format, root, resultsDir);
      if (CHECK) {
        const result = checkBlocks(text, name, body);
        if (!result.ok) problems.push(`${target.file}: ${name}: ${result.reason}`);
      } else {
        const next = replaceBlock(text, name, body);
        if (next !== text) changed += 1;
        text = next;
      }
    }
    if (!CHECK) writeFileSync(path, text);
  }

  if (CHECK) {
    if (problems.length) {
      for (const problem of problems) console.error(`gen-tables: ${problem}`);
      console.error(`gen-tables: ${problems.length} block(s) need regeneration; run bun scripts/gen-tables.mjs`);
      process.exit(1);
    }
    console.log(`gen-tables: ok — ${TARGETS.reduce((sum, target) => sum + target.blocks.length, 0)} blocks current`);
    return;
  }
  console.log(`gen-tables: wrote ${changed} block change(s) in ${TARGETS.length} files`);
}

if (import.meta.main) main();
