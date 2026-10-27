// T-085: the changelog is real, Dependabot covers Actions only, and no funding or release is claimed.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path) => readFileSync(join(root, path), "utf8");

describe("release files", () => {
  test("the changelog follows Keep a Changelog and says 0.1.0 is not released", () => {
    const text = read("CHANGELOG.md");
    expect(text).toContain("# Changelog");
    expect(text).toContain("Keep a Changelog");
    expect(text).toContain("## [Unreleased]");
    expect(text).toContain("## [0.1.0] — not released (2026-10-26)");
    expect(text).toContain("Not tagged and not published");
    expect(text).toContain("### Added");
    expect(text).toContain("### Known limits");
  });

  test("Dependabot updates GitHub Actions only", () => {
    const text = read(".github/dependabot.yml");
    expect(text).toContain('package-ecosystem: "github-actions"');
    expect(text).not.toContain('package-ecosystem: "npm"');
    expect(text).toContain('interval: "weekly"');
  });

  test("FUNDING is absent because the owner has not chosen a destination", () => {
    expect(existsSync(join(root, ".github", "FUNDING.yml"))).toBe(false);
  });

  test("CI runs the suite, the task check and the table drift check on Linux", () => {
    const text = read(".github/workflows/ci.yml");
    expect(text).toContain("runs-on: ubuntu-latest");
    expect(text).toContain("bun test");
    expect(text).toContain("bun scripts/check-tasks.mjs");
    expect(text).toContain("bun scripts/gen-tables.mjs --check");
    expect(text).toContain("bun scripts/check-docs-links.mjs");
    expect(text).not.toContain("npm publish");
    expect(text).not.toContain("softprops/action-gh-release");
  });

  test("the only release workflow is the tag-triggered release.yml (T-225)", () => {
    expect(existsSync(join(root, ".github", "workflows", "release.yml"))).toBe(true);
    expect(existsSync(join(root, ".github", "workflows", "npm-publish.yml"))).toBe(false);
  });
});
