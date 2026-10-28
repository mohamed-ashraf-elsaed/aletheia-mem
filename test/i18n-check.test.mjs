// a translation records the English hash, and the check fails when the English README moves.
import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { check, hashSource, parseHash } from "../scripts/i18n-check.mjs";

const dirs = [];
afterAll(() => {
  for (const dir of dirs) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

function makeRoot(readme = "# Title\n\nSome prose.\n\n```bash\necho hi\n```\n") {
  const root = mkdtempSync(join(tmpdir(), "aletheia-i18n-"));
  dirs.push(root);
  mkdirSync(join(root, "docs", "i18n"), { recursive: true });
  writeFileSync(join(root, "README.md"), readme);
  const hash = hashSource(readme);
  writeFileSync(join(root, "docs", "i18n", "README.xx.md"), `> Machine-translated from the English README on 2026-10-26. Review welcome.\n> Source: [README.md](../../README.md) · source-sha256: ${hash}\n\n# Titolo\n\nTesto.\n`);
  writeFileSync(join(root, "docs", "i18n", ".translation-state.json"), JSON.stringify({ version: 1, source: "README.md", languages: { xx: { sourceHash: hash, translatedAt: "2026-10-26" } } }, null, 2));
  return root;
}

describe("i18n-check", () => {
  test("a fresh set is current", () => {
    const root = makeRoot();
    const result = check({ root });
    expect(result.ok).toBe(true);
    expect(result.count).toBe(1);
    expect(result.stale).toEqual([]);
  });

  test("changing prose makes the translation stale", () => {
    const root = makeRoot();
    writeFileSync(join(root, "README.md"), "# Title\n\nChanged prose.\n");
    const result = check({ root });
    expect(result.ok).toBe(false);
    expect(result.stale).toEqual(["xx"]);
    expect(check({ root, warn: true }).ok).toBe(true);
  });

  test("changing only a code block does not move the hash", () => {
    const root = makeRoot();
    const before = hashSource(readFileSync(join(root, "README.md"), "utf8"));
    writeFileSync(join(root, "README.md"), "# Title\n\nSome prose.\n\n```bash\necho different\n```\n");
    expect(hashSource(readFileSync(join(root, "README.md"), "utf8"))).toBe(before);
    expect(check({ root }).ok).toBe(true);
  });

  test("--update records the new hash in the file and the state", () => {
    const root = makeRoot();
    writeFileSync(join(root, "README.md"), "# Title\n\nChanged prose.\n");
    const updated = check({ root, update: true, date: "2026-10-27" });
    expect(updated.ok).toBe(true);
    const current = hashSource(readFileSync(join(root, "README.md"), "utf8"));
    const file = readFileSync(join(root, "docs", "i18n", "README.xx.md"), "utf8");
    expect(parseHash(file)).toBe(current);
    const state = JSON.parse(readFileSync(join(root, "docs", "i18n", ".translation-state.json"), "utf8"));
    expect(state.languages.xx.sourceHash).toBe(current);
    expect(state.languages.xx.translatedAt).toBe("2026-10-27");
    expect(check({ root }).ok).toBe(true);
  });

  test("--update syncs a state entry whose header already matches", () => {
    const root = makeRoot();
    const current = hashSource(readFileSync(join(root, "README.md"), "utf8"));
    const statePath = join(root, "docs", "i18n", ".translation-state.json");
    const state = JSON.parse(readFileSync(statePath, "utf8"));
    state.languages.xx.sourceHash = "0".repeat(64);
    writeFileSync(statePath, JSON.stringify(state, null, 2));
    expect(check({ root }).ok).toBe(false);
    expect(check({ root, update: true }).ok).toBe(true);
    expect(JSON.parse(readFileSync(statePath, "utf8")).languages.xx.sourceHash).toBe(current);
  });

  test("a translation without a source hash is an error", () => {
    const root = makeRoot();
    writeFileSync(join(root, "docs", "i18n", "README.xx.md"), "# No header\n");
    const result = check({ root });
    expect(result.ok).toBe(false);
    expect(result.problems.join("\n")).toContain("no source-sha256 line");
  });

  test("the CLI prints the same verdict", async () => {
    const root = makeRoot();
    const proc = Bun.spawn([process.execPath, "scripts/i18n-check.mjs"], { cwd: join(import.meta.dir, ".."), env: { ...process.env, I18N_ROOT: root }, stdout: "pipe", stderr: "pipe" });
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
    expect(code).toBe(0);
    expect(stdout).toContain("i18n ok: 1 languages current");
  });
});
