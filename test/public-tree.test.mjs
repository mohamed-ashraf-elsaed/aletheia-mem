// The public repository holds the product only: code, tests, user documentation and licence files.
// Planning, the task system, research, the status dashboard, release and announcement notes, agent instructions and
// agent or session folders stay on the maintainers' machines and must never be tracked.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const root = join(import.meta.dir, "..");

function trackedFiles() {
  try {
    const result = Bun.spawnSync(["git", "ls-files", "-z"], { cwd: root, stdout: "pipe", stderr: "pipe" });
    if (result.exitCode !== 0) return null;
    return new TextDecoder().decode(result.stdout).split("\0").filter(Boolean);
  } catch {
    return null;
  }
}

const files = trackedFiles();

export const PRIVATE_PATTERNS = [
  /^AGENTS\.md$/,
  /^docs\/tasks\//,
  /^docs\/status\//,
  /^docs\/research\//,
  /^docs\/submissions\//,
  /^docs\/(announcement|releasing|distribution|install-check|_re-notes|a11y-walk-requests|manual-test|ui-design|ui-study)\.md$/,
  /^docs\/(0[4589]|1[0-8]|2[0-4]|2[678])-/,
  /(^|\/)\.(claude|commandcode|codex|cursor|qoder|windsurf|gemini|opencode|continue|cline|roo|kiro)\//,
  /^scripts\/(check-tasks|gen-status|run-report)\.mjs$/,
  /^scripts\/status-page\.(css|js)$/,
];

describe("the public tree", () => {
  test.skipIf(!files)("git tracks none of the private planning, task or agent paths", () => {
    const offenders = files.filter((path) => PRIVATE_PATTERNS.some((pattern) => pattern.test(path)));
    expect(offenders).toEqual([]);
  });

  test.skipIf(!files)("the Claude Code, Codex and Qoder plugin folders are not tracked", () => {
    expect(files.filter((name) => /^\.(claude|codex|qoder)-plugin\//.test(name))).toEqual([]);
  });

  test("every relative link in README.md resolves to a tracked file", () => {
    const readme = readFileSync(join(root, "README.md"), "utf8");
    const targets = new Set();
    for (const match of readme.replace(/`[^`]*`/g, "").matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) targets.add(match[1]);
    for (const match of readme.matchAll(/\b(?:href|src)="([^"]+)"/g)) targets.add(match[1]);
    const tracked = files ? new Set(files) : null;
    const missing = [];
    for (const raw of targets) {
      const target = raw.replace(/^<|>$/g, "");
      if (/^(https?:|mailto:|tel:|data:|\/\/|#)/i.test(target)) continue;
      const path = target.split("#")[0].split("?")[0];
      if (!path || path.startsWith("/")) continue;
      const rel = relative(root, resolve(dirname(join(root, "README.md")), decodeURIComponent(path))).split("\\").join("/");
      const isDir = path.endsWith("/");
      const ok = tracked
        ? tracked.has(rel) || (isDir && [...tracked].some((name) => name.startsWith(`${rel}/`)))
        : existsSync(join(root, rel));
      if (!ok) missing.push(target);
    }
    expect(missing).toEqual([]);
  });
});
