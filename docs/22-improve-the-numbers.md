# 22. Improve the numbers

This is the public scoreboard and the work plan behind it. Two rules govern everything here:

1. **A number is a claim only if a command reproduces it.** Every row in 22.2 names the command that produces it.
2. **A target is not a promise.** Each target has a stop condition: the evidence that makes us drop the claim.

All current numbers were measured on 2026-10-25/26 and are copied from
[14 §14.6](14-research-ai-memory.md#146-measured-results) so there is one source of truth. They are *not* re-measured in
this document.

## 22.1 Where we stand

| Metric | claude-mem 15.2.1 | Aletheia today | Gap | Target |
|---|---:|---:|---|---:|
| LoCoMo Recall@5, raw turns (1,536 questions) | 36.0% | **57.5%** | +21.5 pts; 1.60× | **≥ 70%** |
| LoCoMo Recall@5, same facts both sides (383 questions) | 57.7% | **67.6%** (73.7% with rerank) | +9.9 / +16.0 pts; 1.17× / 1.28× | **≥ 80%** |
| LoCoMo MRR, same facts | 0.530 | **0.616** (0.686 with rerank) | +0.086 / +0.156 | **≥ 0.72** |
| Search latency, idle, small store | p50 1,699 ms / p95 2,824 ms | **2.3–6 ms**; 350 ms with rerank | 390× faster without rerank | keep p95 ≤ 300 ms with rerank |
| BM25 at 50,000 rows | not measured by us | **p50 71–104 ms, p95 124–185 ms** | misses the 50 ms target | **p95 ≤ 50 ms** |
| Hybrid at 50,000 rows + 20,000 vectors | not measured by us | **p50 94–129 ms** | misses the 50 ms target | **p95 ≤ 50 ms** |
| Answer accuracy (LLM-judged) | no published number | **not measured** | unknown | see 22.6 |
| Tokens injected at session start | not comparable | char-capped at 6,000 | not measured | measure first |

What the current numbers **do** prove: on this machine, with this harness, this retrieval code finds more gold evidence
than claude-mem as shipped, and does it in milliseconds rather than seconds. What they **do not** prove: that answers
are better, that the advantage holds at 500k rows, that extraction reproduces the fact-key gain, or that memory helps a
coding agent. Those are the four open questions this plan attacks in that order.

## 22.2 The experiments, ranked

Ranking rule: measurement before optimisation; then changes with a measured or published effect; then exploratory
changes; then infrastructure. Cost is engineering effort plus model spend, not wall-clock promises.

Each row names a task in [TASKS.md](tasks/TASKS.md). `Command` is the exact command **after the task adds the flag**;
commands that already exist are marked `[exists]`.

### E01. Answer-accuracy harness (LongMemEval-S)

- **Task:** T-051. **Rank:** 1. **Cost:** medium (one reader + one judge call per question; 500 questions × 2 arms).
- **Hypothesis:** retrieval recall does not translate one-for-one into answer accuracy, so the project cannot claim
  "better memory" until a reader and a judge are in the loop.
- **Expected gain:** measurement, not quality. The source of that expectation is LongMemEval's own decomposition into
  indexing, retrieval and reading, where the reading stage changes the score independently of retrieval
  (`arXiv:2410.10813` abstract). Vendor numbers that disagree by >20 points on the same benchmark are the second
  reason ([14 §14.3](14-research-ai-memory.md#143-what-the-published-numbers-do-and-do-not-show)).
- **Pass threshold:** the harness reproduces a fixed, pre-registered baseline within 2 points on a re-run; judge–human
  agreement ≥ 90% on a 5% sample; raw per-question outputs are written.
- **Stop condition:** if judge–human agreement is <85%, do not publish an answer-accuracy claim at all.
- **Command:** `bun bench/longmemeval.mjs --data longmemeval_s.json --reader <model> --judge <model> --arms none,full,aletheia --out answers.json`

### E02. Fact extraction and fact-augmented keys

- **Task:** T-018 (extraction), T-019 (batching and cost), T-017 (keys in the schema). **Rank:** 2. **Cost:** high
  (one model pass over every event; local model option to keep it free).
- **Hypothesis:** indexing extracted atomic facts as extra keys recovers the gain measured with the dataset's own facts.
- **Expected gain:** +9.4% recall@k and +5.4% accuracy on average in LongMemEval (`arXiv:2410.10813`, abstract); this
  project measured **+7.7 points Recall@5** (57.5 → 65.2) using the dataset's facts
  ([14 §14.6C](14-research-ai-memory.md#146-measured-results)). Extraction will be noisier, so expect less.
- **Pass threshold:** ≥ +5 points Recall@5 with **extracted** facts at ≤ 10% precision loss on a 100-fact manual sample.
- **Stop condition:** if extracted facts give < +3 points, remove the claim that fact keys are a win and keep the
  feature as an optional index only.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --extract --provider local --out facts.json && bun bench/locomo-retrieval.mjs --data locomo10.json --facts facts.json --out r.json`

### E03. Query expansion and rewriting

- **Task:** T-038. **Rank:** 3. **Cost:** one model call per query unless a rule-based parser handles it.
- **Hypothesis:** rewriting a conversational question into search terms, and extracting an explicit date range, raises
  recall on temporal and multi-hop questions without hurting others.
- **Expected gain:** time-aware query expansion gave **+6.8% to +11.3% temporal recall**, but only with a strong LLM
  producing the range (`arXiv:2410.10813`, abstract). HyDE reports gains for zero-shot dense retrieval by embedding a
  generated hypothetical document (`arXiv:2212.10496`, abstract); it is the fallback when no date is present.
- **Pass threshold:** +3 points overall Recall@5, +5 points on LoCoMo temporal questions, no category regression >1
  point, p95 increase ≤ 100 ms with a local model.
- **Stop condition:** if the overall gain is < +1 point or latency doubles, keep only the rule-based date parser.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --expand rewrite,time --provider local --out r.json`

### E04. Round-level indexing

- **Task:** T-037. **Rank:** 4. **Cost:** low (segmentation plus one indexing pass).
- **Hypothesis:** indexing each turn or tool step separately, rather than whole sessions, improves recall because the
  retrieved unit matches the gold evidence unit.
- **Expected gain:** LongMemEval reports session decomposition for value granularity as one of its design
  optimisations (`arXiv:2410.10813`, abstract). No percentage is published for this arm, so the expectation is
  directional, not numeric.
- **Pass threshold:** ≥ +2 points Recall@5 at equal index size; no increase in tokens in the top 5.
- **Stop condition:** if recall is flat or worse, keep whole-session episodes and stop describing round-level indexing
  as an advantage.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --granularity round --out r.json`

### E05. Hybrid weighting and RRF sweep

- **Task:** T-039. **Rank:** 5. **Cost:** low (sweep on a held-out conversation).
- **Hypothesis:** the current equal-weight RRF is not optimal for this corpus; BM25 should carry more weight on
  identifiers and dense more on paraphrases.
- **Expected gain:** unknown; this is a tuning experiment. The justification for RRF itself is that it is robust to
  incomparable score scales (`src/hub/retrieval.mjs:77`; the method is standard). Do not expect more than a few points.
- **Pass threshold:** +1 point Recall@5 on the held-out split; the winner is frozen before the full run.
- **Stop condition:** if the best setting is within the bootstrap CI of equal weights, keep equal weights and say so.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --sweep rrf --holdout conv-26 --out sweep.json`

### E06. Embedding-model ladder

- **Task:** T-040. **Rank:** 6. **Cost:** medium (downloads and re-indexing; 33 MB to 1.3 GB per model).
- **Hypothesis:** a larger or better-trained encoder raises dense recall enough to matter after fusion.
- **Expected gain:** no same-harness number exists for this corpus, so this is exploratory. Model facts are exact
  (Hugging Face API, 2026-10-26):

| Model | Parameters | Licence | Note |
|---|---:|---|---|
| `BAAI/bge-small-en-v1.5` (current) | 33.4M | MIT | 384 d, fastest |
| `intfloat/e5-small-v2` | 33.4M | MIT | 384 d; needs `query:` / `passage:` prefixes |
| `sentence-transformers/all-MiniLM-L6-v2` | 22.7M | Apache-2.0 | 384 d, smallest |
| `Snowflake/snowflake-arctic-embed-s` | 33.2M | Apache-2.0 | 384 d |
| `BAAI/bge-base-en-v1.5` | 109.5M | MIT | 768 d |
| `intfloat/e5-base-v2` | 109.5M | MIT | 768 d |
| `nomic-ai/nomic-embed-text-v1.5` | 136.7M | Apache-2.0 | 768 d |
| `intfloat/multilingual-e5-small` | 117.7M | MIT | 384 d, multilingual |
| `BAAI/bge-large-en-v1.5` | 335.1M | MIT | 1024 d |
| `mixedbread-ai/mxbai-embed-large-v1` | 335.1M | Apache-2.0 | 1024 d |
| `jinaai/jina-embeddings-v3` | 572.3M | **CC-BY-NC-4.0** | non-commercial: cannot be the default |

- **Pass threshold:** the winner beats bge-small by ≥ 2 points Recall@5 and keeps hybrid p95 within 2× on the same
  machine. Licence must allow commercial use.
- **Stop condition:** if no model gives ≥ 2 points, keep bge-small and publish the negative result.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --embed-model BAAI/bge-base-en-v1.5 --out r.json`

### E07. Cross-encoder ladder

- **Task:** T-041. **Rank:** 7. **Cost:** low to medium (CPU inference; larger models are slower).
- **Hypothesis:** reranking the top 30 is the largest single quality lever already measured; a stronger reranker may add
  more, but latency is the constraint.
- **Expected gain:** this project measured **+7.3 points Recall@5** on all 1,536 questions (65.2 → 72.5) and +6.1 on the
  like-for-like 383-question set (67.6 → 73.7) with `ms-marco-MiniLM-L-6-v2`
  ([14 §14.6B/C](14-research-ai-memory.md#146-measured-results)). A cross-encoder reads query and candidate together,
  which a bi-encoder cannot (`sbert.net` retrieve-and-rerank guide).

| Reranker | Parameters | Licence | Current latency |
|---|---:|---|---|
| `cross-encoder/ms-marco-MiniLM-L-6-v2` (current) | 22.7M | Apache-2.0 | 350 ms for 30 candidates, CPU |
| `cross-encoder/ms-marco-MiniLM-L-12-v2` | 33.4M | Apache-2.0 | not measured |
| `BAAI/bge-reranker-base` | 278.0M | MIT | not measured |
| `BAAI/bge-reranker-v2-m3` | 567.8M | Apache-2.0 | not measured |
| `mixedbread-ai/mxbai-rerank-large-v1` | 435.1M | Apache-2.0 | not measured |
| `jinaai/jina-reranker-v2-base-multilingual` | 278.4M | **CC-BY-NC-4.0** | non-commercial: not eligible as default |

- **Pass threshold:** +3 points Recall@5 over L-6 and p95 ≤ 300 ms for 30 candidates on the reference machine.
- **Stop condition:** if the best model cannot meet 300 ms, keep L-6 and stop claiming rerank as a default.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --facts facts.json --rerank --rerank-model cross-encoder/ms-marco-MiniLM-L-12-v2 --out r.json`

### E08. FTS5 tuning at 50,000 rows

- **Task:** T-047. **Rank:** 8. **Cost:** low (index configuration and query planning).
- **Hypothesis:** the 50k-row miss is index maintenance and query planning, not SQLite itself. `bm25()` over a large
  posting list, a `CROSS JOIN` that pins the FTS table as the outer loop, and term selection are the levers.
- **Expected gain:** target p95 50 ms from a measured p95 of 124–185 ms. Source of expectation: SQLite's FTS5
  documentation on `optimize`, `merge`, prefix indexes and the `bm25()` ranking function (`https://sqlite.org/fts5.html`,
  fetched); the existing in-repo measurement shows the gap is at 50k, not at 6k
  ([14 §14.6E](14-research-ai-memory.md#146-measured-results)).
- **Pass threshold:** p95 ≤ 50 ms at 50k rows, Recall@5 unchanged within 1 point.
- **Stop condition:** if the index change costs >1 point recall, revert it and report that the 50 ms target is not met.
- **Command:** `bun bench/scale.mjs 50000 20000 --index tuned --queries 200 --out scale.json`

### E09. Quantised vectors and ANN

- **Task:** T-049. **Rank:** 9. **Cost:** medium (new index, recall/latency trade-off sweep).
- **Hypothesis:** brute-force cosine stops being viable past a few hundred thousand vectors; HNSW or int8 scalar
  quantisation keeps p95 under the target with a small recall loss.
- **Expected gain:** HNSW gives approximate nearest-neighbour search with a controllable recall/latency trade-off
  (`arXiv:1603.09320`, abstract). `sqlite-vec` (Apache-2.0) and hnswlib (Apache-2.0) are candidate implementations
  (licences fetched from their repositories). No gain number is claimed for this corpus until measured.
- **Pass threshold:** p95 ≤ 150 ms at 500k vectors, Recall@5 loss ≤ 1 point versus brute force.
- **Stop condition:** if the recall loss exceeds 2 points, keep brute force and publish the supported scale.
- **Command:** `bun bench/scale.mjs 500000 200000 --ann hnsw --out ann.json`

### E10. Token-budgeted packing with MMR

- **Task:** T-042 (packer), T-045 (MMR and why-recalled). **Rank:** 10. **Cost:** medium.
- **Hypothesis:** returning a fixed token budget, deduplicated by source and diversified with MMR, preserves recall at
  a smaller prompt than "top 15" and avoids the position and distractor penalties documented in the literature.
- **Expected gain:** the benefit is token reduction, not recall. Sources: performance depends on where relevant
  information sits in a long context (`arXiv:2307.03172`, abstract); topically close distractors hurt more as input
  grows (Chroma Context Rot, `https://www.trychroma.com/research/context-rot`, fetched); contextual chunk headers
  reduced failed retrievals by 49%, and 67% with reranking (Anthropic, `https://www.anthropic.com/news/contextual-retrieval`,
  fetched).
- **Pass threshold:** exact budget compliance; recall at a 2,000-token budget ≥ the current top-5 recall; provenance
  footer present on every item.
- **Stop condition:** if recall at budget is >3 points below top-5, do not make the packer the default.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --facts facts.json --rerank --pack 2000 --mmr 0.7 --out r.json`

### E11. Temporal retrieval

- **Task:** T-043. **Rank:** 11. **Cost:** medium (date extraction plus a filter).
- **Hypothesis:** treating time as data and filtering by a parsed range raises temporal-question recall.
- **Expected gain:** +6.8% to +11.3% temporal recall, conditional on a strong LLM date extractor (`arXiv:2410.10813`,
  abstract). The rule-based fallback is cheaper and weaker; measure both.
- **Pass threshold:** +5 points on the temporal subset, no overall regression, p95 +50 ms for the rule-based path.
- **Stop condition:** if the rule-based path gives < +2 points and the LLM path costs more than 500 ms, leave temporal
  filtering opt-in.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --time rule --out r-rule.json && bun bench/locomo-retrieval.mjs --data locomo10.json --time llm --provider local --out r-llm.json`

### E12. Graph and entity retrieval

- **Task:** T-048. **Rank:** 12. **Cost:** high (entity extraction, link table, graph traversal, new tests).
- **Hypothesis:** a graph channel improves multi-hop questions, the weakest category for every system measured (LoCoMo
  category 1 Recall@5: 46.0 with rerank, versus 82.1 for category 4,
  [14 §14.6C](14-research-ai-memory.md#146-measured-results)).
- **Expected gain:** Hindsight's architecture combines semantic, BM25, graph and temporal channels, and reports the
  strongest results of the systems compared in its paper (`arXiv:2512.12818`, abstract). No per-channel ablation number
  is in the fetched abstract, so the expected gain is directional.
- **Pass threshold:** +3 points overall and +5 points on multi-hop, with graph construction cost reported.
- **Stop condition:** if the graph channel adds < +1 point overall, keep it as an optional inspection tool, not a
  retrieval channel.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --graph --out r.json`

### E13. Semantic prompt injection

- **Task:** T-044. **Rank:** 13. **Cost:** medium (per-prompt retrieval, token cost).
- **Hypothesis:** injecting the best prompt-relevant observations on each prompt (not only at session start) improves
  answer quality enough to justify the tokens.
- **Expected gain:** unknown. The closest evidence is that retrieval at the right granularity helps
  (`arXiv:2410.10813`) and that excess context hurts (`arXiv:2307.03172`). Both point in opposite directions, which is
  why this is measured, not assumed.
- **Pass threshold:** +2 points answer accuracy with ≤ 500 extra tokens per prompt; if answer accuracy is not yet
  measured, do not ship it on by default.
- **Stop condition:** if the token cost rises >25% for <1 point accuracy, default it off.
- **Command:** `bun bench/longmemeval.mjs --data longmemeval_s.json --inject per-prompt --limit 5 --out inject.json`

### E14. Query and result caching

- **Task:** T-050. **Rank:** 14. **Cost:** low.
- **Hypothesis:** coding sessions repeat the same queries (file names, error strings), so a small result cache cuts
  p95 without affecting quality.
- **Expected gain:** no published number for this workload; measure hit rate first. A cache cannot improve recall.
- **Pass threshold:** ≥ 30% hit rate on a replay of real sessions, p95 −30%, stale results never returned after a write.
- **Stop condition:** if the hit rate is <10%, remove the cache rather than carry invalidation risk.
- **Command:** `bun bench/scale.mjs 50000 20000 --cache --replay sessions.jsonl --out cache.json`

### E15. Consolidation and decay

- **Task:** T-032 (summaries), T-031 (decay). **Rank:** 15. **Cost:** medium.
- **Hypothesis:** merging duplicates and summarising old episodes cuts the token footprint without losing recall.
- **Expected gain:** the internal target is −40% footprint with ≤1 point recall loss (`docs/15`, FR-M5). Mem0's
  extraction-and-consolidation pipeline is the published precedent (`arXiv:2504.19413`, abstract).
- **Pass threshold:** −40% stored tokens, ≤1 point Recall@5 loss, provenance retained for every merged item.
- **Stop condition:** if the loss exceeds 2 points, keep consolidation opt-in.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --facts facts.json --consolidate --out r.json`

### E16. Coding-specific evaluation (CodeMemBench)

- **Task:** T-056. **Rank:** 16. **Cost:** high (collect consenting, redacted sessions and label questions).
- **Hypothesis:** LoCoMo is synthetic social chat; a coding benchmark will rank systems differently.
- **Expected gain:** measurement. No source predicts the result.
- **Pass threshold:** ≥300 labelled questions with a datasheet; inter-annotator agreement ≥0.7 on a 10% double-labelled
  sample.
- **Stop condition:** if labels cannot reach agreement, publish the dataset as exploratory only.
- **Command:** `bun bench/codemembench.mjs --data codemembench.jsonl --systems aletheia,claude-mem --out code.json`

### E17. Full benchmark coverage

- **Task:** T-053 (BEAM), T-054 (MemoryAgentBench). **Rank:** 17. **Cost:** medium.
- **Hypothesis:** BEAM's up-to-10M-token conversations and MemoryAgentBench's four competencies expose failures that
  LoCoMo cannot.
- **Expected gain:** coverage, not score. BEAM: 100 conversations, 2,000 questions, 10 abilities (`arXiv:2510.27246`,
  abstract). MemoryAgentBench: accurate retrieval, test-time learning, long-range understanding and selective
  forgetting (`arXiv:2507.05257`, abstract).
- **Pass threshold:** one command per dataset, results reported with the same protocol as LoCoMo.
- **Stop condition:** none; these are coverage requirements.
- **Command:** `bun bench/beam.mjs --subset 1M --out beam.json && bun bench/memoryagentbench.mjs --out mab.json`

### E18. CI gate and confidence intervals

- **Task:** T-055 (gate), T-057 (bootstrap CIs and a clean hold-out). **Rank:** 18. **Cost:** low.
- **Hypothesis:** without a gate, a refactor can silently lose the measured advantage; without CIs, small differences
  are over-read.
- **Expected gain:** protection, not quality. LLM judges have position, verbosity and self-enhancement biases
  (`arXiv:2306.05685`, abstract), so the judge must be fixed and spot-checked.
- **Pass threshold:** CI fails on a seeded 2-point recall regression or a 20% latency regression; every published
  number has a bootstrap CI and n.
- **Stop condition:** none.
- **Command:** `bun bench/locomo-retrieval.mjs --data locomo10.json --bootstrap 1000 --out r.json && bun test test/bench-gate.test.mjs`

## 22.3 What the target numbers are, exactly

| Claim | Today | Target | Evidence that would make us stop claiming it |
|---|---:|---:|---|
| LoCoMo Recall@5, raw turns | 57.5% | **≥ 70%** | Two full runs with overlapping 95% CIs below 70%, or the gain disappears on the held-out split. |
| LoCoMo Recall@5, same extracted facts both sides | 67.6% / 73.7% | **≥ 80%** | Extracted facts give < +3 points over raw, or claude-mem closes the gap when given the same facts. |
| LoCoMo MRR, same facts | 0.616 / 0.686 | **≥ 0.72** | MRR rises while Recall@5 falls (rank-1 overfitting) or the CI includes 0.68. |
| Answer accuracy, LongMemEval-S | not measured | **≥ full-context baseline + 5 points at ≤25% of its tokens** | The CI overlaps the full-context baseline, or judge–human agreement is <85%. |
| p95 search at 50k | 124–185 ms | **≤ 50 ms** | Optimisation costs >1 point Recall@5. |
| p95 search at 500k | not measured | **≤ 150 ms** | ANN recall loss >2 points. |
| Rerank p95 | 350 ms | **≤ 300 ms** | No eligible licence model meets it. |
| Token cost at session start | char-capped, not measured | **≤ 50% of full-context tokens at equal accuracy** | Accuracy drops when the budget is enforced. |

The honest fallback, if the targets are missed: publish the measured numbers, say which target was missed, and compete
on the axes that are already proven (latency, footprint, privacy, rules portability, export). A missed target is a
result; a hidden one is a lie.

## 22.4 Evaluation protocol (binding for every published number)

These rules extend [18 §18.4](18-benchmark-plan.md#184-protocol). They exist because a premature benchmark already
produced a false result once: claude-mem scored 24.1% when queried 20 s after ingest and 38.9% after its index settled
([14 §14.6F](14-research-ai-memory.md#146-measured-results)).

1. **Wait for the competitor's index.** Poll the tool's health endpoint and its row count until both are stable for
   60 s. Record the settle time. If the tool exposes no readiness signal, wait 5 minutes and say so.
2. **Same inputs.** Same dataset file with a published SHA-256, same questions, same gold evidence, same machine,
   same reader and judge models, same token budgets. Pin every version and commit.
3. **Equal query forms.** Run the raw question and a keyword-only form against every system, and report the better
   score for the competitor. Do not handicap the baseline.
4. **Warm and idle.** Discard the first 10 queries, run latency serially on an otherwise idle machine, and report
   concurrency separately.
5. **No tuning on the test set.** Choose weights, thresholds and prompts on a held-out conversation; freeze them before
   the full run. If a choice was made while looking at the test set, disclose it.
6. **Judge hygiene.** One judge model and one prompt for every system. The judge sees question, gold answer and system
   answer only; it does not see the system name. Double-check 5% by hand and report agreement. Report judge identity,
   token cost and the exact prompt.
7. **Publish raw outputs.** Per-question NDJSON with retrieved ids, ranks, token counts, latency and the final answer.
   A table without raw outputs is not reproducible.
8. **Report cost with accuracy.** Input tokens, output tokens, model calls and dollars per 1,000 questions.
9. **Publish negative results.** Every experiment in 22.2 that fails gets a row in the results table with its measured
   number.
10. **Bootstrap confidence intervals.** 1,000 resamples over questions; report n and CI next to every mean.

## 22.5 Measurement commands that exist today

```bash
# dataset (published SHA-256 should be added to the run report before the next result)
curl -o locomo10.json https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json

# our retrieval strategies (needs the optional transformers package somewhere)
ALETHEIA_TRANSFORMERS_FROM=/dir/with/node_modules bun bench/locomo-retrieval.mjs \
  --data locomo10.json [--rerank] [--limit N] [--out r.json]

# claude-mem baseline, isolated
CLAUDE_MEM_DATA_DIR=/tmp/cm-iso CLAUDE_MEM_WORKER_PORT=37795 CLAUDE_MEM_TELEMETRY=0 DO_NOT_TRACK=1 \
  bun ~/.claude/plugins/cache/thedotmack/claude-mem/<ver>/scripts/worker-service.cjs --daemon
bun bench/claude-mem-baseline.mjs --data locomo10.json --port 37795 --ingest-only
# wait until the index settles, then:
bun bench/claude-mem-baseline.mjs --data locomo10.json --port 37795 --skip-ingest [--keywords] --out cm.json

# scale
bun bench/scale.mjs 50000 20000
```

Every future command in 22.2 follows the same shape so the harness, not a separate script, produces the number.

## 22.6 What "answer accuracy" will mean

The reader is a fixed model with a fixed prompt: retrieved context (budgeted), the question, and an instruction to
answer only from the context or say "I don't know". The judge is a second fixed model with a fixed rubric: correct,
partially correct, incorrect, abstained. Both are named in the result. The primary metric is exact-match accuracy on
LongMemEval-S's 500 questions, reported overall and by its five abilities.

Arms, all with the same reader and judge:

1. No memory: the model answers with no context.
2. Full context: the entire conversation history, truncated only by the model window.
3. Aletheia top-k, retrieval only.
4. Aletheia top-k + fact keys + rerank.
5. Aletheia token-budgeted pack.

The claim we want is arm 5 beating arm 2 at ≤25% of arm 2's tokens, with non-overlapping confidence intervals. If arm
5 does not beat arm 2, the honest claim is "same accuracy at a fraction of the tokens", which is still useful but is
not a memory-quality claim.

## 22.7 Threats to validity

- LoCoMo is synthetic social chat, not code ([18 §18.6](18-benchmark-plan.md#186-threats-to-validity-state-them-with-every-result)).
- The fact-key arm historically used the dataset's own extracted facts; E02 is the first honest extraction run.
- claude-mem is designed for observer-generated observations, not raw saves; raw saves are the closest LLM-free
  baseline and may understate it.
- Judge models have known biases (`arXiv:2306.05685`), which is why one judge, blinding and human spot-checks are
  mandatory.
- Single machine; no GPU. Larger embedding and reranker models may be viable on other hardware and are reported as
  CPU-only here.
- Every expected gain above is an expectation, not a measurement. Only the "today" column is measured.

## 22.8 Scoreboard discipline

The scoreboard is the table in 22.1 plus 22.3. It changes only when a command in 22.2 or 22.5 produces a new dated
result with raw outputs. A change to the scoreboard requires:

- the command, the commit and the date in the same commit as the numbers;
- the raw NDJSON file attached or linked;
- a note on what moved and why;
- a note on what did **not** move.

The next scoreboard update is blocked on E01 (T-051). Until then, "answer accuracy: not measured" stays in the README.
