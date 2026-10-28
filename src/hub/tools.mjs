// The tool registry: which AI tools exist, where each reads its standing instructions from, and how each
// connects to an MCP server. One definition per tool; rules sync and the Tools page both read it.
//
// Formats (rules file names, MCP config shapes) are the tools' documented conventions as recalled when this
// was written. They are UNVERIFIED against each tool's current release. Every apply is preview-first, makes a
// timestamped backup, and the CLI prints the exact text it wrote. See docs/12-universal-memory-product.md.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const MARK_BEGIN = "<!-- aletheia:rules:begin -->";
export const MARK_END = "<!-- aletheia:rules:end -->";

/**
 * rules: { project: relative path inside a project, global: path under $HOME or null, style }
 *   style "block"  = managed block between markers inside a file the user also edits
 *   style "owned"  = a file this tool owns entirely (Cursor .mdc)
 * mcp:   { path under $HOME, format }  formats: json-mcpServers | json-mcpServers-commandcode | json-opencode | toml-codex | command
 */
export const TOOLS = [
  { id: "claude-code", name: "Claude Code", detect: [".claude"], rules: { project: "CLAUDE.md", global: ".claude/CLAUDE.md", style: "block", verifiedOn: "2026-10-26", toolVersion: null, evidence: "hook file and ~/.claude.json checked on a real install (2026-10-26); hooks ran in real Claude Code sessions over two days (prompts and tool events captured, secrets redacted, no leaks); one user on one machine", source: "docs/25-installers.md" }, mcp: { format: "command", command: (cmd) => `claude mcp add --scope user aletheia -- ${cmd.join(" ")}` } },
  { id: "command-code", name: "Command Code", detect: [".commandcode"], rules: { project: "AGENTS.md", global: ".commandcode/AGENTS.md", style: "block", verifiedOn: "2026-10-26", toolVersion: "1.88.0", evidence: "CLI 1.88.0 reference generated from commandcode.ai/docs plus real files (2026-10-26); no real session run", source: "docs/25-installers.md" }, mcp: { path: ".commandcode/mcp.json", format: "json-mcpServers-commandcode" } },
  { id: "codex", name: "Codex CLI", detect: [".codex"], rules: { project: "AGENTS.md", global: ".codex/AGENTS.md", style: "block", verifiedOn: "2026-10-26", toolVersion: "0.130.0", evidence: "Codex 0.130.0 present; hooks configured from docs (2026-10-26); no hook run by Codex", source: "https://developers.openai.com/codex/agent-configuration/agents-md" }, mcp: { path: ".codex/config.toml", format: "toml-codex" } },
  { id: "gemini-cli", name: "Gemini CLI", detect: [".gemini"], rules: { project: "GEMINI.md", global: ".gemini/GEMINI.md", style: "block", verifiedOn: "2026-10-26", toolVersion: "0.37.0", evidence: "Gemini 0.37.0 present; hooks configured from docs (2026-10-26); no hook run", source: "https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/gemini-md.md" }, mcp: { path: ".gemini/settings.json", format: "json-mcpServers" } },
  { id: "cursor", name: "Cursor", detect: [".cursor"], rules: { project: ".cursor/rules/aletheia.mdc", global: null, style: "owned", verifiedOn: "2026-10-26", toolVersion: null, evidence: "Cursor docs fetched 2026-10-26; Cursor is not installed on this machine", source: "https://cursor.com/docs/context/rules" }, mcp: { path: ".cursor/mcp.json", format: "json-mcpServers" } },
  { id: "windsurf", name: "Windsurf", detect: [".codeium/windsurf", ".windsurf", ".config/devin"], rules: { project: ".windsurf/rules/aletheia.md", global: ".codeium/windsurf/memories/global_rules.md", style: "owned-windsurf", verifiedOn: "2026-10-26", toolVersion: null, evidence: "Windsurf docs fetched 2026-10-26; no working Windsurf/Devin install here", source: "https://docs.windsurf.com/windsurf/cascade/memories" }, mcp: { path: ".config/devin/mcp_config.json", alt: [".codeium/windsurf/mcp_config.json"], format: "json-mcpServers" } },
  { id: "opencode", name: "OpenCode", detect: [".config/opencode"], rules: { project: "AGENTS.md", global: ".config/opencode/AGENTS.md", style: "block", verifiedOn: "2026-10-26", toolVersion: null, evidence: "OpenCode docs fetched 2026-10-26; no capture plugin ships (event payloads undocumented)", source: "https://opencode.ai/docs/rules/" }, mcp: { path: ".config/opencode/opencode.json", format: "json-opencode" } },
  { id: "copilot", name: "GitHub Copilot", detect: [".config/github-copilot"], rules: { project: ".github/copilot-instructions.md", global: null, style: "block", verifiedOn: null, toolVersion: null, evidence: null, source: null }, mcp: null },
  { id: "aider", name: "Aider", detect: [".aider.conf.yml"], rules: { project: "CONVENTIONS.md", global: null, style: "block", verifiedOn: null, toolVersion: null, evidence: null, source: null }, mcp: null },
  { id: "agents-md", name: "AGENTS.md (open standard)", detect: [], rules: { project: "AGENTS.md", global: null, style: "block", verifiedOn: null, toolVersion: null, evidence: null, source: null }, mcp: null },
];

export const toolById = (id) => TOOLS.find((t) => t.id === id);

export const STALE_DAYS = 180;

/**
 * A connector is verified only when it has a `verifiedOn` date that is not too old and its pinned
 * `toolVersion` still matches the running one. Missing `verifiedOn` means the connector was never verified.
 */
export function verificationStatus(tool, { now = Date.now(), currentVersion = null, staleDays = STALE_DAYS } = {}) {
  const meta = tool.rules ?? tool;
  const verifiedOn = meta.verifiedOn ?? null;
  if (!verifiedOn) return { status: "unverified", label: "unverified", reason: "no verifiedOn recorded" };
  const verifiedAt = Date.parse(verifiedOn);
  if (!Number.isFinite(verifiedAt)) return { status: "unverified", label: "unverified", reason: `unparsable verifiedOn (${verifiedOn})` };
  const ageDays = (now - verifiedAt) / 86_400_000;
  if (ageDays > staleDays) return { status: "stale", label: "stale", reason: `verified ${Math.round(ageDays)} days ago (over ${staleDays})` };
  if (meta.toolVersion && currentVersion && currentVersion !== meta.toolVersion) {
    return { status: "stale", label: "stale", reason: `verified for ${meta.toolVersion}, running ${currentVersion}` };
  }
  return { status: "verified", label: "verified", reason: `verified ${verifiedOn}` };
}

export function detectTools(home) {
  return TOOLS.map((t) => ({ id: t.id, name: t.name, installed: t.detect.some((p) => existsSync(join(home, p))), rulesProject: t.rules.project, rulesGlobal: t.rules.global, canConnect: !!t.mcp }));
}

/** The command that starts the MCP server, as an argv array. */
export function mcpCommand({ bun = process.execPath, script }) {
  return [bun, script];
}

const SERVER_NAME = "aletheia";

/**
 * Which config file to use. Some tools moved their file (Windsurf's current docs name ~/.config/devin/mcp_config.json,
 * older installs use ~/.codeium/windsurf/mcp_config.json). Prefer a file that already exists, then a path whose
 * folder exists, else the primary path.
 */
export function resolveMcpPath(mcp, home) {
  const candidates = [mcp.path, ...(mcp.alt ?? [])].map((p) => join(home, p));
  return candidates.find((p) => existsSync(p)) ?? candidates.find((p) => existsSync(dirname(p))) ?? candidates[0];
}

/** The text/command that connects `tool` to the MCP server, plus whether it is already connected. */
export function mcpPlan(tool, home, argv) {
  const mcp = tool.mcp;
  if (!mcp) return { supported: false };
  if (mcp.format === "command") return { supported: true, kind: "command", command: mcp.command(argv), path: null, connected: null };
  const file = resolveMcpPath(mcp, home);
  const text = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (mcp.format === "toml-codex") {
    const block = `[mcp_servers.${SERVER_NAME}]\ncommand = ${JSON.stringify(argv[0])}\nargs = ${JSON.stringify(argv.slice(1))}\n`;
    return { supported: true, kind: "file", path: file, format: mcp.format, snippet: block, connected: text.includes(`[mcp_servers.${SERVER_NAME}]`) };
  }
  const entry = mcp.format === "json-opencode" ? { type: "local", command: argv, enabled: true } : mcp.format === "json-mcpServers-commandcode" ? { transport: "stdio", command: argv[0], args: argv.slice(1) } : { command: argv[0], args: argv.slice(1) };
  const key = mcp.format === "json-opencode" ? "mcp" : "mcpServers";
  let doc = {};
  try { doc = text.trim() ? JSON.parse(text) : {}; } catch { return { supported: true, kind: "file", path: file, format: mcp.format, error: "The existing file is not valid JSON; fix it by hand first.", connected: null }; }
  return { supported: true, kind: "file", path: file, format: mcp.format, snippet: JSON.stringify({ [key]: { [SERVER_NAME]: entry } }, null, 2), connected: !!doc?.[key]?.[SERVER_NAME], key, entry };
}

function backup(file) {
  if (!existsSync(file)) return null;
  const copy = `${file}.aletheia-${new Date().toISOString().replace(/[:.]/g, "-")}.bak`;
  copyFileSync(file, copy);
  return copy;
}

/** Write the connection into the tool's config. Returns {written, backup}. Refuses an unparsable JSON file. */
export function applyMcp(tool, home, argv) {
  const plan = mcpPlan(tool, home, argv);
  if (!plan.supported || plan.kind !== "file") throw new RangeError(plan.supported ? "This tool is connected with a command, not a file. Run the command shown." : "This tool has no MCP configuration here.");
  if (plan.error) throw new RangeError(plan.error);
  if (plan.connected) return { written: false, backup: null, path: plan.path };
  mkdirSync(dirname(plan.path), { recursive: true });
  const bak = backup(plan.path);
  if (plan.format === "toml-codex") {
    const cur = existsSync(plan.path) ? readFileSync(plan.path, "utf8") : "";
    writeFileSync(plan.path, `${cur}${cur && !cur.endsWith("\n") ? "\n" : ""}${cur ? "\n" : ""}${plan.snippet}`);
  } else {
    const cur = existsSync(plan.path) && readFileSync(plan.path, "utf8").trim() ? JSON.parse(readFileSync(plan.path, "utf8")) : {};
    cur[plan.key] = { ...(cur[plan.key] ?? {}), [SERVER_NAME]: plan.entry };
    writeFileSync(plan.path, `${JSON.stringify(cur, null, 2)}\n`);
  }
  return { written: true, backup: bak, path: plan.path };
}
