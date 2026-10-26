# 9. Verification

Everything below was run on 2026-10-25 against claude-mem 15.2.0, Bun 1.3.10.

## 9.1 Test suite

```
$ bun test
 103 pass
 0 fail
 395 expect() calls
Ran 103 tests across 5 files.
```

`test/hub.test.mjs` (40 tests) covers the Memory Hub: store and full-text search, bundles, rules sync, tool
connection, capture and redaction, MCP, claude-mem import, compress, and the HTTP routes and UI. See
[12](12-universal-memory-product.md#126-built-and-verified-in-this-iteration).

| File | What it proves |
|---|---|
| `test/readmodel.test.mjs` (22) | request-text rules, work-state fold, git/PR work product, projection on a synthetic database: cards, scope updates, commit/branch/PR attached, subagent with launch as request, explicit request ids, goals, fingerprints, evidence, bug-compat mode. |
| `test/server.test.mjs` (27) | static serving, traversal refused, snapshot key order, guards (spoofed Host, proxy headers, non-JSON, foreign Origin), review rules (409 paths), the full rules lifecycle and `MY-RULES.md`, load-in-Claude-Code idempotence, mark-finished, evidence, work-state writes, SSE first frame, setup stubs. |
| `test/refresh.test.mjs` (12) | ledger CLI validations; the **whole refresh** (group, review, align, story) with a deterministic fake model, then the view showing merged card, progress, goal links, learned rule; retry-once-then-fail with the raw answer kept; scheduler states. |
| `test/goals-script.test.mjs` (2) | the **unmodified** original `save_goals.py` saves goals through the clone's HTTP endpoints, replaces the previous snapshot, and refuses invented quotes. |

`test/fixture.mjs` builds a synthetic database with the real table shapes. No real data is used by tests.

## 9.2 Differential test against the live original

`scripts/diff-against-live.mjs` fetches `/api/work-view` from the original (`:37700`) and from the clone and
deep-diffs them, ignoring only volatile fields (`generatedAt`, `source.lastCheckedAt`, `refresh`, `setup`,
`revision`).

Setup: clone started with `ALETHEIA_BUG_COMPAT=1`, `ALETHEIA_LEDGER_DIR=~/.claude-mem/work-view`,
`CLAUDE_MEM_DB` default, same rules/instructions paths as the original.

```
humanRequests   original 4 / clone 4
agents          original 0 / clone 0
rules           original 6 / clone 6
DIFFERENCES: 0
```

Equal fields include every request's `contentFingerprint` and `sourceContentHashes` (so the evidence
queries, row hashing and field selection match), `goals` with evidence, `rules` and `rulesLearning`, `story`,
`rulesFile`, `coverage`. The first run (with custom rules paths) reported exactly the two path differences
(`rulesFile.path`, `rulesFile.instructionsPath`) and nothing else.

Reproduce:

```bash
CLAUDE_MEM_BASE=http://localhost:37700
ALETHEIA_BUG_COMPAT=1 ALETHEIA_PORT=37791 ALETHEIA_DATA_DIR=/tmp/wv \
  ALETHEIA_LEDGER_DIR=~/.claude-mem/work-view \
  ALETHEIA_RULES_FILE=~/.claude-mem/MY-RULES.md ALETHEIA_CLAUDE_MD=~/.claude/CLAUDE.md \
  bun bin/aletheia-server.mjs &
bun scripts/diff-against-live.mjs http://localhost:37700 http://localhost:37791
```

(The clone reads the original's ledger and rules paths; it writes nothing there unless you click a rule action.)

## 9.3 Real browser

The original's SPA, served by the clone against the real database (default mode), loaded in Chromium via
Playwright: title "My Work · claude-mem", sidebar (My Work, My Goals, My Rules), "Live updates" indicator,
four request cards with status, recent activity, goal, stage, start time, run time and progress meters (15%, 55%,
92%). Console errors: 0.

## 9.4 Real provider, full refresh on synthetic data

`ALETHEIA_PROVIDER=claude-cli bun scripts/smoke-refresh.mjs` runs grouping, review, alignment and story with
the real `claude` CLI against the fixture database (the goals step is skipped: it reads your own transcripts).

```
result: 3 new conversations grouped, 2 requests reviewed, 1 linked to goals, story written. (59s)
steps : grouping:15s grouping:10s review:19s alignment:5s story:10s
- g_345fb1d8a6a5 "Retry button for failed checkout payments" conv=2 -> in-progress 50%  goals=["Priority: Reliable checkout"]
- g_6e34c6aa968a "Rewrite the onboarding guide so a new hire can finish setup alone" conv=1 -> unknown 10%  goals=[]
story chars: 2260 preferences: 1
```

The model merged the two "retry button" conversations into one request (the second ask says "continue the
retry button work"), kept the docs conversation separate, linked only the first to the goal, and every answer
passed the ledger validators. The provider's flags were first checked with a trivial call (reply `{"ok":true}`).

## 9.4b Validation round 2 (2026-10-25)

Everything claimed so far was re-checked, and every "unverified" item was looked up in an official source.

### Re-run of earlier checks

| Check | Result |
|---|---|
| Full suite | all pass (see the count at the top of this file) |
| My Work differential test against the live original, after all later changes | **0 differences** (live data had 4 requests, 16 rules) |
| Original worker untouched by the isolated baseline worker | `worker.pid` and `settings.json` checksums identical before and after; `/api/health` ok |

### New checks and what they found

| Check | Result |
|---|---|
| **Official MCP SDK client** (`@modelcontextprotocol/sdk`) against `bin/mcp.mjs` over stdio | Connects, negotiates, lists 7 tools with valid object schemas, `save_memory`, `search`, `session_start_context` work, a bad call returns `isError`, clean close. Found that spec version 2025-11-25 was missing (F9), now offered |
| Concurrency: 4 writer processes + 1 reader on one database file | 600 of 600 rows present, 0 errors |
| Hostile input: 18 FTS metacharacter strings, injection through filters, prototype-pollution keys in a bundle, 100 KB fields, wrong-shaped bodies, 10 MB upload, 200 parallel requests | No crash, no corruption, JSON errors only. Found F7 (redactor) and F8 (oversized body) |
| Redaction fuzz: 14 secret formats × 5 positions + URL credentials | pass after F7 fix |
| Scale: 50,000 memories, 20,000 vectors | insert 3,077/s; BM25 p50 71 ms (was 156); newest-30 0.5 ms (was 222); brute-force 20k vectors p50 25 ms; hybrid p50 94 ms; 31 MB of vectors resident |
| Retrieval benchmark, 1,536 LoCoMo questions | see [14](14-research-ai-memory.md#146-measured-results); found F5 |
| claude-mem baseline on the same questions, isolated worker | see [14](14-research-ai-memory.md#146-measured-results); found F11 |
| Browser: Hub memory, rules, tools pages with 756 imported rows | no console errors after the helper-recursion fix |

### Third-party facts checked against official sources

| Claim in this project | Source read | Result |
|---|---|---|
| MCP stdio: newline-delimited JSON, no embedded newlines, server writes nothing else to stdout, logs to stderr, shutdown by closing stdin | modelcontextprotocol.io spec 2025-11-25, Transports | **Confirmed** |
| MCP version negotiation: same version if supported, else the server's latest; `initialized` notification | spec 2025-11-25, Lifecycle | **Confirmed**; our list was missing the newest (fixed) |
| Cursor: `.cursor/mcp.json` (project) and `~/.cursor/mcp.json` (global), `mcpServers`, `command`, `args`, `env` | cursor.com/docs/context/mcp | **Confirmed** |
| Gemini CLI: `~/.gemini/settings.json` / `.gemini/settings.json`, `mcpServers`, `command`, `args`, `env`, `cwd`, `timeout`, `trust`; `gemini mcp add` | Gemini CLI MCP docs (GitHub) | **Confirmed** |
| Codex CLI: `~/.codex/config.toml`, `[mcp_servers.<name>]`, `command`, `args`, `env`; `codex mcp add … -- cmd` | Codex MCP docs | **Confirmed** (matches the TOML we write) |
| Claude Code: `claude mcp add -s user <name> -- cmd args`; scope flag must precede `--`; user scope in `~/.claude.json` top level, project scope in `.mcp.json`, local default under `projects` | search summaries of Claude Code docs (the docs page itself did not load) | **Confirmed in gist, secondary** |
| OpenCode: `mcp` object, `"type": "local"`, `command` array, `environment`, `enabled`, optional `cwd` | docs.opencode.ai (search summary) | **Confirmed in gist, secondary** |
| Windsurf: `~/.codeium/windsurf/mcp_config.json` | Windsurf docs now redirect to the Devin docs, which name `~/.config/devin/mcp_config.json` | **Changed**: both paths are supported (F10); which one a given install uses is unverified |
| `AGENTS.md`: read by Codex, Cursor, Copilot, Gemini CLI, Aider and others; nearest file wins; Claude Code reads `CLAUDE.md` | several secondary sources (one named the Linux Foundation's Agentic AI Foundation as steward) | **Confirmed in gist, secondary**; per-tool details not verified |
| Cursor rules: `.cursor/rules/*.mdc` with `description`, `globs`, `alwaysApply` | community guides (Cursor's own page not retrieved) | **Partly verified**; sources disagree on the `globs` format, we do not emit `globs` |

Still **not verified**: that any connector works on a real install (we never wrote to a real tool config on this machine), Copilot and Aider rules-file conventions, Windsurf rules file names, and every claim in [14.9](14-research-ai-memory.md#149-not-verified).

## 9.5 NOT TESTED

See [08-findings.md section 8.3](08-findings.md#83-not-verified).
