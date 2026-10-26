# Aletheia

**Un-forgetting for AI tools.** Free, local, one memory and one set of rules for every tool you use.

Aletheia (Greek *a-lethe*, "not forgetting") is a memory and rules hub for AI coding tools. It began as a
re-implementation of claude-mem's "My Work" view; today the Work tab is Aletheia's own view of captured sessions,
facts and goals.

One app at `/` with four tabs:

1. **Work** (`#/work`): captured sessions, review items, recent facts and owner goals from this hub. The optional
   legacy claude-mem viewer is linked from Tools only when its database exists.
2. **Memory** (`#/memory`): a store that **any** tool can read and write, with a UI to manage it. Search, filter,
   pin, edit, delete, add notes. Observations, summaries, prompts, raw events. Export a versioned bundle or Markdown,
   import a bundle or the old database. Idempotent.
3. **Rules** (`#/rules`): write once, **sync into** `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules`,
   `.windsurf/rules`, Copilot and Aider files. Preview, backup, never touches your own text. Import rules back.
4. **Tools** (`#/tools`): read-only installer status from `aletheia doctor`; the classic viewer link when the old
   database exists; the audit log.

Zero npm dependencies. Runtime: [Bun](https://bun.sh) >= 1.1. Loopback only. No account, no telemetry. Never writes
to claude-mem's database.

> claude-mem itself is free (Apache-2.0); only its hosted cloud and team features are paid.
> What this project adds is covered in [docs/12](docs/12-universal-memory-product.md); what it does not have yet is in
> [docs/11](docs/11-feature-inventory.md). Read both before comparing.

## How it compares (measured, not claimed)

On LoCoMo (1,536 questions), claude-mem 15.2.0 as shipped vs this project, retrieval only ([full tables and caveats](docs/14-research-ai-memory.md#146-measured-results)):

| | claude-mem | this project |
|---|---|---|
| Recall@5, raw turns | 36.0% | 57.5% (1.6×) |
| Recall@5, both given the same extracted facts (383 questions) | 57.7% | 67.6%, or 73.7% with reranking (1.17× to 1.28×) |
| Search latency, idle | p50 1,699 ms | 2 to 6 ms (350 ms with reranking) |

So the retrieval gap is real but **not 2×** when inputs are equal; the speed gap is two to three orders of magnitude. Answer accuracy (LLM-judged) is not measured yet. The plan to close the rest is in [15](docs/15-product-spec.md), [16](docs/16-target-architecture.md), [17](docs/17-tech-tasks.md), [18](docs/18-benchmark-plan.md).

## Which tools it connects to

Aletheia does not depend on any one tool. It speaks the open MCP protocol (stdio), a plain REST API and a CLI, and it
writes the instruction file each tool already reads. What has and has not been checked:

| Check | Result |
|---|---|
| MCP server against the official MCP SDK client | Passes (protocol versions 2025-11-25 to 2024-11-05) |
| Config formats for Claude Code, Command Code, Cursor, Codex CLI, Gemini CLI, Windsurf, OpenCode | Written from official docs fetched 2026-10-26 and tested against fixtures. **Not tested on a real install.** |
| Claude Desktop MCP config | Documented and merge-tested against a fixture; not opened in the app |
| Rules files: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, `.windsurf/rules/*.md`, Copilot, Aider | Written and tested in temp folders (`docs/verification/rules-targets.md`) |
| Any of the above **on a real install of that tool** | **Not tested yet.** Reports welcome. |
| Automatic capture through a tool's hooks | Built for Claude Code, Command Code, Cursor, Codex CLI, Gemini CLI and Windsurf. Each installed hook command is exercised end to end in a temp HOME with a recorded payload; none has been run inside the tool. OpenCode is MCP+rules. |

## Quick start

```bash
cd aletheia-mem   # after: git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
bun test                              # the test suite
bun bin/aletheia-server.mjs                 # http://localhost:37790  (Work, Memory, Rules, Tools)
```

Bring your claude-mem memory into the hub (read-only, repeatable):

```bash
bun bin/aletheia.mjs import claude-mem
bun bin/aletheia.mjs search "retry"
```

Give any tool the same memory:

```bash
bun bin/aletheia.mjs tools                          # what is installed, and how each connects
bun bin/aletheia.mjs install --list                 # capability level and verification per tool
bun bin/aletheia.mjs connect cursor                 # preview the MCP config; add --write to apply (backup kept)
bun bin/aletheia.mjs rules add "Run the tests before saying a task is done"
bun bin/aletheia.mjs rules sync --tools codex,cursor,claude-code --dir /path/to/project          # preview
bun bin/aletheia.mjs rules sync --tools codex,cursor,claude-code --dir /path/to/project --write
```

Capture from any tool's hook (secrets and `<private>` removed before storing):

```bash
echo '{"hook_event_name":"UserPromptSubmit","prompt":"add a retry button","session_id":"s1"}' \
  | bun bin/aletheia.mjs capture --tool my-tool --project shop
bun bin/aletheia.mjs context --project shop         # text to inject at session start, in any tool
```

Optional LLM features (off by default; they send data to the model you choose):

```bash
ALETHEIA_PROVIDER=claude-cli bun bin/aletheia-server.mjs      # legacy Work view refresh (grouping, reviews, goals, story)
bun bin/aletheia.mjs compress                                  # raw events -> observations (needs a provider)
# any OpenAI-compatible endpoint, including local models:
ALETHEIA_PROVIDER=openai ALETHEIA_OPENAI_BASE_URL=http://localhost:11434/v1/chat/completions \
  ALETHEIA_OPENAI_API_KEY=x ALETHEIA_OPENAI_MODEL=llama3 bun bin/aletheia-server.mjs
```

## Interfaces for tools

| Interface | Where | Use |
|---|---|---|
| MCP (stdio) | `bun bin/mcp.mjs` | `search`, `timeline`, `get_observations`, `save_memory`, `session_start_context`, `list_rules`, `add_rule` |
| REST | `/v1/memories`, `/v1/search`, `/v1/timeline`, `/v1/observations/batch`, `/v1/context`, `/v1/events`, `/v1/info` | scripts, CI, any language; optional `ALETHEIA_API_KEY` bearer key |
| CLI | `bin/aletheia.mjs` | hooks, shell, cron |
| Files | rules sync | each tool's own instruction file |

## Configuration

All settings are environment variables.

| Variable | Default | Meaning |
|---|---|---|
| `ALETHEIA_PORT` | `37790` | Listen port (host is always `127.0.0.1`). |
| `ALETHEIA_DATA_DIR` | `~/.aletheia` | Everything this project writes, including `hub.db`. |
| `ALETHEIA_HUB_DB` | `<data dir>/hub.db` | The shared memory store. |
| `ALETHEIA_API_KEY` | empty | Bearer key required on `/v1/*` when set. |
| `CLAUDE_MEM_DB` | `~/.claude-mem/claude-mem.db` | claude-mem's database (read-only; the optional legacy viewer and the importer). |
| `ALETHEIA_LEDGER_DIR` | `<data dir>/ledger` | Legacy Work view refresh output. Point at `~/.claude-mem/work-view` to share the original's. |
| `ALETHEIA_RULES_FILE` | `<data dir>/MY-RULES.md` | The legacy Work view's rules file. |
| `ALETHEIA_CLAUDE_MD` | `~/.claude/CLAUDE.md` | Where "Load in Claude Code" appends an `@` line. |
| `ALETHEIA_PROVIDER` | `none` | `none`, `claude-cli` or `openai`. |
| `ALETHEIA_OPENAI_BASE_URL`, `_API_KEY`, `_MODEL` | OpenRouter URL, empty, empty | For `openai`, and for human copy. |
| `ALETHEIA_AUTO_REFRESH`, `ALETHEIA_REFRESH_CHECK_MS` | `true`, `600000` | Legacy Work view refresh scheduling. |
| `ALETHEIA_BUG_COMPAT` | off | `1` reproduces the original's empty observation half ([F1](docs/08-findings.md)). |
| `ALETHEIA_TOOL`, `ALETHEIA_CWD` | | MCP server: names the calling tool and default project. |

## Layout

```
bin/            aletheia-server.mjs (server)  aletheia.mjs (CLI)  mcp.mjs (MCP server)  ledger.mjs (legacy Work ledger CLI)
src/
  server.mjs app.mjs source.mjs config.mjs humancopy.mjs      server and the legacy Work API
  readmodel/ ledger/ refresh/ store/ http/                     legacy Work internals
  hub/            store (memories, FTS5, rules, bundles)  rules-sync  tools  importers  capture  compress  mcp  routes
public/         the one UI (index.html, one-ui.*, tabs/, work-view.js);
                work.html and assets/ are the optional legacy viewer
public-hub/     the old Memory Hub assets, still served at /hub/app.js
prompts/ vendor/ the original's skill prompts and Python scripts
test/           the test suite and a synthetic fixture database
docs/           the documents
```

## Documents

1. [Architecture](docs/01-architecture.md) · 2. [Data model](docs/02-data-model.md) · 3. [HTTP API](docs/03-http-api.md)
   · 4. [Read model](docs/04-read-model.md) · 5. [Refresh pipeline](docs/05-refresh-pipeline.md)
   · 6. [Frontend](docs/06-frontend.md) · 7. [Operations](docs/07-operations.md)
   · 8. [Findings](docs/08-findings.md) · 9. [Verification](docs/09-verification.md)
   · 10. [Rebuild guide](docs/10-rebuild-guide.md)
2. [**Feature inventory vs claude-mem**](docs/11-feature-inventory.md): everything the original has, and the gap.
3. [**Product: free, any tool, easy to leave**](docs/12-universal-memory-product.md): positioning, migration, roadmap.
5. [**Research: how to build a better AI memory**](docs/14-research-ai-memory.md): sources, and every measured result against claude-mem.
6. [**Product specification**](docs/15-product-spec.md) · [**Target architecture**](docs/16-target-architecture.md) · [**Technical tasks**](docs/17-tech-tasks.md) · [**Benchmark plan**](docs/18-benchmark-plan.md)

## License

Apache-2.0. See [NOTICE.md](NOTICE.md) for what comes from claude-mem.
