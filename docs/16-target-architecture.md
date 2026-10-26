# 16. Target architecture

Where the system goes from today's repo ([01](01-architecture.md) describes what exists). Every design choice cites the
evidence behind it ([14](14-research-ai-memory.md)) or says it is a judgement. Status tags: **built**, **partial**, **planned**.

## 16.1 Context

```
                 ┌────────────────────────────────────────────────────────────────────┐
  Claude Code ──►│                                                                    │
  Codex CLI   ──►│  hooks / transcripts   ┌──────────────┐   MCP (stdio, HTTP)        │◄── agent asks
  Cursor      ──►│  ─────────────────────►│              │◄───────────────────────────│    (search, timeline,
  Gemini CLI  ──►│   capture adapters     │  MEMORY HUB  │   REST /v1                 │     get, save, rules)
  Windsurf    ──►│                        │  (one local  │◄───────────────────────────│
  OpenCode …  ──►│  files (rules sync) ◄──│   process)   │   CLI `aletheia`              │◄── scripts, CI
                 │                        └──────┬───────┘                            │
                 └───────────────────────────────┼────────────────────────────────────┘
                                                 │ optional, explicit
                         ┌───────────────────────┼─────────────────────────┐
                         ▼                       ▼                         ▼
                 local models (ONNX)     model providers          other systems
                 embeddings, reranker    (claude CLI, OpenAI-    (import: claude-mem,
                                          compatible, Ollama)      Markdown, exports)
```

Trust boundaries: tools are untrusted writers (they may carry prompt-injected text); memory is untrusted data when read back;
the local machine user is trusted; the network is not part of the product except explicit model calls.

## 16.2 Containers

| Container | Responsibility | Tech | Status |
|---|---|---|---|
| **Server** (`bin/aletheia-server.mjs`) | HTTP API, UI hosting, SSE, change polling | Bun, no framework | built |
| **MCP server** (`bin/mcp.mjs`) | Tool surface for agents, stdio | JSON-RPC 2.0 | built, SDK-verified; HTTP transport planned |
| **CLI** (`bin/aletheia.mjs`) | Capture, search, rules, connect, import/export | Bun | built |
| **Store** (`src/hub/store.mjs`) | Memories, rules, vectors, audit, settings | SQLite WAL + FTS5 | built |
| **Retrieval** (`retrieval.mjs`, `embed.mjs`, `rerank.mjs`) | Candidate generation, fusion, rerank | BM25 + ONNX bi/cross encoders | built |
| **Ingestion** (`capture.mjs`, `compress.mjs`) | Redact, normalise, extract, consolidate | pure JS + optional model | partial |
| **Adapters** (`tools.mjs`, `rules-sync.mjs`, `importers.mjs`) | Per-tool facts and file formats | data tables + small functions | partial |
| **My Work** (`src/readmodel`, `ledger`, `refresh`) | claude-mem's view, clone | as [01](01-architecture.md) | built |
| **Hub UI** (`public-hub/`) | Manage memory, rules, tools, migration | ES modules, no build | partial |
| **Eval harness** (`bench/`, `test/`) | Reproducible measurements | Bun | built for retrieval; answer-accuracy planned |

One process, one SQLite file, zero required dependencies. Optional packages (`@huggingface/transformers`) add semantic
search and reranking. Rationale: the audience installs this next to a dozen other tools; every extra moving part (Chroma +
Python + `uv`, as in claude-mem) is a support cost, and a measured one: its search takes seconds, ours milliseconds ([14](14-research-ai-memory.md#146-measured-results)).

## 16.3 Data model v2

Today: one `memories` table with a `kind`. Target: **events are immutable; everything else is derived and re-derivable.**

```
events            (id, ts, tool, session, project, kind, payload_redacted, source_hash)         immutable, append-only
episodes          (id, event_ids, project, tool, session, round_text, ts)                        round-level units (LongMemEval: best granularity)
facts             (id, subject_entity, predicate, object, text, source_episode,
                   valid_from, valid_to NULL, recorded_at, superseded_by NULL, confidence)      bi-temporal; contradiction sets valid_to, never deletes
entities          (id, name, kind, aliases[], project)                                           people, files, services, concepts
links             (src, dst, kind, weight)                                                       fact↔entity, episode↔file, entity↔entity
keys              (id, owner_kind, owner_id, text, source)                                       retrieval keys: episode text, fact text, summaries
vectors           (key_id, model, dim, blob)                                                     optional
rules             (id, scope, when, then, enabled, tools[], source, history[])
summaries         (id, covers[], text, level)                                                    consolidated old episodes, provenance kept
audit             (id, ts, actor, action, detail)
```

Today's `memories` rows map to `episodes` + `keys` (observation/note/prompt) and to `summaries`; the migration is additive.
Rules for the model:

1. **Provenance is mandatory.** A fact, summary or recalled snippet links to the events that support it. The UI and MCP output show it.
2. **Time has two axes.** *Valid time* (when it was true) and *record time* (when we learned it) as in Graphiti's bi-temporal model ([14](14-research-ai-memory.md#142-findings-that-shape-the-design)). "We use Postgres" becoming "we moved to MySQL" invalidates the first fact; both stay queryable.
3. **Deletion is explicit and audited.** Forgetting lowers rank and eventually archives; only the user hard-deletes.
4. **Memory is data, never instructions.** Anything read back is wrapped and labelled; the server never executes memory text.

## 16.4 Ingestion pipeline

```
raw hook payload
  → normalise per tool                        (built: Claude-style + generic)
  → redact secrets, strip <private>           (built: 14 formats + URL credentials)
  → event stored                              (built as memory kind=event)
  → segment into rounds (episodes)            (built: one event/turn per row)
  → [optional model] extract facts, entities  (planned; prompt + strict validator like compress.mjs)
  → resolve entities, detect contradictions   (planned; invalidate older facts, never delete)
  → dedupe (exact now; near-duplicate planned: TF-IDF cosine like claude-mem's dedup)
  → index keys: BM25 always, vectors if enabled (built)
  → reinforce if seen again                   (planned)
```

Extraction is the only step that costs model calls. Defaults: **off**; when on, batched per session, with the cost shown before and
after, and local-model support through any OpenAI-compatible endpoint (built for `compress`). Measured value of extraction: +8.4 Recall@5
points when facts are indexed as extra keys ([14](14-research-ai-memory.md#146-measured-results); facts there come from the dataset).

## 16.5 Retrieval pipeline

```
query (+ optional task text, project, tool, time hint)
  1 understand   : content terms; time expressions → date range; names → entity/speaker filter        (planned; terms built)
  2 candidates   : BM25 over keys (rare terms first) ‖ dense KNN ‖ pinned ‖ recent ‖ entity neighbours   (BM25, dense, pinned built)
  3 fuse         : reciprocal rank fusion, k=60                                                         (built)
  4 rerank       : cross-encoder on top 30                                                              (built, optional)
  5 pack         : token budget, dedupe by source episode, MMR diversity, neighbour stitching           (planned)
  6 assemble     : provenance footers, "no relevant memory" when scores are below a floor               (planned)
```

Why each stage (evidence): fusion of keyword and dense retrieval beats either alone on LoCoMo here (57.5 vs 55.1 and 49.5 Recall@5); a reranker added the last
gain in Anthropic's contextual-retrieval report and here (65.2 → 72.5 on all 1,536 questions, MRR .588 → .679); fact keys follow LongMemEval's key-expansion result (+7.7 points here);
time-aware filtering follows LongMemEval's temporal result (only reliable with a strong time-range extractor, so planned behind a model call).
Performance engineering already measured: pinning FTS as the outer join took a filtered query from 267 ms to 2 ms; gentle rare-term pruning
(12 terms, 60%) cut 50k-row BM25 from 156 ms to about 104 ms with no recall change on LoCoMo, and aggressive pruning (71 ms) was not adopted because a person's name can sit in over a third of
a conversation's turns; an index made "newest 30" about 440× faster (222 → 0.5 ms).

**Injection policy.** The measured finding that repository context files can lower agent success and raise cost by over 20% ([14](14-research-ai-memory.md#142-findings-that-shape-the-design))
drives three rules: (a) session-start text is small and budgeted, pinned items first; (b) task-specific recall happens on demand through MCP, not by default;
(c) rules are minimal, human-written, linted for size and conflicts. Whether our policy beats "inject nothing" is an experiment in [18](18-benchmark-plan.md), not an assumption.

## 16.6 Consolidation and forgetting

- **Reinforcement:** a memory recalled and used (or re-observed) gains weight; weight decays with time. Ranking uses weight as a small prior, never as a filter.
- **Consolidation:** episodes older than N days with low weight are summarised (model optional; extractive fallback) into `summaries` with `covers[]`; originals stay in cold storage.
- **Contradictions:** a new fact with the same subject and predicate and a different object sets `valid_to` on the old one and records `superseded_by`.
- **Budget:** per-project size cap with a report of what would be archived; nothing is dropped without a user-visible audit entry.

## 16.7 Tool integration

| Mechanism | Used for | Notes |
|---|---|---|
| Hooks | Capture, session-start context | Per-tool installer writes the hook config with a backup; verified against real installs (planned) |
| MCP | Agent-initiated search, save, rules | Stdio built; Streamable HTTP planned (spec 2025-11-25 requires Origin validation, localhost binding, auth) |
| REST `/v1` | Anything else | Loopback only; optional bearer key |
| Files | Rules | Managed block; `AGENTS.md` as the common target, tool-specific files where the tool needs them |

Tool facts live in one registry (`tools.mjs`) with a `verifiedOn` date per entry and a CI smoke test per pinned tool version (planned). Verified so far
(2026-10-25, official docs): Cursor `mcp.json`, Gemini CLI `settings.json`, Codex `config.toml`, Claude Code `claude mcp add` and scopes, OpenCode `mcp` block, MCP stdio framing;
corrected: Windsurf's current docs name `~/.config/devin/mcp_config.json`, the registry now tries both paths.

## 16.8 Security

| Threat | Control | Status |
|---|---|---|
| Hostile web page calls the local API | Loopback bind; Host and Origin validation; same-origin JSON for writes; `maxRequestBodySize` | built, tested |
| DNS rebinding | Host header allow-list | built, tested |
| Secrets stored in memory | Redaction before store; `<private>` dropped; fuzzed formats | built; list must keep growing |
| Stored text hijacks the agent (memory poisoning) | Label as data; no auto-exec; shared memory needs review | planned (policy), UI wraps text as text |
| XSS in the UI | Text nodes only; test forbids raw markup insertion | built |
| Config corruption by connectors | Preview, backup, refuse invalid JSON, idempotent | built |
| Supply chain | Zero required dependencies; optional ones pinned | built |
| Path abuse | Absolute-path checks, folder existence, file size caps | built |
| Multi-user machine | File modes 0600 for ledger; hub DB mode to be set | partial |

## 16.9 Observability and evaluation

- Every search logs (locally) the query shape, candidate counts per retriever, final ranks, latency, and which results the agent fetched. This powers "why was this recalled" and the online metric *fetch rate of returned ids*.
- Offline: `bench/` runs the benchmark suite; CI fails on regression beyond a tolerance.
- Cost: every model call is logged with tokens and price; the UI shows totals.

## 16.10 Deployment

Single `bun` process (user service). Planned: `bun build --compile` single binary; Docker image; Homebrew/npm wrappers. No daemon manager beyond systemd/launchd.

## 16.11 Decisions (ADR summary)

| # | Decision | Alternatives rejected | Why | Revisit when |
|---|---|---|---|---|
| 1 | SQLite (WAL, FTS5) is the only required store | Postgres, Chroma service | One file, zero ops, ms latency measured | > 1M memories or multi-user server |
| 2 | Embeddings and rerank are optional local ONNX models | Hosted embeddings; Chroma | Privacy, cost, no network; 384-d model gives usable recall | A model clearly better at similar size |
| 3 | Reciprocal rank fusion | Learned weights, score blending | No score calibration needed; measured gain | Enough labelled data to learn weights |
| 4 | No telemetry at all | Opt-out telemetry | Trust is the product for secret-adjacent data | Never |
| 5 | MCP + REST + CLI + files | One of them | Tools differ in what they can call | A single standard dominates |
| 6 | Events immutable, facts bi-temporal | Overwrite on update | Knowledge-update questions need history | n/a |
| 7 | Brute-force vector scan up to ~100k | HNSW, sqlite-vec | 25 ms p50 at 20k measured, no native extension, works in Bun | Latency > 50 ms p95 |
| 8 | Extraction by model is opt-in | On by default | Cost and privacy; value measured separately | Local extraction model good enough |
| 9 | No tokens or financial layer | Token | non-goal | n/a |
