# Research log

Every source fetched during this run. Date is the fetch date (UTC). If a fetch failed, the failure and what was used instead are recorded.

Run date: 2026-10-26. Branch: `docs/roadmap-and-research`.

## A. This repository (read locally, no URL)

| Date | Path | What it gave |
|---|---|---|
| 2026-10-26 | `README.md` | current claims, quick start, honest tool-test table, configuration |
| 2026-10-26 | `docs/11-feature-inventory.md` | prior claude-mem feature inventory at commit abd9aaa (15.2.0) |
| 2026-10-26 | `docs/14-research-ai-memory.md` | measured LoCoMo results and the benchmark-conflict table |
| 2026-10-26 | `docs/15-product-spec.md` | scorecard S1-S8, requirements FR-*, release gates |
| 2026-10-26 | `docs/17-tech-tasks.md` | existing epics E0-E9 and task estimates |
| 2026-10-26 | `docs/18-benchmark-plan.md` | datasets, protocol, commands, threats to validity |
| 2026-10-26 | `src/hub/*.mjs` | actual behaviour for every Aletheia status cell (line numbers cited in D1) |
| 2026-10-26 | `test/*.mjs` | test suite scope; run later for the run report |
| 2026-10-26 | `site/, .github/workflows/, scripts/` | current repo polish and CI state |

## B. claude-mem documentation (all pages listed in the sitemap)

| Date | URL | What it gave |
|---|---|---|
| 2026-10-26 | https://docs.claude-mem.ai/antigravity-cli/setup | Antigravity CLI Setup — Add persistent memory to Antigravity CLI with claude-mem |
| 2026-10-26 | https://docs.claude-mem.ai/architecture-evolution | Architecture Evolution — How claude-mem evolved from v3 to v5+ |
| 2026-10-26 | https://docs.claude-mem.ai/architecture/database | Database Architecture — SQLite schema, FTS5 search, and data storage |
| 2026-10-26 | https://docs.claude-mem.ai/architecture/hooks | Hook Lifecycle — Complete guide to the 5-stage memory agent lifecycle for platform implementers |
| 2026-10-26 | https://docs.claude-mem.ai/architecture/overview | Architecture Overview — System components and data flow in Claude-Mem |
| 2026-10-26 | https://docs.claude-mem.ai/architecture/pm2-to-bun-migration | PM2 to Bun Migration: Complete Technical Documentation — Complete technical documentation for the process management and database driver migration in v7.1.0 |
| 2026-10-26 | https://docs.claude-mem.ai/architecture/search-architecture | Search Architecture — MCP tools with 3-layer workflow for token-efficient memory retrieval |
| 2026-10-26 | https://docs.claude-mem.ai/architecture/worker-service | Worker Service — HTTP API and Bun process management |
| 2026-10-26 | https://docs.claude-mem.ai/cloud-sync | Cloud Sync (cmem.ai Pro) — Two-lane multi-device sync of your memory database — durable HTTP push/pull through a per-user sync hub, with  |
| 2026-10-26 | https://docs.claude-mem.ai/cmem-pro-headless | CMEM Pro (manual / headless) — What npx claude-mem install writes for CMEM Pro — OAuth pairing, settings.json keys, and how to verify without |
| 2026-10-26 | https://docs.claude-mem.ai/configuration | Configuration — Environment variables and settings for Claude-Mem |
| 2026-10-26 | https://docs.claude-mem.ai/configuration/custom-anthropic-backends | Custom Anthropic-Compatible Backends — Point claude-mem at bridged or self-hosted Anthropic-compatible API endpoints with ANTHROPIC_BASE_URL |
| 2026-10-26 | https://docs.claude-mem.ai/configuration/litellm-gateway | LiteLLM Gateway — Route claude-mem's Claude Agent SDK worker through LiteLLM while keeping one agentic execution path |
| 2026-10-26 | https://docs.claude-mem.ai/context-engineering | Context Engineering for AI Agents — Best practices for curating optimal token sets for AI agents |
| 2026-10-26 | https://docs.claude-mem.ai/cursor/gemini-setup | Cursor + Gemini Setup — Use Claude-Mem in Cursor with your Gemini API key |
| 2026-10-26 | https://docs.claude-mem.ai/cursor/index | Cursor Integration — Persistent memory for Cursor — install with npx, no git clone |
| 2026-10-26 | https://docs.claude-mem.ai/cursor/openrouter-setup | Cursor + OpenRouter Setup — Use Claude-Mem in Cursor with your OpenRouter key |
| 2026-10-26 | https://docs.claude-mem.ai/development | Development Guide — Build from source, run tests, and contribute to Claude-Mem |
| 2026-10-26 | https://docs.claude-mem.ai/file-read-gate | File Read Gate — How claude-mem intercepts file reads to save tokens using observation history |
| 2026-10-26 | https://docs.claude-mem.ai/grok-bot/index | Grok Bot Integration — Persistent memory for Grok Bot — no host hooks, no Claude CLI, no xAI API key |
| 2026-10-26 | https://docs.claude-mem.ai/hermes-integration | Hooks architecture — Hermes Agent remembers its work with claude-mem and shares one memory per project with your other coding agent |
| 2026-10-26 | https://docs.claude-mem.ai/hooks-architecture | How Claude-Mem Uses Hooks: A Lifecycle-Driven Architecture — **Observe the main Claude Code session from the outside, process observations in the background, inject contex |
| 2026-10-26 | https://docs.claude-mem.ai/hosted-server | Hosted Server (Beta) — Remote authenticated MCP recall, usage metering + quotas, and data deletion — how claude-mem's cloud server wo |
| 2026-10-26 | https://docs.claude-mem.ai/installation | Installation Guide — Install Claude-Mem plugin for persistent memory across sessions |
| 2026-10-26 | https://docs.claude-mem.ai/introduction | Claude-Mem — Persistent memory compression system for Claude Code |
| 2026-10-26 | https://docs.claude-mem.ai/kimi-integration | Install only the Kimi harness — Persistent memory for Kimi Code CLI — hook-based observation recording, prompt-submit context injection, and M |
| 2026-10-26 | https://docs.claude-mem.ai/modes | Modes & Languages — Configure Claude-Mem behavior and language with the Mode System |
| 2026-10-26 | https://docs.claude-mem.ai/notion-export | OpenClaw Integration — Push each new claude-mem observation to a Notion database in real time. |
| 2026-10-26 | https://docs.claude-mem.ai/openclaw-integration | With a specific AI provider — Persistent memory for OpenClaw agents — observation recording, system prompt context injection, and real-time  |
| 2026-10-26 | https://docs.claude-mem.ai/platform-integration | Progressive disclosure — Complete reference for integrating claude-mem worker service into VSCode extensions, IDE plugins, and CLI tool |
| 2026-10-26 | https://docs.claude-mem.ai/progressive-disclosure | Progressive Disclosure: Claude-Mem's Context Priming Philosophy — **Show what exists and its retrieval cost first. Let the agent decide what to fetch based on relevance and nee |
| 2026-10-26 | https://docs.claude-mem.ai/qoder-integration | Screenpipe Integration — Install claude-mem as a native Qoder plugin for the CLI or the IDE |
| 2026-10-26 | https://docs.claude-mem.ai/screenpipe-integration | Smart Explore Benchmark — Bring selected screen and meeting context into claude-mem with the bundled Screenpipe skill. |
| 2026-10-26 | https://docs.claude-mem.ai/smart-explore-benchmark | Smart Explore Benchmark — Token efficiency comparison between AST-based and traditional code exploration |
| 2026-10-26 | https://docs.claude-mem.ai/t3code-integration | Telemetry — Native Claude-Mem hooks and MCP search for T3 Code's Codex and Claude Code providers. |
| 2026-10-26 | https://docs.claude-mem.ai/telemetry | Telemetry — Anonymous usage analytics — on by default, fully documented, one command to opt out |
| 2026-10-26 | https://docs.claude-mem.ai/troubleshooting | Troubleshooting Guide — Common issues and solutions for Claude-Mem |
| 2026-10-26 | https://docs.claude-mem.ai/usage/auto-redaction | Auto-Redaction — Opt-in regex-based detection that replaces common secret patterns with <redacted/> placeholders before storage |
| 2026-10-26 | https://docs.claude-mem.ai/usage/claude-desktop | Should return: {"status":"ok"} — Use claude-mem memory search in Claude Desktop with MCP tools |
| 2026-10-26 | https://docs.claude-mem.ai/usage/export-import | Memory Export/Import Scripts — Share knowledge across claude-mem installations with duplicate prevention |
| 2026-10-26 | https://docs.claude-mem.ai/usage/folder-context | Recent Activity — Automatic per-folder CLAUDE.md files that provide directory-level context to Claude |
| 2026-10-26 | https://docs.claude-mem.ai/usage/gemini-provider | Gemini Provider — Use Google's Gemini API as an alternative to Claude for observation extraction |
| 2026-10-26 | https://docs.claude-mem.ai/usage/getting-started | Getting Started with Claude-Mem — Learn how Claude-Mem works automatically in the background |
| 2026-10-26 | https://docs.claude-mem.ai/usage/knowledge-agents | Knowledge Agents — Build queryable AI brains from your observation history |
| 2026-10-26 | https://docs.claude-mem.ai/usage/manual-recovery | Manual Recovery Guide — Recover stuck observations after worker crashes or restarts |
| 2026-10-26 | https://docs.claude-mem.ai/usage/memory-ingest | Memory Ingest — Import Claude Code's auto-memory markdown files directly into claude-mem as observations — no model spend |
| 2026-10-26 | https://docs.claude-mem.ai/usage/multi-key-rotation | Multi-Key Rotation — Configure several API keys per provider so a rate-limited or exhausted key rotates to the next one instead of  |
| 2026-10-26 | https://docs.claude-mem.ai/usage/my-work | OpenAI-Compatible Provider (NVIDIA NIM & others) — Follow recorded work, review completed results, and pick up the next human handoff on your own computer. |
| 2026-10-26 | https://docs.claude-mem.ai/usage/openai-compatible-provider | OpenAI-Compatible Provider — Run observation extraction on NVIDIA NIM, DeepSeek, Groq, Together, Ollama, LM Studio, or any OpenAI-compatibl |
| 2026-10-26 | https://docs.claude-mem.ai/usage/openrouter-provider | OpenRouter Provider — Access 100+ AI models through OpenRouter's unified API and run observation extraction off-plan |
| 2026-10-26 | https://docs.claude-mem.ai/usage/private-tags | Private Tags — Control what gets stored in memory with privacy tags |
| 2026-10-26 | https://docs.claude-mem.ai/usage/quota-fallback | Quota Fallback — Keep capturing memories on your Anthropic plan (or another provider) while the selected provider can't serve |
| 2026-10-26 | https://docs.claude-mem.ai/usage/search-tools | Smart Search (Default) — Search your project history with MCP tools |
| 2026-10-26 | https://docs.claude-mem.ai/usage/teambrain | documentation page — Bring your team's shared work beside your personal local workspace. |

## C. Other sources fetched directly

| Date | URL | What it gave |
|---|---|---|
| 2026-10-26 | https://docs.claude-mem.ai/sitemap.xml | list of all 54 documentation URLs and last-modified dates |
| 2026-10-26 | https://docs.claude-mem.ai/llms.txt | index of documentation pages with one-line descriptions |
| 2026-10-26 | https://docs.claude-mem.ai/llms-full.txt | complete text of all 54 documentation pages (715,578 bytes) used for the feature matrix |
| 2026-10-26 | https://github.com/thedotmack/claude-mem | README and repository landing page; initial fetch returned HTTP 502, retried through raw.githubusercontent.com |
| 2026-10-26 | https://raw.githubusercontent.com/thedotmack/claude-mem/main/README.md | README: badges, 32 README translations, feature list, install, architecture summary |
| 2026-10-26 | https://raw.githubusercontent.com/thedotmack/claude-mem/main/package.json | version 15.2.1, Apache-2.0, Node >=20.19, bin entry, published files |
| 2026-10-26 | https://api.github.com/repos/thedotmack/claude-mem | 103,244 stars, 9,115 forks, 95 open issues, Apache-2.0, TypeScript, pushed 2026-10-26T10:13:57Z |
| 2026-10-26 | https://api.github.com/repos/thedotmack/claude-mem/commits | latest commit 1ef0875 dated 2026-10-26T10:13:57Z (Notion export feature) |
| 2026-10-26 | https://api.github.com/repos/thedotmack/claude-mem/git/trees/main?recursive=1 | 3,291 tracked paths: docs/, .github/, plugin/, i18n, Docker, integrations |
| 2026-10-26 | https://api.github.com/repos/thedotmack/claude-mem/git/trees/main?recursive=1 (workflows) | .github/workflows/ci.yml, windows.yml, npm-publish.yml, docs deploy, issue templates |
| 2026-10-26 | https://api.github.com/repos/thedotmack/claude-mem/git/trees/main?recursive=1 (i18n) | 32 README translations: ar bn cs da de el es fi fr he hi hu id it ja ko nl no pl pt pt-br ro ru sv th tl tr uk ur vi zh zh-tw |
| 2026-10-26 | https://api.github.com/repos/thedotmack/claude-mem/git/trees/main?recursive=1 (modes) | 35 mode JSON files, 29 language modes plus chill, law-study, meme-tokens, email-investigation |
| 2026-10-26 | https://api.github.com/repos/agiresearch/A-mem | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/agiresearch/A-mem/HEAD/README.md | README used for the competitor row (6390 bytes) |
| 2026-10-26 | https://api.github.com/repos/alioshr/memory-bank-mcp | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/alioshr/memory-bank-mcp/HEAD/README.md | README used for the competitor row (7074 bytes) |
| 2026-10-26 | https://api.github.com/repos/All-Hands-AI/OpenHands | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/All-Hands-AI/OpenHands/HEAD/README.md | README used for the competitor row (13268 bytes) |
| 2026-10-26 | https://api.github.com/repos/BAI-LAB/MemoryOS | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/BAI-LAB/MemoryOS/HEAD/README.md | README used for the competitor row (20378 bytes) |
| 2026-10-26 | https://api.github.com/repos/basicmachines-co/basic-memory | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/basicmachines-co/basic-memory/HEAD/README.md | README used for the competitor row (24832 bytes) |
| 2026-10-26 | https://api.github.com/repos/block/goose | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/block/goose/HEAD/README.md | README used for the competitor row (3449 bytes) |
| 2026-10-26 | https://api.github.com/repos/cline/cline | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/cline/cline/HEAD/README.md | README used for the competitor row (9244 bytes) |
| 2026-10-26 | https://api.github.com/repos/coleam00/claude-memory-compiler | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/coleam00/claude-memory-compiler/HEAD/README.md | README used for the competitor row (3865 bytes) |
| 2026-10-26 | https://api.github.com/repos/continuedev/continue | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/continuedev/continue/HEAD/README.md | README used for the competitor row (2791 bytes) |
| 2026-10-26 | https://api.github.com/repos/DeusData/codebase-memory-mcp | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/HEAD/README.md | README used for the competitor row (114806 bytes) |
| 2026-10-26 | https://api.github.com/repos/doobidoo/mcp-memory-service | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/doobidoo/mcp-memory-service/HEAD/README.md | README used for the competitor row (17159 bytes) |
| 2026-10-26 | https://api.github.com/repos/gastownhall/beads | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/gastownhall/beads/HEAD/README.md | README used for the competitor row (20184 bytes) |
| 2026-10-26 | https://api.github.com/repos/Gentleman-Programming/engram | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/Gentleman-Programming/engram/HEAD/README.md | README used for the competitor row (25718 bytes) |
| 2026-10-26 | https://api.github.com/repos/getzep/graphiti | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/getzep/graphiti/HEAD/README.md | README used for the competitor row (35219 bytes) |
| 2026-10-26 | https://api.github.com/repos/getzep/zep | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/getzep/zep/HEAD/README.md | README used for the competitor row (3362 bytes) |
| 2026-10-26 | https://api.github.com/repos/GibsonAI/Memori | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/GibsonAI/Memori/HEAD/README.md | README used for the competitor row (13474 bytes) |
| 2026-10-26 | https://api.github.com/repos/google-gemini/gemini-cli | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/google-gemini/gemini-cli/HEAD/README.md | README used for the competitor row (12107 bytes) |
| 2026-10-26 | https://api.github.com/repos/GreatScottyMac/context-portal | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/GreatScottyMac/context-portal/HEAD/README.md | README used for the competitor row (23634 bytes) |
| 2026-10-26 | https://api.github.com/repos/HelloRuru/claude-memory-engine | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/HelloRuru/claude-memory-engine/HEAD/README.md | README used for the competitor row (24307 bytes) |
| 2026-10-26 | https://api.github.com/repos/kuitos/opencode-claude-memory | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/kuitos/opencode-claude-memory/HEAD/README.md | README used for the competitor row (17028 bytes) |
| 2026-10-26 | https://api.github.com/repos/langchain-ai/langmem | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/langchain-ai/langmem/HEAD/README.md | README used for the competitor row (5205 bytes) |
| 2026-10-26 | https://api.github.com/repos/letta-ai/letta | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/letta-ai/letta/HEAD/README.md | README used for the competitor row (1477 bytes) |
| 2026-10-26 | https://api.github.com/repos/mastra-ai/mastra | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/mastra-ai/mastra/HEAD/README.md | README used for the competitor row (7195 bytes) |
| 2026-10-26 | https://api.github.com/repos/mem0ai/mem0 | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/mem0ai/mem0/HEAD/README.md | README used for the competitor row (12306 bytes) |
| 2026-10-26 | https://api.github.com/repos/mem0ai/openmemory | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/mem0ai/openmemory/HEAD/README.md | README used for the competitor row (2737 bytes) |
| 2026-10-26 | https://api.github.com/repos/MemMachine/MemMachine | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/MemMachine/MemMachine/HEAD/README.md | README used for the competitor row (8052 bytes) |
| 2026-10-26 | https://api.github.com/repos/memodb-io/memobase | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/memodb-io/memobase/HEAD/README.md | README used for the competitor row (14 bytes) |
| 2026-10-26 | https://api.github.com/repos/memvid/memvid | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/memvid/memvid/HEAD/README.md | README used for the competitor row (16847 bytes) |
| 2026-10-26 | https://api.github.com/repos/mksglu/context-mode | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/mksglu/context-mode/HEAD/README.md | README used for the competitor row (94871 bytes) |
| 2026-10-26 | https://api.github.com/repos/modelcontextprotocol/servers | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/modelcontextprotocol/servers/HEAD/README.md | README used for the competitor row (8707 bytes) |
| 2026-10-26 | https://api.github.com/repos/modelscope/MemoryScope | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/modelscope/MemoryScope/HEAD/README.md | README used for the competitor row (29790 bytes) |
| 2026-10-26 | https://api.github.com/repos/obra/superpowers | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/obra/superpowers/HEAD/README.md | README used for the competitor row (14847 bytes) |
| 2026-10-26 | https://api.github.com/repos/openai/codex | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/openai/codex/HEAD/README.md | README used for the competitor row (3334 bytes) |
| 2026-10-26 | https://api.github.com/repos/rohitg00/agentmemory | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/rohitg00/agentmemory/HEAD/README.md | README used for the competitor row (94194 bytes) |
| 2026-10-26 | https://api.github.com/repos/sdsrss/claude-mem-lite | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/sdsrss/claude-mem-lite/HEAD/README.md | README used for the competitor row (122671 bytes) |
| 2026-10-26 | https://api.github.com/repos/shaneholloman/mcp-knowledge-graph | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/shaneholloman/mcp-knowledge-graph/HEAD/README.md | README used for the competitor row (9001 bytes) |
| 2026-10-26 | https://api.github.com/repos/sst/opencode | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/sst/opencode/HEAD/README.md | README used for the competitor row (4668 bytes) |
| 2026-10-26 | https://api.github.com/repos/supermemoryai/supermemory | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/supermemoryai/supermemory/HEAD/README.md | README used for the competitor row (17242 bytes) |
| 2026-10-26 | https://api.github.com/repos/TencentCloud/TencentDB-Agent-Memory | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/TencentCloud/TencentDB-Agent-Memory/HEAD/README.md | README used for the competitor row (21834 bytes) |
| 2026-10-26 | https://api.github.com/repos/thedotmack/claude-mem | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/thedotmack/claude-mem/HEAD/README.md | README used for the competitor row (20457 bytes) |
| 2026-10-26 | https://api.github.com/repos/topoteretes/cognee | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/topoteretes/cognee/HEAD/README.md | README used for the competitor row (18243 bytes) |
| 2026-10-26 | https://api.github.com/repos/vectorize-io/hindsight | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/vectorize-io/hindsight/HEAD/README.md | README used for the competitor row (24997 bytes) |
| 2026-10-26 | https://api.github.com/repos/volcengine/OpenViking | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/volcengine/OpenViking/HEAD/README.md | README used for the competitor row (26983 bytes) |
| 2026-10-26 | https://api.github.com/repos/WhenMoon-afk/claude-memory-mcp | repository metadata (stars, last push, licence, language, open issues) — fetched |
| 2026-10-26 | https://raw.githubusercontent.com/WhenMoon-afk/claude-memory-mcp/HEAD/README.md | README used for the competitor row (2837 bytes) |
| 2026-10-26 | https://api.github.com/search/repositories?q=claude-mem+in:name | top claude-mem clones and derivatives by stars |
| 2026-10-26 | https://api.github.com/search/repositories?q=memory+mcp+in:name,description | MCP memory servers and context tools by stars |
| 2026-10-26 | https://api.github.com/search/repositories?q=agent+memory+in:description | agent-memory projects by stars |
| 2026-10-26 | https://api.github.com/search/repositories?q=memory+bank+mcp+in:name,description | memory-bank MCP servers |
| 2026-10-26 | https://api.github.com/search/repositories?q=MemOS+memory+in:name,description | located MemTensor/MemOS |
| 2026-10-26 | https://api.npmjs.org/downloads/point/last-month/claude-mem | last-month npm downloads (or 404; recorded in D2) |
| 2026-10-26 | https://api.npmjs.org/downloads/point/last-month/@modelcontextprotocol/server-memory | last-month npm downloads (or 404; recorded in D2) |
| 2026-10-26 | https://api.npmjs.org/downloads/point/last-month/mem0ai | last-month npm downloads (or 404; recorded in D2) |
| 2026-10-26 | https://api.npmjs.org/downloads/point/last-month/supermemory | last-month npm downloads (or 404; recorded in D2) |
| 2026-10-26 | https://api.npmjs.org/downloads/point/last-month/@mastra/memory | last-month npm downloads (or 404; recorded in D2) |
| 2026-10-26 | https://api.npmjs.org/downloads/point/last-month/basic-memory | last-month npm downloads (or 404; recorded in D2) |
| 2026-10-26 | https://api.npmjs.org/downloads/point/last-month/@mem0/openmemory | last-month npm downloads (or 404; recorded in D2) |
| 2026-10-26 | https://pypi.org/pypi/mem0ai/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/zep-cloud/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/graphiti-core/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/letta/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/cognee/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/langmem/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/memori/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/basic-memory/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/hindsight-client/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/memmachine/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/memobase/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://pypi.org/pypi/memvid/json | latest PyPI version and licence metadata (or 404) |
| 2026-10-26 | https://arxiv.org/abs/2410.10813 | title, date and abstract fetched via the arXiv API; benchmark numbers quoted only from the abstract |
| 2026-10-26 | https://arxiv.org/abs/2504.19413 | title, date and abstract fetched via the arXiv API; benchmark numbers quoted only from the abstract |
| 2026-10-26 | https://arxiv.org/abs/2501.13956 | title, date and abstract fetched via the arXiv API; benchmark numbers quoted only from the abstract |
| 2026-10-26 | https://arxiv.org/abs/2512.12818 | title, date and abstract fetched via the arXiv API; benchmark numbers quoted only from the abstract |
| 2026-10-26 | https://arxiv.org/abs/2510.27246 | title, date and abstract fetched via the arXiv API; benchmark numbers quoted only from the abstract |
| 2026-10-26 | https://arxiv.org/abs/2507.05257 | title, date and abstract fetched via the arXiv API; benchmark numbers quoted only from the abstract |
| 2026-10-26 | https://arxiv.org/abs/2601.02553 | title, date and abstract fetched via the arXiv API; benchmark numbers quoted only from the abstract |
| 2026-10-26 | https://arxiv.org/abs/2602.11988 | title, date and abstract fetched via the arXiv API; benchmark numbers quoted only from the abstract |
| 2026-10-26 | https://arxiv.org/abs/2602.13933 | title, date and abstract fetched via the arXiv API; benchmark numbers quoted only from the abstract |
| 2026-10-26 | https://arxiv.org/abs/2604.08216 | title, date and abstract fetched via the arXiv API; benchmark numbers quoted only from the abstract |
| 2026-10-26 | http://export.arxiv.org/api/query?id_list=2410.10813,2504.19413,2501.13956,2512.12818,2510.27246,2507.05257,2601.02553,2602.11988,2602.13933,2604.08216 | one API response with all ten abstracts |
| 2026-10-26 | https://docs.cursor.com/en/context/memories | Cursor memories/rules documentation page (HTTP 200; navigation text extracted, page body JavaScript-rendered so specifics are marked UNVERIFIED) |
| 2026-10-26 | https://help.openai.com/en/articles/8590148-memory-faq | OpenAI Memory FAQ (HTTP 403 to curl; content not read, so ChatGPT memory details are UNVERIFIED) |
| 2026-10-26 | https://openai.com/index/memory-and-new-controls-for-chatgpt/ | OpenAI memory announcement (HTTP 403; not read) |
| 2026-10-26 | https://docs.anthropic.com/en/docs/agents-and-tools/tool-use/memory-tool | Claude memory tool documentation (HTTP 200; page text extracted) |
| 2026-10-26 | https://support.google.com/gemini/answer/16275805 | Gemini Apps limits page (HTTP 200; this is not the memory page; Gemini memory marked UNVERIFIED) |
| 2026-10-26 | https://support.google.com/gemini/answer/16198151 | attempted Gemini memory page (HTTP 404) |
| 2026-10-26 | https://docs.windsurf.com/windsurf/cascade/memories | Windsurf Cascade Memories & Rules documentation (HTTP 200; page text extracted) |
| 2026-10-26 | https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-agent-memories | attempted GitHub Copilot memory page (HTTP 404; Copilot memory marked UNVERIFIED) |
| 2026-10-26 | https://docs.github.com/en/copilot/concepts/agents/coding-agent/memory | second attempted Copilot memory page (HTTP 404) |
| 2026-10-26 | https://html.duckduckgo.com/html/?q=ChatGPT+memory+help+openai+memory+faq | search results locating the OpenAI help pages (which then returned 403) |
| 2026-10-26 | https://html.duckduckgo.com/html/?q=Gemini+Apps+memory+saved+info+support | search results; no canonical Google memory page could be fetched |
| 2026-10-26 | https://html.duckduckgo.com/html/?q=GitHub+Copilot+agent+memory+docs | search returned no usable GitHub Docs result |
| 2026-10-26 | https://docs.claude-mem.ai/introduction | introduction page fetched directly (HTTP 200) to confirm the llms-full text |
| 2026-10-26 | https://raw.githubusercontent.com/hesreallyhim/awesome-claude-code/HEAD/README.md | list contents and structure |
| 2026-10-26 | https://raw.githubusercontent.com/hesreallyhim/awesome-claude-code/HEAD/CONTRIBUTING.md | submission rules: 14 days old and active, or >=100 stars; one resource per PR |
| 2026-10-26 | https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/HEAD/README.md | list contents; public GitHub repo, self-installable servers only |
| 2026-10-26 | https://raw.githubusercontent.com/punkpeye/awesome-mcp-servers/HEAD/CONTRIBUTING.md | fork, branch, PR workflow; agent PRs opt in with 🤖🤖🤖 |
| 2026-10-26 | https://raw.githubusercontent.com/modelcontextprotocol/registry/HEAD/README.md | publishing is via the mcp-publisher CLI, not a PR |
| 2026-10-26 | https://raw.githubusercontent.com/awesome-selfhosted/awesome-selfhosted/HEAD/README.md | list structure and contributing pointer (its CONTRIBUTING.md returned 404 at the tried path) |
| 2026-10-26 | https://raw.githubusercontent.com/sindresorhus/awesome/HEAD/contributing.md | general awesome-list PR rules and Code of Conduct |
| 2026-10-26 | https://mcp.so | directory with a Submit entry point (HTTP 200) |
| 2026-10-26 | https://smithery.ai | directory landing page (HTTP 200; submission steps UNVERIFIED) |
| 2026-10-26 | https://glama.ai/mcp/servers | directory with "Add Server" (HTTP 200) |
| 2026-10-26 | https://www.pulsemcp.com | HTTP 403; submission steps UNVERIFIED |
| 2026-10-26 | https://registry.modelcontextprotocol.io | official registry landing page (HTTP 200) |

## D. Fetch failures and how they were handled

- `https://docs.claude-mem.ai/introduction` and `https://github.com/thedotmack/claude-mem` through the built-in web fetcher: HTTP 502. Retried with `curl`; both succeeded. No fact depends on the failed path.
- OpenAI help pages: HTTP 403. ChatGPT memory is therefore recorded as `UNVERIFIED`, not described from memory.
- GitHub Copilot memory docs: two guessed URLs returned 404 and the search returned no result. Recorded as `UNVERIFIED`.
- Gemini memory: the Google support URL tried returned a limits page, not the memory page. Recorded as `UNVERIFIED`.
- `pypi.org` returned 404 for `memmachine`; the project is installed from GitHub or Docker, so no PyPI figure is claimed.
- `api.npmjs.org` returned 404 for `basic-memory` and `@mem0/openmemory`; both are Python or differently named packages. No npm figure is claimed for them.

## E. Additional fetches made while writing documents 21 to 24

| Date | URL | What it gave |
|---|---|---|
| 2026-10-26 | https://docs.mem0.ai/openmemory/overview | mem0 documentation index; it does not list an OpenMemory page, so mem0's OpenMemory is recorded from the `mem0ai/openmemory` repository instead |
| 2026-10-26 | https://docs.mem0.ai/integrations/mcp | Mem0 MCP exists; supported clients listed as Claude, Claude Code, Codex, Cursor, Windsurf, VS Code, OpenCode |
| 2026-10-26 | https://docs.mem0.ai/llms.txt | mem0 documentation index; grep for "openmemory" returned nothing |
| 2026-10-26 | https://r.jina.ai/https://help.openai.com/en/articles/8590148-memory-faq | plain-text proxy of the OpenAI Memory FAQ (HTTP 200); ChatGPT memory sources and controls |
| 2026-10-26 | https://r.jina.ai/https://docs.github.com/en/copilot/how-tos/use-copilot-agents/coding-agent/use-agent-memories | proxy returned a 404 page; Copilot memory remains UNVERIFIED |
| 2026-10-26 | https://r.jina.ai/https://support.google.com/gemini/answer/16275805 | proxy returned the Gemini limits page, not a memory page; Gemini memory remains UNVERIFIED |
| 2026-10-26 | https://docs.cursor.com/llms-full.txt | returned HTML, not a text index; Cursor memory specifics remain UNVERIFIED |

## F. Fetches for the experiment plan (document 22)

| Date | URL | What it gave |
|---|---|---|
| 2026-10-26 | https://huggingface.co/api/models/BAAI/bge-small-en-v1.5 | 33,360,512 parameters, MIT |
| 2026-10-26 | https://huggingface.co/api/models/BAAI/bge-base-en-v1.5 | 109,482,752 parameters, MIT |
| 2026-10-26 | https://huggingface.co/api/models/BAAI/bge-large-en-v1.5 | 335,142,400 parameters, MIT |
| 2026-10-26 | https://huggingface.co/api/models/sentence-transformers/all-MiniLM-L6-v2 | 22,713,728 parameters, Apache-2.0 |
| 2026-10-26 | https://huggingface.co/api/models/intfloat/e5-small-v2 | 33,360,512 parameters, MIT |
| 2026-10-26 | https://huggingface.co/api/models/intfloat/e5-base-v2 | 109,482,752 parameters, MIT |
| 2026-10-26 | https://huggingface.co/api/models/intfloat/multilingual-e5-small | 117,654,272 parameters, MIT |
| 2026-10-26 | https://huggingface.co/api/models/nomic-ai/nomic-embed-text-v1.5 | 136,731,648 parameters, Apache-2.0 |
| 2026-10-26 | https://huggingface.co/api/models/mixedbread-ai/mxbai-embed-large-v1 | 335,141,888 parameters, Apache-2.0 |
| 2026-10-26 | https://huggingface.co/api/models/Snowflake/snowflake-arctic-embed-s | 33,212,160 parameters, Apache-2.0 |
| 2026-10-26 | https://huggingface.co/api/models/jinaai/jina-embeddings-v3 | 572,310,396 parameters, CC-BY-NC-4.0 (non-commercial) |
| 2026-10-26 | https://huggingface.co/api/models/cross-encoder/ms-marco-MiniLM-L-6-v2 | 22,714,113 parameters, Apache-2.0 |
| 2026-10-26 | https://huggingface.co/api/models/cross-encoder/ms-marco-MiniLM-L-12-v2 | 33,360,897 parameters, Apache-2.0 |
| 2026-10-26 | https://huggingface.co/api/models/BAAI/bge-reranker-base | 278,044,931 parameters, MIT |
| 2026-10-26 | https://huggingface.co/api/models/BAAI/bge-reranker-v2-m3 | 567,755,777 parameters, Apache-2.0 |
| 2026-10-26 | https://huggingface.co/api/models/mixedbread-ai/mxbai-rerank-large-v1 | 435,062,785 parameters, Apache-2.0 |
| 2026-10-26 | https://huggingface.co/api/models/jinaai/jina-reranker-v2-base-multilingual | 278,437,633 parameters, CC-BY-NC-4.0 (non-commercial) |
| 2026-10-26 | https://sqlite.org/fts5.html | FTS5 index, bm25(), optimize, prefix indexes |
| 2026-10-26 | https://raw.githubusercontent.com/asg017/sqlite-vec/HEAD/README.md | sqlite-vec description; repository licence Apache-2.0 |
| 2026-10-26 | https://raw.githubusercontent.com/nmslib/hnswlib/HEAD/README.md | HNSW implementation description; repository licence Apache-2.0 |
| 2026-10-26 | https://raw.githubusercontent.com/facebookresearch/faiss/HEAD/README.md | FAISS description; repository licence MIT |
| 2026-10-26 | https://raw.githubusercontent.com/unum-cloud/usearch/HEAD/README.md | USearch description; repository licence Apache-2.0 |
| 2026-10-26 | https://arxiv.org/abs/1603.09320 | HNSW paper abstract (approximate nearest neighbour) |
| 2026-10-26 | https://arxiv.org/abs/2307.03172 | Lost in the Middle abstract (position-dependent context use) |
| 2026-10-26 | https://arxiv.org/abs/2212.10496 | HyDE abstract (hypothetical document embeddings) |
| 2026-10-26 | https://arxiv.org/abs/2306.05685 | LLM-as-a-judge abstract (position, verbosity, self-enhancement biases) |
| 2026-10-26 | https://www.anthropic.com/news/contextual-retrieval | contextual retrieval: 49% fewer failed retrievals, 67% with reranking |
| 2026-10-26 | https://www.trychroma.com/research/context-rot | context rot: performance degrades as input grows; distractors hurt |
| 2026-10-26 | https://www.sbert.net/examples/applications/retrieve_rerank/README.html | retrieve-and-rerank guide (cross-encoder reads query+document together) |

## G. Fetches for the repository parity and growth plan (document 24)

| Date | URL | What it gave |
|---|---|---|
| 2026-10-26 | https://api.github.com/repos/mohamed-ashraf-elsaed/aletheia-mem | current public state: 0 stars, public, Apache-2.0, 12 topics, Discussions disabled, last push 2026-10-26T09:24:31Z |
| 2026-10-26 | https://registry.npmjs.org/aletheia-mem | HTTP 404: the package is not published |
| 2026-10-26 | https://registry.npmjs.org/aletheia | HTTP 200: the name belongs to a different, experimental package; do not use it |
| 2026-10-26 | https://news.ycombinator.com/showhn.html | Show HN rules: runnable, no sign-up barrier, title begins "Show HN", no friends' upvotes |
| 2026-10-26 | https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies | section 4 prohibits rank abuse such as automated starring, and inauthentic interactions |
| 2026-10-26 | https://www.reddit.com/r/ClaudeAI/about/rules.json | HTTP 403: subreddit rules not read; marked UNVERIFIED |
| 2026-10-26 | https://www.reddit.com/r/LocalLLaMA/about/rules.json | HTTP 403: subreddit rules not read; marked UNVERIFIED |
| 2026-10-26 | https://www.reddit.com/r/mcp/about/rules.json | HTTP 403: subreddit rules not read; marked UNVERIFIED |

## H. URLs referenced in the documents but not fetched as sources

| Date | URL | Status |
|---|---|---|
| 2026-10-26 | https://github.com/hesreallyhim/awesome-claude-code | Referenced; the repository README and CONTRIBUTING were fetched, the HTML page was not |
| 2026-10-26 | https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg | Proposed badge endpoint; not fetched |
| 2026-10-26 | https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem | Proposed badge endpoint; not fetched |
| 2026-10-26 | https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem | Proposed badge endpoint; not fetched |
| 2026-10-26 | https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem | Proposed badge endpoint; not fetched |
| 2026-10-26 | https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem | Proposed badge endpoint; not fetched |
| 2026-10-26 | https://img.shields.io/badge/status-alpha-orange | Proposed static badge; not fetched |
| 2026-10-26 | https://img.shields.io/badge/bun-%3E%3D1.1-black | Proposed static badge; not fetched |
| 2026-10-26 | https://img.shields.io/badge/platform-linux%20(tested)-lightgrey | Proposed static badge; not fetched |
| 2026-10-26 | https://mohamed-ashraf-elsaed.github.io/aletheia-mem/ | Homepage from repository metadata; site files read locally, URL not fetched |
| 2026-10-26 | https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json | Dataset URL from the existing benchmark plan; not fetched in this run |

## I. Full-text verification of numbers quoted in documents 22 and 23

| Date | URL | What it gave |
|---|---|---|
| 2026-10-26 | https://arxiv.org/html/2410.10813 | full text: fact-augmented keys improve recall@k by 9.4% and accuracy by 5.4%; time-aware query expansion improves temporal recall by 6.8%–11.3% with a strong LLM |
| 2026-10-26 | https://arxiv.org/html/2512.12818 | full text: 2–5 comprehensive facts per conversation; coreference resolution, temporal expression normalisation, entity resolution; LongMemEval 39% → 83.6% and 91.4%, LoCoMo 89.61% |
| 2026-10-26 | https://arxiv.org/html/2501.13956 | full text: `valid_at`/`invalid_at` edge facts and the bi-temporal model (event time and ingestion time) |
| 2026-10-26 | https://docs.claude-mem.ai/cursor | HTTP 200 on re-fetch during verification; page cited by matrix row F-I13 |
| 2026-10-26 | https://docs.claude-mem.ai/grok-bot | HTTP 200 on re-fetch during verification; page cited by matrix row F-I26 |
