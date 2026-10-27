import { afterAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";

afterAll(cleanupTempDirs);

const SCRIPT = join(import.meta.dir, "..", "scripts", "gen-status.mjs");

function taskFile({ id, title, status, phase = "P4", deps = "none", validated = "", evidence = "", files = [], ticked = 1, total = 2 }) {
  const boxes = Array.from({ length: total }, (_, i) => `- [${i < ticked ? "x" : " "}] criterion ${i + 1}`).join("\n");
  return `# ${id}: ${title}

Status: ${status}
Phase: ${phase}
Depends on: ${deps}
Validated on: ${validated}
Evidence:

## Files to touch

${files.map((f) => `- \`${f}\``).join("\n")}

## Acceptance criteria

${boxes}

## Validation command

\`\`\`bash
echo ${id}
\`\`\`

## Evidence

${evidence}

## Status history

- 2026-01-01: todo
- 2026-01-02: ${status}
`;
}

const row = (t) => `| ${t.id} | ${t.title} | ${t.phase ?? "P4"} | ${t.deps ?? "none"} | ${t.rowStatus ?? t.status} | ${t.validated || "—"} | [${t.id}.md](${t.id}.md) |`;

const TASKS = [
  { id: "T-001", title: "Base", status: "validated", validated: "2026-01-02", evidence: "ok output", files: ["src/a.mjs"] },
  { id: "T-002", title: "Next one", status: "todo", deps: "T-001", phase: "P0", files: ["src/b.mjs"] },
  { id: "T-003", title: "Waits", status: "todo", deps: "T-002" },
  { id: "T-004", title: "No proof", status: "validated", validated: "2026-01-02", evidence: "" },
  { id: "T-005", title: "Drifted", status: "doing", rowStatus: "todo" },
  { id: "T-006", title: "Small", status: "todo", deps: "T-001", files: ["src/c.mjs", "src/d.mjs"] },
];

function fixture({ withGit = true } = {}) {
  const root = tempDir("aletheia-status-");
  const tasks = join(root, "docs", "tasks");
  mkdirSync(tasks, { recursive: true });
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "test"), { recursive: true });
  mkdirSync(join(root, "bin"), { recursive: true });
  writeFileSync(join(root, "src", "a.mjs"), "export const a = 1;\n");
  writeFileSync(join(root, "src", "server.mjs"), 'if (method === "GET" && pathname === "/health") return 1;\n');
  writeFileSync(join(root, "test", "x.test.mjs"), 'test("one", () => {});\ntest("two", () => {});\n');
  writeFileSync(join(root, "bin", "aletheia.mjs"), "#!/usr/bin/env bun\n// aletheia: cli\n//   aletheia search <query>   find things\n//   aletheia doctor   check\nimport 'x';\n");
  writeFileSync(join(tasks, "TASKS.md"), `# Task status\n\n## Tasks\n\n| ID | Title | Phase | Depends on | Status | Validated on (date) | Evidence link |\n|---|---|---|---|---|---|---|\n${TASKS.map(row).join("\n")}\n`);
  for (const t of TASKS) writeFileSync(join(tasks, `${t.id}.md`), taskFile(t));
  writeFileSync(join(tasks, "unverified.md"), "# Unverified\n\n## Product facts\n\n| # | Item | What would verify it |\n|---:|---|---|\n| 1 | Price of X | Read the pricing page |\n");
  writeFileSync(join(tasks, "research-log.md"), "# Log\n\n## A. Sources\n\n| 1 | UNVERIFIED thing |\n");
  writeFileSync(join(root, "docs", "manual-test.md"), "# Manual\n\n## 1. Hosts\n\n**NOT RUN BY AUTHOR** a real Cursor.\n");
  writeFileSync(
    join(root, "docs", "20-claude-mem-feature-matrix.md"),
    `# 20. Matrix\n\n## 20.1 Capture\n\n| ID | Feature | What | Source | Paid or free | Aletheia status | Gap task |\n|---|---|---|---|---|---|---|\n| F-A01 | Hooks | h | s | Free | **parity**. ok | — |\n| F-A02 | Stream | h | s | Free | **partial**. some | T-002 |\n| F-A03 | Wizard | h | s | Free | **missing**. no | T-003, T-006 |\n| F-A04 | Better | h | s | Free | **better**. yes | — |\n`,
  );
  writeFileSync(
    join(root, "docs", "27-free-paid-parity.md"),
    `# 27\n\n## The plan\n\n| Paid feature | Where | Price | Plan | Days | Task |\n|---|---|---|---|---|---|\n| Sync | x | y | z | 1 | T-001 |\n| Team | x | y | z | 1 | T-003 |\n`,
  );
  writeFileSync(join(root, "README.md"), "# Repo\n\nSee [matrix](docs/20-claude-mem-feature-matrix.md) and [broken](docs/nope.md).\n");
  if (withGit) {
    const run = (args, date = "2026-01-02T12:00:00Z") => {
      const r = Bun.spawnSync(["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], {
        cwd: root,
        env: { ...process.env, GIT_COMMITTER_DATE: date, GIT_AUTHOR_DATE: date },
        stdout: "pipe",
        stderr: "pipe",
      });
      expect(r.exitCode).toBe(0);
    };
    run(["init", "-q", "-b", "main"]);
    run(["add", "-A"]);
    run(["commit", "-q", "-m", "first"]);
    writeFileSync(join(root, "src", "a.mjs"), "export const a = 2;\n");
    run(["add", "-A"]);
    run(["commit", "-q", "-m", "later change"], "2026-03-03T12:00:00Z");
  }
  return root;
}

function gen(root, args = []) {
  const r = Bun.spawnSync(["bun", SCRIPT, ...args], { env: { ...process.env, STATUS_ROOT: root, TASKS_DIR: join(root, "docs", "tasks") }, stdout: "pipe", stderr: "pipe" });
  return { code: r.exitCode, out: r.stdout.toString(), err: r.stderr.toString() };
}

// The status dashboard tooling is kept only on the maintainers' machines; these tests are skipped in a fresh clone.
const suite = existsSync(SCRIPT) ? describe : describe.skip;

suite("T-223: gen-status on a fixture repo", () => {
  const root = fixture();
  const first = gen(root);
  const data = () => JSON.parse(readFileSync(join(root, "docs", "status", "status.json"), "utf8"));

  test("writes both files", () => {
    expect(first.code).toBe(0);
    expect(readFileSync(join(root, "docs", "status", "index.html"), "utf8")).toContain("<!doctype html>");
  });

  test("counts statuses and phases from the files", () => {
    const d = data();
    expect(d.taskTotal).toBe(6);
    expect(d.taskCounts).toEqual({ validated: 2, implemented: 0, doing: 1, failed: 0, todo: 3 });
    expect(d.phases.P0.total).toBe(1);
    expect(d.phases.P4.validated).toBe(2);
  });

  test("eligible-next and blocked logic, ranked by what it unblocks", () => {
    const d = data();
    expect(d.next.ranked.map((r) => r.id)).toEqual(["T-002", "T-006"]);
    expect(d.next.ranked[0].unblocksDirect).toBe(1);
    expect(d.next.ranked[0].reason).toContain("unblocks 1 open task");
    expect(d.next.blocked).toEqual([{ id: "T-003", blockedBy: ["T-002"] }]);
    expect(d.tasks.find((t) => t.id === "T-003").blockedBy).toEqual(["T-002"]);
  });

  test("detects a validated task whose files changed after its validation date", () => {
    const d = data();
    expect(d.stale.map((s) => s.id)).toEqual(["T-001"]);
    expect(d.tasks.find((t) => t.id === "T-001").stale[0]).toEqual({ file: "src/a.mjs", lastCommit: "2026-03-03" });
  });

  test("detects table/file mismatches and validated tasks with empty evidence", () => {
    const kinds = data().inconsistencies.map((i) => `${i.id}:${i.kind}`);
    expect(kinds).toContain("T-005:table-vs-file");
    expect(kinds).toContain("T-004:validated-no-evidence");
    expect(kinds).not.toContain("T-001:validated-no-evidence");
  });

  test("acceptance checkboxes and evidence presence are parsed", () => {
    const t = data().tasks.find((x) => x.id === "T-001");
    expect(t.acceptanceTicked).toBe(1);
    expect(t.acceptanceTotal).toBe(2);
    expect(t.evidenceNonEmpty).toBe(true);
    expect(t.validation).toBe("echo T-001");
    expect(t.lastHistory).toContain("validated");
  });

  test("parses both feature tables", () => {
    const f = data().features;
    const sec = f.sources[0].sections[0];
    expect(sec.name).toBe("20.1 Capture");
    expect(sec.counts).toEqual({ done: 2, partial: 1, missing: 1, other: 0 });
    expect(sec.rows[2].tasks).toEqual(["T-003", "T-006"]);
    const s27 = f.sources[1].sections[0].rows;
    expect(s27.map((r) => r.status)).toEqual(["done", "missing"]);
  });

  test("reads unverified items, manual items, test counts, routes, CLI commands and broken links", () => {
    const d = data();
    expect(d.verification.unverifiedCount).toBe(1);
    expect(d.verification.manual).toHaveLength(1);
    expect(d.verification.researchLogUnverified.total).toBe(1);
    expect(d.checks.staticTestFiles).toBe(1);
    expect(d.checks.staticTestCalls).toBe(2);
    expect(d.source.routes).toEqual([{ file: "src/server.mjs", line: 1, method: "GET", path: "/health" }]);
    expect(d.source.cli.map((c) => c.usage)).toEqual(["aletheia search <query>", "aletheia doctor"]);
    expect(d.links.broken.some((b) => b.includes("docs/nope.md"))).toBe(true);
    expect(d.docs.find((x) => x.file === "docs/20-claude-mem-feature-matrix.md").linkedFromReadme).toBe(true);
    expect(d.docs.find((x) => x.file === "docs/manual-test.md").orphan).toBe(true);
    expect(d.git.branch).toBe("main");
  });

  test("the page has no external URLs, no innerHTML and no inline handlers, and its data is valid JSON", () => {
    const html = readFileSync(join(root, "docs", "status", "index.html"), "utf8");
    expect(html).not.toMatch(/(?:src|href)\s*=\s*["']?\s*(?:https?:)?\/\//i);
    expect(html).not.toMatch(/url\(\s*["']?\s*(?:https?:)?\/\//i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML/);
    expect(html).not.toMatch(/\son[a-z]+\s*=\s*["']/i);
    const m = /<script id="status-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html);
    expect(m).not.toBeNull();
    expect(JSON.parse(m[1]).taskTotal).toBe(6);
    expect(m[1]).not.toContain("</script");
  });

  test("--check passes on fresh output, fails on a stale file, passes again after regeneration", () => {
    expect(gen(root, ["--check"]).code).toBe(0);
    const tasks = join(root, "docs", "tasks");
    writeFileSync(join(tasks, "T-006.md"), taskFile({ ...TASKS[5], status: "validated", validated: "2026-01-02", evidence: "now done" }));
    const stale = gen(root, ["--check"]);
    expect(stale.code).toBe(1);
    expect(stale.err).toContain("stale");
    expect(gen(root).code).toBe(0);
    expect(gen(root, ["--check"]).code).toBe(0);
  });

  test("--check fails when the files are missing", () => {
    const empty = fixture({ withGit: false });
    expect(gen(empty, ["--check"]).code).toBe(1);
  });
});

suite("T-223: without git", () => {
  test("git is n/a and stale detection is skipped, not an error", () => {
    const root = fixture({ withGit: false });
    expect(gen(root).code).toBe(0);
    const d = JSON.parse(readFileSync(join(root, "docs", "status", "status.json"), "utf8"));
    expect(d.git).toEqual({ available: false });
    expect(d.commit).toBe("n/a");
    expect(d.stale).toEqual([]);
  });
});
