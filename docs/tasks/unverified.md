# Unverified items

Every `UNVERIFIED` in [20](../20-claude-mem-feature-matrix.md), [21](../21-competitor-landscape.md) and
[24](../24-repo-parity-and-growth.md), with the check that would resolve it. Nothing here is a placeholder for a fact
we know; each row is a fact we could not fetch on 2026-10-26. Section 21.5 also has 13 cells marked `?`; they are listed at the end.

## Product and competitor facts

| # | Item | Where | Why it is unverified | What would verify it |
|---:|---|---|---|---|
| 1 | claude-mem's GitHub social preview image | D1 F-P20 | Repository social preview is a GitHub setting, not a file or API field we read | Open the repository page logged in and inspect the social preview, or ask a maintainer |
| 2 | Aletheia's GitHub social preview | D5 section 24.4 | Same reason | The repository Settings page |
| 3 | OpenMemory storage and retrieval | D2 row 3 | The `mem0ai/openmemory` README describes a CLI/TUI session porter and does not state storage or retrieval; mem0's docs index has no OpenMemory page | Read the CLI source or run it and inspect the data it writes |
| 4 | Supermemory graph/entity memory | D2 row 4, comparison table | The README claims temporal handling and contradictions but does not document a graph store | Read the engine source or its API docs |
| 5 | Memobase capabilities | D2 row 15 | The default-branch README returned 404; only the repository metadata and PyPI 0.0.27 were available | Fetch a release tag's README or the project docs |
| 6 | TencentDB Agent Memory local mode and price | D2 row 28 | README states a proxy integration but not whether the store can run locally, and no price | Read the deployment docs and the pricing page |
| 7 | claude-memory-compiler retrieval | D2 row 30 | README says file-based memory and hooks but not how retrieval ranks | Read the source |
| 8 | Cursor memory storage and data path | D2 row 39 | The documentation page body is JavaScript-rendered; only navigation text was readable | Read the page in a browser or the Cursor privacy documentation |
| 9 | Gemini memory features and price | D2 row 40 | The Google support URL tried returned a limits page, not a memory page; search returned third-party pages | The canonical Google support page for Gemini memory, fetched directly |
| 10 | GitHub Copilot memory | D2 row 42 | Two guessed GitHub Docs URLs returned 404 and the search returned no result | The current GitHub Docs page for Copilot memory |
| 11 | Mem0 platform price | D2 row 2 | README links a platform but states no price | The Mem0 pricing page |
| 12 | Supermemory cloud price | D2 row 4 | README links self-host and cloud but states no price | The Supermemory pricing page |
| 13 | Zep price | D2 row 5 | README is examples/integrations, not pricing | The Zep pricing page |
| 14 | Letta Cloud price | D2 row 7 | README links Letta Cloud, no price | The Letta pricing page |
| 15 | Cognee Cloud price | D2 row 8 | README links a managed service, no price | The Cognee pricing page |
| 16 | Mastra Cloud price | D2 row 20 | README is the framework, no cloud price | The Mastra pricing page |
| 17 | Engram cloud price | D2 row 27 | README says cloud is optional, no price | The Engram pricing page |
| 18 | ChatGPT plan price | D2 row 37 | The memory FAQ describes features, not prices | The OpenAI pricing page |
| 19 | Claude memory tool token rate | D2 row 38 | The tool page does not list prices | The Anthropic pricing page |
| 20 | Cursor and Windsurf plan prices | D2 rows 39, 41 | Product docs describe features, not prices | Each vendor's pricing page |
| 21 | claude-mem cloud sync price | D1 F-T01 | The page says cmem.ai Pro is required but states no price | The cmem.ai pricing page |
| 22 | Licence files for Memori, Mastra, Context Mode and TencentDB Agent Memory | D2 rows 10, 20, 24, 28 | GitHub API returned `NOASSERTION`; the `LICENSE` file was not read | Fetch each repository's `LICENSE` and identify the terms |
| 23 | Hindsight's self-host resource requirements (CPU, RAM, disk) | D2 row 12 | The README gives a Docker path but no measured footprint | Run the compose file and measure idle RSS, ingest throughput and disk per 1k memories |
| 24 | claude-mem-lite benchmark numbers | D2 row 33 | The README mentions a LongMemEval section; the numbers were not in the extracted text | Read `benchmark/` in that repository |

## Distribution and platform rules

| # | Item | Where | Why it is unverified | What would verify it |
|---:|---|---|---|---|
| 25 | Reddit posting rules for r/ClaudeAI, r/LocalLLaMA, r/mcp | D5 section 24.5 | Every `about/rules.json` request returned HTTP 403 | Read each subreddit's rules page in a browser before posting |
| 26 | awesome-selfhosted submission criteria | D5 section 24.5 | The README points at a contributing section, but `CONTRIBUTING.md` at the tried path returned 404 | Read the current contributing section or the repository's `.github` template |
| 27 | mcp.so submission form fields | D5 section 24.5 | The page has a Submit entry point; the form was not fetched | Open the Submit page |
| 28 | Glama submission steps | D5 section 24.5 | "Add Server" is visible; the flow was not fetched | Open the Add Server flow |
| 29 | Smithery submission steps | D5 section 24.5 | Landing page only | The Smithery docs or dashboard |
| 30 | PulseMCP submission steps | D5 section 24.5 | `https://www.pulsemcp.com` returned HTTP 403 | Read the site in a browser |

## Product claims that are untested, not unknown

These are not `UNVERIFIED` facts about other projects; they are claims this project deliberately does not make yet.

| # | Claim | State | What would verify it |
|---:|---|---|---|
| 31 | "Works with Cursor, Gemini CLI, Codex CLI, Windsurf, OpenCode, Claude Code" | Config written from official docs fetched 2026-10-26 and fixture-tested for six tools plus OpenCode; **not tested on a real install** (`README.md`). T-070 checked the documented rules formats, not the tools. | A real install test per tool (T-075) |
| 32 | "Automatic capture through a tool's hooks" | **proven end-to-end through the installed hook commands for Claude Code, Command Code, Cursor, Codex CLI, Gemini CLI and Windsurf** in T-140 (2026-10-26). No host application was opened, so the host's own hook loader and trust UI are untested. OpenCode has no hook shipped. | Open each host, trust the hooks, run one session (manual-test section 7) |
| 33 | "Answer accuracy is better" | Not measured | T-051, T-052 |
| 34 | "p95 ≤ 50 ms at 50k rows" | **still not met**: 137.8 ms before the FTS `optimize` fix, 108.1 ms after it (2026-10-26) | T-047 / further index work |
| 35 | "macOS and Windows supported" | Linux only tested | T-014 |
| 36 | "30+ languages supported" | English only | T-087 to T-089 |
| 37 | OpenCode plugin event payload fields | The official plugin page lists event names (`session.idle`, `message.updated`, `tool.execute.after`) but not their payload shape, so no capture plugin ships (T-068) | Read the `@opencode-ai/plugin` types or log one real event |
| 38 | Codex hook trust flow | The installer writes non-managed hooks; Codex requires them to be reviewed with `/hooks` (docs, 2026-10-26) | Open Codex, review/trust, run one session |
| 39 | Full TOML validation | The Codex MCP writer uses a structural guard (JSON-shaped file, duplicate table, unbalanced quotes), not a TOML parser, because no dependency is allowed | Add a TOML parser or validate with the Codex CLI before release |
| 40 | Claude Desktop on Linux | `~/.config/Claude/claude_desktop_config.json` exists here, but the MCP quickstart names only macOS and Windows | Official Linux documentation or a Linux Desktop build |
| 41 | Real tool read of the rules files | Every rules target was checked against its docs and written in temp folders; no tool was opened to confirm it loaded the rule (T-070) | Open each tool and read the active rules (manual-test section 7) |
| 42 | Windsurf/Devin path stability | The docs now call the product Devin Desktop while the user hook path stays `~/.codeium/windsurf`; the MCP path moved to `~/.config/devin` | Re-fetch the docs after a release and test both MCP paths |
| 43 | Codex `.codex-plugin/plugin.json` full field schema | The official page (fetched 2026-10-26) names the path as a supported compatibility fallback and says `hooks` may be declared there, but it gives no field table for that manifest and no local `.mcp.json` server shape. The manifest uses only `name`, `version`, `description` and `hooks` (T-066) | Run `codex plugin validate` on `.codex-plugin/` and read the validator's output |
| 44 | Qoder plugin-root path variable for a local MCP command | The official page (fetched 2026-10-26) documents `mcpServers` and `hooks` fields but no `${...}` variable for the plugin root, so the Qoder manifest claims metadata only (T-066) | Read Qoder's local-command docs or run `qoder plugins validate` on the manifest and a test plugin |
| 45 | Every plugin manifest loaded by its host | All four manifests are labelled `from-docs-only`; `test/manifests.test.mjs` parses them and resolves their paths, but no host was opened (T-066) | Install or link each manifest in its host and read the plugin list; run one session |
| 46 | The Claude Code plugin hook trust flow | The manifest declares `SessionStart` and `Stop` commands, but Claude Code has not been asked to load or trust this plugin (T-066) | Open Claude Code, install the plugin, approve the hooks, run one session |
| 47 | The watcher against a live, growing host session | `test/watcher.test.mjs` uses fixture files and the real Codex format, but no host was watched while it was writing (T-063) | Start `aletheia watch`, run one Claude Code/Command Code/Codex session, and check the offsets and rows |

## Memory-building measurements (2026-10-26)

These are claims this run deliberately does not make. Each was measured only on a synthetic fixture, or not at all.

| # | Claim | State | What would verify it |
|---:|---|---|---|
| 37 | Extracted facts raise LoCoMo Recall@5 by ≥5 points | **measured 2026-10-26, negative for the rule extractor**: our rules added 1,672 facts and +0.4 points (57.3% → 57.7%); the dataset's own facts added +7.3 points (57.5% → 64.8%). The +5 target is not met by our extraction. See [22 §22.9](../22-improve-the-numbers.md) | A real local model's extraction run (not completed) |
| 38 | A real local OpenAI-compatible endpoint accepts the extraction request | **partially tested**: Ollama `llama3.2:1b` answered a trivial `/v1/chat/completions` call in 2.9 s on 2026-10-26, but the `facts-v1` prompt over a 2-turn window returned HTTP 500 after 4 min 41 s; no extraction answer was produced | Run the full `--facts provider` arm on a machine with a larger-context model |
| 39 | Importance matches a human ranking (Spearman ≥0.5) | measured only on a synthetic 200-item rank (0.645) | Collect 200 human-ranked observations and rerun `test/importance.test.mjs` against them |
| 40 | Near-duplicate precision and recall on human labels | measured only on a synthetic 200-pair set (precision 1.00, recall 0.90) | Build the human-labelled 200-pair set in D4 §23.9 and evaluate `src/hub/dedupe.mjs` |
| 41 | Contradiction handling on the D4 knowledge-update set | measured only on a synthetic 30-pair set (30/30 newest-wins) | Build the 50-pair knowledge-update set and rerun `test/contradictions.test.mjs` |
| 42 | The `anthropic-compatible` provider endpoint | the preset has no default URL; no OpenAI-shaped Anthropic endpoint was verified and no gateway was tested (T-119) | Read a gateway's docs and complete one extraction call through `ALETHEIA_ANTHROPIC_BASE_URL` |
| 43 | Session transcript layouts for tools other than Claude Code, Command Code and Codex | Codex's rollout layout was read from two real files on this machine on 2026-10-26 and is supported by `import transcripts` and the watcher (T-063); other tools are not supported | Read one real session file per tool and add its parser |
| 44 | One-UI pixel layout at 375 px and its keyboard-only path | the page was loaded in Chromium on 2026-10-26 with the four tabs and no console errors; pixel layout and a keyboard-only pass are not asserted (T-134 to T-139) | Load the page at 375 px and Tab through the header, tabs, details blocks and a dismiss/restore |
| 45 | Two real machines syncing over a tunnel, and E2EE on two machines | Aletheia Sync (plain and E2EE, T-102 to T-108 and T-117) is tested only against temp data dirs and a loopback hub; no real tunnel or second host was used | Run manual-test §8 (plain and E2EE) on two machines through a real TLS tunnel |

## URLs referenced in the documents but not fetched as sources

These appear in [20](../20-claude-mem-feature-matrix.md) to [24](../24-repo-parity-and-growth.md) but were not used as
evidence. They are listed so the research log is complete without pretending they were read.

| URL | Why it appears |
|---|---|
| `https://github.com/hesreallyhim/awesome-claude-code` | The list's repository page; its README and CONTRIBUTING were fetched, the HTML page was not |
| `https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg` | Proposed CI badge endpoint, not fetched |
| `https://img.shields.io/badge/bun-%3E%3D1.1-black` | Proposed static runtime badge, not fetched |
| `https://img.shields.io/badge/platform-linux%20(tested)-lightgrey` | Proposed static platform badge, not fetched |
| `https://img.shields.io/badge/status-alpha-orange` | Proposed static status badge, not fetched |
| `https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem` | Proposed issue-count badge endpoint, not fetched |
| `https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem` | Proposed last-commit badge endpoint, not fetched |
| `https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem` | Proposed licence badge endpoint, not fetched |
| `https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem` | Proposed star badge endpoint, not fetched |
| `https://mohamed-ashraf-elsaed.github.io/aletheia-mem/` | Homepage from the repository metadata; the site files were read locally |
| `https://raw.githubusercontent.com/snap-research/locomo/main/data/locomo10.json` | Fetched 2026-10-26 for T-132; SHA-256 and licence are in [22 §22.9](../22-improve-the-numbers.md). The file itself is gitignored. |

## Matrix cells marked `?` in D2 section 21.5

The exhaustive matrix uses `?` for "the source fetched does not state this". Each cell below is that kind of gap; the
verification is the same: read the project's source or its current documentation, then replace the cell with ✅/❌/partial.

| Project | Capabilities not stated in the fetched source |
|---|---|
| OpenMemory | MCP, REST, vector search, graph, temporal |
| Supermemory | graph/entity memory |
| Memori | graph, temporal |
| Memobase | local mode, MCP, vector |
| agentmemory | team sharing |
| Engram | vector search |
| TencentDB Agent Memory | local mode, free tier, no-account use, graph, temporal |
| claude-memory-compiler | vector search, temporal |
| ChatGPT memory | vector search |
| Cursor memories | vector search |
| Gemini memory | free tier, cross-tool import, vector search, temporal |
| Windsurf memories | vector search |
| Copilot memory | every capability in the matrix |

Rows 3, 4, 10, 15, 25, 27, 28, 30, 37, 39, 40 and 41 in section 21.2 carry the same caveat.

## Request layer, story and economics (2026-10-27)

These are chosen rules and unmeasured behaviour in T-152 and T-165 to T-173. Each was tested only on a seeded
database, never on real owner history.

| # | Item | State | What would verify it |
|---:|---|---|---|
| 46 | Request grouping "close in time" (default 24 h) | A chosen threshold; no real sessions were grouped to check it | Run it on a real store and compare the cards with the owner's own view |
| 47 | Progress formula (share of sessions ended or summarised) | A chosen rule; no memory review backs it | Compare with the owner's reading of the same requests |
| 48 | ETA pace (mean gap between session starts) | An approximation; no delivered ETA was checked against the real ship date | Record a request to completion and compare `eta` with the real end |
| 49 | Rule strength bands (Light 1-2, Steady 3-4, Strong 5+) | A chosen band; not measured against how the owner decides | Ask the owner to label suggestions and compare |
| 50 | Per-observation work tokens | `null` by design: the usage ledger is per extraction call, not per observation | Store a real per-observation usage link first |
| 51 | Savings percent | Derived from `fact_usage` input + output only; not a measured reduction | Measure a real before/after context session |
| 52 | "What came out of it" detector | Tested on synthetic tool events (`test/artifacts.test.mjs`); no real host output was read for this task | Read real Claude Code, Command Code and Codex tool events |
| 53 | Build story quality | Rule-based only; no model was run, so no prose quality is claimed | A model-written story (not part of this task) |
| 54 | UI wiring of the new routes | Not done; `public/**` was not changed | A later UI prompt |
| 55 | Sample JSON in [32](../32-requests.md) | Produced from a seeded temp database on 2026-10-27; no real user data | Regenerate from a real store and compare |

## UI study (2026-10-27)

| Item | Why UNVERIFIED | What would verify it |
|---|---|---|
| How the claude-mem viewer refreshes after load | The page requested `/api/work-view/events` once. Whether that is a stream, and how often it pushes, was not inspected. | Read its network panel over several minutes, or its source. |
| Its keyboard shortcuts | None were tried. No shortcut hint was visible. | Press keys in the viewer and read its help. |
| Its error and offline states | The server stayed up, so no failure was produced. | Stop the worker and reload. |
| Its behaviour at 768 px and 1920 px | Only the default window (about 920 px) and 375 px were captured. | Resize and capture. |
| Its long-list handling | The Work page showed five cards, so pagination or virtualization never triggered. | Seed a large store and scroll. |
