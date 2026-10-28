// A shared temp-dir registry so a test that creates a directory under the OS temp root also removes it.
// Tests create dirs with tempDir() and call cleanupTempDirs() in afterAll. This fixes the known leak where
// test/migration-v3.test.mjs left a 41 MB /tmp/aletheia-migrate-* directory per run.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs = new Set();

/**
 * Remove a directory tree. On Windows a SQLite file that was just closed can stay locked for a moment, so removal
 * retries on EBUSY, EPERM and ENOTEMPTY and, if the lock outlasts the retries, gives up quietly: a temp folder left
 * behind must not fail a test. On other systems every error is thrown, as with rmSync.
 */
export function removeDir(dir, options = { recursive: true, force: true }) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      rmSync(dir, options);
      return;
    } catch (error) {
      const transient = process.platform === "win32" && ["EBUSY", "EPERM", "ENOTEMPTY"].includes(error?.code);
      if (!transient) throw error;
      if (attempt >= 20) return;
      Bun.sleepSync(100);
    }
  }
}

export function tempDir(prefix = "aletheia-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.add(dir);
  return dir;
}

/** Remove every directory registered with tempDir(), and forget them. Idempotent and non-fatal. */
export function cleanupTempDirs() {
  for (const dir of dirs) {
    try {
      removeDir(dir);
    } catch {
      // a best-effort cleanup must never fail the suite
    }
    dirs.delete(dir);
  }
}
