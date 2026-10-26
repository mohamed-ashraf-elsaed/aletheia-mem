# 26. The memory pipeline as built

Status: implemented, 2026-10-26. This page describes the code that exists, not the plan in
[23](23-memory-building.md). Where the two differ, this page wins.

Last change: 2026-10-26 (the one UI, dismiss/restore, provider chain, output language and transcript back-fill).

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

context
  → pinned and recent memories, then the current facts (cold facts are excluded), then the rules
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
| `review_queue` | same-time contradictions, low-confidence items, ambiguous aliases and rule suggestions | contradiction check, entities, rule-suggest |
| `rule_suggestions` | proposed rules from user corrections; status stays `pending` until a human decides | `rule-suggest.mjs` |
| `summaries` | session, project and entity summaries with `source_ids` | `summaries.mjs`, worker and `aletheia summarize` |
| `fact_vectors` | optional vectors for facts, written automatically when an embedder is supplied | worker, `aletheia embed` |
| `dismissals` | one row per hidden memory, episode, observation or fact; the row it names is untouched | `dismiss`, Hub, MCP |

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

An ordered provider chain can replace the single provider: `ALETHEIA_PROVIDERS=ollama,openrouter,openai` builds
each preset in order. On a quota, 429, 5xx or timeout the provider is skipped for a cool-down and the next is
tried; a 400 is surfaced. Requests are capped at `ALETHEIA_MAX_CONCURRENT` (1 by default), each has
`ALETHEIA_PROVIDER_TIMEOUT_MS`, and presets exist for Ollama, LM Studio, llama.cpp, OpenAI, OpenRouter and an
`anthropic-compatible` URL (which requires `ALETHEIA_ANTHROPIC_BASE_URL`; see §26.8).

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
| `ALETHEIA_PROVIDERS` | empty | ordered presets: `ollama`, `lmstudio`, `llamacpp`, `local`, `openai`, `openrouter`, `claude-cli`, `anthropic-compatible` |
| `ALETHEIA_PROVIDER_TIMEOUT_MS` | `60000` | per-request timeout, including a chain member |
| `ALETHEIA_MAX_CONCURRENT` | `1` | hard cap on in-flight model requests |
| `ALETHEIA_PROVIDER_COOLDOWN_MS` | `60000` | how long a failed chain member is skipped |
| `ALETHEIA_ANTHROPIC_BASE_URL` | empty | the URL for the `anthropic-compatible` preset (no public default) |
| `ALETHEIA_OUTPUT_LANGUAGE` | empty | global output language; a per-project setting wins (`aletheia language set`) |

Prices default to 0 on purpose. The project does not guess a vendor price; set them if you want a dollar figure.

## 26.5 Commands

```
aletheia compress [--project p]            drain the queue once (provider or rules)
aletheia compress --daemon [--interval n]  keep a worker running
aletheia migrate [--dry-run] [--backup f]  add schema v3 to an old database, with a backup
aletheia importance recompute [--project p]
aletheia search <words> [--project p] [--scope all] [--history] [--as-of YYYY-MM-DD] [--semantic] [--explain]
aletheia embed [--limit n]                  write fact and memory vectors when the runtime is present
aletheia summarize [--scope session|project|entity] [--project p] [--session s] [--entity id]
aletheia prune [--apply]                    report, then apply, cold facts and shortened episodes
aletheia promote <memory|episode|observation|fact> <id>   make a row global
aletheia dismiss <id | type:id> [--reason r]  hide a row from search and context (reversible)
aletheia restore <id | type:id>               undo a dismissal
aletheia dismissed [--limit n]                list dismissed rows
aletheia language set <tag> [--project p]     output language for facts and summaries
aletheia import transcripts <tool> [--since DATE] [--dry-run] [--limit n]
                                              back-fill from local session files (read-only)
aletheia optimize                           rebuild FTS segments after a large import
aletheia rules suggest | suggestions        propose and list review-only rules
aletheia doctor                             server, hooks, spool, last capture, queue, extraction, database, FTS, vectors, model
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
| A chain provider is over quota or down | a 429, 5xx, timeout or quota text cools that provider down and the next is tried; when every one is cooling the call fails with the list | `createFallbackProvider` |
| A row is dismissed | search, list and context skip it; the row and its status stay; only `prune --apply` deletes it | `store.dismiss`, `retention.prune` |
| A transcript line is bad | the line is counted and skipped; the rest of the file is imported | `transcripts.parseTranscript` |

## 26.7 What is not built

- **Real-provider extraction quality.** The `local` provider code path is exercised with an injected `fetch` and the
  `fake` provider. Ollama was reachable on this machine on 2026-10-26: a trivial `llama3.2:1b` chat call returned in
  2.9 s, but the `facts-v1` request over a 2-turn window returned HTTP 500 after 4 min 41 s. No provider extraction
  pass completed, so no provider recall number is claimed.
- **Answer accuracy.** LoCoMo measures retrieval only. No reader/judge harness has been run (T-051).
- **Graph retrieval.** Entities, aliases and `fact_entities` exist and are written by the extractor; there is no
  graph traversal channel yet (T-048).
- **Automatic pruning.** `aletheia prune` is still explicit. The worker builds summaries and embeddings; it never
  prunes. `prune --apply` is also the only path that deletes a dismissed row.

## 26.8 UNVERIFIED

- Fact extraction quality on a real model: the rule extractor was measured on LoCoMo on 2026-10-26 (1,672 facts,
  Recall@5 57.3% → 57.7%, **+0.4 points**); the dataset's own facts gave 57.5% → 64.8% (**+7.3 points**). A real
  local model's extraction was not completed, so its quality is not measured. See
  [22 §22.9](22-improve-the-numbers.md).
- A real Ollama endpoint accepting the exact extraction request body: one trivial chat completion succeeded (2.9 s);
  the `facts-v1` request over a 2-turn window returned HTTP 500 after 4 min 41 s, so the exact body is not verified
  against a real model.
- Spearman on a human importance ranking: measured only on a synthetic 200-item rank (0.645).
- Dedupe precision on human-labelled pairs: measured only on a synthetic 200-pair set (precision 1.00, recall 0.90).
- Contradiction accuracy on the 50-pair knowledge-update set in D4: measured only on a synthetic 30-pair set (30/30).
- LoCoMo dataset licence and hash are recorded in 22.9; the dataset itself is not committed.
- The `anthropic-compatible` provider preset has no default URL. Anthropic publishes no OpenAI-shaped chat
  endpoint that this project verified, so the preset requires `ALETHEIA_ANTHROPIC_BASE_URL` and points at a
  gateway. No gateway was tested. See [tasks/unverified.md](tasks/unverified.md).
- The one UI was loaded in Chromium on 2026-10-26 and checked for rendering and console errors (no errors). Its
  pixel layout at 375 px, and its keyboard-only path, were not captured by an automated assertion.
- Transcript back-fill supports only Claude Code and Command Code, the two layouts read on this machine. Other
  tools' session files were not read, so their formats are not supported and not guessed.

## 26.9 The one UI

One page at `/`, four hash routes, one shared header:

| Route | What it shows | Main routes it calls |
|---|---|---|
| `#/work` | the existing Work page, mounted unchanged at `#root` | `/api/work-view`, `/api/work-view/events` |
| `#/memory` | stats, memories, facts (current/history), search, review queue, dismissed, import/export | `/api/hub/memories`, `/facts`, `/review`, `/dismissed`, `/v1/search` |
| `#/rules` | rule editor, suggested rules, sync, import | `/api/hub/rules`, `/rule-suggestions` |
| `#/tools` | read-only installer status from `doctor` | `/api/hub/doctor` |

The header carries a project selector, a memory search box and a health dot from `/v1/health`. `/hub` redirects to
`/#/memory` so old links keep working. `public/ui-core.js` holds the router and the view helpers with no DOM, which
is what `test/one-ui.test.mjs` imports.

Every hide action is reversible: memories and facts are dismissed and restored; a rule is turned off, not deleted;
a review row can be reopened if it was rejected; a dismissed rule suggestion and a kept-apart duplicate pair can be
restored. Permanent `DELETE /api/hub/memories/:id` stays in the API and CLI, not in the page.

## 26.10 Sources

- [23-memory-building.md](23-memory-building.md) for the design and the schema.
- [22-improve-the-numbers.md](22-improve-the-numbers.md) for the experiments and the fact-key claim.
- The task files T-017, T-018, T-019, T-020, T-023, T-024, T-025, T-028, T-029, T-030 and T-034 for the acceptance
  criteria; T-119 to T-123 for the provider chain, output language, transcript back-fill, folder-pollution proof
  and dismiss/restore; T-134 to T-139 for the one UI. [manual-test.md](manual-test.md) §6 records the browser run.
  No external URL was fetched for this page.
