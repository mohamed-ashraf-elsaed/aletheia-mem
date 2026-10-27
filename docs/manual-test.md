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
- The Tools tab rendered the installer cards, the hook counts, spool sizes and the full doctor table; no console
  errors.
- The Work tab showed Aletheia's own view, not the old iframe: a health/last-capture/queue/mode strip, "Now" with
  three sessions (one in progress, two finished), "Needs you" with a contradiction, a rule suggestion and a
  dismissed row, "Recent memory" with source and importance, and a goal with two dated quotes.
- The session page `#/work/session/s1?project=shop` showed the summary, an ordered timeline (prompt, tool, prompt,
  summary) and the extracted fact with its source. No console errors.
- `prefers-color-scheme: dark` was emulated; the page stayed readable and the shell colours switched.

**NOT RUN BY AUTHOR:** a person should still check the Work tab at 375 px width, with a keyboard only (Tab through
the header, open each tab, open a details block, pin and restore a goal, expand a truncated prompt with "Show more"),
and with a real live capture over more than 10 seconds to see the refresh. At 375 px confirm the page does not scroll
horizontally and every button, tab link, select, search box and details summary is at least 40 px tall to tap. The
automated run proves the scripts load and the DOM is reachable; it does not assert pixel layout or the timer under a
real host.

### The rebuilt UI (RUN BY AUTHOR, 2026-10-26 UTC)

Run with the connected Playwright Chromium on a temporary data folder seeded by `scripts/seed-demo.mjs` (150 rows, then 5,000 rows
for the measurements), server on port 37891, `HOME` pointing at an empty temporary folder:

```bash
bun scripts/seed-demo.mjs --data "$TMP/data" --rows 150
ALETHEIA_DATA_DIR="$TMP/data" HOME="$TMP/home" ALETHEIA_PORT=37891 bun bin/aletheia-server.mjs --host 127.0.0.1
```

Observed:

- All four tabs and every page inside them render with no console error and no Content-Security-Policy violation (13 routes, then a
  dialog, the palette, a popover and the theme switch).
- Paging: Next, `]`, Back and reload keep the page and the filters in the address; a page past the end jumps to the last page.
- Optimistic actions: Dismiss hides the card at once, shows an Undo toast, and Undo brings it back in place; Pin toggles at once.
- Status bar: ten indicators with live data; killing the server shows the "connection lost" banner with a counting-down retry and a red
  tab icon; starting it again clears the banner and reconnects the WebSocket.
- First-run guide: on an empty store it shows three steps; a note posted through the API flipped it to "arrived" and the page then
  listed the memory.
- Themes: Auto follows the system, Dark and Light stick across reload.
- Reduced motion (emulated): dialogs fade in 80 ms with no movement; an idle page has no looping animation.
- Widths 375, 768, 1280 and 1920 px on 15 routes: no sideways scroll; a keyboard walk of 45 Tab stops on three pages shows a visible
  ring on every stop; no control without a name.
- Numbers are in [ui-design.md](ui-design.md#measured-performance).

**NOT RUN BY AUTHOR:** a real screen reader (NVDA, VoiceOver, Orca), a real phone or touch screen, Firefox and Safari, a high-contrast
or forced-colours mode, a 4K display, and a long session against a live capture from a real tool. The automated checks only look at
names, roles and structure.

### Work view steps (RUN BY AUTHOR, 2026-10-26)

1. Seed a temporary hub (the fixture in `test/work.test.mjs` creates prompts, tool events, a summary, a fact, a
   review item, a rule suggestion, a dismissal and a job).
2. Start the server with a temporary `HOME`, `ALETHEIA_DATA_DIR` and `ALETHEIA_HUB_DB`; open `/#/work`. This pass
   used port 38882; the earlier Memory/Rules/Tools pass used 38881.
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

## 8. Two-machine sync (NOT RUN BY AUTHOR)

The sync engine is covered by `test/sync-core.test.mjs`, `test/sync-tombstones.test.mjs`,
`test/sync-devices.test.mjs` and `test/tokens-quotas-audit.test.mjs`, all against temporary data dirs and a
loopback hub. A real two-machine run has not been done.

**NOT RUN BY AUTHOR.** To run it by hand, on the hub machine:

```bash
bun bin/aletheia-sync.mjs --port 37791 --db ~/.aletheia/sync.db
aletheia sync pair --db ~/.aletheia/sync.db
```

On the device machine:

```bash
aletheia sync join http://<hub-host>:37791 <code> --name laptop
aletheia sync run
```

Expected: the device lists on the hub (`aletheia sync devices`), pushes and pulls move ops, and a revoke on
the hub makes the device's next call fail. A non-loopback bind must print the TLS warning unless
`--behind-tls` is set.

### E2EE on two machines (NOT RUN BY AUTHOR)

The E2EE paths are covered by `test/sync-e2ee.test.mjs` against temp dirs and a loopback hub; no real
two-machine E2EE run has been done.

**NOT RUN BY AUTHOR.** On the hub machine:

```bash
aletheia sync enable-e2ee --passphrase '<passphrase>'
aletheia sync pair
aletheia sync export-recovery-key --out ~/aletheia-recovery.key
ls -l ~/aletheia-recovery.key   # expect -rw------- (0600)
```

On each device machine:

```bash
aletheia sync join <url> <code>
aletheia sync unlock-e2ee --passphrase '<passphrase>'
aletheia sync run
```

Expected: `aletheia sync status` shows E2EE on; the server's `sync.db` has no plaintext titles (the ops show
an `@e2ee` envelope); a wrong passphrase fails cleanly; `aletheia sync rotate-key` and
`aletheia sync change-passphrase` work; and without the passphrase or the recovery file the data is
unreadable.

## 9. A real client against the remote MCP endpoint (NOT RUN BY AUTHOR)

The endpoint is tested with raw `fetch` in `test/remote-mcp.test.mjs`; no real MCP client has connected to it.

**NOT RUN BY AUTHOR.** To run it by hand, on the hub machine:

```bash
bun bin/aletheia-sync.mjs --db ~/.aletheia/sync.db --hub-db ~/.aletheia/hub.db
aletheia mcp-link create --projects shop
```

Then, on the same machine or a device that can reach the hub over a TLS tunnel:

```bash
claude mcp add --transport http aletheia http://127.0.0.1:37791/mcp --header "Authorization: Bearer <token>"
```

Expected: `claude mcp list` shows the server connected; a prompt like "search memory for backoff" finds the
memory; `aletheia audit` shows one `mcp.call` row per tool call; `aletheia mcp-link revoke <id>` makes the next
call fail with 401. For a remote hub the URL must be the tunnel's HTTPS URL and the hub must run with
`--behind-tls`; add `--mcp-origins https://claude.ai` if a browser-based client is used.

## 10. Hub login from a browser (NOT RUN BY AUTHOR)

The session, CSRF, lock-out and expiry paths are tested by `test/hub-login.test.mjs` against `fetch`; no real
browser login has been run.

**NOT RUN BY AUTHOR.** Mint an admin token on the hub machine:

```bash
aletheia mcp-link create --scope admin
```

Start the server on a non-loopback bind behind a TLS tunnel:

```bash
bun bin/aletheia-server.mjs --host 0.0.0.0 --behind-tls
```

Open the tunnel URL in a browser. Expected: the login page appears; the admin token logs in; the Hub tabs load;
a dismiss or pair action works (the UI sends the CSRF header); a server restart ends the session; five wrong
tokens lock the login page with a wait message.

## 11. Auto-start service (NOT RUN BY AUTHOR)

The generated text is checked by `test/service.test.mjs` against a temporary HOME. The unit is never enabled and
the server is never started by the author.

Linux default unit (`~/.config/systemd/user/aletheia.service`): `Restart=on-failure`, `Nice=10`, loopback only,
with `CPUQuota`/`MemoryMax` defaults 50% and 1G documented in comments and overridable via
`aletheia service install --cpu-quota X --memory-max Y --write`.

**NOT RUN BY AUTHOR.** To run it by hand on Linux:

```bash
aletheia service install --write
systemctl --user daemon-reload
systemctl --user enable --now aletheia.service
```

The macOS plist is `from-docs-only` (Apple launchd docs, fetched 2026-10-26) and is not tested on a real Mac.
Windows is not supported.

## 12. The transcript watcher (NOT RUN BY AUTHOR)

The watcher reads the three verified folders read-only and imports only new lines. `test/watcher.test.mjs` uses
fixture files, not a live host session.

```bash
HOME=$(mktemp -d) bun bin/aletheia.mjs watch --once --tool claude-code,command-code,codex
HOME=$(mktemp -d) bun bin/aletheia.mjs watch --interval 1000 --batch 50
```

1. Confirm the first pass reports the fixture files and the expected turns; a second pass reports `added 0`.
2. Append one line to a transcript file, run `watch --once`, and confirm only that line is added.
3. Append a line without a trailing newline; the pass reports `partial` and adds nothing. Finish the line and
   the turn is added once.
4. Append `{"type":"future_event"}` or a line that is not JSON; it is stored as a raw episode, not dropped.
5. Check `~/.aletheia/watcher.db` has one `watch_state` row per file and that its `offset` equals the file size.
6. Confirm the source files' bytes and mtimes did not change and no file was written under the three folders.
7. The polling loop runs with `nice 10`, an interval of at least 1000 ms and the configured batch size.

The Codex layout was read from two real rollouts on this machine (2026-10-26): `session_meta` carries the id and
cwd, `response_item`/`message` carries `user`/`assistant` text, and developer messages are skipped. No live
Claude Code, Command Code or Codex session was watched while it was being written.

## 13. Requests, goals, story and economics (NOT RUN BY AUTHOR)

`test/requests.test.mjs`, `test/requests-progress.test.mjs`, `test/artifacts.test.mjs`,
`test/goals-rollup.test.mjs`, `test/story.test.mjs`, `test/economics.test.mjs`, `test/rule-strength.test.mjs`,
`test/rules-decide.test.mjs` and `test/work-query.test.mjs` cover these on a seeded temporary database. No real owner
history was used, and the UI is not wired, so this is a backend check only.

**NOT RUN BY AUTHOR.** With a seeded hub (see `test/requests.test.mjs` for the seed), start a server on a free
loopback port with a temporary HOME and data dir:

```bash
HOME=$(mktemp -d) ALETHEIA_DATA_DIR=$(mktemp -d) ALETHEIA_HUB_DB=/tmp/requests.db \
  ALETHEIA_PORT=38883 bun bin/aletheia-server.mjs
```

From another shell:

```bash
curl -s 'http://127.0.0.1:38883/v1/work/requests?project=shop&filter=needs-you&sort=most-progress&group=tool'
curl -s 'http://127.0.0.1:38883/v1/work/goals?project=shop'
curl -s 'http://127.0.0.1:38883/v1/work/story?project=shop'
curl -s 'http://127.0.0.1:38883/v1/context/economics?project=shop'
curl -s 'http://127.0.0.1:38883/api/hub/rule-suggestions?project=shop'
```

Expected on a seeded store with five requests:

- `counts` is `{all:5, needsYou:2, shipped:1, working:1, idle:1, waitingOnYou:2, total:5}`.
- The Shipped request has a `cameOutOfIt` list with a commit, a PR URL and a branch, each with an `evidenceId`.
- `goals` has three goals (two `Moving`, one `Stalled`), a `noGoal` count of 2, and `openAsks` split into
  `beingWorked` and `nothingWorking`.
- `economics.totals.workTokens` is the `fact_usage` input + output (1500 in the sample) or `null` with
  "no usage record"; per-observation `workTokens` is `null` with its label.
- Each rule suggestion carries `timesSeen`, `strength`, `latestAt` and `quotes`; `total`/`decided`/`pending` are
  the decision counts.

The CLI prints the same economics JSON:

```bash
aletheia context economics --project shop
```

An empty store returns empty arrays and `empty: true` on every route. `POST /api/hub/rule-suggestions/:id` with
`{"action":"edit","text":"..."}` approves the edited text; `POST /api/hub/rules/:id/toggle` with `{"enabled":false}`
turns a rule off; `POST /api/hub/rules/:id/replace` sets `replacedBy` and `replacedAtEpoch` on the old rule.

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
