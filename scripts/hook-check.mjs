#!/usr/bin/env bun
// Verify that a real host session left the expected hook artifacts in the hub database, without writing anything.
//   bun scripts/hook-check.mjs <data-dir> [--tool command-code|claude-code]
//
// Opens hub.db read-only, scans the stored text for redaction leaks (it reports the row and column, never the
// secret), checks the hook spool, and prints PASS/FAIL per expected event for the chosen tool. Exits 1 on any FAIL.
// A SessionStart hook injects context but stores no row, so it is reported as "context only" and is never a FAIL.
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { claudeCode } from "../src/hub/hooks/claude-code.mjs";
import { commandCode } from "../src/hub/hooks/command-code.mjs";
import { redact } from "../src/hub/redact.mjs";

const ADAPTERS = { "claude-code": claudeCode, "command-code": commandCode };
const SPOOL_FILE = "hook-spool.jsonl";

function parseArgs(argv) {
  let dataDir = null;
  let tool = "claude-code";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--tool") {
      tool = argv[i + 1];
      i++;
    } else if (!dataDir) {
      dataDir = argv[i];
    }
  }
  if (!dataDir) return { error: "usage: bun scripts/hook-check.mjs <data-dir> [--tool command-code|claude-code]" };
  if (!ADAPTERS[tool]) return { error: `unknown tool "${tool}"; use ${Object.keys(ADAPTERS).join(" or ")}` };
  return { dataDir: resolve(dataDir), tool };
}

function spoolItemCount(dataDir) {
  const dir = join(dataDir, "spool");
  if (!existsSync(dir)) return { count: 0, files: 0 };
  const files = readdirSync(dir).filter((name) => name.startsWith(SPOOL_FILE));
  let count = 0;
  for (const file of files) {
    try {
      count += readFileSync(join(dir, file), "utf8").split("\n").filter((line) => line.trim()).length;
    } catch {
      // an unreadable spool file still counts as non-empty evidence
      count += 1;
    }
  }
  return { count, files: files.length };
}

const iso = (epoch) => (Number.isFinite(epoch) ? new Date(epoch).toISOString() : null);

export function checkHook({ dataDir, tool = "claude-code" } = {}) {
  const adapter = ADAPTERS[tool];
  const dbPath = join(dataDir, "hub.db");
  const spool = spoolItemCount(dataDir);
  const result = {
    ok: true,
    tool,
    dataDir,
    dbPath,
    dbPresent: existsSync(dbPath),
    sessions: [],
    byKind: {},
    sessionEnd: { total: 0, bySource: {} },
    firstAt: null,
    lastAt: null,
    redactionMarkers: 0,
    leaks: [],
    spool,
    verdicts: [],
    adapterEvents: adapter.events,
    missingEvents: adapter.missingEvents ?? [],
  };

  if (!result.dbPresent) {
    result.ok = false;
    return result;
  }

  const db = new Database(dbPath, { readonly: true });
  try {
    db.exec("PRAGMA query_only = ON");

    const sessionRows = db.prepare("SELECT DISTINCT project, session_id FROM memories WHERE tool = ? AND session_id IS NOT NULL AND session_id != ''").all(tool);
    const endRows = db.prepare("SELECT project, session_id, ended_at_epoch, source FROM session_end").all();
    const seen = new Map();
    for (const row of sessionRows) seen.set(`${row.project}\u0000${row.session_id}`, { project: row.project, sessionId: row.session_id });
    for (const row of endRows) {
      const key = `${row.project}\u0000${row.session_id}`;
      if (!seen.has(key)) seen.set(key, { project: row.project, sessionId: row.session_id });
    }
    result.sessions = [...seen.values()].sort((a, b) => `${a.project}\u0000${a.sessionId}`.localeCompare(`${b.project}\u0000${b.sessionId}`));

    const kindRows = db.prepare("SELECT kind, COUNT(*) AS n, MIN(created_at_epoch) AS min_at, MAX(created_at_epoch) AS max_at FROM memories WHERE tool = ? GROUP BY kind").all(tool);
    for (const row of kindRows) {
      result.byKind[row.kind] = row.n;
      if (Number.isFinite(row.min_at) && (result.firstAt === null || row.min_at < result.firstAt)) result.firstAt = row.min_at;
      if (Number.isFinite(row.max_at) && (result.lastAt === null || row.max_at > result.lastAt)) result.lastAt = row.max_at;
    }

    for (const row of endRows) {
      result.sessionEnd.total++;
      result.sessionEnd.bySource[row.source] = (result.sessionEnd.bySource[row.source] ?? 0) + 1;
      if (Number.isFinite(row.ended_at_epoch) && (result.firstAt === null || row.ended_at_epoch < result.firstAt)) result.firstAt = row.ended_at_epoch;
      if (Number.isFinite(row.ended_at_epoch) && (result.lastAt === null || row.ended_at_epoch > result.lastAt)) result.lastAt = row.ended_at_epoch;
    }

    const textRows = db.prepare("SELECT id, title, subtitle, narrative, facts, concepts, files FROM memories WHERE tool = ?").all(tool);
    for (const row of textRows) {
      for (const column of ["title", "subtitle", "narrative", "facts", "concepts", "files"]) {
        const value = row[column];
        if (typeof value !== "string" || !value) continue;
        result.redactionMarkers += (value.match(/\[redacted[:\]]/g) ?? []).length;
        if (redact(value) !== value) result.leaks.push({ rowId: row.id, column });
      }
    }
  } finally {
    db.close();
  }

  const signalFor = (event) => {
    if (event === "SessionStart") return { signal: "context only (no stored row)", count: null };
    if (event === "UserPromptSubmit") return { signal: "prompt rows", count: result.byKind.prompt ?? 0 };
    if (event === "PostToolUse") return { signal: "event rows", count: result.byKind.event ?? 0 };
    if (event === "Stop" || event === "SessionEnd") {
      const summary = result.byKind.summary ?? 0;
      const ended = result.sessionEnd.total;
      if (summary > 0) return { signal: ended > 0 ? "summary rows (+ session-end rows)" : "summary rows", count: summary };
      if (ended > 0) return { signal: "session-end rows", count: ended };
      return { signal: "summary rows or session-end rows", count: 0 };
    }
    return { signal: "summary rows", count: result.byKind.summary ?? 0 };
  };

  for (const event of adapter.events) {
    const { signal, count } = signalFor(event);
    const verdict = event === "SessionStart" ? "n/a" : count > 0 ? "PASS" : "FAIL";
    result.verdicts.push({ event, signal, count, verdict });
  }

  if (result.leaks.length) result.ok = false;
  if (result.spool.count > 0) result.ok = false;
  if (result.verdicts.some((v) => v.verdict === "FAIL")) result.ok = false;

  return result;
}

function render(result) {
  const lines = [];
  lines.push(`hook-check: ${result.tool} — ${result.dataDir}`);
  lines.push(`hub.db: ${result.dbPresent ? "present (read-only)" : "missing"}`);
  lines.push(`sessions seen: ${result.sessions.length}${result.sessions.length ? " (" + result.sessions.map((s) => `${s.project}:${s.sessionId}`).join(", ") + ")" : ""}`);
  lines.push(`first event: ${iso(result.firstAt) ?? "none"}   last event: ${iso(result.lastAt) ?? "none"}`);
  lines.push("");
  lines.push("events per hook type:");
  for (const v of result.verdicts) {
    lines.push(`  ${v.event.padEnd(18)} ${v.signal.padEnd(26)} ${v.count === null ? "—" : v.count}`);
  }
  if (result.missingEvents?.length) {
    lines.push(`  not installed: ${result.missingEvents.join(", ")}`);
  }
  lines.push("");
  lines.push(`secrets: ${result.redactionMarkers} redaction marker(s), ${result.leaks.length ? `${result.leaks.length} leak(s) (FAIL)` : "no leaks"}`);
  for (const leak of result.leaks) lines.push(`  leak in memories row ${leak.rowId} (${leak.column}) — value not printed`);
  lines.push(`spool: ${result.spool.count ? `${result.spool.count} item(s) (FAIL)` : "empty"}`);
  lines.push("");
  lines.push("verdict:");
  for (const v of result.verdicts) {
    lines.push(`  [${v.verdict.padEnd(4)}] ${v.event.padEnd(18)} ${v.count === null ? "" : v.count}`);
  }
  lines.push("");
  lines.push(`overall: ${result.ok ? "PASS" : "FAIL"}`);
  return lines.join("\n");
}

if (import.meta.main) {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.error) {
    console.error(`hook-check: ${parsed.error}`);
    process.exit(2);
  }
  const result = checkHook(parsed);
  console.log(render(result));
  process.exit(result.ok ? 0 : 1);
}
