// T-084: the community files exist, the issue forms name their required fields, and the CoC names a contact.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path) => readFileSync(join(root, path), "utf8");

const files = [
  ".github/ISSUE_TEMPLATE/bug_report.yml",
  ".github/ISSUE_TEMPLATE/feature_request.yml",
  ".github/ISSUE_TEMPLATE/new_host.yml",
  ".github/pull_request_template.md",
  "CODE_OF_CONDUCT.md",
  "SECURITY.md",
];

describe("community files", () => {
  test("every file exists and is non-empty", () => {
    for (const file of files) {
      expect(existsSync(join(root, file))).toBe(true);
      expect(read(file).trim().length).toBeGreaterThan(50);
    }
  });

  test("the issue forms have the GitHub form keys", () => {
    for (const file of [".github/ISSUE_TEMPLATE/bug_report.yml", ".github/ISSUE_TEMPLATE/feature_request.yml", ".github/ISSUE_TEMPLATE/new_host.yml"]) {
      const text = read(file);
      for (const key of ["name:", "description:", "body:", "type:", "attributes:"]) expect(text).toContain(key);
    }
    const bug = read(".github/ISSUE_TEMPLATE/bug_report.yml");
    expect(bug).toContain("Tool and version");
    expect(bug).toContain("Minimal reproduction");
    expect(bug).toContain("required: true");
    const host = read(".github/ISSUE_TEMPLATE/new_host.yml");
    expect(host).toContain("Official hook payload documentation URL");
  });

  test("the PR template carries the AGENTS.md validation checklist", () => {
    const text = read(".github/pull_request_template.md");
    for (const command of ["bun test", "bun scripts/check-tasks.mjs", "bun scripts/gen-tables.mjs --check", "bun scripts/check-docs-links.mjs"]) {
      expect(text).toContain(command);
    }
    expect(text).toContain("real install");
  });

  test("the Code of Conduct names a contact and its source", () => {
    const text = read("CODE_OF_CONDUCT.md");
    expect(text).toContain("github.com/mohamed-ashraf-elsaed");
    expect(text).toContain("Contributor Covenant");
    expect(text).toContain("2.1");
  });

  test("SECURITY.md names the private reporting channel", () => {
    const text = read("SECURITY.md");
    expect(text).toContain("private vulnerability reporting");
    expect(text).toContain("No email address is published");
  });
});
