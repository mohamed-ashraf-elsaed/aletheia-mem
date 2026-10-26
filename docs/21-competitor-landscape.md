# 21. Competitor landscape

Research date: 2026-10-26. Every star count, licence, language and last-commit date below comes from
`api.github.com/repos/<owner>/<repo>` fetched on that date; every README claim comes from the repository's
README fetched the same day. Registry versions come from `pypi.org/pypi/<package>/json` or
`api.npmjs.org/downloads/point/last-month/<package>`.

Two rules for this document:

1. **Vendor numbers are labelled.** A number a project publishes about itself is `vendor-claimed`, even when it is
   in a paper. No vendor number is repeated without its conditions, and where conditions are not published the cell
   says so. Numbers measured by this project are `measured-by-us` and point at
   [14](14-research-ai-memory.md#146-measured-results).
2. **`UNVERIFIED` is a result.** Where a page could not be fetched or a README does not state a fact, the cell says
   `UNVERIFIED` and the fetch failure is in [research-log.md](tasks/research-log.md). Nothing here is filled from memory.

## 21.1 What counts as a competitor

Included if it does at least one of these: stores memory for AI agents, injects rules/context into coding tools,
or exposes a memory server over MCP. Excluded: generic RAG frameworks with no memory abstraction, vector databases,
and note-taking apps. The list is deliberately wider than the "usual six" because the coding-agent memory niche now
has many small projects with real adoption.

## 21.2 Inventory

Stars and last commit are dated 2026-10-26. "Local" means a normal user can run the core memory store on their own
machine; it does not mean every feature works offline.

| # | Project | Repo / site | Licence | Language | Storage | Retrieval | Tools supported | Capture method | Local | Price | Stars / last commit |
|---:|---|---|---|---|---|---|---|---|---|---|---|
| 1 | claude-mem | thedotmack/claude-mem | Apache-2.0 | TypeScript | SQLite + Chroma (Python/uv) | FTS5 + Chroma hybrid, 3-layer MCP | Claude Code, Codex, Cursor, Windsurf, OpenCode, OpenClaw, Antigravity CLI, Kimi, Hermes (docs) | 5 lifecycle hooks | Yes | Free OSS; cloud sync/TeamBrain paid (price not on page fetched) | 103,244 / 2026-10-26 |
| 2 | Mem0 | mem0ai/mem0 | Apache-2.0 | Python | Vector DB (Qdrant in examples) plus optional graph | Vector + graph + temporal ranking | Any app via SDK; MCP for Claude, Codex, Cursor, Windsurf, VS Code, OpenCode | SDK/API/MCP | Yes (OSS) | Free OSS; paid platform (price UNVERIFIED) | 67,835 / 2026-10-23 |
| 3 | OpenMemory (mem0ai/openmemory) | mem0ai/openmemory | MIT | TypeScript | UNVERIFIED | UNVERIFIED | Claude Code, Codex, OpenCode (README) | CLI/TUI port of sessions | Yes (CLI) | Free OSS | 99 / 2026-07-29 |
| 4 | Supermemory | supermemoryai/supermemory | MIT | TypeScript | Managed engine; local embeddings by default | Claims fact extraction, temporal changes, contradictions, forgetting | Claude Code, Cursor, Codex, OpenCode, Muse Code via plugin/MCP | Plugin, MCP, connectors | Yes (self-host) | Free OSS/self-host; cloud paid (price UNVERIFIED) | 31,401 / 2026-10-25 |
| 5 | Zep | getzep/zep | Apache-2.0 | Python | Zep Cloud; Graphiti graph store | Temporal knowledge graph | SDK/API | SDK/API | No for Zep; Graphiti yes | Paid service (price UNVERIFIED) | 4,973 / 2026-10-20 |
| 6 | Graphiti | getzep/graphiti | Apache-2.0 | Python | Neo4j 5.26, FalkorDB 1.1.2, Neptune, OpenSearch | Semantic + BM25 + graph traversal | Any app; reference MCP/REST servers | SDK/API | Yes (self-host) | Free OSS | 32,229 / 2026-10-26 |
| 7 | Letta (formerly MemGPT) | letta-ai/letta | Apache-2.0 | TypeScript | Agent state + memory blocks; current code in letta-ai/letta-code | Agent-managed recall/archival memory | Letta CLI, App Server, SDK, channels | Agent runtime; self-editing memory | Yes | Free OSS; Letta Cloud paid (price UNVERIFIED) | 25,259 / 2026-10-18 |
| 8 | Cognee | topoteretes/cognee | Apache-2.0 | Python | Graph + vector; Postgres option | Graph, vector and code-context retrieval | Python API, MCP, Codex plugin | SDK/API; Codex plugin hooks | Yes | Free OSS; cloud paid (price UNVERIFIED) | 32,766 / 2026-10-26 |
| 9 | LangMem | langchain-ai/langmem | MIT | Python | Any store; native LangGraph long-term store | Semantic search over store | LangGraph apps | SDK; background memory manager | Yes | Free OSS | 1,722 / 2026-10-26 |
| 10 | Memori | MemoriLabs/Memori | NOASSERTION (licence file not read) | Python | "data infrastructure you already run" | Structured persistent state | SDK, MCP, OpenClaw plugin | SDK/plugin hooks | Yes (self-host) | Free developer tier; cloud paid (price UNVERIFIED) | 17,141 / 2026-10-03 |
| 11 | Basic Memory | basicmachines-co/basic-memory | AGPL-3.0 | Python | Markdown files + SQLite index | FTS + vector hybrid, cross-encoder rerank | MCP clients, Claude, Codex, Cursor et al. via MCP | MCP + plugin hooks/skills | Yes | Free OSS; cloud $15/mo (README) | 4,357 / 2026-10-26 |
| 12 | Hindsight | vectorize-io/hindsight | MIT | Python | Postgres + graph | Four memory networks, entity/temporal/causal links | SDK, REST, MCP, coding agents | SDK/API/MCP | Yes (Docker/Postgres) | Free self-host; cloud usage-based with free credits | 53,943 / 2026-10-26 |
| 13 | MemMachine | MemMachine/MemMachine | Apache-2.0 | Python | Neo4j for episodes + SQL for profiles | Graph + SQL | MCP server, REST | API/MCP | Yes | Free OSS; free platform account | 3,076 / 2026-10-26 |
| 14 | Memvid | memvid/memvid | Apache-2.0 | Rust | Single portable file (data + embeddings + index) | In-file retrieval | SDK/file | SDK | Yes | Free OSS | 16,610 / 2026-07-14 |
| 15 | Memobase | memodb-io/memobase | Apache-2.0 | Python | README not available on default branch | User-profile memory | API/server | API | UNVERIFIED | Free OSS | 2,937 / 2026-01-11 |
| 16 | A-MEM | agiresearch/A-mem | MIT | Python | ChromaDB | Vector + linked memory notes | Research API | Library | Yes | Free research code | 1,208 / 2025-12-12 |
| 17 | MemOS | MemTensor/MemOS | Apache-2.0 | TypeScript | Local SQLite; self-host Neo4j + Qdrant; cloud | Hybrid FTS5 + vector, graph, L1/L2/L3 memory | Hermes, OpenClaw, DeepSeek Harness plugins; API | SDK/API/plugins | Yes (local plugin) | Free OSS; cloud paid (price UNVERIFIED) | 12,103 / 2026-10-24 |
| 18 | MemoryScope / ReMe | agentscope-ai/ReMe (redirect from modelscope/MemoryScope) | Apache-2.0 | Python | Local workspace files + index | BM25 + optional embeddings + wikilink expansion | CLI, HTTP, MCP, Python API, Codex plugin | Native hooks for Codex; batched recording | Yes | Free OSS | 3,691 / 2026-10-26 |
| 19 | MemoryOS | BAI-LAB/MemoryOS | Apache-2.0 | Python | ChromaDB | Short/mid/long-term tiers | Python API, MCP demo | Library | Yes | Free research code; hosted playground by invitation | 1,613 / 2026-07-07 |
| 20 | Mastra memory | mastra-ai/mastra | NOASSERTION (licence file not read) | TypeScript | Pluggable storage (LibSQL/Postgres etc.) | Semantic recall + observational memory | Mastra apps | SDK | Yes | Free OSS; cloud paid (price UNVERIFIED) | 29,084 / 2026-10-26 |
| 21 | mcp-memory-service | doobidoo/mcp-memory-service | Apache-2.0 | Python | SQLite, Cloudflare, or Milvus | Vector + knowledge graph + consolidation | MCP, REST, CLI, Codex hooks | MCP/REST/CLI/hooks | Yes | Free OSS | 2,047 / 2026-10-26 |
| 22 | MCP Knowledge Graph | shaneholloman/mcp-knowledge-graph | MIT | JavaScript | Local JSONL knowledge graph | Graph traversal | MCP clients | MCP | Yes | Free OSS | 886 / 2026-05-29 |
| 23 | codebase-memory-mcp | DeusData/codebase-memory-mcp | MIT | C | SQLite FTS5 + code knowledge graph | BM25 + graph | MCP clients | MCP + agent hooks | Yes | Free OSS | 47,510 / 2026-10-26 |
| 24 | Context Mode | mksglu/context-mode | NOASSERTION (licence file not read) | TypeScript | SQLite | Sandboxes tool output, persists session memory | MCP clients with hook routing | MCP + hooks | Yes | Free OSS | 32,346 / 2026-10-26 |
| 25 | agentmemory | rohitg00/agentmemory | Apache-2.0 | TypeScript | Local storage; Postgres + vector for server | BM25, local embeddings, graph fusion | 12 coding tools incl. Claude Code, Copilot CLI, Cursor, Gemini CLI, Codex, Hermes, OpenClaw, OpenCode | 12 auto hooks | Yes | Free OSS/local; cloud UNVERIFIED | 29,898 / 2026-10-26 |
| 26 | Beads | gastownhall/beads | MIT | Go | Dolt database | Issue graph with links | CLI, MCP, hooks | CLI/hooks | Yes | Free OSS | 28,216 / 2026-10-26 |
| 27 | Engram | Gentleman-Programming/engram | MIT | Go | SQLite + FTS5 (~/.engram/engram.db) | FTS + graph export | 14 setup targets, any MCP client | CLI, HTTP, MCP, hooks | Yes | Free OSS; cloud optional (price UNVERIFIED) | 7,616 / 2026-10-26 |
| 28 | TencentDB Agent Memory | TencentCloud/TencentDB-Agent-Memory | NOASSERTION (licence file not read) | TypeScript | TencentDB | Team-level memory hub | Any agent through an API proxy | HTTP proxy (no hook/MCP needed) | UNVERIFIED | OSS repo; service pricing UNVERIFIED | 29,965 / 2026-10-26 |
| 29 | OpenViking | volcengine/OpenViking | AGPL-3.0 | Python | Context database (self-host) | Directory-aware vector + context | Hooks + MCP for coding agents | Hooks/MCP | Yes (self-host) | Free OSS | 40,861 / 2026-10-26 |
| 30 | claude-memory-compiler | coleam00/claude-memory-compiler | No licence file | Python | File-based memory under project (README) | UNVERIFIED | Claude Code | Claude Code hooks + Agent SDK | Yes | Free (no licence declared) | 1,307 / 2026-04-06 |
| 31 | Context Portal (ConPort) | GreatScottyMac/context-portal | Apache-2.0 | Python | SQLite per workspace | Vector + project knowledge graph | MCP clients | MCP | Yes | Free OSS | 765 / 2026-01-27 |
| 32 | Memory Bank MCP | alioshr/memory-bank-mcp | MIT | TypeScript | Markdown memory bank | File lookup | MCP clients | MCP | Yes | Free OSS | 921 / 2025-08-20 |
| 33 | claude-mem-lite | sdsrss/claude-mem-lite | MIT | JavaScript | Single SQLite, FTS5 | FTS5 | Claude Code via MCP + hooks | Hooks + MCP | Yes | Free OSS | 68 / 2026-10-25 |
| 34 | Mooncite (claude-memory-mcp) | WhenMoon-afk/claude-memory-mcp | MIT | TypeScript | Local index; packaged embeddings Linux x64 | Lexical + local embeddings | Pi, OMP, Claude Code, Codex, ChatGPT history | MCP | Yes (Linux) | Free OSS | 69 / 2026-09-26 |
| 35 | opencode-claude-memory | kuitos/opencode-claude-memory | MIT | TypeScript | Markdown | Markdown memory shared across tools | OpenCode, Claude Code | Plugin SDK (no shell hook) | Yes | Free OSS | 74 / 2026-10-10 |
| 36 | claude-memory-engine | HelloRuru/claude-memory-engine | MIT | JavaScript | Markdown, no database | Markdown index | Claude Code | Hooks + Markdown | Yes | Free OSS | 134 / 2026-05-11 |
| 37 | ChatGPT memory | help.openai.com/en/articles/8590148-memory-faq | Proprietary | n/a | Vendor cloud | Vendor-managed relevance selection | ChatGPT | Built-in | No | Included in ChatGPT plans (price UNVERIFIED) | n/a |
| 38 | Claude memory tool | docs.anthropic.com/.../memory-tool | Proprietary API | n/a | Client-side `/memories` directory, storage controlled by the application | File read/write by the model | Any Claude API app | API tool; app implements file operations | Yes if the app stores locally | API usage billed per token (rate UNVERIFIED) | n/a |
| 39 | Cursor memories and rules | docs.cursor.com/en/context/memories | Proprietary | n/a | UNVERIFIED (page body is JavaScript-rendered) | UNVERIFIED | Cursor | Built-in memories + rules files | No | Included in Cursor plans (price UNVERIFIED) | n/a |
| 40 | Gemini memory | support.google.com/gemini (canonical memory page not found) | Proprietary | n/a | UNVERIFIED | UNVERIFIED | Gemini Apps | Built-in | No | UNVERIFIED | n/a |
| 41 | Windsurf memories and rules | docs.windsurf.com/windsurf/cascade/memories | Proprietary | n/a | Auto-memories in `~/.codeium/windsurf/memories/`; rules in workspace/global files | Cascade decides relevance; rules have activation modes | Windsurf / Devin Desktop, Cascade | Built-in | Partial (memories local, not cross-workspace) | Included in Windsurf plans (price UNVERIFIED) | n/a |
| 42 | GitHub Copilot memory | docs.github.com (two guessed URLs returned 404) | Proprietary | n/a | UNVERIFIED | UNVERIFIED | GitHub Copilot | UNVERIFIED | UNVERIFIED | UNVERIFIED | n/a |

Registry data, same date:

| Project | Package | Latest version | Last-month downloads |
|---|---|---|---|
| claude-mem | npm `claude-mem` | 15.2.1 (package.json) | 63,865 |
| MCP reference memory server | npm `@modelcontextprotocol/server-memory` | not fetched | 631,205 |
| Mem0 | npm `mem0ai` | not fetched | 618,606 |
| Supermemory | npm `supermemory` | not fetched | 448,344 |
| Mastra memory | npm `@mastra/memory` | not fetched | 4,049,835 |
| Mem0 | PyPI `mem0ai` | 2.2.1 | PyPI does not publish download counts in this endpoint |
| Zep | PyPI `zep-cloud` | 4.0.1 | — |
| Graphiti | PyPI `graphiti-core` | 0.31.2 | — |
| Letta | PyPI `letta` | 0.34.12 | — |
| Cognee | PyPI `cognee` | 1.6.5 | — |
| LangMem | PyPI `langmem` | 0.0.30 | — |
| Memori | PyPI `memori` | 3.3.6 | — |
| Basic Memory | PyPI `basic-memory` | 0.24.1 | — |
| Hindsight | PyPI `hindsight-client` | 1.1.0 | — |
| Memobase | PyPI `memobase` | 0.0.27 | — |
| Memvid | PyPI `memvid` | 0.1.3 | — |
| MemMachine | PyPI `memmachine` | 404 — installed from GitHub/Docker | — |

## 21.3 Benchmark claims, real weaknesses and the concrete counter

| Project | Published claim (source; conditions) | Real weakness (source) | How Aletheia can beat it, concretely |
|---|---|---|---|
| claude-mem | No benchmark number published on the docs site or README. | Needs Python/uv for Chroma; telemetry on by default; 5 hooks must be installed per tool (docs; README). | Same data, both systems measured by the same harness: 1.6× Recall@5 raw and ~390× lower idle latency, already measured ([14](14-research-ai-memory.md#146-measured-results)). Keep the harness public and rerun it. |
| Mem0 | LoCoMo 92.5, LongMemEval 94.4, 7.0K/6.8K tokens per query, 0.88/1.09 s (`README.md`, **vendor-claimed**, no dataset/judge conditions on the page). | OSS stack needs a vector store and an LLM; the free path is not one binary (`README.md`). | Beat it where it is not competing: one local SQLite file, rules sync into editor files, no account, no SDK. Publish a like-for-like run only if the same judge and dataset are used. |
| OpenMemory | None. | 99 stars, last commit 2026-07-29; ports sessions but does not publish storage or retrieval details (`README.md`). | One store all tools read, plus a documented export format. |
| Supermemory | "#1 on LoCoMo and LongMemEval"; "95% Recall@15 with 99.4% context reduction"; "99.6% at @10, 99.8% at @5" (`README.md`, **vendor-claimed**; dataset split and judge not stated). | Claims are not accompanied by a reproduction command on the page fetched; the engine is managed and the self-host path is not a one-liner. | Publish raw per-question outputs and the exact command. Compete on auditability, not on the vendor's headline. |
| Zep | DMR 94.8% vs MemGPT 93.4% (`arXiv:2501.13956` abstract, **vendor-authored**). | Zep itself is a paid cloud; the OSS part is Graphiti, which needs Neo4j/FalkorDB/Neptune plus OpenSearch (`README.md`). | No graph database to install. Add a graph channel later (T-048) without making it a prerequisite. |
| Graphiti | Same paper; graph engine behind Zep. | Requires a graph database and an embedding model; no coding-tool hooks (`README.md`). | Default install has zero required dependencies; graph is an optional index, not the store. |
| Letta | No benchmark number on the README fetched. | It is an agent platform, not a memory sidecar; the old V1 API server is archived and current code moved to `letta-ai/letta-code` (`README.md`). | Stay a sidecar: MCP, REST, CLI, files. Do not require the user to adopt a new agent runtime. |
| Cognee | README links a benchmarks section but the extracted text has no number. | Python graph/vector stack; self-hosted but not a single file; Codex plugin is the only hook path (`README.md`). | A single Bun process and SQLite; rules sync to nine editors, not one plugin. |
| LangMem | None. | A library, not a product: no MCP, no capture, no CLI; native store assumes LangGraph (`README.md`). | Ship the whole loop: capture, store, retrieve, rules, migrate, UI. |
| Memori | Benchmark image links to `memorilabs.ai/benchmark`; no number in the README text (`vendor-claimed`). | Enterprise-shaped Python infrastructure; no coding-tool hook story beyond OpenClaw. | Free local default, no account, honest benchmark with a command. |
| Basic Memory | None in the README. | AGPL-3.0 restricts some corporate use; Markdown files are readable but the index is a second layer (`README.md`). | Apache-2.0; one SQLite store; export is optional, not the storage model. |
| Hindsight | Paper claims state-of-the-art long-term memory (`arXiv:2512.12818` abstract; exact scores were not in the fetched abstract). | Self-host needs Docker and Postgres; the cloud is the easier path (`README.md`). | No Postgres, no Docker requirement; a 2 ms search path measured on the same machine. |
| MemMachine | None. | Neo4j plus SQL; a server to run (`README.md`). | One file, one process. |
| Memvid | "+35% SOTA on LoCoMo", "+76% multi-hop, +56% temporal vs industry average" (`README.md`, **vendor-claimed**; baseline not named). | Last commit 2026-07-14; the file format is the product, so multi-tool rules and live capture are out of scope (`README.md`). | Capture and rules are first-class, not an SDK the user must wire. |
| Memobase | None. | README missing on the default branch; last commit 2026-01-11. | Maintained, documented, testable. |
| A-MEM | None in the README. | Research code; last commit 2025-12-12; ChromaDB; no installer (`README.md`). | Production-shaped tests, migrations and installers. |
| MemOS | LongMemEval 89.20 (`README.md`, **vendor-claimed**). | Self-host needs Neo4j + Qdrant; the simple path is the cloud or a host-specific plugin (`README.md`). | Local SQLite default; no graph database; same MCP interface for every host. |
| MemoryScope / ReMe | LongMemEval cleaned-s 89.4% overall, 500 questions (`README.md`, **vendor-claimed**). | Python workspace + hooks; the benchmark is self-run and the harness is not the same as ours. | Rerun both on the same questions with the same judge; publish the raw outputs. |
| MemoryOS | LoCoMo F1 +49.11%, BLEU-1 +46.18% (`README.md`, **vendor-claimed**). | Research code; ChromaDB; last commit 2026-07-07. | Product loop and maintained releases. |
| Mastra memory | None for memory. | A TypeScript agent framework, not a shared hub: no rules sync, no cross-tool CLI (`README.md`). | Tool-neutral store; the framework can call it over REST. |
| mcp-memory-service | Links LongMemEval, DevBench and LoCoMo results in a separate doc; numbers not in the README fetched (`vendor-claimed`). | Python service; multiple backends increase setup choices (`README.md`). | One backend (`bun:sqlite`) and one command. |
| MCP Knowledge Graph | None. | JSONL file; last commit 2026-05-29; graph only, no hybrid retrieval (`README.md`). | Hybrid retrieval + rules + migrations. |
| codebase-memory-mcp | "Published backend benchmarks on Apple M3 Pro" but no numbers in the extracted text. | It indexes code, not conversation; not a cross-session memory of decisions (`README.md`). | Memory of decisions and gotchas, with provenance back to the turn. |
| Context Mode | 98% reduction in tool output, 21 scenarios (`README.md`, **vendor-claimed**). | Optimises context window; it is not a durable cross-tool memory with rules (`README.md`). | Durable memory plus a token-budgeted packer; both can coexist. |
| agentmemory | 95.2% retrieval R@5, 92% fewer tokens; 68.5% LoCoMo (`README.md` badges/table, **vendor-claimed**). | Young project (29.9k stars in a short time); benchmark details live in repo docs not fetched here. | Same-harness comparison; Aletheia already publishes its harness and negative results. |
| Beads | None. | An issue tracker with graph links, not a memory extractor (`README.md`). | Extract observations from activity; keep links as an extension. |
| Engram | None. | Single-binary SQLite + FTS5, which is close to Aletheia's shape; 14 setup targets, but no published quality benchmark (`README.md`). | Rules sync, hybrid retrieval with measured recall, and a reproducibility story. This is the closest architectural competitor. |
| TencentDB Agent Memory | README shows a before/after table but the extracted text has no values. | Requires TencentDB; proxy interception is a different trust model; licence NOASSERTION. | Local-only store the user owns; no proxy in the request path. |
| OpenViking | LoCoMo user memory 80–83% accuracy vs 24–57% native; tokens −34.3–91.0%; latency −58.45–66.10% (`README.md`, **vendor-claimed**). | AGPL-3.0; needs an embedding model and a VLM provider (`README.md`). | Apache-2.0; works with BM25 alone, embeddings optional. |
| claude-memory-compiler | None. | No licence file; last commit 2026-04-06; file-based memory with one host (`README.md`). | Licence clarity and multi-host support. |
| Context Portal | None. | Last commit 2026-01-27; SQLite + vector + graph but no coding hooks (`README.md`). | Capture through hooks and a CLI, not only MCP calls. |
| Memory Bank MCP | None. | Last commit 2025-08-20; Markdown bank, no retrieval ranking (`README.md`). | Ranked hybrid retrieval with a measured baseline. |
| claude-mem-lite | Compares itself to claude-mem on hook latency and dependencies; benchmark numbers not extracted (`README.md`). | 68 stars; FTS5 only (`README.md`). | Hybrid retrieval and a published recall number. |
| Mooncite | None. | Linux-only packaged embeddings; last commit 2026-09-26 (`README.md`). | Cross-platform (Linux/macOS/Windows) and no Linux-x64 binary dependency. |
| opencode-claude-memory | None. | Markdown memory inside one plugin; two hosts (`README.md`). | One store for nine hosts, plus rules sync. |
| claude-memory-engine | None. | No database and no retrieval ranking; last commit 2026-05-11 (`README.md`). | Indexed retrieval with citations. |
| ChatGPT memory | None. | Account-bound cloud memory; sources include past chats, saved memories, custom instructions, Library and connected apps; turning memory off does not delete chats (`help.openai.com`, fetched through a text proxy). No local store, no MCP, no export of a memory file. | Local, portable, tool-neutral memory with one-command export. |
| Claude memory tool | None. | Client-side by design: the application must implement `/memories` file operations and storage; no cross-tool capture, no rules sync (`docs.anthropic.com`). | Ship the storage, retrieval and rules layer the tool deliberately leaves to the app. |
| Cursor memories and rules | None. | Per-editor, account-bound; memory data path not documented on the page body fetched (`docs.cursor.com`, UNVERIFIED specifics). | One memory read by Cursor and every other tool; rules written into `.cursor/rules` already works (`src/hub/rules-sync.mjs`). |
| Gemini memory | None. | Canonical memory page not fetched (search returned third-party pages; the Google support URL tried was a limits page). `UNVERIFIED`. | Local alternative that does not need a Google account. |
| Windsurf memories and rules | None. | Auto-memories are workspace-scoped, stored in `~/.codeium/windsurf/memories/`, not available in another workspace, and not committed (`docs.windsurf.com`). | Cross-project memory by default, with explicit scopes; rules already sync to `.windsurfrules`. |
| GitHub Copilot memory | None. | Memory documentation not fetched (two URLs returned 404). `UNVERIFIED`. | Local alternative; do not claim Copilot parity until verified. |

## 21.4 Comparison table for the README

This is the table a README can carry: capabilities as rows, Aletheia plus the ten projects a reader is most likely
to compare against. `✅` means the capability is documented and available in the free/local path; `partial` means it
exists with a named limit; `❌` means absent or paid-only. Cells are sourced by the column's primary source below the
table; cells marked `UNVERIFIED` could not be confirmed from that source. The exhaustive per-project matrix is
section 21.5.

| Capability | Aletheia (today) | claude-mem | Mem0 | Zep/Graphiti | Supermemory | Basic Memory | Hindsight | Engram | agentmemory | ChatGPT | Cursor |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Local-first | ✅ | ✅ | ✅ OSS | partial (Graphiti only) | ✅ self-host | ✅ | ✅ self-host | ✅ | ✅ | ❌ | ❌ |
| Free | ✅ | ✅ OSS | ✅ OSS | partial (Graphiti free) | ✅ OSS | ✅ OSS | ✅ self-host | ✅ | ✅ | ❌ plan | ❌ plan |
| No account | ✅ | ✅ local | ✅ OSS | ✅ Graphiti | ✅ self-host | ✅ | ✅ self-host | ✅ | ✅ | ❌ | ❌ |
| MCP | ✅ stdio | ✅ | ✅ | partial (reference servers) | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| REST | ✅ `/v1` | ✅ worker API | ✅ | ✅ | ✅ | partial | ✅ | ✅ | ✅ | ❌ | ❌ |
| CLI | ✅ | ✅ `npx` | partial | ❌ | partial | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Rules sync to tool files | ✅ 9 targets | ❌ | ❌ | ❌ | ❌ | partial (AGENTS.md) | ❌ | partial (setup targets) | partial (hooks) | partial (custom instructions) | ✅ rules |
| Import/export between tools | partial (own bundle + claude-mem) | partial (export/import) | partial (platform migration) | partial | partial | ✅ Markdown | partial | partial | partial | partial (export) | ❌ |
| Hook capture | ❌ | ✅ | ❌ | ❌ | ❌ | partial | partial | ✅ | ✅ | ❌ | partial |
| Vector search | partial (optional ONNX) | ✅ Chroma | ✅ | ✅ | ✅ | ✅ | ✅ | UNVERIFIED | ✅ | UNVERIFIED | UNVERIFIED |
| Graph / entity memory | ❌ | ❌ | ✅ | ✅ | UNVERIFIED | ✅ wikilinks | ✅ | partial | ✅ | ❌ | ❌ |
| Temporal reasoning | ❌ | partial (dates) | ✅ | ✅ | ✅ | partial | ✅ | partial | partial | partial | ❌ |
| Team sharing | ❌ | partial (paid) | ✅ paid | ✅ paid | ✅ paid | ❌ | ✅ paid | partial (cloud) | UNVERIFIED | partial | partial |
| Benchmark published and reproducible | partial (retrieval yes; answer no) | ❌ | vendor only | vendor only | vendor only | ❌ | vendor paper | ❌ | vendor claim | ❌ | ❌ |
| Languages supported | 1 (English) | 29 modes, 32 READMEs | SDK | SDK | SDK | SDK | SDK | SDK | SDK | many (product) | many (product) |

Column sources: Aletheia — this repository (`src/hub/*.mjs`, `README.md`); claude-mem —
`https://docs.claude-mem.ai/platform-integration` and `README.md`; Mem0 — `README.md` and
`https://docs.mem0.ai/integrations/mcp`; Zep/Graphiti — `getzep/graphiti` `README.md`; Supermemory — `README.md`;
Basic Memory — `README.md`; Hindsight — `README.md`; Engram — `README.md`; agentmemory — `README.md`;
ChatGPT — `https://help.openai.com/en/articles/8590148-memory-faq`; Cursor — `https://docs.cursor.com/en/context/memories`.

## 21.5 Exhaustive capability matrix (42 projects)

`✅` = documented in the free/local path, `p` = partial, `❌` = absent or paid-only, `?` = UNVERIFIED. This table is
deliberately coarse; the per-project detail is in 21.2 and 21.3.

| # | Project | Local | Free | No account | MCP | REST | CLI | Rules sync | Cross-tool import | Hook capture | Vector | Graph | Temporal | Team | Reproducible benchmark |
|---:|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | claude-mem | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | p | ✅ | ✅ | ❌ | p | p | ❌ |
| 2 | Mem0 | ✅ | ✅ | ✅ | ✅ | ✅ | p | ❌ | p | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 3 | OpenMemory | ✅ | ✅ | ✅ | ? | ? | ✅ | ❌ | p | ❌ | ? | ? | ? | ❌ | ❌ |
| 4 | Supermemory | ✅ | ✅ | ✅ | ✅ | ✅ | p | ❌ | p | ❌ | ✅ | ? | ✅ | ✅ | ❌ |
| 5 | Zep | ❌ | ❌ | ❌ | p | ✅ | ❌ | ❌ | p | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 6 | Graphiti | ✅ | ✅ | ✅ | p | ✅ | ❌ | ❌ | p | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 7 | Letta | ✅ | ✅ | ✅ | p | ✅ | ✅ | ❌ | p | ❌ | ✅ | p | p | ✅ | ❌ |
| 8 | Cognee | ✅ | ✅ | ✅ | ✅ | ✅ | p | ❌ | p | p | ✅ | ✅ | p | ✅ | ❌ |
| 9 | LangMem | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | p | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 10 | Memori | ✅ | p | ✅ | ✅ | ✅ | p | ❌ | p | p | ✅ | ? | ? | ✅ | ❌ |
| 11 | Basic Memory | ✅ | ✅ | ✅ | ✅ | p | ✅ | p | ✅ | p | ✅ | ✅ | p | ❌ | ❌ |
| 12 | Hindsight | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | p | p | ✅ | ✅ | ✅ | ✅ | p |
| 13 | MemMachine | ✅ | ✅ | ✅ | ✅ | ✅ | p | ❌ | p | ❌ | ✅ | ✅ | p | p | ❌ |
| 14 | Memvid | ✅ | ✅ | ✅ | ❌ | ❌ | p | ❌ | p | ❌ | ✅ | ❌ | p | ❌ | ❌ |
| 15 | Memobase | ? | ✅ | ✅ | ? | ✅ | p | ❌ | p | ❌ | ? | ❌ | p | ❌ | ❌ |
| 16 | A-MEM | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | p | ❌ | ✅ | p | p | ❌ | ❌ |
| 17 | MemOS | ✅ | ✅ | ✅ | p | ✅ | p | ❌ | p | p | ✅ | ✅ | p | ✅ | ❌ |
| 18 | MemoryScope/ReMe | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | p | p | ✅ | p | p | p | ❌ | ❌ |
| 19 | MemoryOS | ✅ | ✅ | ✅ | p | ❌ | p | ❌ | p | ❌ | ✅ | ❌ | p | ❌ | ❌ |
| 20 | Mastra memory | ✅ | ✅ | ✅ | p | ✅ | p | ❌ | p | ❌ | ✅ | ❌ | p | ✅ | ❌ |
| 21 | mcp-memory-service | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | p | ✅ | ✅ | ✅ | p | ❌ | p |
| 22 | MCP Knowledge Graph | ✅ | ✅ | ✅ | ✅ | ❌ | p | ❌ | p | ❌ | ❌ | ✅ | ❌ | ❌ | ❌ |
| 23 | codebase-memory-mcp | ✅ | ✅ | ✅ | ✅ | p | ✅ | ❌ | p | ✅ | p | ✅ | p | ❌ | ❌ |
| 24 | Context Mode | ✅ | ✅ | ✅ | ✅ | p | ✅ | ❌ | p | ✅ | ❌ | ❌ | ❌ | ❌ | p |
| 25 | agentmemory | ✅ | ✅ | ✅ | ✅ | p | ✅ | p | p | ✅ | ✅ | ✅ | p | ? | p |
| 26 | Beads | ✅ | ✅ | ✅ | ✅ | p | ✅ | ❌ | p | ✅ | ❌ | ✅ | p | p | ❌ |
| 27 | Engram | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | p | p | ✅ | ? | p | p | p | ❌ |
| 28 | TencentDB Agent Memory | ? | ? | ? | ❌ | ✅ | p | ❌ | p | ❌ | ✅ | ? | ? | ✅ | ❌ |
| 29 | OpenViking | ✅ | ✅ | ✅ | ✅ | ✅ | p | ❌ | p | ✅ | ✅ | ✅ | ✅ | p | ❌ |
| 30 | claude-memory-compiler | ✅ | ✅ | ✅ | ❌ | ❌ | p | ❌ | p | ✅ | ? | ❌ | ? | ❌ | ❌ |
| 31 | Context Portal | ✅ | ✅ | ✅ | ✅ | p | p | ❌ | p | ❌ | ✅ | ✅ | p | ❌ | ❌ |
| 32 | Memory Bank MCP | ✅ | ✅ | ✅ | ✅ | ❌ | p | ❌ | p | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 33 | claude-mem-lite | ✅ | ✅ | ✅ | ✅ | p | p | ❌ | p | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 34 | Mooncite | ✅ | ✅ | ✅ | ✅ | p | p | ❌ | p | p | p | ❌ | p | ❌ | ❌ |
| 35 | opencode-claude-memory | ✅ | ✅ | ✅ | p | ❌ | p | ❌ | p | p | ❌ | ❌ | ❌ | ❌ | ❌ |
| 36 | claude-memory-engine | ✅ | ✅ | ✅ | p | ❌ | p | ❌ | p | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 37 | ChatGPT memory | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | p | p | ❌ | ? | ❌ | p | p | ❌ |
| 38 | Claude memory tool | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | p | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 39 | Cursor memories | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ | ✅ | ❌ | p | ? | ❌ | ❌ | p | ❌ |
| 40 | Gemini memory | ❌ | ? | ❌ | ❌ | ❌ | ❌ | p | ? | ❌ | ? | ❌ | ? | p | ❌ |
| 41 | Windsurf memories | p | ❌ | ❌ | ✅ | ❌ | p | ✅ | ❌ | p | ? | ❌ | ❌ | p | ❌ |
| 42 | Copilot memory | ? | ? | ? | ? | ? | ? | p | ? | ? | ? | ? | ? | ? | ? |

## 21.6 What the landscape actually says

Six findings, each visible in the tables above:

1. **Local-first is not a differentiator by itself.** At least 20 projects run locally. What is rare is local-first
   **plus** rules sync **plus** a measured retrieval number. Only this repository claims all three, and its
   answer-accuracy number is still missing.
2. **The coding-tool niche is crowded and converging on the same shape.** claude-mem, Engram, agentmemory,
   claude-mem-lite, MemoryScope/ReMe, OpenViking and Mooncite all combine hooks, SQLite or files, MCP and some
   extraction. A new project must beat them on a measured axis, not on feature count.
3. **The framework niche is a different market.** Mem0, Zep/Graphiti, Letta, Cognee, LangMem, Memori and Mastra sell
   an SDK to application builders. They are not trying to be the user's cross-tool hub, and they should not be
   compared on "rules sync".
4. **Benchmarks are not comparable.** Mem0 reports 92.5 on LoCoMo; Memvid claims +35% "SOTA"; MemoryOS claims +49 F1;
   Supermemory claims "#1"; none of the fetched pages states the judge model, the split and the token budget in the
   same place. The conflict is documented in [14](14-research-ai-memory.md#143-what-the-published-numbers-do-and-do-not-show).
   The only defensible claim is a number produced by a published harness.
5. **The paid line is drawn at sync and teams.** Nearly every free core sells cloud sync, team sharing, or managed
   extraction. That leaves "free, local, self-hosted team sharing" open. It is task T-083, not a current feature.
6. **Two very large projects are adjacent, not competitors.** codebase-memory-mcp (47.5k stars) and Context Mode
   (32.3k) optimise code understanding and context size. They can be used alongside Aletheia; they do not store the
   decisions Aletheia stores.

## 21.7 The three niches where a free, tool-neutral, reproducibly benchmarked memory can win

**Niche 1: the multi-tool developer who refuses an account.**
The pain is concrete: four instruction files, three memory systems, none of them shared. Aletheia already writes
rules into nine tools' own files and exposes one store over MCP, REST and CLI. The winning claim is not "more
features"; it is "one install, no account, your files, your data, and an export you can read". Measured support:
rules sync exists (`src/hub/rules-sync.mjs`), bundle export exists (`src/hub/store.mjs:431`), and no competitor in
table 21.4 does both.

**Niche 2: the team that cannot send prompts to a vendor.**
Cloud sync and TeamBrain are paid everywhere. A self-hosted shared store with per-client keys, an audit log and a
review queue is a real gap. Aletheia has the local store and the audit log; it lacks the server mode and ACLs
(T-081, T-082). This is the only niche where the competitor's paid boundary is also the technical boundary.

**Niche 3: the evaluator who does not believe vendor numbers.**
Every vendor number in 21.3 is self-reported. A public harness with raw outputs, negative results and a dated run
would be unique. Aletheia already publishes retrieval results and the exact commands, including a failed first
attempt ([14](14-research-ai-memory.md#146-measured-results)). The missing half is LLM-judged answer accuracy
(T-051). Until that exists, the honest claim is "reproducible retrieval benchmark", not "best memory".

What Aletheia should **not** claim: more tools than claude-mem, better answer accuracy than Mem0 or Zep, graph
reasoning, team sync, or Windows support. None is true today.

## 21.8 Counting and confidence

- 42 rows: 36 GitHub projects and 6 proprietary/vendor memory surfaces (ChatGPT, Claude memory tool, Cursor, Gemini, Windsurf, Copilot).
- All 36 GitHub projects have metadata fetched in this run; the 6 vendor products have no repository.
- 35 of the 36 GitHub projects have a usable README; Memobase's default-branch README returned 404.
- 10 projects publish a benchmark number in the fetched text; **all 10 are vendor-claimed**.
- Confidence is high for licence, language, stars and last commit (API data). It is medium for storage and
  retrieval (README prose, not source code). It is low for proprietary products whose docs could not be fetched;
  those cells say `UNVERIFIED` on purpose.
