// Owner-only file modes for the data directory and its files.
// POSIX mode bits do not exist on Windows, so the repair is skipped there with no error: Windows protects
// user files through its own ACLs instead. Every helper follows symlinks (stat/chmod, not lstat), so a data
// directory reached through a symlink is secured at its target.
import { chmodSync, existsSync, statSync } from "node:fs";

export const WINDOWS = process.platform === "win32";

const modeOf = (path) => {
  try {
    return statSync(path).mode & 0o777;
  } catch {
    return null;
  }
};

const oct = (mode) => (mode == null ? null : mode.toString(8).padStart(4, "0"));

/** The mode of a path as an octal string ("0700"), or null when it does not exist or cannot be read. */
export function modeOctal(path) {
  return oct(modeOf(path));
}

function warn(message) {
  console.warn(`aletheia: ${message}`);
}

/** chmod a directory to `mode` when it exists and is looser. Returns a small report, or null when skipped. */
export function ensureDirMode(path, mode = 0o700) {
  if (!path || path === ":memory:" || WINDOWS) return null;
  if (!existsSync(path)) return null;
  const before = modeOf(path);
  if (before == null) return null;
  if (before === mode) return { path, mode: oct(before), changed: false };
  try {
    chmodSync(path, mode);
    warn(`data directory ${path} mode ${oct(before)} -> ${oct(mode)}`);
    return { path, mode: oct(modeOf(path)), changed: true };
  } catch (error) {
    warn(`could not chmod ${path} to ${oct(mode)}: ${error instanceof Error ? error.message : String(error)}`);
    return { path, mode: oct(modeOf(path)), changed: false };
  }
}

/** chmod a file to `mode` when it exists and is looser. Returns a small report, or null when skipped. */
export function ensureFileMode(path, mode = 0o600) {
  if (!path || path === ":memory:" || WINDOWS) return null;
  if (!existsSync(path)) return null;
  const before = modeOf(path);
  if (before == null) return null;
  if (before === mode) return { path, mode: oct(before), changed: false };
  try {
    chmodSync(path, mode);
    warn(`file ${path} mode ${oct(before)} -> ${oct(mode)}`);
    return { path, mode: oct(modeOf(path)), changed: true };
  } catch (error) {
    warn(`could not chmod ${path} to ${oct(mode)}: ${error instanceof Error ? error.message : String(error)}`);
    return { path, mode: oct(modeOf(path)), changed: false };
  }
}

/**
 * Secure a SQLite database and its WAL sidecars. Call this after the WAL pragma but before the first write:
 * SQLite gives `-wal` and `-shm` the main file's mode, so a 0600 main file yields 0600 sidecars.
 */
export function secureDbFiles(dbPath) {
  if (!dbPath || dbPath === ":memory:" || WINDOWS) return [];
  return [dbPath, `${dbPath}-wal`, `${dbPath}-shm`].map((path) => ensureFileMode(path, 0o600)).filter(Boolean);
}
