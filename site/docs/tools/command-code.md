# Command Code memory with Aletheia

<!-- description: Install Aletheia memory in Command Code: the MCP entry, three hooks and AGENTS.md rules block it writes, what it cannot capture, and what was tested. -->
<!-- keywords: command code memory, command code hooks, command code mcp server, command code agents.md rules, aletheia command code, commandcode persistent memory -->

Aletheia (aletheia-mem) gives Command Code a local memory. One command adds an MCP server entry, three hooks and a managed rules block in `~/.commandcode/AGENTS.md`. Command Code has no prompt hook and no session-end hook, so Aletheia captures tool calls but not your prompts.

## What you get

- **MCP server.** An entry named `aletheia` in `~/.commandcode/mcp.json`.
- **Hooks.** Three events in `~/.commandcode/settings.json`: `SessionStart`, `PostToolUse` and `Stop`.
- **Session-start context.** The `SessionStart` hook prints recalled memory for the current project.
- **Rules.** Your rules, written into `~/.commandcode/AGENTS.md` between markers.

Level: `full`, with fewer events than Claude Code because Command Code offers fewer.

## Install

```bash
npm install -g aletheia-mem
aletheia install command-code            # dry run: prints every step, writes nothing
aletheia install command-code --write    # applies it, with backups
```

Start a new Command Code session afterwards.

## What gets written

Real dry-run output from a temporary HOME. Paths start with `/tmp/tmp.Ez6NqCkeLC`, the temporary home folder of the run. On your machine they start with your own home folder.

```
$ aletheia install command-code
Command Code (command-code) — full, mcp-verified
  write  mcp      /tmp/tmp.Ez6NqCkeLC/.commandcode/mcp.json  (mcpServers.aletheia)
  write  hooks    /tmp/tmp.Ez6NqCkeLC/.commandcode/settings.json  (SessionStart, PostToolUse, Stop)
  write  rules    /tmp/tmp.Ez6NqCkeLC/.commandcode/AGENTS.md  (1 rule)
  note  Command Code has no UserPromptSubmit hook: user prompts are not captured.
  note  Command Code has no SessionEnd hook: session-end summaries are not captured.
  note  Command Code SessionStart reports startup, resume or clear only; there is no compact source.
  note  apply builds /tmp/tmp.eHRtbNMs5s/aletheia.bundle.mjs so a hook loads one module, not a dozen
Dry run: nothing was written. Add --write to apply.
```

The MCP entry that `--write` produced in `mcp.json`:

```json
{
  "mcpServers": {
    "aletheia": {
      "transport": "stdio",
      "command": "/home/you/.bun/bin/bun",
      "args": ["/path/to/aletheia-mem/bin/mcp.mjs"]
    }
  }
}
```

One hook entry from `settings.json`. Existing keys such as `permissions` are kept.

```json
"PostToolUse": [
  {
    "hooks": [
      {
        "type": "command",
        "command": "/home/you/.bun/bin/bun /tmp/tmp.eHRtbNMs5s/aletheia.bundle.mjs hook command-code PostToolUse # aletheia-managed",
        "timeout": 10
      }
    ]
  }
]
```

Aletheia writes no `matcher` on any of the three events. Command Code's hooks page (https://commandcode.ai/docs/hooks, fetched 2026-10-29) says `matcher` is optional, only meaningful for `PreToolUse` and `PostToolUse`, and must be left out for `Stop` and `SessionStart`. It says user hooks are read from `~/.commandcode/settings.json`.

## Hooks and events

| Event | What Aletheia does |
|---|---|
| `SessionStart` | Stores nothing. Prints recalled memory as `hookSpecificOutput.additionalContext`. A `resume` start prints nothing. |
| `PostToolUse` | Stores an event: tool name (or Command Code's display name), a one-line input summary, and input plus output cut to 1,500 characters. |
| `Stop` | Stores no text. Queues the session for compression and marks it ended. |

Not installed, because Command Code does not offer them: `UserPromptSubmit` and `SessionEnd`. The fetched hooks page lists `PreToolUse`, `PostToolUse`, `Stop` and `SessionStart` only, and gives the `SessionStart` source values `startup`, `resume` and `clear`. Aletheia does not install `PreToolUse`.

What this means in practice:

- Your prompts are not stored.
- No session-end summary is stored, because `Stop` carries no assistant text in Aletheia's adapter.
- Tool calls are stored, and session-start context is injected.

Every hook has a 10 second timeout in the file, exits 0 whatever happens, makes no network call and no model call, and redacts before it stores. See [Hooks reference](../reference/hooks.md).

## Rules file

`aletheia install command-code --write` writes your rules into `~/.commandcode/AGENTS.md`. For a project file, run `aletheia rules sync --tools command-code --dir <project> --write`, which writes `<project>/AGENTS.md`.

The block sits between these markers. Text outside them is never touched:

```
<!-- aletheia:rules:begin -->
# Rules

Managed by aletheia-mem. Edit them in the Rules page; this block is rewritten on sync.

## Everywhere

- Run the narrow test before the full suite.
<!-- aletheia:rules:end -->
```

The `AGENTS.md` paths come from Command Code's bundled reference, read on 2026-10-26 (see [Installer reference](../25-installers.md)). No public page was fetched for them on 2026-10-29. UNVERIFIED: that Command Code loaded the block in a real session. The [rules targets table](../verification/rules-targets.md) records "real tool read: not run" for every host.

## Verify it works

```bash
aletheia install command-code --verify
aletheia doctor
```

`--verify` prints `ok`, `drift` or `missing` for the MCP file, the hooks file and the rules file, and `command-code: matches the recorded install` when all match. In `doctor`, look for `hooks command-code    3/3 in ...settings.json`. `FAIL server` only means the dashboard server is not running; hooks and the MCP server do not need it.

To check the MCP entry with the real CLI, run `cmd mcp list`. (On the test machine the Command Code CLI is installed as `cmd`; its `--version` printed 1.88.1.) For this page it was run on 2026-10-29 in the temporary home, with the config shown above. It printed:

```
MCP Servers

  NAME      TYPE   SCOPE    AUTH  STATUS
  aletheia  stdio  user     -     enabled

Total: 1 server
```

The status `enabled` means the server is configured. This listing does not start the server.

To see the first captured memory:

1. Open a short Command Code session in a project and make it read a file.
2. Run `aletheia search "<a word from the file name>"`, or open `http://127.0.0.1:37790` and check the Activity and Knowledge tabs. The Connections tab shows the hook count and the time of the last capture.

You will see tool events. You will not see your prompts.

## Uninstall

```bash
aletheia uninstall command-code            # dry run
aletheia uninstall command-code --write
```

Real dry-run output:

```
Command Code (command-code)
  remove mcp      /tmp/tmp.Ez6NqCkeLC/.commandcode/mcp.json
  remove hooks    /tmp/tmp.Ez6NqCkeLC/.commandcode/settings.json  (no aletheia hooks)
  remove rules    /tmp/tmp.Ez6NqCkeLC/.commandcode/AGENTS.md
Dry run: nothing was written. Add --write to remove.
```

The `(no aletheia hooks)` label is the installer's own wording for the hooks line. In the Claude Code test run the same label appeared and the hook entries were removed. Uninstall removes only the entries the manifest lists. If you edited a file after the install, it refuses and asks for `--force`.

## Verification status

- The MCP server was listed by the real CLI (Command Code 1.88.1) on 2026-10-27.
- Hooks ran in one short Command Code session, one user on one machine. The checker saw `PostToolUse` and `Stop`.
- The settings shape and the `SessionStart` source values were read from the CLI's bundled reference, generated from commandcode.ai/docs, on 2026-10-26, and again from https://commandcode.ai/docs/hooks on 2026-10-29.
- UNVERIFIED: whether `UserPromptSubmit` or `SessionEnd` exist in newer Command Code releases. The fetched page does not mention them. Re-fetch the page after each Command Code release.
- Answer accuracy is not measured. Benchmarks are retrieval only.

## Known limits

- No prompt capture and no session-end summary, as above.
- The evidence is one short session. Treat the hook path as lightly tested.
- The hook command holds absolute paths to Bun and the data dir bundle. If you move either, run `aletheia install command-code --write` again.
- Compression is queued, not run in the hook. Run `aletheia compress`, or keep `aletheia-server` running.
- Aletheia writes user-level files only.

## Next steps

- [Hooks reference](../reference/hooks.md) - the events, fields and guarantees of every hook.
- [Claude Code](claude-code.md) - the host with all five events, for comparison.
- [Rules](../concepts/rules.md) - how the AGENTS.md block is built and synced.
- [Tools overview](overview.md) - all hosts and their verification status.
