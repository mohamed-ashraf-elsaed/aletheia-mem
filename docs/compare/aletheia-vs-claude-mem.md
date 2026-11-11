# claude-mem alternative: Aletheia compared with claude-mem

<!-- description: A fair, sourced comparison of Aletheia and claude-mem: where claude-mem is ahead, where Aletheia differs, measured LoCoMo retrieval numbers. -->
<!-- keywords: claude-mem alternative, claude-mem vs aletheia, claude-mem comparison, local memory for claude code, ai coding memory tools, claude-mem benchmark -->

Aletheia (aletheia-mem) is a free, local memory and rules hub for AI coding tools, and a possible claude-mem alternative if you want one store shared by several hosts. This page compares it with claude-mem, the larger and older project, and says where each one is ahead. Aletheia is not affiliated with or endorsed by the claude-mem authors or Anthropic.

## Short answer

claude-mem is the bigger, more mature project. It has a far larger community, more features and more integrations. Choose it if Claude Code is your main host and you want its live viewer, its file read gate, its cloud sync option or its community.

Aletheia is a small alpha project. Choose it if you want one SQLite store that several hosts read over MCP, REST or the CLI, rules written once and synced into each host's own instruction file, and facts that record when they were true. Both projects run on your machine and both are Apache-2.0.

The two can run side by side. You can also copy your claude-mem memories into Aletheia.

## Facts about claude-mem, fetched 2026-11-11

These numbers come from GitHub, npm and claude-mem's own documentation and source. They are `vendor-claimed` where they describe behaviour: nobody here installed claude-mem except for the benchmark run below. They change often, so check the sources. The previous values, fetched 2026-10-29, are in brackets.

- Licence: Apache-2.0. Repository created: 2025-08-31. Source: `gh api repos/thedotmack/claude-mem`, https://github.com/thedotmack/claude-mem, 2026-11-11.
- Stars: 116,074 (104,569). Forks: 10,068 (9,229). Source: the same `gh api` call, 2026-11-11.
- Contributors: 352 (297), counted from `gh api repos/thedotmack/claude-mem/contributors?anon=false`, 2026-11-11.
- Latest release: v15.17.0, published 2026-11-11T06:13:38Z (v15.6.0 on 2026-10-29). Source: `gh api repos/thedotmack/claude-mem/releases/latest`, 2026-11-11.
- Claude Code hooks: nine events (Setup, SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, Stop, SubagentStop, SessionEnd). Source: `plugin/hooks/hooks.json` at commit `308a9ab`, https://raw.githubusercontent.com/thedotmack/claude-mem/main/plugin/hooks/hooks.json, 2026-11-11.
- MCP tools: 26 tool definitions, of which two team tools are listed only after joining a team. Source: `src/servers/mcp-server.ts` and `src/servers/mcp-tool-visibility.ts` at `308a9ab`, https://github.com/thedotmack/claude-mem/tree/main/src/servers, 2026-11-11.
- New hosts since 2026-10-29: Devin CLI and Desktop (release 15.9.0), and Copilot CLI, Goose, Roo Code and Warp as search-only MCP hosts. Sources: https://api.github.com/repos/thedotmack/claude-mem/releases and `src/npx-cli/commands/ide-detection.ts` at `308a9ab`, 2026-11-11; docs page https://docs.claude-mem.ai/devin-integration, listed in https://docs.claude-mem.ai/sitemap.xml, 2026-11-11.
- Gemini CLI: it has a Pro remote MCP recall setup only. Dedicated capture of prompts, tool calls and sessions is an open request, https://github.com/thedotmack/claude-mem/issues/5949 (opened 2026-11-11, fetched 2026-11-11 with `gh issue view`).
- Backups: local backups and restore (release 15.3.0; docs usage/backups). Source: https://api.github.com/repos/thedotmack/claude-mem/releases and https://docs.claude-mem.ai/llms-full.txt, 2026-11-11.
- Auto-update: on by default, forward only, after 18 idle minutes (release 15.14.0). It can be turned off with `CLAUDE_MEM_AUTO_UPDATE=false`. Sources: https://docs.claude-mem.ai/llms-full.txt (auto-update page) and the settings defaults in the 15.17.0 npm package, https://www.npmjs.com/package/claude-mem/v/15.17.0, 2026-11-11.
- Image capture: on by default, images kept as local WebP (release 15.12.0). The 15.17.0 default settings file we generated shows `CLAUDE_MEM_MEDIA_CAPTURE_ENABLED` as `true`. Source: https://api.github.com/repos/thedotmack/claude-mem/releases, 2026-11-11.
- Telemetry: still on by default, and it honours `DO_NOT_TRACK`. Source: https://docs.claude-mem.ai/llms-full.txt (telemetry page), 2026-11-11.

claude-mem's own pages sometimes disagree (for example on the default worker port). This page does not resolve those conflicts. Not checked: whether any of these features work as described, other than save and search through the worker (see Measured numbers).

For scale, the Aletheia repository's first commit is dated 2026-10-26 and its first release, 0.1.0, is dated 2026-10-27 ([CHANGELOG](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/CHANGELOG.md)).

## Where claude-mem is ahead

Every item below is stated in claude-mem's documentation. Items keep the fetch date shown on them. Items dated 2026-10-29 were not fetched again on 2026-11-11, so check them against the current docs. Aletheia's status for the same item is in the second half of each line.

- **Community and maturity.** The numbers above are claude-mem's. Aletheia's repository is days old and has one maintainer. Its real-tool evidence comes from one user on one machine. See [Status and limits](../project/status-and-limits.md).
- **A live viewer.** claude-mem's "My Work" page runs at the local worker URL, usually `http://localhost:37777`. It gathers recorded requests, progress and finished results and reads the saved memory database. Source: https://docs.claude-mem.ai/usage/my-work.md, 2026-10-29. Aletheia has its own web interface, described in [The dashboard](../start/dashboard.md). It is newer and has had less use.
- **A file read gate.** claude-mem blocks Claude Code from reading a whole code file of at least 32 KB when that file already has observations, and offers an outline or a line range instead. It is on by default and fails open. Source: https://docs.claude-mem.ai/file-read-gate.md, 2026-10-29. Aletheia has a gate module (`src/hub/smart-file.mjs`) covered by tests. No hook or MCP tool calls it and it is off by default, so you cannot use it yet.
- **Many integrations.** The installation page lists Claude Code, Cursor, Windsurf, OpenCode, Codex CLI, Antigravity CLI and OpenClaw, and the README adds T3 Code, Pi and DeepSeek Harness. Sources: https://docs.claude-mem.ai/installation.md and https://github.com/thedotmack/claude-mem, 2026-10-29. On 2026-11-11 it also lists Devin and, as search-only hosts, Copilot CLI, Goose, Roo Code and Warp (sources in the facts above). Aletheia has hook adapters for six hosts and MCP plus rules for a seventh. Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine. See [Tools overview](../tools/overview.md).
- **Cloud sync.** claude-mem offers an optional, paid cloud sync through cmem.ai Pro. It replicates the memory database across your devices. Its docs warn that observation narratives and full prompt text go to the sync hub. Source: https://docs.claude-mem.ai/cloud-sync.md, 2026-10-29. Aletheia Sync is self-hosted and free, and it has only been tested on loopback. See [Sync](../29-sync.md).
- **Vector search.** claude-mem's `search` tool matches by meaning first and then by keywords when its Chroma vector index is running. Source: https://docs.claude-mem.ai/usage/search-tools.md, 2026-10-29. In Aletheia, vectors need an optional package, so a default install searches by keyword only. See [Search](../concepts/search.md).
- **More features around memory.** Its introduction page lists knowledge agents, a mode system, 28 languages and folder context files. Source: https://docs.claude-mem.ai/introduction, 2026-10-29. The README also lists TeamBrain, a shared workspace. Source: https://github.com/thedotmack/claude-mem, 2026-10-29. Aletheia has some counterparts, such as modes, an output-language setting, folder context files and a self-hosted team mode ([Team mode](../31-team.md)). This page does not claim parity with any of them.

## Where Aletheia differs

Each point is backed by Aletheia's code or README.

- **A tool-neutral store.** One SQLite store holds memories from every host, tagged with the host name. Any host reads it over MCP (stdio and HTTP), a REST API under `/v1` or the CLI. Source: the interfaces table in the [README](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/README.md).
- **Rules sync to many instruction files.** You write a rule once. `aletheia rules sync` writes it into the instruction file of each host in the registry, for example `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, a Cursor `.mdc` file and a Windsurf rules file. The registry has ten entries ([`src/hub/tools.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/tools.mjs)). Your own text outside the managed block is left alone ([`src/hub/rules-sync.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/rules-sync.mjs)). claude-mem also writes `CLAUDE.md` files, but its docs describe them as folder context with activity timelines, not as rules you author. See [Rules](../concepts/rules.md).
- **MCP, REST and CLI.** The MCP server exposes 13 tools, listed in [MCP tools](../reference/mcp-tools.md). The REST API and the CLI cover the same store.
- **Facts with two time axes.** A fact stores when it was valid (`valid_from_epoch`, `valid_to_epoch`) and when the hub recorded or expired it (`recorded_at_epoch`, `expired_at_epoch`). The `fact_history` tool answers "what was true on this date" with its `as_of` argument. Sources: [`src/hub/store.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/store.mjs) and [`src/hub/mcp-tools.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/mcp-tools.mjs). See [Facts and contradictions](../33-facts.md).
- **A benchmark gate.** CI fails a change that loses more than one point of Recall@5 on a seeded synthetic corpus ([`bench/gate.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/bench/gate.mjs), [workflow](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/.github/workflows/test.yml)). It runs on Linux only. See [Benchmarks](../project/benchmarks.md).
- **Loopback only by default.** The server binds `127.0.0.1` unless you set `ALETHEIA_HOST`. A non-loopback bind turns on a login ([`src/config.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/config.mjs), [`src/server.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/server.mjs)).
- **No telemetry.** The README states there is no account, no telemetry and no network call unless you configure a model provider. A text search of `src/` and `bin/` for telemetry, analytics, PostHog and Sentry finds only a comment that says "No telemetry". claude-mem's docs say its anonymous usage analytics are on by default and can be turned off with `npx claude-mem telemetry disable`. Source: https://docs.claude-mem.ai/telemetry.md, 2026-10-29. The 2026-11-11 docs dump says the same and adds that `DO_NOT_TRACK` is honoured (https://docs.claude-mem.ai/llms-full.txt, 2026-11-11).

## Measured numbers

Retrieval only. The numbers show whether the evidence for a question is in the top five results. They are not answer accuracy, and answer accuracy is not measured.

On the LoCoMo dataset, 1,536 questions with gold evidence, raw dialogue turns stored as memories:

| System | Date | Conditions | Recall@5 | MRR | Mean latency |
|---|---|---|---|---|---|
| claude-mem 15.2.0, as shipped | not recorded | Chroma on or off not recorded; raw output not committed | 36.0% | 0.285 | p50 1,699 ms, p95 2,824 ms (idle, 40 queries) |
| claude-mem 15.17.0, as shipped | 2026-11-11 | Chroma index running; same endpoints; isolated worker; raw output committed | 43.5% | 0.377 | 1,079 ms over 1,536 queries |
| Aletheia, keyword search (BM25) | 2026-10-26 | in-process, no vectors | 55.3% | 0.482 | 2.00 ms |
| Aletheia, keyword plus vectors (hybrid) | 2026-10-26 | in-process, optional embeddings package | 57.4% | 0.497 | 3.72 ms |

All rows are measured-by-us. The 15.17.0 row comes from `bun bench/claude-mem-baseline.mjs --data bench/data/locomo10.json --port 37795 --out bench/results/2026-11-11/claude-mem-15.17.0.json`, against a claude-mem 15.17.0 worker from `npm pack claude-mem@15.17.0`. The 15.2.0 row comes from the same script, from an earlier run whose date and raw output are not kept. Re-run the Aletheia rows and print the claude-mem rows with `bun scripts/compare-bench.mjs`. It reads the JSON files in `bench/results/` and needs no network. [Benchmarks](../project/benchmarks.md) has every command and the full table.

On 15.17.0, Recall@5 by question category was 17.6% (category 1, 282 questions), 48.3% (category 2, 321), 22.2% (category 3, 92) and 52.7% (category 4, 841). Recall@10 was 50.0%.

Read these numbers with five caveats.

1. The two claude-mem rows differ in version and in recorded conditions. The rise from 36.0% to 43.5% cannot be assigned to the version alone, because the 15.2.0 run's Chroma state, date and machine are unknown.
2. claude-mem is built to ingest through its language-model observer. The baseline saves raw turns through its save endpoint, which is the closest model-free equivalent. A run through the observer could score differently.
3. Chroma was running for 15.17.0. It indexes saved turns in the background, and the harness waits a fixed 15 seconds per conversation, so some turns may not have been in the vector index when their questions ran. This was not measured. Chroma needed about 1 GB of downloaded Python packages and an embedding model in the temporary home, and the first run needed the package cache filled before the worker could start it.
4. The Aletheia hybrid row needs the optional embeddings package. Latency is not like for like: Aletheia's figure is the mean time of the in-process ranking call and leaves out the time to embed the question. claude-mem's figure is an HTTP request to its worker, measured on a busy shared machine while Chroma was embedding.
5. One run per version. No repeat runs, so run-to-run variation is unknown.

## Using both

Aletheia and claude-mem can run side by side. They use separate data directories, `~/.aletheia` and `~/.claude-mem` by default, and separate ports. Aletheia never writes to claude-mem's database. The importer opens it read-only with `PRAGMA query_only` ([`src/hub/importers.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/importers.mjs)).

claude-mem describes itself as injecting relevant context into future sessions (the repository description, 2026-10-29), and Aletheia's `SessionStart` hook for Claude Code prints a context block. If both are installed on one host, expect two context blocks. This page does not claim a tested combination. Run `aletheia install claude-code` without `--write` first to see every file it would change.

## Migrating

To copy your claude-mem memories into Aletheia, run:

```bash
aletheia import claude-mem
```

The command reads observations, session summaries and prompts and adds them to the hub. Add `--path <db>` for a database in another place and `--no-prompts` to skip prompts. The step-by-step guide is [Migrate from claude-mem](../guides/migrate-from-claude-mem.md).

## Licence and attribution

Aletheia is Apache-2.0. A few files come from claude-mem 15.2.0, also Apache-2.0: the optional legacy viewer, two skill prompts, some scripts and one derived module. [NOTICE.md](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/NOTICE.md) lists each file and the change made.

## Next steps

- [Migrate from claude-mem](../guides/migrate-from-claude-mem.md) - copy your memories into the hub.
- [Benchmarks](../project/benchmarks.md) - every command behind the numbers on this page.
- [Memory tools compared](memory-tools.md) - Aletheia against Mem0, Zep, Supermemory and Basic Memory.
- [Status and limits](../project/status-and-limits.md) - what has and has not been checked.
