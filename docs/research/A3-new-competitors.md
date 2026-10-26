# A3. New competitors (not in docs/21)

Research date: 2026-10-26. Method: GitHub search by topic and keyword (`gh api search/repositories`), Hacker News
Algolia API (Show HN queries), npm and PyPI metadata, README text via `gh api repos/<r>/readme`, vendor docs via fetch.
Stars, licence, language and last commit come from `gh api repos/<r>` and `repos/<r>/commits?per_page=1` on 2026-10-26.
"Last commit" here is the date of the newest commit on the default branch. docs/21 appears to use `pushed_at`
(see section 3), so the two columns can differ by days.
Every URL is in `A3-sources.tsv`. Cells not stated in a README or page I read say `not stated`. `UNVERIFIED` means I
could not confirm it, and the reason is given.

Count: **51 new products** (one of them is a second project named "Engram", a different repo from docs/21 #27). With the 42 in docs/21 the tracked set is **93**. No product below appears in docs/21's inventory
(checked by name and repo against the 42 rows).

Benchmark claims are `vendor-claimed` unless stated. Conditions are copied only where the source states them.
Benchmark detail and conflicts are in `A3-benchmarks.md`.

## 1. Coding-agent memory plugins (16)

| # | Product | Repo | Licence / lang | Stars / last commit | Storage and retrieval | Tools and capture | Local / price | Published benchmark claim | Real weakness (source) |
|--:|---|---|---|---|---|---|---|---|---|
| 1 | MemPalace | MemPalace/mempalace | MIT / Python | 59,744 / 2026-10-25 | Verbatim text, ChromaDB default, pluggable backend; semantic search scoped by wings, rooms, drawers | Claude Code (auto-save hooks), MCP; mines conversation history | Local, free; PyPI 3.11.0 | 96.6% R@5 raw on LongMemEval (README) | README claims vs code: https://github.com/MemPalace/mempalace/issues/27. Independent rerun: raw 96.6% R@5 holds, AAAK mode 84.2%: https://github.com/MemPalace/mempalace/issues/39 |
| 2 | Grov | TonyStef/Grov | Apache-2.0 / TypeScript | 190 / 2026-01-29 | Captures reasoning from Claude sessions and syncs to a team dashboard; storage engine not stated | Claude Code via proxy; automatic | Partly cloud (team sync); price not stated | none found | Request to point it at an internal proxy URL, i.e. default routes through the vendor: https://github.com/TonyStef/Grov/issues/63. No commit for 9 months |
| 3 | OpenWolf | cytostack/openwolf | AGPL-3.0 / TypeScript | 2,399 / 2026-10-19 | `.wolf/` folder in the project: checkpoints, project map, known fixes; no extra model calls | Claude Code, Codex, OpenCode; hooks | Local, free; npm 2.5.3 | none (token accounting only) | Hook errors on every edit: https://github.com/cytostack/openwolf/issues/7. `pre-read` hook blocks re-reads after the file changed: https://github.com/cytostack/openwolf/issues/41 |
| 4 | deja-vu | vshulcz/deja-vu | MIT / Go | 1,310 / 2026-10-26 | SQLite index over the agents' own session files, optional vector tier; search UI | 43 agents named in README (Claude Code, Codex, Cursor, opencode); indexes existing history, no new capture | Local, free; install by `curl \| sh` | 97.2% R@5 and 88.1% hit@1 on LongMemEval-S (README) | Vectors lost on index rewrite: https://github.com/vshulcz/deja-vu/issues/4976. `doctor` reports a skill as unsupported right after writing it: https://github.com/vshulcz/deja-vu/issues/5651 |
| 5 | Magic Context | cortexkit/magic-context | MIT / TypeScript | 2,389 / 2026-10-26 | SQLite project memory; background historian and "dreamer" agents compress and curate | OpenCode, Pi, OMP (not Claude Code); automatic | Local; needs LLM models for historian; npm 0.49.23 | none | Memory promotion counts phrasing repeats, not corroboration: https://github.com/cortexkit/magic-context/issues/335. Windows crash: https://github.com/cortexkit/magic-context/issues/332 |
| 6 | Hippo | kitfunso/hippo-memory | MIT / TypeScript | 785 / 2026-10-25 | SQLite plus markdown mirrors, BM25 default, optional local embeddings; marks recalled memories good or bad | Claude Code, Codex, Cursor, OpenClaw, OpenCode, Pi, MCP; hooks | Local, free; npm 2.1.0 | LongMemEval oracle split, 500 questions pooled, BM25 only: R@5 74.0% (README); README says an earlier magnitude claim was retracted | README: installing the package alone does not enable automatic capture on every agent. Open issues are mostly feature requests (https://github.com/kitfunso/hippo-memory/issues/10) |
| 7 | OwnMem | grpcer/ownmem | Apache-2.0 / JavaScript | 429 / 2026-10-14 | Markdown in `.ownmem/`, in the repo; deterministic BM25 recall, no model call | Claude Code, Codex, Cursor, Gemini CLI; hooks | Local, free; npm 0.8.2 | Recall@1 100% on 128 queries from its own CC0 corpus (README) | Created 2026-08-16, 0 open issues, so no field evidence yet. By design the entry count only ratchets down (README) |
| 8 | OKF Agent Memory | okf-memory/okf-agent-memory | MIT / Go | 840 / 2026-10-20 | Git-native OKF v0.2 bundles; in-memory BM25; AGENTS.md capped at 400 tokens | MCP (okf_search, okf_show); manual curation | Local, free; Go binary | Latency table against "Python / Vector DB runtimes" given as ranges, no run conditions | Created 2026-09-05. Comparison ranges are not measurements of named products. 7 open issues, none reviewed |
| 9 | claude-smart | ReflexioAI/claude-smart | Apache-2.0 / Python | 789 / 2026-10-26 | Reflexio engine: preferences and project skills learned from corrections; SQLite, local or managed cloud | Claude Code, Codex, OpenCode; hooks | Local mode or managed cloud; npm 0.3.13 | "~3x better" than claude-mem at turning corrections into rules (README, EXPERIMENT.md) | Stale backend holds the port and blocks restart: https://github.com/ReflexioAI/claude-smart/issues/108 |
| 10 | OMEGA | omega-memory/omega-memory | Apache-2.0 / Python | 224 / 2026-10-09 | SQLite plus ONNX embeddings, local | Claude, GPT, Gemini, Cursor via MCP; hooks | Local, free; PyPI 1.5.20 | none | Open request to add an opt-in sponsored-resource (ads SDK) field: https://github.com/omega-memory/omega-memory/issues/67 |
| 11 | ClawMem | yoloshii/ClawMem | MIT / TypeScript (Bun) | 212 / 2026-10-20 | SQLite vault; BM25 + vector + RRF, local GGUF models, graph traversal | Claude Code hooks, MCP, OpenClaw and Hermes plugins | Local; best stack needs 16 GB+ VRAM (README) | none (README cites "SOTA" stack, no numbers read) | MCP stdio exits after first response: https://github.com/yoloshii/ClawMem/issues/23. Abstains on question-style prompts: https://github.com/yoloshii/ClawMem/issues/32 |
| 12 | Ghost | notkurt/ghost | no licence file / TypeScript | 14 / 2026-03-18 | Sessions as markdown, attached to commits as git notes, indexed in QMD | Claude Code hooks; summaries via `claude -p` | Local; no licence so reuse is not granted | none | No licence in the API response; tiny adoption. Show HN: https://news.ycombinator.com/item?id=47007379 |
| 13 | a-mem-mcp | DiaaAj/a-mem-mcp | MIT / Python | 35 / 2026-01-17 | ChromaDB, Zettelkasten-style linked notes | MCP; "currently tested with Claude Code" (README) | Local; needs OpenAI or Ollama | none | Only Claude Code tested, per README. Stale since January |
| 14 | mimirs | TheWinci/mimirs | Apache-2.0 / TypeScript | 30 / 2026-08-15 | SQLite + ONNX; indexes the codebase | MCP | Local, free | 89 to 97% Recall@10, MRR 0.69 to 0.77 on four of its own codebases (README) | Codebase search, not memory of decisions. 30 stars |
| 15 | Sibyl | hyperb1iss/sibyl | Apache-2.0 / Python | 67 / 2026-10-22 | Self-hosted knowledge graph (Docker, Helm) shared by Claude Code, Codex and others | MCP, hooks | Self-host, free | None published. README: the pre-1.0 headline run was withdrawn | Needs a graph stack to run; the README itself says no number is published |
| 16 | ByteRover CLI | campfirein/byterover-cli | NOASSERTION / TypeScript | 4,945 / 2026-06-25 | Portable memory layer CLI (`brv`); cloud features present | Claude Code plugin, OpenClaw, OpenCode, Pi; hooks | CLI local, cloud sync exists; npm `byterover-cli` | LongMemEval-S 92.8%, LoCoMo 92.2% or 96.1% (as listed on Mem0's page, self-reported by ByteRover) | `brv curate` ignores supplied text on 3.16.1: https://github.com/campfirein/byterover-cli/issues/757. Licence unclear (NOASSERTION) |

## 2. Memory layers and SDKs (12)

| # | Product | Repo | Licence / lang | Stars / last commit | Storage and retrieval | Tools and capture | Local / price | Published benchmark claim | Real weakness (source) |
|--:|---|---|---|---|---|---|---|---|---|
| 17 | Honcho | plastic-labs/honcho | AGPL-3.0 / Python | 7,777 / 2026-10-25 | Postgres + pgvector; background reasoning over "peers" | Codex plugin, SDKs, MCP; SDK calls | Managed or self-host; SDK Apache-2.0 | LongMemEval S 90.4%, LoCoMo 89.9%, BEAM 100K 0.630 (honcho.dev/evals) | `update_peer_card` silently truncates over-cap cards: https://github.com/plastic-labs/honcho/issues/1143. AGPL server |
| 18 | memU | NevaMind-AI/memU | NOASSERTION / Python | 14,564 / 2026-10-16 | Shared markdown "wiki", SQLite or Postgres | Codex, Claude Code, Cursor, OpenClaw, Hermes; host adapters | README quick start asks for an API key from memu.so | none read | Mines its own session records every hour: https://github.com/NevaMind-AI/memU/issues/606. Request for CLI analytics: https://github.com/NevaMind-AI/memU/issues/613 |
| 19 | EverOS (EverMemOS) | EverMind-AI/EverOS | Apache-2.0 / Python | 13,635 / 2026-10-22 | Markdown-native, local-first per description; LanceDB and SQLite mentioned | MCP, many host integrations | Local-first; price not stated | 93.0% LoCoMo (quoted in issue #73); 92.3% listed on Mem0's page | A user could not reproduce: 52.22% on a smoke test, 38.38% on one conversation: https://github.com/EverMind-AI/EverMemOS/issues/73 (closed 2026-06-06, old eval path) |
| 20 | agent-memory | tigerless-labs/agent-memory | MIT / Python | 4,733 / 2026-10-22 | Markdown is truth, SQLite FTS5 index is a deletable cache; BM25 plus optional vectors | Claude Code, Codex CLI, any shell; hooks | Local; no LLM client inside the library; install from a checkout (README) | Own bounded LongMemEval-S setup: 52.9% vs no-memory 5.8%; README says not comparable to published scores | Windows: 26 unit tests fail: https://github.com/tigerless-labs/agent-memory/issues/55. Frontmatter does not round-trip: https://github.com/tigerless-labs/agent-memory/issues/49 |
| 21 | memsearch | zilliztech/memsearch | MIT / Python | 2,797 / 2026-10-26 | Markdown plus Milvus; ONNX embeddings option | Claude Code, Codex, DeepSeek Harness; hooks | Local; PyPI 0.4.22 | none read | Windows regression in the Claude Code plugin: https://github.com/zilliztech/memsearch/issues/752. 255 open issues |
| 22 | MIRIX | Mirix-AI/MIRIX | Apache-2.0 / Python | 3,456 / 2026-08-20 | Six memory types, PostgreSQL BM25 + vector | Screen capture plus chat; own app | Local data; PyPI client 0.1.7 | LoCoMo run in repo; scored in MemoryAgentBench (see benchmarks) | A user's LoCoMo run scored 0.6234 on one conversation; BM25 hardcoded in agent code: https://github.com/Mirix-AI/MIRIX/issues/6 |
| 23 | Memanto | moorcheh-ai/memanto | MIT / Python | 2,342 / 2026-10-24 | "Memory agent" managing other agents' memory; backend not stated in what I read | SDKs (Python, TS, Go), MCP | Local needs UNVERIFIED (README mentions an API key and cloud) | LongMemEval 89.8%, LoCoMo 87.1%. README has an unfilled TODO for reader, judge and subset | Open $100 security challenge with 54 comments: https://github.com/moorcheh-ai/memanto/issues/1852. Misclassifies preferences as errors: https://github.com/moorcheh-ai/memanto/issues/1890 |
| 24 | TeleMem | TeleAI-UAGI/telemem | Apache-2.0 / Python | 494 / 2026-10-23 | FAISS; drop-in for Mem0 (`import telemem as mem0`) | MCP via `uvx telemem` | Local, free; PyPI 1.10.1 | 86.33% on ZH-4O, "19% higher" than Mem0 (README) | Open request to publish reproducible LoCoMo and LongMemEval results: https://github.com/TeleAI-UAGI/telemem/issues/10 |
| 25 | KITE (Memoket) | memoket/memoket-kite | Apache-2.0 / Python | 222 / 2026-10-12 | Vector-free; reads question meaning | Library; install by `curl` script | Local engine, free | LoCoMo 93.51%, LongMemEval-S 85.60%, gpt-4.1-mini at every stage (README) | No third-party rerun found. 222 stars |
| 26 | YourMemory | sachitrafa/YourMemory | NOASSERTION / Python | 270 / 2026-07-14 | DuckDB, BM25 and vectors, Ebbinghaus-style decay | MCP | Local; PyPI `yourmemory` | LoCoMo R@5 59% vs Mem0 18, Zep Cloud 28, Supermemory 31 (README). README says Supermemory and Mem0 ran out of free-tier quota mid-run | The comparison is undermined by the README's own quota note. Licence NOASSERTION |
| 27 | SuperLocalMemory | qualixar/superlocalmemory | AGPL-3.0 / Python | 258 / 2026-10-22 | SQLite; core remember/recall without an LLM (Mode A) | MCP, hooks, many named hosts | Local, free; PyPI 4.2.11 | LoCoMo 74.8% (1,276 q, with GPT-4.1-mini), 60.4% raw, 87.7% on one conversation (README; from the paper, "not a fresh run") | Obsolete facts stay active in recall after Obsidian revisions: https://github.com/qualixar/superlocalmemory/issues/297 |
| 28 | Mengram | alibaizhanov/mengram | Apache-2.0 / Python | 204 / 2026-10-26 | Semantic, episodic, procedural memory; Postgres + pgvector | SDK, hooks, MCP | Needs a free API key from mengram.io in the quick start; local engine exists | none read | Extraction prompt too large for models under 7B: https://github.com/alibaizhanov/mengram/issues/7. Cross-entity fact pollution: https://github.com/alibaizhanov/mengram/issues/54 |

## 3. Graph memory (4)

| # | Product | Repo | Licence / lang | Stars / last commit | Storage and retrieval | Tools and capture | Local / price | Published benchmark claim | Real weakness (source) |
|--:|---|---|---|---|---|---|---|---|---|
| 29 | Semantica | semantica-agi/semantica | MIT / Python | 14,253 / 2026-10-26 | RDF and property graph; Neo4j, FalkorDB, FAISS, Qdrant, pgvector, DuckDB | MCP, SDK | Local, free; PyPI 0.7.0 | Timings on a 118,000-node graph (AMD EPYC, 64 GB), not memory quality; README says some figures are from CHANGELOG | 144 open issues; a knowledge-graph platform, not a coding-tool memory |
| 30 | M-flow | FlowElement-xinliuyuansu/m_flow | Apache-2.0 / Python | 4,508 / 2026-08-03 | Graph is the scoring engine (path-cost retrieval); Neo4j, pgvector | MCP, Docker | Self-host free; cloud mentioned | LoCoMo-10 81.8%, LongMemEval 89% (answer gpt-5-mini, judge gpt-4o-mini, top-k 10; competitors run by M-flow) | Competitor numbers are the vendor's own runs. No issue evidence: 13 open issues, none reviewed |
| 31 | Mnemon | mnemon-dev/mnemon | Apache-2.0 / Go | 661 / 2026-10-19 | One local binary, four-graph store, intent-aware recall, decay | Hooks for several agents; MCP | Local, free; npm, brew, `go install` | none | Open ideas, not defects: https://github.com/mnemon-dev/mnemon/issues/54 (cross-device sync not built in). Name clashes with PyPI `mnemon`, an unrelated cache library |
| 32 | MegaMemory | 0xK3vin/MegaMemory | MIT / TypeScript | 727 / 2026-05-03 | SQLite concept graph, in-process embeddings; the LLM is the indexer | MCP (understand, create_concept) | Local, free | none | Agent must write concepts itself, so quality depends on the agent. 5 months since last commit |

## 4. MCP memory servers (4)

| # | Product | Repo | Licence / lang | Stars / last commit | Storage and retrieval | Tools and capture | Local / price | Published benchmark claim | Real weakness (source) |
|--:|---|---|---|---|---|---|---|---|---|
| 33 | Nocturne Memory | Dataojitori/nocturne_memory | MIT / Python | 1,409 / 2026-09-22 | SQLite or Postgres, Docker; loads only core entries at start | MCP | Local, free | none | Deleting a node leaves dangling glossary triggers: https://github.com/Dataojitori/nocturne_memory/issues/42. README is Chinese-first |
| 34 | Memora | agentic-box/memora | MIT / Python | 746 / 2026-09-23 | SQLite, optional S3/R2/D1 sync; graph relations, deduplicating absorb | MCP | Local; `pip install memora-mcp` | none | Transcript indexing still a design discussion: https://github.com/agentic-box/memora/issues/38 |
| 35 | mem0-mcp-selfhosted | elvismdev/mem0-mcp-selfhosted | MIT / Python | 112 / 2026-03-13 | Wraps mem0 over Qdrant + Ollama, optional Neo4j | 11 MCP tools; hooks | Self-host; needs Qdrant and Ollama running | Own 248-case test: entity extraction 85.4% (Gemini) vs 79.1% (Claude) | Needs three services running. Show HN: https://news.ycombinator.com/item?id=47053534 |
| 36 | MARM Memory | Lyellr88/marm-memory | Apache-2.0 / Python | 424 / 2026-10-23 | SQLite + FTS5 + fastembed | MCP for Claude Code, Codex, Gemini, VS Code, Cursor | Local; Docker option | Timings only; README says its concurrency ratio varies 0.63 to 0.86 between runs | Endpoints return bare dicts: https://github.com/Lyellr88/marm-memory/issues/167 |

## 5. Rules-sync and skills tools (6)

These do not store memory. They are the nearest competitors to Aletheia's Rules tab.

| # | Product | Repo | Licence / lang | Stars / last commit | What it does | Tools supported | Local / price | Real weakness (source) |
|--:|---|---|---|---|---|---|---|---|
| 37 | Ruler | intellectronica/ruler | MIT / TypeScript | 2,951 / 2026-10-22 | One rules source applied to every coding agent; also writes MCP config | Copilot, Claude, Cursor, Aider and more (README) | Local, free; npm `@intellectronica/ruler` | No warning when generated AGENTS.md exceeds Codex's 32 KiB limit: https://github.com/intellectronica/ruler/issues/791. Writes the wrong key for Codex remote MCP headers: https://github.com/intellectronica/ruler/issues/789 |
| 38 | rulesync | dyoshikawa/rulesync | MIT / TypeScript | 1,552 / 2026-10-26 | Unified rule files generate each tool's config; import and export | Many (README); also MCP, hooks | Local, free; npm `rulesync` 42.0.0 | Constant follow-up on upstream format changes, e.g. https://github.com/dyoshikawa/rulesync/issues/2664 (27 comments) |
| 39 | Skills Manager | xingkongliang/skills-manager | MIT / Rust | 6,885 / 2026-10-21 | Desktop app that syncs agent skills across 50+ tools | 50+ tools (description) | Local, free; brew cask | App fails to open after update 1.36: https://github.com/xingkongliang/skills-manager/issues/412 |
| 40 | APM (Agent Package Manager) | microsoft/apm | MIT / Python | 4,130 / 2026-10-23 | Dependency manager for agent config, like a package manifest | Copilot, Claude Code, Cursor, OpenCode, Codex, Gemini, Windsurf, Kiro | Local, free; brew or PyPI `apm-cli` | 223 open issues; manages config, not memory. No single defect issue selected |
| 41 | Knowns | knowns-dev/knowns | MIT / Go | 250 / 2026-09-28 | Tasks, docs, specs and decisions as markdown in the repo, served over MCP | Claude Code, Codex, Cursor, Copilot, OpenCode | Local, free | Small project, 1 open issue; no defect evidence |
| 42 | SkillHub Local | mjalalimanesh/skillhub-local | MIT / TypeScript | 20 / 2026-10-10 | Dashboard for skills, memories, AGENTS.md, MCP across tools | Claude Code, Codex, Cursor, Gemini CLI, Windsurf, Cline and more | Local, free | 20 stars, created 2026-07-20. Show HN: https://news.ycombinator.com/item?id=49975380 |

## 6. IDE and chat built-in memory (5)

| # | Product | Source | Storage | Who writes it | Cross-tool | Price | Notes and weakness |
|--:|---|---|---|---|---|---|---|
| 43 | Claude Code memory (CLAUDE.md + auto memory) | https://code.claude.com/docs/en/memory | CLAUDE.md files; auto memory in `~/.claude/projects/<project>/memory/` | You write CLAUDE.md; Claude writes auto memory | Reads AGENTS.md in place of CLAUDE.md; auto memory is Claude-only | Included with the tool | Loads first 200 lines or 25KB of auto memory. The page says it is context, not enforced configuration |
| 44 | Cline Memory Bank | https://docs.cline.bot/features/memory-bank | Six markdown files in `memory-bank/` | Cline, on request; you can edit | Page says it can work with any tool that reads docs | Page states no cost | Works by a custom instruction telling Cline to read every file at the start of every task, which costs tokens each time |
| 45 | Gemini CLI GEMINI.md | https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html | `~/.gemini/GEMINI.md`, project and subdirectory files | You; `/memory add` appends to the global file | Filename configurable, so AGENTS.md can be listed | Page states no cost | `save_memory` tool not covered on that page, so not claimed |
| 46 | Codex memories | https://learn.chatgpt.com/docs/customization/memories?surface=app | `~/.codex/memories/` | Codex, in the background from idle chats | Local to the machine; Codex only | Included; off by default | Generation pauses under a rate-limit threshold. Page says keep required rules in AGENTS.md |
| 47 | Kiro steering | https://kiro.dev/docs/steering/ | `.kiro/steering/` and `~/.kiro/steering/` | You, or generated foundation files | Reads AGENTS.md; four inclusion modes in CLI V3 | Not stated | Only `always` files auto-load in CLI V1 and V2 |

Augment Code memories: `UNVERIFIED`. The page I tried (docs.augmentcode.com/setup-augment/memories) returned 404.

## 7. Research systems (4)

| # | Product | Repo | Licence / lang | Stars / last commit | Idea | Benchmark claim | Real weakness (source) |
|--:|---|---|---|---|---|---|---|
| 48 | HippoRAG | OSU-NLP-Group/HippoRAG | MIT / Python | 4,077 / 2026-10-06 | Graph plus personalised PageRank retrieval (NeurIPS'24 per repo description) | In MemoryAgentBench, HippoRAG-v2 scored 41.6 overall (peer-reviewed table) | Heavy OpenAI dependence in the README. PPR question: https://github.com/OSU-NLP-Group/HippoRAG/issues/166 |
| 49 | LightMem | zjunlp/LightMem | MIT / Python | 1,203 / 2026-10-26 | Lightweight memory-augmented generation (ICLR 2026 per description); ships a baseline harness for Mem0, A-MEM, LangMem | README links LoCoMo and LongMemEval reproduction scripts; numbers not read | PyPI `lightmem` is version 0.0.0, a placeholder. Security report of cross-user poisoning: https://github.com/zjunlp/LightMem/issues/86 |
| 50 | SimpleMem | aiming-lab/SimpleMem | MIT / Python | 3,849 / 2026-07-24 | Compression-first lifelong memory (ICML'26 per description) | "26.4% average F1 gain" on LoCoMo; Omni version F1 0.613 (README) | Token figure 531 per query is unexplained: https://github.com/aiming-lab/SimpleMem/issues/94. FTS index built only once: https://github.com/aiming-lab/SimpleMem/issues/78 |
| 51 | Engram (tstockham96) | tstockham96/engram | MIT / TypeScript | 47 / 2026-09-02 | SQLite memory layer with consolidation. Different repo from docs/21 #27 | LoCoMo 80.0% at 776 tokens/query vs 28.8% for appending facts to a markdown file (README) | 47 stars. Show HN: https://news.ycombinator.com/item?id=47116615 |

## 8. Other finds, not given a row

Names that surfaced and are real, but I did not read enough to fill a row. Stars from the GitHub search of 2026-10-26.

- Show HN, 2025-12 to 2026-09: ContextForge, Memctl, Hmem (Bumblebiber/hmem, 24 stars), Hive Memory (8 stars), Agent Recall (14 stars), CogmemAi, Tessera (18 stars), Nucleus MCP (5 stars), Friday, Aide-memory, Itsuki, Mex, Zerikai Memory. URLs in the sources file.
- GitHub topic hits not read: `eugeniughelbur/obsidian-second-brain` (4,931), `lucasrosati/claude-code-memory-setup` (1,044), `felinics/Memoh` (2,744), `activeloopai/hivemind` (1,636), `iwe-org/iwe` (1,796), `screenpipe/screenpipe` (22,074), `CaviraOSS/LongMemory` (4,544), `RedPlanetHQ/core` (2,001), `NateBJones-Projects/OB1` (4,742).
- Name clash warning: PyPI `agentmemory`, `mnemon` and npm `memora` are unrelated libraries, not the products above. Do not install by bare name.
- Awesome lists: `punkpeye/awesome-mcp-servers` has a "Knowledge & Memory" section with 138 list entries (my awk count of lines starting `- [`; approximate). `IAAR-Shanghai/Awesome-AI-Memory` (1,289 stars), `TeleAI-UAGI/Awesome-Agent-Memory` (696) and `topoteretes/awesome-ai-memory` (888) are curated lists. `hesreallyhim/awesome-claude-code` is a resource list; I did not scan it for memory entries.
- Reddit: one web search did not reach any Reddit thread. Reddit coverage is `UNVERIFIED`.

## 9. Refresh of 10 existing docs/21 products

Fetched 2026-10-26 with `gh api repos/<r>` and `commits?per_page=1`. docs/21 stars were fetched the same day, so star drift is small.

| docs/21 # | Project | Stars now (docs/21) | Last commit now (docs/21) | Licence / lang | Changed? |
|--:|---|---|---|---|---|
| 1 | claude-mem | 103,270 (103,244) | 2026-10-26 (2026-10-26) | Apache-2.0 / TypeScript | No. Latest release v15.2.1, published 2026-10-25, matches docs/21's npm 15.2.1 |
| 2 | Mem0 | 67,837 (67,835) | 2026-10-21 (2026-10-23) | Apache-2.0 / Python | Date differs: 2026-10-23 is `pushed_at`, not the default-branch commit. 876 open issues |
| 4 | Supermemory | 31,403 (31,401) | 2026-10-24 (2026-10-25) | MIT / TypeScript | Date differs by one day. Its research page now shows gpt-4o LongMemEval-S 97%; Mastra's page (updated 2026-02-17) lists 81.6% for the same model (see benchmarks) |
| 6 | Graphiti | 32,233 (32,229) | 2026-10-25 (2026-10-26) | Apache-2.0 / Python | No material change. 518 open issues |
| 7 | Letta | 25,260 (25,259) | `pushed_at` 2026-10-18 | Apache-2.0 / none reported | **Fact changed.** docs/21 says "archived repo". The API says `archived: false`. The README says Letta is "actively developed" and current code is in `letta-ai/letta-code` (README, fetched today). Fix the cell |
| 8 | Cognee | 32,770 (32,766) | 2026-10-16 (2026-10-26) | Apache-2.0 / Python | Date differs by 10 days: `pushed_at` is 2026-10-26, the default branch's last commit is 2026-10-16. 1,057 open issues |
| 12 | Hindsight | 53,989 (53,943) | 2026-10-26 (2026-10-26) | MIT / Python | No. New BEAM claims exist (see benchmarks) |
| 11 | Basic Memory | 4,359 (4,357) | 2026-10-25 (2026-10-26) | AGPL-3.0 / Python | No. PyPI 0.24.1 matches docs/21 |
| 25 | agentmemory | 29,900 (29,898) | 2026-10-25 (2026-10-26) | Apache-2.0 / TypeScript | No. 565 open issues |
| 27 | Engram (Gentleman-Programming) | 7,617 (7,616) | 2026-10-26 (2026-10-26) | MIT / Go | No. Another repo named Engram exists (#51 above) |

Summary of the refresh: one factual correction (Letta), and one method difference (docs/21 "last commit" looks like
`pushed_at`; the two are the same on some repos and 10 days apart on Cognee). Everything else moved by under 0.2% in
stars.

## 10. Notes on the new set

- The cheap wins are in the plugin group: deja-vu (indexes existing agent history, 43 agents), OwnMem and OKF (git-native markdown, no model call), and Hippo (outcome feedback). They overlap with Aletheia's local, tool-neutral pitch.
- Rules-sync is its own small group: Ruler, rulesync, Skills Manager, APM. None of the four stores memory. None of the memory tools sync rules. Aletheia combines both.
- Licence risk: AGPL-3.0 on OpenWolf, Honcho and SuperLocalMemory; NOASSERTION (no recognised licence file) on memU, YourMemory and ByteRover CLI; no licence at all on Ghost.
- Staleness: Grov (last commit 2026-01-29), a-mem-mcp (2026-01-17), Ghost (2026-03-18), MegaMemory (2026-05-03).
