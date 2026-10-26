# 20. claude-mem feature matrix

Research date: 2026-10-26. claude-mem version: 15.2.1 (package.json), latest commit `1ef0875`, 2026-10-26T10:13:57Z.
Repository: 103,244 stars, 9,115 forks, 95 open issues, Apache-2.0, TypeScript (`api.github.com/repos/thedotmack/claude-mem`, fetched 2026-10-26).

Sources read for this document:

- All 54 pages listed in `https://docs.claude-mem.ai/sitemap.xml`, fetched as `https://docs.claude-mem.ai/llms-full.txt`.
- `README.md`, `package.json`, `CHANGELOG.md` path, `.github/`, `plugin/`, `docs/` from the repository tree (`api.github.com/repos/thedotmack/claude-mem/git/trees/main?recursive=1`).
- The prior inventory in [11](11-feature-inventory.md), checked against the current source tree. Where the two disagree, the current tree wins and the row says so.

Status vocabulary, applied to **this repository today** (not the plan):

- **parity**: the behaviour exists and is exercised by the test suite.
- **partial**: some behaviour exists; the named difference is real.
- **missing**: not built.
- **better**: this repository does more, and the difference is visible in code or tests.
- **out-of-scope**: paid, hosted, or meaningless without the upstream account system.

Every Aletheia cell cites the code that decides the status. Every gap points at a task in [TASKS.md](tasks/TASKS.md).

## 20.1 Capture

| ID | Feature | What it does (one sentence) | Source | Paid or free | Aletheia status | Gap task |
|---|---|---|---|---|---|---|
| F-C01 | Five lifecycle hooks | Runs SessionStart, UserPromptSubmit, PostToolUse, Stop and SessionEnd handlers so capture needs no manual step. | https://docs.claude-mem.ai/architecture/hooks | Free | **missing**. `capture` takes one payload from stdin; no hook is installed (`src/hub/capture.mjs:45`). | T-058 |
| F-C02 | Hook installer for Claude Code | Registers the hook commands in Claude Code's plugin settings. | https://docs.claude-mem.ai/installation | Free | **missing**. The CLI has no `install` command (`bin/aletheia.mjs`). | T-058 |
| F-C03 | Per-tool payload adapters | Normalises Claude Code, Codex, Cursor, Kimi, Windsurf, Antigravity and raw payload shapes. | `src/cli/adapters/` (repo tree) | Free | **partial**. One normaliser understands Claude-style and generic shapes only (`src/hub/capture.mjs:45`). | T-059 |
| F-C04 | Transcript watcher | Ingests session files for tools that have no hooks. | https://docs.claude-mem.ai/architecture/overview | Free | **missing**. No watcher. | T-063 |
| F-C05 | Secret redaction | Replaces 12 vendor key patterns plus optional generic credentials before storage. | https://docs.claude-mem.ai/usage/auto-redaction | Free | **better**. 15 patterns, redaction always on, not opt-in (`src/hub/capture.mjs:8-24`). | — |
| F-C06 | `<private>` tags | Drops any block wrapped in `<private>...</private>` entirely. | https://docs.claude-mem.ai/usage/private-tags | Free | **parity**. Whole block replaced with `[private]` (`src/hub/capture.mjs:24`). | — |
| F-C07 | Excluded projects | Skips capture for named checkouts. | https://docs.claude-mem.ai/configuration | Free | **missing**. No exclusion setting (`src/config.mjs`). | T-016 |
| F-C08 | Skip rules | Skips named tools, Bash patterns and subagent types. | https://docs.claude-mem.ai/configuration | Free | **partial**. Fixed skip set for noisy tools only (`src/hub/capture.mjs:33`). | T-059 |
| F-C09 | Remote and spooled capture | Accepts hook events over an authenticated spool when hooks and worker are on different hosts. | https://docs.claude-mem.ai/configuration | Free | **missing**. | T-062 |
| F-C10 | Session rows and state machine | Tracks a session from start to summary so events, prompts and tool uses share an id. | https://docs.claude-mem.ai/architecture/database | Free | **missing**. One `memories` table, a nullable `session_id` (`src/hub/store.mjs:42`). | T-017 |
| F-C11 | Advisor-call capture | Records Claude Code advisor tool calls even though they never fire PostToolUse. | https://docs.claude-mem.ai/configuration | Free | **missing**. | — |
| F-C12 | Compaction-safe context | Re-injects memory after a context compaction. | https://docs.claude-mem.ai/kimi-integration | Free | **missing**. | T-059 |

## 20.2 Compression (raw activity to durable memory)

| ID | Feature | What it does (one sentence) | Source | Paid or free | Aletheia status | Gap task |
|---|---|---|---|---|---|---|
| F-M01 | Observer agent | Turns queued activity into observations with an LLM. | https://docs.claude-mem.ai/architecture/overview | Free (you pay your model) | **partial**. `compress` writes observations through `claude-cli` or any OpenAI-compatible endpoint (`src/hub/compress.mjs:46`). No queue, no observer service. | T-020 |
| F-M02 | Observation types | Classifies memory as bugfix, feature, refactor, change, discovery, decision or gotcha. | https://docs.claude-mem.ai/architecture/database | Free | **parity**. Same seven types (`src/hub/compress.mjs:9`). | — |
| F-M03 | Session summaries | Writes a per-session request / investigated / learned / completed / next-steps record. | https://docs.claude-mem.ai/architecture/database | Free | **missing**. The importer reads summaries; nothing generates them (`src/hub/importers.mjs:36`). | T-032 |
| F-M04 | Strict output validation and retry | Rejects malformed model output and retries once with the error. | https://docs.claude-mem.ai/architecture/hooks | Free | **parity**. `validateObservations` plus one retry (`src/hub/compress.mjs:18,53`). | — |
| F-M05 | Provider routing | Chooses Claude, Codex, Gemini, OpenRouter or OpenAI-compatible per installation. | https://docs.claude-mem.ai/configuration | Free (you pay your model) | **partial**. `none`, `claude-cli`, `openai` only (README configuration table; `src/refresh/providers.mjs`). | T-034 |
| F-M06 | Quota fallback and key pools | Switches provider when a plan is spent and rotates several API keys. | https://docs.claude-mem.ai/usage/quota-fallback | Free for the mechanism; model usage paid | **missing**. | T-036 |
| F-M07 | Modes | Switches extraction behaviour and output language. | https://docs.claude-mem.ai/modes | Free | **missing**. | T-034 |
| F-M08 | Mode languages | Ships 29 language modes in 35 mode files (the 29 languages plus chill, law-study, law-study--chill, email-investigation, meme-tokens, and the base code mode). | `plugin/modes/*.json` (repo tree); https://docs.claude-mem.ai/modes | Free | **missing**. English only. | T-034 |
| F-M09 | Observation batching | Combines queued events from one prompt into a single observer request, with a character budget. | https://docs.claude-mem.ai/configuration | Free | **partial**. `compressRecent` sends up to 120 events in one prompt with no token accounting (`src/hub/compress.mjs:46`). | T-019 |
| F-M10 | Custom Anthropic backends | Sends observer traffic through a compatible gateway or LiteLLM. | https://docs.claude-mem.ai/configuration/custom-anthropic-backends | Free for the mechanism | **partial**. An OpenAI-compatible base URL is supported; no Anthropic-shape gateway path (`README.md`, configuration). | T-034 |
| F-M11 | Cost accounting | Shows token and dollar cost for model calls. | https://docs.claude-mem.ai/configuration | Free | **partial**. A usage log exists; no cost panel (see [15](15-product-spec.md), FR-U5). | T-019 |
| F-M12 | Idle and overnight processing | Continues compression after a session ends and when the machine is idle. | https://docs.claude-mem.ai/architecture/worker-service | Free | **missing**. `compress` runs only when invoked. | T-020 |

## 20.3 Storage and retrieval

| ID | Feature | What it does (one sentence) | Source | Paid or free | Aletheia status | Gap task |
|---|---|---|---|---|---|---|
| F-S01 | SQLite store | Keeps memory in one local SQLite database. | https://docs.claude-mem.ai/architecture/database | Free | **parity**. WAL SQLite (`src/hub/store.mjs:94`). | — |
| F-S02 | FTS5 full-text search | Indexes titles and narratives for keyword search. | https://docs.claude-mem.ai/architecture/database | Free | **parity**. FTS5 with porter stemming and triggers (`src/hub/store.mjs:54`). | — |
| F-S03 | Normalised tables | Separates `sdk_sessions`, `observations`, `session_summaries`, `user_prompts`, `tool_uses`. | https://docs.claude-mem.ai/architecture/database | Free | **missing**. One table with a `kind` column (`src/hub/store.mjs:30-58`). | T-017 |
| F-S04 | Chroma vector index | Stores embeddings in a local Chroma service started through Python/uv. | https://docs.claude-mem.ai/architecture/search-architecture | Free | **partial**. Embeddings live in `memory_vectors` and are scanned in process; no Chroma, no Python (`src/hub/store.mjs:272`, `src/hub/embed.mjs:12`). | — |
| F-S05 | Hybrid search | Blends keyword and semantic results. | https://docs.claude-mem.ai/architecture/search-architecture | Free | **parity**. BM25 + dense fused with RRF (`src/hub/store.mjs:248`; `src/hub/retrieval.mjs:77`). | — |
| F-S06 | Optional local embeddings | Runs an ONNX embedding model on the user's machine. | https://docs.claude-mem.ai/architecture/search-architecture | Free | **better**. The package is optional and starts in-process; no second runtime (`src/hub/embed.mjs:12`). | — |
| F-S07 | Cross-encoder rerank | Reorders the top candidates with a cross-encoder. | Not shipped in claude-mem docs read; this project added it | n/a | **better**. `ms-marco-MiniLM-L-6-v2`, optional (`src/hub/rerank.mjs:6`). Measure still missing from CI: T-054. | T-055 |
| F-S08 | Near-duplicate detection | Detects and merges near-duplicates with TF-IDF cosine. | https://docs.claude-mem.ai/architecture/database | Free | **missing**. Only exact `(project, kind, title, narrative)` de-duplication (`src/hub/store.mjs:135`). | T-028 |
| F-S09 | Reinforcement / ACT-R ranking | Lets re-confirmed observations climb the context window. | https://docs.claude-mem.ai/configuration | Free | **missing**. | T-030 |
| F-S10 | Project merge | Merges one project into another, keeping the destination. | https://docs.claude-mem.ai/usage/my-work | Free | **parity**. `mergeProjects` re-hashes and drops duplicates (`src/hub/store.mjs:316`). | — |
| F-S11 | Three-layer search | Search returns an index, timeline returns context, get_observations returns full text. | https://docs.claude-mem.ai/usage/search-tools | Free | **parity**. Same three MCP tools (`src/hub/mcp.mjs:11-14`). | — |
| F-S12 | Search filters | Filter by project, record type, observation type, name, date range and order. | https://docs.claude-mem.ai/usage/search-tools | Free | **partial**. Project, kind, type, tool; no date range or `orderBy` (`src/hub/store.mjs:208`). | T-008 |
| F-S13 | Pagination | Offset and limit on search results. | https://docs.claude-mem.ai/usage/search-tools | Free | **partial**. `list` paginates; `search` has only a limit (`src/hub/store.mjs:185,208`). | T-008 |
| F-S14 | Dumb search | One-call title match, explicitly less reliable than the three-step flow. | https://docs.claude-mem.ai/usage/search-tools | Free | **missing**. | — |
| F-S15 | Search by file | Finds observations that touched a given file. | https://docs.claude-mem.ai/usage/search-tools | Free | **missing**. `files` is stored but not indexed (`src/hub/store.mjs:40`). | T-036 |
| F-S16 | Semantic prompt injection | Adds prompt-relevant observations at UserPromptSubmit. | https://docs.claude-mem.ai/configuration | Free | **missing**. | T-044 |
| F-S17 | Recency window | Excludes date-less semantic matches older than N days. | https://docs.claude-mem.ai/configuration | Free | **missing**. | T-043 |
| F-S18 | Vector scale strategy | Handles large vector collections through Chroma's index. | https://docs.claude-mem.ai/architecture/search-architecture | Free | **partial**. Brute-force cosine over all vectors (`src/hub/retrieval.mjs:57`); 50k-row result in [14](14-research-ai-memory.md#146-measured-results). | T-047 |
| F-S19 | Additive schema migrations | Migrates old stores without data loss. | https://docs.claude-mem.ai/architecture/database | Free | **partial**. `user_version` 2 rebuilds FTS; no v3 schema yet (`src/hub/store.mjs:12,101`). | T-017 |
| F-S20 | Bulk import and export | Moves memory in and out in a documented format. | https://docs.claude-mem.ai/usage/export-import | Free | **better**. JSONL bundle, Markdown export, claude-mem import (`src/hub/store.mjs:431,492`; `src/hub/importers.mjs:14`). | — |
| F-S21 | Import safety | Validates the export before applying it. | https://docs.claude-mem.ai/usage/export-import | Free | **parity**. Manifest and version check, per-line errors, transaction (`src/hub/store.mjs:454`). | — |
| F-S22 | Data deletion | Deletes a memory and its derived rows. | https://docs.claude-mem.ai/hosted-server | Free local / paid hosted | **parity**. `remove` deletes the row and cascades vectors (`src/hub/store.mjs:178`). | — |
| F-S23 | Tombstones for sync | Keeps deletion records so devices converge. | https://docs.claude-mem.ai/cloud-sync | Paid | **out-of-scope** for local v1; needed for P5. | T-095 |

## 20.4 Context injection

| ID | Feature | What it does (one sentence) | Source | Paid or free | Aletheia status | Gap task |
|---|---|---|---|---|---|---|
| F-X01 | SessionStart context | Injects pinned, recent and rule memory at session start. | https://docs.claude-mem.ai/configuration | Free | **partial**. `store.context` produces Markdown (`src/hub/store.mjs:360`); no hook calls it automatically. | T-059 |
| F-X02 | Observation count setting | Caps how many observations enter the session-start block. | https://docs.claude-mem.ai/configuration | Free | **parity**. `limit` per call, capped at 100 (`src/hub/store.mjs:361`). | — |
| F-X03 | Character/token budget | Stops injection at a size limit. | https://docs.claude-mem.ai/configuration | Free | **partial**. 6,000-character cap, not tokens and not exact (`src/hub/store.mjs:360`). | T-042 |
| F-X04 | Per-project context | Chooses the current checkout or every project. | https://docs.claude-mem.ai/configuration | Free | **partial**. A single `project` filter (`src/hub/store.mjs:360`); no "all projects" mode. | T-016 |
| F-X05 | Subagent exclusion | Keeps subagent step-logs out of main-session context. | https://docs.claude-mem.ai/configuration | Free | **missing**. | T-059 |
| F-X06 | Semantic injection | Adds per-prompt matches to SessionStart context. | https://docs.claude-mem.ai/configuration | Free | **missing**. | T-044 |
| F-X07 | Progressive disclosure | Sends an index first and full text only on request. | https://docs.claude-mem.ai/progressive-disclosure | Free | **parity**. The MCP tool descriptions enforce the order (`src/hub/mcp.mjs:11-14`). | — |
| F-X08 | Folder context files | Generates a `CLAUDE.md` per folder with an activity timeline. | https://docs.claude-mem.ai/usage/folder-context | Free | **missing**. Rules sync writes a managed block, not a generated folder file (`src/hub/rules-sync.mjs:61`). | T-074 |
| F-X09 | File read gate | Blocks whole-file reads of large code files and redirects to outline/search. | https://docs.claude-mem.ai/file-read-gate | Free | **missing**. | T-060 |
| F-X10 | Smart outline / search / unfold | Gives the agent a tree-sitter outline, targeted search and unfolding. | https://docs.claude-mem.ai/file-read-gate | Free | **missing**. | T-060 |
| F-X11 | Work state tools | Lets the agent keep a canonical to-do list in memory. | https://docs.claude-mem.ai/configuration | Free | **partial**. My Work has work state; MCP exposes no `work_state_*` tool (`src/hub/mcp.mjs:11-18`). | T-069 |
| F-X12 | Knowledge agents | Builds queryable corpora ("brains") from observation history. | https://docs.claude-mem.ai/usage/knowledge-agents | Free | **missing**. | T-046 |
| F-X13 | Context preview | Shows the exact block that will be injected. | https://docs.claude-mem.ai/usage/my-work | Free | **missing**. | T-077 |
| F-X14 | Context formatters | Chooses index or narrative format per injected result. | https://docs.claude-mem.ai/configuration | Free | **partial**. One Markdown list format (`src/hub/store.mjs:365`). | T-042 |

## 20.5 UI

| ID | Feature | What it does (one sentence) | Source | Paid or free | Aletheia status | Gap task |
|---|---|---|---|---|---|---|
| F-U01 | My Work view | Cards, goals, rules, build story, evidence and review, from the original built app. | https://docs.claude-mem.ai/usage/my-work | Free | **parity**. The built app is shipped unmodified; the server is a clean re-implementation ([11](11-feature-inventory.md)). | — |
| F-U02 | Live memory stream | Shows new observations in real time over SSE. | https://docs.claude-mem.ai/introduction | Free | **missing**. The Hub Memory page has no live feed. | T-077 |
| F-U03 | Session detail pages | One page per session with observations, summary and prompts. | https://docs.claude-mem.ai/usage/my-work | Free | **missing**. | T-017 |
| F-U04 | TV view | Read-only full-screen observation feed with a token. | https://docs.claude-mem.ai/configuration | Free | **missing**. | — |
| F-U05 | Settings UI | Edits 208 settings from the browser. | https://docs.claude-mem.ai/configuration | Free | **missing**. Environment variables only (`README.md`, configuration). | T-078 |
| F-U06 | Onboarding wizard | Walks a new user through setup. | https://docs.claude-mem.ai/installation | Free | **out-of-scope** for v1; a doctor command is planned instead. | T-075 |
| F-U07 | Memory browser | Search, filter, pin, edit, delete and add notes. | https://docs.claude-mem.ai/usage/my-work | Free | **parity**. Hub Memory page (`src/hub/routes.mjs:123-136`). | — |
| F-U08 | Rules page | Writes once and syncs rules to each tool. | Not in claude-mem docs (this project adds it) | Free | **better**. New surface (`src/hub/rules-sync.mjs`, `src/hub/routes.mjs:144`). | — |
| F-U09 | Tools page | Detects installed tools and previews the MCP connection. | Not in claude-mem docs (this project adds it) | Free | **better**. `detectTools`, `mcpPlan`, `applyMcp` (`src/hub/tools.mjs:33,55,80`). | — |
| F-U10 | Migrate page | Exports a bundle or Markdown and imports claude-mem. | https://docs.claude-mem.ai/usage/export-import | Free | **better**. Bundle + Markdown + claude-mem import (`src/hub/importers.mjs:14`). | — |
| F-U11 | Activity/audit page | Shows who changed what. | Not in claude-mem docs (this project adds it) | Free | **better**. `auditLog` (`src/hub/store.mjs:431` area; route `src/hub/routes.mjs:223`). | — |
| F-U12 | "Why was this recalled" | Shows per-retriever ranks and scores. | https://docs.claude-mem.ai/progressive-disclosure | Free | **missing**. | T-045 |
| F-U13 | Cost panel | Totals model spend. | https://docs.claude-mem.ai/usage/my-work | Free | **missing**. | T-019 |
| F-U14 | Theme toggle | Light and dark themes. | https://docs.claude-mem.ai/architecture-evolution | Free | **partial**. The shipped My Work app has it; the Hub UI has not been audited. | T-090 |
| F-U15 | Accessibility | WCAG AA keyboard and contrast pass. | Not claimed in claude-mem docs | n/a | **partial**. No audit ([15](15-product-spec.md), NFR-9). | T-090 |

## 20.6 Rules

| ID | Feature | What it does (one sentence) | Source | Paid or free | Aletheia status | Gap task |
|---|---|---|---|---|---|---|
| F-L01 | Rule store with scopes | Rules are everywhere, per project or per situation. | https://docs.claude-mem.ai/usage/my-work | Free | **parity**. Three tiers (`src/hub/store.mjs:379`). | — |
| F-L02 | Managed block sync | Writes a marked block into files the user also edits, never touching the rest. | Not in claude-mem docs (this project adds it) | Free | **better**. `applyBlock` / `removeBlock` (`src/hub/rules-sync.mjs:32,42`). | — |
| F-L03 | Per-tool targeting | A rule can name the tools it applies to. | https://docs.claude-mem.ai/usage/my-work | Free | **parity**. `tools` column and filter (`src/hub/store.mjs:397`). | — |
| F-L04 | Nine sync targets | Writes Claude, Codex/AGENTS, Gemini, Cursor, Windsurf, Copilot, Aider and the open AGENTS.md standard. | Not in claude-mem docs (this project adds it) | Free | **better**. `TOOLS` (`src/hub/tools.mjs:19`). Formats for Copilot and Aider are written from docs, not tested on real installs (`README.md`). | T-070 |
| F-L05 | Preview and backup | Shows the before/after and keeps a timestamped backup before writing. | Not in claude-mem docs (this project adds it) | Free | **better**. `syncTool` (`src/hub/rules-sync.mjs:61`). | — |
| F-L06 | Import rules back | Parses rules from an existing file into the store. | https://docs.claude-mem.ai/usage/my-work | Free | **parity**. `parseRulesFromText` (`src/hub/rules-sync.mjs:81`). | — |
| F-L07 | Learned rule suggestions | Suggests rules from corrections using an LLM. | https://docs.claude-mem.ai/usage/my-work | Free (model usage paid) | **partial**. The My Work refresh path does it; it is not wired to captured events (`src/refresh/`). | T-035 |
| F-L08 | Rule hygiene | Detects conflicts, duplicates and bloat. | Not in claude-mem docs | n/a | **missing**. | T-072 |
| F-L09 | MY-RULES.md | Keeps a human-readable rules file. | https://docs.claude-mem.ai/usage/my-work | Free | **parity**. `ALETHEIA_RULES_FILE`, default `MY-RULES.md` (`README.md`). | — |

## 20.7 Integrations

| ID | Feature | What it does (one sentence) | Source | Paid or free | Aletheia status | Gap task |
|---|---|---|---|---|---|---|
| F-I01 | MCP over stdio | Exposes memory to any MCP client. | https://docs.claude-mem.ai/usage/search-tools | Free | **parity**. `serveStdio` (`src/hub/mcp.mjs:103`). | — |
| F-I02 | MCP tool count | claude-mem ships four search tools plus workflow, work-state and corpus tools; the 2025 inventory counted 26. | https://docs.claude-mem.ai/usage/search-tools | Free | **partial**. Seven tools: search, timeline, get_observations, save_memory, session_start_context, list_rules, add_rule (`src/hub/mcp.mjs:11-18`). | T-069 |
| F-I03 | MCP Streamable HTTP | Serves MCP over HTTP with Origin checks and auth. | https://docs.claude-mem.ai/hosted-server | Free local / paid hosted | **missing**. stdio only. | T-067 |
| F-I04 | Protocol negotiation | Accepts several MCP protocol versions. | https://docs.claude-mem.ai/usage/claude-desktop | Free | **parity**. 2025-11-25 through 2024-11-05 (`src/hub/mcp.mjs:8`). | — |
| F-I05 | REST API | Gives scripts and other languages a plain HTTP interface. | https://docs.claude-mem.ai/hosted-server | Free local | **partial**. `/v1/info`, `/memories`, `/search`, `/timeline`, `/observations/batch`, `/context`, `/events` (`src/hub/routes.mjs:80-117`). | T-005 |
| F-I06 | Versioned REST contract | Publishes an OpenAPI document and contract tests. | https://docs.claude-mem.ai/hosted-server | Free local | **missing**. No OpenAPI file. | T-006 |
| F-I07 | API keys and ACLs | Issues per-client keys and per-project access. | https://docs.claude-mem.ai/hosted-server | Paid upstream | **partial**. One optional bearer key for all `/v1` calls (`README.md`). | T-092 |
| F-I08 | Per-tool installers | One command installs hooks, MCP and rules for each tool. | https://docs.claude-mem.ai/platform-integration | Free | **missing**. A registry and config writer exist; no hook installers (`src/hub/tools.mjs:19`). | T-058 |
| F-I09 | Config writer | Writes MCP config with preview and backup. | https://docs.claude-mem.ai/platform-integration | Free | **partial**. Cursor, Gemini, Codex, Windsurf, OpenCode, Claude command (`src/hub/tools.mjs:55,80`); not tested on real installs (`README.md`). | T-058 |
| F-I10 | Claude Code plugin manifest | Ships `.claude-plugin/` so the plugin marketplace can install it. | `plugin/.claude-plugin` (repo tree) | Free | **missing**. | T-066 |
| F-I11 | Codex plugin manifest | Ships `.codex-plugin/`. | `plugin/.codex-plugin` (repo tree) | Free | **missing**. | T-066 |
| F-I12 | Qoder plugin manifest | Ships `.qoder-plugin/` and `qoder.mcp.json`. | `plugin/.qoder-plugin` (repo tree) | Free | **missing**. | T-066 |
| F-I13 | Cursor integration | Hooks plus MCP for Cursor. | https://docs.claude-mem.ai/cursor | Free | **partial**. MCP config only (`src/hub/tools.mjs:23`). | T-061 |
| F-I14 | Cursor Gemini/OpenRouter setup | Documents two non-Claude observer setups for Cursor. | https://docs.claude-mem.ai/cursor/gemini-setup | Free (you pay the model) | **missing**. | T-061 |
| F-I15 | Codex integration | Hooks and MCP for Codex CLI. | https://docs.claude-mem.ai/platform-integration | Free | **partial**. MCP config only (`src/hub/tools.mjs:22`). | T-062 |
| F-I16 | Gemini CLI integration | Hooks and MCP for Gemini CLI. | https://docs.claude-mem.ai/platform-integration | Free | **partial**. MCP config and `GEMINI.md` rules (`src/hub/tools.mjs:24`). | T-064 |
| F-I17 | Windsurf integration | Hooks and MCP, including Devin's moved config path. | https://docs.claude-mem.ai/platform-integration | Free | **partial**. Both config paths handled (`src/hub/tools.mjs:28,60`); no hooks. | T-065 |
| F-I18 | OpenCode integration | Plugin and MCP for OpenCode. | https://docs.claude-mem.ai/platform-integration | Free | **partial**. Config only (`src/hub/tools.mjs:29`). | T-068 |
| F-I19 | OpenClaw integration | Gateway plugin and observation feed. | https://docs.claude-mem.ai/openclaw-integration | Free | **missing**. | — |
| F-I20 | Kimi integration | Hook-based capture plus MCP. | https://docs.claude-mem.ai/kimi-integration | Free | **missing**. | — |
| F-I21 | Hermes integration | Plugin, hosted server and search. | https://docs.claude-mem.ai/hermes-integration | Free | **missing**. | — |
| F-I22 | Antigravity CLI integration | Hooks into `~/.gemini/config/hooks.json`. | https://docs.claude-mem.ai/antigravity-cli/setup | Free | **missing**. | — |
| F-I23 | T3 Code integration | Native hooks and MCP search for T3 Code. | https://docs.claude-mem.ai/t3code-integration | Free | **missing**. | — |
| F-I24 | Qoder integration | CLI and IDE integration. | https://docs.claude-mem.ai/qoder-integration | Free | **missing**. | — |
| F-I25 | Claude Desktop | MCP setup for the desktop app. | https://docs.claude-mem.ai/usage/claude-desktop | Free | **partial**. Any MCP client can use `bin/mcp.mjs`; no documented Desktop setup. | T-076 |
| F-I26 | Grok Bot | Remote observer and bot integration. | https://docs.claude-mem.ai/grok-bot | Free (model usage paid) | **missing**. | — |
| F-I27 | Screenpipe integration | Ingests screen/audio activity. | https://docs.claude-mem.ai/screenpipe-integration | Free | **missing**. | — |
| F-I28 | Notion export | Upserts observations into a Notion database. | https://docs.claude-mem.ai/notion-export | Free (Notion plan may apply) | **missing**. | — |
| F-I29 | Telegram alerts | Sends session wrap-ups to Telegram. | https://docs.claude-mem.ai/modes | Free | **missing**. | — |

## 20.8 Team, cloud and enterprise

| ID | Feature | What it does (one sentence) | Source | Paid or free | Aletheia status | Gap task |
|---|---|---|---|---|---|---|
| F-T01 | Cloud sync | Replicates observations, summaries and prompts across devices through a sync hub. | https://docs.claude-mem.ai/cloud-sync | **Paid** (cmem.ai Pro account; price not stated on the page fetched) | **out-of-scope**. | T-095 |
| F-T02 | TeamBrain | Board, brief and team search beside personal memory. | https://docs.claude-mem.ai/usage/teambrain | Free local / paid hosted | **out-of-scope** for v1. | T-091 |
| F-T03 | Hosted Postgres server | Multi-tenant server with API keys, audit and split workers. | https://docs.claude-mem.ai/hosted-server | **Paid** | **out-of-scope**. | T-091 |
| F-T04 | SSO, RBAC, DLP | Enterprise identity and data-loss controls. | https://docs.claude-mem.ai/hosted-server | **Paid** | **out-of-scope**. | — |
| F-T05 | Free self-hosted sharing | Shares a bundle or a server with a team without a vendor account. | Not in claude-mem docs (this project's plan) | Free | **partial**. Bundle export/import works; no shared server (`src/hub/store.mjs:431`). | T-096 |
| F-T06 | Review queue | Proposes shared memories for approval. | https://docs.claude-mem.ai/usage/teambrain | Paid upstream | **missing**. | T-094 |
| F-T07 | Device identity | Keeps a stable device id for sync. | https://docs.claude-mem.ai/cloud-sync | Paid | **missing**. | T-095 |
| F-T08 | Data export for deletion | Exports and deletes everything on request. | https://docs.claude-mem.ai/hosted-server | Paid upstream | **partial**. Bundle export and per-item delete exist (`src/hub/store.mjs:431,178`); there is no single "delete everything" command. | T-091 |

## 20.9 Operations and evaluation

| ID | Feature | What it does (one sentence) | Source | Paid or free | Aletheia status | Gap task |
|---|---|---|---|---|---|---|
| F-O01 | Worker supervision | Starts, restarts and health-checks a background worker. | https://docs.claude-mem.ai/architecture/worker-service | Free | **partial**. One process plus a systemd unit (`scripts/aletheia.service`); no supervisor. | T-073 |
| F-O02 | `npx ... install / repair / doctor` | Installs, repairs and diagnoses from one CLI. | https://docs.claude-mem.ai/installation | Free | **missing**. | T-073 |
| F-O03 | Docker | Ships an image and compose file. | `Dockerfile.test-installer`, `docker-compose.yml` (repo tree) | Free | **missing**. | T-081 |
| F-O04 | CI tests | Runs the test suite on push. | `.github/workflows/ci.yml` (repo tree) | Free | **partial**. `.github/workflows/test.yml` exists; no matrix, no Windows. | T-014 |
| F-O05 | npm publishing | Publishes the package from CI. | `.github/workflows/npm-publish.yml` (repo tree) | Free | **missing**. Package is not published. | T-080 |
| F-O06 | Windows CI | Runs the suite on Windows. | `.github/workflows/windows.yml` (repo tree) | Free | **missing**. Linux only tested ([15](15-product-spec.md), NFR-8). | T-014 |
| F-O07 | Telemetry | Sends anonymous usage events, on by default and opt-out. | https://docs.claude-mem.ai/telemetry | Free | **better**. No telemetry at all. | — |
| F-O08 | Crash safety | Survives a kill during writes. | https://docs.claude-mem.ai/architecture/database | Free | **partial**. WAL is on (`src/hub/store.mjs:98`); no kill test. | T-009 |
| F-O09 | File permissions | Restricts the database and data directory. | https://docs.claude-mem.ai/troubleshooting | Free | **missing**. No mode set. | T-010 |
| F-O10 | Memory-poisoning defence | Treats recalled text as data, never instructions. | Not in claude-mem docs | n/a | **missing**. The compress prompt says "untrusted data" (`src/hub/compress.mjs:15`); retrieval output is not wrapped or labelled. | T-011 |
| F-O11 | Diagnostics and doctor | Lists worker, DB, hooks and MCP health. | https://docs.claude-mem.ai/troubleshooting | Free | **missing**. | T-073 |
| F-O12 | Retrieval benchmark | Publishes a reproducible retrieval benchmark. | This project's `bench/locomo-retrieval.mjs` | Free | **parity**. Measured, with command and caveats ([14](14-research-ai-memory.md#146-measured-results)). | T-055 |
| F-O13 | Baseline harness | Runs the competitor on the same questions. | This project's `bench/claude-mem-baseline.mjs` | Free | **parity**. Isolated worker. | — |
| F-O14 | Answer-accuracy benchmark | Reports LLM-judged answer accuracy. | https://docs.claude-mem.ai/architecture-evolution (no published number) | Free | **missing**. Not measured ([15](15-product-spec.md), S8). | T-051 |
| F-O15 | Scale benchmark | Reports search time at 50k and 500k rows. | This project's `bench/scale.mjs` | Free | **partial**. 50k measured; 500k not. | T-047 |
| F-O16 | CI regression gate | Fails a change that lowers recall or raises latency. | Not in claude-mem docs | n/a | **missing**. | T-055 |
| F-O17 | Eval datasets beyond LoCoMo | LongMemEval, BEAM, MemoryAgentBench and a code-specific set. | https://docs.claude-mem.ai/architecture-evolution | Free | **missing**. | T-051 |

## 20.10 Repository polish and distribution

| ID | Feature | What it does (one sentence) | Source | Paid or free | Aletheia status | Gap task |
|---|---|---|---|---|---|---|
| F-P01 | Logo and wordmark | Ships light and dark logo variants in the docs assets. | `docs/public/` (repo tree) | Free | **missing**. A favicon exists (`site/favicon.svg`); no README logo. | T-083 |
| F-P02 | README badges | Shows licence, version, Node version and two third-party awards. | `README.md` (repo tree) | Free | **partial**. No badges at all (`README.md`). | T-079 |
| F-P03 | README translations | Ships 32 translated READMEs under `docs/i18n/`. | `docs/i18n/` (repo tree) | Free | **missing**. English only. | T-088 |
| F-P04 | Language switcher | Puts a 32-language switcher under the logo. | `README.md` (repo tree) | Free | **missing**. | T-088 |
| F-P05 | Docs site | Publishes 54 documentation pages. | https://docs.claude-mem.ai/sitemap.xml | Free | **partial**. `site/index.html` plus Markdown docs; no generated docs site (`site/`). | T-086 |
| F-P06 | Sitemap and robots | Publishes `sitemap.xml` and `robots.txt`. | `site/sitemap.xml`, `site/robots.txt` | Free | **partial**. Files exist; the sitemap lists only the home page (`site/sitemap.xml`). | T-086 |
| F-P07 | Structured data | Adds JSON-LD and social metadata. | `site/index.html` | Free | **partial**. Basic meta tags; no JSON-LD (`site/index.html`). | T-086 |
| F-P08 | Issue templates | Bug report and feature request templates. | `.github/ISSUE_TEMPLATE/` (repo tree) | Free | **missing**. | T-084 |
| F-P09 | PR template | Prompts contributors for tests and docs. | Not present in claude-mem tree; standard practice | Free | **missing**. | T-084 |
| F-P10 | Code of Conduct | Sets community behaviour rules. | Not present in claude-mem root tree | Free | **missing**. | T-084 |
| F-P11 | Security policy | Says how to report a vulnerability. | `SECURITY.md` | Free | **parity**. Exists (`SECURITY.md`). | — |
| F-P12 | Contributing guide | Explains setup and the definition of done. | `CONTRIBUTING.md` in claude-mem? Not in root tree | Free | **parity**. Exists (`CONTRIBUTING.md`). | — |
| F-P13 | CHANGELOG | Records every release. | `CHANGELOG.md` (repo tree) | Free | **missing**. | T-085 |
| F-P14 | Release flow | Tags and publishes from CI. | `.github/workflows/npm-publish.yml` | Free | **missing**. | T-085 |
| F-P15 | Dependabot | Keeps dependencies patched. | `.github/` (repo tree; no dependabot file found) | Free | **missing**. | T-085 |
| F-P16 | Funding metadata | Shows a sponsor button. | `.github/FUNDING.yml` | Free | **missing**. | T-085 |
| F-P17 | GitHub topics | Sets discoverable repository topics. | `api.github.com/repos/thedotmack/claude-mem` (topics list) | Free | **partial**. The remote lists 20 topics; this repository lists 12 (`api.github.com/repos/mohamed-ashraf-elsaed/aletheia-mem`, 2026-10-26). | T-085 |
| F-P18 | GitHub Discussions | Hosts questions outside issues. | Not visible in tree | Free | **missing**. | T-085 |
| F-P19 | Demo animation | Shows the product working in the README. | `README.md` (repo tree) | Free | **missing**. | T-083 |
| F-P20 | Social preview image | Sets a repository social card. | Repository settings (not fetched) | Free | **UNVERIFIED**. | T-083 |
| F-P21 | Docker distribution | Offers a container as an install path. | `docker-compose.yml` (repo tree) | Free | **missing**. | T-081 |
| F-P22 | Plugin marketplace entries | Ships manifests for each host's marketplace. | `.claude-plugin/`, `.codex-plugin/`, `.qoder-plugin/`, `.grok-plugin/`, `.cursor-plugin/` (repo tree) | Free | **missing**. | T-066 |
| F-P23 | MCP registry listing | Lists the server in the official MCP registry and directories. | https://registry.modelcontextprotocol.io | Free | **missing**. | T-082 |
| F-P24 | Awesome-list mentions | Appears in curated lists. | https://github.com/hesreallyhim/awesome-claude-code | Free | **missing**. | T-082 |

## 20.11 Counts

| Status | Rows |
|---|---:|
| parity | 24 |
| partial | 41 |
| missing | 79 |
| better | 12 |
| out-of-scope | 6 |
| unverified | 1 |
| **Total** | **163** |

Row with `UNVERIFIED` (F-P20) is a repository *setting* that cannot be read from the code tree; they are listed in [unverified.md](tasks/unverified.md).

## 20.12 The 20 most valuable gaps, ranked

Ranking rule: a gap moves the product's measurable claims, its honesty, or its installability. Cosmetic gaps are last.

| Rank | Gap | Task | Why it is worth doing first |
|---:|---|---|---|
| 1 | Answer accuracy is not measured | T-051 | Every quality claim today is retrieval-only; without an LLM-judged number the project cannot honestly say memory helps answers. |
| 2 | No hook installer for any tool | T-058 | The product's core promise, automatic capture, is absent on a real install. |
| 3 | No automatic SessionStart injection | T-059 | Context must be pulled by hand today, so the "un-forgetting" loop is incomplete. |
| 4 | Fact extraction from raw events is missing | T-018 | The measured +8.4-point gain used dataset facts; without extraction the product cannot reproduce it. |
| 5 | No cycle test for kill -9 | T-009 | A local memory that can corrupt is worse than no memory; the claim is currently untested. |
| 6 | No OpenAPI and no route contract tests | T-006 | The REST API is a public interface; undocumented drift breaks every integration. |
| 7 | Unverified tool config formats | T-055 | `src/hub/tools.mjs` says its formats are unverified; shipping them without a real install is a support debt. |
| 8 | No 50k-row latency fix | T-047 | The published target is p95 ≤ 50 ms; measured p95 is 124–185 ms. |
| 9 | No token-budget packer | T-042 | Injection is capped by characters, not tokens, so cost per session is not controlled. |
| 10 | No memory-poisoning wrapper | T-011 | Memory is attacker-writable through any captured log; recalled text must be labelled as data. |
| 11 | No near-duplicate merge | T-028 | Exact-hash dedup only; repeated observations will inflate the store and dilute ranking. |
| 12 | No bi-temporal facts | T-024 | Knowledge updates are a named LongMemEval ability and a documented gap. |
| 13 | No entity layer | T-021 | Multi-hop questions are the weakest LoCoMo category for every system measured. |
| 14 | No performance regression gate | T-054 | Nothing stops a future change from silently losing the measured advantage. |
| 15 | No i18n READMEs | T-073 | claude-mem's 32 translations are a real reach mechanism; this is cheap and honest to copy in structure. |
| 16 | No issue/PR templates or Code of Conduct | T-072 | Contributors cannot file a reproducible bug; this blocks outside help. |
| 17 | No Docker image | T-079 | The easiest "try it without installing Bun" path is absent. |
| 18 | No package publication | T-078 | `npx aletheia` cannot work; the README already tells users to clone. |
| 19 | No entity/graph retrieval channel | T-048 | The strongest published systems all add graph traversal; it is the next retrieval lever after rerank. |
| 20 | No MCP registry or awesome-list listing | T-080 | Discovery is zero outside the repository; both routes have explicit, fetchable submission rules. |

## 20.13 What claude-mem does better, stated plainly

Even after the gaps above are closed, four things stay hard:

1. **Breadth of installers.** Nine first-party harnesses with tested hook paths (`https://docs.claude-mem.ai/platform-integration`). Matching this is weeks of per-tool verification, not one adapter.
2. **A real observer service.** Queueing, batching, quota fallback, provider routing and idle processing are a product, not a prompt (`https://docs.claude-mem.ai/architecture/worker-service`).
3. **Modes and translations.** 35 mode files and 32 README translations are distribution work that compounds.
4. **An installed base.** 103,244 stars means its issue reports are a free test corpus. Aletheia has none.

The honest counter-position is not "we do everything they do". It is: one local store, no telemetry, no second runtime, rules written into every tool's own file, and a benchmark anyone can rerun. That is the claim [21](21-competitor-landscape.md) tests against the rest of the market.
