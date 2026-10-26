# Aletheia

**Un-forgetting for AI tools.** Free, local, one memory and one set of rules for every tool you use.

Aletheia (Greek *a-lethe*, "not forgetting") is a memory and rules hub for AI coding tools, built around a
re-implementation of claude-mem's "My Work" view.

Two parts that share one server:

1. **My Work** (`/`): claude-mem's request cards, goals, rules and build story. The UI is the original's built app,
   unmodified; the server is a clean re-implementation checked against the live original (identical JSON on the same data).
2. **Memory Hub** (`/hub`): a store that **any** tool can read and write, with a UI to manage it.
   - **Memory**: search, filter, pin, edit, delete, add notes. Observations, summaries, prompts, raw events.
   - **Rules**: write once, **sync into** `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules`, `.windsurfrules`,
     Copilot and Aider files. Preview, backup, never touches your own text. Import rules back from a file.
   - **Tools**: detect installed tools, connect each to the memory over MCP (preview, backup, then write).
   - **Migrate**: export a versioned bundle or Markdown, import a bundle, import from claude-mem. Idempotent.
   - **Activity**: audit log of every change.

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

## Which tools it works with

Aletheia does not depend on any one tool. It speaks the open MCP protocol (stdio), a plain REST API and a CLI, and it
writes the instruction file each tool already reads. What has and has not been checked:

| Check | Result |
|---|---|
| MCP server against the official MCP SDK client | Passes (protocol versions 2025-11-25 to 2024-11-05) |
| Config formats for Cursor, Gemini CLI, Codex CLI, Windsurf, OpenCode, Claude Code | Written from each tool's documentation |
| Rules files: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, `.windsurfrules`, Copilot, Aider | Written and tested in temp folders |
| Any of the above **on a real install of that tool** | **Not tested yet.** Reports welcome. |
| Automatic capture through a tool's hooks | Not built. `aletheia capture` takes one hook payload by hand. |

## Quick start

```bash
cd aletheia-mem   # after: git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
bun test                              # 115 tests, ~2 s
bun bin/aletheia-server.mjs                 # http://localhost:37790  (My Work)  and  /hub  (Memory Hub)
```

Bring your claude-mem memory into the hub (read-only, repeatable):

```bash
bun bin/aletheia.mjs import claude-mem
bun bin/aletheia.mjs search "retry"
```

Give any tool the same memory:

```bash
bun bin/aletheia.mjs tools                          # what is installed, and how each connects
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
ALETHEIA_PROVIDER=claude-cli bun bin/aletheia-server.mjs      # My Work refresh (grouping, reviews, goals, story)
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
| `CLAUDE_MEM_DB` | `~/.claude-mem/claude-mem.db` | claude-mem's database (read-only; My Work and the importer). |
| `ALETHEIA_LEDGER_DIR` | `<data dir>/ledger` | My Work refresh output. Point at `~/.claude-mem/work-view` to share the original's. |
| `ALETHEIA_RULES_FILE` | `<data dir>/MY-RULES.md` | My Work's rules file. |
| `ALETHEIA_CLAUDE_MD` | `~/.claude/CLAUDE.md` | Where "Load in Claude Code" appends an `@` line. |
| `ALETHEIA_PROVIDER` | `none` | `none`, `claude-cli` or `openai`. |
| `ALETHEIA_OPENAI_BASE_URL`, `_API_KEY`, `_MODEL` | OpenRouter URL, empty, empty | For `openai`, and for human copy. |
| `ALETHEIA_AUTO_REFRESH`, `ALETHEIA_REFRESH_CHECK_MS` | `true`, `600000` | My Work refresh scheduling. |
| `ALETHEIA_BUG_COMPAT` | off | `1` reproduces the original's empty observation half ([F1](docs/08-findings.md)). |
| `ALETHEIA_TOOL`, `ALETHEIA_CWD` | | MCP server: names the calling tool and default project. |

## Layout

```
bin/            aletheia-server.mjs (server)  aletheia.mjs (CLI)  mcp.mjs (MCP server)  ledger.mjs (My Work ledger CLI)
src/
  server.mjs app.mjs source.mjs config.mjs humancopy.mjs      My Work server
  readmodel/ ledger/ refresh/ store/ http/                     My Work internals
  hub/            store (memories, FTS5, rules, bundles)  rules-sync  tools  importers  capture  compress  mcp  routes
public/         the original's built My Work app (unmodified)
public-hub/     Memory Hub UI (plain ES modules, no build)
prompts/ vendor/ the original's skill prompts and Python scripts
test/           103 tests and a synthetic fixture database
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
