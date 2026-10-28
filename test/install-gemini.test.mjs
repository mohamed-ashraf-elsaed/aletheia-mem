import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { applyInstall, applyUninstall, doctor, installerFor, planUninstall } from "../src/hub/install.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");
const settingsPath = (home) => join(home, ".gemini/settings.json");

function setup() {
  const fx = makeFixture();
  const home = fx.makeDir("home");
  const dataDir = fx.makeDir("data");
  const proj = fx.makeDir("shop");
  return {
    fx, home, dataDir, proj, project: basename(proj),
    env: {
      home,
      bun: process.execPath,
      hookScript: join(root, "bin/aletheia.mjs"),
      hookRunner: join(dataDir, "aletheia.bundle.mjs"),
      mcpScript: join(root, "bin/mcp.mjs"),
      dataDir,
      dbPath: join(dataDir, "hub.db"),
      port: 1,
      rules: [],
    },
  };
}

function commandsFrom(file) {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  return Object.fromEntries(Object.entries(doc.hooks ?? {}).map(([event, definitions]) => [event, definitions.flatMap((definition) => definition.hooks ?? []).find((handler) => String(handler.command).includes("aletheia-managed"))?.command ?? null]));
}

async function runCommand(command, payload, ctx) {
  const proc = Bun.spawn(["sh", "-c", command], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    cwd: ctx.proj,
    env: { ...process.env, HOME: ctx.home, ALETHEIA_DATA_DIR: ctx.dataDir, ALETHEIA_HUB_DB: join(ctx.dataDir, "hub.db") },
  });
  proc.stdin.write(JSON.stringify(payload));
  proc.stdin.end();
  const [stdout, exitCode] = await Promise.all([new Response(proc.stdout).text(), proc.exited]);
  return { stdout, exitCode };
}

describe("Gemini CLI installer and hooks", () => {
  test("a dry run merges MCP and hooks in one settings step plus GEMINI.md", () => {
    const ctx = setup();
    const plan = installerFor("gemini-cli").plan(ctx.env);
    expect(plan.capabilities).toBe("full");
    expect(plan.verification).toBe("from-docs-only");
    expect(plan.steps.map((step) => step.kind)).toEqual(["settings", "rules"]);
    expect(plan.steps.every((step) => step.changed)).toBe(true);
    expect(existsSync(settingsPath(ctx.home))).toBe(false);
    expect(existsSync(join(ctx.home, ".gemini/GEMINI.md"))).toBe(false);
  });

  test("settings.json keeps other keys, hooks and servers; a second run is a no-op", async () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".gemini"), { recursive: true });
    writeFileSync(settingsPath(ctx.home), JSON.stringify({
      security: { auth: { selectedType: "oauth" } },
      mcpServers: { other: { command: "x", args: [] } },
      hooks: { AfterTool: [{ hooks: [{ type: "command", command: "echo user" }] }] },
    }, null, 2));

    const result = await applyInstall(installerFor("gemini-cli").plan(ctx.env), { dataDir: ctx.dataDir });
    expect(result.wrote.length).toBe(2);
    const doc = JSON.parse(readFileSync(settingsPath(ctx.home), "utf8"));
    expect(doc.security.auth.selectedType).toBe("oauth");
    expect(doc.mcpServers.other.command).toBe("x");
    expect(doc.mcpServers.aletheia).toEqual({ command: process.execPath, args: [join(root, "bin/mcp.mjs")] });
    expect(doc.hooks.AfterTool[0].hooks[0].command).toBe("echo user");
    expect(commandsFrom(settingsPath(ctx.home)).AfterTool).toContain("hook gemini-cli AfterTool");
    expect(Object.keys(commandsFrom(settingsPath(ctx.home))).sort()).toEqual(["AfterAgent", "AfterTool", "BeforeAgent", "SessionEnd", "SessionStart"]);
    expect(doc.hooks.AfterTool.at(-1).hooks[0].timeout).toBe(10000);
    expect(readFileSync(join(ctx.home, ".gemini/GEMINI.md"), "utf8")).toContain("aletheia:rules:begin");

    const second = await applyInstall(installerFor("gemini-cli").plan(ctx.env), { dataDir: ctx.dataDir });
    expect(second.changed).toBe(false);
    expect(second.wrote).toEqual([]);
  });

  // The installed hook command is run through `sh -c`, which does not handle this Windows command line. Which shell Gemini CLI
  // uses for hooks on Windows is not verified, so this check only runs elsewhere.
  test.skipIf(process.platform === "win32")("the installed hooks capture prompt, tool and response, and doctor sees 5/5", async () => {
    const ctx = setup();
    const store = new HubStore(join(ctx.dataDir, "hub.db"));
    store.add({ project: ctx.project, title: "Pinned gemini memory", narrative: "the pinned fact survives", kind: "observation", type: "decision", pinned: true, tool: "gemini-cli" });
    store.rules.add({ then: "Use the pinned gemini fact", tools: ["gemini-cli"] });
    store.close();

    await applyInstall(installerFor("gemini-cli").plan(ctx.env), { dataDir: ctx.dataDir });
    const commands = commandsFrom(settingsPath(ctx.home));
    expect(Object.values(commands).every(Boolean)).toBe(true);

    const start = await runCommand(commands.SessionStart, { hook_event_name: "SessionStart", session_id: "gem-1", cwd: ctx.proj, source: "startup", timestamp: "2026-10-26T00:00:00Z" }, ctx);
    expect(start.exitCode).toBe(0);
    expect(start.stdout).toContain("<aletheia-memory>");
    expect(start.stdout).toContain("Pinned gemini memory");

    expect((await runCommand(commands.BeforeAgent, { hook_event_name: "BeforeAgent", session_id: "gem-1", cwd: ctx.proj, prompt: "remember this with sk-ant-api03-abcdefghijklmnopqrstuvwx" }, ctx)).exitCode).toBe(0);
    expect((await runCommand(commands.AfterTool, { hook_event_name: "AfterTool", session_id: "gem-1", cwd: ctx.proj, tool_name: "run_shell_command", tool_input: { command: "curl -H 'Authorization: Bearer abcdefghijklmnop12345' x" }, tool_response: { llmContent: "ok" } }, ctx)).exitCode).toBe(0);
    expect((await runCommand(commands.AfterAgent, { hook_event_name: "AfterAgent", session_id: "gem-1", cwd: ctx.proj, prompt: "x", prompt_response: "Finished gemini with sk-ant-api03-abcdefghijklmnopqrstuvwx" }, ctx)).exitCode).toBe(0);
    expect((await runCommand(commands.SessionEnd, { hook_event_name: "SessionEnd", session_id: "gem-1", cwd: ctx.proj, reason: "exit" }, ctx)).exitCode).toBe(0);

    const read = new HubStore(join(ctx.dataDir, "hub.db"));
    expect(read.list({ project: ctx.project, kind: "prompt", tool: "gemini-cli" }).total).toBe(1);
    expect(read.list({ project: ctx.project, kind: "event", tool: "gemini-cli" }).total).toBe(1);
    expect(read.list({ project: ctx.project, kind: "summary", tool: "gemini-cli" }).total).toBe(1);
    const blob = JSON.stringify(read.db.prepare("SELECT title, narrative FROM memories WHERE tool = 'gemini-cli'").all());
    expect(blob).not.toContain("sk-ant-api03");
    expect(blob).not.toContain("abcdefghijklmnop12345");
    expect(blob).toContain("[redacted");
    expect(read.setting("compress.queue", []).some((item) => item.sessionId === "gem-1")).toBe(true);
    read.close();

    const checks = await doctor(ctx.env);
    expect(checks.find((check) => check.name === "hooks gemini-cli").ok).toBe(true);
    expect(checks.find((check) => check.name === "hooks gemini-cli").detail).toContain("5/5");
  });

  test("uninstall removes our MCP entry and hooks, keeping the user's settings", async () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".gemini"), { recursive: true });
    writeFileSync(settingsPath(ctx.home), JSON.stringify({
      security: { auth: { selectedType: "oauth" } },
      mcpServers: { other: { command: "x", args: [] } },
      hooks: { AfterTool: [{ hooks: [{ type: "command", command: "echo user" }] }] },
    }, null, 2));

    await applyInstall(installerFor("gemini-cli").plan(ctx.env), { dataDir: ctx.dataDir });
    const result = applyUninstall(planUninstall("gemini-cli", ctx.env, { dataDir: ctx.dataDir }), { dataDir: ctx.dataDir });
    expect(result.removed).toBe(true);
    const doc = JSON.parse(readFileSync(settingsPath(ctx.home), "utf8"));
    expect(doc.security.auth.selectedType).toBe("oauth");
    expect(doc.mcpServers).toEqual({ other: { command: "x", args: [] } });
    expect(doc.hooks.AfterTool).toEqual([{ hooks: [{ type: "command", command: "echo user" }] }]);
    expect(JSON.stringify(doc)).not.toContain("aletheia-managed");
    expect(readFileSync(join(ctx.home, ".gemini/GEMINI.md"), "utf8")).not.toContain("aletheia:rules");
  });
});
