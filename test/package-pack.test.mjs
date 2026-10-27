// T-080: the npm package is prepared, not published. The tarball contains the runtime files, and the CLI
// reports the package version.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const run = (argv) => Bun.spawn([process.execPath, ...argv], { cwd: root, stdin: "ignore", stdout: "pipe", stderr: "pipe" });

describe("npm package prep", () => {
  test("the pack dry-run contains bin, src, docs and NOTICE", async () => {
    const proc = run(["scripts/release.mjs"]);
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("pack ok");
  });

  test("the CLI reports the package version", async () => {
    const proc = run(["bin/aletheia.mjs", "--version"]);
    const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version);
    expect(stderr).toBe("");
  });

  test("publishConfig is public and files is explicit", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.publishConfig.access).toBe("public");
    expect(pkg.files).toContain("bin");
    expect(pkg.files).toContain("src");
    expect(pkg.files).toContain("docs");
    expect(pkg.files).toContain("NOTICE.md");
  });
});
