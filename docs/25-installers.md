# 25. Installers and automatic capture

Status: implemented 2026-10-26. This page records what each installer writes, which hook fields it reads, and
what is verified on this machine.

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
