# 17. Technical task breakdown

Derived from [15](15-product-spec.md) (requirements) and [16](16-target-architecture.md) (design). Estimates are
**ideal engineer-days for one person who knows the codebase**, my judgement, not measured; treat them as ±50%.
Status reflects this repo on 2026-10-25: **done** (code and tests exist), **partial**, **todo**.

## 17.1 Rules for every task

- **Definition of done:** code, tests that fail without the change, docs updated, `bun test` green, no new required dependency, benchmark rerun when retrieval is touched.
- **Evidence:** a task that changes a claim ships the command that proves it.
- **Verified-against-reality:** any task touching a third-party format (tool config, protocol) cites the official doc and the date, and has a test on a real or pinned install.
- **Silent failure is a bug:** a swallowed error needs a log line or a test that proves the fallback is intended (lesson F1).

## 17.2 Epics at a glance

| Epic | Goal | Req | Days | Status |
|---|---|---|---|---|
| E0 Foundation | Store, API, MCP, CLI, rules sync, bundles, My Work clone | many | n/a | **done** |
| E1 Retrieval quality | Reach and prove the retrieval targets | FR-R1..R7, S1 | 18 | partial |
| E2 Ingestion and memory model | Facts, entities, bi-temporal, consolidation | FR-M2..M6 | 22 | todo |
| E3 Tool integrations | One-command, verified setup for the top tools | FR-C3, FR-T3 | 16 | partial |
| E4 Hub UI | Sessions, live feed, settings, explain panel, e2e | FR-U1..U6 | 14 | partial |
| E5 Evaluation | Datasets, baselines, judge, CI gate | S1..S8 | 12 | partial |
| E6 Reliability and security | Crash safety, perms, MCP HTTP transport, audit | NFR-4,6,8 | 10 | partial |
| E7 Migration and importers | More sources, formats, backup | FR-X2, X3 | 8 | partial |
| E8 Team (free, self-hosted) | Shared server, ACL, op-log, review queue | FR-S1..S3 | 20 | todo |
| E9 Packaging and docs | Binary, Docker, installers, docs site | NFR-8 | 8 | todo |

Critical path to v1.0: **E5 (baselines) → E1 (packer, rerank default, query understanding) → E3 (verified connectors) → E4 (settings, sessions) → E9**.
E2 and E8 follow; they do not block v1.0.

## 17.3 E1 Retrieval quality

| ID | Task | Est | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| E1-1 | Natural-language BM25 (any term, stemming, rare-term pruning) | 2 | | LoCoMo Recall@5 ≥ 55 on raw turns; p50 ≤ 80 ms at 50k | **done** (55.1; 71 ms) |
| E1-2 | Optional local embeddings + RRF hybrid | 3 | E1-1 | Hybrid ≥ BM25 and ≥ dense on Recall@5 and MRR | **done** (56.7; MRR .492) |
| E1-3 | Fact-augmented keys (store + search), extraction prompt + validator | 4 | E2-1 | +≥ 8 pts Recall@5 on LoCoMo with extracted (not dataset) facts | partial: store/search work; extraction missing |
| E1-4 | Cross-encoder rerank as a retrieval option and default when models are present | 2 | E1-2 | +≥ 5 pts Recall@5 on all 1,536 questions; p95 ≤ 300 ms | partial: built, measured on 1 conversation |
| E1-5 | Token-budgeted packer (dedupe by source, MMR, neighbour stitching, provenance) | 4 | E1-4 | Budget exact; recall-at-budget curve published; stitching tested | todo |
| E1-6 | Query understanding: time ranges, speaker/entity filters | 3 | E2-2 | Temporal subset +≥ 5 pts; no regression elsewhere | todo |
| E1-7 | Abstention: score floor, "no relevant memory" | 2 | E1-4 | Abstention set: ≥ 90% correct "none" at ≤ 10% false abstain | todo |
| E1-8 | Per-query retrieval log + "why recalled" data | 2 | | Log schema; UI reads it | todo |
| E1-9 | Evaluate embedding size/quality ladder (bge-small vs base vs MiniLM) | 2 | E5-1 | Table of recall vs latency vs size; pick default | todo |

## 17.4 E2 Ingestion and memory model

| ID | Task | Est | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| E2-1 | Fact extraction: prompt, strict validator, retry-once, batching, cost display | 4 | | Same validator discipline as `compress`; fixture tests; works with a local model | todo |
| E2-2 | Entities and aliases; link facts and episodes | 4 | E2-1 | Entity-resolution test set; graph neighbours queryable | todo |
| E2-3 | Schema v3: `events`, `episodes`, `facts`, `keys`, `summaries`; additive migration from `memories` | 4 | | Migration test on a copied real DB; export/import round trip unchanged | todo |
| E2-4 | Bi-temporal facts and contradiction invalidation | 4 | E2-1, E2-3 | Knowledge-update set: latest fact wins; history query works | todo |
| E2-5 | Near-duplicate detection (TF-IDF cosine + IDF veto, as upstream) | 2 | E2-3 | Precision/recall on a labelled dup set | todo |
| E2-6 | Consolidation and decay with audit, extractive fallback | 4 | E2-3 | Footprint −40% with ≤ 1 pt recall loss | todo |
| E2-7 | Segmenter for tool events into rounds (merge noisy tool chatter) | 2 | | Event-to-episode ratio and recall measured | todo |

## 17.5 E3 Tool integrations

| ID | Task | Est | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| E3-1 | Connector test harness: pinned versions of Claude Code, Codex, Gemini CLI, OpenCode in containers; real `mcp list` check | 4 | | CI proves each tool lists and calls the server | todo |
| E3-2 | `aletheia install <tool>`: connect + capture hook + rules sync + uninstall | 6 | E3-1 | Idempotent; backup; uninstall restores byte-for-byte | todo |
| E3-3 | Claude Code adapter (hooks: SessionStart, UserPromptSubmit, PostToolUse, Stop) | 2 | E3-1 | Real session produces memories and receives context | todo |
| E3-4 | Codex, Gemini CLI, Cursor, Windsurf, OpenCode adapters | 4 | E3-1 | Same | todo |
| E3-5 | Registry `verifiedOn` + staleness warning in the UI | 1 | | Test | todo |
| E3-6 | Windsurf/Devin path resolution | 0.5 | | Both documented paths handled | **done** |
| E3-7 | MCP protocol versions incl. 2025-11-25; SDK client test | 0.5 | | Official SDK client passes | **done** |

## 17.6 E4 Hub UI

| ID | Task | Est | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| E4-1 | Playwright e2e suite (memory, rules, tools, migrate) run in CI | 3 | | Catches the recursion bug found manually | todo |
| E4-2 | Sessions view and SSE live feed | 3 | E1-8 | New capture appears < 2 s | todo |
| E4-3 | Settings page (providers, models, budgets, redaction patterns, skip rules, excluded projects) | 3 | | Persisted; validated server-side | todo |
| E4-4 | "Why recalled" panel and retrieval playground | 2 | E1-8 | Shows per-retriever rank and scores | todo |
| E4-5 | Cost panel | 1 | | Totals match usage log | todo |
| E4-6 | Accessibility pass (keyboard, contrast, ARIA) | 2 | | axe clean | todo |

## 17.7 E5 Evaluation

| ID | Task | Est | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| E5-1 | LoCoMo retrieval harness (LLM-free) | 1 | | Reproducible command and table | **done** |
| E5-2 | claude-mem baseline harness (isolated worker) | 2 | | Same questions and metrics; isolation proven | **done** (full run in progress when written) |
| E5-3 | Scale benchmark | 0.5 | | Insert/search/vector numbers | **done** |
| E5-4 | LongMemEval-S harness with LLM judge; fixed judge prompt; cost report | 3 | | 500 questions; judge agreement spot-check | todo |
| E5-5 | BEAM-1M subset and MemoryAgentBench adapters | 3 | | One command each | todo |
| E5-6 | CodeMemBench: questions built from real (consenting, redacted) coding sessions: decisions, conventions, file facts | 4 | | ≥ 300 labelled questions, released with a datasheet | todo |
| E5-7 | Injection A/B on coding tasks (no memory vs our context vs claude-mem context) | 5 | E3-3 | Success and cost per arm, ≥ 100 tasks | todo |
| E5-8 | Baselines for Mem0 OSS and Graphiti | 3 | | Same harness | todo |
| E5-9 | CI gate: fail on > 1 pt regression in Recall@5 or +20% latency | 1 | E5-1 | Red on a seeded regression | todo |

## 17.8 E6 Reliability and security

| ID | Task | Est | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| E6-1 | Kill -9 / power-loss test during writes | 1 | | No corruption; recovery within N s | todo |
| E6-2 | File permissions: `hub.db` and ledger 0600, data dir 0700 | 0.5 | | Test | todo |
| E6-3 | MCP Streamable HTTP transport with Origin validation, localhost bind, bearer auth | 3 | | SDK HTTP client passes; rebinding test | todo |
| E6-4 | Schema probe for imports; loud failure on missing columns | 1 | | Test with a stripped DB (regression for F1) | todo |
| E6-5 | Memory-poisoning policy: wrap recalled text, never execute, UI label | 2 | | Red-team prompts do not change agent behaviour in the A/B harness | todo |
| E6-6 | Windows and macOS CI | 3 | | Suite green on both | todo |

## 17.9 E7 Migration and importers

| ID | Task | Est | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| E7-1 | claude-mem importer | 1 | | Idempotent, read-only | **done** |
| E7-2 | Markdown / plain-notes importer (one memory per heading or line) | 1 | | Fixture | todo |
| E7-3 | ChatGPT and Claude.ai export importers (user-provided files; no scraping) | 3 | | Fixture per format, re-verified against current export schema | todo |
| E7-4 | Mem0 / Zep JSON importers | 2 | | Fixture | todo |
| E7-5 | Scheduled backup and restore command | 1 | | Test | todo |

## 17.10 E8 Team (free, self-hosted)

| ID | Task | Est | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| E8-1 | Server mode: bind choice, per-client API keys, per-project ACL | 5 | E6-3 | Security tests | todo |
| E8-2 | Append-only op log with hybrid logical clocks; merge | 8 | E2-3 | Convergence property tests | todo |
| E8-3 | Review queue for shared memories | 4 | E8-1 | e2e | todo |
| E8-4 | Audit export | 3 | E8-1 | Test | todo |

## 17.11 E9 Packaging and docs

| ID | Task | Est | Depends | Acceptance | Status |
|---|---|---|---|---|---|
| E9-1 | `bun build --compile` binaries for Linux, macOS, Windows | 2 | E6-6 | Smoke test per binary | todo |
| E9-2 | Docker image and compose | 1 | | Healthcheck | todo |
| E9-3 | Installers (npm, Homebrew) | 2 | E9-1 | Fresh-machine test | todo |
| E9-4 | Docs site and API reference (OpenAPI) | 3 | | Generated from code, tested examples | todo |

## 17.12 Milestones

| Milestone | Contents | Exit criteria | Cumulative est. |
|---|---|---|---|
| **M0 (done)** | E0, E1-1, E1-2, E3-6, E3-7, E5-1..3, E7-1 | 115+ tests, SDK client, differential test | n/a |
| **M1: measure honestly** | E5-4, E5-5, E5-8, E5-9, E1-4 default, E1-9 | Scorecard S1, S2, S8 filled with reproducible numbers | ~13 d |
| **M2: close the gap** | E1-3, E1-5, E1-6, E1-7, E2-1, E2-7 | S1 re-measured; decision: claim ≥ 2× or restate target | ~20 d |
| **M3: real tools** | E3-1..E3-5, E6-4, E6-5 | S7 met for 3 tools on real installs | ~16 d |
| **M4: usable product** | E4-1..E4-6, E6-1, E6-2, E9-* | v1.0 gate in [15](15-product-spec.md#156-release-plan) | ~25 d |
| **M5: depth** | E2-2..E2-6, E7-*, E5-6, E5-7 | v1.1 | ~35 d |
| **M6: team** | E8-* | v2.0 | ~20 d |

First task to start tomorrow: **E5-4 (LongMemEval-S with a judge)**, because every later decision depends on knowing where we actually stand against published numbers on answer accuracy, which retrieval recall alone does not show.
