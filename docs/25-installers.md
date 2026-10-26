# 25. Installers and automatic capture

Status: implemented and validated 2026-10-26. This page records what each installer writes, which hook fields it
reads, and what is verified on this machine. Five more hosts and Claude Desktop were added on 2026-10-26.

`aletheia install --list` prints the capability level and verification for every tool:

| Tool | Level | Verification | Hooks | MCP | Rules |
|---|---|---|---|---|---|
| `claude-code` | full | from-docs-only (real config files checked) | 5 events | `~/.claude.json` | `CLAUDE.md` |
| `command-code` | full | from-docs-only (bundled reference + real CLI) | 3 events | `~/.commandcode/mcp.json` | `AGENTS.md` |
| `cursor` | full | from-docs-only | 6 events | `~/.cursor/mcp.json` | `.cursor/rules/*.mdc` (sync) |
| `codex` | full | from-docs-only | 5 events | `~/.codex/config.toml` | `AGENTS.md` |
| `gemini-cli` | full | from-docs-only | 5 events | `~/.gemini/settings.json` | `GEMINI.md` |
| `windsurf` | full | from-docs-only | 4 events | `~/.config/devin/mcp_config.json` (or legacy) | global rules + `.windsurf/rules/*.md` |
| `opencode` | mcp+rules | from-docs-only | none shipped | `~/.config/opencode/opencode.json` | `AGENTS.md` |

No tool was opened with this config in this pass. "from-docs-only" means the format came from the tool's official
documentation (URL and date below) and the installer was tested against fixtures; it does **not** mean a real
install was tested. Claude Code's shape was also checked against a real plugin hook file, and Command Code's
against its bundled reference and a real CLI, but neither ran a real session here.

## One command

```
aletheia install claude-code --write
aletheia install command-code --write
```

Without `--write` the command is a dry run: it prints every step and changes nothing. `aletheia uninstall <tool>
--write` removes only the entries the install manifest lists. Every changed file gets a copy named
`<file>.aletheia-bak-<timestamp>`.

The manifest is `<data dir>/install-manifest.json`. The default data dir is `~/.aletheia`.

## What Claude Code gets

| Step | File | What is written |
|---|---|---|
| MCP | `~/.claude.json` | `mcpServers.aletheia = {type: "stdio", command: <bun>, args: [<mcp.mjs>], env: {}}` |
| Hooks | `~/.claude/settings.json` | One entry per event under `hooks.<Event>`; other hooks and settings are kept |
| Rules | `~/.claude/CLAUDE.md` | The managed rules block between the `aletheia:rules` markers |

Hooks:

| Event | Matcher | What the hook does |
|---|---|---|
| `SessionStart` | `startup\|clear\|compact` | Stores nothing. Prints the context block as `hookSpecificOutput.additionalContext`. `resume` is deliberately silent. |
| `UserPromptSubmit` | none | Stores the prompt, redacted. |
| `PostToolUse` | `*` | Stores tool name, input summary and output cut to 1500 characters. |
| `Stop` | none | Queues compression and stores `last_assistant_message` as a summary when present. |
| `SessionEnd` | none | Queues compression and stores `last_assistant_message` when present. |

## What Command Code gets

| Step | File | What is written |
|---|---|---|
| MCP | `~/.commandcode/mcp.json` | `mcpServers.aletheia = {transport: "stdio", command: <bun>, args: [<mcp.mjs>]}` |
| Hooks | `~/.commandcode/settings.json` | One entry per event under `hooks.<Event>`; `permissions` and other settings are kept |
| Rules | `~/.commandcode/AGENTS.md` | The managed rules block |

Hooks: `SessionStart` (injects context on `startup` and `clear`, silent on `resume`), `PostToolUse` (stores tool
events), `Stop` (queues compression).

**What Command Code cannot capture.** It has no `UserPromptSubmit` hook, no `SessionEnd` hook, and its
`SessionStart` source is `startup | resume | clear` with no `compact`. Prompts and session-end summaries are
therefore not captured there. The installer prints this, and the install manifest records it. Do not claim
otherwise in the README.

## The hook command

Each entry runs:

```
<bun> <data dir>/aletheia.bundle.mjs hook <tool> <event> # aletheia-managed
```

The absolute Bun path avoids a `PATH` lookup. The trailing comment is the marker used by uninstall and doctor.
`apply` builds the bundle with Bun's built-in bundler; if that fails it points the hooks at `bin/aletheia.mjs`
instead. The bundle exists because a hook has a ~100 ms budget: loading a dozen modules costs more than the work.

## Hook runtime guarantees

- Exit code is always 0. Broken JSON, an unknown event, a missing store or an internal error never blocks the host.
- No network call and no model call. Compression is queued, not run in the hook.
- Text is redacted before it is stored (`src/hub/redact.mjs`). `<private>` blocks are dropped.
- If the database cannot be opened, the already-redacted item is appended to `<data dir>/spool/hook-spool.jsonl`.
  The next successful hook flushes the spool.
- Recalled context is wrapped in `<aletheia-memory>` with a line saying it is data, not instructions.
- The entry point has a 150 ms watchdog and always returns.

## Sources checked

| Source | What it gave | Date |
|---|---|---|
| `/home/mashraf/.claude/plugins/marketplaces/thedotmack/plugin/hooks/hooks.json` (real installed Claude Code plugin) | `hooks.<Event>[].hooks[].{type, command, timeout}`, the `SessionStart` matcher values, and `UserPromptSubmit`/`PostToolUse`/`Stop`/`SessionEnd` event names | 2026-10-26 |
| `~/.claude.json` on this machine | User-scope MCP shape: top-level `mcpServers.<name> = {type, command, args, env}` | 2026-10-26 |
| `claude mcp --help` | `--scope user` exists; stdio form is `claude mcp add <name> -- <command>` | 2026-10-26 |
| Command Code bundled reference `command-code/dist/bundled/command-code-knowledge/reference/hooks.md` (header: generated from https://commandcode.ai/docs) | Event list, `settings.json` schema, stdin fields, stdout fields, `source` values | 2026-10-26 |
| `command-code/dist/bundled/command-code-knowledge/reference/mcp.md` | `~/.commandcode/mcp.json` and the `{transport: "stdio", command, args}` entry | 2026-10-26 |
| `~/.commandcode/settings.json` and `~/.commandcode/mcp.json` on this machine | Real files use the same shapes; the settings file had `permissions` and no hooks | 2026-10-26 |

Official documentation fetches on 2026-10-26 failed with HTTP 502:
`https://code.claude.com/docs/en/hooks`, `https://docs.anthropic.com/en/docs/claude-code/hooks`,
`https://commandcode.ai/docs/hooks`. The formats above come from the real files and the tools' own bundled
reference instead.

## UNVERIFIED

- Claude Code `SessionStart` `additionalContext` in `settings.json` hooks has not been exercised by a real Claude
  Code session here. It is the shape claude-mem's plugin uses. `UNVERIFIED` until `docs/manual-test.md` is run.
- Claude Code's exact `Stop`/`SessionEnd` payload field `last_assistant_message` comes from claude-mem's adapter,
  not from a fetched official page. `UNVERIFIED`.
- Command Code's hook output was checked against its reference and tested by piping recorded JSON; a real
  Command Code session has not been run here. `UNVERIFIED` until `docs/manual-test.md` is run.

## Cursor

| Step | File | Shape |
|---|---|---|
| MCP | `~/.cursor/mcp.json` | `mcpServers.aletheia = {command, args}` |
| Hooks | `~/.cursor/hooks.json` | `{version: 1, hooks: {event: [{command, timeout}]}}` |
| Rules | `.cursor/rules/aletheia.mdc` | YAML frontmatter + managed block, via `rules sync` |

Events installed: `sessionStart`, `beforeSubmitPrompt`, `postToolUse`, `afterAgentResponse`, `stop`,
`sessionEnd`. Fields read: common `conversation_id`, `workspace_roots`, `transcript_path`; `prompt`;
`tool_name`, `tool_input`, `tool_output`; `text`; `session_id`. `sessionStart` returns
`{additional_context}`. Cursor's `stop` has no assistant text, so `afterAgentResponse` stores the summary.
There is no global Cursor rules file. Cursor was not installed here.

Source: <https://cursor.com/docs/agent/hooks>, <https://cursor.com/docs/context/mcp>,
<https://cursor.com/docs/context/rules> (fetched 2026-10-26).

## Codex CLI

| Step | File | Shape |
|---|---|---|
| MCP | `~/.codex/config.toml` | `[mcp_servers.aletheia] command = ...; args = [...]` |
| Hooks | `~/.codex/hooks.json` | `{hooks: {Event: [{matcher?, hooks: [{type: "command", command, timeout}]}]}}` |
| Rules | `AGENTS.md` / `~/.codex/AGENTS.md` | managed block |

Events installed: `SessionStart`, `UserPromptSubmit`, `PostToolUse`, `Stop`, `SessionEnd`. Fields read:
common `session_id`, `cwd`, `hook_event_name`; `prompt`; `tool_name`, `tool_input`, `tool_response`;
`last_assistant_message`. Codex requires non-managed hooks to be reviewed once with `/hooks`; that was not
exercised. The TOML guard is structural, not a full parser. Codex 0.130.0 is installed, but no real hook ran.

Source: <https://developers.openai.com/codex/hooks>, <https://developers.openai.com/codex/config-reference>,
<https://developers.openai.com/codex/mcp>, <https://developers.openai.com/codex/agent-configuration/agents-md>
(fetched 2026-10-26).

## Gemini CLI

| Step | File | Shape |
|---|---|---|
| MCP + hooks | `~/.gemini/settings.json` | `mcpServers.aletheia = {command, args}` and `hooks.<Event>[].hooks[]` |
| Rules | `GEMINI.md` / `~/.gemini/GEMINI.md` | managed block |

Events installed: `SessionStart`, `BeforeAgent`, `AfterTool`, `AfterAgent`, `SessionEnd`. Fields read:
common `session_id`, `cwd`, `hook_event_name`; `prompt`; `tool_name`, `tool_input`, `tool_response`;
`prompt_response`. Gemini's hook `timeout` is milliseconds; the installer writes 10000. MCP and hooks share
one file, so the installer merges them in one step. Gemini 0.37.0 is installed, but no real hook ran.

Source: <https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md>,
<https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/tools/mcp-server.md>,
<https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/gemini-md.md> (fetched 2026-10-26).

## Windsurf / Devin Desktop

| Step | File | Shape |
|---|---|---|
| MCP | `~/.config/devin/mcp_config.json` (legacy `~/.codeium/windsurf/mcp_config.json` if it exists) | `mcpServers.aletheia = {command, args}` |
| Hooks | `~/.codeium/windsurf/hooks.json` | `{hooks: {event: [{command, show_output?}]}}` |
| Rules | `~/.codeium/windsurf/memories/global_rules.md`, `.windsurf/rules/aletheia.md` | block; workspace rule has `trigger: always_on` |

Events installed: `pre_user_prompt`, `post_run_command`, `post_write_code`, `post_cascade_response`. Fields
read: common `trajectory_id`, `tool_info`; `user_prompt`; `command_line`, `cwd`; `file_path`, `edits`;
`response`. Cascade has no session-start or session-end event: **no context is injected and no session-end
summary is stored**. Hook commands run from the workspace root by default, so a payload without a cwd uses the
hook process cwd. The docs now call the product Devin Desktop; the legacy Windsurf user paths are used.

Source: <https://docs.windsurf.com/windsurf/cascade/hooks>,
<https://docs.windsurf.com/windsurf/cascade/mcp>, <https://docs.windsurf.com/windsurf/cascade/memories>
(fetched 2026-10-26).

## OpenCode (mcp+rules)

| Step | File | Shape |
|---|---|---|
| MCP | `~/.config/opencode/opencode.json` | `mcp.aletheia = {type: "local", command: [bun, mcp.mjs], enabled: true}` |
| Rules | `AGENTS.md` / `~/.config/opencode/AGENTS.md` | managed block |

No hook or plugin is written. The official plugin page lists `~/.config/opencode/plugins/` and event names
(`session.idle`, `message.updated`, `tool.execute.after`, ...) but not the fields inside each event payload.
Reading a guessed field such as `event.properties.sessionID` would be fabrication, so the capability is
`mcp+rules`. A JSONC-only `opencode.jsonc` is refused rather than parsed as JSON. OpenCode is installed here;
no plugin was loaded by us.

Source: <https://opencode.ai/docs/mcp-servers/>, <https://opencode.ai/docs/rules/>,
<https://opencode.ai/docs/plugins/> (fetched 2026-10-26).

## Claude Desktop (MCP only)

No hooks and no rules file. The config merge is documented and fixture-tested in
[docs/claude-desktop.md](claude-desktop.md). The Linux path is observed on this machine, not in the MCP
quickstart, and is marked UNVERIFIED.

## End-to-end test

`test/e2e-more-hosts.test.mjs` installs all six full-capability hosts into a temp HOME, reads the command back
from each config, pipes a recorded payload set through it, and checks rows, redaction and p95. On 2026-10-26:
2 tests pass, p95 1.24 to 2.48 ms per host (hook work only). This is the real installed command, not a call to
the adapter; it is still not the host application.

## Sources for the five new hosts

| Source | What it gave | Date |
|---|---|---|
| <https://cursor.com/docs/agent/hooks> | hooks.json shape, events, payload fields | 2026-10-26 |
| <https://cursor.com/docs/context/mcp> | `~/.cursor/mcp.json`, `mcpServers` shape | 2026-10-26 |
| <https://cursor.com/docs/context/rules> | `.cursor/rules/*.mdc`, frontmatter | 2026-10-26 |
| <https://developers.openai.com/codex/hooks> | hooks.json/inline shape, events, fields | 2026-10-26 |
| <https://developers.openai.com/codex/config-reference> | `[mcp_servers]`, hooks feature | 2026-10-26 |
| <https://developers.openai.com/codex/agent-configuration/agents-md> | project and global AGENTS.md | 2026-10-26 |
| <https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md> | hooks shape, events, fields | 2026-10-26 |
| <https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/tools/mcp-server.md> | `mcpServers` | 2026-10-26 |
| <https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/gemini-md.md> | GEMINI.md paths | 2026-10-26 |
| <https://docs.windsurf.com/windsurf/cascade/hooks> | hooks shape, events, fields | 2026-10-26 |
| <https://docs.windsurf.com/windsurf/cascade/mcp> | `mcp_config.json` paths | 2026-10-26 |
| <https://docs.windsurf.com/windsurf/cascade/memories> | rules paths and `trigger` | 2026-10-26 |
| <https://opencode.ai/docs/mcp-servers/> | `mcp` key, local entry | 2026-10-26 |
| <https://opencode.ai/docs/rules/> | AGENTS.md paths | 2026-10-26 |
| <https://opencode.ai/docs/plugins/> | plugin dirs and event names only | 2026-10-26 |
| <https://modelcontextprotocol.io/quickstart/user> | Claude Desktop paths (macOS/Windows) | 2026-10-26 |
