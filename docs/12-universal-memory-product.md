# 12. The product: free, any AI tool, easy to leave

## 12.1 The honest starting point

claude-mem's core is already free (Apache-2.0) and already supports many tools ([11](11-feature-inventory.md#111-corrections-to-common-assumptions)).
What it charges for is **hosted compute and team features**. So "free and works with any tool" is a fine goal but
**not a differentiator on its own**. A differentiator has to be something a user feels in the first ten minutes
and the original does not do. These are the candidates, ordered by how defensible they are:

| # | Differentiator | Why it is real | Built? |
|---|---|---|---|
| 1 | **Tool-neutral store with a published format.** Memory is rows in one file with a versioned export bundle, not state inside one tool. | Leaving costs one command. Lock-in is the main fear of anyone who builds a memory habit. | Yes: bundle, markdown, claude-mem import. |
| 2 | **Rules written once, synced to every tool**, with preview, backup, and import back. | Each tool has its own instruction file (`CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules`, `.windsurfrules`, Copilot, Aider). People keep them in sync by hand. The original has no sync. | Yes, nine targets. |
| 3 | **No account, no telemetry, no cloud, ever.** Loopback only, read-only on your other tools' data. | The original's telemetry is opt-out. For secret-adjacent data (prompts, tool output) that matters. | Yes. |
| 4 | **Local models for compression.** Any OpenAI-compatible endpoint, so Ollama or LM Studio work. | The original's "free" path still spends your Anthropic plan unless you pay for hosted processing. | Yes (`openai` provider), not tested against a local model. |
| 5 | **Self-hosted team sharing** (export, review, import; later a shared server). | The original reserves team sync as the paid feature. | Manual only (bundle). The server is not built. |

Not a differentiator: "also works with Cursor/Codex/Gemini". The original does.

## 12.2 Shape of the product

```
 any tool ──hook / MCP / REST──► capture (redact) ──► hub.db ◄── Hub UI (memory, rules, tools, migrate)
                                         │               │
                                  compress (any model)   ├── rules ──sync──► CLAUDE.md AGENTS.md GEMINI.md .cursor/rules ...
                                                         ├── export ──► bundle (.jsonl) / markdown
                                                         └── context ──► session-start text for any tool
 claude-mem DB ──import (read-only)──► hub.db
 My Work (claude-mem's view, same app) reads claude-mem's DB and its ledger
```

Interfaces a tool can use, from easiest to most integrated:

1. **Paste**: Markdown export or `aletheia context` output into any chat.
2. **Command**: `aletheia capture` on a hook, `aletheia search`, `aletheia save` (shell scripts, CI).
3. **MCP**: `bin/mcp.mjs` (search, timeline, get_observations, save_memory, session_start_context, rules).
4. **REST**: `/v1/*` on loopback, optional bearer key.
5. **Files**: rules synced into the tool's own instruction file.

## 12.3 Migration, concretely

| From / to | How | State |
|---|---|---|
| claude-mem to hub | `aletheia import claude-mem` (observations, summaries, prompts; read-only; repeatable) | Done, tested |
| hub to hub, backup, share with a teammate | `aletheia export` then `aletheia import bundle` (idempotent) | Done, tested |
| hub to any chat | `aletheia export --format markdown` | Done |
| rules: tool A to tool B | `aletheia rules import --tool A`, then `aletheia rules sync --tools B` | Done, tested |
| ChatGPT, Claude.ai, Cursor "memories" | These live in vendor accounts. No supported export API was verified. A paste importer (one memory per line) is the honest minimum. | Not built |
| Mem0, Zep, Letta, Obsidian | Each needs a reader for its format. | Not built, not researched |

## 12.4 What would make it fully managed (ordered by value)

1. **Per-tool setup that works in one command** (`aletheia install <tool>`: connect MCP, add the capture hook, sync rules).
   Today: `aletheia connect` and rule sync exist; hooks do not.
2. **Session pages and a live feed** in the Hub (the original viewer's best feature).
3. **A settings page** (provider, models, excluded projects, redaction patterns, skip rules).
4. **Semantic search** with a small local embedding model (SQLite plus a vector extension, no Chroma).
5. **Summaries and tier routing** in `compress`.
6. **Smart file read** (outline and unfold) as MCP tools: large token savings, independent of memory.
7. **Knowledge corpora** (build a queryable brain from a project's memories).
8. **A small shared server** for teams (bearer keys, per-project access, audit), kept simple.
9. **Modes and languages**.

## 12.5 Risks to the "free" promise

- **Compute is not free.** Free software with a paid model behind it is not free to run. Offer local-model
  defaults and show the cost of each compress run before it runs.
- **Maintenance is the real cost.** Tool config formats change; the registry in `src/hub/tools.mjs` is
  **UNVERIFIED** against each tool's current release (it was written from documented conventions, not tested against
  live installs). Each connector needs an owner and a test per release.
- **Upstream moves.** claude-mem ships constantly. Compatibility with its database is a moving target; the
  importer reads a handful of columns defensively, but a schema change can break it silently (see finding F1
  for how that happened upstream).
- **Trademarks.** Do not use "claude-mem", "Claude" or "CMEM" in the product name or marks. Apache-2.0 licenses code,
  not names (`docs/license.md`).
- **Funding.** Not decided; the project is free and has no token.

## 12.6 Built and verified in this iteration

`bun test`: 103 pass. New: store and search (BM25, prefix, filters, pins, timeline, merge, context), bundles
(round trip, idempotent import, version check), rules sync (managed block, idempotent, preview, backup, nine
targets, import back), tool registry (detect, JSON/TOML connect with backup, refusal on invalid JSON),
capture (redaction, normalisation), MCP (protocol, 3-layer flow across two tools, stdio end to end), claude-mem
import, compress (strict validation, retry, watermark), HTTP (`/v1`, hub routes, guards, UI served, no raw markup
insertion). Browser: Hub loaded with 756 imported rows (697 observations, 36 summaries, 23 prompts) from the live claude-mem database; Memory and Tools pages
rendered. **Not tested:** the connectors against real installs of any tool; Connect was not clicked on this machine.
