// T-012: the dependency audit passes with zero required dependencies and fails when one is added.
import { afterAll, describe, expect, test } from "bun:test";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

const root = join(import.meta.dir, "..");

const run = (env = {}) => Bun.spawn([process.execPath, join(root, "scripts", "audit-deps.mjs")], {
  stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env: { ...process.env, ...env },
});

afterAll(() => cleanupTempDirs());

describe("dependency audit", () => {
  test("zero required dependencies passes and names the vendored licences", async () => {
    const proc = run();
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("0 required");
    expect(stdout).toContain("Apache-2.0");
  });

  test("a required dependency fails unless allowlisted", async () => {
    const dir = tempDir("aletheia-deps-");
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "probe", version: "0.0.0", dependencies: { "left-pad": "1.0.0" } }));
    const proc = run({ DEPS_ROOT: dir });
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("not allowlisted");
    expect(stdout).toBe("");
  });
});
