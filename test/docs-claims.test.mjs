import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const read = (path) => readFileSync(join(root, path), "utf8");
// Some documents are kept only on the maintainers' machines and are not in the public repository.
// Tests about them run where the file exists and are skipped in a fresh clone.
const whenPresent = (path) => (existsSync(join(root, path)) ? test : test.skip);

describe("docs and claims match what was tested", () => {
  test("the README does not claim unbuilt capture or a real install", () => {
    const text = read("README.md");
    expect(text).toContain("## Which tools it connects to");
    expect(text).not.toContain("## Which tools it works with");
    expect(text).not.toContain("Automatic capture through a tool's hooks | Not built");
    expect(text).toContain("Built for Claude Code, Command Code, Cursor, Codex CLI, Gemini CLI and Windsurf");
    expect(text).toContain("none has been run inside the tool");
    expect(text).toContain("Not tested on a real install");
    expect(text).toContain("install --list");
    expect(text).not.toContain("115 tests");
  });

  test("docs/25 records every new host with a source URL and date", () => {
    const text = read("docs/25-installers.md");
    for (const host of ["Cursor", "Codex CLI", "Gemini CLI", "Windsurf / Devin Desktop", "OpenCode (mcp+rules)", "Claude Desktop (MCP only)"]) {
      expect(text).toContain(`## ${host}`);
    }
    for (const url of [
      "https://cursor.com/docs/agent/hooks",
      "https://developers.openai.com/codex/hooks",
      "gemini-cli/main/docs/hooks/reference.md",
      "https://docs.windsurf.com/windsurf/cascade/hooks",
      "https://opencode.ai/docs/mcp-servers/",
      "https://modelcontextprotocol.io/quickstart/user",
    ]) expect(text).toContain(url);
    expect(text).toContain("2026-10-26");
    expect(text).toContain("No tool was opened with this config in this pass");
  });

  whenPresent("docs/manual-test.md")("the manual test marks every new host as not run", () => {
    const text = read("docs/manual-test.md");
    for (const host of ["Cursor", "Codex CLI", "Gemini CLI", "Windsurf / Devin Desktop", "OpenCode", "Claude Desktop"]) {
      expect(text).toContain(`### ${host} (NOT RUN BY AUTHOR)`);
    }
    expect(text).toContain("Do not treat a pass here");
    expect(text).toContain("as a real-install test");
  });

  whenPresent("docs/20-claude-mem-feature-matrix.md")("the matrix row carries a dated correction", () => {
    const text = read("docs/20-claude-mem-feature-matrix.md");
    expect(text).toContain("F-N01");
    expect(text).toContain("CORRECTED 2026-10-26");
    expect(text).toContain("automatic capture is built for six tools");
    expect(text).toContain("No config has been run inside its tool yet");
  });

  whenPresent("docs/tasks/unverified.md")("the unverified list records the new gaps", () => {
    const text = read("docs/tasks/unverified.md");
    expect(text).toContain("OpenCode plugin event payload fields");
    expect(text).toContain("Full TOML validation");
    expect(text).toContain("Claude Desktop on Linux");
    expect(text).toContain("Real tool read of the rules files");
  });
});
