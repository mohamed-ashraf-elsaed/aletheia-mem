import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { applyInstall, applyUninstall, doctor, installerFor, planUninstall } from "../src/hub/install.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");
const configPath = (home) => join(home, ".codex/config.toml");
const hooksPath = (home) => join(home, ".codex/hooks.json");

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

describe("T-062: Codex CLI installer and hooks", () => {
  test("a dry run plans the TOML MCP block and hooks, writing nothing", () => {
    const ctx = setup();
    const plan = installerFor("codex").plan(ctx.env);
    expect(plan.capabilities).toBe("full");
    expect(plan.verification).toBe("from-docs-only");
    expect(plan.steps.map((step) => step.kind)).toEqual(["mcp", "hooks"]);
    expect(plan.steps.every((step) => step.changed)).toBe(true);
    expect(plan.notes.join(" ")).toContain("/hooks");
    expect(existsSync(configPath(ctx.home))).toBe(false);
    expect(existsSync(hooksPath(ctx.home))).toBe(false);
  });

  test("the TOML block merges with other tables and refuses a foreign aletheia table", async () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".codex"), { recursive: true });
    const user = `# my codex config\nmodel = "gpt-5"\n\n[projects."/tmp/x"]\ntrust_level = "trusted"\n\n[mcp_servers.other]\ncommand = "other"\nargs = []\n`;
    writeFileSync(configPath(ctx.home), user);

    const result = await applyInstall(installerFor("codex").plan(ctx.env), { dataDir: ctx.dataDir });
    expect(result.wrote.length).toBe(2);
    const text = readFileSync(configPath(ctx.home), "utf8");
    expect(text).toContain("# my codex config");
    expect(text).toContain('model = "gpt-5"');
    expect(text).toContain('[projects."/tmp/x"]');
    expect(text).toContain('[mcp_servers.other]');
    expect((text.match(/\[mcp_servers\.aletheia\]/g) ?? []).length).toBe(1);
    expect(text).toContain(`command = ${JSON.stringify(process.execPath)}`);

    const second = await applyInstall(installerFor("codex").plan(ctx.env), { dataDir: ctx.dataDir });
    expect(second.changed).toBe(false);
    expect(readFileSync(configPath(ctx.home), "utf8")).toBe(text);

    writeFileSync(configPath(ctx.home), `${user}\n[mcp_servers.aletheia]\ncommand = "someone-else"\nargs = []\n`);
    expect(() => installerFor("codex").plan(ctx.env)).toThrow(/not ours/);

    writeFileSync(configPath(ctx.home), "{ not toml");
    expect(() => installerFor("codex").plan(ctx.env)).toThrow(/TOML/);
    expect(readFileSync(configPath(ctx.home), "utf8")).toBe("{ not toml");
  });

  test("the installed hooks capture a session without secrets and doctor sees 5/5", async () => {
    const ctx = setup();
    const store = new HubStore(join(ctx.dataDir, "hub.db"));
    store.add({ project: ctx.project, title: "Pinned codex memory", narrative: "the pinned fact survives", kind: "observation", type: "decision", pinned: true, tool: "codex" });
    store.rules.add({ then: "Use the pinned codex fact", tools: ["codex"] });
    store.close();

    await applyInstall(installerFor("codex").plan(ctx.env), { dataDir: ctx.dataDir });
    const commands = commandsFrom(hooksPath(ctx.home));
    expect(Object.keys(commands).sort()).toEqual(["PostToolUse", "SessionEnd", "SessionStart", "Stop", "UserPromptSubmit"]);
    expect(Object.values(commands).every(Boolean)).toBe(true);

    const start = await runCommand(commands.SessionStart, { hook_event_name: "SessionStart", session_id: "codex-1", cwd: ctx.proj, source: "startup", model: "gpt-5" }, ctx);
    expect(start.exitCode).toBe(0);
    expect(start.stdout).toContain("<aletheia-memory>");
    expect(start.stdout).toContain("Pinned codex memory");

    expect((await runCommand(commands.UserPromptSubmit, { hook_event_name: "UserPromptSubmit", session_id: "codex-1", cwd: ctx.proj, prompt: "remember this with sk-ant-api03-abcdefghijklmnopqrstuvwx" }, ctx)).exitCode).toBe(0);
    expect((await runCommand(commands.PostToolUse, { hook_event_name: "PostToolUse", session_id: "codex-1", cwd: ctx.proj, tool_name: "Bash", tool_input: { command: "curl -H 'Authorization: Bearer abcdefghijklmnop12345' x" }, tool_response: "ok" }, ctx)).exitCode).toBe(0);
    expect((await runCommand(commands.Stop, { hook_event_name: "Stop", session_id: "codex-1", cwd: ctx.proj, last_assistant_message: "Finished codex with sk-ant-api03-abcdefghijklmnopqrstuvwx" }, ctx)).exitCode).toBe(0);
    expect((await runCommand(commands.SessionEnd, { hook_event_name: "SessionEnd", session_id: "codex-1", cwd: ctx.proj, reason: "other" }, ctx)).exitCode).toBe(0);

    const read = new HubStore(join(ctx.dataDir, "hub.db"));
    expect(read.list({ project: ctx.project, kind: "prompt", tool: "codex" }).total).toBe(1);
    expect(read.list({ project: ctx.project, kind: "event", tool: "codex" }).total).toBe(1);
    expect(read.list({ project: ctx.project, kind: "summary", tool: "codex" }).total).toBe(1);
    const blob = JSON.stringify(read.db.prepare("SELECT title, narrative FROM memories WHERE tool = 'codex'").all());
    expect(blob).not.toContain("sk-ant-api03");
    expect(blob).not.toContain("abcdefghijklmnop12345");
    expect(blob).toContain("[redacted");
    expect(read.setting("compress.queue", []).some((item) => item.sessionId === "codex-1")).toBe(true);
    read.close();

    const checks = await doctor(ctx.env);
    expect(checks.find((check) => check.name === "hooks codex").ok).toBe(true);
    expect(checks.find((check) => check.name === "hooks codex").detail).toContain("5/5");
  });

  test("uninstall removes the TOML block and our hooks, keeping the user's", async () => {
    const ctx = setup();
    mkdirSync(join(ctx.home, ".codex"), { recursive: true });
    writeFileSync(configPath(ctx.home), `[projects."/tmp/x"]\ntrust_level = "trusted"\n\n[mcp_servers.other]\ncommand = "other"\nargs = []\n`);
    writeFileSync(hooksPath(ctx.home), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "echo user" }] }] } }, null, 2));

    await applyInstall(installerFor("codex").plan(ctx.env), { dataDir: ctx.dataDir });
    const result = applyUninstall(planUninstall("codex", ctx.env, { dataDir: ctx.dataDir }), { dataDir: ctx.dataDir });
    expect(result.removed).toBe(true);
    const text = readFileSync(configPath(ctx.home), "utf8");
    expect(text).not.toContain("[mcp_servers.aletheia]");
    expect(text).toContain("[mcp_servers.other]");
    expect(text).toContain('[projects."/tmp/x"]');
    const hooks = JSON.parse(readFileSync(hooksPath(ctx.home), "utf8"));
    expect(hooks.hooks.Stop).toEqual([{ hooks: [{ type: "command", command: "echo user" }] }]);
    expect(JSON.stringify(hooks)).not.toContain("aletheia-managed");
  });
});
