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
- The Work tab showed Aletheia's own view, not the old iframe: a health/last-capture/queue/mode strip, "Now" with
  three sessions (one in progress, two finished), "Needs you" with a contradiction, a rule suggestion and a
  dismissed row, "Recent memory" with source and importance, and a goal with two dated quotes.
- The session page `#/work/session/s1?project=shop` showed the summary, an ordered timeline (prompt, tool, prompt,
  summary) and the extracted fact with its source. No console errors.
- `prefers-color-scheme: dark` was emulated; the page stayed readable and the shell colours switched.

**NOT RUN BY AUTHOR:** a person should still check the Work tab at 375 px width, with a keyboard only (Tab through
the header, open each tab, open a details block, pin and restore a goal), and with a real live capture over more
than 10 seconds to see the refresh. The automated run proves the scripts load and the DOM is reachable; it does not
assert pixel layout or the timer under a real host.

### Work view steps (RUN BY AUTHOR, 2026-10-26)

1. Seed a temporary hub (the fixture in `test/work.test.mjs` creates prompts, tool events, a summary, a fact, a
   review item, a rule suggestion, a dismissal and a job).
2. Start the server with a temporary `HOME`, `ALETHEIA_DATA_DIR` and `ALETHEIA_HUB_DB`; open `/#/work`.
3. Confirm the strip, Now, Needs you, Recent memory and Goals all use the seeded values; open a session link and
   confirm the timeline and fact source; open Tools and confirm the classic viewer link appears only when the old
   database exists.

## 7. The five more hosts (fixture-tested, NOT RUN BY AUTHOR)

Every item in this section is **NOT RUN BY AUTHOR**. The formats come from the official docs fetched on
2026-10-26 (listed in section 25); the installers and payloads are fixture-tested only. Do not treat a pass here
as a real-install test.

For each tool, use a temp HOME first, then a real one:

```bash
HOME=$(mktemp -d) bun bin/aletheia.mjs install <tool> --dry-run
HOME=$(mktemp -d) bun bin/aletheia.mjs install <tool> --write
bun bin/aletheia.mjs doctor
```

Then open the tool in a scratch project, run one prompt that mentions a unique phrase, and check:

```bash
bun bin/aletheia.mjs search "the unique phrase" --project <project-folder-name>
```

### Cursor (NOT RUN BY AUTHOR)

1. `install cursor --write` writes `~/.cursor/mcp.json` and `~/.cursor/hooks.json` (version 1).
2. Open a trusted workspace; Cursor loads user hooks from `~/.cursor/hooks.json`.
3. Submit a prompt, run one Shell tool, let the answer finish, then close the conversation.
4. `doctor` should show `6/6` for Cursor. `search` should find the prompt, the tool event and the assistant text.
5. Confirm no `sk-ant-` key is stored. Confirm the assistant summary came from `afterAgentResponse`, not `stop`.
6. Run `rules sync --tools cursor --dir <project> --write`; confirm `.cursor/rules/aletheia.mdc` is active.

### Codex CLI (NOT RUN BY AUTHOR)

1. `install codex --write` writes `~/.codex/config.toml`, `~/.codex/hooks.json` and `~/.codex/AGENTS.md`.
2. Start Codex and run `/hooks`; review and trust the aletheia hooks. This step is required and has not been run.
3. Run one prompt and one shell command, then finish the turn.
4. `doctor` should show `5/5`. `search` should find the prompt, tool event and `last_assistant_message`.
5. Confirm the TOML block sits next to the user's own tables and that `codex` still starts.
6. A malformed `config.toml` must be refused, not overwritten.

### Gemini CLI (NOT RUN BY AUTHOR)

1. `install gemini-cli --write` merges `mcpServers` and `hooks` into `~/.gemini/settings.json`.
2. Start Gemini CLI in a project and run one prompt with one tool call.
3. `doctor` should show `5/5`. `search` should find `prompt`, the tool event and `prompt_response`.
4. Confirm the existing `security`/other keys and hooks survived the merge.
5. Confirm the hook timeout is milliseconds (`10000`), not 10 ms.

### Windsurf / Devin Desktop (NOT RUN BY AUTHOR)

1. `install windsurf --write` writes the MCP file (current `~/.config/devin/mcp_config.json` or an existing legacy
   `~/.codeium/windsurf/mcp_config.json`), `~/.codeium/windsurf/hooks.json` and the global rules file.
2. Open Cascade in a workspace, run a prompt, a shell command and one file edit, then finish the response.
3. `doctor` should show `4/4`. `search` should find the prompt, both tool events and the response text.
4. Expect **no** session-start context and **no** session-end summary: Cascade has neither event.
5. Confirm the payload without a `cwd` is filed under the workspace folder (the hook runs from the root).
6. `rules sync --tools windsurf --dir <project> --write`; confirm `.windsurf/rules/aletheia.md` starts with
   `trigger: always_on`.

### OpenCode (NOT RUN BY AUTHOR)

This host is `mcp+rules`, not full capture.

1. `install opencode --write` adds `mcp.aletheia` to `~/.config/opencode/opencode.json` and a block to
   `~/.config/opencode/AGENTS.md`.
2. Start OpenCode and confirm the aletheia MCP tools are listed.
3. Confirm no plugin was written and no new rows appear from an OpenCode session; that is the documented limit.
4. A JSONC-only `opencode.jsonc` is refused. Confirm the error names the file.

### Claude Desktop (NOT RUN BY AUTHOR)

1. Follow [claude-desktop.md](claude-desktop.md); merge the `mcpServers.aletheia` entry.
2. Quit and reopen Claude Desktop, then look for the server under the tools icon.
3. Confirm the server starts and a memory search works.
4. The Linux path `~/.config/Claude/claude_desktop_config.json` is observed on this machine but is not in the MCP
   quickstart; record whether your build reads it.

## What the automated tests already cover

`test/install-claude.test.mjs`, `test/claude-hooks.test.mjs` and `test/e2e-capture.test.mjs` cover: the dry run,
merge and backup, second-run idempotence, refusal of unparsable JSON, uninstall, the exact commands read back from
the settings files, every recorded payload, secret redaction, the spool and flush, `doctor`, and the hook time
budget. They run against a temporary `HOME`, never your real one.

`test/install-cursor.test.mjs`, `test/install-codex.test.mjs`, `test/install-gemini.test.mjs`,
`test/install-windsurf.test.mjs`, `test/install-opencode.test.mjs` and `test/e2e-more-hosts.test.mjs` add the same
checks for the five new hosts, plus the TOML block guard, the single Gemini settings merge, the two Windsurf MCP
paths, the OpenCode JSONC refusal, and a p95 under 100 ms per host. `test/uninstall.test.mjs` covers the generic
uninstall and `--force`. `test/install-targets/rules.test.mjs` and `docs/verification/rules-targets.md` record the
rules formats. None of these opens the host application.
