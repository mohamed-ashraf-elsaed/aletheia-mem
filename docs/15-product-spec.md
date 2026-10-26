# 15. Product specification

Status: draft 1, 2026-10-25. Owner: product. Inputs: [11](11-feature-inventory.md) (what exists),
[12](12-universal-memory-product.md) (positioning), [14](14-research-ai-memory.md) (what works), measurements in
[09](09-verification.md) and [18](18-benchmark-plan.md).

## 15.1 What "1000% better" and "beat it by 100%" mean here

Neither phrase is a metric. A product cannot be "1000% better" without saying at what. This spec replaces them with a
**scorecard of measured ratios against claude-mem as shipped**. "Beat by 100%" becomes "at least 2.0× on the
primary metric, same data, same hardware", and each row says whether it has been met. Anything not measured is marked
*not measured* and does not count.

| # | Metric (defined in [18](18-benchmark-plan.md)) | claude-mem as shipped | This project today | v1.0 target | Status |
|---|---|---|---|---|---|
| S1 | Retrieval Recall@5 on LoCoMo (1,536 questions) | 36.0% on raw turns; 57.7% when also given the same extracted facts (3 conversations) | hybrid 57.5%; hybrid + facts 65.2%; + rerank 72.5% | **≥ 2.0×** claude-mem | **not met when inputs are equal**: 1.60× raw vs raw; 1.17× to 1.28× like-for-like. 2.01× only if we get facts and a reranker and it gets neither (unfair) |
| S2 | Search latency (idle) | p50 1,699 ms, p95 2,824 ms (40 queries) | 2.3 ms BM25, 4.4 ms hybrid, 350 ms with rerank (small stores); at 50k rows BM25 p50 71 to 104 ms, p95 124 to 185 ms | p95 ≤ 50 ms at 50k | **met at small scale (≈ 390×), not met at 50k rows** |
| S3 | Tokens injected at session start for equal task success | not measured | not measured | ≤ 50% | not measured |
| S4 | Time from install to first useful recall | not measured | not measured | ≤ 5 min, no account | not measured |
| S5 | Lossless migration in and out (round trip equality) | n/a | tested for the bundle and claude-mem import | 100% of fields | met for current schema |
| S6 | Telemetry sent | on by default (PostHog) | none | none | met |
| S7 | Tools supported with working capture + context + rules | 14+ installers | MCP + rules for 9, no hook installers | ≥ 8 with one-command setup | open |
| S8 | LLM-judged answer accuracy on LongMemEval-S | vendor-reported only | not measured | ≥ best published open system, own judge | not measured |

Rule for claims: a number appears in marketing only if its row in [18](18-benchmark-plan.md) has a reproducible command and a
dated result. Vendor-reported numbers for other systems conflict by more than 20 points ([14](14-research-ai-memory.md#143-what-the-published-numbers-do-and-do-not-show)); do not quote them.

## 15.2 Vision, problem, users

**Vision.** Your AI tools remember what matters, follow your rules, and none of it is locked in one vendor, one account, or one cloud.

**Problem.** Every coding agent forgets between sessions. The tools that fix it are tied to one agent, send data to a
vendor by default, charge for hosting and team features, and inject large context blocks that [measurably](14-research-ai-memory.md#142-findings-that-shape-the-design)
can lower agent success and raise cost.

**Personas.**

| Persona | Needs | Pain today |
|---|---|---|
| **Multi-tool developer** (Claude Code, Cursor, Codex in one week) | One memory and one rule set across tools; nothing to pay for | Instructions copied by hand into 4 files; memory stuck in one tool |
| **Privacy-sensitive developer / company** | No account, no telemetry, secrets never stored, local models | Default-on telemetry; hosted processing |
| **Team lead** | Share decisions and conventions without a cloud | Team sync is a paid tier |
| **Tool or agent builder** | A stable, documented memory API and format | Each memory system has its own shape |

**Non-goals (v1).** Hosted cloud. Billing. Accounts. A new IDE or agent. A token or any financial product.
Multi-tenant SaaS. Replacing the model provider's own memory features.

## 15.3 Principles

1. **Inject little, retrieve on demand.** Memory text in the prompt has a cost and can hurt ([14](14-research-ai-memory.md#142-findings-that-shape-the-design)). Default to a small, ranked, budgeted context and let the agent search for more.
2. **Everything is provenance-linked.** Every recalled item points to the raw event that produced it.
3. **Local and private by default.** Loopback only, redact before store, no telemetry, optional model calls are explicit and costed.
4. **Open formats, easy exit.** The bundle format is versioned and documented; export is one command.
5. **Measure, then claim.** The benchmark harness is part of the product repo and runs in CI.
6. **Small core, adapters at the edge.** The store and retrieval pipeline know nothing about any tool.

## 15.4 Functional requirements

Priority: **P0** blocks v1.0, **P1** v1.x, **P2** later. "Now" = status in this repo today.

### Capture
| ID | Requirement | Acceptance | P | Now |
|---|---|---|---|---|
| FR-C1 | Accept events from any tool via CLI, REST and MCP | Round-trip tests for each; payload adapters for Claude Code, Codex, Cursor, Gemini CLI hook shapes | P0 | partial (generic + Claude-style) |
| FR-C2 | Redact secrets and `<private>` before anything is stored | Fuzz suite: no known secret format survives in any position | P0 | done (14 formats + URL credentials) |
| FR-C3 | Per-tool hook installer (`aletheia install <tool>`) | Idempotent; backup; uninstall restores; verified against a real install of each tool | P0 | missing |
| FR-C4 | Transcript watcher for tools without hooks | Ingests Codex/other session files incrementally without duplicates | P1 | missing |
| FR-C5 | Excluded projects and skip rules | Settings page + tests | P1 | missing |

### Memory model and storage
| ID | Requirement | Acceptance | P | Now |
|---|---|---|---|---|
| FR-M1 | Episodic memory at round level (one turn or tool step per row) | LongMemEval finding: round granularity beats session granularity | P0 | done |
| FR-M2 | Fact-augmented keys: extracted facts indexed as extra keys pointing at their source | LoCoMo Recall@5 gain reproduced (+7.7 points measured with the dataset's facts: 57.5 to 65.2) | P0 | benchmarked; extraction step missing |
| FR-M3 | Bi-temporal facts: `valid_from/valid_to` and `recorded_at`; contradictions invalidate, never delete | Knowledge-update test set: latest fact wins, history queryable | P1 | missing |
| FR-M4 | Entities and links (people, files, services) with alias resolution | Entity recall test; graph neighbours usable in retrieval | P1 | missing |
| FR-M5 | Consolidation: merge duplicates, summarise old episodes, keep provenance | Token footprint drops ≥ 40% with no recall loss on the benchmark | P1 | exact-dedup only |
| FR-M6 | Forgetting policy: decay + reinforcement + pin; never silent delete | Property tests; pinned items never dropped; audit entry for every removal | P1 | pin only |
| FR-M7 | Memory types: observation, summary, prompt, note, event, rule, fact | Schema + migration tests | P0 | done (no fact yet) |

### Retrieval and context
| ID | Requirement | Acceptance | P | Now |
|---|---|---|---|---|
| FR-R1 | Hybrid retrieval: BM25 + dense, reciprocal rank fusion | Beats either alone on the benchmark | P0 | done (measured) |
| FR-R2 | Optional cross-encoder rerank of top 30 | +Recall@5 measured (65.2 to 72.5 on all 1,536 questions); p95 ≤ 300 ms CPU | P0 | built and measured; latency 350 ms mean, above the 300 ms target |
| FR-R3 | Query understanding: time range extraction, speaker/entity detection | Temporal subset gain ≥ 5 points | P1 | missing |
| FR-R4 | Token-budgeted packer: dedupe, diversity (MMR), neighbour stitching, provenance footers | Budget respected exactly; recall at budget reported | P0 | missing |
| FR-R5 | 3-layer disclosure (index, timeline, full) over MCP and REST | Contract tests; SDK client passes | P0 | done |
| FR-R6 | Session-start context ≤ N tokens by default, task-aware when a task text is given | S3 measured; never injects more than the budget | P0 | partial (char cap) |
| FR-R7 | Abstention: say "no relevant memory" instead of padding | Abstention test set | P1 | missing |

### Rules
| ID | Requirement | Acceptance | P | Now |
|---|---|---|---|---|
| FR-L1 | Rules store with scopes (everywhere, project, situation), per-tool targeting | Tests | P0 | done |
| FR-L2 | Sync to tool files with managed block, preview, backup, import back | Tests for 9 targets; each target's file format verified against its docs | P0 | done; Cursor/Windsurf details partly verified |
| FR-L3 | Rule hygiene: detect conflicts, duplicates, bloat; warn above a size budget | Lint tests; budget default from [14](14-research-ai-memory.md#142-findings-that-shape-the-design) | P1 | missing |
| FR-L4 | Learn rule suggestions from corrections in captured sessions | Precision measured on labelled sessions | P2 | missing (My Work does it with an LLM) |

### Tools and migration
| ID | Requirement | Acceptance | P | Now |
|---|---|---|---|---|
| FR-T1 | MCP server: stdio now, Streamable HTTP later | Official SDK client passes; spec version negotiation incl. 2025-11-25 | P0 | stdio done and SDK-verified |
| FR-T2 | `/v1` REST API, stable and documented, optional bearer key | OpenAPI file; contract tests | P0 | partial |
| FR-T3 | One-command connect for each tool (config written with backup) | Verified on real installs | P0 | written from docs; Windsurf path corrected; not run on real installs |
| FR-X1 | Versioned bundle export/import, idempotent | Round-trip equality test | P0 | done |
| FR-X2 | Importers: claude-mem, Markdown notes, ChatGPT / Claude.ai exports (user-provided files), Mem0 JSON | Fixture per importer | P1 | claude-mem only |
| FR-X3 | Scheduled backup | Config + test | P2 | missing |

### UI
| ID | Requirement | Acceptance | P | Now |
|---|---|---|---|---|
| FR-U1 | Memory browser: search, filters, pin, edit, delete, add | Browser e2e suite | P0 | done, no e2e suite |
| FR-U2 | Sessions view and live feed (SSE) | e2e | P0 | missing |
| FR-U3 | Settings page (providers, models, redaction, skip rules, budgets) | e2e | P0 | missing |
| FR-U4 | "Why was this recalled?" panel: scores per retriever, provenance | e2e | P1 | missing |
| FR-U5 | Cost panel for every model call | Test | P1 | usage log only |
| FR-U6 | Keyboard-first, accessible (WCAG AA), dark/light | Audit | P1 | partial |
| FR-U7 | My Work (claude-mem's view) alongside | Differential test | P0 | done |

### Team (free, self-hosted)
| ID | Requirement | Acceptance | P | Now |
|---|---|---|---|---|
| FR-S1 | Shared server mode with per-client keys and per-project ACL | Security tests | P1 | missing |
| FR-S2 | Append-only operation log with hybrid logical clocks for merge | Convergence property tests | P2 | missing |
| FR-S3 | Review queue for shared memories (propose, approve) | e2e | P2 | missing |

## 15.5 Non-functional requirements

| ID | Requirement | Target | Now |
|---|---|---|---|
| NFR-1 | Search p95 | ≤ 50 ms at 50k memories, ≤ 150 ms at 500k | 69 to 124 ms at 50k (see [14](14-research-ai-memory.md#146-measured-results)) |
| NFR-2 | Ingest | ≥ 3,000 memories/s bulk | 3,100/s |
| NFR-3 | Footprint | Idle RSS ≤ 150 MB without embeddings | not measured |
| NFR-4 | Crash safety | No loss on kill -9 during writes | WAL; test missing |
| NFR-5 | Concurrency | N processes writing one DB | tested with 5 processes |
| NFR-6 | Security | Loopback only; origin checks; no raw markup insertion; secrets redacted; dependency count ≤ 5 | met; 0 required deps |
| NFR-7 | Privacy | No network except explicit model calls and one-time model download | met |
| NFR-8 | Portability | Linux, macOS, Windows | Linux only tested |
| NFR-9 | Accessibility | WCAG 2.2 AA | not audited |
| NFR-10 | Compatibility | Reads claude-mem 15.x DB defensively; fails loudly, not silently (finding F1) | silent today |

## 15.6 Release plan

| Release | Contents | Gate |
|---|---|---|
| **v0.9 (now)** | My Work clone, hub, MCP, rules sync, import/export, hybrid retrieval, benchmarks | this repo, 115+ tests |
| **v1.0** | FR-C3, FR-R4, FR-R6, FR-U2, FR-U3, FR-T3 verified, e2e suite, S1 ≥ 2.0× or an honest revised target | scorecard rows S1 to S7 measured |
| **v1.1** | Bi-temporal facts, entities, consolidation, query understanding, importers | LongMemEval-S result published |
| **v2.0** | Team server, op-log sync, review queue | security review |

## 15.7 Risks

| Risk | Impact | Mitigation |
|---|---|---|
| The ≥ 2× retrieval target is not reachable on raw saves | The headline claim fails | Report the true ratio; compete on latency, injected tokens, privacy, migration, and cost where the gap is large and measured |
| Tool config formats change | Connect breaks silently | Registry with per-tool verification date, CI smoke test against pinned tool versions, loud failure |
| Upstream schema drift | Importer returns empty | Schema probe at import time; fail with a message listing missing columns |
| Benchmarks overfit (LoCoMo) | False confidence | Hold-out set; add LongMemEval, BEAM, MemoryAgentBench and a coding-specific set |
| Memory poisoning (prompt injection stored as memory) | Agent follows hostile text | Mark memory as data, wrap on injection, never auto-run instructions from memory, review queue for shared memory |
| Local embedding model download blocked | Semantic search unavailable | Works without it (BM25), clear message |

## 15.8 Open questions

1. Is the primary user one developer or a team? It decides whether FR-S* moves into v1.0.
2. Which three tools first for verified one-command setup?
3. Is an LLM extraction step acceptable by default (cost, privacy) or opt-in? Current stance: opt-in.
4. License stays Apache-2.0 (inherits claude-mem parts); confirm no copyleft dependency before adding any.
