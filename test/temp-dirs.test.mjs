// the temp-dir helper registers dirs and removes them, so a test that runs repeatedly never fills the disk.
import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";
import { makeFixture } from "./fixture.mjs";

describe("temp dir registry", () => {
  test("a registered dir is removed by cleanup", () => {
    const dir = tempDir("aletheia-cleanup-test-");
    const marker = join(dir, "marker");
    // Write a marker so the directory is non-empty and the removal must be recursive.
    writeFileSync(marker, "x");
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

  // On Windows a fixture folder can stay locked after its database closes, so this check only applies elsewhere.
  test.skipIf(process.platform === "win32")("a fixture directory is registered and does not survive cleanup", () => {
    const fx = makeFixture();
    expect(existsSync(fx.dir)).toBe(true);
    cleanupTempDirs();
    expect(existsSync(fx.dir)).toBe(false);
  });
});

afterAll(() => cleanupTempDirs());
