# A4. What claude-mem users ask for in pull requests

Date: 2026-10-26. Repository: https://github.com/thedotmack/claude-mem. All data fetched this run with `gh api` (GitHub search API, sorted and paged), saved under `/tmp/a4/` (not in the repo). Sources and what each gave: [A4-sources.tsv](A4-sources.tsv).

## 0. Counts and method

**Correction to the brief.** The brief said 5,087 PRs. Measured today: 2,518 PRs (59 open, 1,481 merged, 978 closed unmerged). 5,087 is the highest number on the repo; issues and PRs share one numbering. Command: `gh api -X GET search/issues -f q='repo:thedotmack/claude-mem is:pr [is:open|is:merged|is:closed is:unmerged]' -f per_page=1 --jq .total_count`.

| Set | Query (all `repo:thedotmack/claude-mem is:pr`) | Fetched | Saved file |
|---|---|---|---|
| Open | `is:open` | 59 of 59 | `/tmp/a4/open.jsonl` |
| Merged, last 90 days | `is:merged merged:>=2026-07-28` | 983 (53 by `posthog[bot]`) | `/tmp/a4/merged90.jsonl` |
| of which feat/feature | title starts `feat` or label has `feat`/`enhancement`, no bots | 104 (62 external, 42 maintainer) | `/tmp/a4/feat90.json` |
| Most commented, all time | sort by comments, top 1000 kept, top 40 non-bot used | 40 | `/tmp/a4/topcomments.jsonl` |
| Most reacted, all time | sort by reactions, top 1000 kept, top 40 non-bot used | 40 | `/tmp/a4/topreact.jsonl` |
| Closed unmerged, external | `is:closed is:unmerged -author:thedotmack` (two date slices) | 839, of which 756 not bots | `/tmp/a4/cu_all.json` |

Notes on method, stated plainly:

- The merged-in-90-days label rule found no `feat` label on any merged PR (the repo's only labels in that set are "Babysitter: Ready to Merge"), so "feat" here means the title prefix. This is my reading of "feat/ or feature labels or titles starting feat".
- **Author type.** `maintainer` = user `thedotmack` (repo owner). Everything else is `external`, including contributors who have merged before. Bots (`posthog[bot]`, `Copilot`, `dependabot`) are skipped. Two open PRs are skipped for that reason: #4182 (Copilot) and #3564 (posthog[bot]). 57 of 59 open PRs are in the table.
- **The table has 683 rows** (586 external, 97 maintainer). Every open PR, every merged feat PR from the last 90 days, the top 40 by comments and the top 40 by reactions are in it. Closed-unmerged external PRs are in it only when the title matched a need theme (477 of 756). The other 279 are not analysed beyond the title scan (docs, CI, version bumps, spam, noise).
- **How "what the user wanted" was made.** It is the PR title, stripped of its `feat:`/`fix:` prefix and wrapped in one sentence by a script (`/tmp/a4/gen.py`). The first 600 characters of the body were read for 8 PRs (#589, #1233, #1722, #1246, #1207, #2908, #1333, #4365) and the comment threads of 5 (#589, #1233, #1722, #1246, #2908). The rest rests on the title. Treat those rows as a title summary, not a reading of the diff.
- **Category and need theme** come from keyword rules over the title (`/tmp/a4/analyze.py`, `/tmp/a4/final.py`). Each PR gets one primary theme. I eyeballed 7 random PRs in each of 12 themes after tightening the keywords. By my count about one in eight looked wrong (for example a build fix filed under sync); this is a rough estimate, not a measured error rate. So counts are approximate, not exact. Precision and recall are not measured.
- Counts in section 2 and 4 come from `python3 /tmp/a4/stats.py` over the saved data. Re-run: `cd /tmp/a4 && python3 analyze.py && python3 final.py && python3 stats.py && python3 gen.py`.
- GitHub secondary rate limits cut the first closed-unmerged fetch off at 201 rows. I re-fetched in two date slices (`created:<2026-07-21`, and the earlier run for `>=2026-07-21`) and checked the sum: 639 + 200 = 839, equal to GitHub's own total for the `-author:thedotmack` query (839). One oddity: the same search with `author:thedotmack` returns 199, and 839 + 199 = 1,038, not 978. See UNVERIFIED.
- "Closed unmerged" does not mean "rejected". Three declined PRs I read were closed because the maintainer re-did the work: #589 closed in favour of #913 (same flag, no build artefacts); #2908 (Kimi) closed as superseded and ported in merged #3547; #1246 (branch-scoped memory) closed in a backlog pass and refiled as issue #2038. I did not read the close reason of the other ~470 rows.

## 1. PRs analysed that signal a user need

Columns: PR | author type | state | created date | what the user wanted | category.

| PR | Author | State | Date | What the user wanted | Category |
|---|---|---|---|---|---|
| [#6](https://github.com/thedotmack/claude-mem/pull/6) | external | closed unmerged | 2025-10-14 | Wanted: Fix missing @anthropic-ai/claude-agent-sdk dependency in hooks. | capture/hooks |
| [#34](https://github.com/thedotmack/claude-mem/pull/34) | external | closed unmerged | 2025-10-28 | Wanted: Add memory-dump hook: SessionStart persistence to /workspace/.claude/…. | storage/sync |
| [#56](https://github.com/thedotmack/claude-mem/pull/56) | external | closed unmerged | 2025-11-05 | Wanted this problem fixed: FTS5 session_summaries_fts Table Not Created. | search/retrieval quality |
| [#83](https://github.com/thedotmack/claude-mem/pull/83) | external | closed unmerged | 2025-11-10 | Wanted this problem fixed: handle PM2 race condition in worker restart. | reliability/bugfix |
| [#105](https://github.com/thedotmack/claude-mem/pull/105) | external | closed unmerged | 2025-11-13 | Wanted: Real-Time Context Injection with Recursive Storage Prevention. | search/retrieval quality |
| [#139](https://github.com/thedotmack/claude-mem/pull/139) | maintainer | closed unmerged | 2025-11-20 | Wanted: 🚀 Endless Mode: Infinite Claude Sessions Through Real-Time Context Compression. | capture/hooks |
| [#201](https://github.com/thedotmack/claude-mem/pull/201) | maintainer | merged | 2025-12-09 | Wanted: Settings centralization and new-hook HTTP refactor. | capture/hooks |
| [#212](https://github.com/thedotmack/claude-mem/pull/212) | external | closed unmerged | 2025-12-10 | Wanted this problem fixed: quote paths in hooks.json for Windows usernames with spaces. | capture/hooks |
| [#230](https://github.com/thedotmack/claude-mem/pull/230) | external | closed unmerged | 2025-12-11 | Wanted: Add support multi language. | i18n |
| [#234](https://github.com/thedotmack/claude-mem/pull/234) | external | closed unmerged | 2025-12-11 | Wanted: Rename package from 'claude-mem' to 'claude-meme'. | other |
| [#236](https://github.com/thedotmack/claude-mem/pull/236) | external | closed unmerged | 2025-12-11 | Wanted: default worker to localhost-only binding. | privacy/redaction |
| [#242](https://github.com/thedotmack/claude-mem/pull/242) | maintainer | closed unmerged | 2025-12-11 | Wanted: Replace PM2 with Bun-native process management. | reliability/bugfix |
| [#265](https://github.com/thedotmack/claude-mem/pull/265) | external | merged | 2025-12-13 | Wanted this problem fixed: add npm fallback when bun install fails with alias packages. | other |
| [#315](https://github.com/thedotmack/claude-mem/pull/315) | external | closed unmerged | 2025-12-15 | Wanted this problem fixed: Hide SDK subprocess console window on Windows. | reliability/bugfix |
| [#323](https://github.com/thedotmack/claude-mem/pull/323) | external | closed unmerged | 2025-12-15 | Wanted: [Feat] Add <fresh-session> tag to skip context injection. | privacy/redaction |
| [#332](https://github.com/thedotmack/claude-mem/pull/332) | external | closed unmerged | 2025-12-15 | Wanted this problem fixed: export/import scripts now use API instead of direct DB access. | storage/sync |
| [#334](https://github.com/thedotmack/claude-mem/pull/334) | external | closed unmerged | 2025-12-15 | Wanted: Port opencode plugin 226549446602792139. | new tool integration |
| [#335](https://github.com/thedotmack/claude-mem/pull/335) | external | closed unmerged | 2025-12-16 | Wanted: add queue monitoring UI and fix Windows reliability issues. | UI |
| [#370](https://github.com/thedotmack/claude-mem/pull/370) | external | closed unmerged | 2025-12-17 | Wanted: 日本語ローカライゼーション. | i18n |
| [#386](https://github.com/thedotmack/claude-mem/pull/386) | external | closed unmerged | 2025-12-19 | Wanted this problem fixed: add resume to SessionStart hook matcher. | capture/hooks |
| [#387](https://github.com/thedotmack/claude-mem/pull/387) | external | closed unmerged | 2025-12-19 | Wanted: Fix SessionStart hook error by using documented exit codes. | capture/hooks |
| [#388](https://github.com/thedotmack/claude-mem/pull/388) | external | closed unmerged | 2025-12-19 | Wanted this problem fixed: enable worker logging on Windows. | install/platform |
| [#398](https://github.com/thedotmack/claude-mem/pull/398) | external | closed unmerged | 2025-12-20 | Wanted: add language setting for observation output. | i18n |
| [#432](https://github.com/thedotmack/claude-mem/pull/432) | external | closed unmerged | 2025-12-24 | Wanted: Sync/upstream v8.0.6. | storage/sync |
| [#434](https://github.com/thedotmack/claude-mem/pull/434) | external | closed unmerged | 2025-12-24 | Wanted: add project exclusion support with glob pattern matching. | privacy/redaction |
| [#448](https://github.com/thedotmack/claude-mem/pull/448) | external | closed unmerged | 2025-12-26 | Wanted: Add OpenRouter provider support for multi-model LLM access. | cost/models |
| [#464](https://github.com/thedotmack/claude-mem/pull/464) | external | closed unmerged | 2025-12-28 | Wanted: Sleep Agent Pipeline with StatusLine and Context Improvements. | other |
| [#470](https://github.com/thedotmack/claude-mem/pull/470) | maintainer | closed unmerged | 2025-12-28 | Wanted: Fix Windows worker stability issues. | reliability/bugfix |
| [#472](https://github.com/thedotmack/claude-mem/pull/472) | external | closed unmerged | 2025-12-28 | Wanted this problem fixed: resolve context inject race condition. | search/retrieval quality |
| [#473](https://github.com/thedotmack/claude-mem/pull/473) | external | closed unmerged | 2025-12-28 | Wanted: Add Janus context routes for cross-device memory access. | storage/sync |
| [#474](https://github.com/thedotmack/claude-mem/pull/474) | external | closed unmerged | 2025-12-28 | Wanted this problem fixed: prevent libuv assertion failure in smart-install.js. | install/platform |
| [#486](https://github.com/thedotmack/claude-mem/pull/486) | external | closed unmerged | 2025-12-29 | Wanted: Remove file-based locking and improve Windows stability. | install/platform |
| [#498](https://github.com/thedotmack/claude-mem/pull/498) | external | closed unmerged | 2025-12-30 | Wanted this problem fixed: capture and pass messages to summarize. | new tool integration |
| [#512](https://github.com/thedotmack/claude-mem/pull/512) | external | closed unmerged | 2026-01-01 | Wanted: add openai-compatible profiles and context budgeting. | cost/models |
| [#513](https://github.com/thedotmack/claude-mem/pull/513) | external | closed unmerged | 2026-01-01 | Wanted: Add Persian (فارسی) translation and update language links in multiple…. | i18n |
| [#523](https://github.com/thedotmack/claude-mem/pull/523) | external | closed unmerged | 2026-01-02 | Wanted this problem fixed: add retry logic for transient network errors. | capture/hooks |
| [#530](https://github.com/thedotmack/claude-mem/pull/530) | external | closed unmerged | 2026-01-03 | Wanted this problem fixed: add retry logic with exponential backoff to hook fetch calls. | capture/hooks |
| [#537](https://github.com/thedotmack/claude-mem/pull/537) | external | closed unmerged | 2026-01-04 | Wanted this problem fixed: disable minifyIdentifiers to prevent variable name collisions. | privacy/redaction |
| [#540](https://github.com/thedotmack/claude-mem/pull/540) | external | closed unmerged | 2026-01-04 | Wanted: use bun instead of node for all hook commands. | capture/hooks |
| [#541](https://github.com/thedotmack/claude-mem/pull/541) | external | closed unmerged | 2026-01-04 | Wanted this problem fixed: remove SessionStart matcher blocking context injection. | search/retrieval quality |
| [#554](https://github.com/thedotmack/claude-mem/pull/554) | maintainer | closed unmerged | 2026-01-05 | Wanted: integrate live context, worktree filtering, and logging improvements. | storage/sync |
| [#556](https://github.com/thedotmack/claude-mem/pull/556) | maintainer | merged | 2026-01-05 | Wanted: Live Context System with Distributed CLAUDE.md Generation. | capture/hooks |
| [#580](https://github.com/thedotmack/claude-mem/pull/580) | external | closed unmerged | 2026-01-06 | Wanted this problem fixed: cleanup orphaned SDK subagent processes on worker startup. | reliability/bugfix |
| [#589](https://github.com/thedotmack/claude-mem/pull/589) | external | closed unmerged | 2026-01-07 | Wanted this problem fixed: implement CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED feature flag. | capture/hooks |
| [#604](https://github.com/thedotmack/claude-mem/pull/604) | external | closed unmerged | 2026-01-07 | Wanted: add git-aware project identity for worktree support. | storage/sync |
| [#605](https://github.com/thedotmack/claude-mem/pull/605) | external | closed unmerged | 2026-01-07 | Wanted this problem fixed: cleanup orphaned SDK subagent processes on worker startup. | reliability/bugfix |
| [#608](https://github.com/thedotmack/claude-mem/pull/608) | external | closed unmerged | 2026-01-07 | Wanted: multi-project ChromaSync + fix: cleanup leaked SDK processes. | storage/sync |
| [#610](https://github.com/thedotmack/claude-mem/pull/610) | maintainer | closed unmerged | 2026-01-08 | Wanted this problem fixed: Update hooks for Claude Code 2.1.0/1 - SessionStart no longer shows user messages. | capture/hooks |
| [#644](https://github.com/thedotmack/claude-mem/pull/644) | external | closed unmerged | 2026-01-09 | Wanted: Add OpenAI provider support with memorySessionId fallback. | cost/models |
| [#656](https://github.com/thedotmack/claude-mem/pull/656) | external | closed unmerged | 2026-01-10 | Wanted this problem fixed: prevent orphaned SDK subprocesses after query loop. | reliability/bugfix |
| [#660](https://github.com/thedotmack/claude-mem/pull/660) | external | closed unmerged | 2026-01-10 | Wanted: add network mode for multi-agent deployments. | storage/sync |
| [#662](https://github.com/thedotmack/claude-mem/pull/662) | external | closed unmerged | 2026-01-10 | Wanted: add save_memory tool for manual memory storage. | UI |
| [#672](https://github.com/thedotmack/claude-mem/pull/672) | external | closed unmerged | 2026-01-11 | Wanted this problem fixed: honor folder CLAUDE.md toggle. | capture/hooks |
| [#680](https://github.com/thedotmack/claude-mem/pull/680) | external | closed unmerged | 2026-01-11 | Wanted: multi-model configuration with automatic fallback. | cost/models |
| [#682](https://github.com/thedotmack/claude-mem/pull/682) | external | closed unmerged | 2026-01-11 | Wanted this problem fixed: add windowsHide to smart-install.js spawn/exec calls. | install/platform |
| [#687](https://github.com/thedotmack/claude-mem/pull/687) | external | closed unmerged | 2026-01-12 | Wanted this problem fixed: expand orphaned process cleanup to include mcp-server and worker-service. | reliability/bugfix |
| [#693](https://github.com/thedotmack/claude-mem/pull/693) | external | closed unmerged | 2026-01-12 | Wanted this problem fixed: prevent infinite restart loop that causes runaway API costs. | cost/models |
| [#699](https://github.com/thedotmack/claude-mem/pull/699) | external | closed unmerged | 2026-01-13 | Wanted: add folder exclude setting for CLAUDE.md generation. | capture/hooks |
| [#713](https://github.com/thedotmack/claude-mem/pull/713) | external | closed unmerged | 2026-01-15 | Wanted this problem fixed: prevent SDK subprocess accumulation and improve process lifecycle management. | reliability/bugfix |
| [#721](https://github.com/thedotmack/claude-mem/pull/721) | external | closed unmerged | 2026-01-15 | Wanted this problem fixed: use bun runtime and fix hooks directory detection. | new tool integration |
| [#738](https://github.com/thedotmack/claude-mem/pull/738) | external | closed unmerged | 2026-01-17 | Wanted this problem fixed: add subprocess lifecycle cleanup for zombie haiku agents. | reliability/bugfix |
| [#739](https://github.com/thedotmack/claude-mem/pull/739) | external | closed unmerged | 2026-01-17 | Wanted this problem fixed: prevent orphaned Claude/chroma-mcp process accumulation with periodic cleanup. | reliability/bugfix |
| [#741](https://github.com/thedotmack/claude-mem/pull/741) | external | closed unmerged | 2026-01-17 | Wanted this problem fixed: Provider-aware recovery and stale session cleanup (#740). | cost/models |
| [#742](https://github.com/thedotmack/claude-mem/pull/742) | external | closed unmerged | 2026-01-17 | Wanted: Fix zombie process accumulation (Issue #737). | reliability/bugfix |
| [#745](https://github.com/thedotmack/claude-mem/pull/745) | external | closed unmerged | 2026-01-18 | Wanted this problem fixed: use centralized credentials from ~/.claude-mem/.env to prevent API key hijacking. | privacy/redaction |
| [#746](https://github.com/thedotmack/claude-mem/pull/746) | external | closed unmerged | 2026-01-18 | Wanted: add OpenCode platform support. | new tool integration |
| [#765](https://github.com/thedotmack/claude-mem/pull/765) | external | closed unmerged | 2026-01-20 | Wanted this problem fixed: prevent creation of spurious directories for CLAUDE.md files. | capture/hooks |
| [#768](https://github.com/thedotmack/claude-mem/pull/768) | external | closed unmerged | 2026-01-21 | Wanted this problem fixed: set settings file permissions to 0600. | privacy/redaction |
| [#773](https://github.com/thedotmack/claude-mem/pull/773) | external | closed unmerged | 2026-01-22 | Wanted this problem fixed: use /api/health instead of /api/readiness in hook health checks. | capture/hooks |
| [#774](https://github.com/thedotmack/claude-mem/pull/774) | external | closed unmerged | 2026-01-22 | Wanted this problem fixed: use /api/health instead of /api/readiness in hook health checks. | capture/hooks |
| [#777](https://github.com/thedotmack/claude-mem/pull/777) | external | closed unmerged | 2026-01-22 | Wanted: introduce /recall skill for reliable memory retrieval. | search/retrieval quality |
| [#786](https://github.com/thedotmack/claude-mem/pull/786) | external | closed unmerged | 2026-01-23 | Wanted: add GLM provider and custom Anthropic-compatible API support. | cost/models |
| [#795](https://github.com/thedotmack/claude-mem/pull/795) | external | closed unmerged | 2026-01-25 | Wanted this problem fixed: harden logging, add error visibility, and prevent tight loops. | privacy/redaction |
| [#796](https://github.com/thedotmack/claude-mem/pull/796) | external | closed unmerged | 2026-01-25 | Wanted: add worker auto-restart on connection failure. | reliability/bugfix |
| [#797](https://github.com/thedotmack/claude-mem/pull/797) | external | closed unmerged | 2026-01-25 | Wanted this problem fixed: prevent tight loops and reduce log verbosity. | privacy/redaction |
| [#800](https://github.com/thedotmack/claude-mem/pull/800) | external | closed unmerged | 2026-01-25 | Wanted this problem fixed: orphan cleanup system for SDK and Chroma processes. | reliability/bugfix |
| [#804](https://github.com/thedotmack/claude-mem/pull/804) | external | closed unmerged | 2026-01-25 | Wanted this problem fixed: CLAUDE.md generation improvements (spurious directories + path matching). | capture/hooks |
| [#812](https://github.com/thedotmack/claude-mem/pull/812) | external | closed unmerged | 2026-01-26 | Wanted this problem fixed: restore SessionEnd hook for SDK agent cleanup (Issue #737). | capture/hooks |
| [#819](https://github.com/thedotmack/claude-mem/pull/819) | external | closed unmerged | 2026-01-26 | Wanted: Add Pro cloud sync infrastructure. | storage/sync |
| [#820](https://github.com/thedotmack/claude-mem/pull/820) | external | closed unmerged | 2026-01-27 | Wanted this problem fixed: use /api/health instead of /api/readiness for hook health checks. | capture/hooks |
| [#821](https://github.com/thedotmack/claude-mem/pull/821) | external | closed unmerged | 2026-01-27 | Wanted this problem fixed: prevent stale memory_session_id resume crash after worker restart. | reliability/bugfix |
| [#822](https://github.com/thedotmack/claude-mem/pull/822) | external | closed unmerged | 2026-01-27 | Wanted this problem fixed: correct Gemini model name from gemini-3-flash to gemini-3-flash-preview. | cost/models |
| [#823](https://github.com/thedotmack/claude-mem/pull/823) | external | closed unmerged | 2026-01-27 | Wanted this problem fixed: check CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED setting before generating folder CLAUDE.md files. | capture/hooks |
| [#824](https://github.com/thedotmack/claude-mem/pull/824) | external | closed unmerged | 2026-01-27 | Wanted: Pro cloud sync integration (Supabase + Pinecone). | storage/sync |
| [#829](https://github.com/thedotmack/claude-mem/pull/829) | external | closed unmerged | 2026-01-27 | Wanted this problem fixed: gracefully handle empty prompts in session-init hook. | capture/hooks |
| [#830](https://github.com/thedotmack/claude-mem/pull/830) | external | closed unmerged | 2026-01-27 | Wanted this problem fixed: Chroma stability + additional process management layers. | reliability/bugfix |
| [#831](https://github.com/thedotmack/claude-mem/pull/831) | external | closed unmerged | 2026-01-27 | Wanted this problem fixed: correct Gemini model name from gemini-3-flash to gemini-3-flash-preview. | cost/models |
| [#834](https://github.com/thedotmack/claude-mem/pull/834) | external | closed unmerged | 2026-01-28 | Wanted this problem fixed: detect subdirectories inside git repos to prevent CLAUDE.md pollution. | capture/hooks |
| [#836](https://github.com/thedotmack/claude-mem/pull/836) | external | closed unmerged | 2026-01-28 | Wanted this problem fixed: prevent nested duplicate directory creation in CLAUDE.md paths. | capture/hooks |
| [#837](https://github.com/thedotmack/claude-mem/pull/837) | external | merged | 2026-01-28 | Wanted this problem fixed: isolate observer sessions to prevent polluting claude --resume list. | other |
| [#840](https://github.com/thedotmack/claude-mem/pull/840) | external | closed unmerged | 2026-01-28 | Wanted this problem fixed: replace WMIC with PowerShell Start-Process for Windows 11 25H2+ compatibility. | install/platform |
| [#844](https://github.com/thedotmack/claude-mem/pull/844) | external | closed unmerged | 2026-01-28 | Wanted this problem fixed: add session-complete handler and hook to enable orphan reaper cleanup. | reliability/bugfix |
| [#847](https://github.com/thedotmack/claude-mem/pull/847) | external | closed unmerged | 2026-01-28 | Wanted this problem fixed: comprehensive observer session isolation without breaking auth. | privacy/redaction |
| [#848](https://github.com/thedotmack/claude-mem/pull/848) | external | closed unmerged | 2026-01-28 | Wanted this problem fixed: Kill duplicate observer processes to prevent zombie accumulation. | reliability/bugfix |
| [#853](https://github.com/thedotmack/claude-mem/pull/853) | external | closed unmerged | 2026-01-29 | Wanted: Pro cloud sync integration (Supabase + Pinecone). | storage/sync |
| [#854](https://github.com/thedotmack/claude-mem/pull/854) | external | closed unmerged | 2026-01-30 | Wanted: Pro cloud sync integration with Supabase + Pinecone. | storage/sync |
| [#860](https://github.com/thedotmack/claude-mem/pull/860) | external | closed unmerged | 2026-01-31 | Wanted: add Clawdbot/moltbot environment detection and compatibility mode. | new tool integration |
| [#861](https://github.com/thedotmack/claude-mem/pull/861) | external | closed unmerged | 2026-01-31 | Wanted this problem fixed: add idle timeout with abort to prevent zombie observer processes. | reliability/bugfix |
| [#866](https://github.com/thedotmack/claude-mem/pull/866) | external | closed unmerged | 2026-02-01 | Wanted this problem fixed: reduce startup process bomb from processPendingQueues. | cost/models |
| [#867](https://github.com/thedotmack/claude-mem/pull/867) | external | closed unmerged | 2026-02-01 | Wanted this problem fixed: prevent process bomb and zombie observers on startup. | reliability/bugfix |
| [#875](https://github.com/thedotmack/claude-mem/pull/875) | external | closed unmerged | 2026-02-02 | Wanted: add CLAUDE_MEM_DISABLE_SUBDIRECTORY_CLAUDE_MD setting. | capture/hooks |
| [#879](https://github.com/thedotmack/claude-mem/pull/879) | external | closed unmerged | 2026-02-02 | Wanted this problem fixed: add daemon children cleanup to orphan reaper. | reliability/bugfix |
| [#884](https://github.com/thedotmack/claude-mem/pull/884) | external | closed unmerged | 2026-02-02 | Wanted this problem fixed: add Zscaler SSL certificate support for ChromaDB vector search. | search/retrieval quality |
| [#889](https://github.com/thedotmack/claude-mem/pull/889) | external | closed unmerged | 2026-02-02 | Wanted this problem fixed: prevent FK constraint failures on worker restart. | reliability/bugfix |
| [#905](https://github.com/thedotmack/claude-mem/pull/905) | external | closed unmerged | 2026-02-03 | Wanted this problem fixed: remove user-message hook from SessionStart to prevent startup error. | capture/hooks |
| [#907](https://github.com/thedotmack/claude-mem/pull/907) | external | merged | 2026-02-03 | Wanted: i18n: add Traditional Chinese (zh-TW) README translation. | other |
| [#908](https://github.com/thedotmack/claude-mem/pull/908) | external | closed unmerged | 2026-02-03 | Wanted: add windows note for npm not recongnized error. | other |
| [#910](https://github.com/thedotmack/claude-mem/pull/910) | external | closed unmerged | 2026-02-03 | Wanted this problem fixed: complete stateless provider support with enhanced validation (completes #817 for Gemini/OpenRouter). | cost/models |
| [#913](https://github.com/thedotmack/claude-mem/pull/913) | external | closed unmerged | 2026-02-04 | Wanted this problem fixed: respect CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED setting. | capture/hooks |
| [#920](https://github.com/thedotmack/claude-mem/pull/920) | external | closed unmerged | 2026-02-04 | Wanted: add project exclusion setting. | privacy/redaction |
| [#922](https://github.com/thedotmack/claude-mem/pull/922) | external | closed unmerged | 2026-02-04 | Wanted this problem fixed: add async:true to SessionStart hooks to prevent termina…. | storage/sync |
| [#926](https://github.com/thedotmack/claude-mem/pull/926) | external | closed unmerged | 2026-02-04 | Wanted: Fix CORS misconfiguration allowing cross-site data exfiltration. | privacy/redaction |
| [#929](https://github.com/thedotmack/claude-mem/pull/929) | external | closed unmerged | 2026-02-04 | Wanted: Prevent CLAUDE.md generation in Android res/ and other unsafe directories. | capture/hooks |
| [#930](https://github.com/thedotmack/claude-mem/pull/930) | external | closed unmerged | 2026-02-04 | Wanted: Fix blocking startup by deferring worker initialization. | other |
| [#931](https://github.com/thedotmack/claude-mem/pull/931) | external | closed unmerged | 2026-02-04 | Wanted: Prevent repeated worker spawn popups on Windows when startup fails. | install/platform |
| [#933](https://github.com/thedotmack/claude-mem/pull/933) | external | closed unmerged | 2026-02-04 | Wanted this problem fixed: replace deprecated wmic worker spawn with child_proces spawn. | install/platform |
| [#935](https://github.com/thedotmack/claude-mem/pull/935) | external | closed unmerged | 2026-02-04 | Wanted this problem fixed: guard ProcessTransport writes on Windows startup. | install/platform |
| [#937](https://github.com/thedotmack/claude-mem/pull/937) | external | closed unmerged | 2026-02-04 | Wanted this problem fixed: gracefully process orphaned pending messages after session termination. | reliability/bugfix |
| [#940](https://github.com/thedotmack/claude-mem/pull/940) | external | closed unmerged | 2026-02-04 | Wanted this problem fixed: Backfill project field on SDK session creation. | storage/sync |
| [#964](https://github.com/thedotmack/claude-mem/pull/964) | external | closed unmerged | 2026-02-05 | Wanted: Add fetch timeouts to Stop hook and health checks. | capture/hooks |
| [#968](https://github.com/thedotmack/claude-mem/pull/968) | external | closed unmerged | 2026-02-05 | Wanted: Migrate from SQLite to memU hierarchical memory backend. | storage/sync |
| [#972](https://github.com/thedotmack/claude-mem/pull/972) | external | closed unmerged | 2026-02-05 | Wanted: Fix Windows path handling for usernames with spaces. | install/platform |
| [#974](https://github.com/thedotmack/claude-mem/pull/974) | external | closed unmerged | 2026-02-05 | Wanted this problem fixed: prevent race condition when editing CLAUDE.md (#859). | capture/hooks |
| [#988](https://github.com/thedotmack/claude-mem/pull/988) | external | closed unmerged | 2026-02-06 | Wanted this problem fixed: validate and restrict /api/instructions operation and topic params (CWE-22, CWE-1321). | privacy/redaction |
| [#989](https://github.com/thedotmack/claude-mem/pull/989) | external | closed unmerged | 2026-02-06 | Wanted this problem fixed: FK constraint violations in GeminiAgent, OpenRouterAgent, and ResponseProcessor. | cost/models |
| [#991](https://github.com/thedotmack/claude-mem/pull/991) | external | closed unmerged | 2026-02-06 | Wanted: add CLAUDE_MEM_CHROMA_DISABLED setting. | privacy/redaction |
| [#993](https://github.com/thedotmack/claude-mem/pull/993) | external | closed unmerged | 2026-02-06 | Wanted: ChromaSync connection timeout + async mutex. | storage/sync |
| [#994](https://github.com/thedotmack/claude-mem/pull/994) | external | closed unmerged | 2026-02-06 | Wanted: Chroma health watchdog + isConnected() accessor. | reliability/bugfix |
| [#996](https://github.com/thedotmack/claude-mem/pull/996) | external | closed unmerged | 2026-02-06 | Wanted this problem fixed: preserve synthetic memorySessionId for stateless providers across worker restarts. | reliability/bugfix |
| [#1006](https://github.com/thedotmack/claude-mem/pull/1006) | external | closed unmerged | 2026-02-07 | Wanted this problem fixed: Windows platform improvements — re-enable Chroma, migrate WMIC, simplify env isolation. | install/platform |
| [#1008](https://github.com/thedotmack/claude-mem/pull/1008) | external | closed unmerged | 2026-02-07 | Wanted this problem fixed: prevent unbounded Claude subprocess spawning in worker daemon. | reliability/bugfix |
| [#1012](https://github.com/thedotmack/claude-mem/pull/1012) | maintainer | merged | 2026-02-07 | Wanted: Official OpenClaw plugin for Claude-Mem. | new tool integration |
| [#1016](https://github.com/thedotmack/claude-mem/pull/1016) | external | closed unmerged | 2026-02-08 | Wanted: support system environment variables for API credentials. | privacy/redaction |
| [#1017](https://github.com/thedotmack/claude-mem/pull/1017) | external | closed unmerged | 2026-02-08 | Wanted this problem fixed: SDK Agent fails on Windows when username contains spaces. | install/platform |
| [#1018](https://github.com/thedotmack/claude-mem/pull/1018) | external | closed unmerged | 2026-02-08 | Wanted: support system environment variables for API credentials. | privacy/redaction |
| [#1019](https://github.com/thedotmack/claude-mem/pull/1019) | external | closed unmerged | 2026-02-08 | Wanted: support system environment variables for API credentials. | privacy/redaction |
| [#1020](https://github.com/thedotmack/claude-mem/pull/1020) | external | closed unmerged | 2026-02-08 | Wanted this problem fixed: SDK Agent fails on Windows when username contains spaces. | install/platform |
| [#1021](https://github.com/thedotmack/claude-mem/pull/1021) | external | closed unmerged | 2026-02-08 | Wanted this problem fixed: SDK Agent fails on Windows when username contains spaces. | install/platform |
| [#1055](https://github.com/thedotmack/claude-mem/pull/1055) | external | closed unmerged | 2026-02-10 | Wanted: Add worker idle auto-shutdown with configurable timeout. | reliability/bugfix |
| [#1064](https://github.com/thedotmack/claude-mem/pull/1064) | external | closed unmerged | 2026-02-11 | Wanted: sync imported observations to Chroma vector DB. | storage/sync |
| [#1072](https://github.com/thedotmack/claude-mem/pull/1072) | external | closed unmerged | 2026-02-12 | Wanted this problem fixed: add error handling to prevent Stop hook failures from package.json read errors. | capture/hooks |
| [#1076](https://github.com/thedotmack/claude-mem/pull/1076) | maintainer | merged | 2026-02-12 | Wanted: Add OpenClaw one-liner installer script with comprehensive test suite. | other |
| [#1078](https://github.com/thedotmack/claude-mem/pull/1078) | external | closed unmerged | 2026-02-12 | Wanted: Título: Add Spanish translations and Windows improvementsAdd Spanish translations and Windows improvements. | i18n |
| [#1086](https://github.com/thedotmack/claude-mem/pull/1086) | external | merged | 2026-02-13 | Wanted this problem fixed: spawn worker with Bun runtime instead of Node. | install/platform |
| [#1087](https://github.com/thedotmack/claude-mem/pull/1087) | external | merged | 2026-02-13 | Wanted this problem fixed: remove obsolete cursor-hooks install precheck. | new tool integration |
| [#1092](https://github.com/thedotmack/claude-mem/pull/1092) | external | closed unmerged | 2026-02-13 | Wanted this problem fixed: harden OpenClaw integration, auth chain, and SSE stability. | new tool integration |
| [#1101](https://github.com/thedotmack/claude-mem/pull/1101) | external | closed unmerged | 2026-02-14 | Wanted: interactive feed setup wizard and standalone daemon. | UI |
| [#1109](https://github.com/thedotmack/claude-mem/pull/1109) | external | closed unmerged | 2026-02-15 | Wanted: Fix OpenClaw plugin discovery and Telegram command names. | new tool integration |
| [#1111](https://github.com/thedotmack/claude-mem/pull/1111) | external | closed unmerged | 2026-02-15 | Wanted: Add ChromaDB vector index backfill script. | storage/sync |
| [#1112](https://github.com/thedotmack/claude-mem/pull/1112) | external | merged | 2026-02-15 | Wanted this problem fixed: include project in ChromaDB where clause for vector search. | search/retrieval quality |
| [#1114](https://github.com/thedotmack/claude-mem/pull/1114) | external | closed unmerged | 2026-02-15 | Wanted: Rename Telegram bot commands from hyphens to underscores. | new tool integration |
| [#1121](https://github.com/thedotmack/claude-mem/pull/1121) | external | closed unmerged | 2026-02-15 | Wanted: Fix FK constraint failure on session compaction/resume. | performance |
| [#1129](https://github.com/thedotmack/claude-mem/pull/1129) | external | closed unmerged | 2026-02-16 | Wanted: add generic session backfill script. | storage/sync |
| [#1134](https://github.com/thedotmack/claude-mem/pull/1134) | external | closed unmerged | 2026-02-16 | Wanted: add lazy reconnect when vector search is requested. | search/retrieval quality |
| [#1147](https://github.com/thedotmack/claude-mem/pull/1147) | external | closed unmerged | 2026-02-17 | Wanted this problem fixed: prevent stuck processing messages and permanent spinner (#1052). | reliability/bugfix |
| [#1157](https://github.com/thedotmack/claude-mem/pull/1157) | maintainer | closed unmerged | 2026-02-18 | Wanted: Security hardening: auth, permissions, sanitization, provenance. | privacy/redaction |
| [#1164](https://github.com/thedotmack/claude-mem/pull/1164) | external | closed unmerged | 2026-02-18 | Wanted this problem fixed: bound conversation history + lower Chroma embed footprint. | performance |
| [#1169](https://github.com/thedotmack/claude-mem/pull/1169) | external | closed unmerged | 2026-02-18 | Wanted this problem fixed: deduplicate session-init to prevent redundant re-initialization. | search/retrieval quality |
| [#1171](https://github.com/thedotmack/claude-mem/pull/1171) | external | closed unmerged | 2026-02-18 | Wanted this problem fixed: restore .claude-plugin metadata for marketplace install. | install/platform |
| [#1177](https://github.com/thedotmack/claude-mem/pull/1177) | external | closed unmerged | 2026-02-18 | Wanted: add OpenAI Codex OAuth provider for observation extraction. | cost/models |
| [#1180](https://github.com/thedotmack/claude-mem/pull/1180) | external | closed unmerged | 2026-02-19 | Wanted this problem fixed: detect auth errors and prevent infinite retry loops. | privacy/redaction |
| [#1186](https://github.com/thedotmack/claude-mem/pull/1186) | external | closed unmerged | 2026-02-19 | Wanted: Litestream cloud backup integration for SQLite database. | storage/sync |
| [#1189](https://github.com/thedotmack/claude-mem/pull/1189) | external | closed unmerged | 2026-02-19 | Wanted: add Claude model selection to installer + update default to Sonnet 4.6. | install/platform |
| [#1191](https://github.com/thedotmack/claude-mem/pull/1191) | external | closed unmerged | 2026-02-20 | Wanted this problem fixed: use 'uvx' instead of 'uvx.cmd' for chroma-mcp spawn on Windows. | reliability/bugfix |
| [#1198](https://github.com/thedotmack/claude-mem/pull/1198) | external | closed unmerged | 2026-02-21 | Wanted this problem fixed: migrate from bun:sqlite to better-sqlite3. | storage/sync |
| [#1207](https://github.com/thedotmack/claude-mem/pull/1207) | external | closed unmerged | 2026-02-22 | Wanted: add GitHub Copilot provider. | cost/models |
| [#1211](https://github.com/thedotmack/claude-mem/pull/1211) | external | closed unmerged | 2026-02-23 | Wanted this problem fixed: Windows paths with spaces crash worker startup and chroma-mcp connection. | reliability/bugfix |
| [#1222](https://github.com/thedotmack/claude-mem/pull/1222) | external | closed unmerged | 2026-02-24 | Wanted this problem fixed: redirect stdin from /dev/null for 'start' hook commands. | capture/hooks |
| [#1223](https://github.com/thedotmack/claude-mem/pull/1223) | external | closed unmerged | 2026-02-24 | Wanted this problem fixed: resolve plugin root for Stop hooks without CLAUDE_PLUGIN_ROOT. | capture/hooks |
| [#1227](https://github.com/thedotmack/claude-mem/pull/1227) | external | closed unmerged | 2026-02-24 | Wanted this problem fixed: resolve plugin root for all hooks without CLAUDE_PLUGIN_ROOT. | capture/hooks |
| [#1230](https://github.com/thedotmack/claude-mem/pull/1230) | external | closed unmerged | 2026-02-25 | Wanted: add registry UI and raw multi-provider session browsing. | cost/models |
| [#1233](https://github.com/thedotmack/claude-mem/pull/1233) | external | closed unmerged | 2026-02-25 | Wanted: add OpenCode platform integration with SDK agent and plugin installer. | new tool integration |
| [#1246](https://github.com/thedotmack/claude-mem/pull/1246) | maintainer | closed unmerged | 2026-02-26 | Wanted: branch-scoped memory with git ancestry filtering. | storage/sync |
| [#1254](https://github.com/thedotmack/claude-mem/pull/1254) | external | closed unmerged | 2026-02-26 | Wanted this problem fixed: smart-install.js non-JSON stdout causes SessionStart hook error. | capture/hooks |
| [#1257](https://github.com/thedotmack/claude-mem/pull/1257) | external | closed unmerged | 2026-02-27 | Wanted: temporal scoring, staleness tracking, and drift detection. | search/retrieval quality |
| [#1258](https://github.com/thedotmack/claude-mem/pull/1258) | maintainer | closed unmerged | 2026-02-27 | Wanted: npx claude-mem — unified CLI with 13 IDE integrations. | install/platform |
| [#1264](https://github.com/thedotmack/claude-mem/pull/1264) | external | closed unmerged | 2026-02-28 | Wanted this problem fixed: handle missing transcript in git worktrees. | storage/sync |
| [#1275](https://github.com/thedotmack/claude-mem/pull/1275) | external | closed unmerged | 2026-03-02 | Wanted: hub mode — file-path-based project detection for multi-repo vaults. | storage/sync |
| [#1282](https://github.com/thedotmack/claude-mem/pull/1282) | external | closed unmerged | 2026-03-03 | Wanted this problem fixed: remove parallel hook groups causing 'Sibling tool call errored' (v10.5.3). | capture/hooks |
| [#1295](https://github.com/thedotmack/claude-mem/pull/1295) | external | closed unmerged | 2026-03-07 | Wanted this problem fixed: fix worker startup race condition in installer. | new tool integration |
| [#1298](https://github.com/thedotmack/claude-mem/pull/1298) | external | closed unmerged | 2026-03-08 | Wanted: use git root for consistent project name detection. | storage/sync |
| [#1301](https://github.com/thedotmack/claude-mem/pull/1301) | external | closed unmerged | 2026-03-08 | Wanted this problem fixed: harden hook fallback and MCP node resolution. | other |
| [#1304](https://github.com/thedotmack/claude-mem/pull/1304) | external | closed unmerged | 2026-03-08 | Wanted: VS Code MCP integration with partner agent support. | new tool integration |
| [#1306](https://github.com/thedotmack/claude-mem/pull/1306) | external | closed unmerged | 2026-03-09 | Wanted this problem fixed: handle missing session_id when Cursor runs claude-code hooks. | new tool integration |
| [#1309](https://github.com/thedotmack/claude-mem/pull/1309) | maintainer | closed unmerged | 2026-03-09 | Wanted: add Cowork compatibility, /mode command, and make-mode skill. | new tool integration |
| [#1310](https://github.com/thedotmack/claude-mem/pull/1310) | external | closed unmerged | 2026-03-09 | Wanted this problem fixed: avoid /dev/tty crash in --non-interactive and handle allowlist bootstrap. | new tool integration |
| [#1319](https://github.com/thedotmack/claude-mem/pull/1319) | external | closed unmerged | 2026-03-09 | Wanted: add workspace-based memory isolation. | storage/sync |
| [#1321](https://github.com/thedotmack/claude-mem/pull/1321) | external | closed unmerged | 2026-03-09 | Wanted: per-project disable/exclude functionality. | privacy/redaction |
| [#1333](https://github.com/thedotmack/claude-mem/pull/1333) | external | closed unmerged | 2026-03-11 | Wanted: add Codex CLI integration with transcript-based memory capture. | new tool integration |
| [#1338](https://github.com/thedotmack/claude-mem/pull/1338) | external | closed unmerged | 2026-03-12 | Wanted: add MiniMax provider with M2.7 as default model. | cost/models |
| [#1349](https://github.com/thedotmack/claude-mem/pull/1349) | external | closed unmerged | 2026-03-13 | Wanted: display model name on observation/summary cards. | UI |
| [#1350](https://github.com/thedotmack/claude-mem/pull/1350) | external | closed unmerged | 2026-03-13 | Wanted: add iFlow CLI support. | new tool integration |
| [#1353](https://github.com/thedotmack/claude-mem/pull/1353) | external | closed unmerged | 2026-03-13 | Wanted this problem fixed: detect parent process death via stdin EOF to prevent MCP server leaks. | other |
| [#1354](https://github.com/thedotmack/claude-mem/pull/1354) | external | closed unmerged | 2026-03-13 | Wanted this problem fixed: unset CLAUDECODE env var when spawning worker daemon from hooks. | capture/hooks |
| [#1355](https://github.com/thedotmack/claude-mem/pull/1355) | external | closed unmerged | 2026-03-13 | Wanted: add iFlow CLI support. | new tool integration |
| [#1358](https://github.com/thedotmack/claude-mem/pull/1358) | external | closed unmerged | 2026-03-13 | Wanted this problem fixed: point Setup hook to smart-install.js instead of deleted setup.sh (#1268). | UI |
| [#1363](https://github.com/thedotmack/claude-mem/pull/1363) | external | closed unmerged | 2026-03-14 | Wanted this problem fixed: resolve UserPromptSubmit hook error on new session startup. | capture/hooks |
| [#1372](https://github.com/thedotmack/claude-mem/pull/1372) | external | closed unmerged | 2026-03-16 | Wanted this problem fixed: close transport before nulling to prevent subprocess leak. | reliability/bugfix |
| [#1376](https://github.com/thedotmack/claude-mem/pull/1376) | external | closed unmerged | 2026-03-16 | Wanted this problem fixed: align OpenCode plugin with @opencode-ai/plugin SDK v1.2.x. | new tool integration |
| [#1379](https://github.com/thedotmack/claude-mem/pull/1379) | external | closed unmerged | 2026-03-17 | Wanted this problem fixed: handle plugins.allow chicken-and-egg problem. | install/platform |
| [#1387](https://github.com/thedotmack/claude-mem/pull/1387) | external | closed unmerged | 2026-03-17 | Wanted this problem fixed: auto-detect Cursor context from cursor_version in hook input. | new tool integration |
| [#1393](https://github.com/thedotmack/claude-mem/pull/1393) | external | closed unmerged | 2026-03-18 | Wanted: delete observations via MCP tool, CLI, HTTP API, and viewer UI (Issue #1292). | UI |
| [#1394](https://github.com/thedotmack/claude-mem/pull/1394) | external | closed unmerged | 2026-03-18 | Wanted this problem fixed: add explicit inputSchema properties for search and timeline MCP tools. | other |
| [#1403](https://github.com/thedotmack/claude-mem/pull/1403) | external | closed unmerged | 2026-03-19 | Wanted this problem fixed: stop hook graceful degradation — prevent session exit blocking. | capture/hooks |
| [#1404](https://github.com/thedotmack/claude-mem/pull/1404) | external | closed unmerged | 2026-03-19 | Wanted: support AWS Bedrock model routing in SDKAgent and env sanitizer. | cost/models |
| [#1406](https://github.com/thedotmack/claude-mem/pull/1406) | external | closed unmerged | 2026-03-19 | Wanted: add block-no-verify hook for Claude Code and Cursor. | new tool integration |
| [#1407](https://github.com/thedotmack/claude-mem/pull/1407) | external | closed unmerged | 2026-03-19 | Wanted this problem fixed: remove Setup hook referencing deleted setup.sh. | UI |
| [#1409](https://github.com/thedotmack/claude-mem/pull/1409) | external | closed unmerged | 2026-03-19 | Wanted this problem fixed: Windows daemon fails to start — isMainModule detection broken. | install/platform |
| [#1414](https://github.com/thedotmack/claude-mem/pull/1414) | external | closed unmerged | 2026-03-20 | Wanted this problem fixed: unified process lifecycle management to prevent zombie processes. | reliability/bugfix |
| [#1417](https://github.com/thedotmack/claude-mem/pull/1417) | external | closed unmerged | 2026-03-20 | Wanted: add openai-compatible and anthropic-compatible provider support. | cost/models |
| [#1418](https://github.com/thedotmack/claude-mem/pull/1418) | external | closed unmerged | 2026-03-20 | Wanted: migrate from bun:sqlite to @libsql/client for team database support. | storage/sync |
| [#1421](https://github.com/thedotmack/claude-mem/pull/1421) | external | closed unmerged | 2026-03-20 | Wanted: add Flashrank reranker microservice for improved search relevance. | search/retrieval quality |
| [#1422](https://github.com/thedotmack/claude-mem/pull/1422) | external | closed unmerged | 2026-03-20 | Wanted: add CLAUDE_MEM_IGNORE_PROMPT_PATTERNS setting to filter noise prompts. | search/retrieval quality |
| [#1427](https://github.com/thedotmack/claude-mem/pull/1427) | external | closed unmerged | 2026-03-21 | Wanted this problem fixed: prevent cold start hook errors from aggressiveStartupCleanup killing parent process. | capture/hooks |
| [#1432](https://github.com/thedotmack/claude-mem/pull/1432) | external | closed unmerged | 2026-03-21 | Wanted: persist ANTHROPIC_BASE_URL in ~/.claude-mem/.env for custom gateway support. | cost/models |
| [#1439](https://github.com/thedotmack/claude-mem/pull/1439) | external | closed unmerged | 2026-03-21 | Wanted: Multi-provider team management, Electron desktop app, and chat UI. | cost/models |
| [#1461](https://github.com/thedotmack/claude-mem/pull/1461) | external | closed unmerged | 2026-03-23 | Wanted: batch-parallel LLM processing for OpenRouterAgent. | cost/models |
| [#1463](https://github.com/thedotmack/claude-mem/pull/1463) | external | closed unmerged | 2026-03-23 | Wanted this problem fixed: use portable model tier aliases to support Bedrock, Vertex, and Azure. | storage/sync |
| [#1474](https://github.com/thedotmack/claude-mem/pull/1474) | external | closed unmerged | 2026-03-24 | Wanted: multi-node network mode — shared instance, security hardening, origin tracking. | storage/sync |
| [#1483](https://github.com/thedotmack/claude-mem/pull/1483) | external | closed unmerged | 2026-03-25 | Wanted: Cross-platform process management for Windows, Linux, and macOS. | reliability/bugfix |
| [#1485](https://github.com/thedotmack/claude-mem/pull/1485) | external | closed unmerged | 2026-03-25 | Wanted this problem fixed: use full path from where/which output on Windows. | install/platform |
| [#1487](https://github.com/thedotmack/claude-mem/pull/1487) | external | closed unmerged | 2026-03-25 | Wanted: add CLAUDE_MEM_DISABLED env var for headless sessions. | privacy/redaction |
| [#1501](https://github.com/thedotmack/claude-mem/pull/1501) | external | closed unmerged | 2026-03-27 | Wanted this problem fixed: replace non-existent setup.sh with smart-install.js in Setup hook. | capture/hooks |
| [#1502](https://github.com/thedotmack/claude-mem/pull/1502) | external | closed unmerged | 2026-03-27 | Wanted this problem fixed: resolve worktree observations to parent repo project name. | storage/sync |
| [#1534](https://github.com/thedotmack/claude-mem/pull/1534) | external | closed unmerged | 2026-03-30 | Wanted this problem fixed: add multi-layer fuzzy dedup to prevent duplicate observations. | search/retrieval quality |
| [#1537](https://github.com/thedotmack/claude-mem/pull/1537) | external | closed unmerged | 2026-03-30 | Wanted this problem fixed: enforce per-agent memory isolation in OpenClaw plugin. | new tool integration |
| [#1541](https://github.com/thedotmack/claude-mem/pull/1541) | external | closed unmerged | 2026-03-30 | Wanted this problem fixed: unify git worktrees under the same project name. | storage/sync |
| [#1542](https://github.com/thedotmack/claude-mem/pull/1542) | external | closed unmerged | 2026-03-30 | Wanted this problem fixed: unify git worktrees under the same project name. | storage/sync |
| [#1543](https://github.com/thedotmack/claude-mem/pull/1543) | external | closed unmerged | 2026-03-31 | Wanted: add CLAUDE_MEM_CHROMA_EMBEDDING_FUNCTION setting for custom embedding models. | search/retrieval quality |
| [#1548](https://github.com/thedotmack/claude-mem/pull/1548) | external | closed unmerged | 2026-03-31 | Wanted: Add CLAUDE.local.md support via CLAUDE_MEM_FOLDER_USE_LOCAL_MD setting. | capture/hooks |
| [#1559](https://github.com/thedotmack/claude-mem/pull/1559) | external | closed unmerged | 2026-04-01 | Wanted: Add MCP server builder skill with implementation guides. | other |
| [#1569](https://github.com/thedotmack/claude-mem/pull/1569) | external | closed unmerged | 2026-04-02 | Wanted: tier routing by queue complexity + observation feedback table. | UI |
| [#1583](https://github.com/thedotmack/claude-mem/pull/1583) | external | closed unmerged | 2026-04-02 | Wanted: share context across all worktrees of the same repo. | storage/sync |
| [#1589](https://github.com/thedotmack/claude-mem/pull/1589) | external | closed unmerged | 2026-04-03 | Wanted: project-aware observation injection for multi-project workflows. | storage/sync |
| [#1592](https://github.com/thedotmack/claude-mem/pull/1592) | maintainer | merged | 2026-04-03 | Wanted: npx CLI, Gemini CLI, and multi-IDE integrations. | cost/models |
| [#1593](https://github.com/thedotmack/claude-mem/pull/1593) | external | closed unmerged | 2026-04-04 | Wanted this problem fixed: add AbortSignal.timeout to isPortInUse on non-Windows platforms. | install/platform |
| [#1594](https://github.com/thedotmack/claude-mem/pull/1594) | external | closed unmerged | 2026-04-04 | Wanted this problem fixed: wrap PowerShell ArgumentList paths in double-quotes to handle spaces. | install/platform |
| [#1599](https://github.com/thedotmack/claude-mem/pull/1599) | external | closed unmerged | 2026-04-04 | Wanted this problem fixed: export PATH in hooks so node resolves on nvm systems. | capture/hooks |
| [#1611](https://github.com/thedotmack/claude-mem/pull/1611) | external | closed unmerged | 2026-04-05 | Wanted this problem fixed: add FTS5 keyword search fallback when ChromaDB is unavailable. | search/retrieval quality |
| [#1618](https://github.com/thedotmack/claude-mem/pull/1618) | external | closed unmerged | 2026-04-06 | Wanted this problem fixed: add 400/401 to FALLBACK_ERROR_PATTERNS to prevent retry loop on auth errors. | privacy/redaction |
| [#1624](https://github.com/thedotmack/claude-mem/pull/1624) | external | closed unmerged | 2026-04-06 | Wanted this problem fixed: move summary wait from Stop hook to worker-side graceful completion. | capture/hooks |
| [#1630](https://github.com/thedotmack/claude-mem/pull/1630) | external | closed unmerged | 2026-04-06 | Wanted: Ollama provider for Claude-Mem. | cost/models |
| [#1639](https://github.com/thedotmack/claude-mem/pull/1639) | external | closed unmerged | 2026-04-07 | Wanted: add get_session MCP tool to resolve memory_session_id to Claude Code session. | other |
| [#1641](https://github.com/thedotmack/claude-mem/pull/1641) | maintainer | merged | 2026-04-07 | Wanted this problem fixed: worker startup crash, missing migration, and merge artifacts. | reliability/bugfix |
| [#1645](https://github.com/thedotmack/claude-mem/pull/1645) | maintainer | merged | 2026-04-07 | Wanted this problem fixed: MCP server crashes with Cannot find module 'bun:sqlite' under Node. | reliability/bugfix |
| [#1653](https://github.com/thedotmack/claude-mem/pull/1653) | maintainer | merged | 2026-04-08 | Wanted: Knowledge Agents — queryable corpora from claude-mem. | other |
| [#1655](https://github.com/thedotmack/claude-mem/pull/1655) | external | closed unmerged | 2026-04-08 | Wanted: add Docker Model Runner for local AI model inference. | cost/models |
| [#1657](https://github.com/thedotmack/claude-mem/pull/1657) | external | closed unmerged | 2026-04-08 | Wanted: v2 — bidirectional merge with WAL-safe transfers. | storage/sync |
| [#1661](https://github.com/thedotmack/claude-mem/pull/1661) | maintainer | closed unmerged | 2026-04-09 | Wanted: Layer 3 transcript storage, TITANS observer, and build fixes. | other |
| [#1669](https://github.com/thedotmack/claude-mem/pull/1669) | external | closed unmerged | 2026-04-09 | Wanted this problem fixed: add code--zh-tw.json mode file for Traditional Chinese (#1364). | i18n |
| [#1672](https://github.com/thedotmack/claude-mem/pull/1672) | external | closed unmerged | 2026-04-10 | Wanted this problem fixed: rename bun-runner.js to .mjs to fix ESM SyntaxError on macOS (fixes #1662). | install/platform |
| [#1682](https://github.com/thedotmack/claude-mem/pull/1682) | external | closed unmerged | 2026-04-10 | Wanted: add transcript backfill for historical Claude Code sessions. | storage/sync |
| [#1687](https://github.com/thedotmack/claude-mem/pull/1687) | external | closed unmerged | 2026-04-10 | Wanted this problem fixed: cap SessionStart additionalContext at 9.5KB to prevent truncation (#1591). | search/retrieval quality |
| [#1689](https://github.com/thedotmack/claude-mem/pull/1689) | external | closed unmerged | 2026-04-10 | Wanted this problem fixed: normalize Windows backslash paths in bun-runner.js (#1281). | install/platform |
| [#1690](https://github.com/thedotmack/claude-mem/pull/1690) | external | closed unmerged | 2026-04-10 | Wanted this problem fixed: sync root .mcp.json from plugin config so MCP server registers (#1471). | storage/sync |
| [#1693](https://github.com/thedotmack/claude-mem/pull/1693) | external | merged | 2026-04-10 | Wanted this problem fixed: session lifecycle guards to prevent runaway API spend (#1590). | cost/models |
| [#1694](https://github.com/thedotmack/claude-mem/pull/1694) | external | closed unmerged | 2026-04-10 | Wanted this problem fixed: resolve cache install path in BranchManager on update (#1497). | performance |
| [#1695](https://github.com/thedotmack/claude-mem/pull/1695) | external | closed unmerged | 2026-04-10 | Wanted this problem fixed: add cache path and PATH export to PreToolUse hook (#1660). | performance |
| [#1696](https://github.com/thedotmack/claude-mem/pull/1696) | external | merged | 2026-04-10 | Wanted this problem fixed: resolve Setup hook broken reference and warn on macOS-only binary (#1547). | capture/hooks |
| [#1698](https://github.com/thedotmack/claude-mem/pull/1698) | external | merged | 2026-04-10 | Wanted this problem fixed: reap stuck generators in reapStaleSessions (fixes #1652). | reliability/bugfix |
| [#1714](https://github.com/thedotmack/claude-mem/pull/1714) | external | closed unmerged | 2026-04-11 | Wanted this problem fixed: rename bun-runner.js to .mjs to fix ESM SyntaxError on macOS (fixes #1662) [v2]. | install/platform |
| [#1715](https://github.com/thedotmack/claude-mem/pull/1715) | external | closed unmerged | 2026-04-11 | Wanted this problem fixed: skip SDK session resume when summarizing to prevent context overflow [v2]. | other |
| [#1721](https://github.com/thedotmack/claude-mem/pull/1721) | external | closed unmerged | 2026-04-11 | Wanted this problem fixed: kill zombie port owner before spawning new worker. | reliability/bugfix |
| [#1722](https://github.com/thedotmack/claude-mem/pull/1722) | external | closed unmerged | 2026-04-11 | Wanted: multi-node network mode. | storage/sync |
| [#1728](https://github.com/thedotmack/claude-mem/pull/1728) | external | closed unmerged | 2026-04-12 | Wanted this problem fixed: support ANTHROPIC_AUTH_TOKEN and ANTHROPIC_BASE_URL in ~/.claude-mem/.env. | cost/models |
| [#1731](https://github.com/thedotmack/claude-mem/pull/1731) | external | closed unmerged | 2026-04-12 | Wanted this problem fixed: reject URI schemes in isValidPathForClaudeMd to prevent phantom directories. | capture/hooks |
| [#1736](https://github.com/thedotmack/claude-mem/pull/1736) | external | closed unmerged | 2026-04-12 | Wanted: auto-cleanup stale/oversized observer session JSONL files. | search/retrieval quality |
| [#1741](https://github.com/thedotmack/claude-mem/pull/1741) | external | closed unmerged | 2026-04-12 | Wanted: multi-node network mode. | storage/sync |
| [#1751](https://github.com/thedotmack/claude-mem/pull/1751) | external | closed unmerged | 2026-04-13 | Wanted this problem fixed: include ~/.bun/bin in hooks PATH on Windows. | capture/hooks |
| [#1758](https://github.com/thedotmack/claude-mem/pull/1758) | external | closed unmerged | 2026-04-13 | Wanted: add AWS Bedrock support as Claude auth method. | cost/models |
| [#1768](https://github.com/thedotmack/claude-mem/pull/1768) | external | closed unmerged | 2026-04-13 | Wanted this problem fixed: stop hook no longer spins 110s when worker lacks /api/sessions/status. | capture/hooks |
| [#1772](https://github.com/thedotmack/claude-mem/pull/1772) | external | closed unmerged | 2026-04-13 | Wanted: auto-cleanup stale/oversized observer session JSONL files. | search/retrieval quality |
| [#1773](https://github.com/thedotmack/claude-mem/pull/1773) | external | closed unmerged | 2026-04-13 | Wanted: add export/import CLI for portable memory migration. | storage/sync |
| [#1774](https://github.com/thedotmack/claude-mem/pull/1774) | external | closed unmerged | 2026-04-13 | Wanted: add temporal scoring, staleness tracking, and drift detection. | search/retrieval quality |
| [#1786](https://github.com/thedotmack/claude-mem/pull/1786) | external | closed unmerged | 2026-04-14 | Wanted: pi-mem — persistent memory extension for pi-mono agents. | new tool integration |
| [#1795](https://github.com/thedotmack/claude-mem/pull/1795) | external | closed unmerged | 2026-04-14 | Wanted: add CLAUDE_MEM_OPENROUTER_BASE_URL setting for local/compatible servers. | cost/models |
| [#1796](https://github.com/thedotmack/claude-mem/pull/1796) | external | closed unmerged | 2026-04-14 | Wanted this problem fixed: add logger exclusions for new CLI and knowledge files. | privacy/redaction |
| [#1799](https://github.com/thedotmack/claude-mem/pull/1799) | external | closed unmerged | 2026-04-14 | Wanted: Issue #1791: 2-layer dedup pipeline for search results. | search/retrieval quality |
| [#1804](https://github.com/thedotmack/claude-mem/pull/1804) | external | closed unmerged | 2026-04-14 | Wanted this problem fixed: support gemini transcript parsing in summarize hook. | cost/models |
| [#1814](https://github.com/thedotmack/claude-mem/pull/1814) | external | closed unmerged | 2026-04-14 | Wanted this problem fixed: security hardening (P1-P5) — token explosion, DB bloat, OOM, DoS, prompt injection. | privacy/redaction |
| [#1818](https://github.com/thedotmack/claude-mem/pull/1818) | external | closed unmerged | 2026-04-14 | Wanted: add Claude Code plugin lifecycle hooks. | capture/hooks |
| [#1838](https://github.com/thedotmack/claude-mem/pull/1838) | external | closed unmerged | 2026-04-15 | Wanted this problem fixed: Windows --print (pipe) mode hangs when plugin hooks block on stdin. | reliability/bugfix |
| [#1843](https://github.com/thedotmack/claude-mem/pull/1843) | external | closed unmerged | 2026-04-15 | Wanted this problem fixed: worker spawn failure when Windows username contains space. | install/platform |
| [#1854](https://github.com/thedotmack/claude-mem/pull/1854) | external | closed unmerged | 2026-04-15 | Wanted this problem fixed: escape single quotes in WQL orphan reaper filter. | reliability/bugfix |
| [#1855](https://github.com/thedotmack/claude-mem/pull/1855) | external | closed unmerged | 2026-04-15 | Wanted this problem fixed: kill registry-tracked orphan before reconnect in connectInternal. | reliability/bugfix |
| [#1861](https://github.com/thedotmack/claude-mem/pull/1861) | external | closed unmerged | 2026-04-15 | Wanted: add delete_observations_by_project MCP endpoint. | UI |
| [#2073](https://github.com/thedotmack/claude-mem/pull/2073) | maintainer | merged | 2026-04-19 | Wanted: disable subagent summaries, label subagent observations. | privacy/redaction |
| [#2076](https://github.com/thedotmack/claude-mem/pull/2076) | maintainer | merged | 2026-04-19 | Wanted: basic claude-mem Docker container for easy spin-up. | install/platform |
| [#2080](https://github.com/thedotmack/claude-mem/pull/2080) | maintainer | merged | 2026-04-20 | Wanted this problem fixed: Issue Blowout 2026 — 25 bugs across worker, hooks, security, and search. | privacy/redaction |
| [#2081](https://github.com/thedotmack/claude-mem/pull/2081) | maintainer | merged | 2026-04-20 | Wanted: remove bearer auth and platform_source context filter. | privacy/redaction |
| [#2110](https://github.com/thedotmack/claude-mem/pull/2110) | maintainer | closed unmerged | 2026-04-24 | Wanted: PATHFINDER-2026-04-22 — second-system accretion sweep across 7 plans. | other |
| [#2133](https://github.com/thedotmack/claude-mem/pull/2133) | maintainer | merged | 2026-04-25 | Wanted: v12.4.3: one-time pollution cleanup migration + v12.4.1/v12.4.2 fixes. | other |
| [#2344](https://github.com/thedotmack/claude-mem/pull/2344) | maintainer | merged | 2026-05-06 | Wanted this problem fixed: harden startup and schema repair contracts. | other |
| [#2402](https://github.com/thedotmack/claude-mem/pull/2402) | maintainer | closed unmerged | 2026-05-10 | Wanted: add oh-my-issues for root-cause issue clustering. | other |
| [#2409](https://github.com/thedotmack/claude-mem/pull/2409) | maintainer | merged | 2026-05-11 | Wanted: add oh-my-issues for root-cause issue clustering. | other |
| [#2412](https://github.com/thedotmack/claude-mem/pull/2412) | maintainer | closed unmerged | 2026-05-11 | Wanted: add pr-consensus for cross-bot consensus reports. | other |
| [#2413](https://github.com/thedotmack/claude-mem/pull/2413) | maintainer | closed unmerged | 2026-05-11 | Wanted: add The Zoo — a collaborative-review pattern for multi-bot repositories. | other |
| [#2489](https://github.com/thedotmack/claude-mem/pull/2489) | external | closed unmerged | 2026-05-15 | Wanted this problem fixed: launch mcp-search via node so Windows can spawn it. | other |
| [#2492](https://github.com/thedotmack/claude-mem/pull/2492) | external | closed unmerged | 2026-05-15 | Wanted: adaptive hybrid retrieval (enhanced_search). | search/retrieval quality |
| [#2493](https://github.com/thedotmack/claude-mem/pull/2493) | external | closed unmerged | 2026-05-15 | Wanted: periodic sweep for orphaned pending_messages. | reliability/bugfix |
| [#2499](https://github.com/thedotmack/claude-mem/pull/2499) | external | closed unmerged | 2026-05-16 | Wanted this problem fixed: strip suppressOutput from Codex hook output (2486). | new tool integration |
| [#2501](https://github.com/thedotmack/claude-mem/pull/2501) | external | closed unmerged | 2026-05-16 | Wanted this problem fixed: replace printf '%s\n' with echo in hook path-finding subshells (2439). | capture/hooks |
| [#2502](https://github.com/thedotmack/claude-mem/pull/2502) | external | closed unmerged | 2026-05-16 | Wanted this problem fixed: drop cmd.exe wrap on Windows uvx spawn (2426). | install/platform |
| [#2503](https://github.com/thedotmack/claude-mem/pull/2503) | external | closed unmerged | 2026-05-16 | Wanted this problem fixed: match OpenCode Hooks contract so sessions record (2435). | new tool integration |
| [#2511](https://github.com/thedotmack/claude-mem/pull/2511) | external | closed unmerged | 2026-05-17 | Wanted: Fix upstream TypeScript baseline. | UI |
| [#2514](https://github.com/thedotmack/claude-mem/pull/2514) | external | closed unmerged | 2026-05-17 | Wanted: Add OpenAI Codex OAuth observation provider. | cost/models |
| [#2517](https://github.com/thedotmack/claude-mem/pull/2517) | external | closed unmerged | 2026-05-17 | Wanted: Fix OpenClaw memory prompt capture. | new tool integration |
| [#2523](https://github.com/thedotmack/claude-mem/pull/2523) | external | open | 2026-05-18 | Wanted: add Vertex AI support for Gemini provider (gemini-3.1-flash-lite default). | cost/models |
| [#2526](https://github.com/thedotmack/claude-mem/pull/2526) | external | closed unmerged | 2026-05-18 | Wanted this problem fixed: silence Windows Git Bash EPIPE/EACCES on plugin-path resolver. | capture/hooks |
| [#2527](https://github.com/thedotmack/claude-mem/pull/2527) | external | closed unmerged | 2026-05-18 | Wanted: allow custom OpenRouter base URL. | cost/models |
| [#2531](https://github.com/thedotmack/claude-mem/pull/2531) | external | closed unmerged | 2026-05-18 | Wanted this problem fixed: bundle plugin/node_modules so marketplace install ships runtime deps (closes #2407). | other |
| [#2532](https://github.com/thedotmack/claude-mem/pull/2532) | external | closed unmerged | 2026-05-18 | Wanted: Pi (badlogic/pi-mono) platform adapter. | new tool integration |
| [#2536](https://github.com/thedotmack/claude-mem/pull/2536) | external | closed unmerged | 2026-05-19 | Wanted: Fix chroma-mcp orphan cleanup. | reliability/bugfix |
| [#2542](https://github.com/thedotmack/claude-mem/pull/2542) | external | closed unmerged | 2026-05-19 | Wanted: argon2id API key hashing with SHA-256 backward-compat. | privacy/redaction |
| [#2544](https://github.com/thedotmack/claude-mem/pull/2544) | external | closed unmerged | 2026-05-19 | Wanted: server-beta runtime setup, rollback, and multi-IDE injection. | storage/sync |
| [#2546](https://github.com/thedotmack/claude-mem/pull/2546) | external | closed unmerged | 2026-05-19 | Wanted this problem fixed: wire server-beta runtime into installer + UX cleanup. | storage/sync |
| [#2549](https://github.com/thedotmack/claude-mem/pull/2549) | external | closed unmerged | 2026-05-19 | Wanted: claude-mem doctor — 12-check diagnostic CLI. | install/platform |
| [#2553](https://github.com/thedotmack/claude-mem/pull/2553) | external | closed unmerged | 2026-05-19 | Wanted: mount viewer UI with /api/* compat + /stream SSE. | storage/sync |
| [#2555](https://github.com/thedotmack/claude-mem/pull/2555) | external | closed unmerged | 2026-05-19 | Wanted: subscription auth via OAuth resolver + host-bridge provider. | storage/sync |
| [#2557](https://github.com/thedotmack/claude-mem/pull/2557) | external | closed unmerged | 2026-05-19 | Wanted: hook auto-registry + OpenCode auto-capture + esbuild fixes. | new tool integration |
| [#2559](https://github.com/thedotmack/claude-mem/pull/2559) | external | closed unmerged | 2026-05-19 | Wanted this problem fixed: server-beta stack hardening + Redis config robustness. | storage/sync |
| [#2561](https://github.com/thedotmack/claude-mem/pull/2561) | external | closed unmerged | 2026-05-19 | Wanted: postgres schema + observation metadata + scope-migration tool. | storage/sync |
| [#2563](https://github.com/thedotmack/claude-mem/pull/2563) | external | closed unmerged | 2026-05-19 | Wanted: rename api-key-service.ts → api-key-service-sqlite.ts. | privacy/redaction |
| [#2565](https://github.com/thedotmack/claude-mem/pull/2565) | external | closed unmerged | 2026-05-19 | Wanted: hooks + ModeManager runtime-selector for server-beta. | storage/sync |
| [#2567](https://github.com/thedotmack/claude-mem/pull/2567) | external | closed unmerged | 2026-05-19 | Wanted: MCP grammar routes + retry telemetry + knowledge cache + audit log. | performance |
| [#2569](https://github.com/thedotmack/claude-mem/pull/2569) | external | closed unmerged | 2026-05-19 | Wanted: runtime-aware claude-mem uninstall. | install/platform |
| [#2573](https://github.com/thedotmack/claude-mem/pull/2573) | external | closed unmerged | 2026-05-19 | Wanted: claude-mem server CLI subcommands + helmet hardening + runtime guard. | privacy/redaction |
| [#2576](https://github.com/thedotmack/claude-mem/pull/2576) | external | closed unmerged | 2026-05-20 | Wanted: Fix Codex SessionStart output normalization. | new tool integration |
| [#2583](https://github.com/thedotmack/claude-mem/pull/2583) | external | open | 2026-05-20 | Wanted: add PreCompact hook to capture session state before context compaction. | performance |
| [#2593](https://github.com/thedotmack/claude-mem/pull/2593) | external | closed unmerged | 2026-05-21 | Wanted this problem fixed: escape cmd.exe metacharacters in uvx args on Windows. | install/platform |
| [#2594](https://github.com/thedotmack/claude-mem/pull/2594) | external | closed unmerged | 2026-05-21 | Wanted this problem fixed: replace sh launcher with cross-platform node -e (closes #2461). | other |
| [#2598](https://github.com/thedotmack/claude-mem/pull/2598) | external | closed unmerged | 2026-05-21 | Wanted this problem fixed: replace fragile $SHELL -lc PATH probe with printenv-first pattern. | capture/hooks |
| [#2599](https://github.com/thedotmack/claude-mem/pull/2599) | external | closed unmerged | 2026-05-21 | Wanted this problem fixed: make Windows captureProcessStartToken actually return a token (closes #2578). | install/platform |
| [#2602](https://github.com/thedotmack/claude-mem/pull/2602) | external | closed unmerged | 2026-05-21 | Wanted this problem fixed: truncate oversized prompt fields + drop overflow from hard-stop (closes #2468). | search/retrieval quality |
| [#2603](https://github.com/thedotmack/claude-mem/pull/2603) | external | closed unmerged | 2026-05-21 | Wanted: add optional pgvector and Valkey external mirror. | storage/sync |
| [#2606](https://github.com/thedotmack/claude-mem/pull/2606) | external | closed unmerged | 2026-05-21 | Wanted: add Postgres primary external memory mode. | storage/sync |
| [#2614](https://github.com/thedotmack/claude-mem/pull/2614) | external | closed unmerged | 2026-05-22 | Wanted: Add Codex ingestion provider and Windows Chroma launch fix. | cost/models |
| [#2616](https://github.com/thedotmack/claude-mem/pull/2616) | external | merged | 2026-05-22 | Wanted: opt-in auto-redaction for common secret patterns. | privacy/redaction |
| [#2618](https://github.com/thedotmack/claude-mem/pull/2618) | external | closed unmerged | 2026-05-22 | Wanted this problem fixed: clean up claude mcp list output by moving discovery to a launcher file. | other |
| [#2623](https://github.com/thedotmack/claude-mem/pull/2623) | external | closed unmerged | 2026-05-22 | Wanted: i18n framework (9 languages) + DeepSeek AI provider + prompt dedup. | i18n |
| [#2627](https://github.com/thedotmack/claude-mem/pull/2627) | external | closed unmerged | 2026-05-23 | Wanted: auto dedup-folding (S3) — opt-in fold of identical tool calls within a sliding window. | search/retrieval quality |
| [#2629](https://github.com/thedotmack/claude-mem/pull/2629) | external | closed unmerged | 2026-05-23 | Wanted this problem fixed: strip Bedrock/Vertex routing env from worker subprocess. | cost/models |
| [#2644](https://github.com/thedotmack/claude-mem/pull/2644) | external | closed unmerged | 2026-05-24 | Wanted this problem fixed: auto-install plugin dependencies on first hook invocation. | capture/hooks |
| [#2658](https://github.com/thedotmack/claude-mem/pull/2658) | external | closed unmerged | 2026-05-25 | Wanted this problem fixed: restore plugin runtime deps after auto-upgrade. | install/platform |
| [#2665](https://github.com/thedotmack/claude-mem/pull/2665) | external | closed unmerged | 2026-05-27 | Wanted this problem fixed: support git-root project names. | storage/sync |
| [#2668](https://github.com/thedotmack/claude-mem/pull/2668) | external | closed unmerged | 2026-05-27 | Wanted this problem fixed: spawn uvx directly on Windows instead of via cmd.exe (closes #2667). | install/platform |
| [#2674](https://github.com/thedotmack/claude-mem/pull/2674) | external | closed unmerged | 2026-05-27 | Wanted: [codex] fix logs clear with empty request body. | new tool integration |
| [#2692](https://github.com/thedotmack/claude-mem/pull/2692) | external | closed unmerged | 2026-05-28 | Wanted this problem fixed: emit SessionStart JSON from version check. | new tool integration |
| [#2693](https://github.com/thedotmack/claude-mem/pull/2693) | external | closed unmerged | 2026-05-28 | Wanted: [codex] Normalize claude-mem hook output. | new tool integration |
| [#2710](https://github.com/thedotmack/claude-mem/pull/2710) | external | closed unmerged | 2026-05-29 | Wanted this problem fixed: ship & harden plugin/node_modules so hooks resolve zod/v3 (#2379). | capture/hooks |
| [#2717](https://github.com/thedotmack/claude-mem/pull/2717) | external | closed unmerged | 2026-05-30 | Wanted: Fix Codex hook JSON compatibility. | new tool integration |
| [#2725](https://github.com/thedotmack/claude-mem/pull/2725) | external | closed unmerged | 2026-05-30 | Wanted this problem fixed: drop pipe `break` that triggers EACCES "printf: write error: Permission denied" on Windows/Cygwin. | privacy/redaction |
| [#2727](https://github.com/thedotmack/claude-mem/pull/2727) | external | closed unmerged | 2026-05-30 | Wanted this problem fixed: opencode integration issues. | new tool integration |
| [#2728](https://github.com/thedotmack/claude-mem/pull/2728) | external | closed unmerged | 2026-05-31 | Wanted this problem fixed: camelCase params + obs_type key routing; clarify MCP tool descriptions. | other |
| [#2731](https://github.com/thedotmack/claude-mem/pull/2731) | external | closed unmerged | 2026-05-31 | Wanted: UDS daemon pipeline (~7.8× hook latency) + corpus fixes + MCP tool docs (Sprint 1-3). | performance |
| [#2732](https://github.com/thedotmack/claude-mem/pull/2732) | external | closed unmerged | 2026-05-31 | Wanted this problem fixed: replace stale-version worker on SessionStart instead of reusing a zombie (#2601). | reliability/bugfix |
| [#2733](https://github.com/thedotmack/claude-mem/pull/2733) | external | closed unmerged | 2026-05-31 | Wanted: Fix Codex context preview formatting. | new tool integration |
| [#2737](https://github.com/thedotmack/claude-mem/pull/2737) | external | merged | 2026-06-01 | Wanted: named environments with path patterns for shared memory. | storage/sync |
| [#2739](https://github.com/thedotmack/claude-mem/pull/2739) | external | closed unmerged | 2026-06-01 | Wanted this problem fixed: preserve init prompt during conversation history truncation. | search/retrieval quality |
| [#2741](https://github.com/thedotmack/claude-mem/pull/2741) | external | merged | 2026-06-01 | Wanted: skip/filter subagent observations (Dynamic Workflows `workflow-subagent`) — #2736. | privacy/redaction |
| [#2763](https://github.com/thedotmack/claude-mem/pull/2763) | external | closed unmerged | 2026-06-03 | Wanted this problem fixed: Windows compatibility for MCP server and hooks. | other |
| [#2764](https://github.com/thedotmack/claude-mem/pull/2764) | external | closed unmerged | 2026-06-03 | Wanted: add Gemini CLI as a headless observation provider. | cost/models |
| [#2774](https://github.com/thedotmack/claude-mem/pull/2774) | external | closed unmerged | 2026-06-04 | Wanted this problem fixed: load custom grammars in smart_outline and smart_unfold. | search/retrieval quality |
| [#2775](https://github.com/thedotmack/claude-mem/pull/2775) | external | closed unmerged | 2026-06-04 | Wanted: add C# as a builtin smart-explore language. | i18n |
| [#2777](https://github.com/thedotmack/claude-mem/pull/2777) | external | closed unmerged | 2026-06-04 | Wanted: add opt-in Mermaid task-flow diagram for token-efficient context injection. | performance |
| [#2810](https://github.com/thedotmack/claude-mem/pull/2810) | external | merged | 2026-06-06 | Wanted: ignore Codex and Codex-app internal system prompts. | new tool integration |
| [#2811](https://github.com/thedotmack/claude-mem/pull/2811) | external | closed unmerged | 2026-06-06 | Wanted: Fix Codex hook output schema. | new tool integration |
| [#2816](https://github.com/thedotmack/claude-mem/pull/2816) | external | closed unmerged | 2026-06-07 | Wanted this problem fixed: spawn uvx directly on Windows instead of via cmd.exe (#2716, #2667). | install/platform |
| [#2826](https://github.com/thedotmack/claude-mem/pull/2826) | external | closed unmerged | 2026-06-08 | Wanted this problem fixed: correct Antigravity MCP config path so install wires it. | new tool integration |
| [#2827](https://github.com/thedotmack/claude-mem/pull/2827) | external | merged | 2026-06-08 | Wanted: CLAUDE_MEM_PROJECT_NAME_SOURCE=git-remote for stable org/repo slugs. | storage/sync |
| [#2828](https://github.com/thedotmack/claude-mem/pull/2828) | external | merged | 2026-06-08 | Wanted: add CLAUDE_MEM_WORKER_AUTOSTART to opt out of hook worker lazy-spawn. | capture/hooks |
| [#2829](https://github.com/thedotmack/claude-mem/pull/2829) | external | merged | 2026-06-08 | Wanted: zero-spend ingest of Claude Code auto-memory into observations. | cost/models |
| [#2833](https://github.com/thedotmack/claude-mem/pull/2833) | external | open | 2026-06-08 | Wanted: Claude Code transcript backfill via historical-framing replay (#2690). | storage/sync |
| [#2835](https://github.com/thedotmack/claude-mem/pull/2835) | external | merged | 2026-06-08 | Wanted: add 'claude' as alias for 'claude-code' platform. | other |
| [#2840](https://github.com/thedotmack/claude-mem/pull/2840) | external | closed unmerged | 2026-06-08 | Wanted this problem fixed: emit compatible hook output. | capture/hooks |
| [#2841](https://github.com/thedotmack/claude-mem/pull/2841) | external | closed unmerged | 2026-06-08 | Wanted: [codex] fix invalid hook JSON output. | new tool integration |
| [#2850](https://github.com/thedotmack/claude-mem/pull/2850) | external | closed unmerged | 2026-06-09 | Wanted this problem fixed: suppress native Codex transcript AGENTS writes (closes #2837). | new tool integration |
| [#2851](https://github.com/thedotmack/claude-mem/pull/2851) | external | closed unmerged | 2026-06-09 | Wanted this problem fixed: strip unsupported suppressOutput from Codex hook output (closes #2844). | new tool integration |
| [#2855](https://github.com/thedotmack/claude-mem/pull/2855) | external | closed unmerged | 2026-06-09 | Wanted this problem fixed: restore OpenCode capture on the current plugin hook contract (closes #2832). | new tool integration |
| [#2856](https://github.com/thedotmack/claude-mem/pull/2856) | external | closed unmerged | 2026-06-09 | Wanted this problem fixed: fold submodule cwd sessions into the parent repo memory (closes #2842). | search/retrieval quality |
| [#2858](https://github.com/thedotmack/claude-mem/pull/2858) | external | closed unmerged | 2026-06-09 | Wanted this problem fixed: inject project dream namespaces alongside recent raw memory (closes #2834). | search/retrieval quality |
| [#2867](https://github.com/thedotmack/claude-mem/pull/2867) | external | merged | 2026-06-10 | Wanted: short display refs for server-runtime session start. | search/retrieval quality |
| [#2880](https://github.com/thedotmack/claude-mem/pull/2880) | external | closed unmerged | 2026-06-10 | Wanted this problem fixed: spawn chroma-mcp via `--from` so uv < 0.5.31 works. | reliability/bugfix |
| [#2883](https://github.com/thedotmack/claude-mem/pull/2883) | external | closed unmerged | 2026-06-10 | Wanted this problem fixed: make cwd-remap reconciliation idempotent to fix orphaned worktree observations (closes #2864). | storage/sync |
| [#2885](https://github.com/thedotmack/claude-mem/pull/2885) | external | closed unmerged | 2026-06-10 | Wanted this problem fixed: cap summarize Stop-hook retry loop with per-session disabled sentinel (closes #2846). | privacy/redaction |
| [#2886](https://github.com/thedotmack/claude-mem/pull/2886) | external | closed unmerged | 2026-06-10 | Wanted this problem fixed: drop sub-day clock from injected headers to stop busting prefix cache (closes #2872). | performance |
| [#2889](https://github.com/thedotmack/claude-mem/pull/2889) | external | closed unmerged | 2026-06-10 | Wanted this problem fixed: exit 0 on signal-kill for hook event subcommands (addresses #2823). | capture/hooks |
| [#2890](https://github.com/thedotmack/claude-mem/pull/2890) | external | closed unmerged | 2026-06-10 | Wanted this problem fixed: suppress console window flash in findBun() spawnSync call (closes #2869). | storage/sync |
| [#2895](https://github.com/thedotmack/claude-mem/pull/2895) | external | closed unmerged | 2026-06-11 | Wanted this problem fixed: detect real port occupation cross-platform and reclaim stale workers. | install/platform |
| [#2908](https://github.com/thedotmack/claude-mem/pull/2908) | external | closed unmerged | 2026-06-12 | Wanted: add Kimi Code CLI support. | new tool integration |
| [#2917](https://github.com/thedotmack/claude-mem/pull/2917) | external | closed unmerged | 2026-06-13 | Wanted this problem fixed: avoid blocking Claude SessionStart on Windows cold boot (closes #2903). | install/platform |
| [#2918](https://github.com/thedotmack/claude-mem/pull/2918) | external | closed unmerged | 2026-06-13 | Wanted this problem fixed: restore tree-sitter CLI on clean Windows installs (closes #2910). | install/platform |
| [#2919](https://github.com/thedotmack/claude-mem/pull/2919) | external | closed unmerged | 2026-06-13 | Wanted this problem fixed: scope injected context to the active memory session (closes #2909). | search/retrieval quality |
| [#2920](https://github.com/thedotmack/claude-mem/pull/2920) | external | closed unmerged | 2026-06-13 | Wanted this problem fixed: prewarm uvx installs before the MCP connect deadline (closes #2897). | other |
| [#2923](https://github.com/thedotmack/claude-mem/pull/2923) | external | closed unmerged | 2026-06-13 | Wanted this problem fixed: make installer launchable, add uninstall + viewer memory deletion. | UI |
| [#2924](https://github.com/thedotmack/claude-mem/pull/2924) | external | closed unmerged | 2026-06-13 | Wanted this problem fixed: make launchable + add uninstall option. | install/platform |
| [#2925](https://github.com/thedotmack/claude-mem/pull/2925) | external | merged | 2026-06-13 | Wanted: delete memories from the viewer. | UI |
| [#2936](https://github.com/thedotmack/claude-mem/pull/2936) | external | closed unmerged | 2026-06-15 | Wanted this problem fixed: add platformSource identifier to all observations. | new tool integration |
| [#2940](https://github.com/thedotmack/claude-mem/pull/2940) | external | closed unmerged | 2026-06-15 | Wanted this problem fixed: use @ instead of == for chroma-mcp version pinning with uvx. | reliability/bugfix |
| [#2944](https://github.com/thedotmack/claude-mem/pull/2944) | external | closed unmerged | 2026-06-15 | Wanted this problem fixed: hide cmd window in `where bun` spawnSync (findBun). | storage/sync |
| [#2945](https://github.com/thedotmack/claude-mem/pull/2945) | external | closed unmerged | 2026-06-15 | Wanted this problem fixed: install Windows Claude Code hooks without bash. | capture/hooks |
| [#2948](https://github.com/thedotmack/claude-mem/pull/2948) | external | closed unmerged | 2026-06-16 | Wanted this problem fixed: remove unsupported hooks description. | new tool integration |
| [#2949](https://github.com/thedotmack/claude-mem/pull/2949) | external | closed unmerged | 2026-06-16 | Wanted: Feat/mysql support. | storage/sync |
| [#2953](https://github.com/thedotmack/claude-mem/pull/2953) | external | closed unmerged | 2026-06-16 | Wanted: Fix claude-mem codex-hooks.json for current Codex: drop `description` (0.140 parser) + filter SessionStart no-op. | new tool integration |
| [#2980](https://github.com/thedotmack/claude-mem/pull/2980) | external | closed unmerged | 2026-06-17 | Wanted: fix worker restart port cleanup on Windows. | reliability/bugfix |
| [#2985](https://github.com/thedotmack/claude-mem/pull/2985) | external | closed unmerged | 2026-06-17 | Wanted this problem fixed: capture current message events. | new tool integration |
| [#2990](https://github.com/thedotmack/claude-mem/pull/2990) | external | closed unmerged | 2026-06-17 | Wanted this problem fixed: map content field correctly in server-beta observation payload builder. | storage/sync |
| [#3000](https://github.com/thedotmack/claude-mem/pull/3000) | external | closed unmerged | 2026-06-18 | Wanted: add Antigravity CLI hooks support. | new tool integration |
| [#3005](https://github.com/thedotmack/claude-mem/pull/3005) | external | closed unmerged | 2026-06-19 | Wanted: Add support for projectName override via .claude-mem.json. | storage/sync |
| [#3006](https://github.com/thedotmack/claude-mem/pull/3006) | external | closed unmerged | 2026-06-19 | Wanted this problem fixed: ensure marketplace.json is available at Claude Code expected location. | install/platform |
| [#3009](https://github.com/thedotmack/claude-mem/pull/3009) | external | closed unmerged | 2026-06-20 | Wanted this problem fixed: improve Windows multi-window stability with zombie worker recovery (#2996). | reliability/bugfix |
| [#3011](https://github.com/thedotmack/claude-mem/pull/3011) | external | closed unmerged | 2026-06-20 | Wanted this problem fixed: recover semantic injection when scoped Chroma metadata misses matches (closes #2979). | search/retrieval quality |
| [#3014](https://github.com/thedotmack/claude-mem/pull/3014) | external | closed unmerged | 2026-06-20 | Wanted this problem fixed: full OpenCode v1.17.8 plugin compatibility. | performance |
| [#3018](https://github.com/thedotmack/claude-mem/pull/3018) | external | closed unmerged | 2026-06-21 | Wanted: Preserve proxy variables during environment sanitization. | privacy/redaction |
| [#3027](https://github.com/thedotmack/claude-mem/pull/3027) | maintainer | open | 2026-06-21 | Wanted: Disable Claude Code native auto-memory by default + memory transfer. | privacy/redaction |
| [#3033](https://github.com/thedotmack/claude-mem/pull/3033) | external | closed unmerged | 2026-06-22 | Wanted this problem fixed: strip UTF-8 BOM in all settings.json readers (#3013). | install/platform |
| [#3034](https://github.com/thedotmack/claude-mem/pull/3034) | external | open | 2026-06-23 | Wanted: add Agy CLI observation provider. | cost/models |
| [#3040](https://github.com/thedotmack/claude-mem/pull/3040) | external | merged | 2026-06-24 | Wanted: add CLAUDE_MEM_OPENROUTER_EXTRA_BODY for provider-specific request parameters. | cost/models |
| [#3044](https://github.com/thedotmack/claude-mem/pull/3044) | external | closed unmerged | 2026-06-24 | Wanted: add memory_save tool for worker-runtime manual writes. | UI |
| [#3046](https://github.com/thedotmack/claude-mem/pull/3046) | external | closed unmerged | 2026-06-25 | Wanted this problem fixed: drop shell:IS_WINDOWS from version-probe spawns to silence DEP0190 on Node 22 (closes #2941). | install/platform |
| [#3047](https://github.com/thedotmack/claude-mem/pull/3047) | external | closed unmerged | 2026-06-25 | Wanted this problem fixed: use repo-relative project keys for monorepo subdirectories (closes #2882). | capture/hooks |
| [#3049](https://github.com/thedotmack/claude-mem/pull/3049) | external | closed unmerged | 2026-06-25 | Wanted this problem fixed: Cursor IDE compat (platform source + empty stdin). | new tool integration |
| [#3057](https://github.com/thedotmack/claude-mem/pull/3057) | external | closed unmerged | 2026-06-25 | Wanted this problem fixed: pin chroma-mcp via uvx canonical `tool@version` form (#2939). | reliability/bugfix |
| [#3059](https://github.com/thedotmack/claude-mem/pull/3059) | external | closed unmerged | 2026-06-25 | Wanted this problem fixed: window invalid-output respawn so benign idle can't poison quiet sessions. | reliability/bugfix |
| [#3060](https://github.com/thedotmack/claude-mem/pull/3060) | external | closed unmerged | 2026-06-25 | Wanted this problem fixed: preserve Bedrock and Vertex skip-auth flags in SDK env (closes #3053). | cost/models |
| [#3061](https://github.com/thedotmack/claude-mem/pull/3061) | external | closed unmerged | 2026-06-25 | Wanted this problem fixed: avoid top-level await in bun-runner so hooks load on Node < 14.8. | capture/hooks |
| [#3063](https://github.com/thedotmack/claude-mem/pull/3063) | external | merged | 2026-06-26 | Wanted: opt-in near-duplicate observation dedup — Tier-0 auto-merge + Tier-1 candidates (#3038). | search/retrieval quality |
| [#3079](https://github.com/thedotmack/claude-mem/pull/3079) | external | closed unmerged | 2026-06-28 | Wanted: show worker health in header title tooltip. | UI |
| [#3084](https://github.com/thedotmack/claude-mem/pull/3084) | external | closed unmerged | 2026-06-29 | Wanted this problem fixed: surface missing-credentials warning at session start for marketplace installs. | privacy/redaction |
| [#3093](https://github.com/thedotmack/claude-mem/pull/3093) | external | closed unmerged | 2026-06-30 | Wanted: Add Codex CLI provider. | cost/models |
| [#3099](https://github.com/thedotmack/claude-mem/pull/3099) | external | closed unmerged | 2026-07-01 | Wanted this problem fixed: bound hook invocations so a wedged worker can't block the prompt. | capture/hooks |
| [#3110](https://github.com/thedotmack/claude-mem/pull/3110) | external | closed unmerged | 2026-07-01 | Wanted this problem fixed: preserve install markers for Codex plugin roots. | new tool integration |
| [#3112](https://github.com/thedotmack/claude-mem/pull/3112) | external | closed unmerged | 2026-07-01 | Wanted this problem fixed: detect stale/orphaned port socket on startup and fail with actionable guidance. | reliability/bugfix |
| [#3114](https://github.com/thedotmack/claude-mem/pull/3114) | external | closed unmerged | 2026-07-01 | Wanted: reversible dismiss to hide observations from surfacing. | UI |
| [#3125](https://github.com/thedotmack/claude-mem/pull/3125) | external | closed unmerged | 2026-07-03 | Wanted: add Amazon Kiro CLI platform support (hooks, MCP, skills, insta…. | new tool integration |
| [#3136](https://github.com/thedotmack/claude-mem/pull/3136) | external | closed unmerged | 2026-07-05 | Wanted this problem fixed: add Skill/Workflow/SlashCommand/ExitPlanMode to Observer deny-list. | privacy/redaction |
| [#3146](https://github.com/thedotmack/claude-mem/pull/3146) | external | closed unmerged | 2026-07-05 | Wanted this problem fixed: static-import parseFileList so worker backfill stops crashing on missing sqlite/observations/files.js (#3126, #3107.... | storage/sync |
| [#3151](https://github.com/thedotmack/claude-mem/pull/3151) | external | merged | 2026-07-06 | Wanted: bound observer conversation history for OpenAI-compatible providers. | cost/models |
| [#3156](https://github.com/thedotmack/claude-mem/pull/3156) | external | closed unmerged | 2026-07-06 | Wanted: Add GenericCliProvider for CLI-based LLM backends (Kimi Code). | new tool integration |
| [#3158](https://github.com/thedotmack/claude-mem/pull/3158) | external | closed unmerged | 2026-07-06 | Wanted this problem fixed: add windowsHide to git rev-parse in findGitRepoRoot (#2900). | install/platform |
| [#3165](https://github.com/thedotmack/claude-mem/pull/3165) | external | merged | 2026-07-07 | Wanted: record advisor tool calls locally (opt-in). | other |
| [#3166](https://github.com/thedotmack/claude-mem/pull/3166) | external | closed unmerged | 2026-07-07 | Wanted this problem fixed: preserve CLAUDE_CODE_USE_FOUNDRY through the SDK env sanitizer. | privacy/redaction |
| [#3178](https://github.com/thedotmack/claude-mem/pull/3178) | external | closed unmerged | 2026-07-08 | Wanted this problem fixed: reap children leaked by non-graceful worker deaths at boot. | reliability/bugfix |
| [#3192](https://github.com/thedotmack/claude-mem/pull/3192) | external | open | 2026-07-11 | Wanted this problem fixed: recycle chroma-mcp subprocess when its memory exceeds a configurable limit (closes #3191). | reliability/bugfix |
| [#3200](https://github.com/thedotmack/claude-mem/pull/3200) | external | closed unmerged | 2026-07-12 | Wanted this problem fixed: treat correct-empty observer prose as idle (#3193). | reliability/bugfix |
| [#3225](https://github.com/thedotmack/claude-mem/pull/3225) | external | closed unmerged | 2026-07-13 | Wanted this problem fixed: memory-worker outage must never block the editor (fail-open) + build guard for the worker zod closure. | capture/hooks |
| [#3226](https://github.com/thedotmack/claude-mem/pull/3226) | external | closed unmerged | 2026-07-13 | Wanted this problem fixed: preserve runtime marker across marketplace refresh. | new tool integration |
| [#3228](https://github.com/thedotmack/claude-mem/pull/3228) | external | merged | 2026-07-13 | Wanted: support a dynamically-loaded custom generation provider. | cost/models |
| [#3229](https://github.com/thedotmack/claude-mem/pull/3229) | external | closed unmerged | 2026-07-13 | Wanted this problem fixed: detect occupied ports on Windows. | install/platform |
| [#3232](https://github.com/thedotmack/claude-mem/pull/3232) | external | closed unmerged | 2026-07-13 | Wanted this problem fixed: eliminate the chroma-mcp PID-1/systemd orphan leak (version-skew recycle loop). | reliability/bugfix |
| [#3234](https://github.com/thedotmack/claude-mem/pull/3234) | external | closed unmerged | 2026-07-13 | Wanted this problem fixed: skip login shell when node already resolves (closes #3186). | performance |
| [#3243](https://github.com/thedotmack/claude-mem/pull/3243) | external | closed unmerged | 2026-07-14 | Wanted: add CLAUDE_MEM_HOOK_FAIL_MODE=warn to fail open when worker is unreachable. | capture/hooks |
| [#3249](https://github.com/thedotmack/claude-mem/pull/3249) | external | closed unmerged | 2026-07-14 | Wanted this problem fixed: close killProcessTree TOCTOU races that orphan chroma-mcp trees. | reliability/bugfix |
| [#3260](https://github.com/thedotmack/claude-mem/pull/3260) | external | closed unmerged | 2026-07-15 | Wanted this problem fixed: recover hooks from stranded Windows worker ports (closes #3204). | capture/hooks |
| [#3284](https://github.com/thedotmack/claude-mem/pull/3284) | external | merged | 2026-07-16 | Wanted: periodically optimize FTS5 indexes to reclaim delete-marker bloat (refs #2793). | UI |
| [#3286](https://github.com/thedotmack/claude-mem/pull/3286) | external | closed unmerged | 2026-07-16 | Wanted this problem fixed: bind chroma-mcp child tree to a kill-on-close Job Object on Windows. | reliability/bugfix |
| [#3292](https://github.com/thedotmack/claude-mem/pull/3292) | external | closed unmerged | 2026-07-17 | Wanted this problem fixed: recover hung workers and orphaned Chroma trees. | reliability/bugfix |
| [#3297](https://github.com/thedotmack/claude-mem/pull/3297) | external | open | 2026-07-17 | Wanted this problem fixed: bind Claude SDK subprocess trees to the worker Job Object on Windows. | reliability/bugfix |
| [#3302](https://github.com/thedotmack/claude-mem/pull/3302) | external | closed unmerged | 2026-07-17 | Wanted this problem fixed: reap orphaned chroma-mcp from a prior worker generation before spawning. | reliability/bugfix |
| [#3316](https://github.com/thedotmack/claude-mem/pull/3316) | external | merged | 2026-07-17 | Wanted: env opt-out for PreToolUse/PostToolUse (#3106). | privacy/redaction |
| [#3322](https://github.com/thedotmack/claude-mem/pull/3322) | maintainer | open | 2026-07-18 | Wanted: Endless Mode v1 — post-compaction session continuity via message-in-a-bottle. | performance |
| [#3323](https://github.com/thedotmack/claude-mem/pull/3323) | external | merged | 2026-07-18 | Wanted: honor CLAUDE_MEM_PUBLIC_URL for the live-view URL printed to users. | UI |
| [#3336](https://github.com/thedotmack/claude-mem/pull/3336) | external | closed unmerged | 2026-07-20 | Wanted this problem fixed: sanitize child_process call in discord-release-notify.js.... | privacy/redaction |
| [#3339](https://github.com/thedotmack/claude-mem/pull/3339) | external | closed unmerged | 2026-07-20 | Wanted this problem fixed: cap OpenRouter context history. | cost/models |
| [#3350](https://github.com/thedotmack/claude-mem/pull/3350) | external | merged | 2026-07-21 | Wanted this problem fixed: expand ~ in CLAUDE_MEM_DATA_DIR (stray ~ dirs). | other |
| [#3369](https://github.com/thedotmack/claude-mem/pull/3369) | external | closed unmerged | 2026-07-23 | Wanted this problem fixed: contain chroma-mcp orphans from ungraceful worker deaths. | reliability/bugfix |
| [#3370](https://github.com/thedotmack/claude-mem/pull/3370) | external | closed unmerged | 2026-07-23 | Wanted this problem fixed: prevent silent settlement after provider failures. | cost/models |
| [#3373](https://github.com/thedotmack/claude-mem/pull/3373) | external | closed unmerged | 2026-07-23 | Wanted this problem fixed: drain Chroma writes before worker restart. | reliability/bugfix |
| [#3374](https://github.com/thedotmack/claude-mem/pull/3374) | external | closed unmerged | 2026-07-23 | Wanted this problem fixed: roll back failed provider prompts before retry. | cost/models |
| [#3375](https://github.com/thedotmack/claude-mem/pull/3375) | external | closed unmerged | 2026-07-23 | Wanted this problem fixed: preserve Codex transcript offsets after archival. | new tool integration |
| [#3376](https://github.com/thedotmack/claude-mem/pull/3376) | external | merged | 2026-07-23 | Wanted: add MiniMax provider support. | cost/models |
| [#3385](https://github.com/thedotmack/claude-mem/pull/3385) | external | closed unmerged | 2026-07-23 | Wanted this problem fixed: include prefixed observation concepts in injection (closes #3379). | search/retrieval quality |
| [#3388](https://github.com/thedotmack/claude-mem/pull/3388) | external | closed unmerged | 2026-07-23 | Wanted this problem fixed: reap orphaned process trees after worker termination. | reliability/bugfix |
| [#3395](https://github.com/thedotmack/claude-mem/pull/3395) | external | closed unmerged | 2026-07-24 | Wanted this problem fixed: use correct hooks and await worker POSTs (#2832). | new tool integration |
| [#3397](https://github.com/thedotmack/claude-mem/pull/3397) | external | closed unmerged | 2026-07-24 | Wanted: Fix/antigrativy cli hooks adapt. | capture/hooks |
| [#3403](https://github.com/thedotmack/claude-mem/pull/3403) | external | open | 2026-07-24 | Wanted this problem fixed: run Claude hooks as exec-form Node launchers. | capture/hooks |
| [#3414](https://github.com/thedotmack/claude-mem/pull/3414) | external | merged | 2026-07-26 | Wanted: opt-in ACT-R reinforcement ranking. | search/retrieval quality |
| [#3422](https://github.com/thedotmack/claude-mem/pull/3422) | external | merged | 2026-07-27 | Wanted: expose embedding function as a setting. | search/retrieval quality |
| [#3428](https://github.com/thedotmack/claude-mem/pull/3428) | external | closed unmerged | 2026-07-27 | Wanted this problem fixed: suppress resolver stderr. | capture/hooks |
| [#3429](https://github.com/thedotmack/claude-mem/pull/3429) | external | closed unmerged | 2026-07-27 | Wanted this problem fixed: skip plugin cache sessions. | performance |
| [#3432](https://github.com/thedotmack/claude-mem/pull/3432) | external | closed unmerged | 2026-07-28 | Wanted this problem fixed: jail SDK subprocess cwd. | reliability/bugfix |
| [#3433](https://github.com/thedotmack/claude-mem/pull/3433) | external | merged | 2026-07-28 | Wanted: surface OpenRouter base URL. | cost/models |
| [#3436](https://github.com/thedotmack/claude-mem/pull/3436) | external | closed unmerged | 2026-07-28 | Wanted this problem fixed: normalize a 'localhost' worker host to 127.0.0.1 — closes #2992. | privacy/redaction |
| [#3439](https://github.com/thedotmack/claude-mem/pull/3439) | external | closed unmerged | 2026-07-29 | Wanted this problem fixed: anchor project names to Claude project dir. | storage/sync |
| [#3465](https://github.com/thedotmack/claude-mem/pull/3465) | external | closed unmerged | 2026-07-31 | Wanted this problem fixed: reap chroma and the registry when the graceful deadline cuts teardown short. | reliability/bugfix |
| [#3468](https://github.com/thedotmack/claude-mem/pull/3468) | maintainer | merged | 2026-08-01 | Wanted: add "sensitive" type with Telegram notification. | new tool integration |
| [#3473](https://github.com/thedotmack/claude-mem/pull/3473) | external | closed unmerged | 2026-08-01 | Wanted this problem fixed: repair stamped discovery_tokens drift (refs #3446). | search/retrieval quality |
| [#3477](https://github.com/thedotmack/claude-mem/pull/3477) | maintainer | open | 2026-08-02 | Wanted: self-update claude-mem before SyncHub. | other |
| [#3487](https://github.com/thedotmack/claude-mem/pull/3487) | maintainer | merged | 2026-08-03 | Wanted: add custom mode creator skill. | other |
| [#3488](https://github.com/thedotmack/claude-mem/pull/3488) | maintainer | open | 2026-08-03 | Wanted: Compact mem-search MCP observation output. | performance |
| [#3500](https://github.com/thedotmack/claude-mem/pull/3500) | external | closed unmerged | 2026-08-06 | Wanted: Fix duplicate OpenAI-compatible conversation history entries. | cost/models |
| [#3510](https://github.com/thedotmack/claude-mem/pull/3510) | external | closed unmerged | 2026-08-07 | Wanted this problem fixed: release SDK agent subprocess when a session ends (missing SessionEnd hook). | reliability/bugfix |
| [#3513](https://github.com/thedotmack/claude-mem/pull/3513) | maintainer | merged | 2026-08-08 | Wanted: offer CMEM Pro as the first memory provider option. | cost/models |
| [#3516](https://github.com/thedotmack/claude-mem/pull/3516) | maintainer | open | 2026-08-08 | Wanted this problem fixed: bound observer agent context growth with window-aware compaction. | performance |
| [#3518](https://github.com/thedotmack/claude-mem/pull/3518) | maintainer | open | 2026-08-08 | Wanted: add setup command; make update keep existing settings. | install/platform |
| [#3519](https://github.com/thedotmack/claude-mem/pull/3519) | external | closed unmerged | 2026-08-08 | Wanted this problem fixed: guard the login-shell PATH prelude behind a node check. | install/platform |
| [#3538](https://github.com/thedotmack/claude-mem/pull/3538) | maintainer | merged | 2026-08-10 | Wanted: alert the user at session start when observations stop flowing. | other |
| [#3547](https://github.com/thedotmack/claude-mem/pull/3547) | external | merged | 2026-08-10 | Wanted: Kimi Code CLI support (follow-up to #2908, rebased + payload fixes). | new tool integration |
| [#3548](https://github.com/thedotmack/claude-mem/pull/3548) | maintainer | open | 2026-08-10 | Wanted: remove dead code and duplicated abstractions repo-wide (-6.7k lines). | other |
| [#3556](https://github.com/thedotmack/claude-mem/pull/3556) | external | merged | 2026-08-11 | Wanted: add OMP (Oh My Pi) hooks adapter. | new tool integration |
| [#3570](https://github.com/thedotmack/claude-mem/pull/3570) | external | closed unmerged | 2026-08-12 | Wanted this problem fixed: register claude-mem MCP server in opencode.json. | new tool integration |
| [#3573](https://github.com/thedotmack/claude-mem/pull/3573) | external | closed unmerged | 2026-08-13 | Wanted this problem fixed: skip empty CLAUDE.md creation. | capture/hooks |
| [#3576](https://github.com/thedotmack/claude-mem/pull/3576) | external | closed unmerged | 2026-08-13 | Wanted this problem fixed: accept empty reasoning responses. | cost/models |
| [#3581](https://github.com/thedotmack/claude-mem/pull/3581) | external | merged | 2026-08-14 | Wanted: add OrcaRouter provider for observation extraction. | cost/models |
| [#3584](https://github.com/thedotmack/claude-mem/pull/3584) | external | closed unmerged | 2026-08-14 | Wanted this problem fixed: bound session-summary input by payload size, not event count. | storage/sync |
| [#3587](https://github.com/thedotmack/claude-mem/pull/3587) | external | closed unmerged | 2026-08-14 | Wanted this problem fixed: stop discarding session-summary responses (recurrence of #1345). | storage/sync |
| [#3597](https://github.com/thedotmack/claude-mem/pull/3597) | external | closed unmerged | 2026-08-16 | Wanted this problem fixed: reuse OpenAI-compatible synthetic session IDs. | cost/models |
| [#3613](https://github.com/thedotmack/claude-mem/pull/3613) | maintainer | merged | 2026-08-16 | Wanted: surface the 7-day Pro trial everywhere we show the viewer URL. | UI |
| [#3616](https://github.com/thedotmack/claude-mem/pull/3616) | external | closed unmerged | 2026-08-17 | Wanted this problem fixed: sync_outbox unbounded growth when cloud sync is unconfigured (+28x re-registration amplification). | storage/sync |
| [#3617](https://github.com/thedotmack/claude-mem/pull/3617) | maintainer | open | 2026-08-17 | Wanted: plans: re-cluster issue backlog into plan-14…24 masters; oh-my-issues starts blind + PR pass. | other |
| [#3623](https://github.com/thedotmack/claude-mem/pull/3623) | external | merged | 2026-08-17 | Wanted: add OpenCode (Zen / Go) observation provider and UI settings. | cost/models |
| [#3650](https://github.com/thedotmack/claude-mem/pull/3650) | external | closed unmerged | 2026-08-19 | Wanted this problem fixed: sanitize child_process call in discord-release-notify.js.... | privacy/redaction |
| [#3670](https://github.com/thedotmack/claude-mem/pull/3670) | external | closed unmerged | 2026-08-20 | Wanted this problem fixed: read hooks.json with the BOM-tolerant parser. | new tool integration |
| [#3672](https://github.com/thedotmack/claude-mem/pull/3672) | external | closed unmerged | 2026-08-20 | Wanted this problem fixed: recognize monthly spend-limit prose. | cost/models |
| [#3673](https://github.com/thedotmack/claude-mem/pull/3673) | external | closed unmerged | 2026-08-20 | Wanted this problem fixed: ship bug-report CLI. | install/platform |
| [#3674](https://github.com/thedotmack/claude-mem/pull/3674) | external | closed unmerged | 2026-08-20 | Wanted: add Codex CLI provider. | cost/models |
| [#3676](https://github.com/thedotmack/claude-mem/pull/3676) | external | merged | 2026-08-21 | Wanted: Kimi Code CLI harness integration. | new tool integration |
| [#3680](https://github.com/thedotmack/claude-mem/pull/3680) | external | closed unmerged | 2026-08-21 | Wanted this problem fixed: close 3 credential-leak paths (unauthenticated /api/settings, MCP path traversal, non-loopback worker binding). | privacy/redaction |
| [#3687](https://github.com/thedotmack/claude-mem/pull/3687) | maintainer | open | 2026-08-21 | Wanted: 30-day Pro trial, install-time fallback provider, and pay-now upsell. | cost/models |
| [#3689](https://github.com/thedotmack/claude-mem/pull/3689) | external | closed unmerged | 2026-08-22 | Wanted this problem fixed: resolve Volta Bun shims to bun.exe. | install/platform |
| [#3690](https://github.com/thedotmack/claude-mem/pull/3690) | external | closed unmerged | 2026-08-22 | Wanted this problem fixed: fail open when Bash path enrichment cannot parse. | capture/hooks |
| [#3691](https://github.com/thedotmack/claude-mem/pull/3691) | external | merged | 2026-08-22 | Wanted: support DeepSeek Harness zstd session logs. | cost/models |
| [#3694](https://github.com/thedotmack/claude-mem/pull/3694) | external | open | 2026-08-23 | Wanted: run search-by-meaning inside the worker instead of a Python subprocess. | reliability/bugfix |
| [#3707](https://github.com/thedotmack/claude-mem/pull/3707) | maintainer | open | 2026-08-23 | Wanted: claude-mem-cowork plugin — memory for Claude app cloud sessions. | storage/sync |
| [#3715](https://github.com/thedotmack/claude-mem/pull/3715) | external | closed unmerged | 2026-08-24 | Wanted this problem fixed: preserve buffered work after reactive provider quota errors (closes #3700). | cost/models |
| [#3716](https://github.com/thedotmack/claude-mem/pull/3716) | external | closed unmerged | 2026-08-24 | Wanted this problem fixed: use remote ancestry to adopt merged worktrees, including detached heads (refs #3698). | storage/sync |
| [#3717](https://github.com/thedotmack/claude-mem/pull/3717) | external | closed unmerged | 2026-08-24 | Wanted this problem fixed: fail open on malformed hook stdin without masking failures (closes #3699). | capture/hooks |
| [#3723](https://github.com/thedotmack/claude-mem/pull/3723) | external | closed unmerged | 2026-08-25 | Wanted this problem fixed: repair Windows credential lookup shim. | privacy/redaction |
| [#3733](https://github.com/thedotmack/claude-mem/pull/3733) | maintainer | merged | 2026-08-25 | Wanted: cowork plugin + Memory Prize scorecard (worktree consolidation). | storage/sync |
| [#3742](https://github.com/thedotmack/claude-mem/pull/3742) | external | closed unmerged | 2026-08-26 | Wanted this problem fixed: support workspacePaths, conversationId, and injectSteps in antigravity adapter. | storage/sync |
| [#3747](https://github.com/thedotmack/claude-mem/pull/3747) | external | closed unmerged | 2026-08-26 | Wanted this problem fixed: detect zombie port and fail fast instead of retry loop. | reliability/bugfix |
| [#3750](https://github.com/thedotmack/claude-mem/pull/3750) | maintainer | open | 2026-08-26 | Wanted: HelixDB backend — rebased onto v13.16.1, P1s fixed, SDK 3.x, live-tested against a production DB copy. | other |
| [#3751](https://github.com/thedotmack/claude-mem/pull/3751) | maintainer | merged | 2026-08-26 | Wanted: cmem Backups — automatic snapshots + encrypted cloud copies as a Pro add-on. | storage/sync |
| [#3756](https://github.com/thedotmack/claude-mem/pull/3756) | external | closed unmerged | 2026-08-27 | Wanted this problem fixed: stop an unparseable Bash command from blocking the tool call. | new tool integration |
| [#3758](https://github.com/thedotmack/claude-mem/pull/3758) | external | closed unmerged | 2026-08-27 | Wanted this problem fixed: fail open when stdin cannot be read, instead of exit 2. | capture/hooks |
| [#3760](https://github.com/thedotmack/claude-mem/pull/3760) | external | closed unmerged | 2026-08-27 | Wanted this problem fixed: pause the session on a reactive quota error instead of ending it. | cost/models |
| [#3765](https://github.com/thedotmack/claude-mem/pull/3765) | external | closed unmerged | 2026-08-27 | Wanted this problem fixed: scope memory reads to the current repository. | other |
| [#3770](https://github.com/thedotmack/claude-mem/pull/3770) | external | closed unmerged | 2026-08-27 | Wanted this problem fixed: support max_completion_tokens compatibility (closes #3712). | cost/models |
| [#3790](https://github.com/thedotmack/claude-mem/pull/3790) | maintainer | merged | 2026-08-28 | Wanted: show assigned trial length in installer. | install/platform |
| [#3792](https://github.com/thedotmack/claude-mem/pull/3792) | maintainer | merged | 2026-08-29 | Wanted: track installer trial offer exposure. | install/platform |
| [#3796](https://github.com/thedotmack/claude-mem/pull/3796) | external | closed unmerged | 2026-08-29 | Wanted this problem fixed: configure provider request timeout (#3794). | cost/models |
| [#3798](https://github.com/thedotmack/claude-mem/pull/3798) | maintainer | merged | 2026-08-29 | Wanted: always offer the 30-day trial. | other |
| [#3805](https://github.com/thedotmack/claude-mem/pull/3805) | external | closed unmerged | 2026-08-30 | Wanted: add isolated persistent Codex app-server provider. | cost/models |
| [#3809](https://github.com/thedotmack/claude-mem/pull/3809) | external | closed unmerged | 2026-08-31 | Wanted this problem fixed: recycle the conversation when the provider rejects the prompt as too long. | cost/models |
| [#3811](https://github.com/thedotmack/claude-mem/pull/3811) | external | closed unmerged | 2026-08-31 | Wanted this problem fixed: fit the session block to the hook output limit by selection. | capture/hooks |
| [#3817](https://github.com/thedotmack/claude-mem/pull/3817) | maintainer | merged | 2026-08-31 | Wanted: observer sessions stay silent and never contact other agents. | other |
| [#3827](https://github.com/thedotmack/claude-mem/pull/3827) | maintainer | open | 2026-08-31 | Wanted this problem fixed: put the provider choice first and collapse the browser trip. | cost/models |
| [#3836](https://github.com/thedotmack/claude-mem/pull/3836) | maintainer | merged | 2026-09-01 | Wanted: report observed model, source, and billing tier to PostHog. | cost/models |
| [#3837](https://github.com/thedotmack/claude-mem/pull/3837) | maintainer | merged | 2026-09-01 | Wanted: report subscription usage-limit hits to PostHog. | cost/models |
| [#3853](https://github.com/thedotmack/claude-mem/pull/3853) | external | open | 2026-09-03 | Wanted: capture lifecycle hooks instead of MCP-only. | new tool integration |
| [#3869](https://github.com/thedotmack/claude-mem/pull/3869) | external | closed unmerged | 2026-09-04 | Wanted this problem fixed: don't confirm the queued batch on mid-stream empty SDK chunks. | UI |
| [#3882](https://github.com/thedotmack/claude-mem/pull/3882) | external | merged | 2026-09-05 | Wanted: add native Codex subscription provider (minimal core). | cost/models |
| [#3889](https://github.com/thedotmack/claude-mem/pull/3889) | maintainer | merged | 2026-09-06 | Wanted: read-only Observation TV broadcast behind CLAUDE_MEM_TV_TOKEN. | UI |
| [#3898](https://github.com/thedotmack/claude-mem/pull/3898) | maintainer | merged | 2026-09-07 | Wanted: durable tool_uses backup index + get_tool_uses progressive disclosure. | storage/sync |
| [#3904](https://github.com/thedotmack/claude-mem/pull/3904) | external | closed unmerged | 2026-09-07 | Wanted this problem fixed: ignore inactive overage utilization. | cost/models |
| [#3911](https://github.com/thedotmack/claude-mem/pull/3911) | external | closed unmerged | 2026-09-08 | Wanted this problem fixed: skip incomplete Codex plugin cache roots. | performance |
| [#3913](https://github.com/thedotmack/claude-mem/pull/3913) | external | closed unmerged | 2026-09-08 | Wanted this problem fixed: validate Bun paths returned by where. | install/platform |
| [#3918](https://github.com/thedotmack/claude-mem/pull/3918) | external | closed unmerged | 2026-09-08 | Wanted this problem fixed: ignore inactive overage utilization. | cost/models |
| [#3920](https://github.com/thedotmack/claude-mem/pull/3920) | external | closed unmerged | 2026-09-08 | Wanted this problem fixed: clarify non-interactive provider requirements. | cost/models |
| [#3923](https://github.com/thedotmack/claude-mem/pull/3923) | external | closed unmerged | 2026-09-08 | Wanted this problem fixed: reap chroma-mcp trees no worker owns at boot. | reliability/bugfix |
| [#3925](https://github.com/thedotmack/claude-mem/pull/3925) | maintainer | open | 2026-09-08 | Wanted: Plan: Skill Telemetry — PostHog events for bundled skills. | other |
| [#3931](https://github.com/thedotmack/claude-mem/pull/3931) | maintainer | merged | 2026-09-09 | Wanted: Phase 0+1 awareness breathing for LFG and Orifice. | other |
| [#3934](https://github.com/thedotmack/claude-mem/pull/3934) | maintainer | merged | 2026-09-09 | Wanted: Phase 0 breathing slice — worker health + three-layer pull + atomic middle cache. | performance |
| [#3935](https://github.com/thedotmack/claude-mem/pull/3935) | maintainer | merged | 2026-09-09 | Wanted: Phase 1 exclude marks — compile-time omit from middle cache. | performance |
| [#3936](https://github.com/thedotmack/claude-mem/pull/3936) | maintainer | merged | 2026-09-09 | Wanted: Phase 2 rules alignment — house → project → seat conflict walk. | other |
| [#3941](https://github.com/thedotmack/claude-mem/pull/3941) | external | merged | 2026-09-09 | Wanted: rotate through multiple API keys on rate limit or quota exhaustion. | cost/models |
| [#3942](https://github.com/thedotmack/claude-mem/pull/3942) | external | merged | 2026-09-09 | Wanted: add openai-compatible provider with an NVIDIA NIM preset. | cost/models |
| [#3943](https://github.com/thedotmack/claude-mem/pull/3943) | external | closed unmerged | 2026-09-09 | Wanted this problem fixed: map the model list onto the native models[] fallback array. | cost/models |
| [#3946](https://github.com/thedotmack/claude-mem/pull/3946) | external | closed unmerged | 2026-09-09 | Wanted this problem fixed: reap an unreadable writer lock once it is past the write grace period. | reliability/bugfix |
| [#3953](https://github.com/thedotmack/claude-mem/pull/3953) | maintainer | merged | 2026-09-10 | Wanted: silent Claude-Mem session inject into the Grok Bot prompt path. | search/retrieval quality |
| [#3959](https://github.com/thedotmack/claude-mem/pull/3959) | maintainer | merged | 2026-09-10 | Wanted: Phase 1 hack-on-Memory JIT — rich timeline INDEX. | other |
| [#3960](https://github.com/thedotmack/claude-mem/pull/3960) | maintainer | merged | 2026-09-10 | Wanted: skill_invoked for bundled skills. | other |
| [#4024](https://github.com/thedotmack/claude-mem/pull/4024) | external | closed unmerged | 2026-09-11 | Wanted this problem fixed: register a memory_session_id, do not re-register it. | storage/sync |
| [#4073](https://github.com/thedotmack/claude-mem/pull/4073) | maintainer | merged | 2026-09-13 | Wanted: session wrap-up notifications from the Stop summary (plan 26). | new tool integration |
| [#4082](https://github.com/thedotmack/claude-mem/pull/4082) | external | closed unmerged | 2026-09-14 | Wanted this problem fixed: reserve hook stdout for the model payload (#4081). | capture/hooks |
| [#4093](https://github.com/thedotmack/claude-mem/pull/4093) | external | closed unmerged | 2026-09-15 | Wanted this problem fixed: ignore inactive overage utilization. | cost/models |
| [#4095](https://github.com/thedotmack/claude-mem/pull/4095) | maintainer | merged | 2026-09-16 | Wanted: live-write growing Memory INDEX from the worker. | other |
| [#4119](https://github.com/thedotmack/claude-mem/pull/4119) | external | merged | 2026-09-18 | Wanted this problem fixed: avoid false worker-shutdown failures on Bun timeouts. | other |
| [#4147](https://github.com/thedotmack/claude-mem/pull/4147) | external | merged | 2026-09-20 | Wanted: Antigravity source attribution, and a clear Gemini region-restriction pause. | cost/models |
| [#4156](https://github.com/thedotmack/claude-mem/pull/4156) | external | open | 2026-09-21 | Wanted this problem fixed: rebase a conflicted entity instead of stalling the push queue. | storage/sync |
| [#4160](https://github.com/thedotmack/claude-mem/pull/4160) | external | closed unmerged | 2026-09-21 | Wanted this problem fixed: index canonical_ops range scans and stop counting the log per status. | storage/sync |
| [#4201](https://github.com/thedotmack/claude-mem/pull/4201) | external | closed unmerged | 2026-09-22 | Wanted: Claude code backfill. | storage/sync |
| [#4210](https://github.com/thedotmack/claude-mem/pull/4210) | maintainer | open | 2026-09-23 | Wanted: add Agent Cost Report (Claude-Mem). | cost/models |
| [#4213](https://github.com/thedotmack/claude-mem/pull/4213) | external | closed unmerged | 2026-09-24 | Wanted: add Adam Network Model Context Protocol integration. | storage/sync |
| [#4237](https://github.com/thedotmack/claude-mem/pull/4237) | maintainer | merged | 2026-09-26 | Wanted: optional standing line in live INDEX (CLAUDE_MEM_GROK_BOT_INJECT_STANDING_LINE). | search/retrieval quality |
| [#4238](https://github.com/thedotmack/claude-mem/pull/4238) | maintainer | merged | 2026-09-26 | Wanted: weekly rebuild — transcript-measured dollars, Timing-style report, behavior metrics. | cost/models |
| [#4241](https://github.com/thedotmack/claude-mem/pull/4241) | maintainer | merged | 2026-09-26 | Wanted: read-only GitHub merged-PR wins source. | cost/models |
| [#4251](https://github.com/thedotmack/claude-mem/pull/4251) | external | merged | 2026-09-27 | Wanted: make SessionStart source filtering configurable. | search/retrieval quality |
| [#4259](https://github.com/thedotmack/claude-mem/pull/4259) | external | open | 2026-09-28 | Wanted: self-hosted end-to-end encrypted sync for Claude Code cloud sessions. | storage/sync |
| [#4260](https://github.com/thedotmack/claude-mem/pull/4260) | external | merged | 2026-09-28 | Wanted: process independent observer requests concurrently. | new tool integration |
| [#4261](https://github.com/thedotmack/claude-mem/pull/4261) | external | merged | 2026-09-28 | Wanted: batch queued observations into bounded requests. | new tool integration |
| [#4265](https://github.com/thedotmack/claude-mem/pull/4265) | maintainer | merged | 2026-09-28 | Wanted: trial copy says up to 14 days; promo links drop trial=30. | install/platform |
| [#4266](https://github.com/thedotmack/claude-mem/pull/4266) | maintainer | merged | 2026-09-28 | Wanted: send a numbers-only usage summary with the sign-in request. | install/platform |
| [#4268](https://github.com/thedotmack/claude-mem/pull/4268) | external | merged | 2026-09-29 | Wanted: opt-in quota fallback provider. | cost/models |
| [#4278](https://github.com/thedotmack/claude-mem/pull/4278) | maintainer | merged | 2026-09-30 | Wanted this problem fixed: raise the LLM request deadline above gateway latency and migrate the old default. | performance |
| [#4282](https://github.com/thedotmack/claude-mem/pull/4282) | external | open | 2026-09-30 | Wanted this problem fixed: run Claude lifecycle hooks under Grok Build on Windows. | new tool integration |
| [#4283](https://github.com/thedotmack/claude-mem/pull/4283) | maintainer | open | 2026-09-30 | Wanted: add learn-code-history skill. | other |
| [#4288](https://github.com/thedotmack/claude-mem/pull/4288) | maintainer | merged | 2026-09-30 | Wanted this problem fixed: accept browser DELETEs only from the viewer's own page. | UI |
| [#4292](https://github.com/thedotmack/claude-mem/pull/4292) | maintainer | merged | 2026-10-01 | Wanted: stabilize four load-sensitive tests. | other |
| [#4325](https://github.com/thedotmack/claude-mem/pull/4325) | external | merged | 2026-10-01 | Wanted: add API Route OpenAI-compatible preset. | cost/models |
| [#4333](https://github.com/thedotmack/claude-mem/pull/4333) | external | merged | 2026-10-02 | Wanted: add Opper OpenAI-compatible preset. | cost/models |
| [#4336](https://github.com/thedotmack/claude-mem/pull/4336) | external | merged | 2026-10-02 | Wanted: carry a bare user prompt on the next observer request. | other |
| [#4340](https://github.com/thedotmack/claude-mem/pull/4340) | maintainer | merged | 2026-10-02 | Wanted: a to-do list and working state the agent keeps in claude-mem. | other |
| [#4341](https://github.com/thedotmack/claude-mem/pull/4341) | maintainer | open | 2026-10-03 | Wanted: Add bounded media contracts and native decoder validation. | other |
| [#4350](https://github.com/thedotmack/claude-mem/pull/4350) | external | merged | 2026-10-03 | Wanted: cover v21 repair with v41 origin index. | other |
| [#4365](https://github.com/thedotmack/claude-mem/pull/4365) | external | closed unmerged | 2026-10-03 | Wanted: Update SECURITY.md with security policy details Lalita-suthimoon9. | other |
| [#4374](https://github.com/thedotmack/claude-mem/pull/4374) | maintainer | open | 2026-10-04 | Wanted: add community-sweep for landing community PRs and issues. | other |
| [#4377](https://github.com/thedotmack/claude-mem/pull/4377) | maintainer | merged | 2026-10-04 | Wanted: ship first-party Pi and DeepSeek Harness connectors. | cost/models |
| [#4379](https://github.com/thedotmack/claude-mem/pull/4379) | external | merged | 2026-10-04 | Wanted: add iFlytek Spark OpenAI-compatible preset. | cost/models |
| [#4396](https://github.com/thedotmack/claude-mem/pull/4396) | external | merged | 2026-10-04 | Wanted: make the quota guard thresholds configurable per window. | cost/models |
| [#4402](https://github.com/thedotmack/claude-mem/pull/4402) | external | closed unmerged | 2026-10-04 | Wanted this problem fixed: avoid recording Qwen sends without submitted provenance. | privacy/redaction |
| [#4424](https://github.com/thedotmack/claude-mem/pull/4424) | external | open | 2026-10-05 | Wanted this problem fixed: cut Durable Object row writes per request on the DO path. | storage/sync |
| [#4453](https://github.com/thedotmack/claude-mem/pull/4453) | maintainer | open | 2026-10-05 | Wanted: support native v2 connectors and version-aware installation. | new tool integration |
| [#4463](https://github.com/thedotmack/claude-mem/pull/4463) | external | open | 2026-10-05 | Wanted this problem fixed: preserve prototype-named canonical payload keys. | storage/sync |
| [#4518](https://github.com/thedotmack/claude-mem/pull/4518) | maintainer | open | 2026-10-05 | Wanted: Snapshot recorded query-plan assertions. | other |
| [#4519](https://github.com/thedotmack/claude-mem/pull/4519) | external | open | 2026-10-05 | Wanted this problem fixed: honor the 2.0.23 host contract — live validation of #4453. | new tool integration |
| [#4520](https://github.com/thedotmack/claude-mem/pull/4520) | maintainer | merged | 2026-10-05 | Wanted: add first-party T3 Code connector. | new tool integration |
| [#4524](https://github.com/thedotmack/claude-mem/pull/4524) | external | merged | 2026-10-05 | Wanted: opt-in idle exit via CLAUDE_MEM_IDLE_EXIT_SEC. | reliability/bugfix |
| [#4549](https://github.com/thedotmack/claude-mem/pull/4549) | maintainer | merged | 2026-10-06 | Wanted: restore the File Read Gate as a default-on setting, with evals. | capture/hooks |
| [#4553](https://github.com/thedotmack/claude-mem/pull/4553) | maintainer | merged | 2026-10-06 | Wanted: the File Read Gate denies only code files of 32 KB and up. | capture/hooks |
| [#4569](https://github.com/thedotmack/claude-mem/pull/4569) | maintainer | merged | 2026-10-06 | Wanted: sync the agent's work state to the cloud (work_state content kind). | storage/sync |
| [#4570](https://github.com/thedotmack/claude-mem/pull/4570) | maintainer | open | 2026-10-07 | Wanted: Rename the Claude app plugin to cmem-pro, carry the cmem.ai connector, stop capturing memory lookups. | other |
| [#4575](https://github.com/thedotmack/claude-mem/pull/4575) | external | open | 2026-10-07 | Wanted this problem fixed: keep the version-bump release skill maintainer-only (#4430). | other |
| [#4584](https://github.com/thedotmack/claude-mem/pull/4584) | external | merged | 2026-10-07 | Wanted: recall Screenpipe meetings and screen history in claude-mem. | new tool integration |
| [#4590](https://github.com/thedotmack/claude-mem/pull/4590) | external | merged | 2026-10-08 | Wanted: add CLAUDE_MEM_SEMANTIC_INJECT_FORMAT=index for per-prompt injection. | search/retrieval quality |
| [#4610](https://github.com/thedotmack/claude-mem/pull/4610) | external | closed unmerged | 2026-10-09 | Wanted this problem fixed: probe worker host/port from settings.json. | install/platform |
| [#4619](https://github.com/thedotmack/claude-mem/pull/4619) | maintainer | open | 2026-10-09 | Wanted: Add childhood post-release babysitting skill. | other |
| [#4622](https://github.com/thedotmack/claude-mem/pull/4622) | external | closed unmerged | 2026-10-09 | Wanted this problem fixed: default maintainer-personal integrations off. | privacy/redaction |
| [#4627](https://github.com/thedotmack/claude-mem/pull/4627) | external | closed unmerged | 2026-10-09 | Wanted this problem fixed: probe the worker port from settings.json, not the default. | install/platform |
| [#4633](https://github.com/thedotmack/claude-mem/pull/4633) | external | merged | 2026-10-10 | Wanted: add Qoder plugin support. | new tool integration |
| [#4635](https://github.com/thedotmack/claude-mem/pull/4635) | external | merged | 2026-10-10 | Wanted: add Atlas Cloud preset for the openai-compatible provider. | cost/models |
| [#4664](https://github.com/thedotmack/claude-mem/pull/4664) | external | closed unmerged | 2026-10-10 | Wanted this problem fixed: honor the verification deadline. | reliability/bugfix |
| [#4669](https://github.com/thedotmack/claude-mem/pull/4669) | external | closed unmerged | 2026-10-10 | Wanted this problem fixed: reject invalid stored calendar dates. | search/retrieval quality |
| [#4680](https://github.com/thedotmack/claude-mem/pull/4680) | external | closed unmerged | 2026-10-10 | Wanted this problem fixed: classify credit balance too low as quota-limited prose. | cost/models |
| [#4685](https://github.com/thedotmack/claude-mem/pull/4685) | external | merged | 2026-10-11 | Wanted: make OpenRouter temperature configurable in settings. | cost/models |
| [#4690](https://github.com/thedotmack/claude-mem/pull/4690) | external | open | 2026-10-11 | Wanted this problem fixed: recover observations orphaned by a quota-cooldown restart. | cost/models |
| [#4691](https://github.com/thedotmack/claude-mem/pull/4691) | external | closed unmerged | 2026-10-11 | Wanted this problem fixed: decouple SDK transcript location from the credential profile (#4689). | privacy/redaction |
| [#4700](https://github.com/thedotmack/claude-mem/pull/4700) | external | merged | 2026-10-12 | Wanted: record a verdict on review-only candidates. | search/retrieval quality |
| [#4701](https://github.com/thedotmack/claude-mem/pull/4701) | external | merged | 2026-10-12 | Wanted: opt-in retention for linked tool_uses rows. | search/retrieval quality |
| [#4727](https://github.com/thedotmack/claude-mem/pull/4727) | maintainer | merged | 2026-10-12 | Wanted: fall back to the Anthropic plan by default when the selected provider can't serve. | cost/models |
| [#4733](https://github.com/thedotmack/claude-mem/pull/4733) | maintainer | merged | 2026-10-13 | Wanted: bring the memory timeline back to subagent threads after compaction. | performance |
| [#4736](https://github.com/thedotmack/claude-mem/pull/4736) | external | merged | 2026-10-13 | Wanted: add CLAUDE_MEM_DISABLE_SUMMARY for headless read-only runs. | privacy/redaction |
| [#4743](https://github.com/thedotmack/claude-mem/pull/4743) | external | closed unmerged | 2026-10-13 | Wanted this problem fixed: preserve newer live cache renders. | performance |
| [#4760](https://github.com/thedotmack/claude-mem/pull/4760) | maintainer | merged | 2026-10-13 | Wanted: give a fresh subagent the memory timeline when it starts. | new tool integration |
| [#4769](https://github.com/thedotmack/claude-mem/pull/4769) | external | open | 2026-10-14 | Wanted this problem fixed: let an operator resend a parked batch with a fresh paid-send budget. | cost/models |
| [#4775](https://github.com/thedotmack/claude-mem/pull/4775) | external | open | 2026-10-14 | Wanted: add opencode CLI provider for Zen free-tier models. | cost/models |
| [#4776](https://github.com/thedotmack/claude-mem/pull/4776) | external | merged | 2026-10-14 | Wanted: give the NOTES summary section its own icon. | UI |
| [#4793](https://github.com/thedotmack/claude-mem/pull/4793) | external | merged | 2026-10-15 | Wanted: let the Claude observer batch queued events, opt-in. | search/retrieval quality |
| [#4799](https://github.com/thedotmack/claude-mem/pull/4799) | maintainer | merged | 2026-10-15 | Wanted: export new observations to a Notion database. | new tool integration |
| [#4800](https://github.com/thedotmack/claude-mem/pull/4800) | maintainer | open | 2026-10-15 | Wanted: wire gateway — capture agent traffic at the wire. | other |
| [#4806](https://github.com/thedotmack/claude-mem/pull/4806) | external | open | 2026-10-16 | Wanted: gate the Pro trial pitch behind CLAUDE_MEM_PRO_UPSELL (#4768). | other |
| [#4815](https://github.com/thedotmack/claude-mem/pull/4815) | maintainer | merged | 2026-10-16 | Wanted: join a team from the terminal, team brief at SessionStart, team_* MCP tools. | storage/sync |
| [#4817](https://github.com/thedotmack/claude-mem/pull/4817) | external | merged | 2026-10-16 | Wanted: opt-in CLAUDE_MEM_CONTEXT_PROJECTS=all for cross-project SessionStart context. | storage/sync |
| [#4831](https://github.com/thedotmack/claude-mem/pull/4831) | external | closed unmerged | 2026-10-17 | Wanted this problem fixed: bound the any-term fallback by document frequency, prompt size and a posting budget (#4804). | cost/models |
| [#4838](https://github.com/thedotmack/claude-mem/pull/4838) | maintainer | merged | 2026-10-17 | Wanted: bring My Work and TeamBrain into the local viewer. | storage/sync |
| [#4927](https://github.com/thedotmack/claude-mem/pull/4927) | external | merged | 2026-10-20 | Wanted: fall back between an API key and the Claude subscription login on quota. | cost/models |
| [#4937](https://github.com/thedotmack/claude-mem/pull/4937) | external | open | 2026-10-20 | Wanted this problem fixed: count projection page bytes without re-serializing the page per op. | storage/sync |
| [#4953](https://github.com/thedotmack/claude-mem/pull/4953) | external | open | 2026-10-21 | Wanted: add Delphi/Pascal support. | other |
| [#4970](https://github.com/thedotmack/claude-mem/pull/4970) | external | open | 2026-10-21 | Wanted this problem fixed: make personal integrations opt-in by default. | privacy/redaction |
| [#4975](https://github.com/thedotmack/claude-mem/pull/4975) | external | merged | 2026-10-22 | Wanted this problem fixed: find the system message by role so a leading custom message keeps capture on. | new tool integration |
| [#4980](https://github.com/thedotmack/claude-mem/pull/4980) | maintainer | merged | 2026-10-22 | Wanted: add native ODS memory integration. | other |
| [#4983](https://github.com/thedotmack/claude-mem/pull/4983) | external | closed unmerged | 2026-10-22 | Wanted this problem fixed: honor persisted data directory in Pi and DSH. | new tool integration |
| [#4999](https://github.com/thedotmack/claude-mem/pull/4999) | external | merged | 2026-10-22 | Wanted: Postgres with pgvector and pg_textsearch, and a collation job. | storage/sync |
| [#5000](https://github.com/thedotmack/claude-mem/pull/5000) | external | merged | 2026-10-22 | Wanted: rank keyword search by pg_textsearch bm25 on postgres-pgvector-textsearch. | storage/sync |
| [#5001](https://github.com/thedotmack/claude-mem/pull/5001) | external | merged | 2026-10-22 | Wanted: search by meaning with pgvector. | search/retrieval quality |
| [#5002](https://github.com/thedotmack/claude-mem/pull/5002) | external | merged | 2026-10-22 | Wanted: the server's embedding model as a setting, with multilingual models. | search/retrieval quality |
| [#5004](https://github.com/thedotmack/claude-mem/pull/5004) | external | merged | 2026-10-22 | Wanted: per-prompt semantic injection in server mode. | storage/sync |
| [#5008](https://github.com/thedotmack/claude-mem/pull/5008) | external | open | 2026-10-22 | Wanted this problem fixed: scope PreToolUse memory lookups by platform source. | capture/hooks |
| [#5022](https://github.com/thedotmack/claude-mem/pull/5022) | external | open | 2026-10-23 | Wanted: add explicit inheritance for named environments. | storage/sync |
| [#5028](https://github.com/thedotmack/claude-mem/pull/5028) | external | merged | 2026-10-23 | Wanted: add opt-in HTTP transport with per-session workspaces. | storage/sync |
| [#5042](https://github.com/thedotmack/claude-mem/pull/5042) | external | closed unmerged | 2026-10-24 | Wanted: Personal fork: preserve gateway auth, quiet promotions, control updates. | privacy/redaction |
| [#5049](https://github.com/thedotmack/claude-mem/pull/5049) | external | merged | 2026-10-24 | Wanted: Claude provider reads a gateway base URL and custom headers. | cost/models |
| [#5059](https://github.com/thedotmack/claude-mem/pull/5059) | external | open | 2026-10-25 | Wanted: add APIClaw OpenAI-compatible preset. | cost/models |
| [#5065](https://github.com/thedotmack/claude-mem/pull/5065) | maintainer | open | 2026-10-25 | Wanted: Keep My Work live state coherent with Zustand. | UI |
| [#5067](https://github.com/thedotmack/claude-mem/pull/5067) | external | merged | 2026-10-26 | Wanted: add Runcrate preset for the openai-compatible provider. | cost/models |
| [#5080](https://github.com/thedotmack/claude-mem/pull/5080) | external | open | 2026-10-26 | Wanted this problem fixed: redact the SecretAccessKey of aws sts JSON output. | privacy/redaction |
| [#5081](https://github.com/thedotmack/claude-mem/pull/5081) | external | open | 2026-10-26 | Wanted: ci(windows): cover more host-sensitive suites. | other |
| [#5082](https://github.com/thedotmack/claude-mem/pull/5082) | external | open | 2026-10-26 | Wanted: derive manifest coverage from package.json files. | other |
| [#5083](https://github.com/thedotmack/claude-mem/pull/5083) | external | open | 2026-10-26 | Wanted this problem fixed: sync every shipped plugin manifest version. | storage/sync |
| [#5084](https://github.com/thedotmack/claude-mem/pull/5084) | external | open | 2026-10-26 | Wanted this problem fixed: leave room for the SessionStart footer in the terminal preview (#5079). | UI |
| [#5085](https://github.com/thedotmack/claude-mem/pull/5085) | external | open | 2026-10-26 | Wanted this problem fixed: stop registering PreToolUse, which auto-approved every agy tool call (#5078). | new tool integration |
| [#5086](https://github.com/thedotmack/claude-mem/pull/5086) | external | open | 2026-10-26 | Wanted this problem fixed: say in install help which providers need a cmem.ai sign-in (#4131). | install/platform |
| [#5087](https://github.com/thedotmack/claude-mem/pull/5087) | external | open | 2026-10-26 | Wanted: say the observer trial goes through a payment-method checkout (#4605). | other |

## 2. Recurring needs, ranked by number of PRs

Counts are PRs in the table above, one primary theme each. Needs marked "claude-mem internal" come from its worker, Bun and Chroma design; Aletheia has none of that machinery, so they mostly do not transfer.

| Rank | Need | PRs | Example PRs | Does Aletheia have it today (evidence) | Suggested task title |
|---|---|---|---|---|---|
| 1 | Support another AI tool or host (hooks, plugin, adapter, MCP) (T03) | 81 (ext open 4, ext merged 10, ext closed unmerged 58, maintainer 9) | [#1309](https://github.com/thedotmack/claude-mem/pull/1309), [#1012](https://github.com/thedotmack/claude-mem/pull/1012), [#1233](https://github.com/thedotmack/claude-mem/pull/1233) | src/hub/tools.mjs:19-30 lists 10 tools (Claude Code, Command Code, Codex, Gemini CLI, Cursor, Windsurf, OpenCode, Copilot, Aider, AGENTS.md); automatic hooks only for Claude Code and Command Code (src/hub/hooks/claude-code.mjs:6, src/hub/hooks/command-code.mjs). No hook adapter for Codex, Cursor, Kimi, OpenCode, Antigravity, Pi, Kiro, Qoder, iFlow, OpenClaw. Status: partial. | Add a hook or transcript adapter per tool, one tool per task, starting with Codex, OpenCode, Kimi, Antigravity (see section 4) |
| 2 | OpenAI-compatible, OpenRouter or other model providers for the observer (T01) | 72 (ext open 4, ext merged 18, ext closed unmerged 44, maintainer 6) | [#3034](https://github.com/thedotmack/claude-mem/pull/3034), [#3942](https://github.com/thedotmack/claude-mem/pull/3942), [#3882](https://github.com/thedotmack/claude-mem/pull/3882) | src/refresh/providers.mjs:3-4 offers `claude-cli` and one OpenAI-compatible endpoint (`ALETHEIA_OPENAI_*`). No named presets, no Anthropic-shape gateway, no Bedrock. Status: partial. | Add provider presets for common OpenAI-compatible hosts and a custom Anthropic-style gateway (matrix task T-034) |
| 3 | Worker and subprocess lifecycle: orphans, memory, restarts, idle exit (T08) | 71 (ext open 3, ext merged 2, ext closed unmerged 62, maintainer 4) | [#1645](https://github.com/thedotmack/claude-mem/pull/1645), [#242](https://github.com/thedotmack/claude-mem/pull/242), [#1698](https://github.com/thedotmack/claude-mem/pull/1698) | Not applicable by design: Aletheia has one process, no Chroma or SDK subprocess, no worker pool (src/server.mjs:151 serves in process). Status: n/a. Risk moves to the hook spool: src/hub/hooks/run.mjs:3. | No task. Add a kill-the-process test for the hook spool (matrix T-009) |
| 4 | Hooks that fail open, run fast and survive compaction (T17) | 64 (ext open 3, ext merged 2, ext closed unmerged 53, maintainer 6) | [#139](https://github.com/thedotmack/claude-mem/pull/139), [#1696](https://github.com/thedotmack/claude-mem/pull/1696), [#201](https://github.com/thedotmack/claude-mem/pull/201) | src/hub/hooks/run.mjs:3-37 spools redacted items to a local file when the server is down and flushes on the next hook. SessionStart context injection exists in src/hub/hooks/claude-code.mjs:32-34. No PreCompact hook (EVENTS list at claude-code.mjs:6 has five events, none is PreCompact). Status: partial. | Add a PreCompact and post-compaction re-injection hook for Claude Code |
| 5 | Windows, Linux and macOS install and process stability (T07) | 57 (ext open 1, ext merged 1, ext closed unmerged 48, maintainer 7) | [#1694](https://github.com/thedotmack/claude-mem/pull/1694), [#1258](https://github.com/thedotmack/claude-mem/pull/1258), [#2076](https://github.com/thedotmack/claude-mem/pull/2076) | No `win32` branch anywhere in src, bin or scripts (grep, empty). Windows CI missing (matrix F-O06, T-014). `aletheia doctor` exists (bin/aletheia.mjs:16). Status: partial, Windows untested. | Add Linux, macOS and Windows CI and a Windows path test (matrix T-014) |
| 6 | Sync, backup, team sharing, multi-node or hosted server (Postgres, cloud, network) (T13) | 52 (ext open 6, ext merged 3, ext closed unmerged 37, maintainer 6) | [#3584](https://github.com/thedotmack/claude-mem/pull/3584), [#1722](https://github.com/thedotmack/claude-mem/pull/1722), [#2544](https://github.com/thedotmack/claude-mem/pull/2544) | No sync code: grep for `sync|tombstone` in src/hub/store.mjs hits only `PRAGMA synchronous` (store.mjs:99). Bundle export and import exist (src/hub/store.mjs:431,492 per docs/20). Status: missing; planned as T-103, T-108, T-112. | Self-hosted sync with end-to-end encryption (builds on T-103 tombstones) |
| 7 | Privacy: redact secrets, harden auth, bind to localhost, safe deletion (T06) | 35 (ext open 1, ext merged 1, ext closed unmerged 30, maintainer 3) | [#1157](https://github.com/thedotmack/claude-mem/pull/1157), [#2081](https://github.com/thedotmack/claude-mem/pull/2081), [#2080](https://github.com/thedotmack/claude-mem/pull/2080) | Secrets redacted before storage (src/hub/capture.mjs:3-7, src/hub/redact.mjs), `<private>` blocks dropped (src/hub/redact.mjs:23), loopback bind (src/config.mjs:22), optional bearer key (src/config.mjs:38). File permissions and untrusted-memory wrapping missing (T-010, T-011). Status: partial, ahead of upstream on redaction. | Add cloud-credential patterns to the redactor (AWS STS JSON, as in PR 5080) and a redaction test corpus |
| 8 | Share or scope memory across projects, worktrees, repos, branches, environments (T12) | 25 (ext open 1, ext merged 4, ext closed unmerged 17, maintainer 3) | [#554](https://github.com/thedotmack/claude-mem/pull/554), [#1246](https://github.com/thedotmack/claude-mem/pull/1246), [#2827](https://github.com/thedotmack/claude-mem/pull/2827) | My Work groups worktrees under one repo key (src/readmodel/project.mjs:1-48). Hook project key is derived from the path without git (src/hub/hooks/shared.mjs:35-40). No named environments, no all-projects context (matrix F-X04, T-016). Status: partial. | Project aliases, worktree-aware hub keys and an all-projects context option (T-016) |
| 9 | Quota or rate-limit fallback, key rotation, spend guard (T02) | 24 (ext open 2, ext merged 6, ext closed unmerged 11, maintainer 5) | [#1693](https://github.com/thedotmack/claude-mem/pull/1693), [#4238](https://github.com/thedotmack/claude-mem/pull/4238), [#3941](https://github.com/thedotmack/claude-mem/pull/3941) | grep for `quota|rate.?limit|429` in src and bin returns nothing. Status: missing. | Provider fallback chain with a per-provider quota guard |
| 10 | Exclude or disable memory per project, session or run (opt-out) (T05) | 18 (ext open 1, ext merged 3, ext closed unmerged 11, maintainer 3) | [#2073](https://github.com/thedotmack/claude-mem/pull/2073), [#3316](https://github.com/thedotmack/claude-mem/pull/3316), [#2741](https://github.com/thedotmack/claude-mem/pull/2741) | Only a fixed tool skip list: SKIP_TOOLS in src/hub/capture.mjs:11. No excluded projects, no disable switch (grep for `DISABLED|exclude` in src/config.mjs and capture.mjs is empty). Status: missing; matrix T-016. | Excluded projects, a one-variable disable switch for headless runs, and a subagent filter (T-016) |
| 11 | Stop generated CLAUDE.md files in project folders, or make them optional (T04) | 17 (ext open 0, ext merged 0, ext closed unmerged 16, maintainer 1) | [#589](https://github.com/thedotmack/claude-mem/pull/589), [#556](https://github.com/thedotmack/claude-mem/pull/556), [#823](https://github.com/thedotmack/claude-mem/pull/823) | Not applicable: rules sync writes one managed block into a file the user already has (src/hub/rules-sync.mjs:2), plus one owned file for Cursor (src/hub/tools.mjs:24); it creates no per-folder CLAUDE.md files. Status: better by design. | Document the no-folder-files guarantee in the README and add a test that no sync writes a new nested file |
| 12 | Dedup and noise reduction (near-duplicates, ignore prompts, fold repeats) (T11) | 17 (ext open 0, ext merged 4, ext closed unmerged 12, maintainer 1) | [#3063](https://github.com/thedotmack/claude-mem/pull/3063), [#2627](https://github.com/thedotmack/claude-mem/pull/2627), [#2856](https://github.com/thedotmack/claude-mem/pull/2856) | Only exact-match dedup: `content_hash TEXT NOT NULL UNIQUE` (src/hub/store.mjs:45). No near-duplicate step (T-028). Status: partial. | Near-duplicate detection with an audit trail (T-028, T-029) |
| 13 | More MCP tools or a network MCP transport (save, delete, session lookup, HTTP) (T20) | 15 (ext open 0, ext merged 0, ext closed unmerged 14, maintainer 1) | [#2594](https://github.com/thedotmack/claude-mem/pull/2594), [#2567](https://github.com/thedotmack/claude-mem/pull/2567), [#2489](https://github.com/thedotmack/claude-mem/pull/2489) | src/hub/mcp.mjs:12-15 defines search, timeline, get_observations, save_memory (8 lines match `grep -c 'name: "'` in that file). stdio only; no HTTP transport (T-067). No delete tool over MCP (grep empty). Status: partial. | Streamable HTTP MCP transport (T-067) and an MCP delete/forget tool |
| 14 | Tune what is injected at session start (budget, filters, format, diagram, semantic) (T19) | 14 (ext open 0, ext merged 2, ext closed unmerged 10, maintainer 2) | [#2867](https://github.com/thedotmack/claude-mem/pull/2867), [#2777](https://github.com/thedotmack/claude-mem/pull/2777), [#2858](https://github.com/thedotmack/claude-mem/pull/2858) | `store.context` caps at 6,000 characters (src/hub/store.mjs:364); SessionStart injection exists (src/hub/hooks/claude-code.mjs:32-34). No source filter, no per-prompt semantic injection (T-044), no preview (T-077). Status: partial. | Configurable SessionStart context (budget, filters, all projects) with a preview |
| 15 | Viewer and dashboard improvements (feed, health, cost panel, model name) (T18) | 14 (ext open 1, ext merged 2, ext closed unmerged 8, maintainer 3) | [#3323](https://github.com/thedotmack/claude-mem/pull/3323), [#3869](https://github.com/thedotmack/claude-mem/pull/3869), [#5084](https://github.com/thedotmack/claude-mem/pull/5084) | Hub UI exists (public-hub/); no live stream, cost panel or health indicator (matrix F-U02, F-U13). Status: partial. | Live memory feed and a worker/hook health badge in the Hub |
| 16 | Back-fill history or migrate memory (transcripts, old sessions, import/export) (T16) | 12 (ext open 1, ext merged 0, ext closed unmerged 11, maintainer 0) | [#1463](https://github.com/thedotmack/claude-mem/pull/1463), [#332](https://github.com/thedotmack/claude-mem/pull/332), [#2833](https://github.com/thedotmack/claude-mem/pull/2833) | claude-mem database import is read-only (src/hub/importers.mjs:11). No transcript back-fill (grep `transcript` in src, bin hits only src/app.mjs:21 comment). Status: partial. | Back-fill from Claude Code and Codex transcript files (T-063) |
| 17 | Delete, dismiss or edit memories from viewer, CLI or MCP (T14) | 10 (ext open 0, ext merged 2, ext closed unmerged 7, maintainer 1) | [#3284](https://github.com/thedotmack/claude-mem/pull/3284), [#2925](https://github.com/thedotmack/claude-mem/pull/2925), [#3114](https://github.com/thedotmack/claude-mem/pull/3114) | Delete by id exists: `remove` (src/hub/store.mjs:182) and `DELETE` route (src/hub/routes.mjs:136). No reversible dismiss, no MCP delete. Status: partial. | Reversible dismiss for memories plus an MCP forget tool |
| 18 | Better ranking and retrieval (hybrid, rerank, temporal, reinforcement) (T10) | 10 (ext open 0, ext merged 1, ext closed unmerged 9, maintainer 0) | [#3414](https://github.com/thedotmack/claude-mem/pull/3414), [#1611](https://github.com/thedotmack/claude-mem/pull/1611), [#1257](https://github.com/thedotmack/claude-mem/pull/1257) | Hybrid BM25 plus dense with RRF and optional rerank (src/hub/retrieval.mjs, src/hub/rerank.mjs). No temporal or reinforcement ranking (T-030). Status: partial, ahead on rerank. | Recency and reinforcement ranking (T-030) |
| 19 | Vector search, embeddings and Chroma control (custom model, disable, reconnect) (T09) | 9 (ext open 0, ext merged 5, ext closed unmerged 4, maintainer 0) | [#3422](https://github.com/thedotmack/claude-mem/pull/3422), [#5001](https://github.com/thedotmack/claude-mem/pull/5001), [#1134](https://github.com/thedotmack/claude-mem/pull/1134) | Optional in-process embeddings with a fixed default model (src/hub/embed.mjs:7). No setting for another model. Status: partial. | Make the embedding model a setting, with a multilingual option |
| 20 | Translate the UI, README or observations into another language (T15) | 8 (ext open 0, ext merged 0, ext closed unmerged 8, maintainer 0) | [#2623](https://github.com/thedotmack/claude-mem/pull/2623), [#1669](https://github.com/thedotmack/claude-mem/pull/1669), [#1078](https://github.com/thedotmack/claude-mem/pull/1078) | grep for `language|locale` in src/config.mjs and src/hub/compress.mjs finds only a human-copy comment (src/config.mjs:48). Status: missing. | Output-language setting for extracted memories |

Reading the ranking:

- Rows 3, 4 and 5 (worker lifecycle, hooks, Windows) are claude-mem internal. Together 192 PRs, mostly bug fixes. For Aletheia the lesson is narrower: hooks must fail open and run fast, and Windows needs CI before anyone relies on it.
- The two biggest portable needs are "work with my other AI tool" (row 1) and "let me pick my own model/provider" (row 2). Rows 1 and 2 together are 153 PRs, of which 10 + 18 external ones merged and 58 + 44 closed unmerged.
- Money matters to users: row 9 (quota, spend, batching) and the provider presets in row 2 come from people who pay per token.

## 3. Open PRs (all 57 non-bot), read for what is waiting

External open PRs that show a live need (state `open`, fetched this run):

| PR | What it shows |
|---|---|
| [#2523](https://github.com/thedotmack/claude-mem/pull/2523) | Gemini through Vertex AI (enterprise cloud model access) |
| [#2583](https://github.com/thedotmack/claude-mem/pull/2583) | PreCompact hook to save state before context compaction |
| [#2833](https://github.com/thedotmack/claude-mem/pull/2833) | Back-fill old Claude Code transcripts |
| [#3034](https://github.com/thedotmack/claude-mem/pull/3034) | Agy (Antigravity) CLI as an observation provider (12 comments) |
| [#3192](https://github.com/thedotmack/claude-mem/pull/3192) | Recycle the Chroma subprocess when its memory passes a limit |
| [#3694](https://github.com/thedotmack/claude-mem/pull/3694) | Search by meaning inside the worker, no Python subprocess |
| [#3853](https://github.com/thedotmack/claude-mem/pull/3853) | Copilot CLI lifecycle hooks, not only MCP |
| [#4156](https://github.com/thedotmack/claude-mem/pull/4156) | Sync conflict handling that does not stall the push queue |
| [#4259](https://github.com/thedotmack/claude-mem/pull/4259) | Self-hosted, end-to-end encrypted sync (5 comments) |
| [#4282](https://github.com/thedotmack/claude-mem/pull/4282) | Lifecycle hooks under Grok Build on Windows |
| [#4775](https://github.com/thedotmack/claude-mem/pull/4775) | OpenCode CLI as observer provider for free-tier models |
| [#4953](https://github.com/thedotmack/claude-mem/pull/4953) | Delphi/Pascal in smart-read |
| [#4970](https://github.com/thedotmack/claude-mem/pull/4970) | Personal integrations opt-in by default |
| [#5008](https://github.com/thedotmack/claude-mem/pull/5008) | Scope memory lookups by platform source |
| [#5022](https://github.com/thedotmack/claude-mem/pull/5022) | Explicit inheritance for named environments |
| [#5059](https://github.com/thedotmack/claude-mem/pull/5059) | APIClaw as an OpenAI-compatible preset |
| [#5080](https://github.com/thedotmack/claude-mem/pull/5080) | Redact the SecretAccessKey in `aws sts` JSON output (2 reactions) |
| [#5085](https://github.com/thedotmack/claude-mem/pull/5085) | Antigravity: stop registering PreToolUse, which auto-approved every tool call |

The other 39 open non-bot PRs are 23 from the maintainer and 16 external ones (CI, version sync, hooks, sync fixes, one more Antigravity fix, docs). All are in the table above.

## 4. Platform and tool integrations requested by PR

Counts are PRs whose **title** names the tool, over the analysed set (open, merged feat in last 90 days, top 40s, closed-unmerged external). "Ext merged" is a lower bound: merged PRs older than 90 days that are not in the top 40s are not in the set. Columns: tool | all PRs | external | ext merged | ext open | ext closed unmerged | example PRs.

| Tool | All | Ext | Ext merged | Ext open | Ext closed unmerged | Examples |
|---|---|---|---|---|---|---|
| Codex CLI / Codex app | 32 | 30 | 4 | 1 | 25 | [#3034](https://github.com/thedotmack/claude-mem/pull/3034), [#3882](https://github.com/thedotmack/claude-mem/pull/3882), [#4261](https://github.com/thedotmack/claude-mem/pull/4261), [#4260](https://github.com/thedotmack/claude-mem/pull/4260) |
| OpenCode | 18 | 17 | 1 | 2 | 14 | [#3623](https://github.com/thedotmack/claude-mem/pull/3623), [#2557](https://github.com/thedotmack/claude-mem/pull/2557), [#3570](https://github.com/thedotmack/claude-mem/pull/3570), [#334](https://github.com/thedotmack/claude-mem/pull/334) |
| OpenClaw/Clawdbot | 9 | 7 | 0 | 0 | 7 | [#1012](https://github.com/thedotmack/claude-mem/pull/1012), [#1076](https://github.com/thedotmack/claude-mem/pull/1076), [#1092](https://github.com/thedotmack/claude-mem/pull/1092), [#2517](https://github.com/thedotmack/claude-mem/pull/2517) |
| Antigravity (agy) | 7 | 7 | 1 | 2 | 4 | [#3034](https://github.com/thedotmack/claude-mem/pull/3034), [#3742](https://github.com/thedotmack/claude-mem/pull/3742), [#5085](https://github.com/thedotmack/claude-mem/pull/5085), [#4147](https://github.com/thedotmack/claude-mem/pull/4147) |
| Cursor | 6 | 6 | 1 | 0 | 5 | [#3049](https://github.com/thedotmack/claude-mem/pull/3049), [#1087](https://github.com/thedotmack/claude-mem/pull/1087), [#1406](https://github.com/thedotmack/claude-mem/pull/1406), [#1387](https://github.com/thedotmack/claude-mem/pull/1387) |
| Pi (pi-mono) / Oh My Pi | 6 | 5 | 2 | 0 | 3 | [#3556](https://github.com/thedotmack/claude-mem/pull/3556), [#4975](https://github.com/thedotmack/claude-mem/pull/4975), [#4377](https://github.com/thedotmack/claude-mem/pull/4377), [#2532](https://github.com/thedotmack/claude-mem/pull/2532) |
| AWS Bedrock | 5 | 5 | 0 | 0 | 5 | [#1758](https://github.com/thedotmack/claude-mem/pull/1758), [#1463](https://github.com/thedotmack/claude-mem/pull/1463), [#2629](https://github.com/thedotmack/claude-mem/pull/2629), [#3060](https://github.com/thedotmack/claude-mem/pull/3060) |
| Kimi Code CLI | 4 | 4 | 2 | 0 | 2 | [#3676](https://github.com/thedotmack/claude-mem/pull/3676), [#3547](https://github.com/thedotmack/claude-mem/pull/3547), [#2908](https://github.com/thedotmack/claude-mem/pull/2908), [#3156](https://github.com/thedotmack/claude-mem/pull/3156) |
| Claude app / Cowork | 4 | 0 | 0 | 0 | 0 | [#1309](https://github.com/thedotmack/claude-mem/pull/1309), [#3707](https://github.com/thedotmack/claude-mem/pull/3707), [#4570](https://github.com/thedotmack/claude-mem/pull/4570), [#3733](https://github.com/thedotmack/claude-mem/pull/3733) |
| Telegram | 4 | 2 | 0 | 0 | 2 | [#1114](https://github.com/thedotmack/claude-mem/pull/1114), [#1109](https://github.com/thedotmack/claude-mem/pull/1109), [#3468](https://github.com/thedotmack/claude-mem/pull/3468), [#4073](https://github.com/thedotmack/claude-mem/pull/4073) |
| DeepSeek Harness | 3 | 2 | 1 | 0 | 1 | [#3691](https://github.com/thedotmack/claude-mem/pull/3691), [#4377](https://github.com/thedotmack/claude-mem/pull/4377), [#4983](https://github.com/thedotmack/claude-mem/pull/4983) |
| Ollama / local models | 3 | 3 | 0 | 0 | 3 | [#3154](https://github.com/thedotmack/claude-mem/pull/3154), [#1655](https://github.com/thedotmack/claude-mem/pull/1655), [#1630](https://github.com/thedotmack/claude-mem/pull/1630) |
| Gemini CLI | 2 | 1 | 0 | 0 | 1 | [#1592](https://github.com/thedotmack/claude-mem/pull/1592), [#2764](https://github.com/thedotmack/claude-mem/pull/2764) |
| iFlow CLI | 2 | 2 | 0 | 0 | 2 | [#1355](https://github.com/thedotmack/claude-mem/pull/1355), [#1350](https://github.com/thedotmack/claude-mem/pull/1350) |
| GitHub Copilot (CLI/provider) | 2 | 2 | 0 | 1 | 1 | [#3853](https://github.com/thedotmack/claude-mem/pull/3853), [#1207](https://github.com/thedotmack/claude-mem/pull/1207) |
| Amazon Kiro CLI | 1 | 1 | 0 | 0 | 1 | [#3125](https://github.com/thedotmack/claude-mem/pull/3125) |
| Qoder | 1 | 1 | 1 | 0 | 0 | [#4633](https://github.com/thedotmack/claude-mem/pull/4633) |
| T3 Code | 1 | 0 | 0 | 0 | 0 | [#4520](https://github.com/thedotmack/claude-mem/pull/4520) |
| Windsurf | 1 | 1 | 0 | 0 | 1 | [#3670](https://github.com/thedotmack/claude-mem/pull/3670) |
| Grok Build | 1 | 1 | 0 | 1 | 0 | [#4282](https://github.com/thedotmack/claude-mem/pull/4282) |
| VS Code | 1 | 1 | 0 | 0 | 1 | [#1304](https://github.com/thedotmack/claude-mem/pull/1304) |
| Screenpipe | 1 | 1 | 1 | 0 | 0 | [#4584](https://github.com/thedotmack/claude-mem/pull/4584) |
| Notion | 1 | 0 | 0 | 0 | 0 | [#4799](https://github.com/thedotmack/claude-mem/pull/4799) |
| Obsidian / vault | 1 | 1 | 0 | 0 | 1 | [#1275](https://github.com/thedotmack/claude-mem/pull/1275) |

What this says:

- **Codex** (hooks, transcripts, provider, subagents) is the most requested target by a wide margin: 32 PRs, 30 external.
- **OpenCode** is second (18 PRs). #1233 got 11 reactions and 5 comments and was closed by the maintainer without a merge.
- **OpenClaw, Kimi, Antigravity, Cursor, Pi** each have 4 to 9 PRs.
- **Hermes and Zed**: zero PRs name them in the analysed set. Aletheia's own matrix lists Hermes (F-I21); no PR here asks for it.
- Two kinds of request are mixed under one tool name: "capture my sessions" (hooks or transcript adapter) and "use this tool's model as the observer" (provider). Codex, OpenCode, Antigravity and Kimi each have both.
- A few asks are not coding tools: Screenpipe (screen history), Notion export (maintainer), Telegram alerts, Obsidian-style vaults (#1275, closed).

## 5. Needs that external contributors keep asking for but the maintainer did not merge (opportunity list)

Source: external closed-unmerged PRs per theme (column "ext closed unmerged" in section 2), with the caveat in section 0: some were re-done by the maintainer.

| Need | Ext closed unmerged vs ext merged | Evidence (PR links) | Why it fits Aletheia |
|---|---|---|---|
| Stop memory writing CLAUDE.md files into project folders; make it a flag | 16 vs 0 | [#589](https://github.com/thedotmack/claude-mem/pull/589) (29 reactions, the most-reacted PR; commenter said they stopped using it over this), [#672](https://github.com/thedotmack/claude-mem/pull/672), [#765](https://github.com/thedotmack/claude-mem/pull/765), [#823](https://github.com/thedotmack/claude-mem/pull/823), [#875](https://github.com/thedotmack/claude-mem/pull/875) | Aletheia writes one managed block into the instruction file the user already has (src/hub/rules-sync.mjs:2) and one owned file for Cursor (src/hub/tools.mjs:24); it creates no per-folder files. Say so in the README. |
| Sync across devices, team or self-hosted server | 37 vs 3 | [#1722](https://github.com/thedotmack/claude-mem/pull/1722), [#824](https://github.com/thedotmack/claude-mem/pull/824), [#2544](https://github.com/thedotmack/claude-mem/pull/2544), open [#4259](https://github.com/thedotmack/claude-mem/pull/4259) | Free self-hosted sync is what upstream puts behind a paid tier. |
| Security hardening: auth, loopback bind, credential leaks | 30 vs 1 | [#1157](https://github.com/thedotmack/claude-mem/pull/1157) (43 comments, closed), [#3680](https://github.com/thedotmack/claude-mem/pull/3680), [#2542](https://github.com/thedotmack/claude-mem/pull/2542), [#236](https://github.com/thedotmack/claude-mem/pull/236) | Aletheia is loopback only already (src/config.mjs:22). Add tests that prove it. |
| Output in the user's language, translated modes | 8 vs 0 | [#2623](https://github.com/thedotmack/claude-mem/pull/2623), [#398](https://github.com/thedotmack/claude-mem/pull/398), [#230](https://github.com/thedotmack/claude-mem/pull/230), [#1669](https://github.com/thedotmack/claude-mem/pull/1669) | Aletheia has no language setting. |
| Back-fill and portable export/import of memory | 11 vs 0 | [#1129](https://github.com/thedotmack/claude-mem/pull/1129), [#1773](https://github.com/thedotmack/claude-mem/pull/1773), [#1682](https://github.com/thedotmack/claude-mem/pull/1682), open [#2833](https://github.com/thedotmack/claude-mem/pull/2833) | Bundle export exists; transcript back-fill does not. |
| More MCP tools (save, delete, session lookup) and HTTP transport | 14 vs 0 | [#662](https://github.com/thedotmack/claude-mem/pull/662), [#1393](https://github.com/thedotmack/claude-mem/pull/1393), [#1639](https://github.com/thedotmack/claude-mem/pull/1639), [#1861](https://github.com/thedotmack/claude-mem/pull/1861) | Aletheia has save_memory but no delete over MCP (src/hub/mcp.mjs:12-15). |
| Time-aware and reinforcement ranking, adaptive retrieval | 9 vs 1 | [#1257](https://github.com/thedotmack/claude-mem/pull/1257), [#2492](https://github.com/thedotmack/claude-mem/pull/2492), merged [#3414](https://github.com/thedotmack/claude-mem/pull/3414) (opt-in ACT-R) | Matches task T-030. |
| Reversible dismiss, delete from viewer/CLI/MCP | 7 vs 2 | [#3114](https://github.com/thedotmack/claude-mem/pull/3114), [#1393](https://github.com/thedotmack/claude-mem/pull/1393), merged [#2925](https://github.com/thedotmack/claude-mem/pull/2925) | Delete by id exists; reversible dismiss does not. |
| Integrations never merged: OpenCode, OpenClaw, iFlow, Bedrock, Ollama, Docker Model Runner | see section 4 | [#1233](https://github.com/thedotmack/claude-mem/pull/1233), [#1355](https://github.com/thedotmack/claude-mem/pull/1355), [#1758](https://github.com/thedotmack/claude-mem/pull/1758), [#1630](https://github.com/thedotmack/claude-mem/pull/1630), [#1655](https://github.com/thedotmack/claude-mem/pull/1655) | Local-model users: Aletheia's OpenAI-compatible URL already reaches Ollama; document it. |

Also visible: some external contributors opened series of 5 to 12 linked feature PRs, none merged (`mguttmann` server-beta, #2542 to #2573; `laihenyi` pipeline, #430, #442, #464, #1127). I did not read why they were closed; the maintainer's closing note on #1246 and #2908 mentions backlog and PR consolidation passes. A possible lesson for Aletheia: small single-purpose task files (as in docs/tasks/) are easier to take.

## 6. UNVERIFIED

- Keyword classification is approximate. My eyeball check of 84 sampled rows suggested about 1 in 8 misfiled. Per-theme counts could be off by that much or more. Recall (PRs the rules missed) is not measured.
- 279 of 756 external closed-unmerged PRs matched no theme and were not read beyond the title. Some may carry needs.
- Why each closed-unmerged PR was closed is known for only 5 (#589, #1233, #1722, #1246, #2908). "Not merged" mixes rejected, superseded, abandoned and re-done.
- Merged counts per tool or per need are lower bounds: merged PRs older than 90 days are only included if they were in the top 40 by comments or reactions.
- The 839 external closed-unmerged PRs match GitHub's `-author:thedotmack` total, but `author:thedotmack` returns 199 and 839 + 199 = 1,038 against a 978 total. The 60-PR gap in GitHub's search counts is unexplained.
- Top-40 lists skip bots and use GitHub's search ordering; search is capped at 1,000 results, which does not affect a top 40.
- Reaction totals are the GitHub `reactions.total_count` on the PR description only, not on comments.
- The "Does Aletheia have it" column was checked by grep on `/home/mashraf/Projects/aletheia-research` (uncommitted changes present; HEAD 54e525d). docs/20-claude-mem-feature-matrix.md still says hooks are missing (F-C01, F-C02), but `src/hub/hooks/claude-code.mjs:6` and `bin/aletheia.mjs:13-16` show installers, hooks and `doctor` exist; the matrix is stale on those rows.
- Windows support: no `win32` string in src, bin or scripts; whether Aletheia works on Windows was not tested.
- Whether the hub store groups worktrees (as My Work does at src/readmodel/project.mjs:1-48) was not checked.
- Task IDs cited (T-010, T-011, T-014, T-016, T-028, T-029, T-030, T-034, T-044, T-063, T-067, T-073, T-077, T-103, T-108, T-112) come from docs/tasks/TASKS.md and docs/20-claude-mem-feature-matrix.md as read this run; I did not open each task file.
