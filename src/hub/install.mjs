// One-command installers: preview, back up, merge and apply the MCP entry, hooks and rules a tool needs.
// The settings shapes are the tools' documented ones. Claude Code's were checked against a real installed plugin
// hook file and ~/.claude.json on 2026-10-26; Command Code's against its hooks/MCP references and CLI v1.88.0.
//
// Nothing here overwrites a file it cannot parse, every write keeps a timestamped copy, and a second run is a no-op.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { applyBlock, removeBlock, renderRules, targetPath } from "./rules-sync.mjs";
import { MARK_BEGIN, MARK_END } from "./tools.mjs";
import { spoolPath, spoolRead } from "./hooks/shared.mjs";

export const MANIFEST_FILE = "install-manifest.json";
export const MANIFEST_VERSION = 1;
export const HOOK_MARKER = "aletheia-managed";
export const SERVER_NAME = "aletheia";

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

function readJson(file, fallback) {
  if (!existsSync(file)) return { text: null, doc: fallback };
  const text = readFileSync(file, "utf8");
  if (!text.trim()) return { text, doc: fallback };
  try {
    const doc = JSON.parse(text);
    if (!doc || typeof doc !== "object" || Array.isArray(doc)) throw new Error("not an object");
    return { text, doc };
  } catch {
    throw new RangeError(`${file} is not a JSON object. Fix it by hand first; aletheia will not overwrite it.`);
  }
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const jsonText = (doc) => `${JSON.stringify(doc, null, 2)}\n`;

/** Strip our handlers from one definition, keeping the user's handlers and the definition's other fields. */
function stripOurHandlers(definition) {
  const handlers = Array.isArray(definition?.hooks) ? definition.hooks.filter((handler) => !isOurHook(handler?.command)) : [];
  if (!handlers.length) return null;
  return { ...definition, hooks: handlers };
}

function planHooks({ file, events, env, tool }) {
  const { text, doc } = readJson(file, {});
  const next = clone(doc);
  next.hooks = next.hooks && typeof next.hooks === "object" && !Array.isArray(next.hooks) ? next.hooks : {};
  const commands = {};
  for (const [event, matcher] of Object.entries(events)) {
    const command = hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool, event });
    commands[event] = command;
    const kept = (Array.isArray(next.hooks[event]) ? next.hooks[event] : []).map(stripOurHandlers).filter(Boolean);
    const definition = { ...(matcher ? { matcher } : {}), hooks: [{ type: "command", command, timeout: 10 }] };
    next.hooks[event] = [...kept, definition];
  }
  const after = jsonText(next);
  return { kind: "hooks", title: `hooks in ${file}`, file, before: text, after, changed: text !== after, commands };
}

function planMcp({ file, entry }) {
  const { text, doc } = readJson(file, {});
  const next = clone(doc);
  next.mcpServers = next.mcpServers && typeof next.mcpServers === "object" && !Array.isArray(next.mcpServers) ? next.mcpServers : {};
  next.mcpServers[SERVER_NAME] = entry;
  const after = jsonText(next);
  return { kind: "mcp", title: `MCP server in ${file}`, file, before: text, after, changed: text !== after, entry };
}

function planRules({ tool, home, rules }) {
  const file = targetPath(tool, { scope: "global", home });
  if (!file) throw new RangeError(`${tool} has no global rules file.`);
  const before = existsSync(file) ? readFileSync(file, "utf8") : "";
  const { markdown, count } = renderRules(rules, tool);
  const after = applyBlock(before, markdown);
  return { kind: "rules", title: `rules in ${file}`, file, before, after, changed: before !== after, rules: count, markers: [MARK_BEGIN, MARK_END] };
}

const claudeEvents = { SessionStart: "startup|clear|compact", UserPromptSubmit: null, PostToolUse: "*", Stop: null, SessionEnd: null };

export const INSTALLERS = [
  {
    id: "claude-code",
    name: "Claude Code",
    notes: [],
    events: ["SessionStart", "UserPromptSubmit", "PostToolUse", "Stop", "SessionEnd"],
    plan(env) {
      const settingsFile = join(env.home, ".claude", "settings.json");
      const mcpFile = join(env.home, ".claude.json");
      const steps = [
        planMcp({ file: mcpFile, entry: { type: "stdio", command: env.bun, args: [env.mcpScript], env: {} } }),
        planHooks({ file: settingsFile, events: claudeEvents, env, tool: "claude-code" }),
        planRules({ tool: "claude-code", home: env.home, rules: env.rules ?? [] }),
      ];
      return { tool: "claude-code", name: "Claude Code", env, steps, notes: this.notes };
    },
    expectedHooks(env) {
      return { file: join(env.home, ".claude", "settings.json"), commands: Object.fromEntries(Object.keys(claudeEvents).map((event) => [event, hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool: "claude-code", event })])) };
    },
  },
  {
    id: "command-code",
    name: "Command Code",
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
      ];
      return { tool: "command-code", name: "Command Code", env, steps, notes: this.notes };
    },
    expectedHooks(env) {
      return { file: join(env.home, ".commandcode", "settings.json"), commands: Object.fromEntries(["SessionStart", "PostToolUse", "Stop"].map((event) => [event, hookCommand({ bun: env.bun, hookScript: runnerFor(env), tool: "command-code", event })])) };
    },
  },
];

export const installerIds = () => INSTALLERS.map((installer) => installer.id);

export function installerFor(id) {
  const installer = INSTALLERS.find((candidate) => candidate.id === id);
  if (!installer) throw new RangeError(`Unknown tool: ${id}. Tools: ${installerIds().join(", ")}.`);
  return installer;
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
      if (step.kind !== "hooks" || !step.commands) continue;
      step.after = step.after.split(plan.env.hookRunner).join(runner);
      step.commands = Object.fromEntries(Object.entries(step.commands).map(([event, command]) => [event, command.split(plan.env.hookRunner).join(runner)]));
      step.changed = step.before !== step.after;
    }
  }
  const changes = [];
  const wrote = [];
  for (const step of plan.steps) {
    if (!step.changed) {
      changes.push({ kind: step.kind, file: step.file, changed: false, backup: null });
      continue;
    }
    const backup = writeWithBackup(step);
    wrote.push(step.file);
    changes.push({ kind: step.kind, file: step.file, changed: true, backup });
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
      notes: plan.notes ?? [],
      steps: changes,
    };
    writeManifest(dataDir, manifest);
  }
  return { tool: plan.tool, changed, wrote, changes, runner };
}

function planUninstallStep(step, env) {
  if (!existsSync(step.file)) return { ...step, changed: false, note: "file does not exist" };
  if (step.kind === "mcp") {
    const { text, doc } = readJson(step.file, {});
    const next = clone(doc);
    const current = next.mcpServers?.[SERVER_NAME];
    if (!current) return { kind: "mcp", file: step.file, before: text, after: text, changed: false, note: "no aletheia server" };
    const ours = current.command === env.bun && Array.isArray(current.args) && current.args[0] === env.mcpScript;
    if (!ours) return { kind: "mcp", file: step.file, before: text, after: text, changed: false, note: "the aletheia entry is not ours; left alone" };
    delete next.mcpServers[SERVER_NAME];
    const after = jsonText(next);
    return { kind: "mcp", file: step.file, before: text, after, changed: text !== after, note: "" };
  }
  if (step.kind === "hooks") {
    const { text, doc } = readJson(step.file, {});
    const next = clone(doc);
    if (next.hooks && typeof next.hooks === "object") {
      for (const event of Object.keys(next.hooks)) {
        const kept = (Array.isArray(next.hooks[event]) ? next.hooks[event] : []).map(stripOurHandlers).filter(Boolean);
        if (kept.length) next.hooks[event] = kept;
        else delete next.hooks[event];
      }
      if (!Object.keys(next.hooks).length) delete next.hooks;
    }
    const after = jsonText(next);
    return { kind: "hooks", file: step.file, before: text, after, changed: text !== after, note: "" };
  }
  const before = readFileSync(step.file, "utf8");
  const after = before.includes(MARK_BEGIN) ? removeBlock(before) : before;
  return { kind: "rules", file: step.file, before, after, changed: before !== after, note: before.includes(MARK_BEGIN) ? "" : "no managed block" };
}

/** Remove only the entries this installer wrote. Everything else in each file is kept. */
export function planUninstall(id, env, { dataDir } = {}) {
  const installer = installerFor(id);
  const manifest = readManifest(dataDir);
  const record = manifest.tools?.[id];
  if (!record) return { tool: id, name: installer.name, installed: false, steps: [], notes: [] };
  const steps = (record.steps ?? []).map((step) => planUninstallStep(step, env));
  return { tool: id, name: installer.name, installed: true, steps, notes: installer.notes ?? [] };
}

export function applyUninstall(plan, { dataDir } = {}) {
  const wrote = [];
  const changes = [];
  for (const step of plan.steps) {
    if (!step.changed) {
      changes.push({ kind: step.kind, file: step.file, changed: false, note: step.note ?? "" });
      continue;
    }
    const backup = writeWithBackup(step);
    wrote.push(step.file);
    changes.push({ kind: step.kind, file: step.file, changed: true, backup, note: step.note ?? "" });
  }
  const manifest = readManifest(dataDir);
  if (manifest.tools?.[plan.tool]) {
    delete manifest.tools[plan.tool];
    writeManifest(dataDir, manifest);
  }
  return { tool: plan.tool, removed: true, wrote, changes };
}

/** Readable lines for the CLI. */
export function formatPlan(plan) {
  const lines = [`${plan.name} (${plan.tool})`];
  for (const step of plan.steps) {
    const state = step.kind === "rules" ? `${step.rules} rule${step.rules === 1 ? "" : "s"}` : step.kind === "hooks" ? Object.keys(step.commands ?? {}).join(", ") : "mcpServers.aletheia";
    lines.push(`  ${step.changed ? "write " : "done  "} ${step.kind.padEnd(5)} ${step.file}${state ? `  (${state})` : ""}`);
  }
  for (const note of plan.notes ?? []) lines.push(`  note  ${note}`);
  if (plan.env?.hookRunner) lines.push(`  note  apply builds ${plan.env.hookRunner} so a hook loads one module, not a dozen`);
  return lines.join("\n");
}

export function formatUninstall(plan) {
  if (!plan.installed) return `${plan.name} (${plan.tool}) is not installed: no manifest entry in this data directory.`;
  const lines = [`${plan.name} (${plan.tool})`];
  for (const step of plan.steps) lines.push(`  ${step.changed ? "remove" : "keep  "} ${step.kind.padEnd(5)} ${step.file}${step.note ? `  (${step.note})` : ""}`);
  return lines.join("\n");
}

/** Health checks a user can run after install: server, hooks, spool and last capture. */
export async function doctor(env) {
  const checks = [];
  const url = `http://127.0.0.1:${env.port}/healthz`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(400) });
    checks.push({ name: "server", ok: response.ok, detail: response.ok ? url : `HTTP ${response.status} at ${url}` });
  } catch {
    checks.push({ name: "server", ok: false, detail: `not reachable at ${url}` });
  }

  for (const installer of INSTALLERS) {
    const expected = installer.expectedHooks(env);
    let found = 0;
    let detail = expected.file;
    try {
      const { text } = readJson(expected.file, {});
      const doc = text ? JSON.parse(text) : {};
      const handlers = Object.values(doc.hooks ?? {}).flatMap((definitions) => (Array.isArray(definitions) ? definitions : []).flatMap((definition) => definition?.hooks ?? []));
      found = Object.values(expected.commands).filter((command) => handlers.some((handler) => handler?.command === command)).length;
      detail = `${found}/${Object.keys(expected.commands).length} in ${expected.file}`;
    } catch {
      detail = `cannot read ${expected.file}`;
    }
    checks.push({ name: `hooks ${installer.id}`, ok: found === Object.keys(expected.commands).length, detail });
  }

  const spooled = spoolRead(env.dataDir).length;
  checks.push({ name: "spool", ok: spooled === 0, detail: spooled === 0 ? "empty" : `${spooled} item(s) at ${spoolPath(env.dataDir)}` });

  let last = null;
  let readable = true;
  let detail = env.dbPath;
  try {
    if (!existsSync(env.dbPath)) {
      detail = "no capture yet";
    } else {
      const { HubStore } = await import("./store.mjs");
      const store = new HubStore(env.dbPath);
      try {
        last = store.db.prepare("SELECT MAX(created_at_epoch) AS at FROM memories WHERE kind IN ('prompt','event','summary')").get().at;
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
  return checks;
}
