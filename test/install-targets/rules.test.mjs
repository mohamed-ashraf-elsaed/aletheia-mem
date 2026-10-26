import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { syncTool, targetPath } from "../../src/hub/rules-sync.mjs";
import { TOOLS, toolById } from "../../src/hub/tools.mjs";
import { makeFixture } from "../fixture.mjs";

const root = join(import.meta.dir, "../..");
const rules = [
  { id: "1", enabled: true, scopeTier: "everywhere", scopeName: "Everywhere", when: "", then: "Run the tests first", tools: null },
  { id: "2", enabled: true, scopeTier: "project", scopeName: "shop", when: "editing checkout", then: "Keep PRs small", tools: null },
];

const homeFor = () => makeFixture().makeDir("home");
const projectFor = () => makeFixture().makeDir("proj");

describe("T-070: rules targets match the documented format", () => {
  test("every target records a verification key and source key", () => {
    for (const tool of TOOLS) {
      expect(tool.rules).toHaveProperty("verifiedOn");
      expect(tool.rules).toHaveProperty("source");
      expect(tool.rules.project.length).toBeGreaterThan(0);
    }
  });

  test("the dated table covers every target", () => {
    const text = readFileSync(join(root, "docs/verification/rules-targets.md"), "utf8");
    for (const tool of TOOLS) expect(text).toContain(`\`${tool.id}\``);
    expect(text).toContain("2026-10-26");
    expect(text).toContain("https://cursor.com/docs/context/rules");
    expect(text).toContain("https://developers.openai.com/codex/agent-configuration/agents-md");
  });

  test("Cursor writes a whole .mdc with valid frontmatter and managed markers", () => {
    const projectDir = projectFor();
    const home = homeFor();
    const result = syncTool(rules, "cursor", { scope: "project", projectDir, home, dryRun: false });
    expect(result.path).toBe(join(projectDir, ".cursor/rules/aletheia.mdc"));
    const text = readFileSync(result.path, "utf8");
    expect(text).toMatch(/^---\ndescription: .+\nalwaysApply: true\n---\n\n<!-- aletheia:rules:begin -->/);
    expect(text).toContain("Run the tests first");
    expect(syncTool(rules, "cursor", { scope: "project", projectDir, home, dryRun: false }).changed).toBe(false);
  });

  test("Windsurf writes the current workspace rule path with trigger: always_on", () => {
    const projectDir = projectFor();
    const home = homeFor();
    const result = syncTool(rules, "windsurf", { scope: "project", projectDir, home, dryRun: false });
    expect(result.path).toBe(join(projectDir, ".windsurf/rules/aletheia.md"));
    const text = readFileSync(result.path, "utf8");
    expect(text).toMatch(/^---\ntrigger: always_on\n---\n\n<!-- aletheia:rules:begin -->/);
    expect(text).toContain("keep PRs small");
    expect(syncTool(rules, "windsurf", { scope: "project", projectDir, home, dryRun: false }).changed).toBe(false);
  });

  test("block tools preserve user text outside the markers", () => {
    const projectDir = projectFor();
    const home = homeFor();
    writeFileSync(join(projectDir, "CLAUDE.md"), "# Mine\n\nHand-written.\n");
    const first = syncTool(rules, "claude-code", { scope: "project", projectDir, home, dryRun: false });
    const text = readFileSync(first.path, "utf8");
    expect(text.startsWith("# Mine\n\nHand-written.\n")).toBe(true);
    expect(text).toContain("Run the tests first");
    const second = syncTool(rules, "claude-code", { scope: "project", projectDir, home, dryRun: false });
    expect(second.changed).toBe(false);
    expect(readFileSync(first.path, "utf8")).toBe(text);
  });

  test("the verified global paths resolve and write", () => {
    const home = homeFor();
    const codex = syncTool(rules, "codex", { scope: "global", home, dryRun: false });
    expect(codex.path).toBe(join(home, ".codex/AGENTS.md"));
    expect(readFileSync(codex.path, "utf8")).toContain("aletheia:rules:begin");
    const gemini = syncTool(rules, "gemini-cli", { scope: "global", home, dryRun: false });
    expect(gemini.path).toBe(join(home, ".gemini/GEMINI.md"));
    const windsurf = syncTool(rules, "windsurf", { scope: "global", home, dryRun: false });
    expect(windsurf.path).toBe(join(home, ".codeium/windsurf/memories/global_rules.md"));
    const opencode = syncTool(rules, "opencode", { scope: "global", home, dryRun: false });
    expect(opencode.path).toBe(join(home, ".config/opencode/AGENTS.md"));
    expect(syncTool(rules, "cursor", { scope: "global", home, dryRun: true }).skipped).toMatch(/no global rules file/);
  });

  test("targetPath agrees with syncTool for every target", () => {
    const projectDir = projectFor();
    const home = homeFor();
    for (const tool of TOOLS) {
      const p = targetPath(tool.id, { scope: "project", projectDir, home });
      expect(p).toBe(join(projectDir, tool.rules.project));
      if (tool.rules.global) {
        expect(targetPath(tool.id, { scope: "global", home })).toBe(join(home, tool.rules.global));
      } else {
        expect(targetPath(tool.id, { scope: "global", home })).toBe(null);
      }
    }
    expect(toolById("windsurf").rules.verifiedOn).toBe("2026-10-26");
    expect(existsSync(join(projectDir, ".windsurf/rules/aletheia.md"))).toBe(false);
  });
});
