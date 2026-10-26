// Project keys. A project key is "<repo>" or "<repo>/<worktree>"; a request stays inside one project ROOT
// (the key before its first "/"), so worktrees of one repo share requests.
//
// Simplification against the original: the original also supports CLAUDE_MEM_PROJECT_NAME_SOURCE=git-remote
// and CLAUDE_MEM_PROJECT_ENVIRONMENTS globs. This port derives keys from the checkout path only.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const NO_PROJECT = "";

export function projectRoot(project) {
  return typeof project === "string" ? project.split("/")[0] : null;
}

/** A saved group root that is a bare repo name upgrades to the member key that extends it. */
export function upgradedGroupRoot(savedRoot, anchorRoot, memberRoots = []) {
  if (typeof savedRoot !== "string" || !savedRoot || savedRoot.includes("/")) return savedRoot;
  const extendsSaved = (key) => typeof key === "string" && key.startsWith(`${savedRoot}/`);
  if (extendsSaved(anchorRoot)) return anchorRoot;
  const matches = new Set(memberRoots.filter(extendsSaved));
  return matches.size === 1 ? [...matches][0] : savedRoot;
}

function gitRepoRoot(dir) {
  try {
    const out = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 5000 });
    return out.trim() || null;
  } catch {
    return null;
  }
}

function worktreeParent(checkoutRoot) {
  const gitPath = join(checkoutRoot, ".git");
  let stat;
  try {
    stat = statSync(gitPath);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const match = readFileSync(gitPath, "utf8").trim().match(/^gitdir:\s*(.+)$/);
  if (!match) return null;
  const gitdir = resolve(dirname(gitPath), match[1]);
  const worktree = gitdir.match(/^(.+)[/\\]\.git[/\\]worktrees[/\\]([^/\\]+)$/);
  if (worktree) return { parentName: basename(worktree[1]), kind: "worktree" };
  const submodule = gitdir.match(/^(.+)[/\\]\.git[/\\]modules[/\\](.+)$/);
  if (submodule) return { parentName: basename(submodule[1]), parentPath: submodule[1], kind: "submodule" };
  return null;
}

/** Project key for a working directory: repo name, "<parent>/<worktree>" for worktrees. */
export function projectKeyForPath(cwd) {
  if (!cwd || !cwd.trim()) return "unknown-project";
  const expanded = cwd.startsWith("~/") ? join(homedir(), cwd.slice(2)) : cwd;
  const repoRoot = gitRepoRoot(expanded);
  const source = repoRoot ?? expanded;
  const name = basename(source) || "unknown-project";
  const info = worktreeParent(repoRoot ?? expanded);
  if (info?.kind === "worktree") return info.parentName === name ? info.parentName : `${info.parentName}/${name}`;
  if (info?.kind === "submodule") {
    const rel = relative(info.parentPath, repoRoot ?? expanded);
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? `${info.parentName}/${rel.split(sep).join("/")}` : name;
  }
  return name;
}

// ---- Sessions recorded in an agent scratch folder: derive the real project from the paths its tools touched.

const realpathOr = (path) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};
const TMP_ROOTS = [...new Set([resolve(tmpdir()), realpathOr(resolve(tmpdir())), "/tmp", "/private/tmp"])];
const HOME = homedir();
const TMP_NAMES = new Set(TMP_ROOTS.map((p) => basename(p)).filter((n) => n && n !== "tmp"));
const CODEX_SCRATCH = /[/\\]Documents[/\\]Codex[/\\]\d{4}-\d{2}-\d{2}(?:[/\\]|$)/;
const PATH_IN_TEXT = /(?:^|[\s"'`=:(])((?:~[/\\]|\/|[A-Za-z]:[/\\])[^\n\r"'`;|&<>()]*)/g;
const IGNORED_HOME_DIRS = [".claude", ".codex", ".gemini", ".claude-mem", ".cursor"].map((d) => join(HOME, d));

export function isAgentScratchFolder(folder) {
  if (typeof folder !== "string" || !folder) return false;
  if (CODEX_SCRATCH.test(folder)) return true;
  const resolved = resolve(folder);
  return TMP_ROOTS.some((root) => resolved === root || resolved.startsWith(`${root}/`));
}

const repoRootCache = new Map();
function repoRootOf(path) {
  const walked = [];
  let current = resolve(path);
  let found = null;
  for (;;) {
    if (repoRootCache.has(current)) {
      found = repoRootCache.get(current);
      break;
    }
    walked.push(current);
    if (existsSync(join(current, ".git"))) {
      found = current;
      break;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  for (const seen of walked) repoRootCache.set(seen, found);
  return found;
}

function pathsIn(toolInput) {
  let parsed = toolInput;
  if (typeof toolInput === "string") {
    try {
      parsed = JSON.parse(toolInput);
    } catch {
      parsed = toolInput;
    }
  }
  const strings = [];
  const walk = (v) => {
    if (typeof v === "string") strings.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  };
  walk(parsed);
  const out = [];
  for (const text of strings) {
    for (const m of text.matchAll(PATH_IN_TEXT)) {
      const raw = m[1].trim();
      const abs = raw.startsWith("~/") ? join(HOME, raw.slice(2)) : raw;
      const inClaudeDirs = IGNORED_HOME_DIRS.some((d) => abs === d || abs.startsWith(`${d}/`));
      if (abs.length > 1 && abs.startsWith("/") && !abs.startsWith("//") && !inClaudeDirs) out.push(abs);
    }
  }
  return out;
}

function nearestExisting(path) {
  let current = path;
  while (current !== dirname(current) && !existsSync(current)) current = dirname(current);
  return repoRootOf(current);
}

function projectFromToolPaths(toolInputs) {
  const roots = new Map();
  const keyOfRepo = new Map();
  for (const input of toolInputs) {
    for (const path of pathsIn(input)) {
      const repo = nearestExisting(path);
      if (!repo) continue;
      if (!keyOfRepo.has(repo)) keyOfRepo.set(repo, projectKeyForPath(repo));
      const key = keyOfRepo.get(repo);
      const root = projectRoot(key);
      if (!roots.has(root)) roots.set(root, { count: 0, keys: new Map() });
      const bucket = roots.get(root);
      bucket.count++;
      bucket.keys.set(key, (bucket.keys.get(key) ?? 0) + 1);
    }
  }
  let best = null;
  for (const bucket of roots.values()) if (!best || bucket.count > best.count) best = bucket;
  return best ? [...best.keys].sort((a, b) => b[1] - a[1])[0][0] : NO_PROJECT;
}

function folderNeedsProject(folder, storedProject) {
  if (!folder) return TMP_NAMES.has(storedProject);
  return existsSync(folder) ? !repoRootOf(folder) : isAgentScratchFolder(folder);
}

const derivedCache = new Map();
const chunked = (list, n) => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));
function allOrNull(db, sql, params) {
  try {
    return db.prepare(sql).all(...params);
  } catch (error) {
    if (/no such (table|column)/i.test(String(error.message))) return null;
    throw error;
  }
}

/** For sessions whose stored project is a scratch folder, replace it with the project their tools worked in. */
export function withDerivedProjects(db, sessions) {
  const ids = [...new Set(sessions.map((s) => s.id).filter((id) => id != null))];
  if (!ids.length) return sessions;
  const cwdOf = new Map();
  for (const part of chunked(ids, 500)) {
    const rows = allOrNull(db, `SELECT id, cwd FROM sdk_sessions WHERE id IN (${part.map(() => "?").join(",")})`, part);
    if (rows === null) return sessions;
    for (const row of rows) cwdOf.set(row.id, row.cwd || null);
  }
  const noCwdProjects = [...new Set(sessions.filter((s) => cwdOf.has(s.id) && !cwdOf.get(s.id) && typeof s.project === "string").map((s) => s.project))];
  const scratchProjects = new Set();
  for (const part of chunked(noCwdProjects, 500)) {
    const rows = allOrNull(db, `SELECT DISTINCT project, cwd FROM sdk_sessions WHERE project IN (${part.map(() => "?").join(",")}) AND cwd IS NOT NULL AND cwd <> ''`, part) ?? [];
    for (const row of rows) if (isAgentScratchFolder(row.cwd)) scratchProjects.add(row.project);
  }
  const needing = sessions.filter(
    (s) => cwdOf.has(s.id) && (cwdOf.get(s.id) ? folderNeedsProject(cwdOf.get(s.id), s.project) : folderNeedsProject(null, s.project) || scratchProjects.has(s.project)),
  );
  if (!needing.length) return sessions;
  const needIds = [...new Set(needing.map((s) => s.id))];
  const heads = new Map();
  for (const part of chunked(needIds, 500)) {
    const rows = allOrNull(db, `SELECT session_db_id, MAX(id) AS head FROM tool_uses WHERE session_db_id IN (${part.map(() => "?").join(",")}) GROUP BY session_db_id`, part) ?? [];
    for (const row of rows) heads.set(row.session_db_id, row.head);
  }
  const derived = new Map();
  for (const id of needIds) {
    const head = heads.get(id) ?? 0;
    const cached = derivedCache.get(id);
    if (cached && cached.head === head) {
      derived.set(id, cached.project);
      continue;
    }
    const rows = head
      ? (allOrNull(db, "SELECT substr(tool_input, 1, 4000) AS tool_input, cwd FROM tool_uses WHERE session_db_id = ? ORDER BY id DESC LIMIT 400", [id]) ?? [])
      : [];
    const project = projectFromToolPaths(rows.flatMap((r) => [r.tool_input, ...(r.cwd ? [JSON.stringify({ cwd: r.cwd })] : [])]));
    derivedCache.set(id, { head, project });
    derived.set(id, project);
  }
  return derived.size ? sessions.map((s) => (derived.has(s.id) ? { ...s, project: derived.get(s.id), storedProject: s.project } : s)) : sessions;
}
