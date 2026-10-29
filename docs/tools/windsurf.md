# Windsurf memory with Aletheia

<!-- description: Install Aletheia memory in Windsurf (now documented as Devin Desktop): the MCP entry, four Cascade hooks and rules files, with the status that no hook ran. -->
<!-- keywords: windsurf memory, windsurf cascade hooks, windsurf mcp_config.json, windsurf global_rules.md, devin desktop memory, aletheia windsurf -->

Aletheia (aletheia-mem) can write a local memory setup for Windsurf: an MCP server entry, four Cascade hooks, a global rules file and a per-project rules file. This setup is config written from docs, not tested on a real install. No hook ran in Windsurf. Windsurf has no session-start or session-end hook, so Aletheia injects no context there.

## What you get

- **MCP server.** An entry named `aletheia` in `~/.config/devin/mcp_config.json`.
- **Hooks.** Four events in `~/.codeium/windsurf/hooks.json`: `pre_user_prompt`, `post_run_command`, `post_write_code` and `post_cascade_response`.
- **Rules.** A managed block in `~/.codeium/windsurf/memories/global_rules.md`, written by `install`. A project file `.windsurf/rules/aletheia.md` is written by `aletheia rules sync`.

Level: `full`. Verification: `from-docs-only`. No session-start context and no session-end summary, because Cascade has neither event.

## Install

```bash
npm install -g aletheia-mem
aletheia install windsurf            # dry run: prints every step, writes nothing
aletheia install windsurf --write    # MCP entry, hooks and global rules, with backups
aletheia rules sync --tools windsurf --dir <project> --write    # the project rules file
```

Restart Windsurf afterwards.

## What gets written

Real dry-run output from a temporary HOME. Paths start with `/tmp/tmp.Ez6NqCkeLC`, the temporary home folder of the run. On your machine they start with your own home folder.

```
$ aletheia install windsurf
Windsurf (windsurf) — full, from-docs-only
  write  mcp      /tmp/tmp.Ez6NqCkeLC/.config/devin/mcp_config.json  (mcpServers.aletheia)
  write  hooks    /tmp/tmp.Ez6NqCkeLC/.codeium/windsurf/hooks.json  (pre_user_prompt, post_run_command, post_write_code, post_cascade_response)
  write  rules    /tmp/tmp.Ez6NqCkeLC/.codeium/windsurf/memories/global_rules.md  (1 rule)
  note  Cascade has no session-start/session-end hook: there is no context injection and no session-end summary.
  note  Hooks run from the workspace root by default; the installer omits working_directory.
  ...
Dry run: nothing was written. Add --write to apply.
```

The MCP file path is chosen by the code like this: `~/.config/devin/mcp_config.json` unless the legacy `~/.codeium/windsurf/mcp_config.json` already exists, or only the legacy folder exists. The code was read, not tested on a machine with the legacy layout.

The hooks file that `--write` produced. Windsurf's format is a flat array per event:

```json
{
  "hooks": {
    "pre_user_prompt": [
      {
        "command": "/home/you/.bun/bin/bun /tmp/tmp.eHRtbNMs5s/aletheia.bundle.mjs hook windsurf pre_user_prompt # aletheia-managed"
      }
    ],
    ...
  }
}
```

The Windsurf docs have moved. `docs.windsurf.com/windsurf/cascade/hooks`, `/mcp` and `/memories` answered with a redirect to `docs.devin.ai/desktop/cascade/...` on 2026-10-29, and the product is documented as Devin Desktop. Those pages (fetched 2026-10-29) agree on these points: the user hook file is `~/.codeium/windsurf/hooks.json`; the MCP file is `~/.config/devin/mcp_config.json` with a `mcpServers` object of `command` and `args`; the global rules file is `~/.codeium/windsurf/memories/global_rules.md`.

## Hooks and events

| Event | What Aletheia does |
|---|---|
| `pre_user_prompt` | Stores `tool_info.user_prompt` as a note, redacted. Prompts under 3 characters are skipped. |
| `post_run_command` | Stores a `Shell` event with `tool_info.command_line`. It stores no command output. |
| `post_write_code` | Stores a `Write` event with `tool_info.file_path` and `tool_info.edits`. It stores no output. |
| `post_cascade_response` | Stores `tool_info.response` as a summary, once per response. Queues the session for compression. |

The Devin Desktop hooks page lists 12 events, including `pre_read_code`, `pre_write_code`, `pre_run_command` and `post_mcp_tool_use`. Aletheia installs four. The page says `pre_user_prompt` can block a prompt with exit code 2. Aletheia's hook always exits 0, so it never blocks. The page also says there is no session-start or session-end event.

Not captured, because the events do not exist or are not installed:

- No `SessionStart`: no recalled memory is injected into a Windsurf session.
- No `SessionEnd`: no session-end summary.
- No tool output for commands and file writes.

Every hook exits 0 whatever happens, makes no network call and no model call, and redacts before it stores. The project name comes from `tool_info.cwd`, then the payload `cwd`, then the hook process directory. See [Hooks reference](../reference/hooks.md).

## Rules file

`aletheia install windsurf --write` adds the managed block to `~/.codeium/windsurf/memories/global_rules.md`. It is a plain block, with no frontmatter:

```
<!-- aletheia:rules:begin -->
# Rules

Managed by aletheia-mem. Edit them in the Rules page; this block is rewritten on sync.

## Everywhere

- Run the narrow test before the full suite.
<!-- aletheia:rules:end -->
```

For a project, `aletheia rules sync --tools windsurf --dir <project> --write` writes `<project>/.windsurf/rules/aletheia.md`. Real output in the test run: `- windsurf: /tmp/tmp.e1CAvpmUGV/myproject/.windsurf/rules/aletheia.md — 1 rules, written`. The file starts with frontmatter that makes the rule always on:

```
---
trigger: always_on
---

<!-- aletheia:rules:begin -->
...
<!-- aletheia:rules:end -->
```

The Devin Desktop memories page (https://docs.devin.ai/desktop/cascade/memories, fetched 2026-10-29) says the global file is always on and limited to 6,000 characters, that workspace rules live in `.devin/rules/*.md` (preferred) or `.windsurf/rules/*.md` (fallback), each limited to 12,000 characters, and that the `trigger` field takes `always_on`, `model_decision`, `glob` or `manual`. Aletheia writes the fallback path `.windsurf/rules/`. See [Rules](../concepts/rules.md).

## Verify it works

```bash
aletheia install windsurf --verify
aletheia doctor
```

`--verify` prints `ok`, `drift` or `missing` for the MCP file, the hooks file and the global rules file. In `doctor`, look for `hooks windsurf    4/4 in ...hooks.json`. The `verify windsurf` line says `verified` with the evidence text `no working Windsurf/Devin install here`. The word `verified` there means the evidence date is recent. It does not mean a real install was tested.

Nobody has seen these hooks run in Windsurf. If you try it:

1. Run the install, restart Windsurf, and send one prompt to Cascade.
2. Run `aletheia search "<a word from your prompt>"`, or open `http://127.0.0.1:37790` and check the Activity and Knowledge tabs. The Connections tab shows the hook count and the time of the last capture.
3. Report what you saw, with your Windsurf or Devin Desktop version, in an issue at https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues.

## Uninstall

```bash
aletheia uninstall windsurf            # dry run
aletheia uninstall windsurf --write
```

Real dry-run output:

```
Windsurf (windsurf)
  remove mcp      /tmp/tmp.Ez6NqCkeLC/.config/devin/mcp_config.json
  remove hooks    /tmp/tmp.Ez6NqCkeLC/.codeium/windsurf/hooks.json  (no aletheia hooks)
  remove rules    /tmp/tmp.Ez6NqCkeLC/.codeium/windsurf/memories/global_rules.md
Dry run: nothing was written. Add --write to remove.
```

The `(no aletheia hooks)` label is the installer's own wording for the hooks line. In the Claude Code test run the same label appeared and the hook entries were removed. Uninstall does not remove `.windsurf/rules/aletheia.md`. Delete that file yourself in each project where you ran `rules sync`.

## Verification status

- Windsurf: config written from docs, not tested on a real install. No hook ran in Windsurf.
- No working Windsurf or Devin Desktop install was available on the test machine.
- The formats come from the three Windsurf pages, fetched 2026-10-26 from `docs.windsurf.com` and again 2026-10-29 from `docs.devin.ai/desktop` after the redirect. The 2026-10-29 pages match the user-level paths the installer writes. The workspace rules folder differs; see Known limits.
- The installer and the hook adapter were tested against fixtures and recorded payloads in a temporary HOME. The project README says two hook checks (Windsurf and Gemini CLI) are skipped in CI on Windows, and that no real tool was tried on Windows.
- UNVERIFIED: the docs say `command` runs on macOS and Linux and `powershell` on Windows, falling back to `command` when `powershell` is missing. Aletheia writes only `command`. No Windows run exists.
- Answer accuracy is not measured. Benchmarks are retrieval only.

## Known limits

- Nothing here has run in Windsurf. Expect to find differences.
- No context injection and no session-end summary.
- The global rules file is limited to 6,000 characters on the docs page. `aletheia rules lint` warns when the enabled set passes 4,000 characters.
- The workspace rule goes to `.windsurf/rules/`, which the docs now call the fallback. The preferred folder is `.devin/rules/`.
- Aletheia writes the user-level hooks file only, not the workspace hooks file.
- The hook command holds absolute paths to Bun and the data dir bundle. If you move either, run `aletheia install windsurf --write` again.
- Compression is queued, not run in the hook. Run `aletheia compress`, or keep `aletheia-server` running.

## Next steps

- [Hooks reference](../reference/hooks.md) - the events, fields and guarantees of every hook.
- [Rules](../concepts/rules.md) - how the rules blocks are built and synced.
- [Project status and limits](../project/status-and-limits.md) - what is tested and what is not.
- [Tools overview](overview.md) - all hosts and their verification status.
