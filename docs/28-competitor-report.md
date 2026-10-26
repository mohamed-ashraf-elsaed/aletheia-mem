# 28 — Competitor report

Date: 2026-10-26. Every number is labelled `measured-by-us`, `vendor-claimed`, `third-party` or `peer-reviewed`.
Where two numbers come from different conditions they are never put in one comparison as if equal.
Machine-readable rows: [28-competitor-report.json](28-competitor-report.json) (313 rows copied from the research tables).

## 1. Summary

- **93 products tracked.** 42 from [21](21-competitor-landscape.md) plus 51 new ones in
  [research/A3-new-competitors.md](research/A3-new-competitors.md). Groups: coding-agent plugins, memory SDKs and layers,
  graph memory, MCP servers, rules-sync tools, IDE and chat built-in memory, research systems.
- **The closest product is claude-mem** (103k stars, Apache-2.0). It has 9 first-party harness installers, a background
  observer, 35 mode files, 32 translated READMEs and a paid cloud tier at $30 to $100 a month.
- **What we have today, proven:** local SQLite with FTS5, hybrid retrieval, an MCP server, REST, CLI, rules sync into nine
  tool formats, automatic capture for Claude Code (smoke-tested on the owner's machine) and Command Code (recorded payloads
  only), fact extraction with validation, a crash-safe queue, contradiction handling, dedupe and importance scoring.
- **What we do not have:** answer-accuracy measurements, sync, team mode, graph retrieval in production, installers for
  most tools, Windows and macOS tests, a translated README, a published package.
- **The one place the claim is already measured:** retrieval on LoCoMo against claude-mem, same dataset and questions
  (section 4). Everything else in section 9 is a goal.

## 2. Method

Found by: GitHub topic and keyword search, npm and PyPI metadata, Hacker News "Show HN", awesome-lists, the vendors' own
pricing and docs pages, benchmark papers. Included if the product stores memory, rules or context for AI agents and had a
readable public page. Not covered: Reddit (not reachable by search in this run), closed products with no public page,
products found only after the run. Each row's source and fetch date are in the research files; blocked pages are listed as
UNVERIFIED there. Stars and last-commit values came from `gh api` on 2026-10-26; "last commit" can be `pushed_at`, which
differs from the default branch's last commit by 1 to 2 days (A3 section 9).

## 3. The landscape

| Group | Count | Examples (full rows in docs/21 and A3) |
|---|---|---|
| Coding-agent memory plugins | 16 new + claude-mem and forks | MemPalace, deja-vu, OwnMem, Hippo, memsearch |
| Memory layers and SDKs | 12 new + mem0, Supermemory, Zep, Letta, Cognee, Mastra, Memori | memU, Honcho, EverOS |
| Graph memory | 4 new + Graphiti | Semantica |
| MCP memory servers | 4 new | see A3 section 4 |
| Rules-sync tools | 6 | Ruler, rulesync, Skills Manager, APM |
| IDE and chat memory | 5 + Cursor, Windsurf, Copilot, ChatGPT, Claude, Gemini | A3 section 6 |
| Research systems | 4 | A-MEM, MemOS and others |

Findings from A3:
- Rules-sync is its own small group. None of the four rules tools stores memory, and none of the memory tools syncs rules.
  Aletheia does both.
- Licence risk: AGPL-3.0 on OpenWolf, Honcho and SuperLocalMemory; no recognised licence file on memU, YourMemory and
  ByteRover CLI; none on Ghost. Basic Memory is AGPL-3.0 (checked via `gh api`).
- Several tools are stale: Grov, a-mem-mcp, Ghost and MegaMemory had no commit for months.
- Vendors are moving users to paid cloud: Zep deprecated its Community Edition and mem0 dropped open-source graph memory in
  v3 (A2).

## 4. Benchmarks

### 4.1 What we measured ourselves (retrieval only)

`measured-by-us`, LoCoMo, retrieval Recall@5, commands and dates in [14](14-research-ai-memory.md) and
[22](22-improve-the-numbers.md). **These are retrieval numbers. They are not answer accuracy.**

| System | Conditions | Recall@5 | Latency |
|---|---|---|---|
| claude-mem (FTS plus Chroma, as shipped) | raw turns | 36.0% | p50 1,699 ms, p95 2,824 ms |
| Aletheia hybrid (BM25 plus dense, RRF) | raw turns | 57.5% | 4.4 ms |
| claude-mem | same extracted facts, 383 questions | 57.7% | not measured |
| Aletheia hybrid, same facts | same | 67.6% | 2 to 6 ms |
| Aletheia hybrid, same facts, rerank top 30 | same | 73.7% | about 350 ms |

Not met: the 50k-row keyword search target of 50 ms (measured 71 to 104 ms earlier; 124 to 185 ms p95 in the docs-run
re-measure). The pipeline run on `feat/pipeline-finish` re-measures this and whether 57.5 / 67.6 / 73.7 reproduce.
Facts extracted by our own pipeline (not the dataset's facts) have **not been measured**.

### 4.2 Published numbers from others (A3-benchmarks.md, 94 rows)

These are mostly answer accuracy from the vendors themselves. They cannot be compared with section 4.1 because the metric,
reader model and judge differ. A3 shows each with dataset, model, who ran it and a URL. Conflicts shown, not resolved:

- **mem0 on LoCoMo:** between about 20 (a user rerun) and 92.5 (mem0's own current claim), with 66.9 to 71.4 in several papers.
- **Zep on LoCoMo:** 58.4 to 94.7 depending on who ran it and when.
- **Supermemory on LongMemEval-S, gpt-4o:** 97% on its page versus 81.6% on Mastra's page updated 2026-02-17.
- **MemPalace:** 96.6% Recall@5 reproduces as a retrieval figure, but end-to-end accuracy with gpt-4o-mini is 0.668. A 0.826 figure was retracted.
- **EverMemOS:** 93.0% claimed versus 52.2% and 38.4% in a user rerun; the maintainer closed the issue without a new result.
- **LoCoMo itself:** one audit post reports 99 errors in 1,540 questions; its repository was not read, so the counts are unchecked.

### 4.3 Pitfalls that apply to us

A3 section 4 lists 16 public evaluation pitfalls with sources. The ones we guard against: tuning on the test set, comparing
retrieval recall with judged accuracy, running a competitor before its index finished, and different top-k. Our protocol is
in [22](22-improve-the-numbers.md).

## 5. Capability comparison

Generated from [28-competitor-report.json](28-competitor-report.json); full per-product matrix with sources in
[docs/21](21-competitor-landscape.md), section "comparison table".

<!-- gen:capabilities -->
| Capability | Aletheia (today) | claude-mem | Mem0 | Zep/Graphiti | Supermemory | Basic Memory |
|---|---|---|---|---|---|---|
| Local-first | yes | yes | yes OSS | partial (Graphiti only) | yes self-host | yes |
| Free | yes | yes OSS | yes OSS | partial (Graphiti free) | yes OSS | yes OSS |
| No account | yes | yes local | yes OSS | yes Graphiti | yes self-host | yes |
| MCP | yes stdio + HTTP (T-067, T-107) | yes | yes | partial (reference servers) | yes | yes |
| REST | yes `/v1` | yes worker API | yes | yes | yes | partial |
| CLI | yes | yes `npx` | partial | no | partial | yes |
| Rules sync to tool files | yes 9 targets | no | no | no | no | partial (AGENTS.md) |
| Import/export between tools | partial (own bundle + claude-mem) | partial (export/import) | partial (platform migration) | partial | partial | yes Markdown |
| Hook capture | yes six hosts, fixture-tested; no host opened (T-140) | yes | no | no | no | partial |
| Vector search | partial (optional ONNX) | yes Chroma | yes | yes | yes | yes |
| Graph / entity memory | partial (entity rows exist; graph retrieval T-048) | no | yes | yes | UNVERIFIED | yes wikilinks |
| Temporal reasoning | partial (bi-temporal facts, invalidation; as-of query T-026) | partial (dates) | yes | yes | yes | partial |
| Team sharing | partial (self-hosted sync and devices; team mode T-112) | partial (paid) | yes paid | yes paid | yes paid | no |
| Benchmark published and reproducible | partial (retrieval yes; answer no) | no | vendor only | vendor only | vendor only | no |
| Languages supported | 11 (English + 10 machine translations; no native review) | 29 modes, 32 READMEs | SDK | SDK | SDK | SDK |

_Generated from docs/28-competitor-report.json (rows copied from docs/21-competitor-landscape.md, fetched 2026-10-26). Aletheia cells updated 2026-10-26 from validated tasks; see docs/20 and docs/25. Cells the source did not state read UNVERIFIED._
<!-- /gen:capabilities -->

## 6. Pricing and licences (dated 2026-10-26)

Resolved with a fetched page (A2): mem0 Pro $249/month; Supermemory Pro $19, Max $100, Scale $399; Zep Flex $125, Flex Plus
$375; Letta Pro $20; Cognee $1 per 1M tokens; Mastra Teams $250; CMEM Pro $30, Heavy $70, Max $100 plus overage. No paid
tier found for Engram, Context Mode, agentmemory, TencentDB Agent Memory. Licences: Memori Apache-2.0; Mastra Apache-2.0
except `ee/` (source-available, no production use); Context Mode ELv2; TencentDB Agent Memory MIT. **Still UNVERIFIED:**
ChatGPT prices, Gemini price, Memvid live price, Memobase cloud, TencentDB hosted price, OpenMemory price, Cursor's real
price.

## 7. Weaknesses of the top competitors, and our answer

| Competitor | Weakness (source in the research file) | Our answer | Proven today? |
|---|---|---|---|
| claude-mem | Writes CLAUDE.md files into project folders; 16 external PRs to make it optional, none merged; #589 has 29 reactions (A4) | we write only a managed block in files the user picks | design yes; test not yet (T-122) |
| claude-mem | Paid sync stores payloads in clear text; one bad op rejects a batch; stalls reported (A1) | per-op results, optional end-to-end encryption | planned (T-102, T-117) |
| claude-mem | Retrieval 36.0% Recall@5 on raw turns in our measurement | hybrid retrieval | **measured-by-us** |
| claude-mem | Observer needs a model and uses the agent's usage or the paid gateway | local rule extractor works with no model | yes, fake provider only; real provider untested |
| mem0 | Dropped open-source graph memory in v3; Pro $249/month (A2) | graph in SQLite for free | planned |
| Zep | Community Edition deprecated (A2) | free self-hosted | planned |
| Rules tools (Ruler, rulesync) | no memory at all (A3) | rules plus memory in one store | yes |

## 8. Scoreboard, honestly

| | Status |
|---|---|
| Win, proven | retrieval Recall@5 vs claude-mem on LoCoMo (57.5% vs 36.0% raw; 67.6% and 73.7% vs 57.7% on the same facts); latency vs claude-mem; free with no account; rules sync plus memory together |
| Lose today | tool coverage (hooks for 2 tools vs 9), Windows and macOS untested, no sync, no team mode, no translations, no package on npm, 0 stars, no answer-accuracy number |
| Unknown | answer accuracy against any competitor; quality of facts from our own extractor on real data; behaviour in real Command Code sessions |

## 9. Goals, not results (nothing here may be claimed until measured)

| Goal | How it will be proven | Task |
|---|---|---|
| Answer accuracy at or above the best vendor claims on LoCoMo with the same reader and judge | judged-accuracy harness, raw outputs published | T-051 |
| Recall@5 gain from our own extracted facts | `bun run bench:locomo` with extractor output | pipeline-finish run |
| 50k-row search under 50 ms | `bun run bench:scale` | docs/22 E-series |
| Parity with claude-mem's tool coverage | real-install tests per tool | T-062 to T-068, T-124 |
| Every paid feature free | docs/27 table, one validated task each | T-102 to T-118 |
| 30+ languages | translated READMEs and drift check | T-088, T-089 |

Stop-claiming rule: a goal is withdrawn from the README if the measured number falls below the stated one on a re-run, or
if the competitor's own published number changes under the same conditions.

## 10. Positioning

Three niches where free, tool-neutral, reproducibly benchmarked memory can win:

1. **People who use more than one AI coding tool.** One memory and one rules file for all of them. No memory product syncs
   rules, and no rules tool stores memory.
2. **Teams and individuals who will not pay or send data out.** Everything a paid tier sells (sync, hosted extraction,
   remote MCP, team mode) self-hosted and free, per docs/27.
3. **People who distrust vendor benchmarks.** Published commands, raw outputs, and a policy of labelling vendor claims as
   vendor claims.

One-paragraph pitch (usable only for what exists today): "Aletheia is a free, local memory and rules hub for AI coding
tools. It captures your sessions in Claude Code, remembers what matters, and keeps your rules in sync across tools, with
benchmarks you can re-run yourself."

Do not claim: "works with" any tool without a real-install test; any answer-accuracy number; any "beats everyone" line;
sync or team features; stars or downloads.

## 11. Appendix

- Research files: [research/](research/) (A1 to A4 with their `-sources.tsv` files; 76, 60, 77 and 18 dated source rows).
- Task list: [tasks/TASKS.md](tasks/TASKS.md), phase P6.
- UNVERIFIED items: [tasks/unverified.md](tasks/unverified.md) and the end of each research file.
- Known limits of this report: A4's theme counts are keyword-based (about 1 in 8 sampled rows misfiled); Reddit not covered;
  three of A3's claims rest on search summaries whose pages were never opened (vectorize.io on MemPalace tuning, Atlan's 49%
  for mem0 on LongMemEval, a Towards AI note on Letta) and are not used in any table above.
