# Task status

This table is the machine-readable list of work. One line per task. The task file is the work order; this table is the
index. Both must agree, or `bun scripts/check-tasks.mjs` fails.

## Status legend

| Status | Meaning |
|---|---|
| `todo` | Not started. Eligible when every dependency is `validated`. |
| `doing` | Claimed by one agent. Set before the first edit. |
| `implemented` | Code is done; the validation command has **not** been run yet. |
| `validated` | The validation command ran and passed, and its real output is in the task's Evidence field. |
| `failed` | The validation command ran and failed; the real output and a dated note are in the task. Never delete a failed task. |


## Phases

| Phase | Meaning |
|---|---|
| P0 | Correctness and honesty: fail loudly, test the API, protect the data. |
| P1 | Memory building: episodes, facts, entities, time, dedupe, decay, summaries. |
| P2 | Retrieval numbers: the experiments in [22](../22-improve-the-numbers.md). |
| P3 | Per-tool installers and hooks, plus the Hub UI needed to operate them. |
| P4 | Repository polish and i18n. |
| P5 | Team and graph extensions. |

## Rules

1. Pick the first `todo` task whose dependencies are all `validated`.
2. Set it to `doing` and name the agent/session in the Status history.
3. Do the work in small commits.
4. Run the **Validation command** exactly as written.
5. Paste the real output into the task's **Evidence** field.
6. Set `implemented` (not yet run), `validated` (ran and passed), or `failed` (ran and failed, with output).
7. Never mark `validated` from reasoning, from a code review, or from a summary.
8. Never edit another task's status. Never delete a failed task; add a dated note instead.
9. Update this table and the task file in the same commit.

## Tasks

| ID | Title | Phase | Depends on | Status | Validated on (date) | Evidence link |
|---|---|---|---|---|---|---|
| T-001 | Make README claims generated, not typed | P0 | none | todo | — | [T-001.md](T-001.md) |
| T-002 | Add a run-report script | P0 | none | todo | — | [T-002.md](T-002.md) |
| T-003 | Add a schema probe to the claude-mem importer | P0 | none | validated | 2026-10-26 | [T-003.md](T-003.md) |
| T-004 | Make empty search results explain themselves | P0 | none | todo | — | [T-004.md](T-004.md) |
| T-005 | Add REST contract tests for every documented route | P0 | none | todo | — | [T-005.md](T-005.md) |
| T-006 | Publish an OpenAPI document generated from the routes | P0 | T-005 | todo | — | [T-006.md](T-006.md) |
| T-007 | Add health detail: database, FTS, vectors, model | P0 | none | todo | — | [T-007.md](T-007.md) |
| T-008 | Add date range, order and pagination to search | P0 | none | todo | — | [T-008.md](T-008.md) |
| T-009 | Add a kill -9 crash-safety test | P0 | none | todo | — | [T-009.md](T-009.md) |
| T-010 | Restrict data directory and database permissions | P0 | none | todo | — | [T-010.md](T-010.md) |
| T-011 | Wrap recalled memory as untrusted data | P0 | none | todo | — | [T-011.md](T-011.md) |
| T-012 | Add a dependency and licence audit | P0 | none | todo | — | [T-012.md](T-012.md) |
| T-013 | Add a documentation link checker | P0 | none | todo | — | [T-013.md](T-013.md) |
| T-014 | Add Linux, macOS and Windows CI | P0 | T-002 | todo | — | [T-014.md](T-014.md) |
| T-015 | Add a benchmark protocol test | P0 | none | todo | — | [T-015.md](T-015.md) |
| T-016 | Add excluded projects and context scope | P0 | none | todo | — | [T-016.md](T-016.md) |
| T-017 | Add schema v3 with an additive migration | P1 | T-003 | validated | 2026-10-26 | [T-017.md](T-017.md) |
| T-018 | Add fact extraction with a strict validator | P1 | T-017 | validated | 2026-10-26 | [T-018.md](T-018.md) |
| T-019 | Batch extraction and record its cost | P1 | T-018 | validated | 2026-10-26 | [T-019.md](T-019.md) |
| T-020 | Run compression in a resumable background queue | P1 | T-017 | validated | 2026-10-26 | [T-020.md](T-020.md) |
| T-021 | Extract entities from facts | P1 | T-017 | validated | 2026-10-26 | [T-021.md](T-021.md) |
| T-022 | Resolve entity aliases | P1 | T-021 | validated | 2026-10-26 | [T-022.md](T-022.md) |
| T-023 | Link facts and episodes to their sources | P1 | T-017 | validated | 2026-10-26 | [T-023.md](T-023.md) |
| T-024 | Add bi-temporal fact columns | P1 | T-017 | validated | 2026-10-26 | [T-024.md](T-024.md) |
| T-025 | Invalidate contradicted facts instead of deleting them | P1 | T-018, T-024 | validated | 2026-10-26 | [T-025.md](T-025.md) |
| T-026 | Add a history and as-of query API | P1 | T-024 | todo | — | [T-026.md](T-026.md) |
| T-027 | Normalise relative dates to absolute ranges | P1 | T-024 | todo | — | [T-027.md](T-027.md) |
| T-028 | Add near-duplicate detection | P1 | T-017 | validated | 2026-10-26 | [T-028.md](T-028.md) |
| T-029 | Merge duplicates with an audit trail | P1 | T-028 | validated | 2026-10-26 | [T-029.md](T-029.md) |
| T-030 | Score importance with a transparent formula | P1 | T-017 | validated | 2026-10-26 | [T-030.md](T-030.md) |
| T-031 | Add decay and pruning that never deletes silently | P1 | T-030 | todo | — | [T-031.md](T-031.md) |
| T-032 | Generate session, project and entity summaries | P1 | T-018, T-028 | todo | — | [T-032.md](T-032.md) |
| T-033 | Enforce project and global scopes | P1 | T-017 | todo | — | [T-033.md](T-033.md) |
| T-034 | Route providers and add modes for extraction | P1 | T-020 | validated | 2026-10-26 | [T-034.md](T-034.md) |
| T-035 | Suggest rules from captured corrections | P1 | T-018 | todo | — | [T-035.md](T-035.md) |
| T-036 | Index the files field and add search-by-file | P2 | T-017 | todo | — | [T-036.md](T-036.md) |
| T-037 | Index at round level | P2 | T-017 | todo | — | [T-037.md](T-037.md) |
| T-038 | Expand and rewrite queries | P2 | T-018 | todo | — | [T-038.md](T-038.md) |
| T-039 | Sweep hybrid weights and RRF k on a hold-out | P2 | none | todo | — | [T-039.md](T-039.md) |
| T-040 | Run the embedding-model ladder | P2 | none | todo | — | [T-040.md](T-040.md) |
| T-041 | Run the cross-encoder ladder | P2 | none | todo | — | [T-041.md](T-041.md) |
| T-042 | Add a token-budgeted packer | P2 | T-040, T-041 | todo | — | [T-042.md](T-042.md) |
| T-043 | Add temporal retrieval and filters | P2 | T-024, T-027 | todo | — | [T-043.md](T-043.md) |
| T-044 | Add semantic prompt injection | P2 | T-042 | todo | — | [T-044.md](T-044.md) |
| T-045 | Add MMR diversity and a why-recalled payload | P2 | T-042 | todo | — | [T-045.md](T-045.md) |
| T-046 | Add knowledge agents (queryable corpora) | P2 | T-018 | todo | — | [T-046.md](T-046.md) |
| T-047 | Tune FTS5 at 50,000 rows | P2 | none | todo | — | [T-047.md](T-047.md) |
| T-048 | Add a graph retrieval channel | P2 | T-021, T-023 | todo | — | [T-048.md](T-048.md) |
| T-049 | Add quantised vectors and ANN | P2 | none | todo | — | [T-049.md](T-049.md) |
| T-050 | Add query and result caching | P2 | none | todo | — | [T-050.md](T-050.md) |
| T-051 | Build the LongMemEval-S answer-accuracy harness | P2 | none | todo | — | [T-051.md](T-051.md) |
| T-052 | Pin the judge protocol and spot-check it | P2 | T-051 | todo | — | [T-052.md](T-052.md) |
| T-053 | Add a BEAM subset adapter | P2 | T-051 | todo | — | [T-053.md](T-053.md) |
| T-054 | Add a MemoryAgentBench adapter | P2 | T-051 | todo | — | [T-054.md](T-054.md) |
| T-055 | Add a CI regression gate for recall and latency | P2 | T-051 | todo | — | [T-055.md](T-055.md) |
| T-056 | Build CodeMemBench from real coding sessions | P2 | T-051 | todo | — | [T-056.md](T-056.md) |
| T-057 | Add bootstrap confidence intervals and a clean hold-out | P2 | T-051 | todo | — | [T-057.md](T-057.md) |
| T-058 | Build the installer core and Claude Code installer | P3 | none | validated | 2026-10-26 | [T-058.md](T-058.md) |
| T-059 | Add Claude Code hooks and automatic context | P3 | T-058 | validated | 2026-10-26 | [T-059.md](T-059.md) |
| T-060 | Add the file-read gate and smart outline | P3 | T-059 | todo | — | [T-060.md](T-060.md) |
| T-061 | Add the Cursor installer and hooks | P3 | T-058 | todo | — | [T-061.md](T-061.md) |
| T-062 | Add the Codex CLI installer | P3 | T-058 | todo | — | [T-062.md](T-062.md) |
| T-063 | Add a transcript watcher | P3 | T-062 | todo | — | [T-063.md](T-063.md) |
| T-064 | Add the Gemini CLI installer and hooks | P3 | T-058 | todo | — | [T-064.md](T-064.md) |
| T-065 | Add the Windsurf installer and hooks | P3 | T-058 | todo | — | [T-065.md](T-065.md) |
| T-066 | Ship plugin manifests for each host | P3 | T-058 | todo | — | [T-066.md](T-066.md) |
| T-067 | Add MCP Streamable HTTP transport | P3 | T-011 | todo | — | [T-067.md](T-067.md) |
| T-068 | Add the OpenCode installer and plugin | P3 | T-058 | todo | — | [T-068.md](T-068.md) |
| T-069 | Add work-state and corpus MCP tools | P3 | T-017 | todo | — | [T-069.md](T-069.md) |
| T-070 | Verify rules formats on real installs | P3 | T-058 | todo | — | [T-070.md](T-070.md) |
| T-071 | Add uninstall for every installer | P3 | T-058 | todo | — | [T-071.md](T-071.md) |
| T-072 | Add rule hygiene checks | P3 | T-058 | todo | — | [T-072.md](T-072.md) |
| T-073 | Add `aletheia doctor` | P3 | T-007 | todo | — | [T-073.md](T-073.md) |
| T-074 | Generate folder context files | P3 | T-059 | todo | — | [T-074.md](T-074.md) |
| T-075 | Add a connector verification registry | P3 | T-070 | todo | — | [T-075.md](T-075.md) |
| T-076 | Document and test Claude Desktop MCP setup | P3 | T-058 | todo | — | [T-076.md](T-076.md) |
| T-077 | Add live feed, session pages and context preview | P3 | T-017 | todo | — | [T-077.md](T-077.md) |
| T-078 | Add a settings UI | P3 | T-016 | todo | — | [T-078.md](T-078.md) |
| T-079 | Restructure the README and add real badges | P4 | T-001 | todo | — | [T-079.md](T-079.md) |
| T-080 | Publish the npm package | P4 | T-014 | todo | — | [T-080.md](T-080.md) |
| T-081 | Add a Docker image and compose file | P4 | T-073 | todo | — | [T-081.md](T-081.md) |
| T-082 | Submit to the MCP registry and two awesome lists | P4 | T-080 | todo | — | [T-082.md](T-082.md) |
| T-083 | Add logo, social preview and demo GIF | P4 | none | todo | — | [T-083.md](T-083.md) |
| T-084 | Add issue templates, PR template and Code of Conduct | P4 | none | todo | — | [T-084.md](T-084.md) |
| T-085 | Add CHANGELOG, releases, Dependabot and funding | P4 | T-080 | todo | — | [T-085.md](T-085.md) |
| T-086 | Build the docs site with one page per document | P4 | T-013 | todo | — | [T-086.md](T-086.md) |
| T-087 | Add the i18n workflow and drift checker | P4 | none | todo | — | [T-087.md](T-087.md) |
| T-088 | Translate the README into the first 10 languages | P4 | T-087 | todo | — | [T-088.md](T-088.md) |
| T-089 | Translate the README into the remaining 22 languages | P4 | T-088 | todo | — | [T-089.md](T-089.md) |
| T-090 | Run an accessibility and theme pass on the Hub | P4 | T-077 | todo | — | [T-090.md](T-090.md) |
| T-091 | Add a free self-hosted team server | P5 | T-067 | todo | — | [T-091.md](T-091.md) |
| T-092 | Add per-client API keys and ACL | P5 | T-091 | todo | — | [T-092.md](T-092.md) |
| T-093 | Add audit export | P5 | T-091 | todo | — | [T-093.md](T-093.md) |
| T-094 | Add a review queue for shared and low-confidence memory | P5 | T-091 | todo | — | [T-094.md](T-094.md) |
| T-095 | Add an append-only op log with hybrid logical clocks | P5 | T-091 | todo | — | [T-095.md](T-095.md) |
| T-096 | Add a shared bundle workflow | P5 | T-091 | todo | — | [T-096.md](T-096.md) |
| T-097 | Make graph retrieval a production channel | P5 | T-048 | todo | — | [T-097.md](T-097.md) |
| T-098 | Add entity summaries and belief tracking | P5 | T-021, T-032 | todo | — | [T-098.md](T-098.md) |
| T-100 | Add the Command Code installer and hooks | P3 | T-058 | validated | 2026-10-26 | [T-100.md](T-100.md) |
| T-101 | Prove automatic capture end to end | P3 | T-058, T-059, T-100 | validated | 2026-10-26 | [T-101.md](T-101.md) |
| T-130 | Wire dedupe and source accumulation into the worker insert path | P1 | T-018, T-028, T-029 | validated | 2026-10-26 | [T-130.md](T-130.md) |
