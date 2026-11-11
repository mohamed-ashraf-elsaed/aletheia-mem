// Project keys across the hub: list them with per-table counts, merge one key into another, and fold the keys that
// git worktree sessions left behind (`<repo>/<worktree>`, from before T-262) into their main project.
//
// A merge moves every table that has a `project` column, read from the schema, in one transaction. A row that already
// exists under the target (same content hash once the hash is recomputed for the target, or the same unique key) is
// a duplicate: references to it are pointed at the target's row, then it is deleted and counted. Anything else that
// collides rolls the whole merge back.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { sha256 } from "../lib/hash.mjs";
import { checkoutLink } from "../lib/project-key.mjs";

const ORDER = ["memories", "episodes", "observations", "facts", "entities", "summaries", "rule_suggestions", "rule_suggestion_quotes", "session_end"];
const quote = (name) => `"${String(name).replace(/"/g, '""')}"`;

/** Every ordinary table with a `project` column, known tables first, so a table added later is never skipped. */
export function projectTables(db) {
  const names = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND coalesce(sql, '') NOT LIKE 'CREATE VIRTUAL%'").all().map((row) => row.name);
  const scoped = names.filter((name) => db.prepare(`PRAGMA table_info(${quote(name)})`).all().some((column) => column.name === "project"));
  const rank = (name) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length);
  return scoped.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

const hasTable = (db, name) => !!db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name);

// The content hashes that include the project, as the write paths compute them (store.mjs add, addEpisode,
// addObservation, addFact; transcripts.mjs episodeHash). A stored hash that matches none of them does not depend on
// the project and is kept as it is.
const HASHES = {
  memories: [(row, project) => sha256(JSON.stringify([project, row.kind, row.title, row.narrative ?? ""]))],
  episodes: [
    (row, project) => sha256(`episode\n${project}\n${row.source_ref ?? ""}\n${row.text}`),
    (row, project) => sha256(`transcript\n${project}\n${String(row.text).slice(0, 20_000)}`),
  ],
  observations: [(row, project) => sha256(JSON.stringify([project, row.type, row.title, row.narrative]))],
  facts: [(row, project) => sha256(JSON.stringify([project, row.subject, row.predicate, row.object]))],
};

// Tables whose duplicates are found by a unique key other than the content hash. Summaries and quotes have no unique
// constraint, so their key is every column that makes two rows the same (addSummary uses the same test).
const KEYS = {
  entities: ["canonical_name", "type"],
  rule_suggestions: ["text"],
  session_end: ["session_id"],
  summaries: ["scope", "text", "source_ids"],
  rule_suggestion_quotes: ["suggestion_id", "text", "at_epoch", "source_type", "source_id", "session_id"],
};

// Key columns that hold the id of a row in a table merged earlier. The plan maps them through that table's duplicates,
// so it counts what the merge will see after the earlier table's references were repointed.
const KEY_REFS = { rule_suggestion_quotes: { suggestion_id: "rule_suggestions" } };

// The item type other tables use to point at a row of this table (links, keys, evidence, reviews, dismissals).
const ITEM_TYPE = { memories: "memory", episodes: "episode", observations: "observation", facts: "fact", entities: "entity", rule_suggestions: "suggestion" };

/** For each row under `from`: its new content hash, and the target row it duplicates, if any. Reads only. */
function planTable(db, table, from, into, keptFor = new Map()) {
  const rows = db.prepare(`SELECT rowid AS _rowid, * FROM ${quote(table)} WHERE project = ? ORDER BY rowid`).all(from);
  const hashes = HASHES[table];
  const key = KEYS[table];
  const byHash = hashes ? db.prepare(`SELECT rowid AS _rowid FROM ${quote(table)} WHERE content_hash = ? AND rowid != ?`) : null;
  const byKey = key ? db.prepare(`SELECT rowid AS _rowid FROM ${quote(table)} WHERE project = ? AND ${key.map((column) => `${quote(column)} IS ?`).join(" AND ")} LIMIT 1`) : null;
  return rows.map((row) => {
    if (hashes) {
      const hasher = hashes.find((hash) => hash(row, from) === row.content_hash);
      if (!hasher) return { row, hash: null, keep: null };
      const hash = hasher(row, into);
      return { row, hash, keep: byHash.get(hash, row._rowid)?._rowid ?? null };
    }
    if (key) {
      const value = (column) => keptFor.get(KEY_REFS[table]?.[column])?.get(row[column]) ?? row[column];
      return { row, hash: null, keep: byKey.get(into, ...key.map(value))?._rowid ?? null };
    }
    return { row, hash: null, keep: null };
  });
}

const tally = (actions) => ({ moved: actions.filter((a) => a.keep == null).length, dropped: actions.filter((a) => a.keep != null).length });

function summarize(from, into, perTable) {
  const tables = {};
  let moved = 0;
  let dropped = 0;
  for (const [table, counts] of perTable) {
    if (!counts.moved && !counts.dropped) continue;
    tables[table] = counts;
    moved += counts.moved;
    dropped += counts.dropped;
  }
  return { from, into, moved, dropped, tables };
}

function checkNames(from, into) {
  const a = typeof from === "string" ? from.trim() : "";
  const b = typeof into === "string" ? into.trim() : "";
  if (!a || !b || a === b) throw new RangeError("Pick two different projects.");
  return [a, b];
}

/** What a merge would do, per table, without writing. The counts are the ones mergeProjects reports. */
export function planProjectMerge(store, from, into) {
  const [a, b] = checkNames(from, into);
  const keptFor = new Map();
  return summarize(a, b, projectTables(store.db).map((table) => {
    const actions = planTable(store.db, table, a, b, keptFor);
    keptFor.set(table, new Map(actions.filter((action) => action.keep != null).map((action) => [action.row._rowid, action.keep])));
    return [table, tally(actions)];
  }));
}

/** Point every reference to row `drop` of an item type at row `keep`. A reference that already exists is removed. */
function repointItem(db, type, drop, keep) {
  for (const [table, typeColumn, idColumn] of [["memory_links", "from_type", "from_id"], ["memory_links", "to_type", "to_id"], ["memory_keys", "owner_type", "owner_id"], ["rule_evidence", "kind", "ref_id"], ["review_queue", "item_type", "item_id"]]) {
    if (!hasTable(db, table)) continue;
    db.prepare(`UPDATE OR IGNORE ${table} SET ${idColumn} = ? WHERE ${typeColumn} = ? AND ${idColumn} = ?`).run(keep, type, drop);
    db.prepare(`DELETE FROM ${table} WHERE ${typeColumn} = ? AND ${idColumn} = ?`).run(type, drop);
  }
  // A dismissal belongs to the copy the user hid; the row that stays keeps its own state.
  if (hasTable(db, "dismissals")) db.prepare("DELETE FROM dismissals WHERE item_type = ? AND item_id = ?").run(type, drop);
}

const parseList = (value) => {
  try {
    const list = JSON.parse(value ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

/** Keep what the duplicate adds before it is deleted: file paths, pins, counts and the foreign keys that cite it. */
function absorb(db, table, drop, keep) {
  if (table === "memories") {
    const [d, k] = [drop, keep].map((id) => db.prepare("SELECT files, pinned, scope FROM memories WHERE id = ?").get(id));
    if (hasTable(db, "memory_files")) db.prepare("INSERT OR IGNORE INTO memory_files (memory_id, path) SELECT ?, path FROM memory_files WHERE memory_id = ?").run(keep, drop);
    const files = [...new Set([...parseList(k.files), ...parseList(d.files)])];
    const filesJson = files.length ? JSON.stringify(files) : k.files;
    db.prepare("UPDATE memories SET files = ?, pinned = max(pinned, ?), scope = CASE WHEN ? = 'global' THEN 'global' ELSE scope END WHERE id = ?").run(filesJson, d.pinned, d.scope, keep);
  } else if (table === "episodes") {
    db.prepare("UPDATE facts SET episode_id = ? WHERE episode_id = ?").run(keep, drop);
    db.prepare("UPDATE observations SET episode_id = ? WHERE episode_id = ?").run(keep, drop);
  } else if (table === "observations") {
    const d = db.prepare("SELECT pinned, importance FROM observations WHERE id = ?").get(drop);
    db.prepare("UPDATE observations SET pinned = max(pinned, ?), importance = max(importance, ?) WHERE id = ?").run(d.pinned, d.importance, keep);
    db.prepare("UPDATE facts SET observation_id = ? WHERE observation_id = ?").run(keep, drop);
  } else if (table === "facts") {
    db.prepare("UPDATE OR IGNORE fact_entities SET fact_id = ? WHERE fact_id = ?").run(keep, drop);
    db.prepare("UPDATE facts SET supersedes_id = CASE WHEN id = ? THEN NULL ELSE ? END WHERE supersedes_id = ?").run(keep, keep, drop);
  } else if (table === "entities") {
    db.prepare("UPDATE OR IGNORE entity_aliases SET entity_id = ? WHERE entity_id = ?").run(keep, drop);
    db.prepare("UPDATE OR IGNORE fact_entities SET entity_id = ? WHERE entity_id = ?").run(keep, drop);
  } else if (table === "rule_suggestions") {
    const d = db.prepare("SELECT * FROM rule_suggestions WHERE id = ?").get(drop);
    db.prepare(`UPDATE rule_suggestions SET times_seen = times_seen + ?, confidence = max(confidence, ?), created_at_epoch = min(created_at_epoch, ?),
                latest_at_epoch = max(coalesce(latest_at_epoch, 0), coalesce(?, 0)), status = CASE WHEN status = 'pending' THEN ? ELSE status END WHERE id = ?`)
      .run(d.times_seen ?? 1, d.confidence, d.created_at_epoch, d.latest_at_epoch, d.status, keep);
    if (hasTable(db, "rule_suggestion_quotes")) db.prepare("UPDATE rule_suggestion_quotes SET suggestion_id = ? WHERE suggestion_id = ?").run(keep, drop);
  } else if (table === "session_end") {
    const d = db.prepare("SELECT ended_at_epoch, source FROM session_end WHERE rowid = ?").get(drop);
    db.prepare("UPDATE session_end SET source = CASE WHEN ? > ended_at_epoch THEN ? ELSE source END, ended_at_epoch = max(ended_at_epoch, ?) WHERE rowid = ?")
      .run(d.ended_at_epoch, d.source, d.ended_at_epoch, keep);
  }
  if (ITEM_TYPE[table]) repointItem(db, ITEM_TYPE[table], drop, keep);
}

function applyTable(db, table, from, into) {
  const actions = planTable(db, table, from, into);
  try {
    const remove = db.prepare(`DELETE FROM ${quote(table)} WHERE rowid = ?`);
    for (const { row, keep } of actions) {
      if (keep == null) continue;
      absorb(db, table, row._rowid, keep);
      remove.run(row._rowid);
    }
    const rehash = HASHES[table] ? db.prepare(`UPDATE ${quote(table)} SET project = ?, content_hash = ? WHERE rowid = ?`) : null;
    const move = db.prepare(`UPDATE ${quote(table)} SET project = ? WHERE rowid = ?`);
    for (const { row, hash, keep } of actions) {
      if (keep != null) continue;
      if (hash) rehash.run(into, hash, row._rowid);
      else move.run(into, row._rowid);
    }
  } catch (error) {
    throw new RangeError(`Cannot merge ${table} from "${from}" into "${into}": ${error.message}`);
  }
  return tally(actions);
}

/** Per-project output language lives in one settings map; the target keeps its own when it has one. */
function mergeLanguage(store, from, into) {
  const map = store.setting("output.language", {});
  if (!map || typeof map !== "object" || !Object.hasOwn(map, from)) return;
  if (!Object.hasOwn(map, into)) map[into] = map[from];
  delete map[from];
  store.setSetting("output.language", map);
}

/**
 * Move every project-scoped row from one key to another in one transaction and write one audit entry with the
 * per-table counts. Inside an open transaction it uses a savepoint, so several merges can commit together.
 */
export function mergeProjects(store, from, into, { actor = "ui" } = {}) {
  const [a, b] = checkNames(from, into);
  const db = store.db;
  const nested = db.inTransaction;
  db.exec(nested ? "SAVEPOINT project_merge" : "BEGIN IMMEDIATE");
  try {
    const result = summarize(a, b, projectTables(db).map((table) => [table, applyTable(db, table, a, b)]));
    mergeLanguage(store, a, b);
    store.audit(actor, "project.merge", result);
    db.exec(nested ? "RELEASE project_merge" : "COMMIT");
    store.statsCache = null;
    store.vecCache = null;
    return result;
  } catch (error) {
    try {
      if (nested) {
        db.exec("ROLLBACK TO project_merge");
        db.exec("RELEASE project_merge");
      } else {
        db.exec("ROLLBACK");
      }
    } catch {
      // the transaction is already gone
    }
    throw error;
  }
}

/** Every project key with its row count in each project-scoped table, sorted by key. */
export function projectCounts(store) {
  const byKey = new Map();
  for (const table of projectTables(store.db)) {
    for (const { project, n } of store.db.prepare(`SELECT project, COUNT(*) AS n FROM ${quote(table)} GROUP BY project`).all()) {
      if (!byKey.has(project)) byKey.set(project, { name: project, counts: {}, total: 0 });
      const entry = byKey.get(project);
      entry.counts[table] = n;
      entry.total += n;
    }
  }
  return [...byKey.values()].sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0));
}

// ---- folding worktree keys ------------------------------------------------------------------------------------

const AGENT_NAME = /^agent-[0-9a-f]{8,}$/;
const HASH_SUFFIX = /-[0-9a-f]{6}$/;

const isDir = (path) => {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
};

function checkoutRootOf(start) {
  let current = resolve(start);
  for (;;) {
    if (existsSync(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * What one repository on disk says about its project keys: its key, the folder names of its worktrees (from
 * `.git/worktrees`) and its submodule paths (from `.gitmodules` and `.git/modules`). A path inside a worktree
 * resolves to the main repository. null when the path is not in a git checkout.
 */
export function repoFacts(path) {
  const root = checkoutRootOf(path);
  if (!root) return null;
  const link = checkoutLink(root);
  const main = link?.kind === "worktree" ? link.parentPath : root;
  const gitDir = join(main, ".git");
  if (!isDir(gitDir)) return null;
  const worktrees = new Set();
  const adminDir = join(gitDir, "worktrees");
  for (const name of isDir(adminDir) ? readdirSync(adminDir) : []) {
    worktrees.add(name);
    try {
      const pointer = readFileSync(join(adminDir, name, "gitdir"), "utf8").trim();
      if (pointer) worktrees.add(basename(dirname(resolve(adminDir, name, pointer))));
    } catch {
      // a worktree whose folder is gone keeps only its admin name
    }
  }
  const submodules = new Set();
  try {
    for (const match of readFileSync(join(main, ".gitmodules"), "utf8").matchAll(/^\s*path\s*=\s*(.+?)\s*$/gm)) submodules.add(match[1].replace(/\\/g, "/"));
  } catch {
    // no submodules
  }
  const modulesDir = join(gitDir, "modules");
  for (const name of isDir(modulesDir) ? readdirSync(modulesDir) : []) submodules.add(name);
  return { name: basename(main), path: main, worktrees, submodules };
}

const REASONS = {
  "git-worktree": (fold) => `git worktree of ${fold.into}`,
  "agent-worktree": () => "agent worktree name",
  "hash-suffix": () => "worktree name ending in a short hash",
  included: () => "named with --include",
};
const SKIPS = {
  "parent-missing": (skip) => `the parent key "${skip.key.split("/")[0]}" has no rows`,
  submodule: () => "submodule path; name it with --include to fold it",
  "not-a-worktree-name": () => "not a worktree name; name it with --include to fold it",
  "not-found": () => "named with --include but no rows use this key",
  "no-parent": () => "named with --include but it has no <parent>/ part",
};

/**
 * Which `<parent>/<child>` keys to fold into `<parent>`, with a per-table plan for each. A child qualifies when it is
 * a worktree of a known repository (`repos`: paths on disk), matches `agent-<hex>`, or ends in `-<6 hex>`, and its
 * parent key has rows. Submodule paths and other names fold only when named in `include`. Reads only.
 */
export function planFold(store, { repos = [], include = [] } = {}) {
  const keys = projectCounts(store).map((row) => row.name);
  const present = new Set(keys);
  const known = new Map();
  for (const path of repos) {
    const facts = path ? repoFacts(path) : null;
    if (!facts) continue;
    const entry = known.get(facts.name) ?? { worktrees: new Set(), submodules: new Set() };
    for (const name of facts.worktrees) entry.worktrees.add(name);
    for (const name of facts.submodules) entry.submodules.add(name);
    known.set(facts.name, entry);
  }
  const named = new Set(include.map((key) => String(key).trim()).filter(Boolean));
  const folds = [];
  const skipped = [];
  for (const key of keys) {
    const slash = key.indexOf("/");
    if (slash <= 0 || slash === key.length - 1) continue;
    const into = key.slice(0, slash);
    const child = key.slice(slash + 1);
    const repo = known.get(into);
    let reason = null;
    if (named.has(key)) reason = "included";
    else if (!present.has(into)) reason = "parent-missing";
    else if (child.includes("/") || repo?.submodules.has(child)) reason = "submodule";
    else if (repo?.worktrees.has(child)) reason = "git-worktree";
    else if (AGENT_NAME.test(child)) reason = "agent-worktree";
    else if (HASH_SUFFIX.test(child)) reason = "hash-suffix";
    else reason = "not-a-worktree-name";
    if (REASONS[reason]) folds.push({ ...planProjectMerge(store, key, into), reason });
    else skipped.push({ key, reason });
  }
  for (const key of named) {
    if (!present.has(key)) skipped.push({ key, reason: "not-found" });
    else if (key.indexOf("/") <= 0 || key.endsWith("/")) skipped.push({ key, reason: "no-parent" });
  }
  return { folds, skipped };
}

/** Apply a fold plan: every key in one transaction (one audit entry per key). Returns the counts that were written. */
export function foldWorktrees(store, plan, { actor = "cli" } = {}) {
  const db = store.db;
  db.exec("BEGIN IMMEDIATE");
  try {
    const folds = plan.folds.map((fold) => ({ ...mergeProjects(store, fold.from, fold.into, { actor }), reason: fold.reason }));
    db.exec("COMMIT");
    return { folds, skipped: plan.skipped };
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // already rolled back
    }
    throw error;
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

function tableLines(tables, dryRun) {
  const [move, drop] = dryRun ? ["move", "drop"] : ["moved", "dropped"];
  return Object.entries(tables).map(([table, { moved, dropped }]) => `    ${table}: ${[moved ? `${move} ${moved}` : "", dropped ? `${drop} ${plural(dropped, "duplicate")}` : ""].filter(Boolean).join(", ")}`);
}

/** The text `aletheia projects fold-worktrees` prints, for a plan (dry run) or for what was written. */
export function formatFold({ folds, skipped }, { dryRun = true } = {}) {
  const lines = [];
  const moved = folds.reduce((n, fold) => n + fold.moved, 0);
  const dropped = folds.reduce((n, fold) => n + fold.dropped, 0);
  if (!folds.length) lines.push("No worktree keys to fold.");
  else if (dryRun) lines.push(`${plural(folds.length, "worktree key")} to fold:`);
  else lines.push(`Folded ${folds.length} key(s) into their main project: moved ${plural(moved, "row")}, dropped ${plural(dropped, "duplicate")}.`);
  for (const fold of folds) {
    lines.push(`  ${fold.from} -> ${fold.into}  (${REASONS[fold.reason](fold)})`);
    lines.push(...tableLines(fold.tables, dryRun));
  }
  if (skipped.length) {
    lines.push("Not folded:");
    for (const skip of skipped) lines.push(`  ${skip.key}  ${SKIPS[skip.reason](skip)}`);
  }
  if (dryRun) lines.push(folds.length ? `Dry run: nothing was written. Add --write to fold ${folds.length} key(s).` : "Dry run: nothing was written.");
  return lines.join("\n");
}

/** The text `aletheia projects` prints: one row per key, one column per project-scoped table that has rows. */
export function formatProjects(rows) {
  if (!rows.length) return "No projects yet.";
  const tables = [...new Set(rows.flatMap((row) => Object.keys(row.counts)))];
  const header = ["project", "total", ...tables];
  const body = rows.map((row) => [row.name, String(row.total), ...tables.map((table) => String(row.counts[table] ?? 0))]);
  const widths = header.map((title, i) => Math.max(title.length, ...body.map((cells) => cells[i].length)));
  const line = (cells) => cells.map((cell, i) => (i === 0 ? cell.padEnd(widths[i]) : cell.padStart(widths[i]))).join("  ").trimEnd();
  return [line(header), ...body.map(line)].join("\n");
}
