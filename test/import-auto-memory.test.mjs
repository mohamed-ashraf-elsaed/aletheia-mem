// `aletheia import claude-memory`: Claude Code's own auto-memory files (~/.claude/projects/<project>/memory/*.md).
// Layout and frontmatter from https://code.claude.com/docs/en/memory (fetched 2026-11-11). The source is read-only.
import { afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HubStore } from "../src/hub/store.mjs";
import { importClaudeMemory } from "../src/hub/importers.mjs";
import { removeDir } from "./temp-dirs.mjs";

const root = join(import.meta.dir, "..");
const temp = mkdtempSync(join(tmpdir(), "aletheia-automem-"));
const home = join(temp, "home");
const repo = join(temp, "shop");
mkdirSync(repo, { recursive: true });
const encoded = repo.replace(/[/\\]/g, "-");
const memDir = join(home, ".claude", "projects", encoded, "memory");
mkdirSync(memDir, { recursive: true });

const files = {
  "MEMORY.md": "- [Testing](feedback_testing.md) - run bun test first\n",
  "feedback_testing.md": "---\nname: testing\ndescription: how to test\ntype: feedback\nmodified: 2026-10-01T10:00:00.000Z\n---\nAlways run the narrow test first.\n\n<private>my home address is 12 Elm St</private>\nKeep the key sk-ant-api03-abcdefghijklmnopqrstuvwx out of notes.\n",
  "project_launch.md": "---\ntype: project\n---\n## Deadline\nShip on Friday.\n\n## Owner\nAmira owns the release.\n",
};
for (const [name, body] of Object.entries(files)) {
  const file = join(memDir, name);
  writeFileSync(file, body);
  utimesSync(file, new Date("2026-09-01T00:00:00Z"), new Date("2026-09-01T00:00:00Z"));
}
// A project folder that cannot be mapped to a real directory.
const orphanDir = join(home, ".claude", "projects", "-nowhere-gone-zzq", "memory");
mkdirSync(orphanDir, { recursive: true });
writeFileSync(join(orphanDir, "note.md"), "---\ntype: user\n---\nPrefers short answers.\n");

const snapshot = () =>
  Object.fromEntries(Object.keys(files).map((name) => {
    const file = join(memDir, name);
    return [name, `${createHash("sha256").update(readFileSync(file)).digest("hex")}:${statSync(file).mtimeMs}`];
  }));
const rows = (store) => store.db.prepare("SELECT * FROM memories").all();

afterAll(() => removeDir(temp));

describe("import claude-memory", () => {
  test("imports once, then adds 0 rows on a re-run", () => {
    const store = new HubStore(join(temp, "a.db"));
    const first = importClaudeMemory(store, { home });
    expect(first.added).toBe(3); // one single-section file and one two-section file; the index and the unmapped folder add none
    expect(first.unmapped).toEqual(["-nowhere-gone-zzq"]);
    const second = importClaudeMemory(store, { home });
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(first.added);
    expect(rows(store).every((r) => r.project === "shop")).toBe(true);
    store.close?.();
  });

  test("--project maps a folder that cannot be mapped", () => {
    const store = new HubStore(join(temp, "p.db"));
    const result = importClaudeMemory(store, { home, project: "legacy" });
    expect(result.unmapped).toEqual([]);
    expect(rows(store).some((r) => r.project === "legacy")).toBe(true);
    store.close?.();
  });

  test("source files are not changed (hash and mtime)", () => {
    const before = snapshot();
    const store = new HubStore(join(temp, "s.db"));
    importClaudeMemory(store, { home });
    expect(snapshot()).toEqual(before);
    store.close?.();
  });

  test("secrets are redacted and <private> blocks are dropped", () => {
    const store = new HubStore(join(temp, "r.db"));
    importClaudeMemory(store, { home });
    const all = JSON.stringify(rows(store));
    expect(all).not.toContain("sk-ant-api03");
    expect(all).not.toContain("12 Elm St");
    expect(all).toContain("narrow test");
    store.close?.();
  });

  test("a dry run writes nothing", () => {
    const store = new HubStore(join(temp, "d.db"));
    const result = importClaudeMemory(store, { home, dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.added).toBe(3);
    expect(rows(store).length).toBe(0);
    store.close?.();
  });

  test("--path accepts one memory folder", () => {
    const store = new HubStore(join(temp, "o.db"));
    const result = importClaudeMemory(store, { path: memDir, home: join(temp, "empty-home") });
    expect(result.added).toBe(3);
    store.close?.();
  });

  test("the CLI prints the dry run and writes nothing", () => {
    const run = Bun.spawnSync(["bun", join(root, "bin", "aletheia.mjs"), "import", "claude-memory", "--dry-run", "--path", join(home, ".claude", "projects")], {
      env: { ...process.env, HOME: home, ALETHEIA_DATA_DIR: join(temp, "cli-hub") }, cwd: root,
    });
    expect(run.exitCode).toBe(0);
    expect(run.stdout.toString()).toMatch(/Would import 3 /);
  });
});
