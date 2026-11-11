// Local snapshots of hub.db. `VACUUM INTO` runs inside one read transaction, so a snapshot is consistent while
// other connections write, and it needs no WAL sidecars. Snapshots live in <dataDir>/backups (dir 0700, files 0600).
// Names sort by time (hub-YYYYMMDDTHHMMSSmmmZ.db), so retention uses the name, never the file mtime.
import { Database } from "bun:sqlite";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { readSettings } from "./settings.mjs";
import { targetSchemaVersion } from "./store.mjs";

const POSIX = process.platform !== "win32";
const NAME = /^hub-\d{8}T\d{9}Z\.db$/;
const HOUR = 60 * 60 * 1000;

export const backupDir = (dataDir) => join(dataDir, "backups");

function snapshotName(now) {
  return `hub-${now.toISOString().replace(/[-:]/g, "").replace(".", "").replace(/Z$/, "Z")}.db`;
}

function secure(path, mode) {
  if (!POSIX) return;
  try { chmodSync(path, mode); } catch { /* best effort; the doctor reports loose modes */ }
}

/** Write one snapshot of the open store, then prune. Returns {path, bytes, pruned}. */
/** Run one statement and finalize it: bun:sqlite defers close() while a statement is open, and Windows then refuses to
 * rename or remove the file. */
const one = (db, sql, ...args) => {
  const statement = db.prepare(sql);
  try { return statement.get(...args); } finally { statement.finalize(); }
};

export function runBackup(store, { dataDir, keep = 7, now = new Date() } = {}) {
  const dir = backupDir(dataDir);
  mkdirSync(dir, { recursive: true });
  secure(dir, 0o700);
  let name = snapshotName(now);
  // Two runs in the same millisecond would collide; step forward until the name is free.
  for (let t = now.getTime(); existsSync(join(dir, name)); t += 1) name = snapshotName(new Date(t + 1));
  const final = join(dir, name);
  const partial = join(dir, `.partial-${name}`);
  rmSync(partial, { force: true });
  store.db.exec("PRAGMA busy_timeout = 10000");
  try {
    { const vacuum = store.db.prepare("VACUUM INTO ?"); try { vacuum.run(partial); } finally { vacuum.finalize(); } }
    secure(partial, 0o600);
    const check = new Database(partial, { readonly: true });
    try {
      const result = one(check, "PRAGMA integrity_check").integrity_check;
      if (result !== "ok") throw new Error(`Snapshot failed integrity_check: ${result}`);
    } finally {
      check.close();
    }
    renameSync(partial, final);
  } catch (error) {
    rmSync(partial, { force: true });
    throw error;
  }
  secure(final, 0o600);
  const pruned = pruneBackups(dataDir, keep);
  return { path: final, bytes: statSync(final).size, pruned: pruned.removed };
}

/** Snapshots, newest first. */
export function listBackups(dataDir) {
  const dir = backupDir(dataDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => NAME.test(name))
    .sort()
    .reverse()
    .map((name) => {
      const path = join(dir, name);
      const info = statSync(path);
      const stamp = /^hub-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})Z\.db$/.exec(name);
      const at = new Date(Date.UTC(+stamp[1], +stamp[2] - 1, +stamp[3], +stamp[4], +stamp[5], +stamp[6], +stamp[7]));
      return { name, path, bytes: info.size, at: at.toISOString(), atEpoch: at.getTime() };
    });
}

/** Keep the newest `keep` snapshots (at least one). Other files in the folder are never touched. */
export function pruneBackups(dataDir, keep = 7) {
  const limit = Math.max(1, Math.floor(Number(keep)) || 1);
  const all = listBackups(dataDir);
  const removed = [];
  for (const item of all.slice(limit)) {
    rmSync(item.path, { force: true });
    removed.push(item.path);
  }
  return { kept: all.slice(0, limit).map((item) => item.path), removed };
}

function backupSettings(store) {
  const get = (key) => readSettings(store).find((item) => item.key === key)?.value;
  return { enabled: get("backup.enabled") === true, intervalHours: get("backup.intervalHours"), keep: get("backup.keep") };
}

export function backupStatus(store, { dataDir, now = new Date() } = {}) {
  const config = backupSettings(store);
  const items = listBackups(dataDir);
  const newest = items[0] ?? null;
  const dueAt = config.enabled ? (newest ? new Date(newest.atEpoch + config.intervalHours * HOUR) : now) : null;
  return {
    ...config,
    dir: backupDir(dataDir),
    count: items.length,
    newest: newest ? { path: newest.path, at: newest.at, bytes: newest.bytes } : null,
    nextDue: dueAt ? dueAt.toISOString() : null,
  };
}

/** Called by the server on a timer. Runs a backup when enabled and the newest snapshot is older than the interval. */
export function backupTick(store, { dataDir, now = new Date() } = {}) {
  const config = backupSettings(store);
  if (!config.enabled) return null;
  const newest = listBackups(dataDir)[0];
  if (newest && now.getTime() - newest.atEpoch < config.intervalHours * HOUR) return null;
  return runBackup(store, { dataDir, keep: config.keep, now });
}

async function serverRunning(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(400) });
    return response.ok;
  } catch {
    return false;
  }
}

function inspectSnapshot(path) {
  let db;
  try {
    db = new Database(path, { readonly: true });
    const integrity = one(db, "PRAGMA integrity_check").integrity_check;
    if (integrity !== "ok") throw new Error(`integrity_check says: ${integrity}`);
    if (!one(db, "SELECT 1 FROM sqlite_master WHERE name = 'memories'")) throw new Error("no memories table");
    const version = one(db, "PRAGMA user_version").user_version;
    if (version > targetSchemaVersion) throw new RangeError(`This snapshot is schema v${version}; this build understands up to v${targetSchemaVersion}.`);
    return version;
  } catch (error) {
    if (error instanceof RangeError) throw error;
    throw new Error(`${path} is not a usable Aletheia database: ${error.message}`);
  } finally {
    db?.close();
  }
}

/**
 * Replace hub.db with a snapshot. Refuses while the server answers on `port`. The current file is copied to
 * hub.db.pre-restore-<time> first. Processes that open hub.db directly (stdio MCP servers, hooks) never answer /healthz,
 * so the live file is also checkpointed and locked exclusively; any holder makes restore refuse.
 */
export async function restoreBackup(file, { dataDir, dbPath, port, now = new Date() } = {}) {
  if (await serverRunning(port)) throw new Error(`The server is running on port ${port}. Stop it before restoring (it holds hub.db open).`);
  let source = isAbsolute(file) || /[\\/]/.test(file) ? resolve(file) : join(backupDir(dataDir), file);
  if (!existsSync(source) && !/[\\/]/.test(file) && existsSync(resolve(file))) source = resolve(file);
  if (!existsSync(source)) throw new Error(`Snapshot not found: ${source}`);
  inspectSnapshot(source);

  const HOLDERS = "Close the AI tools that use Aletheia (Claude Code, Codex, Cursor and other hosts run its MCP server) and stop aletheia-server, then try again.";
  const busy = (error) => /locked|busy/i.test(String(error?.message ?? error));
  let safetyCopy = null;
  let live = null;
  if (existsSync(dbPath)) {
    try {
      live = new Database(dbPath);
      live.exec("PRAGMA busy_timeout = 0");
      // Fold the WAL into hub.db and empty it. A reader or writer in another process makes this report busy.
      const checkpoint = one(live, "PRAGMA wal_checkpoint(TRUNCATE)");
      if (checkpoint && checkpoint.busy) throw new Error("database is busy");
      live.exec("BEGIN EXCLUSIVE");
    } catch (error) {
      try { live?.close(); } catch { /* already closed */ }
      live = null;
      // A store that cannot be opened at all (damaged) is what restore is for; only a lock stops it.
      if (busy(error)) throw new Error(`hub.db is in use by another process. ${HOLDERS}`);
    }
    safetyCopy = `${dbPath}.pre-restore-${now.toISOString().replace(/[:.]/g, "-")}`;
    copyFileSync(dbPath, safetyCopy);
    secure(safetyCopy, 0o600);
    // A copied WAL-mode file needs a -shm beside it to open read-only, which macOS refuses to create; switch the copy
    // to rollback journal mode so it opens anywhere.
    const copy = new Database(safetyCopy);
    try { copy.exec("PRAGMA journal_mode = DELETE"); } finally { copy.close(); }
  }

  mkdirSync(dirname(dbPath), { recursive: true });
  const staged = `${dbPath}.restoring`;
  try {
    copyFileSync(source, staged);
    secure(staged, 0o600);
  } catch (error) {
    try { live?.close(); } catch { /* already closed */ }
    rmSync(staged, { force: true });
    throw error;
  }
  // Hold the lock until here, then release it and swap at once.
  try { live?.close(); } catch { /* already closed */ }
  for (const suffix of ["-wal", "-shm"]) rmSync(`${dbPath}${suffix}`, { force: true });
  renameSync(staged, dbPath);
  secure(dbPath, 0o600);
  return { restoredFrom: source, safetyCopy, dbPath, snapshot: basename(source) };
}
