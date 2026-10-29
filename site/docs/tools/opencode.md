# OpenCode memory with Aletheia

<!-- description: Connect OpenCode to Aletheia: the opencode.json MCP entry and AGENTS.md rules block it writes, why no hooks are installed, and what was tested. -->
<!-- keywords: opencode memory, opencode mcp server, opencode agents.md rules, opencode.json mcp local, aletheia opencode, opencode persistent memory -->

Aletheia (aletheia-mem) connects OpenCode through an MCP server entry in `~/.config/opencode/opencode.json` and a managed rules block in `~/.config/opencode/AGENTS.md`. It installs no hooks and no plugin, so nothing is captured automatically. Memory enters when the model calls an Aletheia MCP tool, or when you save it yourself.

## What you get

- **MCP server.** An entry named `aletheia` under the `mcp` key, with `type` set to `local`.
- **Rules.** Your rules, written into `~/.config/opencode/AGENTS.md` between markers.
- **No hooks.** No capture of prompts, tool calls or summaries.

Level: `mcp+rules`. This is the only host at that level. With the entry in place, OpenCode can call tools such as `search`, `save_memory` and `session_start_context` (see [MCP tools](../reference/mcp-tools.md)).

## Install

```bash
npm install -g aletheia-mem
aletheia install opencode            # dry run: prints every step, writes nothing
aletheia install opencode --write    # applies it, with backups
```

Restart OpenCode afterwards.

## What gets written

Real dry-run output from a temporary HOME. Paths start with `/tmp/tmp.Ez6NqCkeLC`, the temporary home folder of the run. On your machine they start with your own home folder.

```
$ aletheia install opencode
OpenCode (opencode) — mcp+rules, mcp-verified
  write  mcp      /tmp/tmp.Ez6NqCkeLC/.config/opencode/opencode.json  (mcp.aletheia)
  write  rules    /tmp/tmp.Ez6NqCkeLC/.config/opencode/AGENTS.md  (1 rule)
  note  OpenCode ships as mcp+rules only. Its plugin system exists, but the official plugin page does not document the event payload fields, so this installer does not write a plugin.
  ...
Dry run: nothing was written. Add --write to apply.
```

The MCP entry that `--write` produced. OpenCode's format differs from the others: the key is `mcp`, and `command` is one array:

```json
{
  "mcp": {
    "aletheia": {
      "type": "local",
      "command": [
        "/home/you/.bun/bin/bun",
        "/path/to/aletheia-mem/bin/mcp.mjs"
      ],
      "enabled": true
    }
  }
}
```

The OpenCode MCP page (https://opencode.ai/docs/mcp-servers/, fetched 2026-10-29) shows the same shape: a local server under `mcp` with `type: "local"`, a `command` array and `enabled`. That page does not say where the global config file is. The installer uses `~/.config/opencode/opencode.json`.

If `opencode.json` is missing and `opencode.jsonc` exists, the installer refuses instead of parsing JSONC as JSON. Real output:

```
$ aletheia install opencode --write
/tmp/tmp.JrWkDYo6Yx/.config/opencode/opencode.jsonc is JSONC; this installer only writes opencode.json. Move the settings or remove the comments.
```

The exit code is 1 and no file is changed.

## Hooks and events

No hook and no plugin is installed. The OpenCode plugin page (https://opencode.ai/docs/plugins/, fetched 2026-10-29) lists plugin folders (`.opencode/plugins/` and `~/.config/opencode/plugins/`) and event names such as `session.idle`, `message.updated` and `tool.execute.after`. It does not document the fields inside any event payload. Reading a guessed field would be fabrication, so Aletheia writes no plugin.

| Way memory gets in | Automatic |
|---|---|
| The model calls the `save_memory` MCP tool | No. The model decides. |
| You run `aletheia save "<text>"` | No. You run it. |
| You add a note in the dashboard | No. You do it. |
| Prompts, tool calls, session summaries | Not captured for OpenCode. |

`aletheia watch` and `aletheia import transcripts` read session files, but they are verified only for Claude Code, Command Code and Codex CLI. OpenCode is not on that list.

## Rules file

`aletheia install opencode --write` writes your rules into `~/.config/opencode/AGENTS.md`. For a project file, run `aletheia rules sync --tools opencode --dir <project> --write`, which writes `<project>/AGENTS.md`.

```
<!-- aletheia:rules:begin -->
# Rules

Managed by aletheia-mem. Edit them in the Rules page; this block is rewritten on sync.

## Everywhere

- Run the narrow test before the full suite.
<!-- aletheia:rules:end -->
```

Text outside the markers is never touched. The OpenCode rules page (https://opencode.ai/docs/rules/, fetched 2026-10-29) says OpenCode reads a project `AGENTS.md` by searching upward from the current directory, and a global `~/.config/opencode/AGENTS.md`. It also says OpenCode falls back to `CLAUDE.md`: `~/.claude/CLAUDE.md` is used only if `~/.config/opencode/AGENTS.md` does not exist. Creating the global `AGENTS.md` therefore stops OpenCode from reading `~/.claude/CLAUDE.md`. If you relied on that fallback, copy what you need into the new file. See [Rules](../concepts/rules.md).

## Verify it works

```bash
aletheia install opencode --verify
aletheia doctor
opencode mcp list
```

`--verify` prints `ok`, `drift` or `missing` for the MCP file and the rules file. In `doctor`, the OpenCode line reads `tool opencode  mcp+rules; no hook system shipped`.

For this page, `opencode mcp list` was run on 2026-10-29 in the temporary home, with the config shown above. OpenCode 1.18.33 printed this (terminal color codes removed):

```
┌  MCP Servers
│
●  ✓ aletheia connected
│      /home/you/.bun/bin/bun /path/to/aletheia-mem/bin/mcp.mjs
│
└  1 server(s)
```

To see a memory arrive, ask OpenCode to save one with the `save_memory` tool, then run `aletheia search "<a word from it>"` or open `http://127.0.0.1:37790` and check the Knowledge tab. How reliably OpenCode's model calls the tool was not measured.

## Uninstall

```bash
aletheia uninstall opencode            # dry run
aletheia uninstall opencode --write
```

Real dry-run output:

```
OpenCode (opencode)
  remove mcp      /tmp/tmp.Ez6NqCkeLC/.config/opencode/opencode.json
  remove rules    /tmp/tmp.Ez6NqCkeLC/.config/opencode/AGENTS.md
Dry run: nothing was written. Add --write to remove.
```

Uninstall removes the `aletheia` MCP entry only if it is Aletheia's, and the rules block. If you edited a file after the install, it refuses and asks for `--force`.

## Verification status

- The MCP server was listed by the real CLI (OpenCode 1.18.33) on 2026-10-27, and again on 2026-10-29 as shown above.
- Hooks not run. There are none to run: this host is `mcp+rules`. No hook ran in OpenCode.
- The formats come from https://opencode.ai/docs/mcp-servers/, https://opencode.ai/docs/rules/ and https://opencode.ai/docs/plugins/, fetched 2026-10-26 and again 2026-10-29.
- No test confirmed that OpenCode loaded the rules block. The [rules targets table](../verification/rules-targets.md) records "real tool read: not run".
- Answer accuracy is not measured. Benchmarks are retrieval only.

## Known limits

- No automatic capture. This is the main difference from Claude Code, Command Code and Codex CLI.
- A JSONC-only config (`opencode.jsonc` without `opencode.json`) is refused.
- Creating `~/.config/opencode/AGENTS.md` disables OpenCode's fallback to `~/.claude/CLAUDE.md`, per the rules page.
- OpenCode's plugin payload fields are undocumented on the fetched page. A capture plugin needs those fields. Re-fetch the page after each OpenCode release.
- Aletheia writes user-level files only.

## Next steps

- [MCP tools](../reference/mcp-tools.md) - the tools OpenCode can call once connected.
- [Rules](../concepts/rules.md) - how the AGENTS.md block is built and synced.
- [Claude Code](claude-code.md) - a host with hooks, for comparison.
- [Tools overview](overview.md) - all hosts and their verification status.
