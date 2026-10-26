#!/usr/bin/env bun
// Dependency-free consistency checker for docs/tasks.
// Fails when the table and the task files disagree, a dependency is missing,
// a task has no validation command, or a validated/failed task has no evidence.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const DIR = process.env.TASKS_DIR ?? "docs/tasks";
const TABLE = join(DIR, "TASKS.md");
const VALID = new Set(["todo", "doing", "implemented", "validated", "failed"]);
const PHASES = new Set(["P0", "P1", "P2", "P3", "P4", "P5"]);
const errors = [];
const warnings = [];

function fail(msg) {
  errors.push(msg);
}

function parseFile(path) {
  const text = readFileSync(path, "utf8");
  const get = (name) => {
    const m = text.match(new RegExp(`^${name}:\\s*(.*)$`, "m"));
    return m ? m[1].trim() : null;
  };
  const evidenceBlock = (text.match(/^## Evidence\s*\n([\s\S]*?)^## Status history/m) || [])[1] ?? "";
  const evidence = evidenceBlock
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  const history = (text.match(/^## Status history\s*\n([\s\S]*)$/m) || [])[1] ?? "";
  const validation = (text.match(/^## Validation command\s*\n+```[a-z]*\n([\s\S]*?)```/m) || [])[1] ?? "";
  const id = (text.match(/^# (T-\d{3}):/m) || [])[1] ?? null;
  const title = (text.match(/^# T-\d{3}:\s*(.+)$/m) || [])[1]?.trim() ?? null;
  return {
    id, title,
    status: get("Status"),
    phase: get("Phase"),
    depsRaw: get("Depends on"),
    validatedOn: get("Validated on"),
    evidence,
    history: history.trim(),
    validation: validation.trim(),
    path,
  };
}

function parseTable() {
  const text = readFileSync(TABLE, "utf8");
  const rows = [];
  for (const line of text.split("\n")) {
    if (!/^\|\s*T-\d{3}\s*\|/.test(line)) continue;
    const cells = line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
    if (cells.length < 7) {
      fail(`TASKS.md: malformed row: ${line}`);
      continue;
    }
    rows.push({
      id: cells[0],
      title: cells[1],
      phase: cells[2],
      depsRaw: cells[3],
      status: cells[4],
      validatedOn: cells[5],
      evidenceLink: cells[6],
    });
  }
  return rows;
}

const table = parseTable();
if (!table.length) fail("TASKS.md: no task rows found");

const files = readdirSync(DIR).filter((f) => /^T-\d{3}\.md$/.test(f)).sort();
const parsed = files.map((f) => parseFile(join(DIR, f)));

const byId = new Map();
for (const t of parsed) {
  if (!t.id) {
    fail(`${t.path}: missing "# T-NNN: title" heading`);
    continue;
  }
  if (byId.has(t.id)) fail(`${t.id}: duplicate task file`);
  byId.set(t.id, t);
  if (!t.title) fail(`${t.id}: missing title in heading`);
  if (!VALID.has(t.status ?? "")) fail(`${t.id}: status "${t.status}" is not one of ${[...VALID].join(", ")}`);
  if (!PHASES.has(t.phase ?? "")) fail(`${t.id}: phase "${t.phase}" is not P0-P5`);
  if (!t.validation) fail(`${t.id}: no non-empty Validation command block`);
  if (!t.history) fail(`${t.id}: empty Status history`);
  if (t.status === "validated") {
    if (!t.evidence || t.evidence === "—" || t.evidence === "-") fail(`${t.id}: validated but Evidence is empty`);
    if (!t.validatedOn || t.validatedOn === "—") fail(`${t.id}: validated but Validated on is empty`);
  }
  if (t.status === "failed" && (!t.evidence || t.evidence === "—")) {
    fail(`${t.id}: failed but Evidence is empty (paste the failing output)`);
  }
}

for (const row of table) {
  if (!byId.has(row.id)) {
    fail(`TASKS.md: ${row.id} has no task file`);
    continue;
  }
  const t = byId.get(row.id);
  if (!VALID.has(row.status)) fail(`TASKS.md: ${row.id} status "${row.status}" is invalid`);
  if (!PHASES.has(row.phase)) fail(`TASKS.md: ${row.id} phase "${row.phase}" is invalid`);
  if (t.title !== row.title) fail(`TASKS.md: ${row.id} title "${row.title}" != task file "${t.title}"`);
  if (t.phase !== row.phase) fail(`TASKS.md: ${row.id} phase "${row.phase}" != task file "${t.phase}"`);
  if ((t.depsRaw ?? "") !== row.depsRaw) fail(`TASKS.md: ${row.id} deps "${row.depsRaw}" != task file "${t.depsRaw}"`);
  if (t.status !== row.status) fail(`TASKS.md: ${row.id} status "${row.status}" != task file "${t.status}"`);
  if ((t.validatedOn ?? "") !== row.validatedOn) fail(`TASKS.md: ${row.id} validated on "${row.validatedOn}" != task file "${t.validatedOn}"`);
  if (!row.evidenceLink.includes(`${row.id}.md`)) fail(`TASKS.md: ${row.id} evidence link does not point at ${row.id}.md`);
}

const ids = new Set(byId.keys());
for (const t of parsed) {
  if (!t.depsRaw || t.depsRaw === "none") continue;
  const deps = t.depsRaw.split(",").map((d) => d.trim()).filter(Boolean);
  for (const d of deps) {
    if (!/^T-\d{3}$/.test(d)) fail(`${t.id}: dependency "${d}" is not a task id`);
    else if (!ids.has(d)) fail(`${t.id}: dependency ${d} does not exist`);
    else if (d === t.id) fail(`${t.id}: depends on itself`);
  }
}

const counts = {};
for (const t of parsed) counts[t.status] = (counts[t.status] ?? 0) + 1;
const summary = Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(" ");

if (errors.length) {
  console.error(`check-tasks: ${errors.length} error(s)`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`check-tasks: ok — ${parsed.length} tasks (${summary})`);
