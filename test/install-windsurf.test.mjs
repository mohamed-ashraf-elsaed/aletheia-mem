import { describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { applyInstall, applyUninstall, doctor, installerFor, planUninstall } from "../src/hub/install.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");
const hooksPath = (home) => join(home, ".codeium/windsurf/hooks.json");
const currentMcpPath = (home) => join(home, ".config/devin/mcp_config.json");
const legacyMcpPath = (home) => join(home, ".codeium/windsurf/mcp_config.json");

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

describe("Windsurf installer and hooks", () => {
  test("a dry run plans the current MCP path, hooks and global rules", () => {
    const ctx = setup();
    const plan = installerFor("windsurf").plan(ctx.env);
    expect(plan.capabilities).toBe("full");
    expect(plan.verification).toBe("from-docs-only");
    expect(plan.steps.map((step) => step.kind)).toEqual(["mcp", "hooks", "rules"]);
    expect(plan.steps.find((step) => step.kind === "mcp").file).toBe(currentMcpPath(ctx.home));
    expect(plan.steps.find((step) => step.kind === "hooks").file).toBe(hooksPath(ctx.home));
    expect(plan.notes.join(" ")).toContain("no session-start");
  });

  test("an existing legacy MCP file is merged, and a second install is a no-op", async () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".codeium/windsurf"), { recursive: true });
    writeFileSync(legacyMcpPath(ctx.home), JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 2));
    writeFileSync(hooksPath(ctx.home), JSON.stringify({ hooks: { post_run_command: [{ command: "echo user" }] } }, null, 2));

    const plan = installerFor("windsurf").plan(ctx.env);
    expect(plan.steps.find((step) => step.kind === "mcp").file).toBe(legacyMcpPath(ctx.home));
    const result = await applyInstall(plan, { dataDir: ctx.dataDir });
    expect(result.wrote.length).toBe(3);
    const mcp = JSON.parse(readFileSync(legacyMcpPath(ctx.home), "utf8"));
    expect(mcp.mcpServers.other.command).toBe("x");
    expect(mcp.mcpServers.aletheia).toEqual({ command: process.execPath, args: [join(root, "bin/mcp.mjs")] });
    const hooks = JSON.parse(readFileSync(hooksPath(ctx.home), "utf8"));
    expect(hooks.hooks.post_run_command[0].command).toBe("echo user");
    expect(Object.keys(commandsFrom(hooksPath(ctx.home))).sort()).toEqual(["post_cascade_response", "post_run_command", "post_write_code", "pre_user_prompt"]);

    const second = await applyInstall(installerFor("windsurf").plan(ctx.env), { dataDir: ctx.dataDir });
    expect(second.changed).toBe(false);
    expect(second.wrote).toEqual([]);
  });

  test("the installed hooks capture prompts, commands and responses, and doctor sees 4/4", async () => {
    const ctx = setup();
    const store = new HubStore(join(ctx.dataDir, "hub.db"));
    store.add({ project: ctx.project, title: "Pinned windsurf memory", narrative: "the pinned fact survives", kind: "observation", type: "decision", pinned: true, tool: "windsurf" });
    store.close();

    await applyInstall(installerFor("windsurf").plan(ctx.env), { dataDir: ctx.dataDir });
    const commands = commandsFrom(hooksPath(ctx.home));
    expect(Object.values(commands).every(Boolean)).toBe(true);

    const prompt = await runCommand(commands.pre_user_prompt, {
      agent_action_name: "pre_user_prompt", trajectory_id: "wf-1", execution_id: "e1", timestamp: "2026-10-26T00:00:00Z",
      tool_info: { user_prompt: "remember this with sk-ant-api03-abcdefghijklmnopqrstuvwx" },
    }, ctx);
    expect(prompt.exitCode).toBe(0);
    expect(prompt.stdout).toBe("");

    expect((await runCommand(commands.post_run_command, {
      agent_action_name: "post_run_command", trajectory_id: "wf-1", tool_info: { command_line: "curl -H 'Authorization: Bearer abcdefghijklmnop12345' x", cwd: ctx.proj },
    }, ctx)).exitCode).toBe(0);
    expect((await runCommand(commands.post_write_code, {
      agent_action_name: "post_write_code", trajectory_id: "wf-1", tool_info: { file_path: join(ctx.proj, "a.mjs"), edits: [{ old_string: "a", new_string: "b" }] },
    }, ctx)).exitCode).toBe(0);
    expect((await runCommand(commands.post_cascade_response, {
      agent_action_name: "post_cascade_response", trajectory_id: "wf-1", tool_info: { response: "Finished windsurf with sk-ant-api03-abcdefghijklmnopqrstuvwx" },
    }, ctx)).exitCode).toBe(0);

    const read = new HubStore(join(ctx.dataDir, "hub.db"));
    expect(read.list({ project: ctx.project, kind: "prompt", tool: "windsurf" }).total).toBe(1);
    expect(read.list({ project: ctx.project, kind: "event", tool: "windsurf" }).total).toBe(2);
    expect(read.list({ project: ctx.project, kind: "summary", tool: "windsurf" }).total).toBe(1);
    const blob = JSON.stringify(read.db.prepare("SELECT title, narrative FROM memories WHERE tool = 'windsurf'").all());
    expect(blob).not.toContain("sk-ant-api03");
    expect(blob).not.toContain("abcdefghijklmnop12345");
    expect(blob).toContain("[redacted");
    expect(read.setting("compress.queue", []).some((item) => item.sessionId === "wf-1")).toBe(true);
    read.close();

    const checks = await doctor(ctx.env);
    expect(checks.find((check) => check.name === "hooks windsurf").ok).toBe(true);
    expect(checks.find((check) => check.name === "hooks windsurf").detail).toContain("4/4");
  });

  test("uninstall removes only our entries and leaves the user's hook", async () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".codeium/windsurf"), { recursive: true });
    writeFileSync(legacyMcpPath(ctx.home), JSON.stringify({ mcpServers: { other: { command: "x" } } }, null, 2));
    writeFileSync(hooksPath(ctx.home), JSON.stringify({ hooks: { post_run_command: [{ command: "echo user" }] } }, null, 2));

    await applyInstall(installerFor("windsurf").plan(ctx.env), { dataDir: ctx.dataDir });
    const result = applyUninstall(planUninstall("windsurf", ctx.env, { dataDir: ctx.dataDir }), { dataDir: ctx.dataDir });
    expect(result.removed).toBe(true);
    expect(JSON.parse(readFileSync(legacyMcpPath(ctx.home), "utf8")).mcpServers).toEqual({ other: { command: "x" } });
    const hooks = JSON.parse(readFileSync(hooksPath(ctx.home), "utf8"));
    expect(hooks.hooks.post_run_command).toEqual([{ command: "echo user" }]);
    expect(JSON.stringify(hooks)).not.toContain("aletheia-managed");
  });
});
