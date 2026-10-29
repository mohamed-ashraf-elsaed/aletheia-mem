# Memory tools compared: Aletheia, Mem0, Zep and Graphiti, Supermemory, Basic Memory

<!-- description: Aletheia compared with Mem0, Zep and Graphiti, Supermemory and Basic Memory on licence, local use, MCP and hosting, each fact sourced and dated. -->
<!-- keywords: mem0 alternative, zep alternative, graphiti vs aletheia, supermemory alternative, basic memory alternative, ai agent memory comparison, local ai memory tools -->

Aletheia (aletheia-mem) is a free, local memory and rules hub for AI coding tools. This page compares it with four other memory projects: Mem0, Zep with its open-source Graphiti framework, Supermemory and Basic Memory. It says what each project's own pages state, with a URL and a date, and it says when another tool is the better pick.

Every fact about another project was read from the URL beside it on 2026-10-29. Where a page did not say, the cell reads `UNVERIFIED`. A README that does not mention a feature is not proof that the feature is missing.

## The comparison at a glance

| | Aletheia | Mem0 | Graphiti and Zep | Supermemory | Basic Memory |
|---|---|---|---|---|---|
| Licence | Apache-2.0 | Apache-2.0 | Graphiti: Apache-2.0. Zep is a managed commercial service | MIT | AGPL-3.0 |
| Runs on your machine | Yes | Yes, open-source library or Docker stack | Graphiti: yes, with a graph database. Zep: `UNVERIFIED` | Yes, `npx supermemory local` | Yes |
| Hosted or paid option | None | Managed platform | Zep, managed | Hosted platform | Cloud, price stated in its README |
| MCP | stdio and HTTP | Hosted server only | Reference server in the Graphiti repository | Open-source server, hosted at a URL | Yes |
| REST API | Yes, under `/v1` | Yes, open-source server and platform API | Reference service in the Graphiti repository | SDKs; REST reference `UNVERIFIED` | `UNVERIFIED` |
| CLI | Yes | Yes | None described for Graphiti | Starts the local server | Yes |
| Rules written into host instruction files | Yes | None described | None described | None described | `UNVERIFIED` |

The Aletheia column comes from the repository. See [Rules](../concepts/rules.md) and [MCP tools](../reference/mcp-tools.md). The other columns are explained in the sections below.

## Mem0

- Licence: Apache-2.0. Source: https://github.com/mem0ai/mem0 and `gh api repos/mem0ai/mem0`, 2026-10-29.
- Local use: the open-source version runs as a library or a Docker stack on your own servers. Source: https://docs.mem0.ai/introduction, 2026-10-29.
- A model provider is needed. The README names OpenAI's `gpt-5-mini` and `text-embedding-3-small` as defaults. The open-source REST server needs an OpenAI key and a `JWT_SECRET`, and you create a local admin on your own server, not a Mem0 account. Sources: https://github.com/mem0ai/mem0 and https://docs.mem0.ai/open-source/features/rest-api, 2026-10-29.
- Hosted option: a managed platform at app.mem0.ai with API keys. The README gives no prices. Source: https://github.com/mem0ai/mem0, 2026-10-29.
- MCP: the documented server is hosted by Mem0 and stores memories in your Mem0 account. The page says nothing runs on your machine and describes no local MCP server. Source: https://docs.mem0.ai/platform/mem0-mcp, 2026-10-29.
- REST and CLI: the open-source REST server is a FastAPI service, and the docs index lists a separate platform API reference. The README describes a CLI that adds and searches memories. Sources: https://docs.mem0.ai/open-source/features/rest-api, https://docs.mem0.ai/llms.txt and https://github.com/mem0ai/mem0, 2026-10-29.

## Zep and Graphiti

- Graphiti is an open-source framework for temporal knowledge graphs. Licence: Apache-2.0. Source: https://github.com/getzep/graphiti and `gh api repos/getzep/graphiti`, 2026-10-29.
- Zep is a commercial, managed context layer built on Graphiti, and it runs its own graph database service. Sources: https://github.com/getzep/graphiti and https://help.getzep.com, 2026-10-29.
- Graphiti is self-hosted. It needs a graph database (Neo4j, FalkorDB or Amazon Neptune) and an LLM provider, and OpenAI-compatible local servers such as Ollama can be used. The README warns that smaller models may fail ingestion. Sources: https://github.com/getzep/graphiti and https://help.getzep.com/graphiti/getting-started/overview, 2026-10-29.
- Self-hosting the Zep server itself: `UNVERIFIED`. The help site does not say. The Graphiti README mentions a deployment in your own cloud. The `getzep/zep` repository describes itself as examples and integrations, so this page does not treat Zep as open source.
- Temporal model: both pages describe bi-temporal tracking and fact invalidation. These are the project's own claims.
- MCP and REST: the Graphiti README says the `mcp_server` and `server` folders are reference implementations, not production deployments, with no authentication. The help page for Graphiti did not describe an MCP server, so the two sources differ. Sources: https://github.com/getzep/graphiti and https://help.getzep.com/graphiti/getting-started/overview, 2026-10-29.

## Supermemory

- Licence: MIT. Source: https://github.com/supermemoryai/supermemory and `gh api repos/supermemoryai/supermemory`, 2026-10-29.
- Local use: "Supermemory local" is a single server binary started with `npx` or an install script. It listens on `localhost:6767` and uses a local embeddings model by default. The README says URL ingestion relies on a hosted reader service, so fully offline use has limits. Source: https://github.com/supermemoryai/supermemory, 2026-10-29.
- Hosted option: a hosted platform with a docs site and dashboard. The README states no prices. `UNVERIFIED` for pricing.
- MCP: an open-source server, available at a hosted URL, with the tools `memory`, `recall` and `context`. Source: the same README, 2026-10-29.
- REST: the README lists npm and Python SDKs. A REST endpoint reference is `UNVERIFIED`.
- The documentation site did not load. Fetches of https://supermemory.ai/docs, https://supermemory.ai/docs/intro and https://docs.supermemory.ai failed on 2026-10-29, so every Supermemory fact here comes from the README.

## Basic Memory

- Licence: AGPL-3.0, stated for both the local and cloud versions. Source: https://github.com/basicmachines-co/basic-memory and `gh api repos/basicmachines-co/basic-memory`, 2026-10-29.
- Local use: notes are Markdown files on your disk with a local SQLite index. Source: https://github.com/basicmachines-co/basic-memory, 2026-10-29.
- Hosted option: the README states a cloud version at $15 a month with a 7-day free trial. Source: the same README, 2026-10-29.
- MCP and CLI: both are described in the README. Connected hosts named there include Claude Desktop, Claude Code, Codex, Cursor and VS Code.
- REST: the README mentions an API server only in passing and has no endpoint reference. `UNVERIFIED`.
- Rules files: the README does not describe writing rules into host instruction files. Aletheia's own README table of 2026-10-26 recorded "partial (AGENTS.md)" for Basic Memory, and the 2026-10-29 README does not confirm it. `UNVERIFIED`.
- Import: the README lists Claude conversations, ChatGPT exports and memory JSON files.

## Benchmark claims

Each vendor publishes its own numbers. Aletheia's numbers are retrieval only (Recall@5) and are measured by us. See [Benchmarks](../project/benchmarks.md).

- Mem0 reports 92.5 on LoCoMo, 94.4 on LongMemEval and 64.1 on BEAM at 1M tokens, vendor-claimed. It says the scores reflect the managed platform, and that open-source users should expect "directionally similar gains but not identical numbers." Source: https://github.com/mem0ai/mem0, 2026-10-29.
- Supermemory claims first place on LongMemEval, LoCoMo and ConvoMem, vendor-claimed. It also presents an open-source framework, MemoryBench. Source: https://github.com/supermemoryai/supermemory, 2026-10-29.
- The Graphiti README gives latency figures with no benchmark data or method, vendor-claimed. Source: https://github.com/getzep/graphiti, 2026-10-29.

None of these numbers can be set beside Aletheia's Recall@5. The pages above do not give the metric, the model or the settings in a way that matches ours. Do not read a gap in either direction into them.

## Which to pick

- **You want a managed memory service for a product you build.** Use a hosted option: Mem0's platform, Zep or Supermemory's hosted platform. Aletheia is not a hosted service and has no managed cloud.
- **You need a knowledge graph over many sources.** Graphiti and Zep are built for that. Aletheia keeps entity rows and has a graph retrieval channel that is off by default and was measured only on a synthetic test ([CHANGELOG 0.1.4](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/CHANGELOG.md)).
- **You want a team service run by someone else.** The projects above offer hosted options. Aletheia's team mode and sync are self-hosted, and they have not been tested across two real machines. See [Team mode](../31-team.md).
- **You keep your notes as Markdown files you read and edit yourself.** Basic Memory stores them that way. Aletheia stores memories in SQLite and exports them as JSONL or Markdown.
- **You use several coding hosts and want one local store and one set of rules.** This is the case Aletheia was built for. Check [Tools overview](../tools/overview.md) for what has been verified on a real install.
- **You already use claude-mem and it works for you.** Stay with it. See [Aletheia and claude-mem](aletheia-vs-claude-mem.md).

## Next steps

- [Aletheia and claude-mem](aletheia-vs-claude-mem.md) - the closest comparison, with measured numbers.
- [Claude Code memory options](claude-code-memory.md) - how Aletheia fits next to CLAUDE.md and auto memory.
- [Status and limits](../project/status-and-limits.md) - what is verified and what is not.
