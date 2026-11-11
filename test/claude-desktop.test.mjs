import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { applyInstall, claudeDesktopInstallPlan, claudeDesktopPath, planClaudeDesktop } from "../src/hub/install.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");

function setup() {
  const fx = makeFixture();
  const home = fx.makeDir("home");
  const dataDir = fx.makeDir("data");
  return { fx, home, dataDir };
}

describe("Claude Desktop MCP config", () => {
  test("the documented macOS and Windows paths and the observed Linux path", () => {
    const { home } = setup();
    expect(claudeDesktopPath({ home, platform: "darwin" })).toBe(join(home, "Library/Application Support/Claude/claude_desktop_config.json"));
    expect(claudeDesktopPath({ home, platform: "win32", env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" } })).toContain("Claude");
    expect(claudeDesktopPath({ home, platform: "win32", env: { APPDATA: "C:\\Users\\me\\AppData\\Roaming" } })).toEndWith("claude_desktop_config.json");
    expect(claudeDesktopPath({ home, platform: "linux" })).toBe(join(home, ".config/Claude/claude_desktop_config.json"));
  });

  test("the generated entry has the documented mcpServers shape and merges with a real file", async () => {
    const { home, dataDir } = setup();
    const env = { home, bun: "/opt/bun", mcpScript: join(root, "bin/mcp.mjs"), dataDir, platform: "linux" };
    const file = claudeDesktopPath({ home, platform: "linux" });
    mkdirSync(join(home, ".config/Claude"), { recursive: true });
    const user = {
      preferences: { sidebarMode: "dark", coworkScheduledTasksEnabled: true },
      mcpServers: { other: { command: "npx", args: ["-y", "other"], env: { TOKEN: "x" } } },
    };
    writeFileSync(file, JSON.stringify(user, null, 2));
    const step = planClaudeDesktop(env);
    expect(step.kind).toBe("mcp");
    expect(step.file).toBe(file);

    const plan = { tool: "claude-desktop", capabilities: "mcp-only", verification: "from-docs-only", env: { ...env, hookScript: undefined, hookRunner: undefined }, notes: [], steps: [step] };
    const result = await applyInstall(plan, { dataDir });
    expect(result.wrote).toEqual([step.file]);

    const doc = JSON.parse(readFileSync(step.file, "utf8"));
    expect(doc.preferences).toEqual(user.preferences);
    expect(doc.mcpServers.other).toEqual(user.mcpServers.other);
    expect(doc.mcpServers.aletheia).toEqual({ command: "/opt/bun", args: [join(root, "bin/mcp.mjs")], env: {} });

    const second = await applyInstall({ ...plan, steps: [planClaudeDesktop(env)] }, { dataDir });
    expect(second.changed).toBe(false);
    expect(second.wrote).toEqual([]);
  });

  test("an unparsable config is refused and left untouched", () => {
    const { home, dataDir } = setup();
    const file = claudeDesktopPath({ home, platform: "linux" });
    mkdirSync(join(home, ".config/Claude"), { recursive: true });
    writeFileSync(file, "{ not json");
    expect(() => planClaudeDesktop({ home, bun: "/opt/bun", mcpScript: join(root, "bin/mcp.mjs"), dataDir, platform: "linux" })).toThrow(/not a JSON object/);
    expect(readFileSync(file, "utf8")).toBe("{ not json");
  });

  test("the doc names the exact paths and the unverified Linux note", () => {
    const text = readFileSync(join(root, "docs/claude-desktop.md"), "utf8");
    expect(text).toContain("~/Library/Application Support/Claude/claude_desktop_config.json");
    expect(text).toContain("%APPDATA%\\Claude\\claude_desktop_config.json");
    expect(text).toContain("~/.config/Claude/claude_desktop_config.json");
    expect(text).toContain("UNVERIFIED");
    expect(text).toContain("https://modelcontextprotocol.io/quickstart/user");
  });

  test("the CLI is a dry run by default, and --write merges with a backup and is idempotent", async () => {
    const { home, dataDir } = setup();
    // The CLI writes the path for this platform; on Windows that follows APPDATA, which the spawned CLI gets inside HOME.
    const appData = join(home, "AppData", "Roaming");
    const file = claudeDesktopPath({ home, platform: process.platform, env: { APPDATA: appData } });
    mkdirSync(dirname(file), { recursive: true });
    const user = { preferences: { sidebarMode: "dark" }, mcpServers: { other: { command: "npx", args: ["x"] } } };
    writeFileSync(file, JSON.stringify(user));
    const run = async (...args) => {
      const proc = Bun.spawn([process.execPath, join(root, "bin/aletheia.mjs"), "install", "claude-desktop", ...args], {
        stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env: { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: join(dataDir, "hub.db") },
      });
      const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
      return { stdout, exitCode };
    };
    const backups = () => readdirSync(dirname(file)).filter((name) => name.includes(".aletheia-bak-"));

    const dry = await run();
    expect(dry.exitCode).toBe(0);
    expect(dry.stdout).toContain("Dry run: nothing was written");
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(user);
    expect(backups()).toEqual([]);

    const written = await run("--write");
    expect(written.exitCode).toBe(0);
    expect(written.stdout).toContain("Wrote 1 file(s)");
    const doc = JSON.parse(readFileSync(file, "utf8"));
    expect(doc.preferences).toEqual(user.preferences);
    expect(doc.mcpServers.other).toEqual(user.mcpServers.other);
    expect(doc.mcpServers.aletheia.args).toEqual([join(root, "bin/mcp.mjs")]);
    expect(backups().length).toBe(1);

    const again = await run("--write");
    expect(again.stdout).toContain("Already installed; nothing changed.");
    expect(backups().length).toBe(1);
  });

  test("the plan names no hook runner and reports mcp-only", () => {
    const { home, dataDir } = setup();
    const plan = claudeDesktopInstallPlan({ home, bun: "/opt/bun", mcpScript: join(root, "bin/mcp.mjs"), hookRunner: "/x/bundle.mjs", dataDir, platform: "linux" });
    expect(plan.capabilities).toBe("mcp-only");
    expect(plan.env.hookRunner).toBeUndefined();
    expect(plan.steps.length).toBe(1);
  });
});
