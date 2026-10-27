import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { loadConfig } from "../src/config.mjs";
import { runHook } from "../src/hub/hooks/run.mjs";
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
const secret = (tool) => `sk-ant-api03-${tool.replace(/[^a-z0-9]/g, "")}abcdefghijkl`;
const bearer = "abcdefghijklmnop12345";

let app;
let cfg;

const envFor = (extra = {}) => ({ ...process.env, HOME: home, ALETHEIA_DATA_DIR: dataDir, ALETHEIA_HUB_DB: dbPath, ...extra });

async function runCli(args) {
  const proc = Bun.spawn([process.execPath, join(root, "bin", "aletheia.mjs"), ...args], { stdin: "ignore", stdout: "pipe", stderr: "pipe", cwd: root, env: envFor() });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

async function runShell(command, payload) {
  const proc = Bun.spawn(["sh", "-c", command], { stdin: "pipe", stdout: "pipe", stderr: "pipe", cwd: proj, env: envFor() });
  proc.stdin.write(JSON.stringify(payload));
  proc.stdin.end();
  const [stdout, stderr, exitCode] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, exitCode };
}

/** Read both documented hook shapes: nested hooks[] and flat {command}. */
function commandsFrom(file) {
  const doc = JSON.parse(readFileSync(file, "utf8"));
  const out = {};
  for (const [event, definitions] of Object.entries(doc.hooks ?? {})) {
    if (!Array.isArray(definitions)) continue;
    for (const definition of definitions) {
      const handlers = Array.isArray(definition?.hooks) ? definition.hooks : [definition];
      const ours = handlers.find((handler) => String(handler?.command).includes("aletheia-managed"));
      if (ours) out[event] = ours.command;
    }
  }
  return out;
}

const CONFIGS = {
  "claude-code": { file: () => join(home, ".claude/settings.json") },
  "command-code": { file: () => join(home, ".commandcode/settings.json") },
  cursor: { file: () => join(home, ".cursor/hooks.json") },
  codex: { file: () => join(home, ".codex/hooks.json") },
  "gemini-cli": { file: () => join(home, ".gemini/settings.json") },
  windsurf: { file: () => join(home, ".codeium/windsurf/hooks.json") },
};

const base = (extra = {}) => ({ cwd: proj, ...extra });

/** One recorded session per tool, using only the fields its own documentation lists. */
async function drive(tool, commands) {
  const s = secret(tool);
  const results = [];
  if (tool === "claude-code") {
    results.push(await runShell(commands.SessionStart, base({ hook_event_name: "SessionStart", session_id: "e2e-claude", source: "startup" })));
    results.push(await runShell(commands.UserPromptSubmit, base({ hook_event_name: "UserPromptSubmit", session_id: "e2e-claude", prompt: `claude prompt ${s}` })));
    results.push(await runShell(commands.PostToolUse, base({ hook_event_name: "PostToolUse", session_id: "e2e-claude", tool_name: "Bash", tool_input: { command: `curl -H 'Authorization: Bearer ${bearer}' x ${tool}` }, tool_response: "ok" })));
    results.push(await runShell(commands.Stop, base({ hook_event_name: "Stop", session_id: "e2e-claude", last_assistant_message: `claude summary ${s}` })));
    results.push(await runShell(commands.SessionEnd, base({ hook_event_name: "SessionEnd", session_id: "e2e-claude" })));
  } else if (tool === "command-code") {
    results.push(await runShell(commands.SessionStart, base({ hook_event_name: "SessionStart", session_id: "e2e-cc", source: "startup" })));
    results.push(await runShell(commands.PostToolUse, base({ hook_event_name: "PostToolUse", session_id: "e2e-cc", tool_name: "shell_command", tool_display_name: "SHELL", tool_input: { command: `curl -H 'Authorization: Bearer ${bearer}' x ${tool}` }, tool_response: "ok" })));
    results.push(await runShell(commands.Stop, base({ hook_event_name: "Stop", session_id: "e2e-cc" })));
  } else if (tool === "cursor") {
    results.push(await runShell(commands.sessionStart, { hook_event_name: "sessionStart", session_id: "e2e-cursor", conversation_id: "e2e-cursor", workspace_roots: [proj], is_background_agent: false, composer_mode: "agent" }));
    results.push(await runShell(commands.beforeSubmitPrompt, { hook_event_name: "beforeSubmitPrompt", conversation_id: "e2e-cursor", workspace_roots: [proj], prompt: `cursor prompt ${s}` }));
    results.push(await runShell(commands.postToolUse, base({ hook_event_name: "postToolUse", conversation_id: "e2e-cursor", tool_name: "Shell", tool_input: { command: `curl -H 'Authorization: Bearer ${bearer}' x ${tool}` }, tool_output: "ok" })));
    results.push(await runShell(commands.afterAgentResponse, base({ hook_event_name: "afterAgentResponse", conversation_id: "e2e-cursor", text: `cursor summary ${s}` })));
    results.push(await runShell(commands.stop, base({ hook_event_name: "stop", conversation_id: "e2e-cursor", status: "completed", loop_count: 0 })));
    results.push(await runShell(commands.sessionEnd, base({ hook_event_name: "sessionEnd", conversation_id: "e2e-cursor", reason: "completed" })));
  } else if (tool === "codex") {
    results.push(await runShell(commands.SessionStart, base({ hook_event_name: "SessionStart", session_id: "e2e-codex", source: "startup" })));
    results.push(await runShell(commands.UserPromptSubmit, base({ hook_event_name: "UserPromptSubmit", session_id: "e2e-codex", prompt: `codex prompt ${s}` })));
    results.push(await runShell(commands.PostToolUse, base({ hook_event_name: "PostToolUse", session_id: "e2e-codex", tool_name: "Bash", tool_input: { command: `curl -H 'Authorization: Bearer ${bearer}' x ${tool}` }, tool_response: "ok" })));
    results.push(await runShell(commands.Stop, base({ hook_event_name: "Stop", session_id: "e2e-codex", last_assistant_message: `codex summary ${s}` })));
    results.push(await runShell(commands.SessionEnd, base({ hook_event_name: "SessionEnd", session_id: "e2e-codex", reason: "other" })));
  } else if (tool === "gemini-cli") {
    results.push(await runShell(commands.SessionStart, base({ hook_event_name: "SessionStart", session_id: "e2e-gem", source: "startup", timestamp: "2026-10-26T00:00:00Z" })));
    results.push(await runShell(commands.BeforeAgent, base({ hook_event_name: "BeforeAgent", session_id: "e2e-gem", prompt: `gemini prompt ${s}` })));
    results.push(await runShell(commands.AfterTool, base({ hook_event_name: "AfterTool", session_id: "e2e-gem", tool_name: "run_shell_command", tool_input: { command: `curl -H 'Authorization: Bearer ${bearer}' x ${tool}` }, tool_response: { llmContent: "ok" } })));
    results.push(await runShell(commands.AfterAgent, base({ hook_event_name: "AfterAgent", session_id: "e2e-gem", prompt: "x", prompt_response: `gemini summary ${s}` })));
    results.push(await runShell(commands.SessionEnd, base({ hook_event_name: "SessionEnd", session_id: "e2e-gem", reason: "exit" })));
  } else if (tool === "windsurf") {
    results.push(await runShell(commands.pre_user_prompt, { agent_action_name: "pre_user_prompt", trajectory_id: "e2e-wf", tool_info: { user_prompt: `windsurf prompt ${s}` } }));
    results.push(await runShell(commands.post_run_command, { agent_action_name: "post_run_command", trajectory_id: "e2e-wf", tool_info: { command_line: `curl -H 'Authorization: Bearer ${bearer}' x ${tool}`, cwd: proj } }));
    results.push(await runShell(commands.post_write_code, { agent_action_name: "post_write_code", trajectory_id: "e2e-wf", tool_info: { file_path: join(proj, "a.mjs"), edits: [{ old_string: "a", new_string: "b" }] } }));
    results.push(await runShell(commands.post_cascade_response, { agent_action_name: "post_cascade_response", trajectory_id: "e2e-wf", tool_info: { response: `windsurf summary ${s}` } }));
  }
  for (const result of results) expect(result.exitCode).toBe(0);
  return results;
}

const EXPECTED = {
  "claude-code": { prompt: 1, event: 1, summary: 1 },
  "command-code": { prompt: 0, event: 1, summary: 0 },
  cursor: { prompt: 1, event: 1, summary: 1 },
  codex: { prompt: 1, event: 1, summary: 1 },
  "gemini-cli": { prompt: 1, event: 1, summary: 1 },
  windsurf: { prompt: 1, event: 2, summary: 1 },
};

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
  store.add({ project, title: "Pinned multi-host memory", narrative: "the pinned fact survives a session", kind: "observation", type: "decision", pinned: true, tool: "claude-code" });
  store.rules.add({ then: "Use the pinned multi-host fact" });
  store.close();
});

afterAll(() => app.stop());

describe.skipIf(process.platform === "win32")("T-140: end to end capture for every full-capability host (needs a POSIX shell for the hook commands)", () => {
  test("install, feed a recorded payload set, assert rows and no secrets", async () => {
    for (const tool of Object.keys(CONFIGS)) {
      const install = await runCli(["install", tool, "--write"]);
      expect(install.exitCode).toBe(0);
      expect(install.stdout).toContain("Wrote");
      const commands = commandsFrom(CONFIGS[tool].file());
      const key = tool === "cursor" ? "sessionStart" : tool === "windsurf" ? "pre_user_prompt" : "SessionStart";
      expect(commands[key]).toBeTruthy();
      await drive(tool, commands);

      const store = new HubStore(dbPath);
      const expected = EXPECTED[tool];
      for (const [kind, count] of Object.entries(expected)) {
        expect(store.list({ project, kind, tool }).total).toBe(count);
      }
      const blob = JSON.stringify(store.db.prepare("SELECT title, narrative FROM memories WHERE tool = ?").all(tool));
      expect(blob).not.toContain("sk-ant-api03-");
      expect(blob).not.toContain(bearer);
      expect(blob).toContain("[redacted");
      store.close();
    }
  }, 30_000);

  test("hook work stays under 100 ms at p95 for every host", async () => {
    const cases = {
      "claude-code": ["PostToolUse", { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "echo p95" }, tool_response: "ok" }],
      "command-code": ["PostToolUse", { hook_event_name: "PostToolUse", tool_name: "shell_command", tool_input: { command: "echo p95" }, tool_response: "ok" }],
      cursor: ["postToolUse", { hook_event_name: "postToolUse", tool_name: "Shell", tool_input: { command: "echo p95" }, tool_output: "ok" }],
      codex: ["PostToolUse", { hook_event_name: "PostToolUse", tool_name: "Bash", tool_input: { command: "echo p95" }, tool_response: "ok" }],
      "gemini-cli": ["AfterTool", { hook_event_name: "AfterTool", tool_name: "run_shell_command", tool_input: { command: "echo p95" }, tool_response: { llmContent: "ok" } }],
      windsurf: ["post_run_command", { agent_action_name: "post_run_command", tool_info: { command_line: "echo p95", cwd: proj } }],
    };
    for (const [tool, [event, payload]] of Object.entries(cases)) {
      const times = [];
      for (let i = 0; i < 25; i++) {
        const started = performance.now();
        const result = await runHook({
          tool,
          event,
          stdin: JSON.stringify({ ...payload, cwd: proj, session_id: "p95", conversation_id: "p95", trajectory_id: "p95" }),
          config: { hubDb: dbPath, dataDir },
        });
        expect(result.exitCode).toBe(0);
        times.push(performance.now() - started);
      }
      times.sort((a, b) => a - b);
      const p95 = times[Math.ceil(0.95 * times.length) - 1];
      console.log(`${tool} hook work p95 ${p95.toFixed(2)} ms over ${times.length} runs`);
      expect(p95).toBeLessThan(100);
    }
  });
});
