import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { runHook } from "../src/hub/hooks/run.mjs";
import { spoolPath, spoolRead } from "../src/hub/hooks/shared.mjs";
import { HubStore } from "../src/hub/store.mjs";
import { startServer } from "../src/server.mjs";
import { makeFixture } from "./fixture.mjs";

const root = join(import.meta.dir, "..");
const fx = makeFixture();
const home = fx.makeDir("home");
const dataDir = fx.makeDir("data");
const proj = fx.makeDir("shop");
const project = basename(proj);
const dbPath = join(dataDir, "hub.db");
let app;
let cfg;

const envFor = (extra = {}) => ({ ...process.env, HOME: home, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: dbPath, ...extra });

async function runShell(command, stdin, extra = {}) {
  const proc = Bun.spawn(["sh", "-c", command], { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: root, env: envFor(extra) });
  if (stdin) proc.stdin.write(stdin);
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

async function runCli(args, extra = {}) {
  const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env: envFor(extra) });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

function installedCommands(settingsPath) {
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  return Object.fromEntries(
    Object.entries(settings.hooks).map(([event, definitions]) => [event, definitions.flatMap((definition) => definition.hooks).find((hook) => hook.command.includes("aletheia-managed"))?.command ?? null]),
  );
}

const event = (name, extra = {}) => JSON.stringify({ hook_event_name: name, cwd: proj, session_id: "e2e-session", ...extra });

beforeAll(async () => {
  cfg = loadConfig({
    port: 0,
    sourceDb: fx.dbPath,
    dataDir,
    overlayDb: join(fx.dir, "overlay.db"),
    reviewDb: join(fx.dir, "review.db"),
    ledgerDir: fx.makeDir("ledger"),
    humanCopyCache: join(fx.dir, "human-copy.json"),
    rulesFile: join(fx.dir, "RULES.md"),
    claudeInstructionsFile: join(fx.dir, "CLAUDE.md"),
    hubDb: dbPath,
    provider: "none",
    extra: { home },
  });
  app = startServer(cfg);

  const store = new HubStore(dbPath);
  store.add({ project, title: "Pinned e2e memory", narrative: "the pinned fact survives a session", kind: "observation", type: "decision", pinned: true, tool: "claude-code" });
  store.rules.add({ then: "Use the pinned fact", tools: ["claude-code"] });
  store.close();
});

afterAll(() => app.stop());

describe.skipIf(process.platform === "win32")("end to end: install, hooks, server, spool, doctor, uninstall (needs a POSIX shell for the hook commands)", () => {
  test("one install command wires Claude Code, and the installed commands capture a session", async () => {
    const install = await runCli(["install", "claude-code", "--write"]);
    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain("Wrote 3 file(s)");

    const commands = installedCommands(join(home, ".claude/settings.json"));
    expect(Object.values(commands).every(Boolean)).toBe(true);
    expect(commands.SessionStart).toContain(join(dataDir, "aletheia.bundle.mjs"));
    expect(commands.SessionStart).toContain("hook claude-code SessionStart");

    const start = await runShell(commands.SessionStart, event("SessionStart", { source: "startup" }));
    expect(start.exitCode).toBe(0);
    expect(start.stdout).toContain("<aletheia-memory>");
    expect(start.stdout).toContain("Pinned e2e memory");
    expect(start.stdout).toContain("## Rules");
    expect(start.stdout).toContain("Use the pinned fact");

    expect((await runShell(commands.UserPromptSubmit, event("UserPromptSubmit", { prompt: "remember this prompt with sk-ant-api03-abcdefghijklmnopqrstuvwx" }))).exitCode).toBe(0);
    expect((await runShell(commands.PostToolUse, event("PostToolUse", { tool_name: "Bash", tool_input: { command: "curl -H 'Authorization: Bearer abcdefghijklmnop12345' x" }, tool_response: "ok" }))).exitCode).toBe(0);
    expect((await runShell(commands.Stop, event("Stop", { last_assistant_message: "Finished the e2e work." }))).exitCode).toBe(0);
    expect((await runShell(commands.SessionEnd, event("SessionEnd"))).exitCode).toBe(0);

    const store = new HubStore(dbPath);
    expect(store.list({ project, kind: "prompt" }).total).toBe(1);
    expect(store.list({ project, kind: "event" }).total).toBe(1);
    expect(store.list({ project, kind: "summary" }).total).toBe(1);
    const blob = JSON.stringify(store.db.prepare("SELECT title, narrative FROM memories").all());
    expect(blob).not.toContain("sk-ant-api03");
    expect(blob).not.toContain("abcdefghijklmnop12345");
    expect(blob).toContain("[redacted");
    expect(store.setting("compress.queue", []).some((item) => item.sessionId === "e2e-session")).toBe(true);
    store.close();

    // The server that a user runs alongside the hooks still answers.
    const health = await fetch(`http://127.0.0.1:${app.server.port}/healthz`);
    expect(health.status).toBe(200);
  });

  test("Command Code installs its own hooks; prompts are not captured because the event does not exist", async () => {
    const install = await runCli(["install", "command-code", "--write"]);
    expect(install.exitCode).toBe(0);
    expect(install.stdout).toContain("no UserPromptSubmit hook");
    expect(install.stdout).toContain("no SessionEnd hook");
    expect(install.stdout).toContain("no compact source");

    const commands = installedCommands(join(home, ".commandcode/settings.json"));
    expect(Object.keys(commands).sort()).toEqual(["PostToolUse", "SessionStart", "Stop"]);
    expect(commands.SessionStart).toContain("hook command-code SessionStart");

    const start = await runShell(commands.SessionStart, event("SessionStart", { source: "startup", session_id: "cc-session" }));
    expect(start.exitCode).toBe(0);
    expect(start.stdout).toContain("Pinned e2e memory");

    expect((await runShell(commands.PostToolUse, event("PostToolUse", { session_id: "cc-session", tool_name: "shell_command", tool_display_name: "SHELL", tool_input: { command: "ls -la" }, tool_response: "a\nb" }))).exitCode).toBe(0);
    expect((await runShell(commands.Stop, event("Stop", { session_id: "cc-session" }))).exitCode).toBe(0);

    const store = new HubStore(dbPath);
    expect(store.list({ project, kind: "event", tool: "command-code" }).total).toBe(1);
    expect(store.list({ project, kind: "prompt", tool: "command-code" }).total).toBe(0);
    store.close();
  });

  test("a run while the store is unavailable spools, and the next run flushes everything", async () => {
    const commands = installedCommands(join(home, ".claude/settings.json"));
    const badDb = fx.makeDir("not-a-database");
    const down = await runShell(commands.UserPromptSubmit, event("UserPromptSubmit", { prompt: "spooled while the server was down", session_id: "spool-session" }), { ALETHEIA_HUB_DB: badDb });
    expect(down.exitCode).toBe(0);
    expect(existsSync(spoolPath(dataDir))).toBe(true);
    expect(readFileSync(spoolPath(dataDir), "utf8")).toContain("spooled while the server was down");

    expect((await runShell(commands.PostToolUse, event("PostToolUse", { tool_name: "Read", tool_input: { file_path: "later.mjs" }, tool_response: "ok", session_id: "spool-session" }))).exitCode).toBe(0);
    expect(spoolRead(dataDir)).toEqual([]);

    const store = new HubStore(dbPath);
    expect(store.list({ project, kind: "prompt" }).items.some((row) => row.narrative.includes("spooled while the server was down"))).toBe(true);
    store.close();
  });

  test("hook work stays under 100 ms at p95 over 50 runs", async () => {
    const times = [];
    for (let i = 0; i < 50; i++) {
      const started = performance.now();
      const result = await runHook({
        tool: "claude-code",
        event: "PostToolUse",
        stdin: JSON.stringify({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "echo perf-" + i }, tool_response: "ok", cwd: proj, session_id: "p95" }),
        config: { hubDb: dbPath, dataDir },
      });
      times.push(performance.now() - started);
      expect(result.exitCode).toBe(0);
    }
    times.sort((a, b) => a - b);
    const p95 = times[Math.ceil(0.95 * times.length) - 1];
    console.log(`hook work p95 ${p95.toFixed(2)} ms over ${times.length} runs`);
    // This measures the hook's own work (open, redact, write, close). The host's process spawn is outside it.
    expect(p95).toBeLessThan(100);
  });

  test("doctor sees the server, both hook sets, an empty spool and the last capture", async () => {
    const doctor = await runCli(["doctor"], { ALETHEIA_PORT: String(app.server.port) });
    expect(doctor.exitCode).toBe(0);
    expect(doctor.stdout).toContain("ok   server");
    expect(doctor.stdout).toContain("ok   hooks claude-code");
    expect(doctor.stdout).toContain("5/5");
    expect(doctor.stdout).toContain("ok   hooks command-code");
    expect(doctor.stdout).toContain("3/3");
    expect(doctor.stdout).toContain("ok   spool");
    expect(doctor.stdout).toMatch(/ok {2,}last capture/);
  });

  test("uninstall removes only the installed entries", async () => {
    const uninstall = await runCli(["uninstall", "claude-code", "--write"]);
    expect(uninstall.exitCode).toBe(0);
    const settings = JSON.parse(readFileSync(join(home, ".claude/settings.json"), "utf8"));
    const remaining = Object.values(settings.hooks ?? {}).flatMap((definitions) => definitions.flatMap((definition) => definition.hooks));
    expect(remaining.some((hook) => hook.command.includes("aletheia-managed"))).toBe(false);
    expect(JSON.parse(readFileSync(join(home, ".claude.json"), "utf8")).mcpServers.aletheia).toBeUndefined();

    const again = await runCli(["uninstall", "claude-code"]);
    expect(again.exitCode).toBe(0);
    expect(again.stdout).toContain("not installed");
  });
});
