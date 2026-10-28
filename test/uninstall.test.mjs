import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyInstall, applyUninstall, doctor, formatInstallerList, listInstallers, planUninstall, stripOurHooks } from "../src/hub/install.mjs";
import { installerFor } from "../src/hub/install.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");

function setup() {
  const fx = makeFixture();
  const home = fx.makeDir("home");
  const dataDir = fx.makeDir("data");
  const env = {
    home,
    bun: "/usr/local/bin/bun",
    hookScript: join(root, "bin/aletheia.mjs"),
    hookRunner: join(dataDir, "aletheia.bundle.mjs"),
    mcpScript: join(root, "bin/mcp.mjs"),
    dataDir,
    dbPath: join(dataDir, "hub.db"),
    port: 1,
    rules: [],
  };
  return { fx, home, dataDir, env };
}

function tree(dir) {
  const out = [];
  const walk = (path, rel = "") => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.name.includes(".aletheia-bak-")) continue;
      const next = join(rel, entry.name);
      if (entry.isDirectory()) walk(join(path, entry.name), next);
      else out.push([next, readFileSync(join(path, entry.name), "utf8")]);
    }
  };
  walk(dir);
  return out.sort(([a], [b]) => a.localeCompare(b));
}

describe("every installer has one generic uninstall and doctor path", () => {
  test("install --list names the capability and verification for every installer", () => {
    const { home } = setup();
    const rows = listInstallers({ home });
    for (const id of ["claude-code", "command-code", "cursor", "codex", "gemini-cli", "windsurf", "opencode"]) expect(rows.some((row) => row.id === id)).toBe(true);
    const mcpVerified = new Set(["claude-code", "command-code", "codex", "opencode"]);
    for (const row of rows) {
      expect(["full", "mcp+rules", "rules-only"]).toContain(row.capabilities);
      expect(row.verification).toBe(mcpVerified.has(row.id) ? "mcp-verified" : "from-docs-only");
      expect(row.evidence.length).toBeGreaterThan(10);
      expect(row.installed).toBe(false);
    }
    const text = formatInstallerList({ home });
    expect(text).toContain("claude-code");
    expect(text).toContain("command-code");
    expect(text).toContain("full");
    expect(text).toContain("from-docs-only");
    expect(text).toContain("mcp-verified");
    expect(text).toContain("note  claude-code:");
  });

  test("a dry run followed by an uninstall leaves the tree identical", async () => {
    const { home, env, dataDir } = setup();
    const before = tree(home);
    const plan = installerFor("claude-code").plan(env);
    expect(plan.steps.every((step) => step.changed)).toBe(true);
    expect(tree(home)).toEqual(before);
    const remove = planUninstall("claude-code", env, { dataDir });
    expect(remove.installed).toBe(false);
    const result = applyUninstall(remove, { dataDir });
    expect(result.wrote).toEqual([]);
    expect(tree(home)).toEqual(before);
  });

  test("install then uninstall restores both files and keeps the user's entries", async () => {
    const { home, env, dataDir } = setup();
    const fs = await import("node:fs");
    fs.mkdirSync(join(home, ".claude"), { recursive: true });
    const userSettings = JSON.stringify({ model: "sonnet", hooks: { PostToolUse: [{ hooks: [{ type: "command", command: "echo mine" }] }] } }, null, 2);
    writeFileSync(join(home, ".claude/settings.json"), userSettings);
    writeFileSync(join(home, ".claude.json"), JSON.stringify({ numStartups: 4, mcpServers: { other: { command: "x" } } }, null, 2));
    writeFileSync(join(home, ".claude/CLAUDE.md"), "# Mine\n");

    await applyInstall(installerFor("claude-code").plan(env), { dataDir });
    const plan = planUninstall("claude-code", env, { dataDir });
    expect(plan.blocked).toEqual([]);
    const result = applyUninstall(plan, { dataDir });
    expect(result.removed).toBe(true);
    expect(JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"))).toEqual(JSON.parse(userSettings));
    expect(JSON.parse(readFileSync(join(home, ".claude.json"), "utf8")).mcpServers).toEqual({ other: { command: "x" } });
    expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toContain("# Mine");
    expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).not.toContain("aletheia:rules");
    expect(existsSync(join(dataDir, "install-manifest.json"))).toBe(true);
    expect(JSON.parse(readFileSync(join(dataDir, "install-manifest.json"), "utf8")).tools["claude-code"]).toBeUndefined();
  });

  test("a file edited after install is refused until --force", async () => {
    const { home, env, dataDir } = setup();
    await applyInstall(installerFor("claude-code").plan(env), { dataDir });
    writeFileSync(join(home, ".claude/settings.json"), `${readFileSync(join(home, ".claude/settings.json"), "utf8")}\n`);
    const refused = planUninstall("claude-code", env, { dataDir });
    expect(refused.blocked.length).toBe(1);
    expect(refused.steps.find((step) => step.blocked).note).toContain("--force");
    const result = applyUninstall(refused, { dataDir });
    expect(result.blocked).toBe(true);
    expect(JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8")).hooks.SessionStart).toBeDefined();
    expect(JSON.parse(readFileSync(join(dataDir, "install-manifest.json"), "utf8")).tools["claude-code"]).toBeDefined();

    const forced = planUninstall("claude-code", env, { dataDir, force: true });
    expect(forced.blocked).toEqual([]);
    expect(applyUninstall(forced, { dataDir }).removed).toBe(true);
    const settings = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
    expect(JSON.stringify(settings)).not.toContain("aletheia-managed");
  });

  test("a partial install can be undone when one file is already gone", async () => {
    const { home, env, dataDir } = setup();
    await applyInstall(installerFor("command-code").plan(env), { dataDir });
    unlinkSync(join(home, ".commandcode/mcp.json"));
    const plan = planUninstall("command-code", env, { dataDir });
    expect(plan.steps.find((step) => step.kind === "mcp").note).toBe("file does not exist");
    const result = applyUninstall(plan, { dataDir });
    expect(result.removed).toBe(true);
    expect(JSON.stringify(JSON.parse(readFileSync(join(home, ".commandcode/settings.json"), "utf8")))).not.toContain("aletheia-managed");
  });

  test("the hook stripper handles both documented shapes and leaves user handlers", () => {
    const doc = {
      hooks: {
        PostToolUse: [
          { matcher: "Write", hooks: [{ type: "command", command: "echo user" }, { type: "command", command: "x # aletheia-managed" }] },
          { command: "flat-user" },
          { command: "flat # aletheia-managed" },
        ],
        Stop: [{ command: "only # aletheia-managed" }],
      },
    };
    stripOurHooks(doc);
    expect(doc.hooks.PostToolUse).toEqual([{ matcher: "Write", hooks: [{ type: "command", command: "echo user" }] }, { command: "flat-user" }]);
    expect(doc.hooks.Stop).toBeUndefined();
  });

  test("doctor reports every registered installer without failing on missing ones", async () => {
    const { home, env, dataDir } = setup();
    await applyInstall(installerFor("claude-code").plan(env), { dataDir });
    const checks = await doctor(env);
    expect(checks.find((check) => check.name === "hooks claude-code").ok).toBe(true);
    expect(checks.find((check) => check.name === "hooks command-code").detail).toContain("not installed");
    expect(checks.find((check) => check.name === "spool").ok).toBe(true);
  });
});
