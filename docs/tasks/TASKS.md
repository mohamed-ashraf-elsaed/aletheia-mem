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
| P6 | Free versions of every paid feature: sync, remote MCP, hosted-style extraction, team mode (see [27](../27-free-paid-parity.md)). |

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
| T-002 | Add a run-report script | P0 | none | validated | 2026-10-27 | [T-002.md](T-002.md) |
| T-003 | Add a schema probe to the claude-mem importer | P0 | none | validated | 2026-10-26 | [T-003.md](T-003.md) |
| T-004 | Make empty search results explain themselves | P0 | none | validated | 2026-10-26 | [T-004.md](T-004.md) |
| T-005 | Add REST contract tests for every documented route | P0 | none | validated | 2026-10-27 | [T-005.md](T-005.md) |
| T-006 | Publish an OpenAPI document generated from the routes | P0 | T-005 | todo | — | [T-006.md](T-006.md) |
| T-007 | Add health detail: database, FTS, vectors, model | P0 | none | validated | 2026-10-26 | [T-007.md](T-007.md) |
| T-008 | Add date range, order and pagination to search | P0 | none | validated | 2026-10-27 | [T-008.md](T-008.md) |
| T-009 | Add a kill -9 crash-safety test | P0 | none | todo | — | [T-009.md](T-009.md) |
| T-010 | Restrict data directory and database permissions | P0 | none | validated | 2026-10-27 | [T-010.md](T-010.md) |
| T-011 | Wrap recalled memory as untrusted data | P0 | none | validated | 2026-10-27 | [T-011.md](T-011.md) |
| T-012 | Add a dependency and licence audit | P0 | none | validated | 2026-10-27 | [T-012.md](T-012.md) |
| T-013 | Add a documentation link checker | P0 | none | todo | — | [T-013.md](T-013.md) |
| T-014 | Add Linux, macOS and Windows CI | P0 | T-002 | validated | 2026-10-27 | [T-014.md](T-014.md) |
| T-015 | Add a benchmark protocol test | P0 | none | todo | — | [T-015.md](T-015.md) |
| T-016 | Add excluded projects and context scope | P0 | none | validated | 2026-10-26 | [T-016.md](T-016.md) |
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
| T-027 | Normalise relative dates to absolute ranges | P1 | T-024 | validated | 2026-10-26 | [T-027.md](T-027.md) |
| T-028 | Add near-duplicate detection | P1 | T-017 | validated | 2026-10-26 | [T-028.md](T-028.md) |
| T-029 | Merge duplicates with an audit trail | P1 | T-028 | validated | 2026-10-26 | [T-029.md](T-029.md) |
| T-030 | Score importance with a transparent formula | P1 | T-017 | validated | 2026-10-26 | [T-030.md](T-030.md) |
| T-031 | Add decay and pruning that never deletes silently | P1 | T-030 | validated | 2026-10-26 | [T-031.md](T-031.md) |
| T-032 | Generate session, project and entity summaries | P1 | T-018, T-028 | validated | 2026-10-26 | [T-032.md](T-032.md) |
| T-033 | Enforce project and global scopes | P1 | T-017 | validated | 2026-10-26 | [T-033.md](T-033.md) |
| T-034 | Route providers and add modes for extraction | P1 | T-020 | validated | 2026-10-26 | [T-034.md](T-034.md) |
| T-035 | Suggest rules from captured corrections | P1 | T-018 | validated | 2026-10-26 | [T-035.md](T-035.md) |
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
| T-061 | Add the Cursor installer and hooks | P3 | T-058 | validated | 2026-10-26 | [T-061.md](T-061.md) |
| T-062 | Add the Codex CLI installer | P3 | T-058 | validated | 2026-10-26 | [T-062.md](T-062.md) |
| T-063 | Add a transcript watcher | P3 | T-062 | validated | 2026-10-26 | [T-063.md](T-063.md) |
| T-064 | Add the Gemini CLI installer and hooks | P3 | T-058 | validated | 2026-10-26 | [T-064.md](T-064.md) |
| T-065 | Add the Windsurf installer and hooks | P3 | T-058 | validated | 2026-10-26 | [T-065.md](T-065.md) |
| T-066 | Ship plugin manifests for each host | P3 | T-058 | validated | 2026-10-26 | [T-066.md](T-066.md) |
| T-067 | Add MCP Streamable HTTP transport | P3 | T-011 | validated | 2026-10-26 | [T-067.md](T-067.md) |
| T-068 | Add the OpenCode installer and plugin | P3 | T-058 | validated | 2026-10-26 | [T-068.md](T-068.md) |
| T-069 | Add work-state and corpus MCP tools | P3 | T-017 | todo | — | [T-069.md](T-069.md) |
| T-070 | Verify rules formats on real installs | P3 | T-058 | validated | 2026-10-26 | [T-070.md](T-070.md) |
| T-071 | Add uninstall for every installer | P3 | T-058 | validated | 2026-10-26 | [T-071.md](T-071.md) |
| T-072 | Add rule hygiene checks | P3 | T-058 | validated | 2026-10-26 | [T-072.md](T-072.md) |
| T-073 | Add `aletheia doctor` | P3 | T-007 | validated | 2026-10-27 | [T-073.md](T-073.md) |
| T-074 | Generate folder context files | P3 | T-059 | todo | — | [T-074.md](T-074.md) |
| T-075 | Add a connector verification registry | P3 | T-070 | todo | — | [T-075.md](T-075.md) |
| T-076 | Document and test Claude Desktop MCP setup | P3 | T-058 | validated | 2026-10-26 | [T-076.md](T-076.md) |
| T-077 | Add live feed, session pages and context preview | P3 | T-017 | todo | — | [T-077.md](T-077.md) |
| T-078 | Add a settings UI | P3 | T-016 | todo | — | [T-078.md](T-078.md) |
| T-079 | Restructure the README and add real badges | P4 | T-001 | validated | 2026-10-26 | [T-079.md](T-079.md) |
| T-080 | Publish the npm package | P4 | T-014 | validated | 2026-10-27 | [T-080.md](T-080.md) |
| T-081 | Add a Docker image and compose file | P4 | T-073 | validated | 2026-10-26 | [T-081.md](T-081.md) |
| T-082 | Submit to the MCP registry and two awesome lists | P4 | T-080 | validated | 2026-10-27 | [T-082.md](T-082.md) |
| T-083 | Add logo, social preview and demo GIF | P4 | none | validated | 2026-10-26 | [T-083.md](T-083.md) |
| T-084 | Add issue templates, PR template and Code of Conduct | P4 | none | validated | 2026-10-26 | [T-084.md](T-084.md) |
| T-085 | Add CHANGELOG, releases, Dependabot and funding | P4 | T-080 | validated | 2026-10-26 | [T-085.md](T-085.md) |
| T-086 | Build the docs site with one page per document | P4 | T-013 | validated | 2026-10-26 | [T-086.md](T-086.md) |
| T-087 | Add the i18n workflow and drift checker | P4 | none | validated | 2026-10-26 | [T-087.md](T-087.md) |
| T-088 | Translate the README into the first 10 languages | P4 | T-087 | validated | 2026-10-26 | [T-088.md](T-088.md) |
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
| T-102 | Build Aletheia Sync: a replicated log with per-operation results | P6 | T-017 | validated | 2026-10-26 | [T-102.md](T-102.md) |
| T-103 | Add tombstones, compaction and purge to sync | P6 | T-102 | validated | 2026-10-26 | [T-103.md](T-103.md) |
| T-104 | Add device pairing, device tokens and revoke | P6 | T-102 | validated | 2026-10-26 | [T-104.md](T-104.md) |
| T-105 | Add live update frames over WebSocket | P6 | T-102 | validated | 2026-10-26 | [T-105.md](T-105.md) |
| T-106 | Run hosted-style extraction as a server-side worker | P6 | T-020 | todo | — | [T-106.md](T-106.md) |
| T-107 | Serve a private remote MCP endpoint | P6 | T-067, T-104 | validated | 2026-10-26 | [T-107.md](T-107.md) |
| T-108 | Add scoped API tokens, quotas and an audit log | P6 | T-102 | validated | 2026-10-26 | [T-108.md](T-108.md) |
| T-109 | Add a local usage ledger and caps | P6 | T-106 | todo | — | [T-109.md](T-109.md) |
| T-110 | Add remote login for the Hub | P6 | T-104 | validated | 2026-10-26 | [T-110.md](T-110.md) |
| T-111 | Add an OAuth connector for ChatGPT and Claude.ai | P6 | T-107, T-110 | todo | — | [T-111.md](T-111.md) |
| T-112 | Add team mode: shared memory, board, brief and search | P6 | T-102, T-103, T-104, T-108 | validated | 2026-10-26 | [T-112.md](T-112.md) |
| T-113 | Add purge, export and an erasure receipt | P6 | T-103 | validated | 2026-10-26 | [T-113.md](T-113.md) |
| T-114 | Add alert rules and webhooks | P6 | T-108 | validated | 2026-10-26 | [T-114.md](T-114.md) |
| T-115 | Add OIDC, SCIM, RBAC and DLP rules | P6 | T-110, T-108, T-112 | todo | — | [T-115.md](T-115.md) |
| T-116 | Run My Work setup extraction on the user's own server | P6 | T-106 | todo | — | [T-116.md](T-116.md) |
| T-117 | Add optional end-to-end encryption for sync | P6 | T-102 | validated | 2026-10-26 | [T-117.md](T-117.md) |
| T-118 | Generate the README and site comparison tables from docs/28 JSON | P6 | none | validated | 2026-10-26 | [T-118.md](T-118.md) |
| T-119 | Add provider presets and a fallback chain for extraction | P6 | T-034 | validated | 2026-10-26 | [T-119.md](T-119.md) |
| T-120 | Add an output-language setting for extraction and summaries | P6 | T-018 | validated | 2026-10-26 | [T-120.md](T-120.md) |
| T-121 | Back-fill memory from existing Claude Code and Command Code transcripts | P6 | T-018 | validated | 2026-10-26 | [T-121.md](T-121.md) |
| T-122 | Prove Aletheia never writes into project folders | P6 | T-016 | validated | 2026-10-26 | [T-122.md](T-122.md) |
| T-123 | Add reversible dismiss and delete from the Hub, CLI and MCP | P6 | T-017 | validated | 2026-10-26 | [T-123.md](T-123.md) |
| T-124 | Research and add installers for Antigravity, Kimi, Pi and OpenClaw | P6 | T-058 | todo | — | [T-124.md](T-124.md) |
| T-130 | Wire dedupe and source accumulation into the worker insert path | P1 | T-018, T-028, T-029 | validated | 2026-10-26 | [T-130.md](T-130.md) |
| T-131 | Embed facts automatically and fuse facts with episodes | P1 | T-018, T-020, T-033, T-130 | validated | 2026-10-26 | [T-131.md](T-131.md) |
| T-132 | Re-run LoCoMo and publish the measured table | P2 | T-018, T-131 | validated | 2026-10-26 | [T-132.md](T-132.md) |
| T-133 | Re-measure 50k-row latency and apply the first FTS index fix | P2 | T-018 | validated | 2026-10-26 | [T-133.md](T-133.md) |
| T-134 | Build one app shell with Work, Memory, Rules and Tools tabs | P6 | none | validated | 2026-10-26 | [T-134.md](T-134.md) |
| T-135 | Add a Memory tab with memories, facts and search channels | P6 | T-134 | validated | 2026-10-26 | [T-135.md](T-135.md) |
| T-136 | Add the review queue to the Memory tab | P6 | T-135 | validated | 2026-10-26 | [T-136.md](T-136.md) |
| T-137 | Add a Rules tab with the editor and suggested rules | P6 | T-134 | validated | 2026-10-26 | [T-137.md](T-137.md) |
| T-138 | Add a read-only Tools tab from doctor data | P6 | T-134 | validated | 2026-10-26 | [T-138.md](T-138.md) |
| T-139 | Add UI tests for the one page | P6 | T-134, T-135, T-136, T-137, T-138 | validated | 2026-10-26 | [T-139.md](T-139.md) |
| T-140 | Prove end-to-end capture for every full-capability host | P3 | T-058, T-061, T-062, T-064, T-065 | validated | 2026-10-26 | [T-140.md](T-140.md) |
| T-141 | Update docs and claims for the five hosts | P3 | T-070, T-140 | validated | 2026-10-26 | [T-141.md](T-141.md) |
| T-142 | Add the /v1/work query layer and route | P6 | none | validated | 2026-10-26 | [T-142.md](T-142.md) |
| T-143 | Replace the Work tab with Aletheia's own overview | P6 | T-142 | validated | 2026-10-26 | [T-143.md](T-143.md) |
| T-144 | Add owner goals from typed prompts | P6 | T-143 | validated | 2026-10-26 | [T-144.md](T-144.md) |
| T-145 | Add the read-only session page | P6 | T-143 | validated | 2026-10-26 | [T-145.md](T-145.md) |
| T-146 | Retire the iframe and offer the classic viewer from Tools | P6 | T-143 | validated | 2026-10-26 | [T-146.md](T-146.md) |
| T-147 | Test the Work view and guard the old branding | P6 | T-142, T-143, T-144, T-145, T-146 | validated | 2026-10-26 | [T-147.md](T-147.md) |
| T-148 | Fix the transcript back-fill CI flake | P6 | T-121 | validated | 2026-10-26 | [T-148.md](T-148.md) |
| T-149 | Raise the sync E2EE scrypt cost to the OWASP minimum | P6 | T-117 | validated | 2026-10-26 | [T-149.md](T-149.md) |
| T-150 | Work tab polish (prompts, session-end, goals, 375px) | P6 | T-143, T-144 | validated | 2026-10-26 | [T-150.md](T-150.md) |
| T-151 | Add an auto-start service (systemd user unit and launchd plist) | P3 | none | validated | 2026-10-26 | [T-151.md](T-151.md) |
| T-152 | Group sessions into requests with status, stage and detail | P6 | T-142, T-143, T-150 | validated | 2026-10-26 | [T-152.md](T-152.md) |
| T-165 | Add a temp-dir test helper and fix the migration test leak | P0 | none | validated | 2026-10-26 | [T-165.md](T-165.md) |
| T-166 | Add progress and ETA per request from stored rows | P6 | T-152 | validated | 2026-10-26 | [T-166.md](T-166.md) |
| T-167 | Detect commit, PR and branch references in tool events | P6 | T-152 | validated | 2026-10-26 | [T-167.md](T-167.md) |
| T-168 | Roll up goals with request links, status and open asks | P6 | T-152 | validated | 2026-10-26 | [T-168.md](T-168.md) |
| T-169 | Add the build story with counts, velocity and learned habits | P6 | T-152 | validated | 2026-10-26 | [T-169.md](T-169.md) |
| T-170 | Add context economics (per-observation read and work tokens) | P6 | T-019 | validated | 2026-10-26 | [T-170.md](T-170.md) |
| T-171 | Add rule strength and evidence (times seen, dated quotes) | P6 | T-035 | validated | 2026-10-26 | [T-171.md](T-171.md) |
| T-172 | Add the rule decide flow API | P6 | T-072, T-171 | validated | 2026-10-26 | [T-172.md](T-172.md) |
| T-173 | Add work list query params (filter, sort, group) | P6 | T-152 | validated | 2026-10-26 | [T-173.md](T-173.md) |
| T-174 | Stop the test fixture leaking temp directories | P0 | none | validated | 2026-10-27 | [T-174.md](T-174.md) |
| T-200 | Study claude-mem's viewer and derive Aletheia's design tokens | P6 | none | validated | 2026-10-26 | [T-200.md](T-200.md) |
| T-201 | Add DOM-free UI logic: pager, time, highlight, hash params, Region machine | P6 | T-200 | validated | 2026-10-26 | [T-201.md](T-201.md) |
| T-202 | Add a safe Markdown renderer | P6 | T-200 | validated | 2026-10-26 | [T-202.md](T-202.md) |
| T-203 | Add limit, offset and total to every list route | P6 | none | validated | 2026-10-26 | [T-203.md](T-203.md) |
| T-204 | Build the component system | P6 | T-200, T-201 | validated | 2026-10-26 | [T-204.md](T-204.md) |
| T-205 | Build the app shell, theme toggle, search, shortcuts and palette | P6 | T-204, T-202 | validated | 2026-10-26 | [T-205.md](T-205.md) |
| T-206 | Add the live status bar and connection banner | P6 | T-205 | validated | 2026-10-26 | [T-206.md](T-206.md) |
| T-207 | Add the Region wrapper, paged list controller and Pager | P6 | T-201, T-204, T-203 | validated | 2026-10-26 | [T-207.md](T-207.md) |
| T-208 | Rebuild the Memory tab | P6 | T-207, T-202, T-203 | validated | 2026-10-26 | [T-208.md](T-208.md) |
| T-209 | Rebuild the Review queue | P6 | T-208 | validated | 2026-10-26 | [T-209.md](T-209.md) |
| T-210 | Rebuild the Rules tab | P6 | T-207 | validated | 2026-10-26 | [T-210.md](T-210.md) |
| T-211 | Rebuild the Tools tab | P6 | T-207 | validated | 2026-10-26 | [T-211.md](T-211.md) |
| T-212 | Add the first-run guide | P6 | T-208 | validated | 2026-10-26 | [T-212.md](T-212.md) |
| T-213 | Add motion and reduced-motion support | P6 | T-204 | validated | 2026-10-26 | [T-213.md](T-213.md) |
| T-214 | Accessibility and responsive pass | P6 | T-208, T-209, T-210, T-211, T-212, T-213, T-215 | validated | 2026-10-26 | [T-214.md](T-214.md) |
| T-215 | Restyle the Work tab | P6 | T-213 | validated | 2026-10-26 | [T-215.md](T-215.md) |
| T-216 | Seed demo data, measure performance, update docs and screenshots | P6 | T-214 | validated | 2026-10-26 | [T-216.md](T-216.md) |
| T-217 | Put Alerts and Team in the Tools tab on the shared components | P6 | T-211, T-207 | validated | 2026-10-26 | [T-217.md](T-217.md) |
| T-218 | Show requests in the Work tab | P6 | T-215, T-152, T-166, T-167, T-173 | validated | 2026-10-27 | [T-218.md](T-218.md) |
| T-219 | Add the goals roll-up panel to the Work tab | P6 | T-168, T-218 | validated | 2026-10-27 | [T-219.md](T-219.md) |
| T-220 | Use rule strength, evidence and the decide flow in the Rules tab | P6 | T-171, T-172 | validated | 2026-10-27 | [T-220.md](T-220.md) |
| T-221 | Add the build story and context economics panels | P6 | T-169, T-170, T-218 | validated | 2026-10-27 | [T-221.md](T-221.md) |
| T-222 | Seed the new panels, extend the contract tests, update docs and screenshots | P6 | T-218, T-219, T-220, T-221 | validated | 2026-10-27 | [T-222.md](T-222.md) |
| T-223 | Generate a one-file project status page from the repository | P4 | none | validated | 2026-10-27 | [T-223.md](T-223.md) |
| T-224 | Keyboard and small-screen walk of Requests, Goals, Story, Suggested rules and Economics | P4 | none | validated | 2026-10-27 | [T-224.md](T-224.md) |
