# Connect AI coding tools to Aletheia: overview and verification status

<!-- description: Which AI coding tools Aletheia connects to, what full and mcp+rules mean, how the dry run works, and what was tested on a real install. -->
<!-- keywords: aletheia tools overview, connect ai coding tools to memory, aletheia install, claude code memory, mcp hooks rules, aletheia verification status -->

Aletheia (aletheia-mem) connects to each AI coding tool, called a host, in up to three ways: an MCP server entry, hooks that capture activity, and a managed block in the instruction file the host already reads. This page lists every host, explains the two connection levels, and states what was and was not tested on a real install.

## All hosts at a glance

The table matches the generated table in the project README. The `aletheia install --list` command prints the same data from the code.

| Host | Level | Verification | Hook events installed |
|---|---|---|---|
| [Claude Code](claude-code.md) | full | MCP connection 2.1.312 on 2026-10-27; hooks ran in real sessions over two days of use; one user on one machine | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| [Command Code](command-code.md) | full | MCP connection 1.88.1 on 2026-10-27; hooks ran in one short session; one user on one machine | SessionStart, PostToolUse, Stop |
| [Cursor](cursor.md) | full | config written from docs, not tested on a real install | sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd |
| [Codex CLI](codex.md) | full | MCP connection 0.130.0 on 2026-10-27; hooks ran in one interactive session (reviewed once with /hooks); one user on one machine | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| [Gemini CLI](gemini-cli.md) | full | config written from docs, not tested on a real install | SessionStart, BeforeAgent, AfterTool, AfterAgent, SessionEnd |
| [Windsurf](windsurf.md) | full | config written from docs, not tested on a real install | pre_user_prompt, post_run_command, post_write_code, post_cascade_response |
| [OpenCode](opencode.md) | mcp+rules | MCP connection 1.18.33 on 2026-10-27; hooks not run | none (MCP and rules only) |

Claude Desktop has an MCP entry only. It has no hooks and no rules file. See [Claude Desktop](../claude-desktop.md). GitHub Copilot, Aider and any other MCP client are covered in [Other tools](other-tools.md).

Real output from `aletheia install --list` in a temporary home folder (the `detected` column says no because that folder is empty):

```
tool          capability   verification     detected  events
claude-code   full         mcp-verified      no        SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd
command-code  full         mcp-verified      no        SessionStart, PostToolUse, Stop
cursor        full         from-docs-only    no        sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd
codex         full         mcp-verified      no        SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd
gemini-cli    full         from-docs-only    no        SessionStart, BeforeAgent, AfterTool, AfterAgent, SessionEnd
windsurf      full         from-docs-only    no        pre_user_prompt, post_run_command, post_write_code, post_cascade_response
opencode      mcp+rules    mcp-verified      no        none
...
```

## What "full" and "mcp+rules" mean

A host at level `full` gets three things from `aletheia install <tool> --write`:

- **MCP.** One server entry named `aletheia` in the host's MCP config. The host can then call Aletheia tools such as `search`, `save_memory` and `session_start_context`. The server runs on stdio and opens the local store directly.
- **Hooks.** Entries in the host's hook file that run `aletheia hook <tool> <event>`. The host runs them on its own, so Aletheia captures prompts, tool calls and summaries without the model having to ask. Hooks also inject recalled memory at session start where the host has a session-start event.
- **Rules.** A managed block in the instruction file the host reads. Your rules go there. Cursor is the exception: it has no global rules file, so `install` writes no rules for it and you run `aletheia rules sync` per project.

A host at level `mcp+rules` gets the MCP entry and the rules block, and nothing else. Nothing is captured automatically. A memory is stored only when the model calls an MCP tool such as `save_memory`, or when you save one with the CLI. OpenCode is the only host at this level.

Each host does not get every event. The host decides which events exist. Command Code has no prompt hook, and Windsurf has no session-start hook. Each host page lists what is and is not captured.

## Install runs as a dry run first

`aletheia install <tool>` changes nothing. It prints each file it would write. Add `--write` to apply it.

```bash
aletheia install claude-code            # dry run, writes nothing
aletheia install claude-code --write    # applies the plan
```

The rules:

- A changed file is first copied to `<file>.aletheia-bak-<timestamp>`.
- Files that already hold other settings are merged. Other hooks, permissions and MCP servers are kept.
- A step that would change nothing is not written, so a second run leaves files and backups alone.
- A JSON file that does not parse is refused. In Codex's `config.toml` and in Gemini's `settings.json`, an existing `aletheia` entry that is not Aletheia's stops the install with an error and is left alone.
- Every write is recorded in `<data dir>/install-manifest.json`. The default data dir is `~/.aletheia`.
- `aletheia install <tool> --verify` compares each recorded file with the manifest and prints `ok`, `drift` or `missing`. It exits 1 if anything differs.
- `aletheia uninstall <tool> --write` removes only the entries the manifest lists. It is also a dry run without `--write`.

Hooks run the hook command from the data dir (`<bun> <data dir>/aletheia.bundle.mjs hook <tool> <event> # aletheia-managed`). They redact secrets and `<private>` blocks before storing, spool to disk if the database is unavailable, and always exit 0 so they never block the host. See [Hooks reference](../reference/hooks.md) and [Privacy and redaction](../concepts/privacy.md).

## What the verification words mean

- **mcp-verified.** The real CLI listed the aletheia MCP server from the config the installer wrote. It is a check of the MCP entry. It is not a check of hooks.
- **from-docs-only.** The config format came from the host's official documentation, fetched on 2026-10-26. The installer was tested against fixtures. The host was not run with this config.
- **tested-on-real-install.** The code defines this value. No host has it.

`aletheia doctor` prints a `verify <tool>` line for each host. The word `verified` on those lines means only that the recorded evidence date is under 180 days old. It does not mean the host was tested on a real install. Read the evidence text on the same line. Copilot, Aider and the generic AGENTS.md target print `unverified: no verifiedOn recorded`.

## Honest status

These sentences are the fixed wording for every page in this section.

- The MCP server was listed by the real CLI on 2026-10-27: Claude Code 2.1.312, Command Code 1.88.1, Codex 0.130.0, OpenCode 1.18.33.
- Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine.
- Cursor, Gemini CLI and Windsurf: config written from docs, not tested on a real install. No hook ran in Cursor, Gemini CLI, Windsurf or OpenCode.
- Answer accuracy is not measured. Benchmarks are retrieval only.

The README adds that CI runs on Linux, macOS and Windows, that two hook checks (Windsurf and Gemini CLI) are skipped on Windows, and that no real tool was tried on Windows.

## Which page to open

- You use Claude Code: [Claude Code](claude-code.md). Hooks ran over two days of real use.
- You use Command Code: [Command Code](command-code.md). It captures tool calls but not prompts.
- You use Codex CLI: [Codex CLI](codex.md). You must review the hooks once with `/hooks`.
- You use Cursor: [Cursor](cursor.md). Config from docs, not tested.
- You use Gemini CLI: [Gemini CLI](gemini-cli.md). Config from docs, not tested.
- You use Windsurf (now documented as Devin Desktop): [Windsurf](windsurf.md). Config from docs, not tested.
- You use OpenCode: [OpenCode](opencode.md). MCP and rules only.
- You use Claude Desktop: [Claude Desktop](../claude-desktop.md). MCP entry only.
- You use GitHub Copilot, Aider, or another MCP client, or you want to call the REST API or CLI from a script: [Other tools](other-tools.md).
- You want the per-file reference for every installer: [Installer reference](../25-installers.md).

## Next steps

- [Quickstart](../start/quickstart.md) - install Aletheia, connect one host and see the first memory.
- [Rules](../concepts/rules.md) - how one set of rules becomes a block in each host's file.
- [Installer reference](../25-installers.md) - sources and fetch dates for each host.
- [Troubleshooting](../guides/troubleshooting.md) - when a hook or MCP entry does not show up.
