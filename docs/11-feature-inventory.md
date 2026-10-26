# 11. Feature inventory: claude-mem vs this project

Source: a shallow clone of https://github.com/thedotmack/claude-mem at commit `abd9aaa` (2026-10-25, version
15.2.0): 160 000 lines of TypeScript under `src/`, plus `docs/`, `plugin/`, `skills/`. Every row below names where
it lives in the repo. Status is **this project, today**:

- **Done**: same behaviour, tested.
- **Partial**: a working version with named differences.
- **Missing**: not built.
- **Out of scope**: paid, cloud, or meaningless without the vendor's account system.

## 11.1 Corrections to common assumptions

| Assumption | What the repo says |
|---|---|
| "The repo is paid." | The code is **Apache-2.0** (`LICENSE`, `docs/license.md`). Memory engine, server, CLI, SDKs, adapters, MCP tools, schemas, reference knowledge agents are open. **Paid or reserved** (`docs/ip-boundary.md`): hosted cloud ("Magic Recall"), team/org sync, admin dashboard, SSO/SAML/SCIM, enterprise RBAC and audit UI, DLP, premium knowledge agents, managed evals, support. The README's "CMEM Pro" is hosted memory processing with a 30-day free trial; without it memory falls back to your own Anthropic plan. |
| "It only works with Claude." | It already ships installers or adapters for Claude Code, Codex CLI, Cursor, Windsurf, Gemini CLI / Antigravity, Kimi, OpenCode, Pi, Hermes, OpenClaw, OMP, DeepSeek harness, T3 Code and Grok bot (`src/services/integrations/`, `src/cli/adapters/`). "Works with any tool" is therefore not a differentiator by itself. See [12](12-universal-memory-product.md) for what is. |
| "It has no telemetry." | It has: anonymous events to PostHog, **on by default** (opt-out), off with `DO_NOT_TRACK` or `CLAUDE_MEM_TELEMETRY=0` (`src/services/telemetry/consent.ts`). |

## 11.2 Capture

| Feature | Source | Status |
|---|---|---|
| Lifecycle hooks: Setup, SessionStart, UserPromptSubmit, PreToolUse, PostToolUse, Stop, SubagentStop, SessionEnd | `plugin/hooks/hooks.json`, `src/cli/handlers/*` (context, file-context, file-edit, memory-search, observation, post-compact, session-end, session-init, subagent-stop, summarize, user-message) | **Partial.** `aletheia capture` takes one hook payload from any tool (prompts and tool events; secrets and `<private>` removed). No hook installer, no PreToolUse, no file-read gate, no compaction handling. |
| Per-tool payload adapters | `src/cli/adapters/` claude-code, codex, cursor, kimi, windsurf, antigravity-cli, raw | **Partial.** One tolerant normaliser for Claude-style and generic payloads. |
| Transcript watcher (ingest Codex etc. from session files) | `src/services/transcripts/` | **Missing.** |
| Redaction of secrets, `<private>` stripping, excluded projects | `src/utils/redaction.ts`, `tag-stripping.ts`, `CLAUDE_MEM_REDACT_*`, `CLAUDE_MEM_EXCLUDED_PROJECTS` | **Partial.** Redaction and `<private>` done; no excluded-projects setting. |
| Skip rules (tools, bash patterns, agent types) | `CLAUDE_MEM_SKIP_*` | **Partial.** A fixed skip list for noisy tools. |
| Remote / spooled capture, queue engines (Redis) | `HookSpoolRoutes`, `src/server/queue/` | Missing. |

## 11.3 Compression (raw activity to durable memory)

| Feature | Source | Status |
|---|---|---|
| Observer agent writes observations and summaries with Claude, Gemini, OpenRouter, OpenAI-compatible, Codex | `src/services/worker/*Provider.ts`, `ResponseProcessor.ts` | **Partial.** `compress` writes observations (not summaries) through `claude-cli` or any OpenAI-compatible endpoint (local models work), with strict validation and one retry. |
| Tier routing, quota fallback, rate limits, key pools | `CLAUDE_MEM_TIER_*`, `QUOTA_*`, `api-key-pool.ts` | Missing. |
| Modes and 30+ languages for generated memory | `plugin/modes/*.json` (35 files) | Missing. |

## 11.4 Storage and search

| Feature | Source | Status |
|---|---|---|
| SQLite: sessions, observations, summaries, prompts, tool uses, FTS5 | `src/services/sqlite/` | **Partial.** One `memories` table (kind: observation, summary, prompt, note, event) with FTS5 and triggers. No separate session or tool-use tables. |
| Chroma vector search, hybrid ranking, semantic injection | `src/services/sync/Chroma*.ts`, `worker/search/`, `CLAUDE_MEM_CHROMA_*` | **Partial.** Local ONNX embeddings (optional package), brute-force cosine, reciprocal-rank fusion with BM25, optional cross-encoder rerank, fact-key indexing. No Chroma, no Python. Measured against claude-mem in [14](14-research-ai-memory.md#146-measured-results). No semantic *injection* at session start yet. |
| 3-layer search flow (search, timeline, get_observations) | `src/servers/mcp-server.ts`, `SearchRoutes.ts` | **Done** (MCP tools and `/v1`). |
| Search by file, context preview, dumb-search, by-query timeline | `SearchRoutes.ts` | Missing. |
| Near-duplicate detection (TF-IDF cosine), reinforcement scoring | `src/services/dedup/`, `reinforcement/` | **Partial.** Exact-content de-duplication only. |
| Project merge | `DataRoutes.ts` `/api/projects/merge` | **Done.** |
| Bulk import / export | `/api/import`, `src/services/memory/ingest.ts` | **Done, and wider:** versioned bundle, markdown, claude-mem import. |

## 11.5 Context injection and file intelligence

| Feature | Source | Status |
|---|---|---|
| SessionStart context generator (token budget, sections, formatters, per-type and per-project config) | `src/services/context/` | **Partial.** `aletheia context`, `/v1/context`, MCP `session_start_context`: pinned, recent, rules, size cap, per-tool rule filter. |
| Folder `CLAUDE.md` / `AGENTS.md` generation | `claude-md-utils.ts`, `agents-md-utils.ts` | Missing. |
| Smart file read: tree-sitter outline, search, unfold; file-read gate | `src/services/smart-file-read/`, MCP `smart_outline/search/unfold` | **Missing.** |

## 11.6 UI

| Surface | Source | Status |
|---|---|---|
| **My Work**: cards, list, by agent, goals, rules, build story, evidence, review, subagent control | `src/ui/my-work/` (116 files, React + Tailwind + shadcn) | **Done.** Same built app, same API, 0 diff. |
| **Classic viewer**: live feed, observation / summary / prompt / session cards, session detail page, category filter, delete, context settings modal with terminal preview, logs modal, theme toggle, welcome card | `src/ui/viewer/` (20 components, 8 hooks), `ViewerRoutes.ts`, `/stream` | **Partial.** Hub **Memory** page: search, five filters, pin, edit, delete, new note, pagination. No session pages, no live feed, no context preview, no logs modal. |
| **TV view** (`/tv`) | `ViewerRoutes.ts`, `CLAUDE_MEM_TV_TOKEN` | Missing. |
| Settings UI (208 keys) | `SettingsRoutes.ts`, `SettingsDefaultsManager.ts` | **Missing.** Config is environment variables ([README](../README.md)). |
| Onboarding / setup wizard | `src/ui/my-work/src/setup/` | Out of scope. |

New in this project (not in the original): Hub **Rules** (write once, sync to nine tools, preview, backup, import back), **Tools** (detect, MCP connect with backup), **Migrate** (bundle, markdown, claude-mem import), **Activity** (audit log).

## 11.7 Rules

| Feature | Source | Status |
|---|---|---|
| My Rules: learned suggestions, approve, edit, turn off, replace, dismiss, scopes, `MY-RULES.md`, "Load in Claude Code" | `my-rules.mjs`, `WorkViewRoutes.ts` | **Done** (in My Work). |
| Rules synced to other tools | not in claude-mem | **New, done:** `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, `.windsurfrules`, `copilot-instructions.md`, `CONVENTIONS.md`; managed block, never touches your text. |

## 11.8 Integrations

| Feature | Source | Status |
|---|---|---|
| MCP server (26 tools: search, timeline, get_observations, save_memory, smart_*, corpus tools, work_state, team_*, observation_*) | `src/servers/mcp-server.ts` | **Partial:** 7 tools (search, timeline, get_observations, save_memory, session_start_context, list_rules, add_rule). |
| Per-tool installers (hooks, plugins, config) | `src/services/integrations/*Installer.ts`, `cursor-hooks/`, `claude-mem-cursor/`, `openclaw/`, `pi/`, `hermes/`, `omp/` | **Missing as installers.** MCP connect writes config for Cursor, Gemini CLI, Windsurf, Codex, OpenCode; Claude Code gets a command. |
| Generic REST API (`/v1`: projects, sessions, events, memories, search, timeline, context, audit) | `src/server/routes/v1/` (SQLite and Postgres) | **Partial:** `/v1/memories`, `/search`, `/timeline`, `/observations/batch`, `/context`, `/events`, `/info`. No projects/sessions/jobs/audit routes, no API keys per client. |
| Telegram alerts and wrap-ups; Grok bot; CCS align | `TelegramNotifier.ts`, `GrokBot*.ts`, `CcsAlign*.ts` | Missing. |

## 11.9 Team, cloud, enterprise

| Feature | Source | Status |
|---|---|---|
| Server-beta: Postgres, BullMQ, multi-tenant, API keys, audit chains, split workers | `src/server/`, `src/storage/postgres/`, `docs/server-architecture-and-team-vision.md` | Out of scope here (reserved or beta upstream). |
| TeamBrain (board, brief, team search) | `TeamBrainRoutes.ts` | Out of scope. A bundle shared by hand is the free equivalent. |
| Cloud sync, CMEM Pro, billing, devices | `CloudSync*.ts`, `CLAUDE_MEM_PRO_*` | Out of scope. |
| SSO, RBAC, DLP, admin | `docs/ip-boundary.md` (reserved) | Out of scope. |

## 11.10 Operations

| Feature | Source | Status |
|---|---|---|
| Supervisor, process registry, health, graceful shutdown, idle exit, doctor, restart | `src/supervisor/`, `src/services/infrastructure/`, `/api/admin/*` | Missing (single process, systemd unit provided). |
| `npx claude-mem install / repair / doctor` | `src/npx-cli/` | Missing. |
| Docker | `Dockerfile.test-installer`, `docker/` | Missing. |
| Evals, ragtime batch runner, price-history datasets | `evals/`, `ragtime/`, `docs/expense-pricing/` | Out of scope. |

## 11.11 Honest summary

Roughly: **My Work is complete; the memory engine is a small, correct core**; and the parts that make the original
"fully managed" (vector search, observer pipeline with routing, per-tool installers, settings UI, viewer
session pages, smart file read, knowledge agents, modes) are **not built**. [12](12-universal-memory-product.md) orders
them by value.
