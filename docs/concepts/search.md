# Search: keyword, project scope and optional semantic search

<!-- description: How Aletheia search works: FTS5 keyword search, project scope and --scope all, --explain, optional semantic search, ranking and the agent search pattern. -->
<!-- keywords: aletheia search, fts5 keyword search, semantic search embeddings, hybrid search, search ai coding memory, mcp search timeline get_observations, aletheia embed -->

Aletheia (aletheia-mem) searches the memories and facts in your hub with SQLite FTS5 keyword search. Semantic search with local embeddings is optional, and you turn it on yourself.

## Run a search

```bash
aletheia search "webhook retry" --project demo --explain
```

```
#5 2026-10-29 [discovery] Webhook retries use exponential backoff up to 5 attempts (demo, cli)
#10 2026-10-29 [note] Please add a retry to the webhook sender and use token=[redacted] for the test call (demo, claude-code)
channels: facts lexical=on keys=on vectors=off; episodes lexical=on vectors=off; fusion=rrf
```

A memory line is `#id date [type] title (project, tool)`. A fact line starts with `fact #id` and ends with the episode it came from:

```
fact #1 2026-10-29 [active] sync service stores its outbox in SQLite (source episode #1)
```

Useful flags:

- `--project NAME` limits the search to one project (plus promoted global rows).
- `--scope all` searches every project.
- `--limit N` returns at most N rows. The default is 20.
- `--history` includes facts that were superseded or closed.
- `--as-of 2026-01-31` returns the facts that were valid on that date.
- `--explain` prints the channels that ran, and the reason when nothing matched.
- `--semantic` adds embedding search. See [Semantic and hybrid search](#semantic-and-hybrid-search).

## Project scope and --scope all

A search with `--project` returns that project's rows plus every row you promoted to `global`. The default scope is called `current`. `--scope all` drops the project limit. A search with no `--project` at all also covers every project. This holds for the CLI, the REST route and the MCP `search` tool, even when the MCP server was started in a project folder.

```bash
aletheia search "bun scripts" --project other --explain
aletheia search "bun scripts" --project other --scope all --explain
```

```
No matches. (filtered)
channels: facts lexical=on keys=on vectors=off; episodes lexical=on vectors=off; fusion=rrf

#1 2026-10-29 [decision] Use bun, not npm, for every script in this repo (demo, cli)
#9 2025-10-28 [gotcha] Bun test needs a temp HOME (demo, codex)
channels: facts lexical=on keys=on vectors=off; episodes lexical=on vectors=off; fusion=rrf; scope=all
```

The first search finds nothing because the matching memories belong to the project `demo`. The second finds them because `--scope all` removes the project filter. To make one memory or fact visible everywhere, promote it. See [Memory model](../concepts/memory-model.md#scope-project-and-global).

## Read the --explain output

The `channels` line says which search channels ran:

- `facts lexical`: keyword search over fact text.
- `facts keys`: keyword search over the extra keys stored for facts, such as entity names.
- `facts vectors`: embedding search over facts. It is `on` only when a query vector exists and at least one fact has a stored vector.
- `episodes lexical` and `episodes vectors`: the same two channels over memories.
- `cjk=on`: the Chinese, Japanese and Korean channel ran for facts or memories. It appears only when the query holds CJK text. See [Chinese, Japanese and Korean text](#chinese-japanese-and-korean-text).
- `fusion=rrf`: how the fact list and the memory list are merged. See [How results are ranked](#how-results-are-ranked).

When a search returns nothing, `--explain` adds a reason in parentheses: `no_terms` (the query had no searchable words), `no_rows` (the store has no rows at all) or `filtered` (rows exist, but your project, kind, type or tool filter, or the words in the query, excluded every one).

## How results are ranked

Keyword search over memories works like this:

1. The query becomes content words. Stop words and one-letter words are dropped and duplicates are collapsed.
2. A word found in more than 20% of all memories adds little signal, so it is dropped when a rarer word remains. At most 12 of the rarest words are kept. A query of one word is left as it is.
3. Any remaining word may match. SQLite FTS5 ranks matches with BM25 over the title, subtitle, narrative, facts and concepts fields. The tokenizer is `porter unicode61 remove_diacritics 2`, so "retries" matches "retry" and accents are ignored. Chinese, Japanese and Korean text takes an extra channel; see [Chinese, Japanese and Korean text](#chinese-japanese-and-korean-text).
4. The CLI keeps the best 100 candidates and returns up to `--limit` of them.

Filters apply before ranking: project and scope, kind, type, tool, file path, date range, and dismissed rows are excluded. A generated summary is hidden from default results once none of the facts it cites is active any more. `--history` brings it back.

For memories, the ranking inputs are text relevance and, when you turn it on, embedding similarity. Recency, pins and importance scores do not change the order.

Facts come from their own full-text index and the fact keys. By default only current facts qualify: active, already valid and not expired. They come back newest first rather than by relevance. The CLI then merges the fact list and the memory list with reciprocal rank fusion (RRF), with weight 1 for facts and 0.9 for memories. The REST and MCP routes do not fuse the two lists: they return facts first, then memories.

## Chinese, Japanese and Korean text

Chinese and Japanese put no space between words, and Korean attaches particles to words. The tokenizer above keeps a whole run of these characters as one token, so on its own it finds a CJK sentence only when you type the whole sentence. A query that holds CJK text therefore also runs a CJK channel:

1. Each run of Chinese, Japanese or Korean characters is stored as overlapping two-character pieces (bigrams), plus the run's last character, in a separate index. Text is NFKC-normalised first, so half-width katakana match full-width katakana.
2. A two-character word such as 迁移, 移行 or 서버 is one piece, so it is found inside any sentence. A longer word must appear with its pieces in order. A single character matches wherever it appears.
3. Rows that contain the query text as written come first. When the query has a run of three or more characters, rows that share only some of its pieces follow, so a question typed without spaces still finds the rows that hold its words.
4. The CJK list is fused with the keyword list by RRF, the same way semantic search is fused. The project, kind, type, tool and date filters apply to it.

```bash
aletheia save "我们在项目里使用数据库迁移工具" --project shop
aletheia search 数据库 --project shop --explain
```

```
#1 2026-11-11 [note] 我们在项目里使用数据库迁移工具 (shop, cli)
channels: facts lexical=on keys=on vectors=off cjk=on; episodes lexical=on vectors=off cjk=on; fusion=rrf
```

Before this channel, the same two commands printed `No matches. (filtered)`.

What to know:

- A query without CJK text does not run the channel, so English ranking and the `--explain` line are unchanged.
- The CJK index holds only rows that contain CJK text. Saving English text does no extra work.
- A CJK query first indexes the rows saved or edited since the previous CJK query. After an upgrade, the first CJK query indexes every row stored before the channel existed. The upgrade adds tables and does not rewrite any row.
- A Latin word written directly against CJK characters, as in 使用Postgres数据库, is one token for the keyword channel, so `postgres` does not find that row. 数据库 does. Put a space around the Latin word to make both work.
- `aletheia search`, `POST /v1/search` and the MCP `search` tool use the CJK channel. The dashboard's memory list filter (`GET /api/hub/memories?q=`) and the `timeline` query lookup do not yet.

## Semantic and hybrid search

Semantic search finds memories by meaning, so "how do I make the sender try again" can reach "Webhook retries use exponential backoff". It needs an optional package and is off by default.

1. Install the runtime next to Aletheia: `bun add @huggingface/transformers`. To keep it out of the project, point `ALETHEIA_TRANSFORMERS_FROM` at a folder whose `node_modules` holds it.
2. Write vectors for what you already have:

```bash
aletheia embed
```

```
Embedded 0 fact(s) and 10 memory/memories with Xenova/bge-small-en-v1.5 (384 dims).
```

3. Search with `--semantic`:

```bash
aletheia search "how do I make the sender try again" --project demo --semantic --explain
```

```
#10 2026-10-29 [note] Please add a retry to the webhook sender and use token=[redacted] for the test call (demo, claude-code)
#5 2026-10-29 [discovery] Webhook retries use exponential backoff up to 5 attempts (demo, cli)
#7 2025-10-27 [bugfix] Fixed race in the spool flush (demo, claude-code)
...
channels: facts lexical=on keys=on vectors=off; episodes lexical=on vectors=on; fusion=rrf
```

The same query without `--semantic` returned one row. The embedding channel has no similarity cutoff, so a semantic search also returns weakly related rows further down. Read the order, not just the count. `facts ... vectors=off` here because this store had no facts yet.

What to know about the runtime:

- The default model is `Xenova/bge-small-en-v1.5`, quantised, 384 dimensions. It runs on your machine.
- The first use downloads the model once. In a fresh home directory the model folder was 34 MB after the first `aletheia embed`.
- When the package is missing, the code prints an error and stops `--semantic` and `aletheia embed`. Plain keyword search keeps working.
- `aletheia embed` embeds memories that have no vector yet and skips events. `aletheia compress` embeds new facts only when `ALETHEIA_EMBED_FACTS=1` is set, because the first embedding downloads a model.
- `POST /v1/search` and the MCP `search` tool answer from the keyword channels only, and the REST reply says so in its `channels.note`. Semantic search is a CLI feature.
- The benchmark rows marked "+ rerank" use a cross-encoder in the benchmark script. `aletheia search` does not rerank.

## Search from an agent: search, timeline, get_observations

An agent should read an index first and fetch full text last. The MCP server has three read tools for this, and the session-start context ends with the same hint.

1. `search` returns a compact index: one line per hit with id, date, type, title, project and tool, plus matching facts.
2. `timeline` shows the memories created just before and after one id, in time order. The anchor row is marked with an arrow.
3. `get_observations` returns the full text of the ids you pick. Pass all ids in one call.

```
--- search {"query":"webhook retry","project":"demo","limit":3}
#5 2026-10-29 [discovery] Webhook retries use exponential backoff up to 5 attempts  (demo, cli)
#10 2026-10-29 [note] Please add a retry to the webhook sender and use token=[redacted] for the test call  (demo, claude-code)
--- timeline {"anchor":5,"before":1,"after":1}
  #4 2026-10-29T19:46 [feature] Added export to markdown on the Knowledge tab
→ #5 2026-10-29T19:46 [discovery] Webhook retries use exponential backoff up to 5 attempts
  #6 2026-10-29T19:46 [note] Prefer small commits across every project
--- get_observations {"ids":[5]}
#5 [discovery] Webhook retries use exponential backoff up to 5 attempts
demo · 2026-10-29T19:46:33.448Z · source: cli
Webhook retries use exponential backoff up to 5 attempts
```

The replies above are shown without their wrapper. Each real reply sits inside an `<aletheia-memory>` block that tells the model to treat the text as data. Use `search` with `file` to find the memories that touched one file path, and `since`, `until`, `type`, `kind` and `order` to narrow a query. The full argument list is in the [MCP tools reference](../reference/mcp-tools.md).

## Measured numbers

These numbers are retrieval numbers. Answer accuracy is not measured. Every row is measured-by-us.

On LoCoMo, claude-mem 15.2.0 as shipped against this project, from `bench/results/2026-10-26/`:

| Run | Questions | Recall@5 | MRR | ms/query |
|---|---|---|---|---|
| claude-mem 15.2.0 (as shipped), raw turns — measured-by-us | 1,536 | 36.0% | 0.285 | p50 1,699 ms, p95 2,824 ms (idle, 40 queries) |
| Raw turns, all 10 conversations | 1,536 | 57.4% | 0.497 | 3.72 |
| Dataset facts, all 10 | 1,536 | 64.8% | 0.591 | 5.53 |
| Dataset facts, 3 conversations | 383 | 67.4% | 0.620 | 5.80 |
| Dataset facts, 3 conversations, + rerank | 383 | 73.9% | 0.686 | 251.16 |
| Dataset facts, all 10, + rerank | 1,536 | 72.3% | 0.680 | 646.19 |
| Our rule-extracted facts, all 10 | 1,536 | 57.7% | 0.492 | 4.94 |

Recall@5 asks whether the gold evidence is in the top five results. The "Raw turns" row is the hybrid strategy: keyword plus embeddings. Re-run the table with `bun scripts/compare-bench.mjs`. In the same raw-turns result file, keyword-only BM25 scores 55.3% Recall@5 and MRR 0.482 at 2.00 ms per query, and embeddings alone score 49.6% (`bun scripts/compare-bench.mjs`, run 2026-10-29 on the committed result files).

The `.log` file next to a result can disagree with it: `raw-turns.log` shows hybrid Recall@5 44.7 and MRR 0.384, where the result file gives 57.4% and 0.497. The log is older than the result file and comes from earlier search code. Re-runs on 2026-10-31 give 57.4% at the publishing commit and 57.7% on current code; details in [benchmarks](../project/benchmarks.md). This page uses the numbers the README publishes, which come from the result files.

Keyword latency on a large store: at 50,000 synthetic rows, keyword search p95 is 32.7 ms project-scoped and 58.6 ms across all projects. Measured-by-us on 2026-10-27, Linux, 12 cores, synthetic data and SQLite FTS5 only, with `bun bench/scale.mjs 50000 20000 --index tuned --queries 200 --seed 1`. The p50 values in the same run were 25.1 ms and 40.7 ms, and synthetic Recall@5 was 59.0%. The method is in [benchmarks](../project/benchmarks.md).

## Next steps

- [Session-start context](../concepts/session-context.md) - the index a new session receives, and its fetch hint.
- [Memory model](../concepts/memory-model.md) - kinds, types, scope and facts.
- [MCP tools reference](../reference/mcp-tools.md) - every argument of `search`, `timeline` and `get_observations`.
- [Benchmarks](../project/benchmarks.md) - method, raw files and the negative results.
