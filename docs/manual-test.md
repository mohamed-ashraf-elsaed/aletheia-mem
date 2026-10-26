# Manual test: real Claude Code and Command Code sessions

This is the check a person runs once on a real machine. The automated tests use a temporary `HOME`; they cannot
prove that the host tool calls our hooks.

Legend: **RUN BY AUTHOR** means the command was run on 2026-10-26. **NOT RUN BY AUTHOR** means it needs a real
interactive session and was not run.

## 0. Prerequisites

- Bun 1.1 or newer: `bun --version`.
- This repository checked out.
- No server needed. Hooks write to the SQLite store directly. Start `bun bin/aletheia-server.mjs` only if you want
  the Hub UI or the MCP server.

## 1. Preview (safe, writes nothing)

**RUN BY AUTHOR**

```bash
HOME=$(mktemp -d) bun bin/aletheia.mjs install claude-code --dry-run
```

Expected: three steps (`mcp`, `hooks`, `rules`) and "Dry run: nothing was written."

## 2. Install into your real HOME

**NOT RUN BY AUTHOR**

```bash
bun bin/aletheia.mjs install claude-code --write
bun bin/aletheia.mjs install command-code --write
```

Expected: each prints three written files and builds `~/.aletheia/aletheia.bundle.mjs`.
Check the backups exist:

```bash
ls ~/.claude/*.aletheia-bak-* ~/.claude.json.aletheia-bak-* ~/.commandcode/*.aletheia-bak-* 2>/dev/null
```

Run the install again. Expected: every step says `done` and "Already installed; nothing changed." No new backups.

## 3. A real Claude Code session

**NOT RUN BY AUTHOR**

```bash
cd /path/to/a/git/repo
claude
```

Inside the session:

1. Ask: `What memory or rules do you have for this project?` The answer should mention the pinned memory and rules
   from the SessionStart block. The block starts with `<aletheia-memory>`.
2. Submit a normal prompt: `Add a short comment to README.md`.
3. Let it run a tool (read or edit the file).
4. Run `/compact`, then ask again: `What memory do you see now?` The context should be injected again.
5. Exit with `/exit`.

Then in a shell:

```bash
bun bin/aletheia.mjs search "README"
bun bin/aletheia.mjs doctor
```

Expected:

- `search` finds the prompt and the tool event with tool `claude-code`.
- `doctor` prints `ok server` only if a server is running; `ok hooks claude-code` must say `5/5`; `ok spool`
  must say `empty`; `last capture` must show a recent time.

## 4. A real Command Code session

**NOT RUN BY AUTHOR**

```bash
cd /path/to/a/git/repo
cmd
```

Inside the session:

1. Ask: `What memory do you have for this project?` The SessionStart context should be visible.
2. Ask it to run a shell command, e.g. `Run ls and tell me what you see`.
3. End the turn normally.

Then:

```bash
bun bin/aletheia.mjs search "ls" --tool command-code
bun bin/aletheia.mjs doctor
```

Expected:

- `search` finds the `SHELL:` tool event.
- `doctor` prints `ok hooks command-code` with `3/3`.
- **Prompts are not captured in Command Code.** That is expected: it has no `UserPromptSubmit` hook.
- `SessionEnd` summaries are not captured either.

If a hook does not fire, run `cmd --debug` and `tail -f ~/.commandcode/logs/command.log`. For Claude Code, check
`~/.claude/settings.json` still contains the `# aletheia-managed` entries.

## 5. Uninstall

**NOT RUN BY AUTHOR**

```bash
bun bin/aletheia.mjs uninstall claude-code --write
bun bin/aletheia.mjs uninstall command-code --write
```

Expected: only the `# aletheia-managed` hooks and the `aletheia` MCP server are removed. Your own hooks, your
other MCP servers, `permissions`, `model` and other settings remain. The managed rules block is removed from
`~/.claude/CLAUDE.md` and `~/.commandcode/AGENTS.md`; text outside the markers stays.

A second uninstall prints `<tool> ... is not installed`.

## 6. The one UI (Work, Memory, Rules, Tools)

The shell is checked by `test/one-ui.test.mjs` (routes, tab containers, API shapes, DOM-free helpers). A real
Chromium check was also run.

**RUN BY AUTHOR, 2026-10-26** with a temporary server and a temporary HOME:

```bash
HOME=/tmp/aletheia-ui-home ALETHEIA_DATA_DIR=/tmp/aletheia-ui-data ALETHEIA_PORT=38881 \
  bun bin/aletheia-server.mjs
```

Opened `http://127.0.0.1:38881/#/memory`, then `#/rules`, `#/tools` and `#/work` in Chromium through the connected
Playwright MCP browser. Observed:

- The header stayed visible on all four tabs: tab bar, project selector, search box and a green health dot labelled
  "Server healthy".
- The Memory tab rendered the stats, memories, facts Current/History toggle, review queue, dismissed rows and both
  details blocks. No console errors.
- Typing `retry` in the header search and pressing Enter kept the `#/memory` route and printed the channels
  (`facts: lexical + keys`, `episodes: lexical`, `fused: none`) and the empty-store reason.
- The Rules tab rendered the editor, suggestions, sync and import panels; no console errors.
- The Tools tab rendered both installer cards, the hook counts, spool sizes and the full doctor table; no console
  errors.
- The Work tab mounted the existing Work page under the shell header. It showed "Local source unavailable" because
  the temporary HOME has no claude-mem database; that is expected for this run.
- `prefers-color-scheme: dark` was emulated; the page stayed readable and the shell colours switched.

**NOT RUN BY AUTHOR:** a person should still check at 375 px width, with a real claude-mem database in the Work tab,
and with a keyboard only (Tab through the header, open each tab, open a details block, and dismiss + restore one
memory). The automated run proves the scripts load and the DOM is reachable; it does not assert pixel layout.

## What the automated tests already cover

`test/install-claude.test.mjs`, `test/claude-hooks.test.mjs` and `test/e2e-capture.test.mjs` cover: the dry run,
merge and backup, second-run idempotence, refusal of unparsable JSON, uninstall, the exact commands read back from
the settings files, every recorded payload, secret redaction, the spool and flush, `doctor`, and the hook time
budget. They run against a temporary `HOME`, never your real one.
