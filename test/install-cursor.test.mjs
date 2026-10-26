import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { applyInstall, applyUninstall, doctor, installerFor, planUninstall } from "../src/hub/install.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");

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

const hooksPath = (home) => join(home, ".cursor/hooks.json");
const mcpPath = (home) => join(home, ".cursor/mcp.json");

function commandsFrom(file) {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  return Object.fromEntries(Object.entries(doc.hooks ?? {}).map(([event, definitions]) => [event, definitions.find((definition) => String(definition.command).includes("aletheia-managed"))?.command ?? null]));
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

describe("T-061: Cursor installer and hooks", () => {
  test("a dry run plans MCP and flat hooks, and writes nothing", () => {
    const ctx = setup();
    const plan = installerFor("cursor").plan(ctx.env);
    expect(plan.capabilities).toBe("full");
    expect(plan.verification).toBe("from-docs-only");
    expect(plan.steps.map((step) => step.kind)).toEqual(["mcp", "hooks"]);
    expect(plan.steps.every((step) => step.changed)).toBe(true);
    expect(plan.notes.join(" ")).toContain("not installed here");
    expect(existsSync(hooksPath(ctx.home))).toBe(false);
    expect(existsSync(mcpPath(ctx.home))).toBe(false);
  });

  test("apply merges user entries, keeps version 1, and a second run is a no-op", async () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".cursor"), { recursive: true });
    writeFileSync(mcpPath(ctx.home), JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 2));
    writeFileSync(hooksPath(ctx.home), JSON.stringify({ version: 1, hooks: { postToolUse: [{ command: "echo user" }] } }, null, 2));

    const result = await applyInstall(installerFor("cursor").plan(ctx.env), { dataDir: ctx.dataDir });
    expect(result.wrote.length).toBe(2);
    const hooks = JSON.parse(readFileSync(hooksPath(ctx.home), "utf8"));
    expect(hooks.version).toBe(1);
    expect(hooks.hooks.postToolUse[0].command).toBe("echo user");
    expect(commandsFrom(hooksPath(ctx.home)).postToolUse).toContain("hook cursor postToolUse");
    expect(Object.keys(commandsFrom(hooksPath(ctx.home))).sort()).toEqual(["afterAgentResponse", "beforeSubmitPrompt", "postToolUse", "sessionEnd", "sessionStart", "stop"]);
    expect(JSON.parse(readFileSync(mcpPath(ctx.home), "utf8")).mcpServers.other.command).toBe("x");

    const second = await applyInstall(installerFor("cursor").plan(ctx.env), { dataDir: ctx.dataDir });
    expect(second.changed).toBe(false);
    expect(second.wrote).toEqual([]);
  });

  test("the installed commands capture prompts, tools and responses without secrets", async () => {
    const ctx = setup();
    const store = new HubStore(join(ctx.dataDir, "hub.db"));
    store.add({ project: ctx.project, title: "Pinned cursor memory", narrative: "the pinned fact survives", kind: "observation", type: "decision", pinned: true, tool: "cursor" });
    store.rules.add({ then: "Use the pinned fact", tools: ["cursor"] });
    store.close();

    await applyInstall(installerFor("cursor").plan(ctx.env), { dataDir: ctx.dataDir });
    const commands = commandsFrom(hooksPath(ctx.home));
    expect(Object.values(commands).every(Boolean)).toBe(true);

    const before = await runCommand(commands.beforeSubmitPrompt, {
      hook_event_name: "beforeSubmitPrompt", conversation_id: "cursor-1", workspace_roots: [ctx.proj],
      prompt: "remember this prompt with sk-ant-api03-abcdefghijklmnopqrstuvwx",
    }, ctx);
    expect(before.exitCode).toBe(0);

    const tool = await runCommand(commands.postToolUse, {
      hook_event_name: "postToolUse", conversation_id: "cursor-1", cwd: ctx.proj,
      tool_name: "Shell", tool_input: { command: "curl -H 'Authorization: Bearer abcdefghijklmnop12345' x" }, tool_output: "ok",
    }, ctx);
    expect(tool.exitCode).toBe(0);

    const answer = await runCommand(commands.afterAgentResponse, {
      hook_event_name: "afterAgentResponse", conversation_id: "cursor-1", cwd: ctx.proj,
      text: "Finished the cursor fixture with sk-ant-api03-abcdefghijklmnopqrstuvwx",
    }, ctx);
    expect(answer.exitCode).toBe(0);

    expect((await runCommand(commands.stop, { hook_event_name: "stop", conversation_id: "cursor-1", cwd: ctx.proj, status: "completed", loop_count: 0 }, ctx)).exitCode).toBe(0);
    expect((await runCommand(commands.sessionEnd, { hook_event_name: "sessionEnd", conversation_id: "cursor-1", cwd: ctx.proj, reason: "completed" }, ctx)).exitCode).toBe(0);

    const start = await runCommand(commands.sessionStart, {
      hook_event_name: "sessionStart", session_id: "cursor-1", conversation_id: "cursor-1", workspace_roots: [ctx.proj],
      is_background_agent: false, composer_mode: "agent",
    }, ctx);
    expect(start.exitCode).toBe(0);
    expect(start.stdout).toContain("additional_context");
    expect(start.stdout).toContain("<aletheia-memory>");
    expect(start.stdout).toContain("Pinned cursor memory");

    const read = new HubStore(join(ctx.dataDir, "hub.db"));
    expect(read.list({ project: ctx.project, kind: "prompt", tool: "cursor" }).total).toBe(1);
    expect(read.list({ project: ctx.project, kind: "event", tool: "cursor" }).total).toBe(1);
    expect(read.list({ project: ctx.project, kind: "summary", tool: "cursor" }).total).toBe(1);
    const blob = JSON.stringify(read.db.prepare("SELECT title, narrative FROM memories WHERE tool = 'cursor'").all());
    expect(blob).not.toContain("sk-ant-api03");
    expect(blob).not.toContain("abcdefghijklmnop12345");
    expect(blob).toContain("[redacted");
    expect(read.setting("compress.queue", []).some((item) => item.sessionId === "cursor-1")).toBe(true);
    read.close();

    const checks = await doctor(ctx.env);
    expect(checks.find((check) => check.name === "hooks cursor").ok).toBe(true);
    expect(checks.find((check) => check.name === "hooks cursor").detail).toContain("6/6");
  });

  test("uninstall removes only the cursor entries", async () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".cursor"), { recursive: true });
    writeFileSync(mcpPath(ctx.home), JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 2));
    writeFileSync(hooksPath(ctx.home), JSON.stringify({ version: 1, hooks: { postToolUse: [{ command: "echo user" }] } }, null, 2));

    await applyInstall(installerFor("cursor").plan(ctx.env), { dataDir: ctx.dataDir });
    const result = applyUninstall(planUninstall("cursor", ctx.env, { dataDir: ctx.dataDir }), { dataDir: ctx.dataDir });
    expect(result.removed).toBe(true);
    const hooks = JSON.parse(readFileSync(hooksPath(ctx.home), "utf8"));
    expect(hooks.version).toBe(1);
    expect(hooks.hooks.postToolUse).toEqual([{ command: "echo user" }]);
    expect(JSON.stringify(hooks)).not.toContain("aletheia-managed");
    expect(JSON.parse(readFileSync(mcpPath(ctx.home), "utf8")).mcpServers).toEqual({ other: { command: "x" } });
  });
});
