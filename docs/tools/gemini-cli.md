# Gemini CLI memory with Aletheia

<!-- description: Install Aletheia memory in Gemini CLI: the settings.json MCP entry and five hooks, the GEMINI.md rules block, and the status that no hook ran. -->
<!-- keywords: gemini cli memory, gemini cli hooks, gemini cli mcp server, gemini.md rules, aletheia gemini cli, gemini cli persistent memory -->

Aletheia (aletheia-mem) can write a local memory setup for Gemini CLI: an MCP server entry and five hooks in `~/.gemini/settings.json`, and a managed rules block in `~/.gemini/GEMINI.md`. This setup is config written from docs, not tested on a real install. No hook ran in Gemini CLI.

## What you get

- **MCP server.** An entry named `aletheia` under `mcpServers` in `~/.gemini/settings.json`.
- **Hooks.** Five events under `hooks` in the same file: `SessionStart`, `BeforeAgent`, `AfterTool`, `AfterAgent` and `SessionEnd`.
- **Session-start context.** The `SessionStart` hook prints recalled memory for the current project.
- **Rules.** Your rules, written into `~/.gemini/GEMINI.md` between markers.

Level: `full`. Verification: `from-docs-only`.

## Install

```bash
npm install -g aletheia-mem
aletheia install gemini-cli            # dry run: prints every step, writes nothing
aletheia install gemini-cli --write    # applies it, with backups
```

Start a new Gemini CLI session afterwards.

## What gets written

Real dry-run output from a temporary HOME. Paths start with `/tmp/tmp.Ez6NqCkeLC`, the temporary home folder of the run. On your machine they start with your own home folder.

```
$ aletheia install gemini-cli
Gemini CLI (gemini-cli) — full, from-docs-only
  write  settings /tmp/tmp.Ez6NqCkeLC/.gemini/settings.json  (MCP + hooks)
  write  rules    /tmp/tmp.Ez6NqCkeLC/.gemini/GEMINI.md  (1 rule)
  note  Gemini keeps hooks and MCP servers in the same ~/.gemini/settings.json; the installer merges both.
  note  Gemini hook timeouts are milliseconds; the installer writes 10000.
  note  No real Gemini hook has run here.
  ...
Dry run: nothing was written. Add --write to apply.
```

Gemini keeps MCP servers and hooks in one file, so the installer changes both in one step and keeps one backup. The result of `--write`:

```json
{
  "mcpServers": {
    "aletheia": {
      "command": "/home/you/.bun/bin/bun",
      "args": ["/path/to/aletheia-mem/bin/mcp.mjs"]
    }
  },
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "/home/you/.bun/bin/bun /tmp/tmp.eHRtbNMs5s/aletheia.bundle.mjs hook gemini-cli SessionStart # aletheia-managed",
            "timeout": 10000
          }
        ]
      }
    ],
    ...
  }
}
```

The Gemini pages (fetched 2026-10-29) agree on these points: hooks live in `settings.json` under `hooks`, shaped `hooks.<Event>[].hooks[]` with a `type` of `command`, a `command` and an optional `timeout`; the timeout is in milliseconds with a default of 60000; MCP servers live under a top-level `mcpServers` object in `~/.gemini/settings.json` (user) or `.gemini/settings.json` (project). If `mcpServers.aletheia` already exists and is not Aletheia's, the installer stops with an error and leaves it alone.

## Hooks and events

| Event | What Aletheia does |
|---|---|
| `SessionStart` | Stores nothing. Prints recalled memory as `hookSpecificOutput.additionalContext`. A `resume` start prints nothing. |
| `BeforeAgent` | Stores the `prompt` field as a note, redacted. Prompts under 3 characters are skipped. |
| `AfterTool` | Stores an event from `tool_name`, `tool_input` and `tool_response`, cut to 1,500 characters. |
| `AfterAgent` | Stores `prompt_response` as a summary, once per agent turn. Queues the session for compression. |
| `SessionEnd` | Stores no text. Queues the session for compression and marks it ended. |

The Gemini hooks reference (https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/hooks/reference.md, fetched 2026-10-29) lists these fields: `source` on `SessionStart` (`startup`, `resume` or `clear`), `prompt` on `BeforeAgent`, `tool_name`, `tool_input` and `tool_response` on `AfterTool`, `prompt` and `prompt_response` on `AfterAgent`, and `reason` on `SessionEnd`. It says a `SessionStart` hook reads `hookSpecificOutput.additionalContext` from the JSON on stdout, and that a hook must print nothing but that JSON. Aletheia's `SessionStart` hook prints only that JSON. The page lists more events than the five installed, such as `BeforeTool`, `BeforeModel` and `PreCompress`. Aletheia installs none of them.

Every hook exits 0 whatever happens, makes no network call and no model call, and redacts before it stores. See [Hooks reference](../reference/hooks.md).

## Rules file

`aletheia install gemini-cli --write` writes your rules into `~/.gemini/GEMINI.md`. For a project file, run `aletheia rules sync --tools gemini-cli --dir <project> --write`, which writes `<project>/GEMINI.md`.

```
<!-- aletheia:rules:begin -->
# Rules

Managed by aletheia-mem. Edit them in the Rules page; this block is rewritten on sync.

## Everywhere

- Run the narrow test before the full suite.
<!-- aletheia:rules:end -->
```

Text outside the markers is never touched. The Gemini context page (https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/gemini-md.md, fetched 2026-10-29) says Gemini CLI loads `GEMINI.md` from `~/.gemini/GEMINI.md`, from the workspace and its parent directories, and just in time when a tool touches a file or directory, and joins them. See [Rules](../concepts/rules.md).

## Verify it works

```bash
aletheia install gemini-cli --verify
aletheia doctor
```

`--verify` prints `ok`, `drift` or `missing` for the settings file and the rules file. In `doctor`, look for `hooks gemini-cli    5/5 in ...settings.json`.

Nobody has seen these hooks run in Gemini CLI. If you try it:

1. Run the install, start Gemini CLI, and send one prompt.
2. Run `aletheia search "<a word from your prompt>"`, or open `http://127.0.0.1:37790` and check the Activity and Knowledge tabs. The Connections tab shows the hook count and the time of the last capture.
3. Report what you saw, with your Gemini CLI version, in an issue at https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues.

## Uninstall

```bash
aletheia uninstall gemini-cli            # dry run
aletheia uninstall gemini-cli --write
```

Real dry-run output:

```
Gemini CLI (gemini-cli)
  remove settings /tmp/tmp.Ez6NqCkeLC/.gemini/settings.json
  remove rules    /tmp/tmp.Ez6NqCkeLC/.gemini/GEMINI.md
Dry run: nothing was written. Add --write to remove.
```

Uninstall removes the `aletheia` MCP entry only if it is Aletheia's, the managed hook entries, and the rules block. Other settings stay. If you edited a file after the install, it refuses and asks for `--force`.

## Verification status

- Gemini CLI: config written from docs, not tested on a real install. No hook ran in Gemini CLI.
- Gemini CLI 0.37.0 was present on the test machine. No hook was run with it.
- The formats come from the three Gemini pages named above, fetched 2026-10-26 and again 2026-10-29.
- The installer and the hook adapter were tested against fixtures and recorded payloads in a temporary HOME. The project README says two hook checks (Windsurf and Gemini CLI) are skipped in CI on Windows.
- Answer accuracy is not measured. Benchmarks are retrieval only.

## Known limits

- Nothing here has run in Gemini CLI. Expect to find differences.
- One summary memory is stored per agent turn, not per session.
- The installer refuses a `settings.json` that is not plain JSON. If yours has comments, move them out first.
- The hook command holds absolute paths to Bun and the data dir bundle. If you move either, run `aletheia install gemini-cli --write` again.
- Compression is queued, not run in the hook. Run `aletheia compress`, or keep `aletheia-server` running.
- Aletheia writes user-level files only.

## Next steps

- [Hooks reference](../reference/hooks.md) - the events, fields and guarantees of every hook.
- [Rules](../concepts/rules.md) - how the GEMINI.md block is built and synced.
- [Project status and limits](../project/status-and-limits.md) - what is tested and what is not.
- [Tools overview](overview.md) - all hosts and their verification status.
