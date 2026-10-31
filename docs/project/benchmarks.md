# Aletheia benchmarks: how to reproduce every published number

<!-- description: The five benchmark commands behind every Aletheia number, what each one measures, the results with dates, what is not measured and the negative results. -->
<!-- keywords: aletheia benchmark, locomo retrieval benchmark, ai memory benchmark, recall@5 memory search, reproduce benchmark results, memory regression gate -->

Aletheia (aletheia-mem) publishes retrieval numbers only. They show whether the evidence for a question is among the top five search results. They are not answer accuracy, and answer accuracy is not measured. This page lists the command behind each published number, what the command does, the results with dates, and the experiments that did not work.

## What is and is not measured

Measured, retrieval only:

- Recall@k and MRR on the LoCoMo dataset, against Aletheia's own search and against a claude-mem worker.
- Search latency and database size on a synthetic store of 50,000 rows.
- A synthetic Recall@5 and p95 latency that CI checks on every change.

Not measured:

- Whether a model gave a correct answer. There is no published reader-and-judge run.
- Retrieval on your own memories, in other languages, or in long real sessions.
- The claude-mem Chroma index, unless it was running during the claude-mem baseline. The committed files do not say.
- Sync, remote MCP and team mode.

Every number below is `measured-by-us`, with the command. None is a vendor claim.

## The five commands

| Command | What it measures | Needs |
|---|---|---|
| `bun bench/locomo-retrieval.mjs` | Recall@1 to 15, MRR and time per query on LoCoMo, for several search strategies | The dataset file. The optional embeddings package for vector rows |
| `bun bench/claude-mem-baseline.mjs` | The same questions against a running claude-mem worker | An isolated claude-mem worker |
| `bun bench/scale.mjs 50000 20000 --index tuned --queries 200 --seed 1` | Insert rate, keyword search latency, synthetic Recall@5 and database size at 50,000 rows | Nothing |
| `bun bench/gate.mjs` | Synthetic Recall@5 and p95 latency, checked against `bench/baseline.json` | Nothing |
| `bun scripts/compare-bench.mjs` | Prints the LoCoMo table from the committed result files | Nothing, no network |

Quick check that needs no setup:

```bash
bun scripts/compare-bench.mjs
```

It reads `bench/results/2026-10-26/*.json` and prints one row per strategy, then compares each earlier claim with the measured value. On 2026-10-29 every row of the claim table read `REPRODUCED`, which means within 0.5 points of the earlier claim.

## Reproduce the LoCoMo numbers

LoCoMo is a dataset of ten long conversations with questions and gold evidence. The script header names the source, https://github.com/snap-research/locomo. The download URL below answered HTTP 200 to a HEAD request on 2026-10-29. This page did not download it again. Check your copy against the SHA-256 that every result file records.

1. Download the dataset into `bench/data/`. The folder is ignored by git.

   ```bash
   mkdir -p bench/data
   curl -o bench/data/locomo10.json https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json
   sha256sum bench/data/locomo10.json
   # 79fa87e90f04081343b8c8debecb80a9a6842b76a7aa537dc9fdf651ea698ff4
   ```

   On 2026-10-29 the author's local copy had that SHA-256.

2. Install the optional embeddings package in a folder of its own. Vector and rerank rows need it. Keyword rows do not. The first run downloads the models once.

   ```bash
   mkdir -p bench/runtime && cd bench/runtime
   bun add @huggingface/transformers    # the 2026-10-26 runs used 4.3.1
   cd ../..
   export ALETHEIA_TRANSFORMERS_FROM=$PWD/bench/runtime
   ```

   The embedding model is `Xenova/bge-small-en-v1.5` (384 dimensions, quantised). The reranker is `Xenova/ms-marco-MiniLM-L-6-v2`.

3. Run one row. These are the exact commands recorded for the 2026-10-26 results:

   ```bash
   bun bench/locomo-retrieval.mjs --data bench/data/locomo10.json --facts none --out bench/results/2026-10-26/raw-turns.json
   bun bench/locomo-retrieval.mjs --data bench/data/locomo10.json --facts dataset --out bench/results/2026-10-26/dataset-facts.json
   bun bench/locomo-retrieval.mjs --data bench/data/locomo10.json --facts dataset --rerank --out bench/results/2026-10-26/dataset-facts-rerank.json
   bun bench/locomo-retrieval.mjs --data bench/data/locomo10.json --limit 3 --facts dataset --rerank --out bench/results/2026-10-26/dataset-facts-3-rerank.json
   bun bench/locomo-retrieval.mjs --data bench/data/locomo10.json --facts rules --out bench/results/2026-10-26/our-facts-rules.json
   ```

   Use a new output folder for your own run, then pass it to `bun scripts/compare-bench.mjs <folder>`.

### How the LoCoMo benchmark works

The method is in [`bench/locomo-retrieval.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/bench/locomo-retrieval.mjs).

- Each conversation gets its own in-memory store. Every dialogue turn is saved as one memory, and the conversation id is the project, so a question only searches its own conversation.
- Questions of LoCoMo categories 1 to 4 that have gold evidence are used. That is 1,536 questions over 10 conversations. Category 5 is left out.
- Recall@k is the share of a question's gold evidence turns found in the top k results, averaged over questions. MRR is the mean of 1 divided by the rank of the first gold turn.
- The strategies are `and-prefix` (the first shipped search, where every word must match), `bm25` (any word may match, with stemming), `dense` (vector cosine), `hybrid` (BM25 and vectors fused by reciprocal rank fusion), `hybrid+facts` and `hybrid+facts+rerank` (the top 30 candidates reordered by a cross-encoder).
- Facts are extra search keys that point back to the turn they came from. `--facts dataset` uses the facts that the LoCoMo authors wrote. Aletheia did not produce them. `--facts rules` uses Aletheia's own rule extractor. `--facts provider` asks a local model.
- `ms/query` is the mean time of the in-process ranking call. It leaves out the time to embed the question. For the rerank rows it is the cross-encoder time for one question only.

## Results

All rows are from `bench/results/2026-10-26/`, generated on 2026-10-26. The result files do not record the machine, the Bun version or the operating system, so latency columns cannot be compared across machines.

| Run | Questions | Recall@5 | MRR | ms/query |
|---|---|---|---|---|
| claude-mem 15.2.0 (as shipped), raw turns | 1,536 | 36.0% | 0.285 | p50 1,699 ms, p95 2,824 ms (idle, 40 queries) |
| Raw turns, keyword (BM25) | 1,536 | 55.3% | 0.482 | 2.00 |
| Raw turns, hybrid | 1,536 | 57.4% | 0.497 | 3.72 |
| Dataset facts, all 10 | 1,536 | 64.8% | 0.591 | 5.53 |
| Dataset facts, 3 conversations | 383 | 67.4% | 0.620 | 5.80 |
| Dataset facts, 3 conversations, + rerank | 383 | 73.9% | 0.686 | 251.16 |
| Dataset facts, all 10, + rerank | 1,536 | 72.3% | 0.680 | 646.19 |
| Rule-extracted facts, all 10 | 1,536 | 57.7% | 0.492 | 4.94 |

Notes on the table:

- The Aletheia rows come from `bun scripts/compare-bench.mjs`. The BM25 row was added from the same output.
- The claude-mem row comes from the project README. The raw output of that run is not committed in `bench/results/`. It was produced by [`bench/claude-mem-baseline.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/bench/claude-mem-baseline.mjs), which saves each turn through claude-mem's save endpoint and queries its search endpoint with a limit of 10. The date of that run is not recorded in a committed file.
- Latest claude-mem release on 2026-10-29 is v15.6.0 (`gh api repos/thedotmack/claude-mem/releases/latest`). The baseline used 15.2.0 and was not re-run.
- claude-mem is built to ingest through its language-model observer. Raw saves are the closest model-free equivalent, so the baseline does not show how claude-mem does through its normal path.
- The hybrid and rerank rows need the optional embeddings package. A default install without it searches by keyword only.
- Dataset facts are an experiment, not a feature. They show what good facts could add: about 7 points of Recall@5 over raw turns.

Compare the claude-mem row with the raw-turns rows only. They are the only rows where both systems store the same raw text. The speed columns are not like for like: one is an in-process call and the other is an HTTP request to a worker.

### The raw-turns numbers were re-run on 2026-10-31

The published 57.4% (MRR 0.497) comes from `raw-turns.json`, written on 2026-10-26. A local `raw-turns.log` that git ignores showed hybrid Recall@5 of 44.7%. The log is older than the JSON (file times 16:58 and 18:13 on 2026-10-26), so it comes from an earlier version of the search code, not from the published run.

Re-runs on 2026-10-31 with `bun bench/locomo-retrieval.mjs --facts none`, on a 12-core Linux machine:

| Code | Hybrid Recall@5 | MRR |
|---|---|---|
| commit `e6145b3` (the published run's commit) | 57.4% | 0.497 |
| commits `b2c5b3d`, `4bd5f54` | 57.4% | 0.497 |
| commits `11ef293`, `b843eb4`, `1e326b6`, `ddf442c` (before and after the redaction change) | 57.7% | 0.502 |
| current main, two runs | 57.7% | 0.502 |
| current main, one earlier run | 54.2% | 0.473 |

So the 57.4% reproduces exactly at the commit that produced it, and the current code scores 57.7%. Search changes since 2026-10-26 added 0.3 points; the redaction change did not affect the result. One run on 2026-10-31 scored 54.2% with keyword-only BM25 at 52.1% where the other runs give 55.2%. BM25 does not use the embedding model, so I could not explain that run and it did not repeat in three more runs. Treat it as an unexplained outlier. The README keeps the 2026-10-26 numbers, which `scripts/compare-bench.mjs` reproduces from the committed files.

## Scale: 50,000 rows

```bash
bun bench/scale.mjs 50000 20000 --index tuned --queries 200 --seed 1
```

The script builds a synthetic store with Zipf-like word frequencies and random unit vectors, from a seeded random generator. It measures insert rate, keyword search latency for all projects, one project and one project plus host, a synthetic Recall@5, database size, and vector search over 20,000 vectors. The script is [`bench/scale.mjs`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/bench/scale.mjs).

The README records, for this command on Linux: keyword search p95 of 32.7 ms for one project and 58.6 ms across all projects. It states a target of 50 ms and says the target is met for project-scoped search. The [CHANGELOG](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/CHANGELOG.md) for 0.1.4 says the project-scoped p95 fell from 67.5 ms to 32.7 ms. This page did not re-run the command, because it takes long. Synthetic text is not real memory, so treat the figures as a check on the index, not a promise for your data.

## The regression gate

```bash
bun bench/gate.mjs
```

The gate builds a fixed synthetic corpus of 50,000 rows with seed 1, runs 100 queries and takes the median p95 of 5 passes. Each query has several near-duplicate distractors, so Recall@5 sits near 0.9 and has room to drop. It compares the result with [`bench/baseline.json`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/bench/baseline.json):

- It fails when Recall@5 drops by more than 0.01, one point.
- It fails when p95 latency rises by more than 20%, but only if the baseline p95 is at least 5 ms.
- It exits with an error if the baseline parameters do not match the run.

The committed baseline was written on 2026-10-28 on `linux x64 bun 1.3.10` at commit `343bb19`, with Recall@5 0.9 and p95 7.759 ms. CI runs the gate on Linux only ([workflow](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/.github/workflows/test.yml)).

A run on 2026-10-29, on Linux 7.0.0-38-generic x86_64 with Bun 1.3.10, took 9.8 seconds:

```
gate: recall@5 0.9000 (baseline 0.9000, delta +0.0000)
gate: p95 latency 8.688 ms (baseline 7.759 ms, +12.0%)
gate: PASS
```

Latency was 12% above the baseline and the gate still passed. Latency is noisy, so the gate guards against large regressions, not small ones.

## Other scripts in `bench/`

- `bench/graph-recall.mjs` is a synthetic test of the graph retrieval channel. It uses no model and no real data.
- `bench/accuracy.mjs` is an answer-accuracy harness with a fixed reader prompt and a blind judge. No result from a real model is published. Its retrieval arm ranks by word overlap, not by Aletheia's search, so a run of it would not measure Aletheia's retrieval.

## Negative results

These are the experiments that did not give the hoped-for result.

- **The rule extractor does not reproduce the fact gain.** Aletheia's rule-based extractor added 1,672 facts. Recall@5 moved from 57.3% to 57.7%, +0.4 points. The dataset's own facts added 7.3 points (57.5% to 64.8%). Files: `bench/results/2026-10-26/our-facts-rules.json` and `dataset-facts.json`.
- **The 1B local model run failed.** Ollama `llama3.2:1b` answered a trivial chat request with HTTP 200 in 2.92 seconds. The `facts-v1` extraction prompt over two LoCoMo turns returned HTTP 500 after 4 minutes 41 seconds. No fact was extracted, so no recall number from a local model is claimed. Source: [`provider-note.txt`](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/bench/results/2026-10-26/provider-note.txt).
- **Adding neighbouring turns lowered Recall@5.** On the 3-conversation run, returning each top hit with its two neighbours gave 68.9% against 73.9% for the plain reranked list, and used more than twice the tokens.
- **Reranking is slow.** It lifted Recall@5 by 6.5 points on the 3-conversation run, and the cross-encoder took about 251 ms per question, against about 6 ms without it.
- **The first shipped search scores near zero.** The `and-prefix` strategy, where every word of a question must match, scored 0.1% on natural-language questions. It is kept as the before baseline.

## Next steps

- [Aletheia and claude-mem](../compare/aletheia-vs-claude-mem.md) - how the claude-mem row should and should not be read.
- [Search](../concepts/search.md) - how keyword, vector and rerank search work in the hub.
- [Status and limits](status-and-limits.md) - everything that is not verified.
- [Facts and contradictions](../33-facts.md) - how facts are extracted and gated.
