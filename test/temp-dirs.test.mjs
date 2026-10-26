// T-165: the temp-dir helper registers dirs and removes them, so a test that runs repeatedly never fills the disk.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

describe("temp dir registry", () => {
  test("a registered dir is removed by cleanup", () => {
    const dir = tempDir("aletheia-cleanup-test-");
    const marker = join(dir, "marker");
    const file = Bun.file(marker);
    // Write a marker so the directory is non-empty and the removal must be recursive.
    Bun.spawnSync(["touch", marker]);
    expect(existsSync(dir)).toBe(true);
    cleanupTempDirs();
    expect(existsSync(dir)).toBe(false);
  });

  test("cleanup is idempotent and does not throw on a missing dir", () => {
    const dir = tempDir("aletheia-idempotent-test-");
    cleanupTempDirs();
    cleanupTempDirs();
    expect(existsSync(dir)).toBe(false);
  });
});

afterAll(() => cleanupTempDirs());
