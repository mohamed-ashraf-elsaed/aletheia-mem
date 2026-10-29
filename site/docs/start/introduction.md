# Introduction to Aletheia, a local memory hub for AI coding tools

<!-- description: Aletheia (aletheia-mem) is a free, local memory and rules hub that gives AI coding tools persistent memory over MCP, REST and a CLI. -->
<!-- keywords: claude code memory, ai agent memory, mcp memory server, persistent memory for coding agents, rules sync claude.md agents.md, local ai memory -->

Aletheia (aletheia-mem) is a free, local memory and rules hub for AI coding tools. It keeps what your tools learn in one SQLite file on your machine, and any tool can read that file over MCP, REST or a command line.

## What it is

Every coding agent forgets between sessions, and each one remembers in its own format. Aletheia gives you one place that holds the memory and the rules. It works as persistent memory for coding agents, as an MCP memory server, and as a rules hub that writes your standing instructions into the files each tool already reads, such as `CLAUDE.md` and `AGENTS.md`.

These docs call an AI coding tool a host, and Aletheia itself the hub. A person uses the hub in three steps:

1. Install it and connect a tool. The tool's hooks send what happened in each session to Aletheia.
2. Aletheia redacts secrets, stores the text, and turns it into short facts and summaries.
3. The next session starts with a short block of what you already decided, plus your rules.

There is no account and no telemetry. The server listens on `127.0.0.1` unless you change `ALETHEIA_HOST`. The server and the hooks make no network call unless you configure a model provider, a sync hub or an alert webhook. A few commands load an optional vector package, and in a git clone Bun may download it; [Installation](installation.md#install-from-git) has the details.

## Key features

- **One store for several tools.** A single SQLite file, `hub.db`, in `~/.aletheia`. Claude Code memory and Codex CLI memory live in the same place, tagged with the tool that wrote each row.
- **Three ways in.** An MCP server over stdio (`aletheia-mcp`), a REST API under `/v1`, and the `aletheia` command. The MCP tools include `search`, `timeline`, `get_observations`, `save_memory`, `session_start_context`, `fact_history`, `list_rules`, `add_rule`, `dismiss_memory` and `restore_memory`.
- **Automatic capture through hooks.** Hook adapters exist for Claude Code, Command Code, Cursor, Codex CLI, Gemini CLI and Windsurf. What has been checked on a real install is listed under [What it does not do](#what-it-does-not-do).
- **Redaction before storage.** API keys, tokens, passwords and private keys are replaced with markers. Text inside `<private>` tags is dropped.
- **Hooks that never block the tool.** A hook always exits 0. If the database is not available, the hook writes the item to a spool file on disk and the next hook flushes it.
- **Facts with a history.** Short statements are extracted from summaries and notes. A newer fact on the same subject closes the older one instead of deleting it, and `aletheia search --as-of DATE` reads the past.
- **Keyword search by default.** SQLite FTS5 answers searches. Local vector search is optional. It needs the `@huggingface/transformers` package and downloads a model on first use.
- **Session-start context.** A compact block of pinned items, recent items, facts and rules, wrapped in an `<aletheia-memory>` tag that tells the model to treat it as data, not instructions.
- **Rules written once.** One list of rules is written into `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, Cursor `.mdc` files, Windsurf rules, Copilot instructions and Aider `CONVENTIONS.md`. Every write can be previewed, and the first write keeps a backup.
- **A dashboard.** Five tabs at `http://127.0.0.1:37790`: Home, Activity, Knowledge, Rules and Connections.
- **Control over your data.** You can dismiss a memory and restore it later. You can erase with a report first, a pre-erase export and a signed receipt.
- **Portable data.** Export to a JSONL bundle or Markdown, import a bundle on another machine, or import a claude-mem database read-only.
- **Optional, self-hosted extras.** Device sync, remote MCP and team mode. Neither sync nor remote MCP has been tested across two real machines.

## Who it is for

- People who use more than one AI coding tool and want one place for what those tools learn, instead of one memory per tool.
- People who write the same standing instructions into `CLAUDE.md`, `AGENTS.md` and Cursor rules by hand and want to write them once.
- People who want memory on their own machine, in a file they can open, export and delete.

## A first look

You do not need a connected host to see the idea. Save a memory from the command line, then search it:

```bash
aletheia save "The deploy script needs Node 20.19.6 on the staging server" --project shop --pin
aletheia search "node staging" --project shop
```

```text
Saved as #1.
#1 2026-10-29 [note] The deploy script needs Node 20.19.6 on the staging server (shop, cli)
```

A host that reads the same store, through hooks, MCP or `aletheia context`, would see that note at the start of its next session in the `shop` project. [Quickstart](quickstart.md) runs this end to end.

## How it works

```text
host hook -> redact -> store in SQLite -> queue -> compress -> context back to the next session
```

A hook in your tool sends a prompt, a tool call or a session summary to `aletheia hook`. The text is redacted and written to `hub.db`. A background worker, started by `aletheia-server`, picks up queued sessions and compresses them into facts and a session summary. At the start of the next session, a hook asks Aletheia for context and the tool receives it. [How Aletheia works](how-it-works.md) follows each step through the code.

## What it does not do

- It does not measure answer accuracy. The published benchmarks measure retrieval only.
- It is alpha software, not production ready.
- It is not a hosted service. There is no cloud copy of your memory unless you set up sync yourself.
- Real-tool status is narrow. The real CLI listed the Aletheia MCP server on 2026-10-27 for Claude Code 2.1.312, Command Code 1.88.1, Codex 0.130.0 and OpenCode 1.18.33. Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine.
- Cursor, Gemini CLI and Windsurf: config written from docs, not tested on a real install. No hook ran in Cursor, Gemini CLI, Windsurf or OpenCode.
- Without a model provider, extraction is rule-based and quiet. It keeps only plain "subject verb object" sentences. In the project's own benchmark, the rule extractor did not reproduce the gain that dataset-supplied facts gave.
- It does not start itself on Windows. `aletheia service` is for Linux and macOS only.
- It does not run on Node.js. The commands run on Bun.

## System requirements

- Bun 1.1 or newer. The test suite runs in CI on Bun 1.3.10.
- Linux, macOS or Windows. CI runs the test suite on all three. On Windows, two hook checks (Windsurf and Gemini CLI) are skipped and no real tool was tried, so Windows is tested in CI only.
- No runtime dependencies. `package.json` lists none, and `bun scripts/audit-deps.mjs` checks it.
- A browser for the dashboard. The dashboard loads nothing from another origin.

## Where the name comes from

The landing page of the project writes the name as `ἀλήθεια · a-lethe · "un-forgetting"` and titles the project "Aletheia: un-forgetting for AI tools". The idea is the one this page started with: your tools forget between sessions, and Aletheia keeps what they learned so the next session does not start blank.

## Next steps

- [Installation](installation.md) - install with npm, git or Docker and start the server.
- [Quickstart](quickstart.md) - save, search and read a memory in about ten minutes.
- [How Aletheia works](how-it-works.md) - the capture pipeline, step by step.
- [The dashboard](dashboard.md) - what each of the five tabs is for.
- [FAQ](faq.md) - short answers to common questions.
