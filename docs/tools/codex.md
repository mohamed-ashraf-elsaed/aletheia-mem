# Codex CLI memory with Aletheia

<!-- description: Install Aletheia memory in Codex CLI: the config.toml MCP entry, five hooks and AGENTS.md rules block it writes, the /hooks review, and what was tested. -->
<!-- keywords: codex cli memory, codex hooks, codex mcp server config.toml, codex agents.md rules, aletheia codex, openai codex persistent memory -->

Aletheia (aletheia-mem) gives Codex CLI a local memory. One command adds an MCP server table to `~/.codex/config.toml`, five hooks in `~/.codex/hooks.json` and a managed rules block in `~/.codex/AGENTS.md`. Codex asks you to review the hooks once before it runs them.

## What you get

- **MCP server.** A `[mcp_servers.aletheia]` table in `~/.codex/config.toml`.
- **Hooks.** Five events in `~/.codex/hooks.json`. They store your prompts, tool calls and the final reply of each turn, with secrets redacted.
- **Session-start context.** The `SessionStart` hook prints recalled memory for the current project.
- **Rules.** Your rules, written into `~/.codex/AGENTS.md` between markers.

Level: `full`.

## Install

```bash
npm install -g aletheia-mem
aletheia install codex            # dry run: prints every step, writes nothing
aletheia install codex --write    # applies it, with backups
```

Then start Codex CLI and run `/hooks`. Codex skips hooks that you have not reviewed and trusted. The Codex hooks page (https://learn.chatgpt.com/docs/hooks, fetched 2026-10-29; `developers.openai.com/codex/hooks` redirects there) says Codex tracks trust by hash, so a new or changed hook is skipped until you trust it. If you run `aletheia install codex --write` again and it changes the hook file, review the hooks again.

## What gets written

Real dry-run output from a temporary HOME. Paths start with `/tmp/tmp.Ez6NqCkeLC`, the temporary home folder of the run. On your machine they start with your own home folder.

```
$ aletheia install codex
Codex CLI (codex) — full, mcp-verified
  write  mcp      /tmp/tmp.Ez6NqCkeLC/.codex/config.toml  ([mcp_servers.aletheia])
  write  hooks    /tmp/tmp.Ez6NqCkeLC/.codex/hooks.json  (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd)
  write  rules    /tmp/tmp.Ez6NqCkeLC/.codex/AGENTS.md  (1 rule)
  note  Codex requires non-managed hooks to be reviewed once with /hooks before they run.
  ...
  note  apply builds /tmp/tmp.eHRtbNMs5s/aletheia.bundle.mjs so a hook loads one module, not a dozen
Dry run: nothing was written. Add --write to apply.
```

The TOML table that `--write` appended to `config.toml`:

```toml
[mcp_servers.aletheia]
command = "/home/you/.bun/bin/bun"
args = ["/path/to/aletheia-mem/bin/mcp.mjs"]
```

The installer checks the TOML only in a simple way: it refuses a file that looks like JSON, has an unbalanced quote, or already has a `[mcp_servers.aletheia]` table that is not its own. It does not parse TOML fully.

Two entries from `hooks.json`. `SessionStart` has a matcher, and `SessionEnd` has a 3 second timeout:

```json
"SessionStart": [
  {
    "matcher": "startup|clear|compact|fork",
    "hooks": [
      {
        "type": "command",
        "command": "/home/you/.bun/bin/bun /tmp/tmp.eHRtbNMs5s/aletheia.bundle.mjs hook codex SessionStart # aletheia-managed",
        "timeout": 10
      }
    ]
  }
],
...
"SessionEnd": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "/home/you/.bun/bin/bun /tmp/tmp.eHRtbNMs5s/aletheia.bundle.mjs hook codex SessionEnd # aletheia-managed",
        "timeout": 3
      }
    ]
  }
]
```

The Codex hooks page says `SessionEnd` has a default timeout of 1 second and a maximum of 3 seconds. The hooks page also lists the `SessionStart` sources `startup`, `resume`, `clear`, `compact` and `fork`; the matcher above leaves out `resume`.

## Hooks and events

| Event | Matcher | What Aletheia does |
|---|---|---|
| `SessionStart` | `startup\|clear\|compact\|fork` | Stores nothing. Prints recalled memory as `hookSpecificOutput.additionalContext`. A `resume` start prints nothing. |
| `UserPromptSubmit` | none | Stores the prompt as a note, redacted. Prompts under 3 characters are skipped. |
| `PostToolUse` | none | Stores an event: tool name, a one-line input summary, and input plus output cut to 1,500 characters. |
| `Stop` | none | Stores `last_assistant_message` as a summary when present. Queues the session for compression and marks it ended. |
| `SessionEnd` | none | Stores no text. Queues the session for compression and marks it ended. |

The Codex page says `SessionEnd` runs when you archive or delete an open conversation, when Codex closes normally, or after 30 minutes idle with no connected client. Every hook exits 0 whatever happens, makes no network call and no model call, and redacts before it stores. See [Hooks reference](../reference/hooks.md).

## Rules file

`aletheia install codex --write` writes your rules into `~/.codex/AGENTS.md`. For a project file, run `aletheia rules sync --tools codex --dir <project> --write`, which writes `<project>/AGENTS.md`.

```
<!-- aletheia:rules:begin -->
# Rules

Managed by aletheia-mem. Edit them in the Rules page; this block is rewritten on sync.

## Everywhere

- Run the narrow test before the full suite.
<!-- aletheia:rules:end -->
```

Text outside the markers is never touched. The Codex page on AGENTS.md (https://learn.chatgpt.com/docs/agent-configuration/agents-md, fetched 2026-10-29) says Codex reads the global file in `~/.codex` first, then `AGENTS.md` files from the project root down to the current directory, with files closer to your working directory coming later.

## Verify it works

```bash
aletheia install codex --verify
aletheia doctor
codex mcp list
```

`--verify` prints `ok`, `drift` or `missing` for the three files. In `doctor`, look for `hooks codex    5/5 in ...hooks.json`. `FAIL server` only means the dashboard server is not running; hooks and the MCP server do not need it. The MCP check recorded on 2026-10-27 was against Codex 0.130.0. For this page, `codex mcp list` was run on 2026-10-29 in the temporary home with the config shown above. The Codex CLI on that machine reports 0.165.0 and printed:

```
Name      Command                     Args                                             Env  Cwd  Status   Auth
aletheia  /home/you/.bun/bin/bun  /path/to/aletheia-mem/bin/mcp.mjs  -    -    enabled  Unsupported
```

The status `enabled` means the server is configured. Codex also printed a warning about helper binaries under `/tmp`, which comes from running in a temporary folder.

To see the first captured memory:

1. Run `/hooks` in Codex and trust the Aletheia hooks.
2. Send one prompt that makes Codex run a command or read a file.
3. Run `aletheia search "<a word from your prompt>"`, or open `http://127.0.0.1:37790` and check the Activity and Knowledge tabs. The Connections tab shows `hooks 5/5` and the time of the last capture.

## Uninstall

```bash
aletheia uninstall codex            # dry run
aletheia uninstall codex --write
```

Real dry-run output:

```
Codex CLI (codex)
  remove mcp      /tmp/tmp.Ez6NqCkeLC/.codex/config.toml
  remove hooks    /tmp/tmp.Ez6NqCkeLC/.codex/hooks.json  (no aletheia hooks)
  remove rules    /tmp/tmp.Ez6NqCkeLC/.codex/AGENTS.md
Dry run: nothing was written. Add --write to remove.
```

The `(no aletheia hooks)` label is the installer's own wording for the hooks line. In the Claude Code test run the same label appeared and the hook entries were removed. Uninstall removes only the `[mcp_servers.aletheia]` table if it is Aletheia's, the managed hook entries and the rules block. If you edited a file after the install, it refuses and asks for `--force`.

## Verification status

- The MCP server was listed by the real CLI (Codex 0.130.0) on 2026-10-27.
- Hooks ran in one interactive Codex CLI session (reviewed once with `/hooks`), one user on one machine.
- The hook, config and AGENTS.md formats were fetched from the OpenAI Codex pages on 2026-10-26 and again on 2026-10-29. The pages now live under `learn.chatgpt.com`; the old `developers.openai.com` addresses redirect there.
- Fetched 2026-10-29: the hooks page lists `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PostToolUse`, `Stop` and others, the `~/.codex/hooks.json` location, the `last_assistant_message` field on `Stop`, and the `/hooks` trust step. The config reference shows `[mcp_servers.<id>]` with `command`, `args` and `env`.
- No test confirmed that Codex loaded the rules block. The [rules targets table](../verification/rules-targets.md) records "real tool read: not run".
- Answer accuracy is not measured. Benchmarks are retrieval only.

## Known limits

- One interactive session is the whole real-use evidence. The repository records two Codex versions: 0.130.0 for the MCP listing check on 2026-10-27, and 0.165.0 as the installed CLI in the [installer reference](../25-installers.md). The CLI on the machine used for this page reports 0.165.0. This page does not claim a hook run on a specific version.
- The installer always writes under `~/.codex`. It does not read `CODEX_HOME`. If you set `CODEX_HOME`, the files land in a place Codex does not read.
- The AGENTS.md page says Codex uses `AGENTS.override.md` in the global folder when that file exists and is not empty, and `AGENTS.md` otherwise. If you have an override file, Codex does not read the block Aletheia wrote to `AGENTS.md`.
- The hook command holds absolute paths to Bun and the data dir bundle. If you move either, run `aletheia install codex --write` again and review the hooks again.
- Compression is queued, not run in the hook. Run `aletheia compress`, or keep `aletheia-server` running.

## Next steps

- [Hooks reference](../reference/hooks.md) - the events, fields and guarantees of every hook.
- [Rules](../concepts/rules.md) - how the AGENTS.md block is built and synced.
- [Troubleshooting](../guides/troubleshooting.md) - when Codex skips the hooks.
- [Tools overview](overview.md) - all hosts and their verification status.
