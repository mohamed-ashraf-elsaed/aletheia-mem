# Claude Code memory options: CLAUDE.md, auto memory, MCP servers and Aletheia

<!-- description: How persistent memory works in Claude Code: CLAUDE.md files, auto memory, MCP servers, plugins and hooks, and where Aletheia fits beside them. -->
<!-- keywords: claude code memory, claude memory, claude.md, persistent memory claude code, claude code auto memory, claude code mcp memory server, claude code rules -->

Claude Code starts every session with a fresh context window, and it carries knowledge between sessions with two built-in mechanisms: CLAUDE.md files that you write and auto memory that Claude writes. Aletheia (aletheia-mem) is a local memory and rules hub that sits beside them. It adds a memory store that other hosts can read too, and it writes a managed block of rules into your `CLAUDE.md` without touching the rest of the file.

Every statement about Claude Code on this page comes from Anthropic's documentation and was fetched on 2026-10-29. The URL is next to each statement.

## Persistent memory in Claude Code, in short

- Put rules and project facts you want in every session into a `CLAUDE.md` file. You write it, Claude reads it.
- Let auto memory keep the small notes Claude picks up from your corrections. It is built in and needs no install.
- Add an MCP server when Claude needs to read or write data in another system, such as a memory store.
- Use hooks or a plugin when something must run at a point in the session, such as loading context at the start.
- Add Aletheia when you want one memory store and one rule list shared by Claude Code and other hosts.

## CLAUDE.md files

A `CLAUDE.md` file is a Markdown file of persistent instructions. Claude reads it at the start of every session. Source: https://code.claude.com/docs/en/memory, 2026-10-29.

The same page lists these locations, from the broadest scope to the narrowest:

| Scope | Location |
|---|---|
| Managed policy | `/etc/claude-code/CLAUDE.md` on Linux and WSL, with other paths on macOS and Windows |
| User | `~/.claude/CLAUDE.md` |
| Project | `./CLAUDE.md` or `./.claude/CLAUDE.md` |
| Local | `./CLAUDE.local.md` |

What else the page says:

- Files in the directory tree above the working directory are loaded at launch. Files in subdirectories load when Claude works with a file there. All found files are concatenated, not overridden.
- The page says to aim for under 200 lines per file, because longer files use more context and reduce how well Claude follows them. Claude treats the file as context, not as enforced configuration.
- A `CLAUDE.md` can import other files with `@path/to/file`, to a depth of four hops.
- Rules can be split into `.claude/rules/` files, and a rule can be limited to some paths with a `paths` field.
- `/init` writes a starting `CLAUDE.md`. `/memory` lists and opens the memory files. `/context` shows which ones loaded.
- Block-level HTML comments are stripped before the content reaches Claude.

### AGENTS.md

Claude Code can read `AGENTS.md` as project instructions from version 2.1.277. By default it does so only when there is no `CLAUDE.md` or `CLAUDE.local.md` in the working directory or above it. If both exist, Claude reads the `CLAUDE.md` files only, unless the `CLAUDE.md` imports `AGENTS.md` or you change the **Project instructions** setting in `/config`. Source: https://code.claude.com/docs/en/memory, 2026-10-29.

## Auto memory

Auto memory is notes that Claude writes for itself. Source for this whole section: https://code.claude.com/docs/en/memory, 2026-10-29.

- It is on by default in local sessions. Turn it off with the toggle in `/memory`, with `autoMemoryEnabled` in settings, or with `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
- Each project has a folder at `~/.claude/projects/<project>/memory/`. It holds a `MEMORY.md` index and one file per topic.
- The first 200 lines or 25 KB of `MEMORY.md` load at the start of each session. Topic files load on demand.
- The notes are plain Markdown that you can read, edit or delete. They are machine-local and are not shared across machines.
- Claude records four kinds of notes: `user`, `feedback`, `project` and `reference`.

## MCP servers

MCP is an open standard for connecting AI tools to other systems. The Claude Code docs say MCP servers give it access to tools, databases and APIs. Source: https://code.claude.com/docs/en/mcp, 2026-10-29.

- Add a local server with `claude mcp add [options] <name> -- <command> [args...]`, or a remote one with `claude mcp add --transport http <name> <url>`.
- Scopes are local (the default), project (a `.mcp.json` file you can commit) and user (`~/.claude.json`, every project).
- Claude Code warns when one tool result is over 10,000 tokens and caps it at 25,000 by default.
- The docs tell you to trust a server before connecting it, because a server that fetches outside content can carry prompt injection.

An MCP memory server is one that stores and returns memories through these tools. Aletheia has one: 13 tools, listed in [MCP tools](../reference/mcp-tools.md). An MCP server gives Claude tools to call, such as a memory search. Loading context at the start of a session is the job of a hook.

## Plugins and hooks

A plugin is a directory of skills, agents, hooks and MCP servers that Claude Code installs as one unit, usually from a marketplace. Source: https://code.claude.com/docs/en/plugins, 2026-10-29.

A hook is a command that Claude Code runs at a point in the session. A `SessionStart` hook can return `hookSpecificOutput.additionalContext`, and Claude Code inserts it as a system reminder at the start of the conversation. The other events include `UserPromptSubmit`, `PostToolUse`, `Stop` and `SessionEnd`. Source: https://code.claude.com/docs/en/hooks, 2026-10-29.

Hooks are how a memory tool loads context without waiting for Claude to ask, and how it captures what happened. Aletheia is not a Claude Code plugin. Its installer edits your settings files directly. See below.

## Where Aletheia fits

| Mechanism | Who writes it | Where it lives | How it reaches Claude |
|---|---|---|---|
| CLAUDE.md | You | Files on disk | Loaded at session start |
| Auto memory | Claude | `~/.claude/projects/<project>/memory/` | Index loaded at session start |
| Aletheia managed block | You, in the hub | Inside `~/.claude/CLAUDE.md` or a project `CLAUDE.md` | Loaded as part of that file |
| Aletheia memory store | Hooks and you | `~/.aletheia/hub.db` | `SessionStart` hook and MCP tools |

Aletheia does not replace either built-in mechanism. It does not read or write the auto memory folder, and a search of `src/` and `bin/` for `MEMORY.md` finds nothing. It can read Claude Code session transcripts under `~/.claude/projects/` to back-fill memories, read-only, with `aletheia import transcripts claude-code`.

Install it for Claude Code with:

```bash
aletheia install claude-code          # dry run: lists every file, writes nothing
aletheia install claude-code --write
```

On a throwaway home directory, the dry run printed this. Paths are shortened to `~`, and `...` marks two lines left out.

```
Claude Code (claude-code) — full, mcp-verified
  write  mcp      ~/.claude.json  (mcpServers.aletheia)
  write  hooks    ~/.claude/settings.json  (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd)
  write  rules    ~/.claude/CLAUDE.md  (1 rule)
  ...
Dry run: nothing was written. Add --write to apply.
```

What has been checked on a real Claude Code:

- MCP server listed by the real CLI on 2026-10-27: Claude Code 2.1.312.
- Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine.

Nothing here shows that an answer was better with Aletheia than without it. Answer accuracy is not measured. See [Benchmarks](../project/benchmarks.md) and [Claude Code setup](../tools/claude-code.md).

## How the managed block coexists with your own text

Aletheia writes its rules between two HTML comment markers, `<!-- aletheia:rules:begin -->` and `<!-- aletheia:rules:end -->`. Everything outside the markers is yours and is not changed ([`src/hub/rules-sync.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/rules-sync.mjs)). Each write to an existing file keeps a timestamped backup of the old file.

A real run, with a temporary home directory and a `~/.claude/CLAUDE.md` that held a heading and one sentence of the user's text. Paths are shortened to `~`.

```bash
aletheia rules add "Run the test suite before committing."
aletheia rules add "Use two-space indents" --when "editing JavaScript"
aletheia rules sync --tools claude-code --global           # dry run
aletheia rules sync --tools claude-code --global --write
```

```
- claude-code: ~/.claude/CLAUDE.md — 2 rules, would change (add --write)
- claude-code: ~/.claude/CLAUDE.md — 2 rules, written (backup ~/.claude/CLAUDE.md.aletheia-2026-10-29T19-49-03-236Z.bak)
```

The file after the write:

```
# My notes

Always answer in short sentences.

<!-- aletheia:rules:begin -->
# Rules

Managed by aletheia-mem. Edit them in the Rules page; this block is rewritten on sync.

## Everywhere

- Run the test suite before committing.
- When editing JavaScript: use two-space indents
<!-- aletheia:rules:end -->
```

Then the user added a line below the block, a third rule was added and the sync ran again. The new rule appeared inside the block and the user's line stayed where it was.

Things to know:

- **Edit rules in the hub, not in the block.** The block is rewritten on every sync. Text you type between the markers is replaced.
- **Sync is a file write.** A rule reaches Claude Code when the sync writes it. Claude Code loads `CLAUDE.md` files at the start of a session, so expect the change in the next session. Running `aletheia rules sync` without `--write` shows the change first.
- **The markers are HTML comments.** The Claude Code docs say block-level HTML comments are stripped before the content is injected, so the markers should not use context. That was not checked in a live session.
- **Mind the 200-line guidance.** The block adds a heading, a sentence and one line per rule to a file that Claude reads in full. Keep rules short.
- **Remove it cleanly.** `aletheia uninstall claude-code --write` removes only the entries its install manifest lists. In a separate temporary-home run, the `CLAUDE.md` went back to the user's heading and sentence.
- **AGENTS.md is a different file.** `aletheia rules sync` writes `AGENTS.md` for Codex, Command Code and OpenCode and writes `CLAUDE.md` for Claude Code. Per the Claude Code docs, a project that has both is read through the `CLAUDE.md` only. Sync both files, or import `AGENTS.md` from your `CLAUDE.md`.

## Next steps

- [Rules](../concepts/rules.md) - how rules are stored, scoped and synced.
- [Write rules once](../guides/write-rules-once.md) - a short guide to the sync command.
- [Session-start context](../concepts/session-context.md) - what the `SessionStart` hook sends to Claude Code.
- [Claude Code setup](../tools/claude-code.md) - install, verify and uninstall for this host.
- [Aletheia and claude-mem](aletheia-vs-claude-mem.md) - the other memory plugin for Claude Code.
