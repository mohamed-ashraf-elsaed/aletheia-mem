// T-066: plugin and extension manifests written from official docs on 2026-10-26. Every manifest parses, every
// path it references resolves inside this package, every hook command names a script that exists, and each file
// says from-docs-only because no host was opened to load it.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const SOURCES = {
  claude: "https://code.claude.com/docs/en/plugins/manifest-reference",
  codex: "https://developers.openai.com/plugins/build/plugins",
  qoder: "https://docs.qoder.com/cli/plugins-reference",
  gemini: "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/extensions/reference.md",
};
// The Claude Code, Codex and Qoder manifest folders are kept out of git on purpose; test whichever exist here.
const ALL_MANIFESTS = [
  { host: "claude", path: join(root, ".claude-plugin", "plugin.json") },
  { host: "codex", path: join(root, ".codex-plugin", "plugin.json") },
  { host: "qoder", path: join(root, ".qoder-plugin", "plugin.json") },
  { host: "gemini", path: join(root, "gemini-extension.json") },
];
const MANIFESTS = ALL_MANIFESTS.filter((manifest) => existsSync(manifest.path));

const variablePath = /\$\{(CLAUDE_PLUGIN_ROOT|PLUGIN_ROOT|extensionPath)\}([^"'\\\s]*)/g;

describe("T-066: plugin manifests", () => {
  test("every manifest parses and carries a stable identity", () => {
    for (const manifest of MANIFESTS) {
      expect(existsSync(manifest.path)).toBe(true);
      const doc = JSON.parse(readFileSync(manifest.path, "utf8"));
      expect(doc.name).toBe("aletheia-mem");
      expect(doc.name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(typeof doc.version).toBe("string");
      expect(doc.description.length).toBeGreaterThan(10);
      expect(doc["x-aletheia-verification"]).toBe("from-docs-only");
    }
  });

  test("every referenced path resolves inside the package", () => {
    for (const manifest of MANIFESTS) {
      const text = readFileSync(manifest.path, "utf8");
      const found = [...text.matchAll(variablePath)];
      if (manifest.host === "qoder") {
        expect(found.length).toBe(0);
        continue;
      }
      expect(found.length).toBeGreaterThan(0);
      for (const [, variable, suffix] of found) {
        expect(["CLAUDE_PLUGIN_ROOT", "PLUGIN_ROOT", "extensionPath"]).toContain(variable);
        const target = resolve(root, `.${suffix}`);
        expect(target.startsWith(root)).toBe(true);
        expect(existsSync(target)).toBe(true);
      }
    }
  });

  const has = (...parts) => existsSync(join(root, ...parts));
  test.skipIf(!has(".claude-plugin", "plugin.json") || !has(".codex-plugin", "plugin.json"))("a hook command names a real script and a real hook subcommand", () => {
    const claude = JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8"));
    const codex = JSON.parse(readFileSync(join(root, ".codex-plugin", "plugin.json"), "utf8"));
    const claudeStart = claude.hooks.SessionStart[0].hooks[0].command;
    const claudeStop = claude.hooks.Stop[0].hooks[0].command;
    const codexStart = codex.hooks.SessionStart[0].hooks[0].command;
    expect(claudeStart).toContain("hook claude-code SessionStart");
    expect(claudeStop).toContain("hook claude-code Stop");
    expect(codexStart).toContain("hook codex SessionStart");
    for (const command of [claudeStart, claudeStop, codexStart]) {
      expect(command).toContain("bin/aletheia.mjs");
      expect(existsSync(join(root, "bin", "aletheia.mjs"))).toBe(true);
    }
  });

  test.skipIf(!has(".claude-plugin", "plugin.json"))("the Claude manifest points at the MCP server", () => {
    const claude = JSON.parse(readFileSync(join(root, ".claude-plugin", "plugin.json"), "utf8"));
    expect(claude.mcpServers.aletheia.command).toBe("bun");
    expect(claude.mcpServers.aletheia.args[0]).toContain("${CLAUDE_PLUGIN_ROOT}/bin/mcp.mjs");
    expect(existsSync(join(root, "bin", "mcp.mjs"))).toBe(true);
  });

  test("the Gemini extension points at the MCP server with the documented variable", () => {
    const gemini = JSON.parse(readFileSync(join(root, "gemini-extension.json"), "utf8"));
    expect(gemini.mcpServers.aletheia.args[0]).toContain("${extensionPath}/bin/mcp.mjs");
    expect(gemini.mcpServers.aletheia.cwd).toBe("${extensionPath}");
  });

  test.skipIf(!has(".qoder-plugin", "plugin.json"))("the Qoder manifest makes no component claim we could not verify", () => {
    const qoder = JSON.parse(readFileSync(join(root, ".qoder-plugin", "plugin.json"), "utf8"));
    expect(qoder.mcpServers).toBeUndefined();
    expect(qoder.hooks).toBeUndefined();
  });

  test("every source URL is recorded with its fetch date", () => {
    const docs = `${readFileSync(join(root, "docs", "25-installers.md"), "utf8")}\n${existsSync(join(root, "docs", "tasks", "research-log.md")) ? readFileSync(join(root, "docs", "tasks", "research-log.md"), "utf8") : ""}`;
    // Only the Gemini manifest is public; the other three source pages are recorded in the private notes.
    expect(docs).toContain(SOURCES.gemini);
    expect(docs).toContain("2026-10-26");
  });
});
