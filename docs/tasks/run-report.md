# Run report

Date: 2026-10-26. Branch: `docs/roadmap-and-research`. This run wrote documentation and task files only; it did not
change `src/`, `bin/`, `public/`, `public-hub/`, `test/` or `bench/`.

## 1. Counts

| Item | Count |
|---|---:|
| Feature rows in [20](../20-claude-mem-feature-matrix.md) | **163** |
| Competitor rows in [21](../21-competitor-landscape.md) | **42** (36 GitHub projects + 6 vendor surfaces) |
| Experiments in [22](../22-improve-the-numbers.md) | **18** (E01-E18) |
| Tasks in [TASKS.md](TASKS.md) | **98** |
| Tasks by phase | P0 16, P1 19, P2 22, P3 21, P4 12, P5 8 |
| Unique URLs in the research log | 264 |
| URLs in documents 20-24 not in the research log | **0** |
| `UNVERIFIED` items listed | 36 |

Feature status spread: parity 25, partial 40, missing 79, better 12, out-of-scope 6, unverified 1.

## 2. Test suite

Command:

```bash
bun test
```

Real output:

```text
bun test v1.3.10 (30e609e0)

test/robustness.test.mjs:
(pass) concurrent writers on one database file > four processes write while a fifth reads: nothing is lost, nothing errors [251.00ms]
(pass) hostile input > search and list survive every FTS metacharacter and odd string [13.00ms]
(pass) hostile input > filters are parameters, so injection through project/kind/tool does nothing [3.00ms]
(pass) hostile input > bundle import tolerates prototype-pollution keys, non-objects, huge fields and bad types [4.00ms]
(pass) hostile input > a memory title that is markup is stored as text, never interpreted by the API [3.00ms]
(pass) hostile input > redaction holds across formats and positions [1.00ms]
[work-view] request failed: POST http://127.0.0.1:35023/api/hub/import/claude-mem 45 | }
46 | 
47 | /** Run a SELECT; a missing table or column yields [] so an older database still renders. */
48 | export function safeAll(db, sql, params = []) {
49 |   try {
50 |     return db.prepare(sql).all(...params);
                   ^
SQLiteError: file is not a database
      errno: 26,
 byteOffset: -1,
       code: "SQLITE_NOTADB"

      at prepare (bun:sqlite:345:37)
      at safeAll (/home/mashraf/Projects/work-view-local/src/lib/util.mjs:50:15)
      at importClaudeMem (/home/mashraf/Projects/work-view-local/src/hub/importers.mjs:20:30)
      at handle (/home/mashraf/Projects/work-view-local/src/hub/routes.mjs:211:21)
      at async route (/home/mashraf/Projects/work-view-local/src/server.mjs:145:41)
      at async fetch (/home/mashraf/Projects/work-view-local/src/server.mjs:157:22)

(pass) HTTP hardening > oversized bodies are refused, malformed JSON is a 400, a body of the wrong shape is a 400 not a 500 [24.00ms]
(pass) HTTP hardening > rule sync refuses a non-folder, and import-from-file refuses directories and huge files [2.00ms]
(pass) HTTP hardening > every route answers JSON errors, never a stack trace [1.00ms]
(pass) HTTP hardening > the server survives a burst of 200 parallel requests [129.00ms]
(pass) HTTP hardening > teardown [3.00ms]

test/goals-script.test.mjs:
(pass) save_goals.py saves goals through the clone, replaces the previous snapshot and the view shows them [215.00ms]
(pass) a quote that is not the owner's words is refused before anything is saved [126.00ms]

test/hub.test.mjs:
(pass) store: memories and search > add, get, dedupe by content, update, delete [3.00ms]
(pass) store: memories and search > a memory needs a title or text [2.00ms]
(pass) store: memories and search > full-text search ranks, prefix-matches, filters, and follows edits and deletes [8.00ms]
(pass) store: memories and search > hostile search text cannot break the query [2.00ms]
(pass) store: memories and search > timeline returns neighbours in time order around an anchor, skipping raw events [5.00ms]
(pass) store: memories and search > list filters, pins sort first, pagination counts [3.00ms]
(pass) store: memories and search > merging projects keeps one copy of identical memories [3.00ms]
(pass) store: memories and search > context gives pinned, recent and rules, and honours the tool filter and size cap [4.00ms]
(pass) store: rules > add validates, dedupes, updates, removes [2.00ms]
(pass) bundles: export and import > a bundle round-trips into an empty store, twice without duplicates [6.00ms]
(pass) bundles: export and import > raw events are included only when asked [2.00ms]
(pass) bundles: export and import > a non-bundle, a newer version and bad lines are handled [2.00ms]
(pass) bundles: export and import > markdown export is readable and leaves out prompts and events [3.00ms]
(pass) rules sync > render groups by scope, filters by tool, drops disabled
(pass) rules sync > a managed block is appended, replaced in place, and never touches the user's text [1.00ms]
(pass) rules sync > syncTool previews without writing, then writes with a backup and is idempotent [9.00ms]
(pass) rules sync > each tool gets its own file; Cursor's is a whole .mdc with frontmatter; a tool with no global file is skipped [10.00ms]
(pass) rules sync > global scope writes under HOME [5.00ms]
(pass) rules sync > rules are parsed back out of a managed block, or a plain file, with scopes
(pass) tools: detection and MCP connection > detection follows what exists in HOME [5.00ms]
(pass) tools: detection and MCP connection > JSON tools: plan, connect (backup + merge keeping other servers), and idempotence [5.00ms]
(pass) tools: detection and MCP connection > a config file that is not valid JSON is refused, not overwritten [5.00ms]
(pass) tools: detection and MCP connection > Windsurf: uses whichever of its two documented config files exists [8.00ms]
(pass) tools: detection and MCP connection > Codex gets a TOML block appended; OpenCode its own shape; Claude Code a command [4.00ms]
(pass) capture: redaction and normalisation > secrets and <private> never survive
(pass) capture: redaction and normalisation > a Claude Code style prompt and tool event become memories; noise is dropped [1.00ms]
(pass) MCP server > initialize negotiates, lists seven tools, and notifications get no reply
(pass) MCP server > the 3-layer flow works across tools: one saves, another finds, fetches and sees context [3.00ms]
(pass) MCP server > secrets are redacted before saving, bad input is an error result, unknown tools too [3.00ms]
(pass) MCP server > the stdio entry point speaks the protocol end to end [69.00ms]
(pass) import from claude-mem > observations, summaries and prompts arrive with their tool and are not duplicated on a second run [13.00ms]
(pass) compress > validates a model's observations strictly
(pass) compress > raw events become observations once; the watermark prevents reprocessing; a refusal is retried [4.00ms]
(pass) compress > two refusals fail loudly and move nothing [3.00ms]
(pass) HTTP: hub routes, /v1 and the UI > the Hub UI is served, and never uses innerHTML [5.00ms]
(pass) HTTP: hub routes, /v1 and the UI > /api/hub is local-only and /v1 needs the key when one is set [13.00ms]
(pass) HTTP: hub routes, /v1 and the UI > /v1: save from one tool, search from another, context, events with redaction [5.00ms]
(pass) HTTP: hub routes, /v1 and the UI > memory CRUD, filters and projects [3.00ms]
(pass) HTTP: hub routes, /v1 and the UI > rules API, preview then write, and importing back from the written file [6.00ms]
(pass) HTTP: hub routes, /v1 and the UI > tools API: list, preview, connect needs confirm, then writes the config [7.00ms]
(pass) HTTP: hub routes, /v1 and the UI > export and import through HTTP, claude-mem import, overview and audit [6.00ms]

test/server.test.mjs:
(pass) static > / serves the SPA shell with framing blocked
(pass) static > assets are served with their types [1.00ms]
(pass) static > path traversal is refused [2.00ms]
(pass) static > unknown API routes 404 like the original
(pass) guards > a spoofed Host header is refused [153.00ms]
(pass) guards > proxy headers are refused [1.00ms]
(pass) guards > a POST without a JSON content type is refused
(pass) guards > a POST from another origin is refused
(pass) guards > a POST from this server's own origin is accepted [17.00ms]
(pass) guards > bad bodies are 400 with a reason [4.00ms]
(pass) snapshot > has the original's top-level keys in order [3.00ms]
(pass) snapshot > every card carries a fingerprint, a review and human copy state [3.00ms]
(pass) snapshot > the revision changes when something is saved [19.00ms]
(pass) review > a request that is not reported complete cannot be checked [5.00ms]
(pass) review > a stale fingerprint is refused with the latest snapshot [6.00ms]
(pass) review > an unknown request is 404 [3.00ms]
(pass) rules > add -> edit -> turn off -> turn on -> replace -> dismiss, with MY-RULES.md following [66.00ms]
(pass) rules > a project rule needs a name; a missing rule is 404; restore-suggestion needs a learned rule [17.00ms]
(pass) rules > a project-scoped rule is grouped under its project in MY-RULES.md [8.00ms]
(pass) rules > load-in-claude-code appends the @ line once [6.00ms]
(pass) subagents > mark finished records a stop and flips the agent [19.00ms]
(pass) subagents > a top-level session cannot be marked finished [4.00ms]
(pass) evidence and work-state writes > evidence returns the recorded row, 404 for unknown, 400 for a bad id [4.00ms]
(pass) evidence and work-state writes > POST /api/work-state/entries saves under the project of cwd and the view reflects it [16.00ms]
(pass) evidence and work-state writes > my-rules cannot be written through the generic route; oversize fields are refused [2.00ms]
(pass) events > the stream opens with a retry hint and a full snapshot [5.00ms]
(pass) setup > setup is permanently complete [1.00ms]

test/refresh.test.mjs:
(pass) ledger commands > grouping-input returns one project root at a time with the opening asks [10.00ms]
(pass) ledger commands > refresh-needs reports ungrouped conversations before any grouping [7.00ms]
(pass) ledger commands > apply refuses to join conversations without a link or across projects [9.00ms]
(pass) ledger commands > record-progress refuses a shipped request without 100% and a ship date [9.00ms]
(pass) grouping validation > every conversation must be decided
(pass) grouping validation > a conversation that was not asked about is refused, except an open request's anchor first [1.00ms]
(pass) grouping validation > extractJson takes the outermost object
(pass) the full refresh with a fake model > groups, reviews, aligns and writes the story; the view then shows all of it [43.00ms]
(pass) the full refresh with a fake model > a refused answer is retried once with the refusal quoted; a second refusal fails and keeps the raw answer [10.00ms]
(pass) auto refresh scheduling > runs when something is due, records the outcome, and goes idle when nothing is [29.00ms]
(pass) auto refresh scheduling > a failing job is recorded as failed with its error [6.00ms]
(pass) auto refresh scheduling > disabled does nothing [4.00ms]

test/readmodel.test.mjs:
(pass) text rules > a greeting is not a request, an ask is
(pass) text rules > scaffolding is stripped from the request text
(pass) text rules > a title is the first sentence, at most 100 characters
(pass) work state fold > task fields accumulate and null deletes
(pass) work state fold > done closes a task and the list stops being open
(pass) work state fold > list state without a task lives on the list [1.00ms]
(pass) work product from recorded Bash calls > commit, branch and repo from commit then push output
(pass) work product from recorded Bash calls > gh pr create yields a pull request
(pass) work product from recorded Bash calls > git hides the user in ssh remotes, so the repo is unknown (same as the original)
(pass) work product from recorded Bash calls > a failed push produces no branch
(pass) projection on the fixture database > connected and read-only [1.00ms]
(pass) projection on the fixture database > one card per human request, newest first
(pass) projection on the fixture database > later asks in a session are scope updates, not new cards
(pass) projection on the fixture database > commit, branch and PR attach to the request of their session
(pass) projection on the fixture database > a subagent is its own agent with its launch as the request
(pass) projection on the fixture database > explicit request ids group work-state items under one request
(pass) projection on the fixture database > goals come from the owner-goals list
(pass) projection on the fixture database > observations are read even though the table has no content_session_id
(pass) projection on the fixture database > bug-compatible mode reproduces the original's empty observation half [4.00ms]
(pass) projection on the fixture database > the content fingerprint is stable and changes with the source work [1.00ms]
(pass) projection on the fixture database > evidence URLs resolve to recorded rows [1.00ms]
(pass) projection on the fixture database > joins by conversation: a sibling ask in the same project is a separate card until the ledger groups it

 115 pass
 0 fail
 552 expect() calls
Ran 115 tests across 6 files. [1.68s]
```

Exit code: 0.

## 3. Task consistency

Command:

```bash
bun scripts/check-tasks.mjs
```

Real output:

```text
check-tasks: ok — 98 tasks (todo=98)
```

Exit code: 0.

### 3.1 Failure-mode self-test

The checker was run against four mutated copies of `docs/tasks` in a temporary directory. Each copy should fail, and
each did:

| Case | Expected error | Exit |
|---|---|---|
| `validated` with empty Evidence | `validated but Evidence is empty` | 1 |
| Missing dependency `T-999` | `dependency T-999 does not exist` | 1 |
| Table says `doing`, file says `todo` | `status "doing" != task file "todo"` | 1 |
| Validation command removed | `no non-empty Validation command` | 1 |

Command shape (the checker accepts `TASKS_DIR` for this test only):

```bash
TASKS_DIR=/tmp/taskcheck-copy bun scripts/check-tasks.mjs
```

## 4. Self-check against the prompt

| Requirement | Result |
|---|---|
| Every URL in documents 20-24 appears in the research log | 69/69 unique URLs present; the 11 that are endpoints or commands are listed in section H with why they were not fetched |
| Every `UNVERIFIED` is listed in `unverified.md` with what would verify it | 36 rows, including the untested product claims |
| `bun test` output in this report | Yes, full output above |
| `check-tasks` output in this report | Yes, full output above |
| Competitor count (>=25) | 42 |
| Feature rows counted | 163 |
| No source/test/bench/public/bin edits | Confirmed by `git status`; only `docs/`, `AGENTS.md`, `scripts/check-tasks.mjs` and one `package.json` script entry changed |
| No push | Confirmed; commits are local on `docs/roadmap-and-research` |
| Small commits per deliverable | One commit for D1, D2, D3+D4, D5 and D6 |

## 5. Assumptions

1. The working directory `work-view-local` is the `aletheia-mem` repository. The package name, remote and homepage all
   say so; the directory name is the only difference.
2. The "current numbers" in [22](../22-improve-the-numbers.md) are copied from [14](../14-research-ai-memory.md#146-measured-results).
   This run did not rerun the benchmarks: that needs the LoCoMo download and the optional transformers package, and the
   prompt scopes this run to documents.
3. The claude-mem analysed is 15.2.1 at commit `1ef0875` (2026-10-26), the latest on that date. The docs are the live
   `docs.claude-mem.ai` site, fetched as `llms-full.txt`.
4. "30+ README translations" is 32 files under `docs/i18n/README.*.md`, counted from the repository tree.
5. "35 modes" is 35 JSON files under `plugin/modes/`; 29 of them are language modes. The docs' own feature list calls
   this "28 languages", so both numbers are reported with their source rather than reconciled.
6. The prompt's "about 103k stars" is the rounded API value; the dated exact value is 103,244.
7. Vendor products without fetchable documentation are `UNVERIFIED`, not described from memory. ChatGPT memory was
   readable through a text proxy; Gemini and Copilot were not.
8. Task IDs are `T-001` to `T-098`, grouped into phases P0 to P5. Each is scoped to one short session and has a
   runnable validation command that the task itself creates when needed.
9. `package.json` changed only to add `"check:tasks": "bun scripts/check-tasks.mjs"`, which the prompt requires.
10. The task checker's `TASKS_DIR` environment variable exists only so its failure modes can be tested; the default is
    `docs/tasks`.

## 6. What could not be done, and why

| Item | Why |
|---|---|
| Direct fetch of OpenAI help pages | HTTP 403 to both `curl` and the built-in fetcher; a text proxy was used for the ChatGPT memory FAQ |
| GitHub Copilot memory documentation | Two guessed GitHub Docs URLs returned 404 and the search returned no usable page; left `UNVERIFIED` |
| Gemini memory documentation | The Google support URL tried is a limits page, not a memory page; left `UNVERIFIED` |
| Cursor memory page body | The page is JavaScript-rendered; only navigation text was readable; specifics left `UNVERIFIED` |
| Reddit rules | Every `about/rules.json` request returned HTTP 403 |
| Prices for most commercial products | Pricing pages were not fetched; every price cell says `UNVERIFIED` rather than guessing |
| `awesome-selfhosted` contribution criteria | The tried `CONTRIBUTING.md` path returned 404 |
| Exact Hindsight benchmark table | The fetched arXiv abstract states the claim but not the scores |
| Benchmark reruns | Out of scope for a documentation-only run; the commands are in [22 §22.5](../22-improve-the-numbers.md#225-measurement-commands-that-exist-today) |
| Real-install verification of any tool | No tool was installed or run in a container during this run; the docs say so |
| Translation files | Planned as tasks T-088 and T-089, not produced by this run |

## 7. Files created or changed in this run

| Path | Change |
|---|---|
| `docs/20-claude-mem-feature-matrix.md` | New: 163 feature rows |
| `docs/21-competitor-landscape.md` | New: 42 competitor rows and capability matrices |
| `docs/22-improve-the-numbers.md` | New: scoreboard and 18 experiments |
| `docs/23-memory-building.md` | New: memory-building design and schema v3 |
| `docs/24-repo-parity-and-growth.md` | New: README, i18n, badges, polish, growth |
| `docs/tasks/TASKS.md` | New: 98-row status table and legend |
| `docs/tasks/T-001.md` to `T-098.md` | New: one work order per task |
| `docs/tasks/research-log.md` | New: every source fetched, with date |
| `docs/tasks/unverified.md` | New: 36 unverified items and how to resolve them |
| `docs/tasks/run-report.md` | New: this file |
| `AGENTS.md` | New: task workflow and writing rules |
| `scripts/check-tasks.mjs` | New: dependency-free consistency checker |
| `package.json` | One script entry: `check:tasks` |
