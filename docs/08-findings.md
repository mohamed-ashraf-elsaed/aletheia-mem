# 8. Findings

Facts found while reverse engineering claude-mem 15.2.0, deliberate differences in the clone, and what is
not verified. Each finding says how it was established.

## 8.1 Defects in the original

**F1. The observation half of My Work is empty on a current database.**
The query that loads observations selects `observations.content_session_id`. That column does not exist in
this database's `observations` table (its `CREATE TABLE` was read from `sqlite_master`; the column is not there). SQLite throws `no such column: content_session_id`. The reader's helper
treats "no such column" as "empty result", so the page shows `coverage.observations: 0` and `agents: []`
even with 401 observations in the database. Established by running the same SELECT against the live
database (error reproduced) and by the live `/api/work-view` returning 0 observations and 0 agents.
*Clone behaviour:* by default derives the column from `sdk_sessions` and shows agents and activity.
`ALETHEIA_BUG_COMPAT=1` reproduces the original. The differential test runs in that mode.

**F2. Repository detection from `git push` output misses SSH remotes.**
Git prints `To github.com:org/repo.git` (it hides `git@`). The original's parser accepts only
`https://github.com/..`, `git@github.com:..` and `ssh://git@github.com/..`, so commits and branches pushed over
SSH have no repo and no GitHub link unless another source supplies it. Established from the parser code and
reproduced in `test/readmodel.test.mjs`. Kept as is (faithful).

**F3. `MY-RULES.md` header names the wrong port.**
It says "(localhost:37777)". The worker's port is `37700 + (uid % 100)` (see `save_goals.py`,
`worker_base_url`), `37700` here. Cosmetic. The clone writes its own URL.

**F4. A wrong column name is silent everywhere.**
The `safeAll`-style helper hides schema mismatches in every query, which is how F1 survived. The clone keeps
that behaviour for compatibility but F1 shows the risk; a debug log on swallowed errors would have caught it.

## 8.2 Deliberate differences in the clone

| Area | Original | Clone | Why |
|---|---|---|---|
| Writes to `claude-mem.db` | rules, "finished" marks and goals are appended as `work_state_entries` | to `overlay.db`, folded in with source entries | Keep the source read-only and the clone safe beside the original. |
| Onboarding and account | local/hosted memory choice, checkout, history import, prompt scan, cloud sync | `setup.state` always `complete`; POSTs 404 | Account and billing flow, no meaning locally. |
| Agent CLIs for the refresh | Claude Code via the Agent SDK with read-only file tools and memory MCP tools; Codex; Gemini; first logged-in agent that succeeds | `claude -p` without tools, or an OpenAI-compatible endpoint; evidence inline | No tool plumbing; any chat model works. |
| Owner prompt export | internal TypeScript scan | the skill's `export_owner_prompts.py` | Readable, vendored, same output files. |
| Project naming | also `git-remote` source and glob environments | path-based only | Settings not needed here. |
| `currentProject` | derived from the worker's home project | always empty | The page never uses it. |
| Port | `37700 + uid % 100` | `37790` | Run side by side. |
| UI | same | same files | |

## 8.3 Not verified

| Item | Status |
|---|---|
| Exact zod error text and body shape for rejected POSTs | Not read from source; the clone returns `{error:"Invalid request body.", details}`. |
| The original's `/viewer` and `/tv` pages | Out of scope, not reproduced. |
| The goals step end to end on real data | Not run. It reads your Claude Code and Codex transcripts and sends them to a model. Its pieces are tested separately: the vendored `save_goals.py` against the clone (`test/goals-script.test.mjs`), the orchestrator branches by reading the code. |
| `export_owner_prompts.py` | Vendored, not run by any test (it reads `~/.claude/projects`). |
| Human copy against a real model | Provider code and validation tested with stubs only. |
| Windows | Untested. |
| Differential equality on a busy database | The live database had 0 agents and 4 requests under the original's own F1 behaviour. Equality was checked there. The agent, subagent and work-product paths are covered by fixture tests, which assert behaviour read from the original's code, not an oracle. |
| `Star` button behaviour | Not checked (see [06](06-frontend.md)). |

## 8.3b Defects found in this project's own code (validation round 2)

Found by benchmarks, fuzzing and cross-checking against official sources, then fixed with a test.

| # | Defect | How found | Fix |
|---|---|---|---|
| F5 | The first Hub search required **every** query word to match. On 1,536 natural-language questions it scored **0.1% Recall@5**. | LoCoMo retrieval benchmark | BM25 with any-term matching and stemming; optional dense + RRF |
| F6 | A filtered full-text query took **267 ms** instead of 2 ms on 600 rows (the planner scanned the index once per row). "Newest 30" took **222 ms** at 50k rows (no index for the sort); stats took 112 ms. | Profiling, then `bench/scale.mjs` | `CROSS JOIN` to pin the join order; composite indexes; gentle rare-term pruning (156 → about 104 ms at 50k; aggressive pruning reached 71 ms but is not used, see F13); 3 s stats cache; "newest 30" now 0.5 ms |
| F7 | The secret redactor missed hyphenated keys (`sk-proj-…`, `sk-or-v1-…`) and had no rule for JWTs, Stripe, GitLab and npm tokens or passwords inside URLs. | Fuzz test over formats and positions | Patterns added; test covers 14 key formats in 5 positions each |
| F8 | An oversized request body hung the connection instead of being refused. | Hostile-input test | `maxRequestBodySize` at the socket and an 8 MB cap in the handler |
| F9 | The MCP server did not offer protocol version **2025-11-25** (the current spec). | Read the spec, then ran the official SDK client | Version list updated; negotiation tested; SDK client passes |
| F10 | Windsurf's current docs name `~/.config/devin/mcp_config.json`; the registry only knew `~/.codeium/windsurf/mcp_config.json`. | Fetched Windsurf's official docs (they redirect to the Devin docs) | Both paths supported, existing file preferred |
| F11 | **A benchmark of claude-mem queried too early understates it**: the same 150 questions scored 24.1% Recall@5 20 s after ingest and 38.9% once its Chroma index finished. | Re-ran the pilot after the index settled | Protocol rule "wait until indexed" in [18](18-benchmark-plan.md#184-protocol) |
| F12 | **My own benchmark gave wrong numbers in rerank mode** (BM25 29% instead of 56% on the same four conversations; dense also halved). SQLite queries returned wrong results after the cross-encoder had run in the same process (Bun 1.3.10 with onnxruntime-node); the visible symptom earlier was `RangeError: Cannot use a closed database`. | A cross-check: the same strategy scored differently with and without `--rerank`, which is impossible if the code is right | The harness collects candidates first and reranks afterwards, with a comment explaining why. Non-rerank rows now equal a run with no reranker. All numbers from the broken runs were discarded and re-run. **Root cause not investigated**; the hub server does not use the cross-encoder in the same process as writes yet (E1-4 must test this before enabling rerank in the server) |
| F13 | I attributed the F12 drop to my rare-term pruning. A sweep disproved it: 24/1.0, 16/0.9, 12/0.6 and 8/0.35 all scored 55.0 to 55.1 BM25 Recall@5 on LoCoMo. | Parameter sweep | Gentle default kept (12 terms, 60%); the lesson is recorded: measure before blaming |

Upstream observation (idle machine, 40 queries): claude-mem's search p50 1,699 ms, p95 2,824 ms on a 6k-row store; 9 to 15 s while its background embedding was running or queries were concurrent. The live worker also updated itself from 15.2.0 to 15.2.1 during this work; the baselines ran on an isolated 15.2.0 worker, and the My Work differential test still shows 0 differences against 15.2.1.

## 8.4 Observed side effect worth knowing

On this machine the original's auto-refresh was already running while this work was done: its
`refresh.json` shows `agent: claude-code`, steps `grouping`, `review`, `alignment`, `story`, and its goals
list is built from the owner's typed prompts. The page you see at `:37700` is therefore backed by an LLM
reading your agent history, automatically, every 10 minutes when something is due.
