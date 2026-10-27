#!/usr/bin/env bun
// Build docs/status/index.html (one self-contained page) and docs/status/status.json from the repository's own files.
//   bun scripts/gen-status.mjs            write both files
//   bun scripts/gen-status.mjs --check    exit 1 if the committed files are stale
// Nothing here runs the test suite or touches the network. Test hooks: STATUS_ROOT (repo root), TASKS_DIR (tasks dir).
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative, resolve } from "node:path";
import { checkFiles } from "./check-docs-links.mjs";

const SCRIPT_DIR = import.meta.dir;
const ROOT = resolve(process.env.STATUS_ROOT ?? join(SCRIPT_DIR, ".."));
const TASKS_DIR = resolve(process.env.TASKS_DIR ?? join(ROOT, "docs/tasks"));
const OUT_DIR = join(ROOT, "docs/status");
const HTML_PATH = join(OUT_DIR, "index.html");
const JSON_PATH = join(OUT_DIR, "status.json");
const STATUSES = ["validated", "implemented", "doing", "failed", "todo"];
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

function git(args) {
  const r = Bun.spawnSync(["git", ...args], { cwd: ROOT, stdout: "pipe", stderr: "pipe" });
  return r.exitCode === 0 ? r.stdout.toString() : null;
}

function splitCells(line) {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split(/(?<!\\)\|/)
    .map((c) => c.replace(/\\\|/g, "|").trim());
}

/** Every Markdown table: { section, headers, rows:[cells] }. Section is the nearest "## " heading. */
export function parseTables(text) {
  const lines = text.split("\n");
  const out = [];
  let section = "";
  for (let i = 0; i < lines.length; i++) {
    const h = /^##\s+(.+?)\s*$/.exec(lines[i]);
    if (h) section = h[1];
    if (/^\s*\|/.test(lines[i]) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] ?? "") && /-/.test(lines[i + 1])) {
      const headers = splitCells(lines[i]);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && /^\s*\|/.test(lines[j])) rows.push(splitCells(lines[j++]));
      out.push({ section, headers, rows });
      i = j - 1;
    }
  }
  return out;
}

function sectionOf(text, re) {
  const m = re.exec(text);
  if (!m) return "";
  const rest = text.slice(m.index + m[0].length);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
}

// ---- tasks ----------------------------------------------------------------------------------------------------

function parseTaskFile(path) {
  const text = read(path);
  const get = (name) => (new RegExp(`^${name}:\\s*(.*)$`, "m").exec(text)?.[1] ?? "").trim();
  const id = /^# (T-\d{3}):\s*(.+)$/m.exec(text);
  const evidence = sectionOf(text, /^## Evidence\s*\n/m).replace(/<!--[\s\S]*?-->/g, "").trim();
  const history = sectionOf(text, /^## Status history\s*\n/m).trim();
  const acceptance = sectionOf(text, /^## Acceptance criteria\s*\n/m);
  const validation = (/^## Validation command\s*\n+```[a-z]*\n([\s\S]*?)```/m.exec(text) || [])[1]?.trim() ?? "";
  const files = [];
  for (const line of sectionOf(text, /^## Files to touch\s*\n/m).split("\n")) {
    const m = /^\s*[-*]\s+`([^`]+)`/.exec(line);
    if (m && /[./]/.test(m[1]) && !/[*\s]/.test(m[1])) files.push(m[1].replace(/\/$/, ""));
  }
  const histLines = history.split("\n").map((l) => l.trim()).filter(Boolean);
  const ownerSteps = [];
  const ownerRe = /owner[- ]only|owner (must|runs|needs|has to|should)|npm login|needs the owner|only the owner|the owner decides|human (must|decides)/i;
  for (const l of text.split("\n")) if (ownerRe.test(l)) ownerSteps.push(l.trim().replace(/^[-*]\s+/, "").slice(0, 240));
  return {
    id: id?.[1] ?? null,
    title: id?.[2].trim() ?? "",
    status: get("Status"),
    phase: get("Phase"),
    depsRaw: get("Depends on"),
    validatedOn: get("Validated on"),
    evidenceNonEmpty: evidence !== "" && evidence !== "—" && evidence !== "-",
    evidenceChars: evidence.length,
    acceptanceTicked: (acceptance.match(/^\s*[-*]\s+\[[xX]\]/gm) || []).length,
    acceptanceTotal: (acceptance.match(/^\s*[-*]\s+\[[ xX]\]/gm) || []).length,
    acceptance: acceptance.split("\n").map((l) => /^\s*[-*]\s+\[([ xX])\]\s*(.*)$/.exec(l)).filter(Boolean).map((m) => ({ done: m[1] !== " ", text: m[2] })),
    validation,
    lastHistory: histLines.at(-1) ?? "",
    history: histLines,
    files,
    ownerSteps,
  };
}

function parseTaskTable(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (!/^\|\s*T-\d{3}\s*\|/.test(line)) continue;
    const c = splitCells(line);
    rows.push({ id: c[0], title: c[1], phase: c[2], depsRaw: c[3], status: c[4], validatedOn: c[5] });
  }
  return rows;
}

const depsOf = (raw) => (!raw || raw === "none" ? [] : raw.split(",").map((d) => d.trim()).filter(Boolean));

/** Latest commit date (YYYY-MM-DD) per path, from one git log pass. Returns a lookup function or null. */
function commitDates() {
  const out = git(["log", "--name-only", "--format=@@%cs"]);
  if (out === null) return null;
  const map = new Map();
  let date = "";
  for (const line of out.split("\n")) {
    if (line.startsWith("@@")) date = line.slice(2);
    else if (line && !map.has(line)) map.set(line, date);
  }
  return (path) => {
    if (map.has(path)) return map.get(path);
    let best = "";
    const prefix = `${path}/`;
    for (const [p, d] of map) if (p.startsWith(prefix) && d > best) best = d;
    return best;
  };
}

function buildTasks(lastTouch) {
  const files = existsSync(TASKS_DIR) ? readdirSync(TASKS_DIR).filter((f) => /^T-\d{3}\.md$/.test(f)).sort() : [];
  const tasks = files.map((f) => parseTaskFile(join(TASKS_DIR, f))).filter((t) => t.id);
  const table = parseTaskTable(read(join(TASKS_DIR, "TASKS.md")));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const rowById = new Map(table.map((r) => [r.id, r]));
  const inconsistencies = [];
  for (const r of table) {
    const t = byId.get(r.id);
    if (!t) { inconsistencies.push({ id: r.id, kind: "table-no-file", text: `${r.id} is in TASKS.md but has no task file` }); continue; }
    for (const [label, a, b] of [["status", r.status, t.status], ["phase", r.phase, t.phase], ["dependencies", r.depsRaw, t.depsRaw], ["validated date", r.validatedOn, t.validatedOn], ["title", r.title, t.title]]) {
      if (a !== b) inconsistencies.push({ id: r.id, kind: "table-vs-file", text: `${r.id}: ${label} differs. Table "${a}", file "${b}"` });
    }
  }
  for (const t of tasks) {
    if (!rowById.has(t.id)) inconsistencies.push({ id: t.id, kind: "file-no-row", text: `${t.id} has a task file but no row in TASKS.md` });
    if (t.status === "validated" && !t.evidenceNonEmpty) inconsistencies.push({ id: t.id, kind: "validated-no-evidence", text: `${t.id} is validated but Evidence is empty` });
    if (t.status === "validated" && (!t.validatedOn || t.validatedOn === "—")) inconsistencies.push({ id: t.id, kind: "validated-no-date", text: `${t.id} is validated but has no Validated on date` });
    if (!t.validation) inconsistencies.push({ id: t.id, kind: "no-validation", text: `${t.id} has no Validation command` });
    for (const d of depsOf(t.depsRaw)) if (!byId.has(d)) inconsistencies.push({ id: t.id, kind: "missing-dep", text: `${t.id} depends on ${d}, which does not exist` });
  }
  const dependents = new Map();
  for (const t of tasks) {
    t.deps = depsOf(t.depsRaw).map((d) => ({ id: d, status: byId.get(d)?.status ?? "missing" }));
    t.blockedBy = t.deps.filter((d) => d.status !== "validated").map((d) => d.id);
    for (const d of t.deps) dependents.set(d.id, [...(dependents.get(d.id) ?? []), t.id]);
  }
  const notes = [];
  const stale = [];
  for (const t of tasks) {
    t.eligible = t.status === "todo" && t.blockedBy.length === 0;
    t.blocked = t.status === "todo" && t.blockedBy.length > 0;
    t.dependents = dependents.get(t.id) ?? [];
    t.stale = [];
    if (lastTouch && t.status === "validated" && /^\d{4}-\d{2}-\d{2}$/.test(t.validatedOn)) {
      for (const f of t.files) {
        const d = lastTouch(f);
        if (d && d > t.validatedOn) t.stale.push({ file: f, lastCommit: d });
      }
      if (t.stale.length) stale.push({ id: t.id, text: `${t.id} validated ${t.validatedOn}; changed later: ${t.stale.map((s) => `${s.file} (${s.lastCommit})`).join(", ")}` });
    }
    if (t.status === "validated" && t.acceptanceTotal > t.acceptanceTicked) notes.push({ id: t.id, text: `${t.id} is validated with ${t.acceptanceTotal - t.acceptanceTicked} of ${t.acceptanceTotal} acceptance boxes unticked` });
  }
  const counts = Object.fromEntries(STATUSES.map((s) => [s, tasks.filter((t) => t.status === s).length]));
  const phases = {};
  for (const t of tasks) {
    const p = (phases[t.phase] ??= { total: 0, ...Object.fromEntries(STATUSES.map((s) => [s, 0])) });
    p.total++;
    if (p[t.status] !== undefined) p[t.status]++;
  }
  const open = (id) => (byId.get(id)?.status ?? "validated") !== "validated";
  const ranked = tasks
    .filter((t) => t.eligible)
    .map((t) => {
      const direct = t.dependents.filter((d) => open(d));
      const seen = new Set();
      const walk = (id) => { for (const d of dependents.get(id) ?? []) if (open(d) && !seen.has(d)) { seen.add(d); walk(d); } };
      walk(t.id);
      return { t, direct: direct.length, total: seen.size };
    })
    .sort((a, b) => b.direct - a.direct || b.total - a.total || a.t.phase.localeCompare(b.t.phase) || a.t.files.length - b.t.files.length || a.t.id.localeCompare(b.t.id))
    .map(({ t, direct, total }, i) => ({
      rank: i + 1,
      id: t.id,
      title: t.title,
      phase: t.phase,
      unblocksDirect: direct,
      unblocksTotal: total,
      files: t.files.length,
      reason: `unblocks ${direct} open task${direct === 1 ? "" : "s"} directly and ${total} in all; phase ${t.phase}; ${t.files.length} file${t.files.length === 1 ? "" : "s"} to touch`,
    }));
  const trimmed = tasks.map((t) => ({ ...t, history: t.history.slice(-6) }));
  return { tasks: trimmed, counts, phases, inconsistencies, notes, stale, ranked, total: tasks.length };
}

// ---- features -------------------------------------------------------------------------------------------------

const STATUS_WORD = { parity: "done", better: "done", done: "done", partial: "partial", missing: "missing", "out-of-scope": "out-of-scope", unverified: "unverified" };

function buildFeatures(tasks) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const taskState = (ids) => {
    const st = ids.map((i) => byId.get(i)?.status ?? "missing");
    if (!st.length) return "missing";
    if (st.every((s) => s === "validated")) return "done";
    return st.some((s) => ["validated", "doing", "implemented"].includes(s)) ? "partial" : "missing";
  };
  const sources = [];
  const doc20 = read(join(ROOT, "docs/20-claude-mem-feature-matrix.md"));
  const sec20 = new Map();
  for (const tbl of parseTables(doc20)) {
    const iStatus = tbl.headers.findIndex((h) => /aletheia status/i.test(h));
    if (iStatus < 0 || !/^id$/i.test(tbl.headers[0])) continue;
    const iTask = tbl.headers.findIndex((h) => /task/i.test(h));
    for (const c of tbl.rows) {
      if (!/^F-/.test(c[0])) continue;
      const word = (/\*\*([A-Za-z? -]+?)\*\*/.exec(c[iStatus])?.[1] ?? /^([A-Za-z-]+)/.exec(c[iStatus])?.[1] ?? "").toLowerCase().trim();
      const raw = WORD(word);
      const taskIds = [...new Set((c[iTask >= 0 ? iTask : c.length - 1] ?? "").match(/T-\d{3}/g) ?? [])];
      (sec20.get(tbl.section) ?? sec20.set(tbl.section, []).get(tbl.section)).push({ id: c[0], name: c[1].replace(/\s*\(\d+\)\s*$/, ""), status: raw, rawStatus: word || "?", tasks: taskIds, taskStates: taskIds.map((i) => ({ id: i, status: byId.get(i)?.status ?? "missing" })) });
    }
  }
  sources.push({ doc: "docs/20-claude-mem-feature-matrix.md", title: "claude-mem feature matrix (status as written in the doc)", sections: [...sec20].map(([name, rows]) => ({ name, rows })) });
  const doc27 = read(join(ROOT, "docs/27-free-paid-parity.md"));
  const rows27 = [];
  for (const tbl of parseTables(doc27)) {
    const iTask = tbl.headers.findIndex((h) => /^task$/i.test(h));
    if (iTask < 0 || !/paid feature/i.test(tbl.headers[0])) continue;
    for (const c of tbl.rows) {
      const taskIds = [...new Set((c[iTask] ?? "").match(/T-\d{3}/g) ?? [])];
      const status = taskState(taskIds);
      rows27.push({ id: taskIds[0] ?? `P-${rows27.length + 1}`, name: c[0], status, rawStatus: "from task status", tasks: taskIds, taskStates: taskIds.map((i) => ({ id: i, status: byId.get(i)?.status ?? "missing" })) });
    }
  }
  sources.push({ doc: "docs/27-free-paid-parity.md", title: "Free versions of paid features (status derived from the linked tasks)", sections: rows27.length ? [{ name: "Plan: one task per feature", rows: rows27 }] : [] });
  for (const s of sources) for (const sec of s.sections) {
    sec.counts = { done: 0, partial: 0, missing: 0, other: 0 };
    for (const r of sec.rows) sec.counts[["done", "partial", "missing"].includes(r.status) ? r.status : "other"]++;
  }
  const total = { done: 0, partial: 0, missing: 0, other: 0 };
  for (const s of sources) for (const sec of s.sections) for (const k in total) total[k] += sec.counts[k];
  return { sources, total };
}
function WORD(w) {
  return STATUS_WORD[w] ?? (w.includes("unverified") ? "unverified" : w || "unknown");
}

// ---- docs, links ----------------------------------------------------------------------------------------------

function buildDocs(lastTouch) {
  const dir = join(ROOT, "docs");
  const readme = read(join(ROOT, "README.md"));
  const indexText = read(join(dir, "README.md")) + read(join(dir, "index.md"));
  const names = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")).sort() : [];
  const all = names.map((n) => read(join(dir, n)));
  const docs = names.map((name, i) => {
    const text = all[i];
    const refs = (n) => n.includes(`docs/${name}`) || n.includes(`](${name}`) || n.includes(`(./${name}`);
    const inReadme = refs(readme) ;
    const inIndex = indexText ? indexText.includes(name) : false;
    return {
      file: `docs/${name}`,
      title: /^#\s+(.+)$/m.exec(text)?.[1].trim() ?? name,
      bytes: statSync(join(dir, name)).size,
      lastCommit: lastTouch ? lastTouch(`docs/${name}`) || "n/a" : "n/a",
      linkedFromReadme: inReadme,
      linkedFromIndex: inIndex,
      linkedFromOtherDocs: names.filter((n, j) => n !== name && refs(all[j])).length,
      orphan: !inReadme && !inIndex,
    };
  });
  let links = { problems: [], local: 0, external: 0 };
  try { links = checkFiles(ROOT); } catch (e) { links = { problems: [`link check failed: ${e.message}`], local: 0, external: 0 }; }
  return { docs, links: { broken: links.problems, local: links.local, external: links.external } };
}

// ---- unverified, research log, manual test -------------------------------------------------------------------

function buildVerification() {
  const unverified = [];
  const text = read(join(TASKS_DIR, "unverified.md"));
  for (const tbl of parseTables(text)) {
    const iVerify = tbl.headers.findIndex((h) => /verify|check|state/i.test(h));
    const iItem = tbl.headers.findIndex((h) => /^(item|claim)$/i.test(h));
    const bySection = [];
    for (const c of tbl.rows) {
      if (c.length < 2) continue;
      bySection.push({ n: c[0], item: (iItem >= 0 ? c[iItem] : c[1]).slice(0, 300), verify: (iVerify >= 0 ? c[iVerify] : c[c.length - 1]).slice(0, 400), claim: /untested|claim/i.test(tbl.section) });
    }
    if (bySection.length) unverified.push({ section: tbl.section, items: bySection });
  }
  const logText = read(join(TASKS_DIR, "research-log.md"));
  const log = [];
  let sec = "(top)";
  let n = 0;
  const counts = new Map();
  for (const line of logText.split("\n")) {
    const h = /^##\s+(.+)$/.exec(line);
    if (h) sec = h[1];
    if (/UNVERIFIED/.test(line)) { counts.set(sec, (counts.get(sec) ?? 0) + 1); if (n++ < 60) log.push({ section: sec, text: line.replace(/^\|\s*/, "").slice(0, 300) }); }
  }
  const manual = [];
  let heading = "";
  read(join(ROOT, "docs/manual-test.md")).split("\n").forEach((line, i) => {
    const h = /^#{2,4}\s+(.+)$/.exec(line);
    if (h) heading = h[1];
    if (/NOT RUN BY AUTHOR/.test(line)) manual.push({ line: i + 1, heading, text: line.replace(/\*\*/g, "").slice(0, 260) });
  });
  const unverifiedCount = unverified.reduce((a, s) => a + s.items.length, 0);
  return { unverified, unverifiedCount, researchLogUnverified: { total: [...counts.values()].reduce((a, b) => a + b, 0), bySection: [...counts].map(([section, count]) => ({ section, count })), lines: log }, manual };
}

// ---- tests, checks, run report -------------------------------------------------------------------------------

function walkFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, out);
    else out.push(p);
  }
  return out;
}

function buildChecks() {
  const testFiles = walkFiles(join(ROOT, "test")).filter((f) => /\.test\.(mjs|js|ts)$/.test(f));
  let testCalls = 0;
  for (const f of testFiles) testCalls += (read(f).match(/(?<![\w.])test\(/g) || []).length;
  const rr = read(join(TASKS_DIR, "run-report.md"));
  const last = (re) => { const all = [...rr.matchAll(re)]; return all.length ? all.at(-1) : null; };
  const date = /^Date:\s*(\d{4}-\d{2}-\d{2})/m.exec(rr)?.[1] ?? null;
  const pass = last(/(\d+) pass\b/g), fail = last(/(\d+) fail\b/g), ran = last(/Ran (\d+) tests across (\d+) files/g);
  const ct = last(/check-tasks: ok — (\d+) tasks \(([^)]*)\)/g), cl = last(/links ok: (\d+) local, (\d+) external/g);
  return {
    staticTestFiles: testFiles.length,
    staticTestCalls: testCalls,
    lastRecordedRun: rr ? { source: "docs/tasks/run-report.md", date, pass: pass ? +pass[1] : null, fail: fail ? +fail[1] : null, tests: ran ? +ran[1] : null, files: ran ? +ran[2] : null, checkTasks: ct ? `${ct[1]} tasks (${ct[2]})` : null, links: cl ? `${cl[1]} local, ${cl[2]} external` : null, label: "last recorded run (not run by this generator)" } : null,
    commands: [
      ["Test suite", "nice -n 10 bun test"],
      ["Task table and files agree", "bun scripts/check-tasks.mjs"],
      ["Generated tables current", "bun scripts/gen-tables.mjs --check"],
      ["Translations match README", "bun scripts/i18n-check.mjs"],
      ["README claims match reality", "bun scripts/check-claims.mjs"],
      ["Documentation links resolve", "bun scripts/check-docs-links.mjs"],
      ["Docs site and sitemap", "bun scripts/build-site.mjs && bun scripts/check-sitemap.mjs"],
      ["This page is current", "bun scripts/gen-status.mjs --check"],
      ["Regenerate this page", "bun scripts/gen-status.mjs"],
    ].map(([label, cmd]) => ({ label, cmd })),
  };
}

// ---- git -------------------------------------------------------------------------------------------------------

function buildGit() {
  const head = git(["rev-parse", "--short", "HEAD"]);
  if (head === null) return { available: false };
  const lines = (s) => (s ?? "").split("\n").filter(Boolean);
  const ab = git(["rev-list", "--left-right", "--count", "HEAD...origin/main"]);
  const [ahead, behind] = ab ? ab.trim().split(/\s+/).map(Number) : [null, null];
  const status = lines(git(["status", "--porcelain"]));
  return {
    available: true,
    branch: (git(["branch", "--show-current"]) ?? "").trim() || "(detached)",
    head: head.trim(),
    ahead,
    behind,
    uncommitted: status.length,
    uncommittedDocs: status.filter((l) => /\sdocs\//.test(l) && !/docs\/status\//.test(l) && !l.startsWith("??")).map((l) => l.slice(3)),
    commits: lines(git(["log", "-15", "--format=%h%x09%cs%x09%s"])).map((l) => { const [sha, date, ...s] = l.split("\t"); return { sha, date, subject: s.join("\t") }; }),
    worktrees: lines(git(["worktree", "list"])),
  };
}

// ---- CI, source inventory --------------------------------------------------------------------------------------

function buildCi() {
  const dir = join(ROOT, ".github/workflows");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => /\.ya?ml$/.test(f)).sort() : [];
  return files.map((f) => {
    const text = read(join(dir, f));
    const lines = text.split("\n");
    const name = /^name:\s*(.+)$/m.exec(text)?.[1].trim() ?? f;
    const onBlock = sectionOfYaml(lines, "on");
    const jobsAt = lines.findIndex((l) => /^jobs:/.test(l));
    const jobs = [];
    if (jobsAt >= 0) {
      let cur = null;
      for (const l of lines.slice(jobsAt + 1)) {
        if (/^\S/.test(l)) break;
        const j = /^ {2}([\w-]+):\s*$/.exec(l);
        if (j) { cur = { id: j[1], runsOn: "", matrix: [], runs: [], uses: [] }; jobs.push(cur); continue; }
        if (!cur) continue;
        let m;
        if ((m = /^\s+runs-on:\s*(.+)$/.exec(l))) cur.runsOn = m[1].trim();
        else if ((m = /^\s+(os|node-version|bun-version|include):\s*(.+)$/.exec(l)) && /\[|\w/.test(m[2])) cur.matrix.push(`${m[1]}: ${m[2].trim()}`);
        else if ((m = /^\s+-?\s*run:\s*(.+)$/.exec(l))) cur.runs.push(m[1].trim());
        else if ((m = /^\s+-?\s*uses:\s*(.+)$/.exec(l))) cur.uses.push(m[1].trim());
      }
    }
    return { file: `.github/workflows/${f}`, name, triggers: onBlock, jobs, label: "declared, not run" };
  });
}
function sectionOfYaml(lines, key) {
  const i = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (i < 0) return [];
  const out = [];
  const inline = lines[i].slice(key.length + 1).trim();
  if (inline) out.push(inline);
  for (const l of lines.slice(i + 1)) { if (/^\S/.test(l)) break; if (/^ {2}\w/.test(l) || /^ {4}/.test(l)) out.push(l.trim()); }
  return out;
}

function buildSource() {
  const dirs = {};
  for (const d of ["src", "public", "bin", "scripts", "test", "docs"]) {
    let files = 0, lines = 0;
    for (const f of walkFiles(join(ROOT, d))) {
      const rel = relative(ROOT, f).split("\\").join("/");
      if (rel === "docs/status/index.html" || rel === "docs/status/status.json") continue;
      files++;
      if (/\.(mjs|js|css|html|md|json|yml|yaml|txt|svg|sh|py|toml|service)$/.test(extname(f)) ) lines += read(f).split("\n").length;
    }
    dirs[d] = { files, lines };
  }
  const routes = [];
  for (const file of ["src/hub/routes.mjs", "src/server.mjs"]) {
    const src = read(join(ROOT, file)).split("\n");
    src.forEach((line, i) => {
      if (!/pathname ===|\.exec\(pathname\)/.test(line)) return;
      const method = /method === "([A-Z]+)"/.exec(src.slice(i, i + 3).join(" "))?.[1] ?? /method === "([A-Z]+)"/.exec(src[i - 1] ?? "")?.[1] ?? "";
      const rx = /\/\^?(\\\/[^/]*(?:\\\/[^/]*)*)\$?\/\.exec\(pathname\)/.exec(line)?.[1];
      const paths = rx ? [rx.replace(/\\\//g, "/")] : [...line.matchAll(/pathname === "([^"]+)"/g)].map((m) => m[1]);
      for (const p of paths) routes.push({ file, line: i + 1, method, path: p });
    });
  }
  const cli = [];
  for (const line of read(join(ROOT, "bin/aletheia.mjs")).split("\n").slice(1)) {
    if (!line.startsWith("//")) break;
    const m = /^\/\/\s{2,3}(aletheia .+?)(?:\s{2,}(.+))?$/.exec(line);
    if (m) cli.push({ usage: m[1].trim(), note: (m[2] ?? "").trim() });
    else if (cli.length && /^\/\/\s{10,}/.test(line)) cli.at(-1).note += ` ${line.replace(/^\/\/\s+/, "")}`;
  }
  return { dirs, routes, cli };
}

// ---- assemble --------------------------------------------------------------------------------------------------

export function buildData() {
  const lastTouch = git(["rev-parse", "HEAD"]) === null ? null : commitDates();
  const t = buildTasks(lastTouch);
  const g = buildGit();
  const docs = buildDocs(lastTouch);
  const ownerSteps = t.tasks.filter((x) => x.ownerSteps.length && x.status !== "validated").map((x) => ({ id: x.id, status: x.status, lines: x.ownerSteps.slice(0, 3) }));
  const ownerAll = t.tasks.filter((x) => x.ownerSteps.length).map((x) => ({ id: x.id, status: x.status, lines: x.ownerSteps.slice(0, 3) }));
  return {
    generatedAt: new Date().toISOString(),
    commit: g.available ? g.head : "n/a",
    tasks: t.tasks,
    taskCounts: t.counts,
    taskTotal: t.total,
    phases: t.phases,
    inconsistencies: t.inconsistencies,
    notes: t.notes,
    stale: t.stale,
    next: { ranked: t.ranked, eligible: t.ranked.length, blocked: t.tasks.filter((x) => x.blocked).map((x) => ({ id: x.id, blockedBy: x.blockedBy })), ownerSteps: ownerSteps.length ? ownerSteps : ownerAll },
    features: buildFeatures(t.tasks),
    docs: docs.docs,
    links: docs.links,
    verification: buildVerification(),
    checks: buildChecks(),
    git: g,
    ci: buildCi(),
    source: buildSource(),
  };
}

/** The part of the data that is a function of the files only. --check compares this, not times, shas or git history. */
export function stable(data) {
  const d = JSON.parse(JSON.stringify(data));
  for (const k of ["generatedAt", "commit", "git", "stale"]) delete d[k];
  for (const x of d.docs) delete x.lastCommit;
  for (const x of d.tasks) delete x.stale;
  return d;
}

const jsonForHtml = (data) => JSON.stringify(data).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

export function renderHtml(data) {
  const css = read(join(SCRIPT_DIR, "status-page.css"));
  const js = read(join(SCRIPT_DIR, "status-page.js"));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Aletheia project status</title>
<link rel="icon" href="data:,">
<style>
${css}
</style>
</head>
<body>
<div id="app"><noscript>This page needs JavaScript to draw its tables. The same data is in status.json.</noscript></div>
<script id="status-data" type="application/json">${jsonForHtml(data)}</script>
<script>
${js}
</script>
</body>
</html>
`;
}

const DATA_RE = /<script id="status-data" type="application\/json">[\s\S]*?<\/script>/;

function main() {
  const check = process.argv.includes("--check");
  const data = buildData();
  const html = renderHtml(data);
  const jsonText = `${JSON.stringify(data, null, 2)}\n`;
  if (!check) {
    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(HTML_PATH, html);
    writeFileSync(JSON_PATH, jsonText);
    console.log(`gen-status: wrote ${relative(ROOT, HTML_PATH)} (${html.length} bytes) and ${relative(ROOT, JSON_PATH)}; ${data.taskTotal} tasks, ${data.inconsistencies.length} inconsistencies, ${data.stale.length} stale`);
    return;
  }
  const problems = [];
  const fresh = JSON.stringify(stable(data));
  if (!existsSync(HTML_PATH)) problems.push(`${relative(ROOT, HTML_PATH)} is missing`);
  else {
    const committed = read(HTML_PATH);
    const m = /<script id="status-data" type="application\/json">([\s\S]*?)<\/script>/.exec(committed);
    let embedded = null;
    try { embedded = JSON.parse(m?.[1] ?? ""); } catch { /* reported below */ }
    if (!embedded) problems.push("index.html has no readable embedded data");
    else if (JSON.stringify(stable(embedded)) !== fresh) problems.push("index.html data differs from the repository files");
    if (committed.replace(DATA_RE, "") !== html.replace(DATA_RE, "")) problems.push("index.html template (CSS or JS) differs from scripts/status-page.*");
  }
  if (!existsSync(JSON_PATH)) problems.push(`${relative(ROOT, JSON_PATH)} is missing`);
  else {
    try { if (JSON.stringify(stable(JSON.parse(read(JSON_PATH)))) !== fresh) problems.push("status.json differs from the repository files"); } catch { problems.push("status.json is not valid JSON"); }
  }
  if (problems.length) {
    for (const p of problems) console.error(`gen-status: stale: ${p}`);
    console.error("gen-status: run `bun scripts/gen-status.mjs` and commit docs/status/");
    process.exit(1);
  }
  console.log("gen-status: ok - docs/status/index.html and status.json match the repository files");
}

if (import.meta.main) main();
