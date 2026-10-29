# Cursor memory with Aletheia

<!-- description: Install Aletheia memory in Cursor: the mcp.json entry, six hooks in hooks.json and the .mdc rules file, with the status that none of it ran in Cursor. -->
<!-- keywords: cursor memory, cursor hooks memory, cursor mcp.json, cursor rules mdc, aletheia cursor, cursor persistent memory -->

Aletheia (aletheia-mem) can write a local memory setup for Cursor: an MCP server entry in `~/.cursor/mcp.json`, six hooks in `~/.cursor/hooks.json`, and a rules file in each project. This setup is config written from docs, not tested on a real install. No hook ran in Cursor.

## What you get

- **MCP server.** An entry named `aletheia` in `~/.cursor/mcp.json`.
- **Hooks.** Six events in `~/.cursor/hooks.json`: `sessionStart`, `beforeSubmitPrompt`, `postToolUse`, `afterAgentResponse`, `stop` and `sessionEnd`.
- **Session-start context.** The `sessionStart` hook prints recalled memory in the `additional_context` field.
- **Rules.** A project file `.cursor/rules/aletheia.mdc`, written by `aletheia rules sync`. `aletheia install cursor` writes no rules, because Cursor has no global rules file.

Level: `full`. Verification: `from-docs-only`.

## Install

```bash
npm install -g aletheia-mem
aletheia install cursor            # dry run: prints every step, writes nothing
aletheia install cursor --write    # MCP entry and hooks, with backups
aletheia rules sync --tools cursor --dir <project> --write    # the project rules file
```

Restart Cursor after the install so it reads the new files.

## What gets written

Real dry-run output from a temporary HOME. Paths start with `/tmp/tmp.Ez6NqCkeLC`, the temporary home folder of the run. On your machine they start with your own home folder.

```
$ aletheia install cursor
Cursor (cursor) — full, from-docs-only
  write  mcp      /tmp/tmp.Ez6NqCkeLC/.cursor/mcp.json  (mcpServers.aletheia)
  write  hooks    /tmp/tmp.Ez6NqCkeLC/.cursor/hooks.json  (sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd)
  note  Cursor is not installed here: the config and payloads were tested against fixtures, not a real Cursor install.
  note  The stop hook carries no assistant text; afterAgentResponse stores the summary and stop queues compression.
  note  Cursor has no global rules file. Use `aletheia rules sync --tools cursor --dir <project> --write` for .cursor/rules/aletheia.mdc.
  ...
Dry run: nothing was written. Add --write to apply.
```

The MCP entry that `--write` produced:

```json
{
  "mcpServers": {
    "aletheia": {
      "command": "/home/you/.bun/bin/bun",
      "args": ["/path/to/aletheia-mem/bin/mcp.mjs"]
    }
  }
}
```

The start of `hooks.json`. Cursor's format is a flat array per event:

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": "/home/you/.bun/bin/bun /tmp/tmp.eHRtbNMs5s/aletheia.bundle.mjs hook cursor sessionStart # aletheia-managed",
        "timeout": 10
      }
    ],
    ...
  }
}
```

The Cursor pages (fetched 2026-10-29) agree on these points: user hooks live in `~/.cursor/hooks.json` with a top-level `version` of 1 and a `hooks` object that maps each event to an array of definitions with a required `command` and an optional `timeout`; global MCP servers live in `~/.cursor/mcp.json`.

## Hooks and events

| Event | What Aletheia does |
|---|---|
| `sessionStart` | Stores nothing. Prints `{"additional_context": "<recalled memory>"}`. |
| `beforeSubmitPrompt` | Stores the prompt as a note, redacted. Prompts under 3 characters are skipped. |
| `postToolUse` | Stores an event from `tool_name`, `tool_input` and `tool_output`, cut to 1,500 characters. |
| `afterAgentResponse` | Stores the `text` field as a summary, once per agent response. |
| `stop` | Stores no text. Queues the session for compression and marks it ended. |
| `sessionEnd` | Does the same as `stop`. |

The project name comes from the first entry of `workspace_roots` in the payload. Cursor's `stop` payload has no assistant text (it carries `status` and `loop_count`), which is why the summary comes from `afterAgentResponse`. The Cursor hooks page lists many more events than the six installed, for example `preToolUse`, `afterFileEdit` and `preCompact`. Aletheia installs none of them.

Every hook exits 0 whatever happens, makes no network call and no model call, and redacts before it stores. The project README says each installed hook command was exercised with a recorded payload in a temporary HOME. That is not a Cursor session. See [Hooks reference](../reference/hooks.md).

## Rules file

Cursor has no global rules file, so `aletheia install cursor` writes none. Run this once per project:

```bash
aletheia rules sync --tools cursor --dir <project> --write
```

It writes `<project>/.cursor/rules/aletheia.mdc`. Real output of that command in the test run:

```
- cursor: /tmp/tmp.e1CAvpmUGV/myproject/.cursor/rules/aletheia.mdc — 1 rules, written
```

The file:

```
---
description: Standing rules managed by aletheia-mem
alwaysApply: true
---

<!-- aletheia:rules:begin -->
# Rules

Managed by aletheia-mem. Edit them in the Rules page; this block is rewritten on sync.

## Everywhere

- Run the narrow test before the full suite.
<!-- aletheia:rules:end -->
```

The Cursor rules page (https://cursor.com/docs/context/rules, fetched 2026-10-29) says project rules live in `.cursor/rules` as `.mdc` files, with the frontmatter fields `description`, `globs` and `alwaysApply`, and that `alwaysApply: true` applies the rule to every chat. It says there is no global rules file; User Rules are set in Cursor's settings, and Aletheia does not write them. See [Rules](../concepts/rules.md).

## Verify it works

```bash
aletheia install cursor --verify
aletheia doctor
```

`--verify` prints `ok`, `drift` or `missing` for the MCP file and the hooks file. In `doctor`, look for `hooks cursor    6/6 in ...hooks.json`. The same run prints this line, which is easy to misread:

```
ok   verify cursor        verified: verified 2026-10-26 — Cursor docs fetched 2026-10-26; Cursor is not installed on this machine
```

The word `verified` here means the evidence date is recent. The evidence text says Cursor was not installed on the test machine.

Nobody has seen these hooks run in Cursor. If you try it:

1. Run the install, restart Cursor, and send one prompt.
2. Run `aletheia search "<a word from your prompt>"`, or open `http://127.0.0.1:37790` and check the Activity and Knowledge tabs. The Connections tab shows the hook count and the time of the last capture.
3. Report what you saw, with your Cursor version, in an issue at https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues.

## Uninstall

```bash
aletheia uninstall cursor            # dry run
aletheia uninstall cursor --write
```

Real dry-run output:

```
Cursor (cursor)
  remove mcp      /tmp/tmp.Ez6NqCkeLC/.cursor/mcp.json
  remove hooks    /tmp/tmp.Ez6NqCkeLC/.cursor/hooks.json  (no aletheia hooks)
Dry run: nothing was written. Add --write to remove.
```

The `(no aletheia hooks)` label is the installer's own wording for the hooks line. In the Claude Code test run the same label appeared and the hook entries were removed. Uninstall does not remove `.cursor/rules/aletheia.mdc`, because install did not write it. Delete that file yourself in each project where you ran `rules sync`.

## Verification status

- Cursor: config written from docs, not tested on a real install. No hook ran in Cursor.
- The formats come from https://cursor.com/docs/agent/hooks, https://cursor.com/docs/context/mcp and https://cursor.com/docs/context/rules, fetched 2026-10-26 and again 2026-10-29. Cursor is not installed on the machine used for the tests.
- The installer and the hook adapter were tested against fixtures and recorded payloads in a temporary HOME.
- UNVERIFIED: the MCP docs field table lists `"type": "stdio"` as a required field, while its examples omit it. Aletheia writes no `type`. A real Cursor install would settle whether the entry loads.
- UNVERIFIED: the hooks page lists `continue` as an output field of `beforeSubmitPrompt`. Aletheia's hook prints nothing for that event. Whether Cursor lets the prompt through when a hook prints nothing was not checked.
- Answer accuracy is not measured. Benchmarks are retrieval only.

## Known limits

- Nothing here has run in Cursor. Expect to find differences.
- No global rules file. You need one `rules sync` per project.
- One summary memory is stored per agent response, not per session.
- The `sessionStart` hook prints context on every start. The adapter has no special case for resumed sessions.
- The hook command holds absolute paths to Bun and the data dir bundle. If you move either, run `aletheia install cursor --write` again.
- Compression is queued, not run in the hook. Run `aletheia compress`, or keep `aletheia-server` running.

## Next steps

- [Hooks reference](../reference/hooks.md) - the events, fields and guarantees of every hook.
- [Rules](../concepts/rules.md) - how the `.mdc` block is built and synced.
- [Project status and limits](../project/status-and-limits.md) - what is tested and what is not.
- [Tools overview](overview.md) - all hosts and their verification status.
