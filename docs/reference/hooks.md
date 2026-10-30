# Aletheia hooks reference: events, payloads, redaction and fail-open behavior

<!-- description: How Aletheia hooks work: events per host, payload fields read, redaction, fail-open exit 0, the spool, timeouts, and how to test or remove a hook. -->
<!-- keywords: aletheia hooks, aletheia hook command, claude code hooks memory, hook spool, aletheia doctor, test a hook payload, aletheia uninstall hooks, install verify -->

In Aletheia (aletheia-mem), a hook is a command that a host, the AI coding tool, runs at a session event. The command is `aletheia hook <tool> <event>`. It reads one JSON payload on stdin, stores a redacted memory, and never blocks the host.

The examples on this page were run on 2026-10-29 against version 0.1.10 in a temporary home and data directory. Paths are shortened with `...`. The payloads are written by hand from the fields each adapter reads. The repository holds no recorded payload files; its tests write payloads inline.

## What a hook does

`aletheia hook claude-code PostToolUse` does these steps, in order. Source: [src/hub/hooks/run.mjs](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/hooks/run.mjs).

1. Read stdin. Empty or broken JSON becomes an empty payload.
2. Pick the adapter for the host. An unknown host name returns at once.
3. Work out the project from the payload's working directory, without starting `git`.
4. Skip the item if the project is in `ALETHEIA_EXCLUDED_PROJECTS`. Nothing is written.
5. Build the memory from the payload and redact it. This step touches no database.
6. Open `hub.db` with a 50 ms busy timeout, drain the spool, then store the memory, queue compression or mark the session ended.
7. For a session-start event only, print the context block on stdout.
8. Exit 0.

A hook makes no network call and no model call. Compression only queues a job. A worker started by `aletheia-server` or `aletheia compress` runs it later.

## Verification status

- MCP server listed by the real CLI on 2026-10-27: Claude Code 2.1.312, Command Code 1.88.1, Codex 0.130.0, OpenCode 1.18.33.
- Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine.
- Cursor, Gemini CLI and Windsurf: "config written from docs, not tested on a real install". No hook ran in Cursor, Gemini CLI, Windsurf or OpenCode.

Payload field names are the ones the adapter source cites, from host documentation the project author fetched on 2026-10-26. I did not fetch any host documentation on 2026-10-29. **UNVERIFIED:** that Cursor, Gemini CLI and Windsurf send exactly these fields, because no hook ran in them. A real hook run or a fresh read of each host's hooks page would verify it. See [Tools overview](../tools/overview.md).

## Events per host

`aletheia install --list` prints the events each installer wires (the note lines are left out):

```
tool          capability   verification     detected  events
claude-code   full         mcp-verified      no        SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd
command-code  full         mcp-verified      no        SessionStart, PostToolUse, Stop
cursor        full         from-docs-only    no        sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd
codex         full         mcp-verified      no        SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd
gemini-cli    full         from-docs-only    no        SessionStart, BeforeAgent, AfterTool, AfterAgent, SessionEnd
windsurf      full         from-docs-only    no        pre_user_prompt, post_run_command, post_write_code, post_cascade_response
opencode      mcp+rules    mcp-verified      no        none
```

In this column `mcp-verified` means only the line about the real CLI listing the MCP server above. `from-docs-only` means config written from docs, not tested on a real install. `detected` is `no` here because the temporary home has no tool folders.

OpenCode and Claude Desktop have no hooks. For OpenCode the installer writes the MCP entry and the rules block only. Claude Desktop has an MCP entry only; see [Claude Desktop](../claude-desktop.md).

## What each event captures

Every row is from the adapter in `src/hub/hooks/`. "Summary" is a memory of kind `summary`; "queues compression" adds a job for the extraction worker; "ends the session" records a session-end row.

| Host | Event | What Aletheia does | Payload fields read |
|---|---|---|---|
| claude-code | SessionStart | Prints context. Prints nothing when `source` is `resume`. | `source` |
| claude-code | UserPromptSubmit | Stores the prompt. | `prompt` |
| claude-code | PostToolUse | Stores a tool event. | `tool_name`, `tool_input`, `tool_response` |
| claude-code | Stop, SessionEnd | Stores a summary, queues compression, ends the session. | `last_assistant_message` |
| command-code | SessionStart | Prints context. Nothing on `resume`. | `source` |
| command-code | PostToolUse | Stores a tool event. | `tool_name`, `tool_display_name`, `tool_input`, `tool_response` |
| command-code | Stop | Queues compression, ends the session. Stores no memory. | none |
| codex | SessionStart | Prints context. Nothing on `resume`. | `source` |
| codex | UserPromptSubmit | Stores the prompt. | `prompt` |
| codex | PostToolUse | Stores a tool event. | `tool_name`, `tool_input`, `tool_response` |
| codex | Stop | Stores a summary, queues compression, ends the session. | `last_assistant_message` |
| codex | SessionEnd | Queues compression, ends the session. No memory. | none |
| cursor | sessionStart | Prints context as `{"additional_context": ...}`. | `workspace_roots` |
| cursor | beforeSubmitPrompt | Stores the prompt. | `prompt` |
| cursor | postToolUse | Stores a tool event. | `tool_name`, `tool_input`, `tool_output` |
| cursor | afterAgentResponse | Stores a summary. | `text` |
| cursor | stop, sessionEnd | Queues compression, ends the session. | none |
| gemini-cli | SessionStart | Prints context. Nothing on `resume`. | `source` |
| gemini-cli | BeforeAgent | Stores the prompt. | `prompt` |
| gemini-cli | AfterTool | Stores a tool event. | `tool_name`, `tool_input`, `tool_response` |
| gemini-cli | AfterAgent | Stores a summary, queues compression. | `prompt_response` |
| gemini-cli | SessionEnd | Queues compression, ends the session. | none |
| windsurf | pre_user_prompt | Stores the prompt. | `tool_info.user_prompt` |
| windsurf | post_run_command | Stores a `Shell` event. | `tool_info.command_line` |
| windsurf | post_write_code | Stores a `Write` event. | `tool_info.file_path`, `tool_info.edits` |
| windsurf | post_cascade_response | Stores a summary, queues compression. | `tool_info.response` |

Command Code has no `UserPromptSubmit` or `SessionEnd` hook, so prompts and end-of-session summaries are not captured there. Windsurf has no session-start event, so it receives no context. Cursor's `stop` payload carries no assistant text, so `afterAgentResponse` stores the summary.

Shared fields:

- Project: `cwd`. Cursor uses `workspace_roots[0]`, then `cwd`. Windsurf uses `tool_info.cwd`, then `cwd`. With no directory the project is `default`. The key is the repository folder name found by walking up to `.git`.
- Session id: `session_id` (also `sessionId` for Claude Code and Command Code). Cursor uses `conversation_id` as a fallback. Windsurf uses `trajectory_id`.
- Event name: the second argument. If it is missing, `hook_event_name` or `event` from the payload is used. Names are matched without regard to case.

## The hook command and its timeouts

`aletheia install <tool> --write` adds this command to the host's config. The trailing comment is the marker the uninstaller looks for:

```
.../.bun/bin/bun .../data/aletheia.bundle.mjs hook claude-code PostToolUse # aletheia-managed
```

The installer builds `aletheia.bundle.mjs` in the data directory so a hook loads one file, not a dozen. If the build fails it falls back to the source CLI. The `timeout` the installer writes into each host's config:

| Host | `timeout` written | Matcher written |
|---|---|---|
| claude-code | 10 | SessionStart `startup\|clear\|compact`; PostToolUse `*` |
| command-code | 10 | none |
| codex | 10, SessionEnd 3 | SessionStart `startup\|clear\|compact\|fork` |
| cursor | 10 | none |
| gemini-cli | 10000 | none |
| windsurf | none | none |

The code notes that Gemini CLI counts milliseconds. **UNVERIFIED:** the unit the other hosts use for their `timeout` (seconds is likely). Verify it in each host's hooks documentation.

Aletheia also has its own limit. `bin/aletheia.mjs` starts a 150 ms watchdog and exits 0 when it fires. A `PostToolUse` hook took 0.04 to 0.05 s on a small database. One that waited on a held write lock took about 0.1 s.

## Fail-open behavior

A hook prints nothing on stdout and exits 0 on every error. A broken hook never stops a session.

```
$ echo '{}' | aletheia hook nosuch Foo          # unknown host: no output, exit 0
$ echo 'not json' | aletheia hook claude-code PostToolUse   # exit 0
$ aletheia hook claude-code Stop < /dev/null    # exit 0
```

- **Excluded project.** With `ALETHEIA_EXCLUDED_PROJECTS=shop` a prompt in project `shop` printed nothing, and no row exists for its session.
- **Nothing to store.** A skipped tool (`TodoWrite`, `TaskCreate`, `TaskUpdate`, `ToolSearch`, `todo_write`) or an empty prompt leaves the database unopened.
- **Store busy or unavailable.** The already redacted item goes to `<data>/spool/hook-spool.jsonl`, one JSON object per line, mode `0600`.
- **The spool drains.** The next hook that opens the store replays the spool first. The live file is renamed before the replay, so a parallel hook's append is not lost. Items that still fail are written back.
- **Watchdog.** If the 150 ms watchdog fires, the process exits 0 at once. Reading the code, an item still in flight at that moment is not spooled. I did not trigger this case.
- **Stderr.** One-line permission repairs, such as `aletheia: data directory ... mode 0775 -> 0700`, go to stderr, not stdout.

A real run with `hub.db` replaced by a directory, then repaired:

```
$ echo '{"hook_event_name":"PostToolUse","cwd":".../shop","session_id":"demo-3","tool_name":"Bash","tool_input":{"command":"ls -la"},"tool_response":"ok"}' | aletheia hook claude-code PostToolUse
$ cat .../data2/spool/hook-spool.jsonl
{"kind":"memory","memory":{"project":"shop","tool":"claude-code","sessionId":"demo-3","kind":"event","type":"event","title":"Bash: ls -la","narrative":"input: {\"command\":\"ls -la\"}\n\noutput: ok"},"at":1793303306263}
$ aletheia doctor | grep spool
FAIL spool                1 item(s) at .../data2/spool/hook-spool.jsonl
$ rmdir .../data2/hub.db
$ echo '{... "command":"pwd" ...}' | aletheia hook claude-code PostToolUse
$ aletheia search "ls -la" --project shop
#1 2026-10-29 [event] Bash: ls -la (shop, claude-code)
$ aletheia doctor | grep spool
ok   spool                empty
```

A second run held the write lock from another process with `BEGIN IMMEDIATE`. The hook spooled its item, and the next hook stored both.

## Redaction and limits

The adapter redacts each field before it is spooled or stored. `<private>...</private>` blocks become `[private]`. Patterns replace API keys (Anthropic, OpenAI-style, Stripe), GitHub, GitLab, npm and Slack tokens, JWTs, AWS key ids, Google keys, private key blocks, bearer headers, passwords in URLs, and `password`, `secret`, `token` or `api_key` assignments. The list is in [src/hub/redact.mjs](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/redact.mjs). See [Privacy and redaction](../concepts/privacy.md).

```
$ echo '{"hook_event_name":"UserPromptSubmit","cwd":".../shop","session_id":"p1","prompt":"Rotate the key <private>hunter2-very-secret</private> before Friday, token=abcd1234efgh"}' | aletheia hook claude-code UserPromptSubmit
$ aletheia search "Rotate the key"
#20 2026-10-29 [note] Rotate the key [private] before Friday, token=[redacted] (shop, claude-code)
```

Stored sizes: a prompt keeps 8000 characters, a tool event 1500 (`input:` then `output:`), a summary 4000. Titles are cut to 120, 160 and 140 characters.

## Test a hook by hand

Pipe a payload into the command the installer wrote, or into `aletheia hook` directly. Use a temporary data directory so your own memory stays untouched.

```
$ export ALETHEIA_DATA_DIR=$(mktemp -d)
$ echo '{"hook_event_name":"SessionStart","cwd":".../shop","session_id":"demo-1","source":"startup"}' | aletheia hook claude-code SessionStart
{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"<aletheia-memory>\nRecalled memory from earlier sessions. ... # Memory for shop\n\n## Pinned\n- #1 19:46 [D] Use pnpm, not npm, in the shop repo ... </aletheia-memory>"}}
$ echo '{"hook_event_name":"Stop","cwd":".../shop","session_id":"demo-1","last_assistant_message":"Fixed the failing test and switched the repo to pnpm."}' | aletheia hook claude-code Stop
$ aletheia search "failing test" --project shop
#5 2026-10-29 [summary] Session summary: Fixed the failing test and switched the repo to pnpm. (shop, claude-code)
```

The same check ran for Cursor, Gemini CLI, Windsurf, Command Code and Codex with hand-written payloads, and each stored the expected row. That tests the adapter code. It does not show that those hosts send these fields. Payload shapes for every host are in [test/e2e-more-hosts.test.mjs](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/test/e2e-more-hosts.test.mjs).

To check a whole session in a data directory, run `bun scripts/hook-check.mjs <data-dir> --tool claude-code` from a source checkout. It reads `hub.db` without writing, scans for secrets that escaped redaction, and prints PASS or FAIL per event. It supports `claude-code`, `codex` and `command-code`.

## Check hooks with aletheia doctor

`aletheia doctor` reads the host config files and counts the expected hook commands in each. It does not run a hook. A tool that is not installed is not a failure. A present config with missing hooks is.

```
$ aletheia doctor
ok   host                 127.0.0.1 (loopback)
ok   port                 37913
FAIL server               not reachable at http://127.0.0.1:37913/healthz
ok   hooks claude-code    5/5 in .../home/.claude/settings.json
ok   hooks cursor         6/6 in .../home/.cursor/hooks.json
ok   tool opencode        mcp+rules; no hook system shipped
ok   verify cursor        verified: verified 2026-10-26 — Cursor docs fetched 2026-10-26; Cursor is not installed on this machine
ok   spool                empty
ok   permissions          data dir 0700, db 0600
ok   last capture         no capture yet
ok   queue                0 pending, 0 running, 0 failed
```

- `server` calls `/healthz` on `ALETHEIA_PORT`. It fails when the server is not running, which does not stop hooks from working.
- `verify <tool>` says `verified` when a verification date is recorded and is under 180 days old. It is not proof that a real tool ran a hook. Read the text after the dash for what was checked.
- `spool` fails when items wait. `permissions`, `database`, `fts`, `queue` and `last capture` report the store. `--json` prints the checks as JSON.
- The exit status is 1 when any line is `FAIL`.

## Verify, uninstall and the manifest

`aletheia install <tool> --write` records each file it changed, with a SHA-256 hash and a backup name, in `<data>/install-manifest.json`. Every changed file also gets a copy named `<file>.aletheia-bak-<time>`.

```
$ aletheia install codex --verify
  ok        mcp      .../home/.codex/config.toml
  drift     hooks    .../home/.codex/hooks.json
  ok        rules    .../home/.codex/AGENTS.md
codex: drifted from the recorded install
```

`--verify` never writes. It exits 1 when a tool is not installed, or when any file is `missing`, `drift` or `unreadable`. With no tool name it checks every tool in the manifest.

`aletheia uninstall <tool>` is a dry run until `--write`. It removes the MCP entry, the hook entries marked `aletheia-managed` and the managed rules block, and keeps every other entry in each file.

```
$ aletheia uninstall codex --write
Codex CLI (codex)
  remove mcp      .../home/.codex/config.toml
  BLOCK  hooks    .../home/.codex/hooks.json  (file changed since install; rerun with --force)
  remove rules    .../home/.codex/AGENTS.md
Refused: a file changed after install. Review it, then rerun with --force to remove our entries anyway.
```

Two behaviors of 0.1.10 to know. First, when one file has drifted, the command exits 1 and prints `Refused`, but it has already cleaned the other files: the MCP entry and the rules block were gone afterward, and only the hooks file kept its entries. Second, before this fix the hooks line of an uninstall could carry the note `(no aletheia hooks)` even when the line said `remove`; the entries were removed. It now shows the note only when there is nothing to remove.

## Next steps

- [CLI reference](cli.md) - `hook`, `install`, `uninstall` and `doctor` with their flags.
- [Configuration](configuration.md) - the data directory, the spool path and `ALETHEIA_EXCLUDED_PROJECTS`.
- [Installer reference](../25-installers.md) - what each installer writes and the sources it used.
- [Troubleshooting](../guides/troubleshooting.md) - when a hook does not seem to run.
