# 14. Research: how to build a better AI memory

Date of research: 2026-10-25. Sources are linked. Each claim is tagged **[primary]** (I read the paper's abstract or page),
**[secondary]** (a summary of it) or **[vendor]** (a company reporting on its own product). Where two sources disagree I say so.

## 14.1 How to read this

The field has three kinds of evidence: academic papers with released benchmarks, vendor blog posts that report their own scores, and
independent re-runs. The first is the most reliable; the second is the most abundant; the third shows the second cannot be trusted
at face value ([14.3](#143-what-the-published-numbers-do-and-do-not-show)). This document therefore keeps *design findings* (which hold across sources)
separate from *leaderboard numbers* (which do not), and adds **our own measurements** ([14.6](#146-measured-results)) because nothing else is comparable.

## 14.2 Findings that shape the design

| # | Finding | Source | Consequence for this project |
|---|---|---|---|
| 1 | Chat assistants and long-context models lose roughly 30% accuracy on sustained interactions; on LongMemEval-S (about 115k tokens per question) long-context models drop 30 to 60%. Five abilities matter: information extraction, multi-session reasoning, temporal reasoning, knowledge updates, abstention. 500 questions; S ≈ 115k tokens, M ≈ 500 sessions (≈ 1.5M tokens). | LongMemEval, [arXiv 2410.10813](https://arxiv.org/abs/2410.10813) **[primary]** | Memory is needed; "stuff it all in context" is not the answer. Evaluate all five abilities, not only lookup. |
| 2 | **Index at round level**, not whole session; compressing everything into facts alone hurts overall but helps multi-session reasoning. | same **[primary]** | Episodes are single turns or tool steps (built). Facts are extra keys, not replacements. |
| 3 | **Fact-augmented key expansion** (extracted facts added to the index): recall@k +9.4%, accuracy +5.4% on average. | same **[primary]** | Built as a store feature; we measured **+8.4 points** Recall@5 on LoCoMo using the dataset's facts ([14.6](#146-measured-results)). Extraction itself is still to build (E2-1). |
| 4 | **Time-aware query expansion**: index events by date, filter by range: temporal recall +6.8% to +11.3%, **only with a strong LLM producing the time range**. | same **[primary]** | Planned, behind an optional model call (E1-6). A cheap rule-based parser handles most cases; Hindsight uses rules first, a small T5 model for the rest. |
| 5 | A strong recall pipeline = parallel **semantic + BM25 + graph + temporal** channels, **reciprocal rank fusion (k=60)**, **cross-encoder rerank (`cross-encoder/ms-marco-MiniLM-L-6-v2`)**, then add memories in reranked order until the token budget is full. | Hindsight, [arXiv 2512.12818](https://arxiv.org/abs/2512.12818) (full text) **[primary]** | Our pipeline is the same shape and uses the same reranker model (built: BM25, dense, RRF, rerank; planned: graph, temporal, packer). |
| 6 | **Retain** extracts "2 to 5 comprehensive facts per conversation", with coreference resolution, temporal normalisation to absolute ranges, participant attribution, entity typing and entity resolution (string similarity + co-occurrence + temporal proximity). | same **[primary]** | Spec for E2-1 and E2-2. |
| 7 | Memory split into four networks: world facts, agent experiences, synthesised entity summaries, evolving beliefs; operations **retain / recall / reflect**. Reported **39% → 83.6%** accuracy over a full-context baseline with the same 20B open model, 91.4% on LongMemEval with a larger backbone, up to 89.61% on LoCoMo (vs 75.78% for the strongest prior open system). | same **[primary]** (abstract numbers) | Structure beats raw context, even on a small model. Keep episodes, facts, entity summaries and beliefs separate in the schema (16.3). |
| 8 | **Bi-temporal graph**: track when something happened and when it was ingested; a contradicted fact gets an `invalid_at`, it is not deleted. | Zep/Graphiti, [arXiv 2501.13956](https://arxiv.org/abs/2501.13956) **[primary + secondary]** | Facts carry `valid_from/valid_to` and `recorded_at` (planned, FR-M3). |
| 9 | Extract, merge and update memories (Mem0); a graph variant adds about 2%; 91% lower p95 latency and over 90% lower token cost than full context. | Mem0, [arXiv 2504.19413](https://arxiv.org/abs/2504.19413) **[primary: abstract; vendor-authored]** | Token cost savings come from retrieval budgets, not from the memory brand. |
| 10 | Semantic lossless compression, online consolidation and intent-aware retrieval planning: "average F1 improvement of 26.4% on LoCoMo", "up to 30-fold" fewer tokens (best case). | SimpleMem, [arXiv 2601.02553](https://arxiv.org/abs/2601.02553) **[primary: abstract]** | Consolidation and intent planning are worth building after retrieval basics (E2-6, E1-6). |
| 11 | Contextual retrieval: prepend a short generated context to each chunk before embedding and BM25. Failure rate of top-20 retrieval: 5.7% → 3.7% (contextual embeddings), → 2.9% (+ contextual BM25), → 1.9% (+ rerank); about 67% fewer failures. | Anthropic, Sept 2024, via [Maginative](https://www.maginative.com/article/anthropics-contextual-retrieval-technique-enhances-rag-accuracy-by-67) and others **[secondary]** | Same family as fact keys. Cost is a one-time generation pass with prompt caching. Not built. |
| 12 | **Repository context files can hurt.** Across SWE-bench tasks and a new 138-issue benchmark, LLM-generated `AGENTS.md`-style files tended to *lower* task success and raised inference cost by over 20% (about +2.5 to +3.9 steps per task); human-written files helped most agents slightly; authors advise minimal requirements only. | Gloaguen et al., [arXiv 2602.11988](https://arxiv.org/abs/2602.11988), ICLR 2026 **[secondary: abstract + coverage; numbers unchecked against the paper]** | **The most important finding for a coding-agent memory.** Inject less, make it relevant, make rules minimal and human-written, and measure injection against no injection (E5-7). A product that dumps memory into every session may be making agents worse. |
| 13 | Performance degrades as input grows, even on simple tasks, and distractors that are topically close hurt more (18 models tested). | Chroma, [Context Rot](https://www.trychroma.com/research/context-rot) **[secondary summaries; report not read in full]** | Precision of what is injected matters as much as recall; MMR diversity and abstention are not optional. |
| 14 | Benchmarks are moving past one million tokens and past lookup: **BEAM** (100 conversations, 2,000 questions, up to 10M tokens, 10 abilities incl. contradiction resolution, event ordering, instruction following; companion LIGHT with episodic memory, working memory and a scratchpad). **MemoryAgentBench**: four competencies (accurate retrieval, test-time learning, long-range understanding, conflict resolution / selective forgetting; the name differs between arXiv versions); finds current methods fall short of all four. | [BEAM, arXiv 2510.27246](https://arxiv.org/abs/2510.27246); [MemoryAgentBench, arXiv 2507.05257](https://arxiv.org/abs/2507.05257) **[primary/secondary]** | Target scale: 10M tokens. Include contradiction and forgetting in the eval. |
| 15 | Serving cost of agentic memory is a research topic of its own ("Total Recall at What Cost?", arXiv 2608.11879) | search result title only **[not read]** | Report latency and cost with every accuracy number. |

## 14.3 What the published numbers do and do not show

Same benchmarks, same systems, incompatible numbers:

| System / benchmark | Number | Who ran it |
|---|---|---|
| Mem0 on LoCoMo / LongMemEval | 92.5 / 94.4, about 6.9k tokens per query | Mem0 **[vendor]** |
| Mem0 on LoCoMo | 66.9 | ByteRover comparison **[third party]**; 66.88 in HyMem paper (gpt-4o-mini) **[third party]** |
| Mem0 vs Zep on LoCoMo | 34.20 vs 32.40 | MemCoT paper, GPT-4.1-mini **[third party]** |
| Zep on LoCoMo | 94.7% at 155 ms (earlier config 80.32%) | Zep **[vendor]** |
| Zep on LoCoMo | 75.1 / 75.14 | ByteRover; HyMem **[third party]** |
| Zep on LongMemEval | 71.2 (GPT-4o judge) vs 63.8 in another table | Zep / academic comparison |
| Mem0 on LongMemEval | 49% (Atlan) vs 93.4 to 94.4 (Mem0) | conflicting |
| Letta on LoCoMo | 74.0 (gpt-4o-mini, filesystem storage) | Letta **[vendor]** |
| Hindsight on LongMemEval | 83.6 (20B open model), 91.4 (larger) | the Hindsight authors **[primary]** |
| BEAM-10M | RAG 24.9, LIGHT 26.6, Honcho 40.6, Hindsight 64.1; Mem0 48.6 (BEAM-1M: 64.1) | vendor-run comparisons |

Sources: [Mem0's benchmark overview](https://mem0.ai/library/agent-memory/ai-memory-benchmarks-in-2026), [Mem0 state of memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026),
[Zep vs Mem0](https://mem0.ai/library/agent-memory/zep-vs-mem0-which-ai-memory-layer-should-you-choose), [Atlan comparison](https://atlan.com/know/mem0-alternatives/),
[Hindsight paper](https://arxiv.org/pdf/2512.12818), [HyMem](https://arxiv.org/pdf/2602.13933), [MemCoT](https://arxiv.org/pdf/2604.08216), [BEAM overview](https://mem0.ai/library/agent-memory/what-is-beam-memory-benchmark).
Differences come from the judge model, the backbone, the token budget and the prompt. **Conclusion: never quote a vendor number; run the benchmark on your own stack.** Token counts are the one thing sources roughly agree on: about 1.4k to 7k per retrieval versus 16k to 26k for full context.

## 14.4 What the best systems have in common

1. They do **not** put all history in the prompt; they retrieve under a token budget.
2. They keep **raw episodes** and add **derived facts/entities/summaries** as extra retrieval keys, with links back.
3. They fuse **keyword and semantic** retrieval and often **graph and time**; the strongest add a **cross-encoder rerank**.
4. They treat **time** as data (valid time and record time), not as text.
5. They resolve **contradictions** by invalidation, not overwrite.
6. They consolidate and forget on a schedule rather than growing without bound.
7. The ones with real latency numbers are **fast because they are local or indexed**, not because they are simple.

## 14.5 Where claude-mem sits (read from its source)

From the repo ([11](11-feature-inventory.md)): SQLite plus a **Chroma** vector service started through `uvx chroma-mcp` (a Python process), an LLM "observer" that
writes observations and summaries, hybrid search, a 3-layer MCP workflow, a **large SessionStart context injection** with ~15 tuning settings, 208 settings in total,
telemetry on by default. Strengths: it ingests *meaning* (observer observations), it is integrated into many tools, it has a mature UI. Weaknesses visible in this work:
search latency of seconds, a second runtime (Python/Chroma) to run, a silent failure that emptied half its My Work view (F1), and default context injection that the
AGENTS.md study suggests could cost task success.

## 14.6 Measured results

All numbers below were produced on 2026-10-25/26 with the commands in [18](18-benchmark-plan.md#185-commands-today).
Retrieval only (does the memory surface the gold evidence turn?). **No LLM-judged answer accuracy was measured.**
Data: LoCoMo, 10 conversations, **1,536 questions** (categories 1 to 4, with gold evidence). Embeddings: bge-small-en-v1.5 (384 d, int8 ONNX). Reranker: ms-marco-MiniLM-L-6-v2 (int8 ONNX).
claude-mem 15.2.0 ran as a real worker in an isolated data dir; its real `~/.claude-mem` was verified untouched.

### A. Raw turns in, raw turns indexed (the fair "no extraction" comparison, all 1,536 questions)

| System | R@1 | R@3 | R@5 | R@10 | all-gold@5 | MRR | tokens in top 5 | search latency |
|---|---|---|---|---|---|---|---|---|
| **claude-mem** (FTS + Chroma, as shipped) | 16.6 | 29.9 | **36.0** | 45.0 | 32.3 | 0.285 | 187 | **p50 1,699 ms, p95 2,824 ms** (idle, 40 queries) |
| this project: AND-prefix (the first search I shipped) | 0.1 | 0.1 | 0.1 | 0.1 | 0.1 | 0.001 | 1 | 3 ms |
| this project: BM25 (any term, stemming) | 33.1 | 49.2 | 55.1 | 62.3 | 50.3 | 0.481 | 207 | 2.3 ms |
| this project: dense (bge-small) | 26.5 | 41.8 | 49.5 | 58.5 | 44.5 | 0.421 | 193 | 4 ms |
| this project: **hybrid** (BM25 + dense, RRF) | 32.4 | 49.7 | **57.5** | 66.2 | 52.0 | 0.497 | 207 | 4.4 ms |

Ratio of hybrid to claude-mem: Recall@5 **1.60×**, Recall@1 1.95×, MRR 1.74×, latency about **390×** lower (p50 1,699 ms vs 4.4 ms; both on small, idle stores).

### B. With extracted facts indexed too (like-for-like: both systems given the same facts; 3 conversations, 383 questions)

| System | R@1 | R@3 | R@5 | R@10 | all-gold@5 | MRR | tokens in top 5 |
|---|---|---|---|---|---|---|---|
| claude-mem + facts saved as extra memories | 40.0 | 53.4 | **57.7** | 63.3 | 53.0 | 0.530 | 259 |
| this project: hybrid + facts | 45.5 | 60.7 | **67.6** | 75.6 | 61.9 | 0.616 | 247 |
| this project: hybrid + facts + **rerank** (top 30) | 53.8 | 68.9 | **73.7** | 77.7 | 69.5 | 0.686 | 261 |

Ratio to claude-mem + facts: Recall@5 **1.17×** (hybrid) and **1.28×** (with rerank); Recall@1 1.14× and 1.35×; MRR 1.16× and 1.29×.
Latency (idle): hybrid + facts 5.8 ms; with rerank **350 ms** for 30 candidates on CPU. claude-mem with facts was measured while the machine was busy (6.3 s per query), so its latency is not comparable; the idle figure in A applies.

The facts used here are the dataset's own `observation` field (LLM-extracted by the dataset authors, with source turn ids). Real extraction costs model calls and will be noisier.

### C. All 10 conversations, our pipeline only

| Strategy | R@1 | R@3 | R@5 | R@10 | R@15 | all-gold@5 | MRR |
|---|---|---|---|---|---|---|---|
| BM25 | 33.1 | 49.2 | 55.1 | 62.3 | 66.0 | 50.3 | 0.481 |
| hybrid | 32.4 | 49.7 | 57.5 | 66.2 | 70.9 | 52.0 | 0.497 |
| hybrid + facts | 41.1 | 58.0 | 65.2 | 74.3 | 78.2 | 59.2 | 0.588 |
| hybrid + facts + rerank | 50.6 | 67.7 | **72.5** | 77.7 | 80.2 | 66.3 | **0.679** |

Recall@5 by LoCoMo category number (n = 282, 321, 92, 841): BM25 24.5 / 66.0 / 25.5 / 64.4; hybrid 33.2 / 68.9 / 30.6 / 64.2; hybrid + facts 36.8 / 74.1 / 38.9 / 74.1; with rerank **46.0 / 79.5 / 41.5 / 82.1**. claude-mem raw: 18.6 / 42.6 / 14.8 / 41.6.
The weakest category for every system is number 1 (recalled from the dataset repo: multi-hop). Retrieval alone will not fix it; it needs an iterative step or a reasoning model.

### D. Ratios against the scorecard targets

| Comparison | Recall@5 ratio | Meets "≥ 2×"? |
|---|---|---|
| hybrid vs claude-mem, raw turns | 1.60× | no |
| hybrid + facts + rerank (all 10 conversations) vs claude-mem **raw** | 2.01× | yes, but unfair: it gives us facts and a reranker and gives claude-mem neither |
| hybrid + facts vs claude-mem + facts (like-for-like) | 1.17× | no |
| hybrid + facts + rerank vs claude-mem + facts (like-for-like) | 1.28× | no |
| search latency (idle) | about 390× to 740× lower without rerank; about 5× lower with rerank | yes |

**Conclusion on "beat it by 100%": not true for retrieval quality when both sides get the same inputs.** The honest, measured claims are: about 1.2× to 1.3× better recall when both use extraction, about 1.6× on raw turns, and two to three orders of magnitude faster without the reranker.

### E. Cost and shape of the pipeline

| Stage | Cost (measured) |
|---|---|
| Insert | 3,077 memories/s |
| BM25 over 50,000 memories | p50 71 to 104 ms (all projects), 38 to 49 ms (one project) |
| Hybrid over 50,000 memories and 20,000 vectors | p50 94 to 129 ms; brute-force vector scan 25 ms p50; 31 MB of vectors |
| Newest 30, 50,000 memories | 0.4 ms (was 222 ms before an index) |
| Rerank 30 candidates | 350 ms CPU (idle) |
| Neighbour window (top 5, plus and minus one turn) | 548 tokens in the top set instead of 242, and **lower** recall at equal size than taking the top 15 reranked (R@15 77.5 vs 80.2); not worth it |

The unfiltered BM25 target of p95 ≤ 50 ms at 50k rows (spec S2) is **not met** (p95 124 to 185 ms).

### F. What the experiments caught (details in [08](08-findings.md))

- My first search scored 0.1%: it required every question word to match (F5).
- The first claude-mem pilot scored 24.1% because I queried before its index had finished; after it finished, 38.9% (F11). A premature benchmark would have inflated the claimed lead.
- A latency "optimisation" (aggressive rare-term pruning) was swept against recall: on LoCoMo the settings made no measurable difference (55.0 to 55.1 BM25), so the gentle default (12 terms, 60%) was kept.
- My rerank benchmark first reported numbers about half the true ones (BM25 29% instead of 56%) because SQLite results went wrong after the cross-encoder ran in the same process (Bun 1.3.10 with onnxruntime). The harness now collects candidates first and reranks afterwards, and it is cross-checked: its non-rerank rows equal a run with no reranker. Numbers from the broken runs were discarded (F12).

### G. Threats to validity

LoCoMo is synthetic social chat, not code. Facts come from the dataset. claude-mem is built to ingest through its LLM observer, not raw saves. Single machine, single run per configuration, no confidence intervals (the no-rerank rows were identical across repeated runs, so they are deterministic). The 3-conversation comparison has n = 383.

## 14.7 Design principles that follow ("optimised" made concrete)

"Optimised 1000%" is not a target; these are the levers, each tied to a measurement above:

1. **Retrieval first, measured.** Hybrid + fact keys + rerank, tracked on every commit (E5-9).
2. **Budgeted, minimal injection.** Pinned items and rules in a small default block; everything else on demand.
3. **Speed as a feature.** Local SQLite and ONNX models; milliseconds, not seconds. Keep the vector scan brute-force until latency says otherwise.
4. **Provenance and time everywhere.**
5. **Fail loudly.** No silent empty results; probes at import and startup.
6. **Privacy by construction.** Redact first, no telemetry, local models supported.
7. **Own the exit.** Versioned bundle, Markdown export, rules written back to every tool's own file.
8. **Honest evaluation.** Published harness, published baselines, negative results included.

## 14.8 Where we can plausibly beat claude-mem, and by how much

| Dimension | Why we can | Evidence so far | Confidence in a ≥ 2× win |
|---|---|---|---|
| Search latency | Local brute-force and FTS in-process versus a Python Chroma service | measured gap of orders of magnitude on a 6k-row store | **high** |
| Setup and footprint | One process, no Python or `uv` | by construction; not measured | medium |
| Privacy | No telemetry; redaction at capture | by construction | high (it is a yes/no) |
| Migration and rules portability | Bundle, 9-tool rules sync | tested | high (feature the other lacks) |
| Retrieval recall on raw turns | Hybrid + facts + rerank | see 14.6 | **not yet 2×** |
| Tokens per useful recall | Budgeted packer, abstention | not built | unknown |
| Task success with injected memory | Minimal injection policy | not measured | unknown |
| Answer accuracy | Needs extraction and a judge | not measured | unknown |

The honest summary: **2× on retrieval recall is not established and may not be reachable on raw saves; 100× on latency is.** The plan is to compete where the measured gap is large and
to close the recall gap with extraction, entity and time handling, then re-measure before claiming anything.

## 14.9 Not verified

- Primary papers for Zep, Mem0, SimpleMem, Hindsight were read at abstract level or via fetched summaries; full-text details beyond what is quoted were not checked.
- The AGENTS.md numbers come from the abstract and press coverage.
- Context Rot and Anthropic's contextual retrieval were read through secondary coverage, not the original pages.
- Vendor and third-party benchmark numbers are listed to show disagreement, not as findings.
- LoCoMo category names are recalled, not verified.
