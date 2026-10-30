// One-command installers: preview, back up, merge and apply the MCP entry, hooks and rules a tool needs.
// Each installer supplies plan/apply/detect/uninstall; the shared helpers handle JSON/TOML merge, hashes,
// backups, the manifest and removal. A format is only written when its shape came from the tool's docs or a
// real config file; docs/25-installers.md records the source and date for every one.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, join } from "node:path";
import { applyBlock, removeBlock, renderRules, targetPath } from "./rules-sync.mjs";
import { MARK_BEGIN, MARK_END, resolveMcpPath, toolById, TOOLS, verificationStatus } from "./tools.mjs";
import { WINDOWS, modeOctal } from "./permissions.mjs";
import { spoolPath, spoolRead } from "./hooks/shared.mjs";

export const MANIFEST_FILE = "install-manifest.json";
export const MANIFEST_VERSION = 2;
export const HOOK_MARKER = "aletheia-managed";
export const SERVER_NAME = "aletheia";
export const CAPABILITIES = ["full", "mcp+rules", "rules-only"];
export const VERIFICATION = ["tested-on-real-install", "from-docs-only", "mcp-verified"];

const quote = (value) => (/^[A-Za-z0-9_./:@%+=-]+$/.test(value) ? value : `'${String(value).replace(/'/g, `'\\''`)}'`);

/** The exact command a hook entry runs. The trailing comment is our marker; shells ignore it. */
export function hookCommand({ bun, hookScript, tool, event }) {
  return `${quote(bun)} ${quote(hookScript)} hook ${tool} ${event} # ${HOOK_MARKER}`;
}

export const isOurHook = (command) => typeof command === "string" && command.includes(HOOK_MARKER);

/** The script a hook command runs: the single-file bundle when the installer built one, else the source CLI. */
const runnerFor = (env) => env.hookRunner || env.hookScript;

const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");
const backupName = (file, at = stamp()) => `${file}.aletheia-bak-${at}`;
const hashText = (text) => createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");
const plainObject = (value) => !!value && typeof value === "object" && !Array.isArray(value);
const clone = (value) => JSON.parse(JSON.stringify(value));
const jsonText = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

function readJson(file, fallback) {
  if (!existsSync(file)) return { text: null, doc: fallback };
  const text = readFileSync(file, "utf8");
  if (!text.trim()) return { text, doc: fallback };
  try {
    const doc = JSON.parse(text);
    if (!plainObject(doc)) throw new Error("not an object");
    return { text, doc };
  } catch {
    throw new RangeError(`${file} is not a JSON object. Fix it by hand first; aletheia will not overwrite it.`);
  }
}

/**
 * Remove every handler this installer wrote, in either documented shape:
 *   nested  hooks.<Event>[].hooks[]  (Claude Code, Command Code, Codex, Gemini)
 *   flat    hooks.<Event>[]          (Cursor, Windsurf)
 * User handlers and every other field are kept. Mutates `doc`.
 */
export function stripOurHooks(doc) {
  if (!plainObject(doc?.hooks)) return doc;
  for (const event of Object.keys(doc.hooks)) {
    const definitions = Array.isArray(doc.hooks[event]) ? doc.hooks[event] : [];
    const kept = [];
    for (const definition of definitions) {
      if (Array.isArray(definition?.hooks)) {
        const handlers = definition.hooks.filter((handler) => !isOurHook(handler?.command));
        if (handlers.length) kept.push({ ...definition, hooks: handlers });
      } else if (!isOurHook(definition?.command)) {
        kept.push(definition);
      }
    }
    if (kept.length) doc.hooks[event] = kept;
    else delete doc.hooks[event];
  }
  if (!Object.keys(doc.hooks).length) delete doc.hooks;
  return doc;
}

function planHooks({ file, events, env, tool, timeout = 10, timeouts = {} }) {
  const { text, doc } = readJson(file, {});
  const next = clone(doc);
  if (!plainObject(next.hooks)) next.hooks = {};
  stripOurHooks(next);
  if (!plainObject(next.hooks)) next.hooks = {};
  const commands = {};
  for (const [event, matcher] of Object.entries(events)) {
    const command = hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool, event });
    commands[event] = command;
    const eventTimeout = timeouts[event] ?? timeout;
    const definition = { ...(matcher ? { matcher } : {}), hooks: [{ type: "command", command, timeout: eventTimeout }] };
    next.hooks[event] = [...(next.hooks[event] ?? []), definition];
  }
  const after = jsonText(next);
  return { kind: "hooks", title: `hooks in ${file}`, file, before: text, after, changed: text !== after, commands };
}

/** Cursor and Windsurf document a flat per-event array: { command, timeout? }. */
function planFlatHooks({ file, version, events, env, tool, timeout }) {
  const { text, doc } = readJson(file, version == null ? {} : { version });
  const next = clone(doc);
  if (version != null) {
    if (next.version != null && next.version !== version) throw new RangeError(`${file} has version ${next.version}; expected ${version}.`);
    next.version = version;
  }
  if (!plainObject(next.hooks)) next.hooks = {};
  stripOurHooks(next);
  if (!plainObject(next.hooks)) next.hooks = {};
  const commands = {};
  for (const event of Object.keys(events)) {
    const command = hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool, event });
    commands[event] = command;
    const definition = { command };
    if (timeout != null) definition.timeout = timeout;
    next.hooks[event] = [...(next.hooks[event] ?? []), definition];
  }
  const after = jsonText(next);
  return { kind: "hooks", title: `hooks in ${file}`, file, before: text, after, changed: text !== after, commands };
}

function planMcp({ file, entry, key = "mcpServers" }) {
  const { text, doc } = readJson(file, {});
  const next = clone(doc);
  if (!plainObject(next[key])) next[key] = {};
  next[key][SERVER_NAME] = entry;
  const after = jsonText(next);
  return { kind: "mcp", title: `MCP server in ${file}`, file, before: text, after, changed: text !== after, entry, key };
}

/** One JSON step that changes several keys at once (Gemini keeps hooks and MCP in settings.json). */
function planJsonStep({ file, kind = "settings", title, mutate }) {
  const { text, doc } = readJson(file, {});
  const next = clone(doc);
  const extra = mutate(next) ?? {};
  const after = jsonText(next);
  return { kind, title: title ?? `${kind} in ${file}`, file, before: text, after, changed: text !== after, ...extra };
}

/** Minimal TOML guard: refuse a clearly broken file, and refuse to duplicate our own table. */
function validateToml(text) {
  if (!text.trim()) return;
  if (text.trimStart().startsWith("{")) throw new RangeError("config.toml looks like JSON, not TOML. Fix it by hand first.");
  let header = 0;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line === "[mcp_servers.aletheia]" || line.startsWith("[mcp_servers.aletheia]")) header++;
    const quotes = (line.replace(/#.*$/, "").match(/"/g) ?? []).length;
    if (quotes % 2 !== 0) throw new RangeError("config.toml has an unbalanced quote. Fix it by hand first.");
  }
  if (header > 1) throw new RangeError("config.toml already has more than one [mcp_servers.aletheia] table. Fix it by hand first.");
}

function tomlSection(text, header = "[mcp_servers.aletheia]") {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.trim() === header);
  if (start === -1) return null;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s*\[/.test(lines[i])) { end = i; break; }
  }
  return { start, end, body: lines.slice(start, end).join("\n") };
}

// A TOML basic string escapes backslashes and quotes like JSON does, so a Windows path is written as "C:\\Users\\x".
// Read it back through JSON.parse; reading the raw text would never match the path the installer wrote.
function tomlString(raw) {
  try {
    return JSON.parse(`"${raw}"`);
  } catch {
    return raw;
  }
}

function tomlEntry(body) {
  const command = /^\s*command\s*=\s*"((?:[^"\\]|\\.)*)"/m.exec(body)?.[1];
  const argText = /^\s*args\s*=\s*\[([\s\S]*?)\]/m.exec(body)?.[1] ?? "";
  const args = [...argText.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((match) => tomlString(match[1]));
  return { command: command === undefined ? null : tomlString(command), args };
}

function planMcpToml({ file, entry }) {
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  validateToml(before);
  const block = `[mcp_servers.${SERVER_NAME}]\ncommand = ${JSON.stringify(entry.command)}\nargs = ${JSON.stringify(entry.args)}\n`;
  const section = tomlSection(before);
  if (section) {
    const current = tomlEntry(section.body);
    const ours = current.command === entry.command && JSON.stringify(current.args) === JSON.stringify(entry.args);
    if (!ours) throw new RangeError(`${file} already has [mcp_servers.${SERVER_NAME}] that is not ours. Left alone.`);
    return { kind: "mcp", title: `MCP server in ${file}`, file, before, after: before, changed: false, entry };
  }
  const lead = before === "" ? "" : before.endsWith("\n") ? "\n" : "\n\n";
  const after = `${before}${lead}${block}`;
  return { kind: "mcp", title: `MCP server in ${file}`, file, before: before || null, after, changed: true, entry };
}

function removeTomlSection(text) {
  const section = tomlSection(text);
  if (!section) return text;
  const lines = text.split("\n");
  const before = lines.slice(0, section.start);
  let after = lines.slice(section.end);
  if (before.length && after.length && before[before.length - 1].trim() === "" && after[0].trim() === "") after = after.slice(1);
  return [...before, ...after].join("\n").replace(/\n{3,}/g, "\n\n");
}

function planRules({ tool, home, rules }) {
  const file = targetPath(tool, { scope: "global", home });
  if (!file) return null;
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  const { markdown, count } = renderRules(rules, tool);
  const after = applyBlock(before, markdown);
  return { kind: "rules", title: `rules in ${file}`, file, before, after, changed: before !== after, rules: count, markers: [MARK_BEGIN, MARK_END] };
}

const claudeEvents = { SessionStart: "startup|clear|compact", UserPromptSubmit: null, PostToolUse: "*", Stop: null, SessionEnd: null };

function defineInstaller(spec) {
  const capabilities = spec.capabilities ?? "full";
  const verification = spec.verification ?? "from-docs-only";
  if (!CAPABILITIES.includes(capabilities)) throw new RangeError(`Unknown capability: ${capabilities}`);
  if (!VERIFICATION.includes(verification)) throw new RangeError(`Unknown verification: ${verification}`);
  const installer = {
    capabilities,
    verification,
    evidence: spec.evidence ?? "",
    detection: spec.detection ?? [],
    notes: spec.notes ?? [],
    events: spec.events ?? [],
    ...spec,
  };
  const originalPlan = spec.plan;
  installer.plan = (env) => {
    const plan = originalPlan.call(installer, env);
    return { capabilities, verification, evidence: installer.evidence, ...plan };
  };
  installer.apply = spec.apply ?? ((plan, opts) => applyInstall(plan, opts));
  installer.uninstall = spec.uninstall ?? ((env, opts) => applyUninstall(planUninstall(installer.id, env, opts), opts));
  installer.detect = spec.detect ?? ((home) => installer.detection.some((path) => existsSync(join(home, path))));
  return installer;
}

export const INSTALLERS = [
  defineInstaller({
    id: "claude-code",
    name: "Claude Code",
    capabilities: "full",
    verification: "mcp-verified",
    toolVersion: "2.1.312",
    verifiedOn: "2026-10-27",
    hookNote: "hooks ran in real sessions over two days of use; one user on one machine",
    evidence: "hook file and ~/.claude.json checked on a real install (2026-10-26); MCP server listed by Claude Code 2.1.312 on 2026-10-27; hooks ran in real sessions over two days of use; one user on one machine",
    detection: [".claude"],
    notes: ["The hook shape was checked against a real installed plugin; hooks ran in real Claude Code sessions over two days of use; one user on one machine."],
    events: ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"],
    plan(env) {
      const settingsFile = join(env.home, ".claude", "settings.json");
      const mcpFile = join(env.home, ".claude.json");
      const steps = [
        planMcp({ file: mcpFile, entry: { type: "stdio", command: env.bun, args: [env.mcpScript], env: {} } }),
        planHooks({ file: settingsFile, events: claudeEvents, env, tool: "claude-code" }),
        planRules({ tool: "claude-code", home: env.home, rules: env.rules ?? [] }),
      ].filter(Boolean);
      return { tool: "claude-code", name: "Claude Code", env, steps, notes: ["The hook shape was checked against a real installed plugin; hooks ran in real Claude Code sessions over two days of use; one user on one machine."] };
    },
    expectedHooks(env) {
      return { file: join(env.home, ".claude", "settings.json"), commands: Object.fromEntries(Object.keys(claudeEvents).map((event) => [event, hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool: "claude-code", event })])) };
    },
  }),
  defineInstaller({
    id: "command-code",
    name: "Command Code",
    capabilities: "full",
    verification: "mcp-verified",
    toolVersion: "1.88.1",
    verifiedOn: "2026-10-27",
    hookNote: "hooks ran in one short session; one user on one machine",
    evidence: "bundled CLI reference generated from commandcode.ai/docs plus real files (2026-10-26); MCP server listed by Command Code 1.88.1 on 2026-10-27; hooks ran in one short session; one user on one machine",
    detection: [".commandcode"],
    notes: [
      "Command Code has no UserPromptSubmit hook: user prompts are not captured.",
      "Command Code has no SessionEnd hook: session-end summaries are not captured.",
      "Command Code SessionStart reports startup, resume or clear only; there is no compact source.",
    ],
    events: ["SessionStart", "PostToolUse", "Stop"],
    plan(env) {
      const settingsFile = join(env.home, ".commandcode", "settings.json");
      const mcpFile = join(env.home, ".commandcode", "mcp.json");
      const steps = [
        planMcp({ file: mcpFile, entry: { transport: "stdio", command: env.bun, args: [env.mcpScript] } }),
        planHooks({ file: settingsFile, events: { SessionStart: null, PostToolUse: null, Stop: null }, env, tool: "command-code" }),
        planRules({ tool: "command-code", home: env.home, rules: env.rules ?? [] }),
      ].filter(Boolean);
      return { tool: "command-code", name: "Command Code", env, steps, notes: [
        "Command Code has no UserPromptSubmit hook: user prompts are not captured.",
        "Command Code has no SessionEnd hook: session-end summaries are not captured.",
        "Command Code SessionStart reports startup, resume or clear only; there is no compact source.",
      ] };
    },
    expectedHooks(env) {
      return { file: join(env.home, ".commandcode", "settings.json"), commands: Object.fromEntries(["SessionStart", "PostToolUse", "Stop"].map((event) => [event, hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool: "command-code", event })])) };
    },
  }),
  defineInstaller({
    id: "cursor",
    name: "Cursor",
    capabilities: "full",
    verification: "from-docs-only",
    evidence: "https://cursor.com/docs/agent/hooks, /docs/context/mcp and /docs/context/rules fetched 2026-10-26; Cursor is not installed on this machine",
    detection: [".cursor"],
    notes: [
      "Cursor is not installed here: the config and payloads were tested against fixtures, not a real Cursor install.",
      "The stop hook carries no assistant text; afterAgentResponse stores the summary and stop queues compression.",
      "Cursor has no global rules file. Use `aletheia rules sync --tools cursor --dir <project> --write` for .cursor/rules/aletheia.mdc.",
    ],
    events: ["sessionStart", "beforeSubmitPrompt", "postToolUse", "afterAgentResponse", "stop", "sessionEnd"],
    plan(env) {
      const hooks = { sessionStart: null, beforeSubmitPrompt: null, postToolUse: null, afterAgentResponse: null, stop: null, sessionEnd: null };
      const steps = [
        planMcp({ file: join(env.home, ".cursor", "mcp.json"), entry: { command: env.bun, args: [env.mcpScript] } }),
        planFlatHooks({ file: join(env.home, ".cursor", "hooks.json"), version: 1, events: hooks, env, tool: "cursor", timeout: 10 }),
      ];
      return { tool: "cursor", name: "Cursor", env, steps, notes: [
        "Cursor is not installed here: the config and payloads were tested against fixtures, not a real Cursor install.",
        "The stop hook carries no assistant text; afterAgentResponse stores the summary and stop queues compression.",
        "Cursor has no global rules file. Use `aletheia rules sync --tools cursor --dir <project> --write` for .cursor/rules/aletheia.mdc.",
      ] };
    },
    expectedHooks(env) {
      const events = ["sessionStart", "beforeSubmitPrompt", "postToolUse", "afterAgentResponse", "stop", "sessionEnd"];
      return { file: join(env.home, ".cursor", "hooks.json"), commands: Object.fromEntries(events.map((event) => [event, hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool: "cursor", event })])) };
    },
  }),
  defineInstaller({
    id: "codex",
    name: "Codex CLI",
    capabilities: "full",
    verification: "mcp-verified",
    toolVersion: "0.130.0",
    verifiedOn: "2026-10-27",
    hookNote: "hooks ran in one interactive session (reviewed once with /hooks); one user on one machine",
    evidence: "https://developers.openai.com/codex/hooks, /codex/config-reference and /codex/agent-configuration/agents-md fetched 2026-10-26; MCP server listed by Codex 0.130.0 on 2026-10-27; hooks ran in one interactive session (reviewed once with /hooks); one user on one machine",
    detection: [".codex"],
    notes: [
      "Codex requires non-managed hooks to be reviewed once with /hooks before they run.",
      "Global rules go to ~/.codex/AGENTS.md; project rules go to AGENTS.md via rules sync.",
      "The MCP block is written to ~/.codex/config.toml; hooks go to ~/.codex/hooks.json.",
    ],
    events: ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"],
    plan(env) {
      const events = { SessionStart: "startup|clear|compact|fork", UserPromptSubmit: null, PostToolUse: null, Stop: null, SessionEnd: null };
      const steps = [
        planMcpToml({ file: join(env.home, ".codex", "config.toml"), entry: { command: env.bun, args: [env.mcpScript] } }),
        planHooks({ file: join(env.home, ".codex", "hooks.json"), events, env, tool: "codex", timeouts: { SessionEnd: 3 } }),
        planRules({ tool: "codex", home: env.home, rules: env.rules ?? [] }),
      ].filter(Boolean);
      return { tool: "codex", name: "Codex CLI", env, steps, notes: [
        "Codex requires non-managed hooks to be reviewed once with /hooks before they run.",
        "Global rules go to ~/.codex/AGENTS.md; project rules go to AGENTS.md via rules sync.",
        "The MCP block is written to ~/.codex/config.toml; hooks go to ~/.codex/hooks.json.",
      ] };
    },
    expectedHooks(env) {
      const events = { SessionStart: "startup|clear|compact|fork", UserPromptSubmit: null, PostToolUse: null, Stop: null, SessionEnd: null };
      return { file: join(env.home, ".codex", "hooks.json"), commands: Object.fromEntries(Object.keys(events).map((event) => [event, hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool: "codex", event })])) };
    },
  }),
  defineInstaller({
    id: "gemini-cli",
    name: "Gemini CLI",
    capabilities: "full",
    verification: "from-docs-only",
    evidence: "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md, docs/tools/mcp-server.md and docs/cli/gemini-md.md fetched 2026-10-26; Gemini 0.37.0 present, no hook run",
    detection: [".gemini"],
    notes: [
      "Gemini keeps hooks and MCP servers in the same ~/.gemini/settings.json; the installer merges both.",
      "Gemini hook timeouts are milliseconds; the installer writes 10000.",
      "No real Gemini hook has run here.",
    ],
    events: ["SessionStart", "BeforeAgent", "AfterTool", "AfterAgent", "SessionEnd"],
    plan(env) {
      const file = join(env.home, ".gemini", "settings.json");
      const events = { SessionStart: null, BeforeAgent: null, AfterTool: null, AfterAgent: null, SessionEnd: null };
      const step = planJsonStep({
        file,
        kind: "settings",
        title: `MCP and hooks in ${file}`,
        mutate(doc) {
          if (!plainObject(doc.mcpServers)) doc.mcpServers = {};
          const existing = doc.mcpServers[SERVER_NAME];
          if (existing && !(existing.command === env.bun && Array.isArray(existing.args) && existing.args[0] === env.mcpScript)) {
            throw new RangeError(`${file} already has mcpServers.${SERVER_NAME} that is not ours. Left alone.`);
          }
          doc.mcpServers[SERVER_NAME] = { command: env.bun, args: [env.mcpScript] };
          stripOurHooks(doc);
          if (!plainObject(doc.hooks)) doc.hooks = {};
          const commands = {};
          for (const event of Object.keys(events)) {
            const command = hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool: "gemini-cli", event });
            commands[event] = command;
            doc.hooks[event] = [...(doc.hooks[event] ?? []), { hooks: [{ type: "command", command, timeout: 10000 }] }];
          }
          return { commands };
        },
      });
      const rules = planRules({ tool: "gemini-cli", home: env.home, rules: env.rules ?? [] });
      return { tool: "gemini-cli", name: "Gemini CLI", env, steps: [step, rules].filter(Boolean), notes: [
        "Gemini keeps hooks and MCP servers in the same ~/.gemini/settings.json; the installer merges both.",
        "Gemini hook timeouts are milliseconds; the installer writes 10000.",
        "No real Gemini hook has run here.",
      ] };
    },
    expectedHooks(env) {
      const events = ["SessionStart", "BeforeAgent", "AfterTool", "AfterAgent", "SessionEnd"];
      return { file: join(env.home, ".gemini", "settings.json"), commands: Object.fromEntries(events.map((event) => [event, hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool: "gemini-cli", event })])) };
    },
  }),
  defineInstaller({
    id: "windsurf",
    name: "Windsurf",
    capabilities: "full",
    verification: "from-docs-only",
    evidence: "https://docs.windsurf.com/windsurf/cascade/hooks, /cascade/mcp and /cascade/memories fetched 2026-10-26; no working Windsurf/Devin install here",
    detection: [".codeium/windsurf", ".windsurf", ".config/devin"],
    notes: [
      "Cascade has no session-start/session-end hook: there is no context injection and no session-end summary.",
      "Hooks run from the workspace root by default; the installer omits working_directory.",
      "Windsurf/Devin is not installed here; the config and payloads were tested against fixtures only.",
    ],
    events: ["pre_user_prompt", "post_run_command", "post_write_code", "post_cascade_response"],
    plan(env) {
      const mcpFile = resolveMcpPath(toolById("windsurf").mcp, env.home);
      const hooks = { pre_user_prompt: null, post_run_command: null, post_write_code: null, post_cascade_response: null };
      const rules = planRules({ tool: "windsurf", home: env.home, rules: env.rules ?? [] });
      const steps = [
        planMcp({ file: mcpFile, entry: { command: env.bun, args: [env.mcpScript] } }),
        planFlatHooks({ file: join(env.home, ".codeium", "windsurf", "hooks.json"), events: hooks, env, tool: "windsurf" }),
        rules,
      ].filter(Boolean);
      return { tool: "windsurf", name: "Windsurf", env, steps, notes: [
        "Cascade has no session-start/session-end hook: there is no context injection and no session-end summary.",
        "Hooks run from the workspace root by default; the installer omits working_directory.",
        "Windsurf/Devin is not installed here; the config and payloads were tested against fixtures only.",
      ] };
    },
    expectedHooks(env) {
      const events = ["pre_user_prompt", "post_run_command", "post_write_code", "post_cascade_response"];
      return { file: join(env.home, ".codeium", "windsurf", "hooks.json"), commands: Object.fromEntries(events.map((event) => [event, hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool: "windsurf", event })])) };
    },
  }),
  defineInstaller({
    id: "opencode",
    name: "OpenCode",
    capabilities: "mcp+rules",
    verification: "mcp-verified",
    toolVersion: "1.18.33",
    verifiedOn: "2026-10-27",
    evidence: "https://opencode.ai/docs/mcp-servers/ and /docs/rules/ fetched 2026-10-26; MCP server listed by OpenCode 1.18.33 on 2026-10-27; hooks not run (mcp+rules only)",
    detection: [".config/opencode"],
    notes: [
      "OpenCode ships as mcp+rules only. Its plugin system exists, but the official plugin page does not document the event payload fields, so this installer does not write a plugin.",
      "Global config is ~/.config/opencode/opencode.json; the MCP entry uses the documented `mcp` key with type local.",
      "Global rules are ~/.config/opencode/AGENTS.md; project rules are AGENTS.md.",
    ],
    events: [],
    plan(env) {
      const jsonFile = join(env.home, ".config", "opencode", "opencode.json");
      const jsoncFile = join(env.home, ".config", "opencode", "opencode.jsonc");
      if (!existsSync(jsonFile) && existsSync(jsoncFile)) throw new RangeError(`${jsoncFile} is JSONC; this installer only writes opencode.json. Move the settings or remove the comments.`);
      const steps = [
        planMcp({ file: jsonFile, key: "mcp", entry: { type: "local", command: [env.bun, env.mcpScript], enabled: true } }),
        planRules({ tool: "opencode", home: env.home, rules: env.rules ?? [] }),
      ].filter(Boolean);
      return { tool: "opencode", name: "OpenCode", env, steps, notes: [
        "OpenCode ships as mcp+rules only. Its plugin system exists, but the official plugin page does not document the event payload fields, so this installer does not write a plugin.",
        "Global config is ~/.config/opencode/opencode.json; the MCP entry uses the documented `mcp` key with type local.",
        "Global rules are ~/.config/opencode/AGENTS.md; project rules are AGENTS.md.",
      ] };
    },
  }),
];

export const installerIds = () => INSTALLERS.map((installer) => installer.id);

export function installerFor(id) {
  const installer = INSTALLERS.find((candidate) => candidate.id === id);
  if (!installer) throw new RangeError(`Unknown tool: ${id}. Tools: ${installerIds().join(", ")}.`);
  return installer;
}

/** Metadata for `aletheia install --list`. Does not plan or write anything. */
export function listInstallers(env = {}) {
  return INSTALLERS.map((installer) => ({
    id: installer.id,
    name: installer.name,
    capabilities: installer.capabilities,
    verification: installer.verification,
    evidence: installer.evidence,
    installed: env.home ? installer.detect(env.home) : null,
    events: installer.events,
    notes: installer.notes,
  }));
}

export function formatInstallerList(env = {}) {
  const rows = listInstallers(env);
  const width = Math.max(...rows.map((row) => row.id.length));
  const lines = ["tool".padEnd(width) + "  capability   verification     detected  events"];
  for (const row of rows) {
    lines.push(`${row.id.padEnd(width)}  ${row.capabilities.padEnd(11)}  ${row.verification.padEnd(16)}  ${row.installed == null ? "?" : row.installed ? "yes     " : "no      "}  ${row.events.join(", ") || "none"}`);
  }
  for (const row of rows) lines.push(`note  ${row.id}: ${row.evidence || "no evidence recorded"}`);
  return lines.join("\n");
}

export function manifestPath(dataDir) {
  return join(dataDir, MANIFEST_FILE);
}

export function readManifest(dataDir) {
  const file = manifestPath(dataDir);
  if (!existsSync(file)) return { version: MANIFEST_VERSION, tools: {} };
  try {
    const doc = JSON.parse(readFileSync(file, "utf8"));
    if (!doc || typeof doc !== "object" || typeof doc.tools !== "object") throw new Error("bad manifest");
    return doc;
  } catch {
    return { version: MANIFEST_VERSION, tools: {}, warning: `${file} is not readable; treating it as empty.` };
  }
}

/** Compare every recorded step against the file on disk. Never writes. */
export function verifyInstall(dataDir, toolId = null) {
  const manifest = readManifest(dataDir);
  const ids = toolId ? [toolId] : Object.keys(manifest.tools ?? {});
  const tools = {};
  for (const id of ids) {
    const record = manifest.tools?.[id];
    if (!record) {
      tools[id] = { installed: false, steps: [], ok: false };
      continue;
    }
    const steps = (record.steps ?? []).map((step) => {
      if (!existsSync(step.file)) return { kind: step.kind, file: step.file, state: "missing" };
      try {
        const current = hashText(readFileSync(step.file, "utf8"));
        return { kind: step.kind, file: step.file, state: current === step.hash ? "ok" : "drift" };
      } catch {
        return { kind: step.kind, file: step.file, state: "unreadable" };
      }
    });
    tools[id] = { installed: true, steps, ok: steps.every((step) => step.state === "ok") };
  }
  return { tools };
}

/** Readable lines for `aletheia install --verify`. */
export function formatVerify(report) {
  const ids = Object.keys(report.tools);
  if (!ids.length) return "Nothing installed; no manifest to verify.";
  const lines = [];
  for (const id of ids) {
    const tool = report.tools[id];
    if (!tool.installed) {
      lines.push(`${id}: not installed (no manifest entry)`);
      continue;
    }
    for (const step of tool.steps) lines.push(`  ${step.state.padEnd(9)} ${step.kind.padEnd(8)} ${step.file}`);
    lines.push(`${id}: ${tool.ok ? "matches the recorded install" : "drifted from the recorded install"}`);
  }
  return lines.join("\n");
}

function writeManifest(dataDir, manifest) {
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(manifestPath(dataDir), jsonText(manifest));
}

function writeWithBackup(step) {
  mkdirSync(dirname(step.file), { recursive: true });
  let backup = null;
  if (existsSync(step.file)) {
    backup = backupName(step.file);
    copyFileSync(step.file, backup);
  }
  writeFileSync(step.file, step.after);
  return backup;
}

function newestSourceMtime(root) {
  let newest = 0;
  const walk = (dir) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".mjs") || entry.name.endsWith(".js")) {
        try {
          newest = Math.max(newest, statSync(full).mtimeMs);
        } catch {
          // ignore a file that vanished
        }
      }
    }
  };
  walk(root);
  return newest;
}

/**
 * Build one file with Bun so a hook pays for one module load, not a dozen. Returns true when a runner exists.
 * Falling back to the source script is always safe; it is just slower.
 */
async function buildRunner(entry, outfile) {
  try {
    const root = dirname(dirname(entry));
    const newest = Math.max(statSync(entry).mtimeMs, newestSourceMtime(join(root, "src")));
    if (existsSync(outfile) && statSync(outfile).mtimeMs >= newest) return true;
    mkdirSync(dirname(outfile), { recursive: true });
    const result = await Bun.build({ entrypoints: [entry], outdir: dirname(outfile), naming: basename(outfile), target: "bun", silent: true });
    return !!result.success && existsSync(outfile);
  } catch {
    return false;
  }
}

/** Apply a plan. Unchanged steps are not written, so a second run leaves every file and every backup alone. */
export async function applyInstall(plan, { dataDir } = {}) {
  let runner = plan.env.hookRunner;
  if (runner && !(await buildRunner(plan.env.hookScript, runner))) {
    runner = plan.env.hookScript;
    for (const step of plan.steps) {
      if ((step.kind !== "hooks" && step.kind !== "settings") || !step.commands) continue;
      step.after = step.after.split(plan.env.hookRunner).join(runner);
      step.commands = Object.fromEntries(Object.entries(step.commands).map(([event, command]) => [event, command.split(plan.env.hookRunner).join(runner)]));
      step.changed = step.before !== step.after;
    }
  }
  const changes = [];
  const wrote = [];
  for (const step of plan.steps) {
    const hash = hashText(step.after);
    if (!step.changed) {
      changes.push({ kind: step.kind, file: step.file, changed: false, backup: null, hash });
      continue;
    }
    const backup = writeWithBackup(step);
    wrote.push(step.file);
    changes.push({ kind: step.kind, file: step.file, changed: true, backup, hash });
  }
  const manifest = readManifest(dataDir);
  const previous = manifest.tools[plan.tool] ?? null;
  const changed = changes.some((change) => change.changed);
  if (changed || !previous) {
    manifest.version = MANIFEST_VERSION;
    manifest.tools[plan.tool] = {
      installedAt: previous?.installedAt ?? new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      bun: plan.env.bun,
      hookScript: plan.env.hookScript,
      runner,
      mcpScript: plan.env.mcpScript,
      capabilities: plan.capabilities,
      verification: plan.verification,
      notes: plan.notes ?? [],
      steps: changes,
    };
    writeManifest(dataDir, manifest);
  }
  return { tool: plan.tool, changed, wrote, changes, runner };
}

function isOurMcpEntry(entry, env) {
  if (Array.isArray(entry?.command)) return entry.command[0] === env.bun && entry.command[1] === env.mcpScript;
  return entry?.command === env.bun && Array.isArray(entry.args) && entry.args[0] === env.mcpScript;
}

/** Remove our server entry from mcpServers or mcp. Returns true when something was removed. */
function removeOurMcp(doc, env) {
  let removed = false;
  for (const key of ["mcpServers", "mcp"]) {
    const entry = doc[key]?.[SERVER_NAME];
    if (!entry) continue;
    if (!isOurMcpEntry(entry, env)) continue;
    delete doc[key][SERVER_NAME];
    removed = true;
  }
  return removed;
}

function hasForeignMcp(doc, env) {
  for (const key of ["mcpServers", "mcp"]) {
    const entry = doc[key]?.[SERVER_NAME];
    if (entry && !isOurMcpEntry(entry, env)) return true;
  }
  return false;
}

function planUninstallStep(step, env, { force = false } = {}) {
  if (!existsSync(step.file)) return { ...step, changed: false, note: "file does not exist" };
  const before = readFileSync(step.file, "utf8");
  if (step.hash && hashText(before) !== step.hash && !force) {
    return { ...step, before, after: before, changed: false, blocked: true, note: "file changed since install; rerun with --force" };
  }
  if (step.kind === "hooks" || step.kind === "settings") {
    const { text, doc } = readJson(step.file, {});
    const next = clone(doc);
    stripOurHooks(next);
    const removedMcp = step.kind === "settings" ? removeOurMcp(next, env) : false;
    const foreign = step.kind === "settings" && hasForeignMcp(next, env);
    const after = jsonText(next);
    return {
      kind: step.kind,
      file: step.file,
      before: text,
      after,
      changed: text !== after,
      note: foreign ? `the ${SERVER_NAME} entry is not ours; left alone` : removedMcp || text !== after ? "" : "no aletheia hooks",
    };
  }
  if (step.kind === "mcp") {
    if (step.file.endsWith(".toml")) {
      const section = tomlSection(before);
      if (!section) return { kind: "mcp", file: step.file, before, after: before, changed: false, note: "no aletheia server" };
      const current = tomlEntry(section.body);
      const ours = current.command === env.bun && current.args[0] === env.mcpScript;
      if (!ours) return { kind: "mcp", file: step.file, before, after: before, changed: false, note: "the aletheia entry is not ours; left alone" };
      const after = removeTomlSection(before);
      return { kind: "mcp", file: step.file, before, after, changed: after !== before, note: "" };
    }
    const { text, doc } = readJson(step.file, {});
    const next = clone(doc);
    const foreign = hasForeignMcp(next, env);
    const removed = removeOurMcp(next, env);
    const after = jsonText(next);
    return { kind: "mcp", file: step.file, before: text, after, changed: text !== after, note: foreign && !removed ? `the ${SERVER_NAME} entry is not ours; left alone` : removed ? "" : "no aletheia server" };
  }
  const after = before.includes(MARK_BEGIN) ? removeBlock(before) : before;
  return { kind: "rules", file: step.file, before, after, changed: before !== after, note: before.includes(MARK_BEGIN) ? "" : "no managed block" };
}

/** Remove only the entries this installer wrote. Everything else in each file is kept. */
export function planUninstall(id, env, { dataDir, force = false } = {}) {
  const installer = installerFor(id);
  const manifest = readManifest(dataDir);
  const record = manifest.tools?.[id];
  if (!record) return { tool: id, name: installer.name, installed: false, steps: [], notes: [], blocked: [] };
  const steps = (record.steps ?? []).map((step) => planUninstallStep(step, env, { force }));
  return { tool: id, name: installer.name, installed: true, steps, notes: installer.notes ?? [], blocked: steps.filter((step) => step.blocked) };
}

export function applyUninstall(plan, { dataDir } = {}) {
  const wrote = [];
  const changes = [];
  for (const step of plan.steps) {
    if (!step.changed) {
      changes.push({ kind: step.kind, file: step.file, changed: false, note: step.note ?? "", blocked: !!step.blocked });
      continue;
    }
    const backup = writeWithBackup(step);
    wrote.push(step.file);
    changes.push({ kind: step.kind, file: step.file, changed: true, backup, note: step.note ?? "" });
  }
  const manifest = readManifest(dataDir);
  const blocked = changes.some((change) => change.blocked);
  if (!blocked && manifest.tools?.[plan.tool]) {
    delete manifest.tools[plan.tool];
    writeManifest(dataDir, manifest);
  }
  return { tool: plan.tool, removed: !blocked, wrote, changes, blocked };
}

/** Readable lines for the CLI. */
export function formatPlan(plan) {
  const lines = [`${plan.name} (${plan.tool}) — ${plan.capabilities ?? "full"}, ${plan.verification ?? "from-docs-only"}`];
  for (const step of plan.steps) {
    const state = step.kind === "rules" ? `${step.rules} rule${step.rules === 1 ? "" : "s"}` : step.kind === "hooks" ? Object.keys(step.commands ?? {}).join(", ") : step.kind === "settings" ? "MCP + hooks" : step.file.endsWith(".toml") ? "[mcp_servers.aletheia]" : `${step.key ?? "mcpServers"}.aletheia`;
    lines.push(`  ${step.changed ? "write " : "done  "} ${step.kind.padEnd(8)} ${step.file}${state ? `  (${state})` : ""}`);
  }
  for (const note of plan.notes ?? []) lines.push(`  note  ${note}`);
  if (plan.env?.hookRunner) lines.push(`  note  apply builds ${plan.env.hookRunner} so a hook loads one module, not a dozen`);
  return lines.join("\n");
}

export function formatUninstall(plan) {
  if (!plan.installed) return `${plan.name} (${plan.tool}) is not installed: no manifest entry in this data directory.`;
  const lines = [`${plan.name} (${plan.tool})`];
  for (const step of plan.steps) lines.push(`  ${step.blocked ? "BLOCK " : step.changed ? "remove" : "keep  "} ${step.kind.padEnd(8)} ${step.file}${step.note ? `  (${step.note})` : ""}`);
  return lines.join("\n");
}

function hookCommandsIn(doc) {
  const out = [];
  for (const definitions of Object.values(doc.hooks ?? {})) {
    if (!Array.isArray(definitions)) continue;
    for (const definition of definitions) {
      if (Array.isArray(definition?.hooks)) {
        for (const handler of definition.hooks) if (handler?.command) out.push(handler.command);
      } else if (definition?.command) {
        out.push(definition.command);
      }
    }
  }
  return out;
}

/** Health checks a user can run after install: server, every installer's hooks, spool and last capture. */
export async function doctor(env) {
  const checks = [];

  // The loopback-by-default posture: a non-loopback bind is only healthy behind TLS.
  const host = env.host ?? "127.0.0.1";
  const loopback = ["127.0.0.1", "localhost", "::1", "[::1]"].includes(host);
  checks.push({
    name: "host",
    ok: loopback || env.behindTls === true,
    detail: loopback ? `${host} (loopback)` : env.behindTls ? `${host} (non-loopback, behind TLS)` : `${host} (non-loopback; set ALETHEIA_BEHIND_TLS=1 when a reverse proxy terminates TLS)`,
  });
  const port = Number(env.port);
  const portOk = Number.isInteger(port) && port >= 1 && port <= 65535;
  checks.push({ name: "port", ok: portOk, detail: portOk ? String(port) : `invalid port ${env.port}` });

  const url = `http://127.0.0.1:${env.port}/healthz`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(400) });
    checks.push({ name: "server", ok: response.ok, detail: response.ok ? url : `HTTP ${response.status} at ${url}` });
  } catch {
    checks.push({ name: "server", ok: false, detail: `not reachable at ${url}` });
  }

  for (const installer of INSTALLERS) {
    const expected = installer.expectedHooks?.(env);
    if (!expected) {
      checks.push({ name: `tool ${installer.id}`, ok: true, detail: `${installer.capabilities}; no hook system shipped` });
      continue;
    }
    // A tool that is not installed is not a failure. Only a present config with missing hooks is.
    if (!existsSync(expected.file)) {
      checks.push({ name: `hooks ${installer.id}`, ok: true, detail: `not installed (no ${expected.file})` });
      continue;
    }
    let found = 0;
    let detail = expected.file;
    try {
      const { text } = readJson(expected.file, {});
      const doc = text ? JSON.parse(text) : {};
      const handlers = hookCommandsIn(doc);
      found = Object.values(expected.commands).filter((command) => handlers.includes(command)).length;
      detail = `${found}/${Object.keys(expected.commands).length} in ${expected.file}`;
    } catch {
      detail = `cannot read ${expected.file}`;
    }
    checks.push({ name: `hooks ${installer.id}`, ok: found === Object.keys(expected.commands).length, detail });
  }

  // Connector verification: unverified is honest, stale is a warning. Never a hard failure.
  for (const tool of TOOLS) {
    const status = verificationStatus(tool);
    const evidence = tool.rules.evidence ? ` — ${tool.rules.evidence}` : "";
    checks.push({ name: `verify ${tool.id}`, ok: status.status !== "stale", detail: `${status.label}: ${status.reason}${evidence}` });
  }

  const spooled = spoolRead(env.dataDir).length;
  checks.push({ name: "spool", ok: spooled === 0, detail: spooled === 0 ? "empty" : `${spooled} item(s) at ${spoolPath(env.dataDir)}` });

  // Report modes before the store below opens and repairs a loose one, so `aletheia doctor` flags what it found.
  const dataDirMode = modeOctal(env.dataDir);
  const dbMode = modeOctal(env.dbPath);
  const walMode = modeOctal(`${env.dbPath}-wal`);
  const shmMode = modeOctal(`${env.dbPath}-shm`);
  let permissionsOk = true;
  let permissionsDetail;
  if (WINDOWS) {
    permissionsDetail = "skipped on Windows (no POSIX mode bits)";
  } else if (!existsSync(env.dbPath)) {
    permissionsOk = dataDirMode === "0700";
    permissionsDetail = dataDirMode ? `data dir ${dataDirMode}${permissionsOk ? "" : " (should be 0700)"}` : "data dir missing";
  } else {
    const loose = [];
    if (dataDirMode && dataDirMode !== "0700") loose.push(`data dir ${dataDirMode}`);
    if (dbMode && dbMode !== "0600") loose.push(`db ${dbMode}`);
    if (walMode && walMode !== "0600") loose.push(`wal ${walMode}`);
    if (shmMode && shmMode !== "0600") loose.push(`shm ${shmMode}`);
    permissionsOk = loose.length === 0;
    permissionsDetail = permissionsOk ? "data dir 0700, db 0600" : `loose: ${loose.join(", ")}`;
  }
  checks.push({ name: "permissions", ok: permissionsOk, detail: permissionsDetail });

  let last = null;
  let readable = true;
  let detail = env.dbPath;
  let queue = { pending: 0, running: 0, done: 0, failed: 0 };
  let extraction = { mode: env.provider === "none" ? "rules" : env.provider ?? "unknown", lastAtEpoch: null, rejected: 0 };
  let health = null;
  try {
    if (!existsSync(env.dbPath)) {
      detail = "no capture yet";
    } else {
      const { HubStore } = await import("./store.mjs");
      const { healthReport } = await import("./health.mjs");
      const store = new HubStore(env.dbPath);
      try {
        last = store.db.prepare("SELECT MAX(created_at_epoch) AS at FROM memories WHERE kind IN ('prompt','event','summary')").get().at;
        const statuses = Object.fromEntries(store.db.prepare("SELECT status, COUNT(*) AS n FROM jobs GROUP BY status").all().map((row) => [row.status, row.n]));
        queue = { pending: statuses.pending ?? 0, running: statuses.running ?? 0, done: statuses.done ?? 0, failed: statuses.failed ?? 0 };
        const usage = store.db.prepare("SELECT mode, MAX(at_epoch) AS at, SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected FROM fact_usage ORDER BY id DESC LIMIT 1").get();
        const lastUsage = store.db.prepare("SELECT MAX(at_epoch) AS at FROM fact_usage WHERE status = 'ok'").get();
        extraction = { mode: usage?.mode ?? (env.provider === "none" ? "rules" : env.provider ?? "unknown"), lastAtEpoch: lastUsage?.at ?? null, rejected: usage?.rejected ?? 0 };
        health = healthReport(store);
      } finally {
        store.close();
      }
      detail = last ? new Date(last).toISOString() : "no capture yet";
    }
  } catch {
    readable = false;
    detail = `cannot read ${env.dbPath}`;
  }
  checks.push({ name: "last capture", ok: readable, detail });
  checks.push({ name: "queue", ok: queue.failed === 0, detail: `${queue.pending} pending, ${queue.running} running, ${queue.failed} failed` });
  checks.push({ name: "extraction", ok: true, detail: `mode ${extraction.mode}; last ${extraction.lastAtEpoch ? new Date(extraction.lastAtEpoch).toISOString() : "never"}; ${extraction.rejected} rejected` });
  checks.push({ name: "database", ok: health ? health.db.ok : readable, detail: health ? health.db.detail : detail });
  checks.push({ name: "fts", ok: health ? health.fts.ok : readable, detail: health ? health.fts.detail : "no database yet" });
  checks.push({ name: "vectors", ok: true, detail: health ? `${health.vectors.memories ?? 0} memory, ${health.vectors.facts ?? 0} fact` : "no database yet" });
  checks.push({ name: "model", ok: true, detail: health ? health.model : "default" });
  return checks;
}

/** Claude Desktop's documented config path. Linux is the path observed on this machine, not in the MCP quickstart. */
export function claudeDesktopPath({ home, platform = process.platform, env = process.env } = {}) {
  if (platform === "darwin") return join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  if (platform === "win32") return join(env.APPDATA ?? join(home, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  return join(home, ".config", "Claude", "claude_desktop_config.json");
}

/** The merge Claude Desktop needs, usable by docs and tests without writing anything. */
export function planClaudeDesktop(env) {
  return planMcp({ file: claudeDesktopPath(env), entry: { command: env.bun, args: [env.mcpScript], env: {} } });
}
