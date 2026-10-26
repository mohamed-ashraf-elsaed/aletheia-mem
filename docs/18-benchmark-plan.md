# 18. Benchmark plan

The rule from [15](15-product-spec.md#151-what-1000-better-and-beat-it-by-100-mean-here): **a number is a claim only if a command reproduces it.**
This document defines the metrics, the datasets, the baselines, the protocol, and what exists today.

## 18.1 What to measure

| Layer | Question | Metric | Needs an LLM? |
|---|---|---|---|
| **Retrieval** | Does the memory surface the evidence? | Recall@k (fraction of gold evidence turns in top k), all-gold@k, MRR, tokens in top 5 | No |
| **Latency and scale** | Is it fast at realistic size? | p50/p95 search ms at 1k, 50k, 500k rows; insert rate; RSS | No |
| **Answer accuracy** | Does a model answer correctly from the retrieved context? | LLM-judge accuracy per question type | Yes (judge + reader) |
| **Context cost** | How many tokens do we put in the prompt? | Tokens injected per task, per query | No |
| **Task success** | Does memory help or hurt a coding agent? | Pass rate and cost on tasks, with and without memory | Yes (agent runs) |
| **Robustness** | Does it survive hostile and concurrent use? | Test suite, fuzz, crash tests | No |
| **Migration** | Is data lossless in and out? | Round-trip equality | No |

Retrieval recall is **necessary, not sufficient**: a system can retrieve the evidence and still fail the answer (and vendors report
answer accuracy, usually self-run). Both layers are needed before any claim of "better".

## 18.2 Datasets

| Dataset | Source | Size | Use | Status |
|---|---|---|---|---|
| **LoCoMo** | github.com/snap-research/locomo (`data/locomo10.json`) | 10 conversations, ~5,900 turns, 1,986 questions (1,536 with gold evidence, categories 1 to 4) | Retrieval recall (gold evidence ids ship with it) | **in use** |
| **LongMemEval** (S: ~115k tokens per question, M: ~500 sessions) | arXiv 2410.10813 | 500 questions; five abilities: information extraction, multi-session reasoning, temporal reasoning, knowledge updates, abstention | Answer accuracy with a judge; temporal and update subsets | planned (E5-4) |
| **BEAM** (100K to 10M tokens) | arXiv 2510.27246, ICLR 2026; HF `Mohammadta/BEAM-10M` | 100 conversations, 2,000 questions, 10 abilities | Scale behaviour | planned (E5-5) |
| **MemoryAgentBench** | arXiv 2507.05257 (ICLR 2026) | Four competencies (accurate retrieval, test-time learning, long-range understanding, conflict resolution / selective forgetting; the competency name differs between versions) | Coverage beyond QA | planned (E5-5) |
| **CodeMemBench** (ours) | Redacted, consenting coding sessions | ≥ 300 questions: decisions, conventions, file facts, "why did we", "what did we try" | The use case that matters here | planned (E5-6) |
| **Injection A/B tasks** | Repo tasks (SWE-bench style) | ≥ 100 | Does injected memory help or hurt? | planned (E5-7) |

LoCoMo question categories are reported by their raw number. (Recalled from the dataset's repository, unverified here: 1 multi-hop, 2 temporal, 3 open-domain, 4 single-hop, 5 adversarial with no evidence.)

## 18.3 Baselines

| Baseline | How | Status |
|---|---|---|
| **claude-mem as shipped** | A real worker in an isolated data dir (`CLAUDE_MEM_DATA_DIR`, own port), raw saves through `POST /api/memory/save`, queries through `GET /api/search` | **in use** |
| No memory | Agent with nothing injected | planned (E5-7) |
| Full context | Entire history in the prompt, same reader | planned (E5-4) |
| Mem0 (OSS), Graphiti | Installed locally with the same reader | planned (E5-8) |
| Our variants | and-prefix (the first shipped search), BM25, dense, hybrid, hybrid + fact keys, + rerank | **in use** |

Vendor-published numbers are **not** baselines: they conflict by more than 20 points on the same benchmark ([14](14-research-ai-memory.md#143-what-the-published-numbers-do-and-do-not-show)).

## 18.4 Protocol

1. **Same data, same questions, same gold, same hardware.** Questions with no evidence (adversarial) are excluded from retrieval scoring and reported separately in answer scoring.
2. **Warm and settled.** Wait until the baseline's vector index has finished (a first pilot, queried 20 s after ingest, scored 24.1% Recall@5; after indexing settled the same queries scored 38.9%; the harness must wait or poll).
3. **Equal query forms.** Run both the raw question and a keyword-only form against the baseline and report the better, so it is not handicapped.
4. **Latency measured serially**, on an otherwise idle machine; concurrency numbers reported separately.
5. **No tuning on the test set.** Strategy choices (term pruning threshold, RRF k) are fixed from a held-out conversation or from literature defaults before the full run. (Honest status: the choices so far were made while looking at conv-26, then evaluated on all 10; a clean hold-out is part of E5-9.)
6. **Judge hygiene (answer accuracy).** One judge model and prompt for every system; judge sees question, gold answer and system answer only; 5% double-checked by hand; judge identity and cost reported.
7. **Cost reported.** Model tokens and dollars for ingest and query, per system.
8. **Seeds and versions pinned.** Dataset hash, model ids, tool versions, commit.
9. **Negative results published** next to positive ones.

## 18.5 Commands (today)

```bash
# dataset
curl -o locomo10.json https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json

# our retrieval strategies (needs: bun add @huggingface/transformers somewhere; ALETHEIA_TRANSFORMERS_FROM=<dir>)
ALETHEIA_TRANSFORMERS_FROM=/dir/with/node_modules bun bench/locomo-retrieval.mjs --data locomo10.json [--rerank] [--limit N] [--out r.json]

# claude-mem baseline, isolated
CLAUDE_MEM_DATA_DIR=/tmp/cm-iso CLAUDE_MEM_WORKER_PORT=37795 CLAUDE_MEM_TELEMETRY=0 DO_NOT_TRACK=1 \
  bun ~/.claude/plugins/cache/thedotmack/claude-mem/<ver>/scripts/worker-service.cjs --daemon
bun bench/claude-mem-baseline.mjs --data locomo10.json --port 37795 --ingest-only      # then wait until indexing settles
bun bench/claude-mem-baseline.mjs --data locomo10.json --port 37795 --skip-ingest [--keywords] --out cm.json

# scale
bun bench/scale.mjs 50000 20000

# My Work fidelity (against a running original)
bun scripts/diff-against-live.mjs
```

Isolation check for the baseline: before and after, the real worker's `worker.pid` and `settings.json` checksums were identical and its `/api/health` stayed `ok`.

## 18.6 Threats to validity (state them with every result)

- LoCoMo's conversations are synthetic social chat, not coding sessions. Recall there says little about code. CodeMemBench exists to fix this.
- The "fact keys" arm uses the dataset's own extracted facts; real extraction costs model calls and will be noisier.
- claude-mem is designed to ingest through its LLM observer; raw saves are the nearest LLM-free equivalent, and its ranking may be tuned for observations rather than raw chat turns.
- claude-mem's search takes an agent-written query; questions-as-queries are the standard for LoCoMo but may not suit it. The keyword form is run to give it its best case.
- Evidence recall counts only gold turns; an answer may exist in non-gold turns.
- Single machine, single run per configuration; no confidence intervals yet (add bootstrap CIs in E5-9).
- Chroma's default embedding model and our bge-small differ; the comparison is system versus system, not retriever versus retriever.

## 18.7 Reporting template

For every published result: dataset and hash; systems and versions; hardware; protocol deviations; table (metric × system) with n; per-category
breakdown; latency; cost; one paragraph of what the result does **not** show; the exact commands; the commit.

## 18.8 Results

See [14 section 14.6](14-research-ai-memory.md#146-measured-results). They are kept in one place so they cannot drift.
