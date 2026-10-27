// A shared temp-dir registry so a test that creates a directory under the OS temp root also removes it.
// Tests create dirs with tempDir() and call cleanupTempDirs() in afterAll. This fixes the known leak where
// test/migration-v3.test.mjs left a 41 MB /tmp/aletheia-migrate-* directory per run.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dirs = new Set();

export function tempDir(prefix = "aletheia-test-") {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.add(dir);
  return dir;
}

/** Remove every directory registered with tempDir(), and forget them. Idempotent and non-fatal. */
export function cleanupTempDirs() {
  for (const dir of dirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // a best-effort cleanup must never fail the suite
    }
    dirs.delete(dir);
  }
}
