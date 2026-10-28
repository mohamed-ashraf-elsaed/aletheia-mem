// scripts/hook-check.mjs reads a hub database left by a real host session and reports the hook
// artifacts without writing. These tests feed recorded payloads through the real hook command (`aletheia hook`)
// into a temp data dir, then run the checker on that dir.
import { afterAll, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync } from "node:fs";
import { basename, join } from "node:path";
import { cleanupTempDirs, tempDir } from "./temp-dirs.mjs";
import { HubStore } from "../src/hub/store.mjs";

const root = join(import.meta.dir, "..");

afterAll(() => cleanupTempDirs());

function makeEnv() {
  const dir = tempDir("aletheia-hookcheck-");
  const home = join(dir, "home");
  const dataDir = join(dir, "data");
  const proj = join(dir, "shop");
  for (const path of [home, dataDir, proj]) mkdirSync(path, { recursive: true });
  return {
    dir,
    home,
    dataDir,
    proj,
    project: basename(proj),
    dbPath: join(dataDir, "hub.db"),
    env: { ...process.env, HOME: home, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: join(dataDir, "hub.db") },
  };
}

async function runHook(env, tool, event, payload) {
  const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), "hook", tool, event], { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: root, env });
  proc.stdin.write(JSON.stringify(payload));
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

async function runCheck(dataDir, tool) {
  const proc = Bun.spawn([process.execPath, join(root, "scripts", "hook-check.mjs"), dataDir, "--tool", tool], { stdout: "pipe", stderr: "pipe", cwd: root });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

describe("scripts/hook-check.mjs", () => {
  test("a recorded Claude Code session passes and reports prompt, event and session-end signals", async () => {
    const { env, proj, dataDir } = makeEnv();
    const base = { cwd: proj, session_id: "cc-real" };
    for (const [event, payload] of [
      ["SessionStart", { ...base, hook_event_name: "SessionStart", source: "startup" }],
      ["UserPromptSubmit", { ...base, hook_event_name: "UserPromptSubmit", prompt: "read the README and summarise the licence" }],
      ["PostToolUse", { ...base, hook_event_name: "PostToolUse", tool_name: "Read", tool_input: { file_path: "README.md" }, tool_response: "the README" }],
      ["Stop", { ...base, hook_event_name: "Stop", last_assistant_message: "read the README" }],
      ["SessionEnd", { ...base, hook_event_name: "SessionEnd" }],
    ]) {
      const ran = await runHook(env, "claude-code", event, payload);
      expect(ran.exitCode).toBe(0);
    }

    const check = await runCheck(dataDir, "claude-code");
    expect(check.exitCode).toBe(0);
    expect(check.stdout).toContain("overall: PASS");
    expect(check.stdout).toContain("sessions seen: 1");
    expect(check.stdout).toContain("UserPromptSubmit");
    expect(check.stdout).toContain("PostToolUse");
    expect(check.stdout).toContain("session-end rows");
    expect(check.stdout).toContain("[PASS]");
    expect(check.stdout).toContain("spool: empty");
  });

  test("a recorded Command Code session passes and names the two hooks it cannot install", async () => {
    const { env, proj, dataDir } = makeEnv();
    const base = { cwd: proj, session_id: "cc-real" };
    for (const [event, payload] of [
      ["SessionStart", { ...base, hook_event_name: "SessionStart", source: "startup" }],
      ["PostToolUse", { ...base, hook_event_name: "PostToolUse", tool_name: "shell_command", tool_display_name: "SHELL", tool_input: { command: "cat README.md" }, tool_response: "the README" }],
      ["Stop", { ...base, hook_event_name: "Stop" }],
    ]) {
      const ran = await runHook(env, "command-code", event, payload);
      expect(ran.exitCode).toBe(0);
    }

    const check = await runCheck(dataDir, "command-code");
    expect(check.exitCode).toBe(0);
    expect(check.stdout).toContain("overall: PASS");
    expect(check.stdout).toContain("PostToolUse");
    expect(check.stdout).toContain("not installed: UserPromptSubmit, SessionEnd");
    expect(check.stdout).toContain("spool: empty");
  });

  test("a raw secret still stored in the database is reported as a leak without printing it", async () => {
    const { env, proj, dataDir, dbPath } = makeEnv();
    const base = { cwd: proj, session_id: "cc-leak" };
    await runHook(env, "claude-code", "UserPromptSubmit", { ...base, hook_event_name: "UserPromptSubmit", prompt: "hello there" });
    const secret = "sk-ant-api03-abcdefghijklmnopqrstuvwx";
    const store = new HubStore(dbPath);
    store.add({ project: "shop", kind: "prompt", type: "note", title: "leaked", narrative: `token ${secret} leaked`, tool: "claude-code", sessionId: "cc-leak" });
    store.close();

    const check = await runCheck(dataDir, "claude-code");
    expect(check.exitCode).toBe(1);
    expect(check.stdout).toContain("leak in memories row");
    expect(check.stdout).toContain("overall: FAIL");
    expect(check.stdout).not.toContain(secret);
  });

  test("a non-empty spool and a missing database both fail", async () => {
    const empty = await runCheck(tempDir("aletheia-hookcheck-empty-"), "claude-code");
    expect(empty.exitCode).toBe(1);
    expect(empty.stdout).toContain("hub.db: missing");

    const { dataDir } = makeEnv();
    const spoolDir = join(dataDir, "spool");
    mkdirSync(spoolDir, { recursive: true });
    appendFileSync(join(spoolDir, "hook-spool.jsonl"), '{"kind":"memory","memory":{"project":"shop","kind":"prompt","type":"note","title":"x","narrative":"x","tool":"claude-code"}}\n');
    const spooled = await runCheck(dataDir, "claude-code");
    expect(spooled.exitCode).toBe(1);
    expect(spooled.stdout).toContain("spool: 1 item(s)");
    expect(spooled.stdout).toContain("overall: FAIL");
  });
});
