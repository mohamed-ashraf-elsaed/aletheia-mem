import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { applyInstall, applyUninstall, doctor, formatPlan, installerFor, installerIds, planUninstall, readManifest } from "../src/hub/install.mjs";
import { MARK_BEGIN } from "../src/hub/tools.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");

function setup() {
  const fx = makeFixture();
  const home = fx.makeDir("home");
  const dataDir = fx.makeDir("data");
  const env = (rules = []) => ({
    home,
    bun: "/usr/local/bin/bun",
    hookScript: join(root, "bin/aletheia.mjs"),
    hookRunner: join(dataDir, "aletheia.bundle.mjs"),
    mcpScript: join(root, "bin/mcp.mjs"),
    dataDir,
    dbPath: join(dataDir, "hub.db"),
    port: 1,
    rules,
  });
  return { fx, home, dataDir, env };
}

const settingsPath = (home) => join(home, ".claude/settings.json");
const claudeJsonPath = (home) => join(home, ".claude.json");
const ccSettingsPath = (home) => join(home, ".commandcode/settings.json");
const ccMcpPath = (home) => join(home, ".commandcode/mcp.json");
const backups = (dir) => {
  const out = [];
  const walk = (path) => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.includes(".aletheia-bak-")) out.push(full);
    }
  };
  walk(dir);
  return out.sort();
};

describe("install: Claude Code", () => {
  test("a dry run plans mcp, hooks and rules and writes nothing", () => {
    const { home, env } = setup();
    const plan = installerFor("claude-code").plan(env([{ then: "Run the tests", enabled: true }]));
    expect(plan.steps.map((step) => step.kind)).toEqual(["mcp", "hooks", "rules"]);
    expect(plan.steps.every((step) => step.changed)).toBe(true);
    expect(plan.steps.find((step) => step.kind === "rules").rules).toBe(1);
    expect(existsSync(settingsPath(home))).toBe(false);
    expect(existsSync(claudeJsonPath(home))).toBe(false);
    expect(formatPlan(plan)).toContain("note");
  });

  test("apply merges the user's hooks and servers, backs up both files, and records a manifest", async () => {
    const { home, dataDir, env } = setup();
    mkdirSync(join(home, ".claude"), { recursive: true });
    const userSettings = JSON.stringify({ model: "sonnet", hooks: { PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo user-hook" }] }] } }, null, 2);
    const userClaudeJson = JSON.stringify({ numStartups: 7, mcpServers: { other: { type: "stdio", command: "x", args: [] } } }, null, 2);
    writeFileSync(settingsPath(home), userSettings);
    writeFileSync(claudeJsonPath(home), userClaudeJson);

    const result = await applyInstall(installerFor("claude-code").plan(env()), { dataDir });
    expect(result.changed).toBe(true);
    expect(result.wrote.length).toBe(3);

    const settings = JSON.parse(readFileSync(settingsPath(home), "utf8"));
    expect(settings.model).toBe("sonnet");
    expect(settings.hooks.PostToolUse[0].hooks[0].command).toBe("echo user-hook"); // the user's own hook survived
    for (const event of ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"]) {
      const commands = settings.hooks[event].flatMap((definition) => definition.hooks.map((hook) => hook.command));
      const ours = commands.filter((command) => command.includes("aletheia-managed"));
      expect(ours.length).toBe(1);
      expect(ours[0]).toContain("/usr/local/bin/bun");
      // The runner path may be quoted (Windows paths contain backslashes and drive letters), so allow a quote after the file name.
      expect(ours[0]).toMatch(new RegExp(`aletheia\\.bundle\\.mjs'? hook claude-code ${event}`));
    }
    expect(settings.hooks.SessionStart[0].matcher).toBe("startup|clear|compact");

    const claude = JSON.parse(readFileSync(claudeJsonPath(home), "utf8"));
    expect(claude.numStartups).toBe(7);
    expect(claude.mcpServers.other).toEqual({ type: "stdio", command: "x", args: [] });
    expect(claude.mcpServers.aletheia).toEqual({ type: "stdio", command: "/usr/local/bin/bun", args: [join(root, "bin/mcp.mjs")], env: {} });

    const found = backups(home);
    expect(found.length).toBe(2);
    expect(readFileSync(found.find((file) => file.replaceAll("\\", "/").includes("/.claude/settings.json.aletheia-bak-")), "utf8")).toBe(userSettings);
    expect(readFileSync(found.find((file) => file.replaceAll("\\", "/").includes("/.claude.json.aletheia-bak-")), "utf8")).toBe(userClaudeJson);

    const manifest = readManifest(dataDir);
    expect(manifest.tools["claude-code"].steps.map((step) => step.kind)).toEqual(["mcp", "hooks", "rules"]);
    expect(manifest.tools["claude-code"].runner).toBe(join(dataDir, "aletheia.bundle.mjs"));
    expect(manifest.tools["claude-code"].bun).toBe("/usr/local/bin/bun");
    expect(existsSync(join(dataDir, "aletheia.bundle.mjs"))).toBe(true);
  });

  test("a second install changes nothing: same bytes, no new backups, runner not rebuilt", async () => {
    const { home, dataDir, env } = setup();
    const installer = installerFor("claude-code");
    await applyInstall(installer.plan(env()), { dataDir });
    const before = {
      settings: readFileSync(settingsPath(home), "utf8"),
      claude: readFileSync(claudeJsonPath(home), "utf8"),
      manifest: readFileSync(join(dataDir, "install-manifest.json"), "utf8"),
      backups: backups(home),
      runner: statSync(join(dataDir, "aletheia.bundle.mjs")).mtimeMs,
    };

    const second = installer.plan(env());
    expect(second.steps.every((step) => step.changed === false)).toBe(true);
    const result = await applyInstall(second, { dataDir });
    expect(result.changed).toBe(false);
    expect(result.wrote).toEqual([]);
    expect(readFileSync(settingsPath(home), "utf8")).toBe(before.settings);
    expect(readFileSync(claudeJsonPath(home), "utf8")).toBe(before.claude);
    expect(readFileSync(join(dataDir, "install-manifest.json"), "utf8")).toBe(before.manifest);
    expect(backups(home)).toEqual(before.backups);
    expect(statSync(join(dataDir, "aletheia.bundle.mjs")).mtimeMs).toBe(before.runner);
  });

  test("the CLI is a dry run by default and creates no files, data dir or database", async () => {
    const fx = makeFixture();
    const home = fx.makeDir("home");
    const missingData = join(fx.dir, "data");
    const childEnv = { ...process.env, HOME: home, ALETHEIA_DATA_DIR: missingData, ALETHEIA_HUB_DB: join(missingData, "hub.db") };
    for (const args of [["install", "claude-code"], ["install", "claude-code", "--dry-run"]]) {
      const proc = Bun.spawn([process.execPath, join(root, "bin/aletheia.mjs"), ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env: childEnv });
      const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      expect(exitCode).toBe(0);
      expect(stdout).toContain("Dry run: nothing was written");
      expect(existsSync(join(home, ".claude/settings.json"))).toBe(false);
      expect(existsSync(join(home, ".claude.json"))).toBe(false);
      expect(existsSync(missingData)).toBe(false);
    }
  });

  test("an unparsable settings file is refused and left untouched", () => {
    const { home, env } = setup();
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(settingsPath(home), "{ not json");
    expect(() => installerFor("claude-code").plan(env())).toThrow(/not a JSON object/);
    expect(readFileSync(settingsPath(home), "utf8")).toBe("{ not json");
    expect(backups(home)).toEqual([]);
  });

  test("uninstall removes only our entries and restores the user's own text", async () => {
    const { home, dataDir, env } = setup();
    mkdirSync(join(home, ".claude"), { recursive: true });
    writeFileSync(settingsPath(home), JSON.stringify({ model: "sonnet", hooks: { PostToolUse: [{ matcher: "Write", hooks: [{ type: "command", command: "echo user-hook" }] }] } }));
    writeFileSync(claudeJsonPath(home), JSON.stringify({ mcpServers: { other: { type: "stdio", command: "x" } } }));
    writeFileSync(join(home, ".claude/CLAUDE.md"), "# Mine\n\nHand-written notes.\n");

    await applyInstall(installerFor("claude-code").plan(env([{ then: "Run the tests", enabled: true }])), { dataDir });
    expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toContain(MARK_BEGIN);

    const plan = planUninstall("claude-code", env(), { dataDir });
    expect(plan.installed).toBe(true);
    const result = applyUninstall(plan, { dataDir });
    expect(result.wrote.length).toBe(3);

    const settings = JSON.parse(readFileSync(settingsPath(home), "utf8"));
    expect(settings.model).toBe("sonnet");
    expect(settings.hooks.PostToolUse).toEqual([{ matcher: "Write", hooks: [{ type: "command", command: "echo user-hook" }] }]);
    expect(settings.hooks.SessionStart).toBeUndefined();
    expect(settings.hooks.SessionEnd).toBeUndefined();
    const claude = JSON.parse(readFileSync(claudeJsonPath(home), "utf8"));
    expect(claude.mcpServers).toEqual({ other: { type: "stdio", command: "x" } });
    expect(readFileSync(join(home, ".claude/CLAUDE.md"), "utf8")).toBe("# Mine\n\nHand-written notes.\n");
    expect(readManifest(dataDir).tools["claude-code"]).toBeUndefined();
    expect(planUninstall("claude-code", env(), { dataDir }).installed).toBe(false);
  });

  test("unknown tools are refused with the list", () => {
    expect(() => installerFor("nope")).toThrow(/Unknown tool: nope/);
    expect(() => installerFor("nope")).toThrow(new RegExp(installerIds().join(", ")));
  });

  test("doctor reports hooks present, spool empty and the last capture", async () => {
    const { home, dataDir, env } = setup();
    await applyInstall(installerFor("claude-code").plan(env()), { dataDir });
    const checks = await doctor(env());
    const hooks = checks.find((check) => check.name === "hooks claude-code");
    expect(hooks.ok).toBe(true);
    expect(hooks.detail).toContain("5/5");
    expect(checks.find((check) => check.name === "spool").ok).toBe(true);
    expect(checks.find((check) => check.name === "last capture").detail).toBe("no capture yet");
    expect(checks.find((check) => check.name === "server").ok).toBe(false);
  });
});

describe("install: Command Code", () => {
  test("writes its own hook and MCP shapes, keeps existing settings, and says what it cannot capture", async () => {
    const { home, dataDir, env } = setup();
    mkdirSync(join(home, ".commandcode"), { recursive: true });
    writeFileSync(ccSettingsPath(home), JSON.stringify({ permissions: { allow: ["Shell(ls:*)"] } }));
    writeFileSync(ccMcpPath(home), JSON.stringify({ mcpServers: { other: { transport: "stdio", command: "x", args: [] } } }));

    const installer = installerFor("command-code");
    const plan = installer.plan(env());
    expect(plan.steps.map((step) => step.kind)).toEqual(["mcp", "hooks", "rules"]);
    expect(plan.notes.join(" ")).toContain("no UserPromptSubmit hook");
    expect(plan.notes.join(" ")).toContain("no SessionEnd hook");
    const text = formatPlan(plan);
    expect(text).toContain("SessionStart, PostToolUse, Stop");
    expect(text).not.toContain("UserPromptSubmit,");

    const result = await applyInstall(plan, { dataDir });
    expect(result.changed).toBe(true);
    const settings = JSON.parse(readFileSync(ccSettingsPath(home), "utf8"));
    expect(settings.permissions.allow).toEqual(["Shell(ls:*)"]);
    expect(Object.keys(settings.hooks)).toEqual(["SessionStart", "PostToolUse", "Stop"]);
    expect(settings.hooks.SessionStart[0].matcher).toBeUndefined(); // no matcher on SessionStart
    const mcp = JSON.parse(readFileSync(ccMcpPath(home), "utf8"));
    expect(mcp.mcpServers.other.command).toBe("x");
    expect(mcp.mcpServers.aletheia).toEqual({ transport: "stdio", command: "/usr/local/bin/bun", args: [join(root, "bin/mcp.mjs")] });
    expect(backups(home).length).toBe(2);

    const second = await applyInstall(installer.plan(env()), { dataDir });
    expect(second.changed).toBe(false);

    applyUninstall(planUninstall("command-code", env(), { dataDir }), { dataDir });
    expect(JSON.parse(readFileSync(ccSettingsPath(home), "utf8"))).toEqual({ permissions: { allow: ["Shell(ls:*)"] } });
    expect(JSON.parse(readFileSync(ccMcpPath(home), "utf8")).mcpServers).toEqual({ other: { transport: "stdio", command: "x", args: [] } });
  });
});
