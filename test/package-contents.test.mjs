// The npm tarball carries code and licence files only. Planning, agent folders and the docs tree stay out.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

describe("package contents", () => {
  test("files lists no planning or agent paths", () => {
    for (const entry of pkg.files) {
      expect(entry).not.toMatch(/^(\.claude|\.commandcode|\.codex|\.cursor|AGENTS\.md|site|bench|test)/);
      expect(entry === "docs" || entry === "docs/").toBe(false);
    }
  });

  test("a dry-run pack ships only the allowed paths", () => {
    const r = Bun.spawnSync(["bun", "pm", "pack", "--dry-run"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    const out = r.stdout.toString() + r.stderr.toString();
    const paths = [...out.matchAll(/^packed\s+\S+\s+(\S+)$/gm)].map((m) => m[1]);
    expect(paths.length).toBeGreaterThan(50);
    const allowed = /^(bin|src|prompts|vendor|public|public-hub)\/|^(package\.json|NOTICE\.md|LICENSE|README\.md|CHANGELOG\.md|docs\/dependencies\.md)$/;
    expect(paths.filter((p) => !allowed.test(p))).toEqual([]);
  });

  test(".gitignore keeps agent folders out of git", () => {
    const text = readFileSync(join(root, ".gitignore"), "utf8");
    for (const dir of [".claude/", ".commandcode/"]) expect(text).toContain(dir);
  });
});
