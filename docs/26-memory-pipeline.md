# 26. The memory pipeline as built

Status: implemented, 2026-10-26. This page describes the code that exists, not the plan in
[23](23-memory-building.md). Where the two differ, this page wins.

## 26.1 One page

```
hook (Claude Code / Command Code)
  → redact + drop <private>                      src/hub/redact.mjs
  → memories row (kind prompt | event | summary)  src/hub/store.mjs
  → compress.queue setting                        src/hub/hooks/shared.mjs
  → hook returns; no model, no network

worker (server background task or `aletheia compress --daemon`)
  → jobs row                                     src/hub/queue.mjs
  → claim one oldest-due job (BEGIN IMMEDIATE)
  → episode per memory row (source_ref = memory:<id>)
  → windows of 20 episodes / 12,000 chars        src/hub/facts.mjs (chunkEpisodes)
  → provider (extract model) or rule extractor
  → strict validator, one retry with the refusal
  → transaction: facts + keys + links + mark the window extracted
  → contradiction check (newer fact closes the older one)
  → usage row (model, mode, tokens, dollars)     src/hub/facts.mjs, src/hub/usage.mjs
  → job done | pending with exponential backoff | failed

search
  → facts_fts and memory_keys_fts (FTS5)
  → current facts by default; history and as-of on request
  → fact hits first, each with its episode; memory hits after
```

Every stage that can fail is a row or a file, not in-memory state. A kill -9 between windows leaves the job
claimable and the completed windows marked, so the restart neither loses nor repeats work.

## 26.2 What each part stores

| Table | Holds | Written by |
|---|---|---|
| `memories` | raw capture rows, unchanged since v2 | hooks, `/v1`, CLI |
| `episodes` | one immutable row per captured memory; `source_ref = memory:<id>`; `extracted_at_epoch` is the window checkpoint | worker |
| `facts` | subject, predicate, object, text, valid and record time, confidence, status, extractor mode, prompt version, model | extractor |
| `memory_keys` | fact text and entity names as extra retrieval keys | extractor |
| `memory_links` | `mentions`, `derived_from`, `supersedes`, `duplicate_of` | extractor, merge |
| `jobs` | queue state, attempts, next attempt, lease, last error | hook queue drain, worker |
| `fact_usage` | one row per model call: tokens in/out, model, mode, facts, status, raw rejected output | worker |
| `review_queue` | same-time contradictions and low-confidence items | contradiction check |
| `fact_vectors` | optional vectors for facts (written only by `setFactVector`) | caller |

The `memories` table is kept, not replaced by a view. That is the one deliberate difference from D4 §23.3: every
existing read path and every existing test keeps working, and the additive migration copies rows into the new
tables without pretending the old table is gone.

## 26.3 Modes and providers

- `ALETHEIA_PROVIDER=none` (default): no model call. The rule extractor accepts only a plain "subject verb object"
  sentence, so it stays quiet on tool noise.
- `local`: any OpenAI-compatible endpoint on this machine (`ALETHEIA_LOCAL_BASE_URL`, default
  `http://127.0.0.1:11434/v1/chat/completions`). No API key is required; `response_format` is not sent.
- `openai`, `openrouter`: an OpenAI-compatible endpoint with `ALETHEIA_OPENAI_API_KEY`.
- `claude-cli`: the `claude` CLI in print mode, no tools.
- `fake`: test only. Canned answers from `ALETHEIA_FAKE_RESPONSE` or `ALETHEIA_FAKE_FILE`; never the network.

Model routing: `ALETHEIA_EXTRACT_MODEL` for extraction (the small model) and `ALETHEIA_SUMMARY_MODEL` for summaries
(the larger model). With `claude-cli` the defaults are `haiku` and `sonnet`; with an OpenAI-compatible provider the
default is `ALETHEIA_OPENAI_MODEL`.

Modes live in `src/hub/modes/*.json`: `code`, `chill`, `language-en`, `language-es`. `ALETHEIA_MODE` selects one. The
mode adds an instruction to the fact prompt; it never changes the JSON schema.

## 26.4 Config keys

| Key | Default | Meaning |
|---|---|---|
| `ALETHEIA_PROVIDER` | `none` | `none`, `local`, `openai`, `openrouter`, `claude-cli`, `fake` |
| `ALETHEIA_MODE` | `code` | extraction style and output language |
| `ALETHEIA_EXTRACT_MODEL` | provider default | the small model for facts |
| `ALETHEIA_SUMMARY_MODEL` | provider default | the larger model for summaries |
| `ALETHEIA_LOCAL_BASE_URL` | `http://127.0.0.1:11434/v1/chat/completions` | local endpoint |
| `ALETHEIA_OPENAI_BASE_URL` | `https://api.openai.com/v1/chat/completions` | OpenAI-compatible endpoint |
| `ALETHEIA_OPENAI_API_KEY` | empty | key for `openai`/`openrouter` |
| `ALETHEIA_OPENAI_MODEL` | empty | fallback model |
| `ALETHEIA_FACT_MAX_EPISODES` | `20` | episodes per window, clamped to 40 |
| `ALETHEIA_FACT_CHAR_BUDGET` | `12000` | characters per window |
| `ALETHEIA_PRICE_IN_PER_1K` | `0` | dollars per 1k input tokens |
| `ALETHEIA_PRICE_OUT_PER_1K` | `0` | dollars per 1k output tokens |
| `ALETHEIA_EXTRACTION_WORKER` | off | server binary turns the worker on; `aletheia compress --daemon` does the same |

Prices default to 0 on purpose. The project does not guess a vendor price; set them if you want a dollar figure.

## 26.5 Commands

```
aletheia compress [--project p]            drain the queue once (provider or rules)
aletheia compress --daemon [--interval n]  keep a worker running
aletheia migrate [--dry-run] [--backup f]  add schema v3 to an old database, with a backup
aletheia importance recompute [--project p]
aletheia search <words> [--project p] [--history] [--as-of YYYY-MM-DD]
aletheia doctor                            server, hooks, spool, last capture, queue, extraction
```

`aletheia doctor` now reports `queue` (pending, running, failed) and `extraction` (last mode, last successful call,
rejected count). A failed job makes the queue check fail.

## 26.6 Failure modes

| Failure | What happens | Where |
|---|---|---|
| Provider is down | the call is recorded with status `error`, the job is rescheduled with exponential backoff (1s, 2s, 4s, 8s, capped 60s), then marked `failed` after 5 attempts | `queue.failJob` |
| Model returns bad JSON | one retry with the refusal quoted; a second refusal stores no fact, records `status='rejected'` with the raw answer, and marks the window extracted so it cannot loop | `extractFactsWithProvider`, `extractWithUsage` |
| Process is killed mid-job | completed windows are committed; the running job's lease expires and the next worker claims it; content hashes prevent duplicates | `executeJob`, `recoverStale` |
| Migration step fails | the transaction rolls back, `user_version` stays 2, and the old code still opens the file | `migrateV3` |
| Secret in a prompt | redacted at capture and again before the prompt and before storage | `redact.mjs`, `facts.mjs` |
| Too many events | windows are capped by count and characters; a single long episode is truncated | `chunkEpisodes` |
| Two workers | the claim is `BEGIN IMMEDIATE`; only one row moves to `running` | `claimNext` |
| Same-time contradiction | both facts stay active, lose 0.1 confidence, and enter `review_queue` | `resolveContradictions` |

## 26.7 What is not built

- **Observation and summary generation from facts.** The old `compressRecent` path still produces observations when
  called directly; the worker produces facts only. `summaries` is a table with no writer.
- **Entity extraction and alias resolution.** `entities`, `entity_aliases` and `fact_entities` exist; the extractor
  records entity names as retrieval keys but does not create entity rows. T-021 and T-022 remain `todo`.
- **Automatic dedupe and merge.** `nearDuplicates` and `mergeObservations` exist and are tested, but the worker does
  not call them on insert.
- **Decay, cold facts and pruning.** T-031 remains `todo`. Nothing is deleted.
- **Review UI.** `review_queue` is written; there is no page to resolve it.
- **Automatic fact embeddings.** `fact_vectors` and `setFactVector` exist, but no code embeds facts; search accepts a
  `queryVec` if a caller provides one.
- **Real provider verification.** All provider tests use an injected `fetchImpl` or the `fake` provider. No real local
  or remote endpoint was contacted in this run.
- **Recall numbers.** LoCoMo was not run: `locomo10.json` is not in the repository and the optional
  `@huggingface/transformers` runtime is not installed here. No recall claim is made.

## 26.8 UNVERIFIED

- Fact extraction quality on a real model and on LoCoMo: not measured.
- A real Ollama/llama.cpp/LM Studio endpoint accepting the exact request body: not tested; only a fake `fetch`.
- Spearman on a human importance ranking: measured only on a synthetic 200-item rank (0.645).
- Dedupe precision on human-labelled pairs: measured only on a synthetic 200-pair set (precision 1.00, recall 0.90).
- Contradiction accuracy on the 50-pair knowledge-update set in D4: measured only on a synthetic 30-pair set (30/30).

## 26.9 Sources

- [23-memory-building.md](23-memory-building.md) for the design and the schema.
- [22-improve-the-numbers.md](22-improve-the-numbers.md) for the experiments and the fact-key claim.
- The task files T-017, T-018, T-019, T-020, T-023, T-024, T-025, T-028, T-029, T-030 and T-034 for the acceptance
  criteria. No external URL was fetched for this page.
