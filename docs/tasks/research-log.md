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
| date | URL | what it gave |
| 2026-10-26 | https://cmem.ai | Home: Pro = hosted observation, cloud sync, private MCP link; $30/month after 30 day trial; TeamBrain pilot, no public price; local engine free |
| 2026-10-26 | https://cmem.ai/pricing | Tiers Pro $30, Heavy $70, Max $100 (+billed overage); trial rules (card needed, no prepaid, ends at 30 days or usage spent); TeamBrain price not public; FAQ on storage |
| 2026-10-26 | https://cmem.ai/pro | Fetched; server HTML held only nav and footer text. Content UNVERIFIED |
| 2026-10-26 | https://cmem.ai/teambrain | TeamBrain marketing: shared tasks, handoffs, each member opts in per project, owner holds billing and invites |
| 2026-10-26 | https://cmem.ai/design-partners | TeamBrain pilot: 8-team cohort, 2 enrolled, price agreed on a fit call, shared memory and access controls still in development |
| 2026-10-26 | https://cmem.ai/features | Features page: capture, search, sync; says MCP recall alone does not capture |
| 2026-10-26 | https://cmem.ai/dreaming | Hosted observation described as background observer that CMEM Pro runs on its hosted service |
| 2026-10-26 | https://cmem.ai/security | Security page: shared activity log and alerts use the user's own security checks; mechanism not described |
| 2026-10-26 | https://cmem.ai/privacy | Privacy: sync is opt-in; MCP link is a secret URL, can be reissued; account deletion erases cloud data; no training on memory |
| 2026-10-26 | https://cmem.ai/terms | Terms: paid plans billed through Stripe; service may change or be discontinued; as-is, user keeps own backups |
| 2026-10-26 | https://cmem.ai/chatgpt | ChatGPT connection: read-only, OAuth, needs Developer mode and Pro or trial; revocable; does not capture ChatGPT chats |
| 2026-10-26 | https://cmem.ai/chatgpt-install.md | Exact connector setup: MCP URL https://cmem.ai/api/mcp, OAuth, tool names memory_search, timeline, get_observations, get_summaries |
| 2026-10-26 | https://cmem.ai/integrations | Capture vs recall split; private MCP link usable from Cursor, Codex, Gemini CLI, Windsurf |
| 2026-10-26 | https://cmem.ai/how-it-works | Local-first architecture statement: SQLite plus FTS5, optional cloud sync carries finished memory |
| 2026-10-26 | https://cmem.ai/knowledge-agents | Knowledge agents page (no pricing, no hosted claim) |
| 2026-10-26 | https://cmem.ai/changelog | Release notes: 13.34.1 30-day trial copy; 13.26.1 cloud sync auth pause; 15.2.1 latest |
| 2026-10-26 | https://cmem.ai/.well-known/oauth-protected-resource | OAuth protected-resource metadata for https://cmem.ai/api/mcp: scopes read:memory, spend:inference |
| 2026-10-26 | https://cmem.ai/api/mcp | Unauthenticated GET returned 401 invalid_token (confirms bearer/OAuth gate) |
| 2026-10-26 | https://cmem.ai/connect | Redirects to login (GitHub or Google OAuth). Page content behind login, UNVERIFIED |
| 2026-10-26 | https://cmem.ai/dashboard | Redirects to login. Dashboard content UNVERIFIED |
| 2026-10-26 | https://cmem.ai/teambrain/start | Redirects to login. Team plan and seat price UNVERIFIED |
| 2026-10-26 | https://docs.claude-mem.ai/llms.txt | Docs index; used to find every hosted, sync, TeamBrain and Pro page |
| 2026-10-26 | https://docs.claude-mem.ai/sitemap.xml | Fetched (HTTP 200); llms.txt used as the page list |
| 2026-10-26 | https://docs.claude-mem.ai/cloud-sync.md | Cloud sync: what syncs, push and pull lanes, batching limits, 64 device cap, settings, status endpoint, privacy warning |
| 2026-10-26 | https://docs.claude-mem.ai/hosted-server.md | Hosted server beta: Postgres plus BullMQ, api keys, /v1/mcp, rate limits, quotas, metering, deletion, audit, pgvector search, endpoint list |
| 2026-10-26 | https://docs.claude-mem.ai/cmem-pro-headless.md | Installer OAuth pairing, settings keys, cmem-observer gateway base URL, fallback behaviour |
| 2026-10-26 | https://docs.claude-mem.ai/usage/teambrain.md | TeamBrain client flow: invite join, per-member sharing, board, no browser tokens |
| 2026-10-26 | https://docs.claude-mem.ai/usage/my-work.md | My Work is local; Connect Claude.ai/ChatGPT buttons open CMEM Cloud setup; TeamBrain tab |
| 2026-10-26 | https://docs.claude-mem.ai/usage/backups.md | Local snapshots; cloud sync and backups differ |
| 2026-10-26 | https://docs.claude-mem.ai/usage/knowledge-agents.md | Knowledge agents are local corpus files primed into a Claude session |
| 2026-10-26 | https://docs.claude-mem.ai/telemetry.md | Telemetry whitelist (PostHog), includes trial and funnel fields; opt-out |
| 2026-10-26 | https://docs.claude-mem.ai/usage/export-import.md | Local export/import (free) |
| 2026-10-26 | https://docs.claude-mem.ai/usage/quota-fallback.md | Free quota fallback feature (not paid) |
| 2026-10-26 | https://docs.claude-mem.ai/usage/multi-key-rotation.md | Free multi-key rotation (not paid) |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/docs/ip-boundary.md | List of reserved commercial/private areas: hosted cloud, team sync, admin dashboard, SSO/SAML/SCIM, RBAC, audit UI, DLP, premium knowledge agents, managed evals |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/docs/license.md | Apache-2.0 core; reserved areas not shipped |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/docs/server-architecture-and-team-vision.md | Server-beta design: identity triad, team/project scope, local-hook-team mapping, audit chain |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/services/sync-api/src/index.ts | Hub routes /v1/sync/ops, /changes, /status, /ws; internal routes; limits 500 ops, 8 MB; per-user lock; 503 retryable |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/services/sync-api/src/store.ts | pushOps conflict rules (stale_revision, revision_hash_conflict), device cap 64, getChanges snapshot, fan-out |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/services/sync-api/src/schema.ts | Hub tables sync_users, sync_ops, sync_entity_heads, sync_devices; no retention or compaction |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/services/sync-api/src/auth.ts | Bearer plus X-User-Id verified against cmem.ai /api/pro/sync/verify; 900 s verdict cache; 401 vs 403 subscription_inactive |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/services/sync-api/src/canonical-content.ts | Canonical op body: fields, kinds, tombstone shape, 256000 byte cap, stable id hash, payload fields |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/services/sync-api/src/projection.ts | Hub forwards ops to the Pro app (projection) before returning 200 |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/services/sync-api/src/projection-protocol.ts | Projection request wire format, 100 ops / 4 MB pages, 45 s timeout |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/services/sync-api/fly.toml | Hub deploy config: Fly, TOKEN_VERIFY_URL and INTERNAL_PROJECTOR_URL on cmem.ai; forward-mode note to a Supabase function |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/services/sync-api/.env.example | Hub env: DATABASE_URL, TOKEN_VERIFY_URL, INTERNAL_PROJECTOR_URL, CMEM_INTERNAL_PROJECTOR_SECRET |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/workers/sync-hub/src/kill-switch.ts | Cloudflare Worker hub variant; kill switch to poll mode; cost note about 0.03 USD per user per month |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/workers/sync-hub/METADATA-CONTRACT.md | Hub owns device identity, cursors, and the projection checkpoint to Turbopuffer |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/services/sync/CloudSync.ts | Client push drain: synced_at queue, outbox, queueDelete tombstone, dead-letter, backoff, ack validation |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/services/sync/SyncApply.ts | Client apply: one transaction per batch with cursor, echo guard, rev rules, title parking, epoch reset |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/services/sync/SyncClient.ts | Client pull and WebSocket advisory channel, epoch handling, polling tiers |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/shared/cmem-gateway.ts | cmem.ai inference gateway detection, cm_pro_ key rules, terminal codes subscription_inactive, allowance_exhausted, key_invalid, fallback marker |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/npx-cli/cmem-pro-costs.ts | Installer endpoints: /api/installer/oauth/start, /api/pro/trial/poll, /api/inference/v1 |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/shared/teambrain.ts | TeamBrain client API: /api/teambrain/brief, /search, /cli/status, /cli/board, /cli/membership, /cli/leave; bearer plus X-User-Id |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/npx-cli/commands/teambrain.ts | teambrain join/start/status/share/leave; invite token in OAuth pairing |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/services/work-view/hosted-intent.ts | Hosted setup extraction: POST /api/pro/intent, gzip, 2 MiB cap, install credentials headers, no client retry |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/storage/postgres/schema.ts | Hosted server tables: teams, projects, team_members, api_keys, audit_log, observations, usage_events, rate_limit_counters, observation_embeddings |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/server/middleware/postgres-auth.ts | Hosted server auth middleware: key hash lookup, team and project scoping |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/plans/2026-07-22-cmem-launch.md | Plan: closed claude-mem-pro app on Vercel, Supabase control plane, Turbopuffer content store, outage history (dated 2026-07-22) |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/plugin/skills/cloud-sync/SKILL.md | Cloud-sync skill: setup only through the installer, never paste token in chat |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/3763 | Maintainer answer 2026-09-12: hosted observer is DeepSeek V4 Flash via OpenRouter, server-picked; sync only pushes post-connect memories |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/3444 | Request to backfill pre-launch local memories to cloud (closed, folded into plan-12) |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4086 | Sync blocked by revision_hash_conflict after manual DB merge; whole batch rejected; no rebase tool |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/3964 | Stale origin_device_id ops at outbox head blocked sync permanently (fixed by #3973) |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4191 | Hub push response head_seq vs projected_seq invariant stuck; 33 hour 500/429 outage |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4198 | Hub projector stalled, projected_seq stays behind head_seq, every push fails |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4231 | Retry backoff ignored, 429 storm (fixed, Retry-After now a floor) |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4228 | sync_outbox grew to 1.2 GB when sync not configured |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4842 | work_state never syncs; hub contentKinds lacks it on production |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4841 | Request to show origin device name; maintainer says production hub does not return names and that part is not in the repo |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4131 | --runtime server help implies self-hosted but install needs cmem.ai OAuth |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4605 | Privacy text vs defaults; README says no card, pricing FAQ says card required |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/blob/7325fb7818ff7426665d85922db642ec0931bdcd/src/shared/openrouter-base-url.ts | Client appends /chat/completions to a base URL (seen in grep output; file not read in full) |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/3848 | Title only: claim of ~64% extra API cost from claude-mem (body not read) |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4580 | Title only: observations lost during quota cooldown if worker restarts (body not read) |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/issues/4805 | Title only: delete leaves Chroma docs (body not read) |
| date | URL | what it gave |
| 2026-10-26 | https://mem0.ai/pricing | Mem0 plans Hobby/Starter/Pro/Enterprise, limits, feature matrix, compliance badges |
| 2026-10-26 | https://docs.mem0.ai/platform/platform-vs-oss | Mem0 platform vs OSS feature gap list |
| 2026-10-26 | https://supermemory.ai/pricing | Supermemory plans, credits, rate card, self-host and connector gating |
| 2026-10-26 | https://supermemory.ai/docs/deployment/self-hosting | Supermemory self-host: platform-only features list |
| 2026-10-26 | https://www.getzep.com/pricing | Zep Flex/Flex Plus/Enterprise prices, credits, limits, features, deployment options |
| 2026-10-26 | https://raw.githubusercontent.com/getzep/zep/main/README.md | Zep Community Edition deprecated; legacy folder |
| 2026-10-26 | https://blog.getzep.com/announcing-a-new-direction-for-zeps-open-source-strategy/ | Zep reason for ending Community Edition; Graphiti focus |
| 2026-10-26 | https://www.letta.com/pricing | Letta Free/Pro/API/Teams Pro/Enterprise prices and limits (page content is the docs pricing page) |
| 2026-10-26 | https://www.cognee.ai/pricing | Cognee Free/Standard/Enterprise BYOC prices and features |
| 2026-10-26 | https://mastra.ai/pricing | Mastra Platform Starter/Teams/Enterprise prices, memory token and retrieval storage meters, self-hosted enterprise |
| 2026-10-26 | https://raw.githubusercontent.com/mastra-ai/mastra/main/LICENSE.md | Mastra licence: Apache-2.0 except ee/ directories |
| 2026-10-26 | https://raw.githubusercontent.com/mastra-ai/mastra/main/ee/LICENSE | Mastra Enterprise Edition licence: source-available, no production use |
| 2026-10-26 | https://memorilabs.ai/pricing | Memori OSS, Cloud Free, Team, Business, Enterprise prices and included features |
| 2026-10-26 | https://raw.githubusercontent.com/MemoriLabs/Memori/main/LICENSE | Memori licence is Apache-2.0 |
| 2026-10-26 | https://raw.githubusercontent.com/MemoriLabs/Memori/main/README.md | Memori README: cloud, BYODB self-host, advanced augmentation free for developers |
| 2026-10-26 | https://vectorize.io/pricing | Hindsight self-host/Cloud/Enterprise, per-operation prices, feature table |
| 2026-10-26 | https://raw.githubusercontent.com/vectorize-io/hindsight/main/README.md | Hindsight README cloud description, MIT |
| 2026-10-26 | https://hindsight.vectorize.io/ | Hindsight docs home: $5 free credit on sign-up with GitHub |
| 2026-10-26 | https://docs.memvid.com/concepts/capacity-and-plans.md | Memvid docs plan table ($9.99, $49.99) and capacity limits |
| 2026-10-26 | https://memvid.com/pricing | Memvid pricing page: fetched, JS-rendered, returned only contact page text (UNVERIFIED) |
| 2026-10-26 | https://raw.githubusercontent.com/memvid/memvid/main/README.md | Memvid README: Apache-2.0, single .mv2 file |
| 2026-10-26 | https://raw.githubusercontent.com/memodb-io/memobase/main/README.md | Memobase README: Apache-2.0, cloud free tier mentioned, no prices |
| 2026-10-26 | https://www.memobase.io/en/login | Memobase cloud login URL from README: HTTP 404 |
| 2026-10-26 | https://docs.memobase.io/ | Memobase docs: reachable, no pricing page found in text |
| 2026-10-26 | https://memos.openmem.net/pricing | MemOS cloud plans Free/Starter/Pro/Enterprise and API limits |
| 2026-10-26 | https://raw.githubusercontent.com/MemTensor/MemOS/main/README.md | MemOS README: Cloud API vs self-host vs plugins table |
| 2026-10-26 | https://raw.githubusercontent.com/Gentleman-Programming/engram/main/README.md | Engram README: cloud optional, local SQLite authoritative, MIT |
| 2026-10-26 | https://raw.githubusercontent.com/Gentleman-Programming/engram/main/docs/engram-cloud/README.md | Engram Cloud is self-hosted (engram cloud serve), dashboard, project-scoped sync |
| 2026-10-26 | https://engram.gentlemanprogramming.com/ | Engram site: no pricing text found |
| 2026-10-26 | https://raw.githubusercontent.com/mksglu/context-mode/main/README.md | Context Mode README: no cloud, no account; ELv2 no-hosted-service clause |
| 2026-10-26 | https://raw.githubusercontent.com/mksglu/context-mode/main/LICENSE | Context Mode licence: Elastic License 2.0 |
| 2026-10-26 | https://context-mode.com | Context Mode site: no pricing text found |
| 2026-10-26 | https://raw.githubusercontent.com/rohitg00/agentmemory/main/README.md | agentmemory README: no cloud pricing stated, comparison table, Apache-2.0 via API |
| 2026-10-26 | https://agent-memory.dev | agentmemory site: no account, no cloud |
| 2026-10-26 | https://basicmemory.com/pricing | Basic Memory Team $15, Business $30, Agent Infrastructure custom; features |
| 2026-10-26 | https://raw.githubusercontent.com/TencentCloud/TencentDB-Agent-Memory/main/README.md | TencentDB Agent Memory: MIT, local docker start-all, Memory Hub team ACLs |
| 2026-10-26 | https://tencentcloud.github.io/TencentDB-Agent-Memory/ | TencentDB site: JS-rendered, no text (UNVERIFIED for price) |
| 2026-10-26 | https://cmem.ai/pricing | claude-mem OSS free; CMEM Pro $30, Heavy $70, Max $100; TeamBrain unpriced |
| 2026-10-26 | https://claude.com/pricing | Claude plans Free/Pro/Max/Team prices; memory row per plan |
| 2026-10-26 | https://support.claude.com/en/articles/11817273-use-claude-s-chat-search-and-memory-to-build-on-previous-context | Claude memory availability by plan, team owner control |
| 2026-10-26 | https://cursor.com/pricing | Cursor pricing page as served: Free/Plus/Premium/Super/Ultra/Teams/Enterprise (content looks Grok-branded; see note) |
| 2026-10-26 | https://cursor.com/docs/context/memories | Cursor docs: memories URL serves Rules page; Team Rules on Team/Enterprise |
| 2026-10-26 | https://windsurf.com/pricing | Windsurf (Devin) Free/Pro/Max/Teams/Enterprise prices |
| 2026-10-26 | https://docs.windsurf.com/windsurf/cascade/memories | Windsurf memories and rules doc; system-level rules for enterprise |
| 2026-10-26 | https://github.com/features/copilot/plans | Copilot plans: Free/Pro/Pro+/Max prices (two price sets appear on page) |
| 2026-10-26 | https://docs.github.com/en/copilot/concepts/agents/copilot-memory | Copilot Memory: public preview, paid plans, 28-day expiry, admin controls |
| 2026-10-26 | https://one.google.com/about/google-ai-plans/ | Google AI plans page fetched in Arabic locale; prices not readable (UNVERIFIED) |
| 2026-10-26 | https://support.google.com/gemini/answer/15637730 | Gemini personalization help: memory of past chats, not available to everyone |
| 2026-10-26 | https://chatgpt.com/pricing | ChatGPT pricing: HTTP 403 (UNVERIFIED) |
| 2026-10-26 | https://help.openai.com/en/articles/8590148-memory-faq | OpenAI memory FAQ: HTTP 403 this run (UNVERIFIED) |
| 2026-10-26 | https://www.byterover.dev/pricing | ByteRover Free/Pro $15/Enterprise features |
| 2026-10-26 | https://pieces.app/pricing | Pieces Pro $18.99, Enterprise $22.99 |
| 2026-10-26 | https://memmachine.ai/pricing | MemMachine OSS/Pro $79/Enterprise |
| 2026-10-26 | https://www.graphlit.com/pricing | Graphlit tiers and wind-down notice |
| 2026-10-26 | https://backboard.io/pricing | Backboard pricing update blog: Free $5 credit, Pro $9/mo |
| 2026-10-26 | https://www.memoryplugin.com/pricing | MemoryPlugin: Core plan shown $89/year (struck $180), lifetime option; partial read |
| 2026-10-26 | https://mempalace.tech | MemPalace comparison table of rival prices (third-party claim only) |
| 2026-10-26 | https://github.com/supermemoryai/supermemory/issues/1140 | User issue: pricing page shows no concrete figures (written before current page) |
| 2026-10-26 | https://github.com/mem0ai/mem0/issues/6895 | Mem0 issue: OSS graph memory removed in v3 |
| 2026-10-26 | https://hn.algolia.com/api/v1/search?query=Cursor%20Pricing%20Changes&tags=story | HN search result titles only (not opened): Cursor pricing-change threads, e.g. item 44496285 |
| 2026-10-26 | https://api.github.com/search/repositories (topics ai-memory, agent-memory, mcp-memory, llm-memory, claude-code-memory, context-engineering, memory-layer, ai-agent-memory, coding-agent memory) | candidate repos with stars, push date, licence, language |
| 2026-10-26 | https://api.github.com/search/repositories (queries: ruler, rulesync, AGENTS.md sync, skills sync) | rules-sync candidates |
| 2026-10-26 | https://api.github.com/search/repositories (byterover, mempalace, obsidian memory, benchmark harness) | ByteRover and MemPalace repo data; extra candidates |
| 2026-10-26 | https://hn.algolia.com/api/v1/search (Show HN memory for Claude Code; persistent memory AI coding agents; MCP memory server; agent memory open source local) | Show HN titles, dates, URLs, item ids |
| 2026-10-26 | https://api.github.com/repos/<owner>/<repo> and /commits?per_page=1 for the 51 new products and the 10 refreshed docs/21 products plus snap-research/locomo, xiaowu0162/LongMemEval, modelcontextprotocol/servers | stars, last commit, licence, language, open issues, archived flag, created date |
| 2026-10-26 | https://api.github.com/repos/<owner>/<repo>/readme for the same repos | README text: storage, tools, install commands, benchmark claims |
| 2026-10-26 | https://api.github.com/repos/<owner>/<repo>/issues?state=open&sort=comments (36 repos) | open issues used as weaknesses |
| 2026-10-26 | https://api.github.com/repos/letta-ai/letta | archived=false, pushed_at 2026-10-18 |
| 2026-10-26 | https://api.github.com/repos/thedotmack/claude-mem/releases/latest | v15.2.1 published 2026-10-25 |
| 2026-10-26 | https://api.github.com/repos/MemPalace/mempalace/issues/39 | title of reproduction issue, state closed, 2026-04-07 |
| 2026-10-26 | https://api.github.com/repos/punkpeye/awesome-mcp-servers/readme | Knowledge & Memory section entry count (138, approximate) |
| 2026-10-26 | https://api.github.com/repos/hesreallyhim/awesome-claude-code/contents | repo listing only, not scanned for memory entries |
| 2026-10-26 | https://pypi.org/pypi/<package>/json (mempalace, honcho-ai, memu-py, omega-memory, superlocalmemory, memsearch, memanto, telemem, agentmemory, mnemon, semantica, mengram-ai, mirix, simplemem, lightmem, basic-memory, hindsight-all) | versions, licences, python requirements; name-collision findings |
| 2026-10-26 | https://registry.npmjs.org/<package>/latest (hippo-memory, ownmem, claude-smart, openwolf, @cortexkit/magic-context, @intellectronica/ruler, rulesync, memora) | npm versions and licences |
| 2026-10-26 | https://arxiv.org/abs/2402.17753 | LoCoMo paper abstract: no venue, no scores |
| 2026-10-26 | https://arxiv.org/abs/2410.10813 | LongMemEval: 500 questions, ICLR 2025 in comments, 30% drop |
| 2026-10-26 | https://arxiv.org/html/2510.27246v1 | BEAM paper table 1: Vanilla, RAG, LIGHT across four backbones and four lengths |
| 2026-10-26 | https://iclr.cc/virtual/2026/poster/10006595 | seen only as a search result for BEAM venue; page not opened |
| 2026-10-26 | https://arxiv.org/html/2507.05257v3 | MemoryAgentBench table 3 (10 systems) |
| 2026-10-26 | https://arxiv.org/abs/2504.19413 | Mem0 paper abstract: relative gains, latency, token savings |
| 2026-10-26 | https://arxiv.org/abs/2501.13956 | Zep paper: DMR 94.8 vs 93.4, LongMemEval relative gains |
| 2026-10-26 | https://arxiv.org/abs/2512.12818 | Hindsight paper: LongMemEval 91.4 and 83.6, LoCoMo 89.61 |
| 2026-10-26 | https://www.getzep.com/blog/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/ | Zep corrected 75.14, Mem0 66.88 and 68.44, latency, cat 5 exclusion |
| 2026-10-26 | https://blog.getzep.com/lies-damn-lies-statistics-is-mem0-really-sota-in-agent-memory/ | 301 redirect to the URL above |
| 2026-10-26 | https://github.com/getzep/zep-papers/issues/5 | Mem0 vs Zep LoCoMo dispute: 84 vs 58.44, reply with 75.14 |
| 2026-10-26 | https://github.com/mem0ai/mem0/issues/3944 | user rerun of Mem0 on LoCoMo scoring about 0.20; fixed |
| 2026-10-26 | https://github.com/EverMind-AI/EverMemOS/issues/73 | EverOS reproduction 52.22 and 38.38 vs 93.0 claimed |
| 2026-10-26 | https://github.com/Mirix-AI/MIRIX/issues/6 | MIRIX LoCoMo run 0.6234 on one conversation; BM25 hardcoded |
| 2026-10-26 | https://github.com/MemPalace/mempalace/issues/27 | README-vs-code discrepancy list; maintainer doc commits 2026-10-12 |
| 2026-10-26 | https://github.com/MemPalace/mempalace/issues/39 | independent reproduction: R@5 and end-to-end accuracy by mode |
| 2026-10-26 | https://github.com/aiming-lab/SimpleMem/issues/94 | 531 tokens per query question, no reply |
| 2026-10-26 | https://www.letta.com/blog/benchmarking-ai-agent-memory | Letta 74.0 on LoCoMo with GPT-4o mini, Mem0 68.5 cited, method |
| 2026-10-26 | https://dev.to/penfieldlabs/we-audited-locomo-64-of-the-answer-key-is-wrong-and-the-judge-accepts-up-to-63-of-intentionally-33lg | LoCoMo audit: 99 errors in 1,540 q, judge accepts 62.81% of wrong answers |
| 2026-10-26 | https://mem0.ai/research | Mem0 LoCoMo 92.5, LongMemEval 94.4, tokens |
| 2026-10-26 | https://mem0.ai/library/agent-memory/ai-memory-benchmarks-in-2026 | Mem0's table of third-party and own scores (ByteRover, EverMemOS, Dakera, ZeroMemory, BEAM) |
| 2026-10-26 | https://mem0.ai/blog/ai-memory-benchmarks | 404 |
| 2026-10-26 | https://supermemory.ai/research/longmembench | Supermemory LongMemEval-S 97% (gpt-4o), 84.6 gpt-5, 85.2 gemini-3-pro |
| 2026-10-26 | https://mastra.ai/research/observational-memory | Mastra OM scores and comparator table (Hindsight, Supermemory 81.6, Zep 71.2) |
| 2026-10-26 | https://honcho.dev/evals/ | Honcho LongMemEval S 90.4, LoCoMo 89.9, BEAM 0.630 etc |
| 2026-10-26 | https://hindsight.vectorize.io/blog/2026/04/02/beam-sota | Hindsight BEAM tiers and Honcho comparison |
| 2026-10-26 | https://www.webull.com/news/15304952493908992 | Exabase BEAM 76.9/75.0/68.0 press release |
| 2026-10-26 | https://www.hpcwire.com/bigdatawire/this-just-in/exabase-reports-state-of-the-art-results-on-beam-memory-benchmark/ | 403 blocked; UNVERIFIED via this URL |
| 2026-10-26 | https://vectorize.io/articles/mempalace-benchmarks | seen only in search summary: MemPalace tuning on test set; not opened (UNVERIFIED) |
| 2026-10-26 | https://github.com/dial481/locomo-audit | named by the Penfield post; not opened |
| 2026-10-26 | https://code.claude.com/docs/en/memory | Claude Code CLAUDE.md and auto memory behaviour, location, 200 lines or 25KB |
| 2026-10-26 | https://docs.cline.bot/features/memory-bank | Cline Memory Bank files and loading |
| 2026-10-26 | https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html | Gemini CLI GEMINI.md hierarchy and /memory commands |
| 2026-10-26 | https://developers.openai.com/codex/memories | 308 redirect |
| 2026-10-26 | https://learn.chatgpt.com/docs/customization/memories?surface=app | Codex memories: local, off by default, ~/.codex/memories/ |
| 2026-10-26 | https://kiro.dev/docs/steering/ | Kiro steering locations and inclusion modes |
| 2026-10-26 | https://docs.augmentcode.com/setup-augment/memories | 404; Augment memories UNVERIFIED |
| 2026-10-26 | https://github.com/MemPalace/mempalace | README: 96.6% R@5 raw, ChromaDB, install |
| 2026-10-26 | https://github.com/memoket/memoket-kite | README: KITE 93.51 and 85.60 |
| 2026-10-26 | https://github.com/FlowElement-xinliuyuansu/m_flow | README: M-flow benchmark tables |
| 2026-10-26 | https://github.com/qualixar/superlocalmemory | README: SLM LoCoMo table |
| 2026-10-26 | https://github.com/sachitrafa/YourMemory | README: YourMemory LoCoMo recall chart and quota note |
| 2026-10-26 | https://github.com/tstockham96/engram | README: LoCoMo 80.0 claim |
| 2026-10-26 | https://github.com/tigerless-labs/agent-memory | README: bounded LongMemEval-S result |
| 2026-10-26 | https://github.com/moorcheh-ai/memanto | README: 89.8 and 87.1 with TODO |
| 2026-10-26 | https://github.com/vshulcz/deja-vu | README: 97.2 R@5, hit@1 figures |
| 2026-10-26 | https://github.com/kitfunso/hippo-memory | README: 74.0 R@5, retraction note |
| 2026-10-26 | https://github.com/hyperb1iss/sibyl | README: no benchmark number published |
| 2026-10-26 | https://github.com/TeleAI-UAGI/telemem | README: ZH-4O 86.33 |
| 2026-10-26 | https://github.com/aiming-lab/SimpleMem | README: LoCoMo F1 claims |
| 2026-10-26 | https://github.com/grpcer/ownmem | README: own-corpus recall |
| 2026-10-26 | https://github.com/TheWinci/mimirs | README: Recall@10 on four codebases |
| 2026-10-26 | https://github.com/ReflexioAI/claude-smart | README: 3x claim |
| 2026-10-26 | https://github.com/Lyellr88/marm-memory | README: unstable concurrency ratio |
| 2026-10-26 | https://github.com/zjunlp/LightMem | README: reproduction scripts |
| 2026-10-26 | https://github.com/<owner>/<repo> READMEs for TonyStef/Grov, cytostack/openwolf, cortexkit/magic-context, okf-memory/okf-agent-memory, omega-memory/omega-memory, yoloshii/ClawMem, notkurt/ghost, DiaaAj/a-mem-mcp, campfirein/byterover-cli, plastic-labs/honcho, NevaMind-AI/memU, EverMind-AI/EverOS, zilliztech/memsearch, Mirix-AI/MIRIX, alibaizhanov/mengram, semantica-agi/semantica, mnemon-dev/mnemon, 0xK3vin/MegaMemory, Dataojitori/nocturne_memory, agentic-box/memora, elvismdev/mem0-mcp-selfhosted, intellectronica/ruler, dyoshikawa/rulesync, xingkongliang/skills-manager, microsoft/apm, knowns-dev/knowns, mjalalimanesh/skillhub-local, OSU-NLP-Group/HippoRAG | product descriptions, install commands, tool support (read via the readme API above) |
| 2026-10-26 | https://github.com/xiaowu0162/LongMemEval-V2 | named in LongMemEval README; not opened |
| 2026-10-26 | https://news.ycombinator.com/item?id=47007379 | Show HN: Ghost |
| 2026-10-26 | https://news.ycombinator.com/item?id=47053534 | Show HN: mem0-mcp-selfhosted |
| 2026-10-26 | https://news.ycombinator.com/item?id=47116615 | Show HN: Engram (tstockham96) |
| 2026-10-26 | https://news.ycombinator.com/item?id=49975380 | Show HN: SkillHub Local |
| 2026-10-26 | https://news.ycombinator.com/item?id=46126066 / 46569660 / 49487838 / 47203115 / 47182534 / 49731353 / 47979991 / 48048713 / 47472965 / 47207442 / 47165499 / 49020619 / 47289727 / 46966203 | other Show HN items listed in section 8 of the competitors file (titles and dates only) |
| 2026-10-26 | web search: Zep Lies Damn Lies; Letta filesystem; LoCoMo audit; MemoryAgentBench; MemPalace criticism; BEAM; Supermemory memorybench; Mastra OM; reddit r/ClaudeCode | search summaries that located the primary pages; reddit search reached no thread |
| date | URL | what it gave |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr+is:open | 59 open PRs with title, author, association, comments, reactions, labels, first 1500 chars of body |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr+is:merged+merged:>=2026-07-28 | 983 PRs merged in the last 90 days (53 by posthog[bot]); basis for the 104 feat PRs |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr&sort=comments&order=desc | Top 1000 PRs by comment count; top 40 non-bot used |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr&sort=reactions&order=desc | Top 1000 PRs by reaction count; top 40 non-bot used |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr+is:closed+is:unmerged+-author:thedotmack+created:>=2026-07-21 | 200 external closed-unmerged PRs created since 2026-07-21 (first run, rate-limited after 200 rows) |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr+is:closed+is:unmerged+-author:thedotmack+created:<2026-07-21 | 639 external closed-unmerged PRs created before 2026-07-21 |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr | Total PR count 2518 (correction of the 5,087 in the brief) |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr+is:open | Open count 59 |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr+is:merged | Merged count 1481 |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr+is:closed+is:unmerged | Closed-unmerged count 978 |
| 2026-10-26 | https://api.github.com/search/issues?q=repo:thedotmack/claude-mem+is:pr+is:closed+is:unmerged+author:thedotmack | Maintainer closed-unmerged count 199; shows 60-PR gap in search counts |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/pull/589 | Body and comments: folder CLAUDE.md feature flag; closed in favour of #913 |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/pull/1233 | Body and comments: OpenCode integration; closed by maintainer without merge |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/pull/1722 | Body and comments: multi-node network mode; author replaced it |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/pull/1246 | Body and comments: branch-scoped memory; closed in backlog pass, refiled as issue #2038 |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/pull/2908 | Body and comments: Kimi Code CLI; superseded by merged #3547 |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/pull/1207 | Body: GitHub Copilot provider reading an OpenClaw token file |
| 2026-10-26 | https://github.com/thedotmack/claude-mem/pull/1333 | Body: Codex CLI transcript-based capture |
| 2026-10-26 | https://cmem.ai/pricing | CMEM Pro $30, Heavy $70, Max $100 (re-fetched by the reviewer) |
| 2026-10-26 | https://cmem.ai/api/inference/v1 | NOT fetched: endpoint name read from claude-mem client code (see research/A1-claude-mem-paid.md F2) |
| 2026-10-26 | https://modelcontextprotocol.io/specification/2025-03-26/basic/transports | MCP Streamable HTTP rules used for T-067: single endpoint for POST and GET, Accept header, Origin validation, Mcp-Session-Id, 202-for-notifications, 405-when-no-SSE, batch handling |
| 2026-10-26 | https://docs.claude.com/en/docs/claude-code/mcp (redirected to https://code.claude.com/docs/en/mcp) | Claude Code remote MCP syntax for T-107: `claude mcp add --transport http <name> <url> --header "Authorization: Bearer <token>"` and the `mcpServers` JSON shape with `type: http`, `url`, `headers` |
| 2026-10-26 | https://modelcontextprotocol.io/quickstart/user and https://modelcontextprotocol.io/docs/develop/connect-remote-servers | Claude Desktop MCP config (`claude_desktop_config.json`, `mcpServers`) and remote-server connection flow; used for the T-107 client snippets (Desktop snippet config-written-from-docs, not tested on a real install) |
| 2026-10-27 | http://127.0.0.1:37700/ (the owner's local claude-mem viewer, opened with the Playwright browser) | Layout, navigation, status chips, card and list views, filters, mobile bottom bar, network calls (`/api/work-view`, `/api/work-view/events`), CSS keyframe names, ARIA roles. Used for docs/ui-study.md. Only structure was recorded; the owner's prompt text was not copied. |
