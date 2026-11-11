// The project key of one checkout folder, shared by the hooks (no git process: ~100 ms budget) and the read model.
// A key is the repository folder name. A git worktree uses its main repository's key unless the worktree mode is
// "separate", which gives "<repo>/<worktree>". A submodule is always "<repo>/<path>".
//
// The mode comes from ALETHEIA_WORKTREE_PROJECTS when that is set to a valid value, otherwise from the hub setting
// `project.worktrees` (registered by the process that opened the hub), otherwise "main".
import { Database } from "bun:sqlite";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export const WORKTREE_MODES = ["main", "separate"];
export const WORKTREE_ENV = "ALETHEIA_WORKTREE_PROJECTS";
// The hub settings table stores `project.worktrees` under the editable-settings prefix (src/hub/settings.mjs).
export const WORKTREE_SETTING_KEY = "ui.settings.project.worktrees";

const asMode = (value) => {
  const text = typeof value === "string" ? value.trim().toLowerCase() : "";
  return WORKTREE_MODES.includes(text) ? text : null;
};

let settingSource = null;

/**
 * Register where the stored setting comes from: a function (called on each lookup, so a saved change applies at
 * once), a mode string, or null to forget it. Returns the previous source so a caller can put it back.
 */
export function useWorktreeSetting(source) {
  const previous = settingSource;
  settingSource = typeof source === "function" ? source : asMode(source) ? () => source : null;
  return previous;
}

export function worktreeMode() {
  const fromEnv = asMode(process.env[WORKTREE_ENV]);
  if (fromEnv) return fromEnv;
  try {
    return asMode(settingSource?.()) ?? "main";
  } catch {
    return "main";
  }
}

/** The stored setting, read straight from a hub file without opening the store (about 1 ms). null when unset. */
export function readWorktreeSetting(dbPath) {
  if (!dbPath || dbPath === ":memory:" || !existsSync(dbPath)) return null;
  let db = null;
  try {
    db = new Database(dbPath, { readonly: true });
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(WORKTREE_SETTING_KEY);
    return row ? asMode(JSON.parse(row.value)) : null;
  } catch {
    return null;
  } finally {
    try {
      db?.close();
    } catch {
      // ignore
    }
  }
}

/** What a checkout's `.git` file says it is: a worktree of a main repository, a submodule, or neither (null). */
export function checkoutLink(root) {
  const gitPath = join(root, ".git");
  try {
    if (!statSync(gitPath).isFile()) return null;
    const match = readFileSync(gitPath, "utf8").trim().match(/^gitdir:\s*(.+)$/);
    if (!match) return null;
    const gitdir = resolve(dirname(gitPath), match[1]);
    const worktree = gitdir.match(/^(.+)[/\\]\.git[/\\]worktrees[/\\]([^/\\]+)$/);
    if (worktree) return { kind: "worktree", parentPath: worktree[1], parentName: basename(worktree[1]) };
    const submodule = gitdir.match(/^(.+)[/\\]\.git[/\\]modules[/\\](.+)$/);
    if (submodule) return { kind: "submodule", parentPath: submodule[1], parentName: basename(submodule[1]) };
  } catch {
    // no .git, or an unreadable one: the folder name is the safe answer
  }
  return null;
}

/** The key for a checkout root (the folder that holds `.git`), or for a plain folder. */
export function checkoutKey(root, { worktrees = worktreeMode() } = {}) {
  const name = basename(root) || "unknown-project";
  const link = checkoutLink(root);
  if (link?.kind === "worktree") {
    if (link.parentName === name || asMode(worktrees) !== "separate") return link.parentName;
    return `${link.parentName}/${name}`;
  }
  if (link?.kind === "submodule") {
    const rel = relative(link.parentPath, root);
    return rel && !rel.startsWith("..") && !isAbsolute(rel) ? `${link.parentName}/${rel.split(sep).join("/")}` : name;
  }
  return name;
}
