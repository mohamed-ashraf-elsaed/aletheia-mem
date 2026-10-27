# Run report

Generated 2026-10-27T13:48:27.213Z by `bun scripts/run-report.mjs`. This file is written from real command output; edit the script, not the report.

## bun test

Exit code: 0 · 44.93s

```text
bun test v1.3.10 (30e609e0)
importance synthetic rank: Spearman 0.645 over 200 items
hook work p95 1.92 ms over 50 runs
dedupe labelled set: precision 1.00, recall 0.90 at 0.92
claude-code hook work p95 1.38 ms over 25 runs
command-code hook work p95 1.54 ms over 25 runs
cursor hook work p95 1.53 ms over 25 runs
codex hook work p95 1.71 ms over 25 runs
gemini-cli hook work p95 1.46 ms over 25 runs
windsurf hook work p95 1.47 ms over 25 runs
```
stderr:

```text

test/community-files.test.mjs:
(pass) community files > every file exists and is non-empty [1.00ms]
(pass) community files > the issue forms have the GitHub form keys
(pass) community files > the PR template carries the AGENTS.md validation checklist
(pass) community files > the Code of Conduct names a contact and its source
(pass) community files > SECURITY.md names the private reporting channel

test/release-files.test.mjs:
(pass) release files > the changelog follows Keep a Changelog and says 0.1.0 is not released
(pass) release files > Dependabot updates GitHub Actions only
(pass) release files > FUNDING is absent because the owner has not chosen a destination
(pass) release files > CI runs the suite, the task check and the table drift check on Linux
(pass) release files > no release workflow or tag is created

test/claude-hooks.test.mjs:
aletheia: data directory /tmp/work-view-fixture-D4BdSZ/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-D4BdSZ/data/hub.db mode 0644 -> 0600
(pass) Claude Code hooks > SessionStart prints a wrapped context block with pinned memory and rules [30.00ms]
aletheia: data directory /tmp/work-view-fixture-YlLgTB/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-YlLgTB/data/hub.db mode 0644 -> 0600
(pass) Claude Code hooks > resume stays silent, compact and clear re-inject [26.00ms]
aletheia: data directory /tmp/work-view-fixture-7PaxEJ/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-7PaxEJ/data/hub.db mode 0644 -> 0600
(pass) Claude Code hooks > UserPromptSubmit stores the prompt and redacts secrets [21.00ms]
aletheia: data directory /tmp/work-view-fixture-htuhMh/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-htuhMh/data/hub.db mode 0644 -> 0600
(pass) Claude Code hooks > PostToolUse stores the tool, input and a truncated output, and skips noise [18.00ms]
aletheia: data directory /tmp/work-view-fixture-HjeJCc/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-HjeJCc/data/hub.db mode 0644 -> 0600
(pass) Claude Code hooks > repeated events are deduped [20.00ms]
aletheia: data directory /tmp/work-view-fixture-fUaFbT/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-fUaFbT/data/hub.db mode 0644 -> 0600
(pass) Claude Code hooks > Stop and SessionEnd queue compression and keep the last assistant message [22.00ms]
(pass) Claude Code hooks > broken input and unknown tools return exit 0 with no output [5.00ms]
aletheia: data directory /tmp/work-view-fixture-7qOgz5/data mode 0775 -> 0700
aletheia: data directory /tmp/work-view-fixture-7qOgz5/data/spool mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-7qOgz5/data/spool/hook-spool.jsonl mode 0664 -> 0600
aletheia: file /tmp/work-view-fixture-7qOgz5/data/hub.db mode 0644 -> 0600
(pass) Claude Code hooks > a store that cannot open spools the redacted event, and the next run flushes it [18.00ms]
aletheia: data directory /tmp/work-view-fixture-hbClK8/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-hbClK8/data/hub.db mode 0644 -> 0600
(pass) Claude Code hooks > Command Code captures tool events, queues on Stop, injects context, and has no prompt event [34.00ms]

test/robustness.test.mjs:
aletheia: file /tmp/work-view-fixture-kCExOp/h.db mode 0644 -> 0600
aletheia: file /tmp/work-view-fixture-ZOHxT7/shared.db mode 0644 -> 0600
(pass) concurrent writers on one database file > four processes write while a fifth reads: nothing is lost, nothing errors [307.00ms]
(pass) hostile input > search and list survive every FTS metacharacter and odd string [14.00ms]
(pass) hostile input > filters are parameters, so injection through project/kind/tool does nothing [7.00ms]
(pass) hostile input > bundle import tolerates prototype-pollution keys, non-objects, huge fields and bad types [10.00ms]
(pass) hostile input > a memory title that is markup is stored as text, never interpreted by the API [7.00ms]
(pass) hostile input > redaction holds across formats and positions [1.00ms]
[work-view] request failed: POST http://127.0.0.1:41401/api/hub/import/claude-mem 18 | /**
19 |  * Fail loudly when an upstream claude-mem schema moved. Returns the tables it checked. Throws a RangeError that
20 |  * names the database, the missing table or the missing column. Call it before reading any row.
21 |  */
22 | export function probeClaudeMemSchema(src, dbPath, { includePrompts = true } = {}) {
23 |   const tables = new Set(src.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((row) => row.name));
                                  ^
SQLiteError: file is not a database
      errno: 26,
 byteOffset: -1,
       code: "SQLITE_NOTADB"

      at prepare (bun:sqlite:345:37)
      at probeClaudeMemSchema (/home/mashraf/Projects/aletheia-ship/src/hub/importers.mjs:23:30)
      at importClaudeMem (/home/mashraf/Projects/aletheia-ship/src/hub/importers.mjs:46:5)
      at handle (/home/mashraf/Projects/aletheia-ship/src/hub/routes.mjs:592:21)
      at async route (/home/mashraf/Projects/aletheia-ship/src/server.mjs:228:41)
      at async fetch (/home/mashraf/Projects/aletheia-ship/src/server.mjs:240:22)

(pass) HTTP hardening > oversized bodies are refused, malformed JSON is a 400, a body of the wrong shape is a 400 not a 500 [32.00ms]
(pass) HTTP hardening > rule sync refuses a non-folder, and import-from-file refuses directories and huge files [1.00ms]
(pass) HTTP hardening > every route answers JSON errors, never a stack trace [1.00ms]
(pass) HTTP hardening > the server survives a burst of 200 parallel requests [132.00ms]
(pass) HTTP hardening > teardown [4.00ms]

test/alerts.test.mjs:
(pass) T-114: alert rules and webhooks > a rule fires once and signs the body with HMAC-SHA256 [5.00ms]
(pass) T-114: alert rules and webhooks > the SSRF guard refuses loopback unless the rule allows private targets [2.00ms]
(pass) T-114: alert rules and webhooks > a 5xx retries with backoff and then delivers [2.00ms]
(pass) T-114: alert rules and webhooks > a slow webhook times out and is retried [33.00ms]
(pass) T-114: alert rules and webhooks > a per-rule rate limit stops an alert storm [1.00ms]
(pass) T-114: alert rules and webhooks > a count threshold waits for N events in the window [1.00ms]
(pass) T-114: alert rules and webhooks > a minimum value gates a queue-depth rule
(pass) T-114: alert rules and webhooks > a file target appends the event and makes no network call [2.00ms]
(pass) T-114: alert rules and webhooks > the sync hub emits device.paired for a real join [14.00ms]
(pass) T-114: alert rules and webhooks > the extraction worker emits a failure and queue depth [10.00ms]

test/importance.test.mjs:
(pass) importance formula > the weights sum to one and every component is inspectable [1.00ms]
(pass) importance formula > pinned items score 1.0 on the user component and do not decay
(pass) importance formula > recompute stores the score and its inputs on each observation [10.00ms]
(pass) importance formula > a 200-item synthetic human rank gives Spearman >= 0.5 [1.00ms]

test/e2e-capture.test.mjs:
aletheia: data directory /tmp/work-view-fixture-WBvUT2/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-WBvUT2/data/hub.db mode 0644 -> 0600
(pass) end to end: install, hooks, server, spool, doctor, uninstall > one install command wires Claude Code, and the installed commands capture a session [518.99ms]
(pass) end to end: install, hooks, server, spool, doctor, uninstall > Command Code installs its own hooks; prompts are not captured because the event does not exist [265.00ms]
(pass) end to end: install, hooks, server, spool, doctor, uninstall > a run while the store is unavailable spools, and the next run flushes everything [137.00ms]
(pass) end to end: install, hooks, server, spool, doctor, uninstall > hook work stays under 100 ms at p95 over 50 runs [78.00ms]
(pass) end to end: install, hooks, server, spool, doctor, uninstall > doctor sees the server, both hook sets, an empty spool and the last capture [109.00ms]
(pass) end to end: install, hooks, server, spool, doctor, uninstall > uninstall removes only the installed entries [142.00ms]

test/install-opencode.test.mjs:
(pass) T-068: OpenCode installer (mcp+rules) > a dry run plans the documented mcp key and global rules, and writes nothing [5.00ms]
(pass) T-068: OpenCode installer (mcp+rules) > the config uses type local with an argv command, and a second install is a no-op [28.00ms]
(pass) T-068: OpenCode installer (mcp+rules) > doctor reports opencode as mcp+rules without a hook check [22.00ms]
(pass) T-068: OpenCode installer (mcp+rules) > uninstall removes the mcp entry and the managed rules block [20.00ms]
(pass) T-068: OpenCode installer (mcp+rules) > a JSONC-only config is refused instead of parsed as JSON [3.00ms]

test/dedupe-insert.test.mjs:
(pass) dedupe on the insert path > two sessions saying the same fact produce one current fact with two sources [11.00ms]
(pass) dedupe on the insert path > the worker dedupe pass merges a near-duplicate observation and keeps an audit row [12.00ms]

test/rule-lint.test.mjs:
(pass) T-072: rule hygiene > a clean set has zero findings [1.00ms]
(pass) T-072: rule hygiene > duplicate rules are reported once per group [1.00ms]
(pass) T-072: rule hygiene > an always/never pair is a direct contradiction
(pass) T-072: rule hygiene > a single over-long rule and an oversized set are both reported [3.00ms]
(pass) T-072: rule hygiene > an instruction to ignore safety is flagged
(pass) T-072: rule hygiene > a secret in a rule is flagged without echoing the secret
(pass) T-072: rule hygiene > drift: a rule only in the managed block and a rule only in the store [1.00ms]
(pass) T-072: rule hygiene > every finding carries a rule id and a fix hint

test/work-goals.test.mjs:
aletheia: file /tmp/work-view-fixture-LYUYcr/goals.db mode 0644 -> 0600
(pass) T-144: owner goals > an imperative topic repeated across sessions is a counted goal with dated quote ids [3.00ms]
(pass) T-144: owner goals > tool events, summaries and non-imperative notes are not used [2.00ms]
(pass) T-144: owner goals > all projects can form a goal that one project cannot [1.00ms]
(pass) T-144: owner goals > pin, dismiss and restore are reversible settings, not deletes [3.00ms]
aletheia: file /tmp/work-view-fixture-LYUYcr/goals-episodes.db mode 0644 -> 0600
(pass) T-144: owner goals > back-filled transcript user turns count as goals and dedupe against the hook prompt in the same session [10.00ms]
(pass) T-144: owner goals > the goals route lists, pins, dismisses and restores through the API [12.00ms]

test/ui-rules.test.mjs:
(pass) T-210: the rule list > shows every rule with its scope, tools and state [39.00ms]
(pass) T-210: the rule list > an empty list says what a rule is and offers Add and Import [12.00ms]
(pass) T-210: the rule list > Turn off is immediate, sent to the server, and Undo turns it back on [34.00ms]
(pass) T-210: the rule list > a failed toggle rolls back and says why [31.00ms]
(pass) T-210: the rule list > the text filter narrows the list without a request [10.00ms]
(pass) T-210: the rule list > rule text and the filter handle hostile and right-to-left text as plain text [11.00ms]
(pass) T-210: add a rule > an empty rule is refused with a reason [12.00ms]
(pass) T-210: add a rule > a scoped rule needs a name; a good one posts its fields and the chosen tools [21.00ms]
(pass) T-210: suggested rules > pending suggestions page from the server with their project and sort [12.00ms]
(pass) T-210: suggested rules > Approve hides the row first; Undo restores it and turns the new rule off [33.00ms]
(pass) T-210: suggested rules > a dismissed suggestion has Restore, not Approve [10.00ms]
(pass) T-210: suggested rules > the empty state promises that nothing applies without Approve [10.00ms]
(pass) T-210: writing rules into tool files > needs a folder for a project write [21.00ms]
(pass) T-210: writing rules into tool files > Preview posts without confirm and shows the new content [20.00ms]
(pass) T-210: writing rules into tool files > Write files asks first, says what will happen, and cancelling writes nothing [31.00ms]
(pass) T-210: writing rules into tool files > confirming sends confirm: true and shows the written files [31.00ms]
(pass) T-210: writing rules into tool files > detected tools are ticked by default [11.00ms]
(pass) T-210: import and the frame > import posts the tool and the scope and reports the counts [21.00ms]
(pass) T-210: import and the frame > the frame shows the title, four pages and the suggestion count [36.00ms]

test/output-language.test.mjs:
(pass) T-120: output language > language tags are validated and normalised
(pass) T-120: output language > the setting is stored per project, with the global value as fallback [9.00ms]
(pass) T-120: output language > the prompt carries the language only when one is set [2.00ms]
(pass) T-120: output language > the worker resolves the project language and the summary follows the facts [16.00ms]
(pass) T-120: output language > the CLI sets and lists the setting for a project [209.00ms]

test/temporal-schema.test.mjs:
(pass) bi-temporal facts > a fact with valid_to is excluded from current results [8.00ms]
(pass) bi-temporal facts > an as-of query returns the fact that was true inside its range [5.00ms]
(pass) bi-temporal facts > closing a fact changes valid_to and status but never recorded_at [7.00ms]
(pass) bi-temporal facts > history keeps both rows, oldest first, after the newer fact supersedes the older [8.00ms]

test/ui-pure.test.mjs:
(pass) T-201: pager maths > first page of 312 rows at 25 per page [1.00ms]
(pass) T-201: pager maths > the middle shows neighbours and gaps
(pass) T-201: pager maths > a one-page gap is filled, not elided
(pass) T-201: pager maths > last page is partial and says so
(pass) T-201: pager maths > empty and out-of-range inputs are clamped
(pass) T-201: pager maths > limit is capped at 100
(pass) T-201: pager maths > offsetForPage clamps to the last page
(pass) T-201: relative time and numbers > english short forms
(pass) T-201: relative time and numbers > iso strings work and bad input says unknown
(pass) T-201: relative time and numbers > other locales go through Intl [5.00ms]
(pass) T-201: relative time and numbers > numbers and bytes
(pass) T-201: relative time and numbers > updatedAgo
(pass) T-201: relative time and numbers > count-up is monotone and lands on the target
(pass) T-201: highlight escaping > hits are split out and HTML stays text [1.00ms]
(pass) T-201: highlight escaping > regex characters in the query are literal
(pass) T-201: highlight escaping > a hostile query cannot add markup because parts are plain strings
(pass) T-201: highlight escaping > no query or no text returns one plain part
(pass) T-201: highlight escaping > terms are unique, longest first and capped
(pass) T-201: highlight escaping > Arabic text matches
(pass) T-201: hash state > round trip [1.00ms]
(pass) T-201: hash state > defaults and empties are dropped
(pass) T-201: hash state > session ids with slashes survive
(pass) T-201: hash state > garbage does not throw
(pass) T-201: Region state machine > idle -> loading -> success
(pass) T-201: Region state machine > empty is its own state
(pass) T-201: Region state machine > error then retry returns to loading and clears the message
(pass) T-201: Region state machine > a reload keeps the content and a failed reload keeps it too
(pass) T-201: Region state machine > reload from error behaves like a first load
(pass) T-201: Region state machine > unknown events change nothing and reset restores the start
(pass) T-201: Region state machine > error details carry the request and no more
(pass) T-201: polling backoff > doubles per failure and caps [1.00ms]
(pass) T-201: polling backoff > returns null while hidden
(pass) T-201: polling backoff > jitter scales the delay
(pass) T-201: keyboard helpers > Tab wraps in a dialog
(pass) T-201: keyboard helpers > arrow keys move through tabs and wrap
(pass) T-201: keyboard helpers > shortcuts ignore typing targets
(pass) T-201: keyboard helpers > g then a letter completes within the window
(pass) T-201: keyboard helpers > the chord expires and a stray key resets it
(pass) T-205: command ranking > exact, prefix, word start, substring and subsequence rank in that order [1.00ms]
(pass) T-205: command ranking > rankCommands filters, sorts and keeps order on ties

test/dockerfile.test.mjs:
(pass) Docker files > the base image is pinned and the container runs as a non-root user
(pass) Docker files > the data directory is a volume and the healthcheck uses /healthz
(pass) Docker files > no secret is baked into the image [1.00ms]
(pass) Docker files > compose keeps the service on loopback and persists /data
(pass) Docker files > the build context excludes the repository and local data
(pass) Docker files > docker build is recorded as not run

test/goals-script.test.mjs:
aletheia: data directory /tmp/work-view-fixture-bTGM3q/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-bTGM3q/data/hub.db mode 0644 -> 0600
(pass) save_goals.py saves goals through the clone, replaces the previous snapshot and the view shows them [192.00ms]
(pass) a quote that is not the owner's words is refused before anything is saved [92.00ms]

test/work-query.test.mjs:
aletheia: file /tmp/work-view-fixture-66EeIJ/work-query.db mode 0644 -> 0600
(pass) T-173: work list query params > filter all / needs-you / shipped counts come from rows [5.00ms]
(pass) T-173: work list query params > sort puts needs-you first and most-progress first [4.00ms]
(pass) T-173: work list query params > group by agent/tool buckets requests under their tool [2.00ms]
(pass) T-173: work list query params > the /v1/work/requests route accepts filter, sort and group [9.00ms]

test/install-gemini.test.mjs:
(pass) T-064: Gemini CLI installer and hooks > a dry run merges MCP and hooks in one settings step plus GEMINI.md [5.00ms]
(pass) T-064: Gemini CLI installer and hooks > settings.json keeps other keys, hooks and servers; a second run is a no-op [21.00ms]
aletheia: data directory /tmp/work-view-fixture-IuedRU/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-IuedRU/data/hub.db mode 0644 -> 0600
(pass) T-064: Gemini CLI installer and hooks > the installed hooks capture prompt, tool and response, and doctor sees 5/5 [386.00ms]
(pass) T-064: Gemini CLI installer and hooks > uninstall removes our MCP entry and hooks, keeping the user's settings [16.00ms]

test/facts.test.mjs:
(pass) fact validator > rejects a shape that is not a facts array and more than five facts
(pass) fact validator > caps every field and requires confidence [1.00ms]
(pass) fact validator > an orphan fact is rejected: every cited episode must be in this window
(pass) fact validator > an instruction is not a fact
(pass) fact validator > dates and entities are normalised, and a normal answer passes
(pass) rule-based fallback > a fixture round produces the expected facts [8.00ms]
(pass) rule-based fallback > it stays quiet on tool noise and instructions [1.00ms]
(pass) provider path > a valid answer is stored with mode, prompt version and model [7.00ms]
(pass) provider path > a malformed answer is retried once with the refusal quoted [7.00ms]
(pass) provider path > two refusals keep the raw output and store nothing [6.00ms]
(pass) provider path > the prompt redacts secrets before anything leaves the machine
(pass) provider path > a provider that throws is not swallowed: the queue must retry [6.00ms]

test/migration-v3.test.mjs:
aletheia: file /tmp/aletheia-migrate-QuP6pY/hub.db mode 0644 -> 0600
aletheia: file /tmp/aletheia-migrate-QuP6pY/hub.db-wal mode 0644 -> 0600
aletheia: file /tmp/aletheia-migrate-QuP6pY/hub.db-shm mode 0644 -> 0600
(pass) schema v3 migration > a 50k-row v2 database migrates with identical counts and resolvable ids [5504.93ms]
aletheia: file /tmp/aletheia-migrate-uiEkop/broken.db mode 0644 -> 0600
aletheia: file /tmp/aletheia-migrate-uiEkop/broken.db-wal mode 0644 -> 0600
aletheia: file /tmp/aletheia-migrate-uiEkop/broken.db-shm mode 0644 -> 0600
(pass) schema v3 migration > a failed step rolls back and leaves user_version=2 with every memory intact [5.00ms]
aletheia: file /tmp/aletheia-migrate-Zvu8fZ/hub.db mode 0644 -> 0600
aletheia: file /tmp/aletheia-migrate-Zvu8fZ/hub.db-wal mode 0644 -> 0600
aletheia: file /tmp/aletheia-migrate-Zvu8fZ/hub.db-shm mode 0644 -> 0600
(pass) schema v3 migration > the old Hub routes answer after migration [35.00ms]
(pass) schema v3 migration > aletheia migrate: dry run writes nothing; a real run backs up first [145.00ms]

test/ui-tools.test.mjs:
(pass) T-211: the tools page > a card per tool with hooks status, last capture, spool and a Copy button for every command [29.00ms]
(pass) T-211: the tools page > a hooks error is shown, not hidden [10.00ms]
(pass) T-211: the tools page > jargon has a tooltip [10.00ms]
(pass) T-211: the tools page > a failing doctor call shows the error with Retry [11.00ms]
(pass) T-211: the tools page > the old viewer card appears only when its database exists [11.00ms]
(pass) T-211: devices > pages from the server and shows counts and the encryption line [11.00ms]
(pass) T-211: devices > no devices explains pairing and gives the command [11.00ms]
(pass) T-211: devices > Revoke asks first and says what happens; cancelling sends nothing [22.00ms]
(pass) T-211: devices > confirming revokes the device and reloads [22.00ms]
(pass) T-211: devices > the pairing code comes with a join command to copy [20.00ms]
(pass) T-211: remote access, checks, activity > a new link shows its token once with the client snippets [21.00ms]
(pass) T-211: remote access, checks, activity > revoking a link asks first and says it cannot be undone [22.00ms]
(pass) T-211: remote access, checks, activity > checks say how many need attention and re-run on demand [20.00ms]
(pass) T-211: remote access, checks, activity > activity pages and filters from the server [11.00ms]

test/ui-region.test.mjs:
(pass) T-207: Region > loading shows the skeleton, then the content [7.00ms]
(pass) T-207: Region > an empty result shows the empty state with its fix [6.00ms]
(pass) T-207: Region > an error shows Retry and Copy details, and Retry loads again [12.00ms]
(pass) T-207: Region > a soft reload keeps the content and a failed one shows a notice beside it [12.00ms]
(pass) T-207: Region > a late answer from an older request is ignored [12.00ms]
(pass) T-207: Region > the height is held while a new page loads, so nothing jumps [12.00ms]
(pass) T-207: Region > setData repaints without a request [6.00ms]
(pass) T-207: list state in the URL > read: defaults, values, bad numbers, unknown limits
(pass) T-207: list state in the URL > write: defaults are left out, other keys stay, the path stays
(pass) T-207: list state in the URL > a prefix keeps two lists apart
(pass) T-207: list state in the URL > round trip
(pass) T-207: paged list > the first page loads with an offset of zero and shows the pager [7.00ms]
(pass) T-207: paged list > next page pushes the URL, loads the next slice and Back returns [18.00ms]
(pass) T-207: paged list > a reload with the page in the URL starts on that page and size [6.00ms]
(pass) T-207: paged list > changing the page size goes back to page one [12.00ms]
(pass) T-207: paged list > a filter change resets to page one and an unmatched filter says so [12.00ms]
(pass) T-207: paged list > a page past the end jumps to the last page [12.00ms]
(pass) T-207: paged list > a small list shows no pager, only the count [6.00ms]
(pass) T-207: paged list > an empty store shows the plain empty state [6.00ms]
(pass) T-207: paged list > the search text reaches the row renderer for highlighting [6.00ms]
(pass) T-207: paged list > a failing page shows the error and Retry works [12.00ms]
(pass) T-207: optimistic actions > apply first, then the request, then an Undo toast [6.00ms]
(pass) T-207: optimistic actions > a failed request rolls back and says why
(pass) T-207: optimistic actions > a failed undo is reported and the screen is left alone [6.00ms]
(pass) T-207: optimistic actions > the undo toast lasts eight seconds
(pass) T-207: optimistic actions > reapply replaces rollback after a successful undo [6.00ms]
(pass) T-207: optimistic actions > a long task shows an indeterminate bar, then the counts
(pass) T-207: optimistic actions > a failing long task shows the failure and rethrows [1.00ms]

test/seed-demo.test.mjs:
aletheia: file /tmp/aletheia-seed-Mo9s70/hub.db mode 0644 -> 0600
(pass) T-216: seed-demo > fills a folder with the requested number of fake memories, facts, review items and suggestions [41.00ms]
aletheia: file /tmp/aletheia-seed-vgbd5c/hub.db mode 0644 -> 0600
(pass) T-216: seed-demo > the seed fills the request, goal, story and economics panels [69.00ms]
aletheia: file /tmp/aletheia-seed-gbZPiV/hub.db mode 0644 -> 0600
(pass) T-216: seed-demo > every row is labelled as demo: projects are demo-*, the tool is demo-seed [33.00ms]
aletheia: file /tmp/aletheia-seed-skWeMw/hub.db mode 0644 -> 0600
(pass) T-216: seed-demo > the data covers what the UI must survive: Arabic, a 200-character token, Markdown, pinned rows [46.00ms]
aletheia: file /tmp/aletheia-seed-jYFKvk/hub.db mode 0644 -> 0600
aletheia: file /tmp/aletheia-seed-Av9MXK/hub.db mode 0644 -> 0600
(pass) T-216: seed-demo > the same seed gives the same text, so screenshots and numbers repeat [52.00ms]
aletheia: file /tmp/aletheia-seed-UDrLCA/hub.db mode 0644 -> 0600
(pass) T-216: seed-demo > it refuses a database that holds real rows, and accepts one it seeded itself [22.00ms]
aletheia: file /tmp/aletheia-seed-8JdwLx/hub.db mode 0644 -> 0600
(pass) T-216: seed-demo > --empty marks the store as demo and adds nothing [6.00ms]
(pass) T-216: seed-demo > the command line needs --data and never guesses a folder [37.00ms]
(pass) T-216: seed-demo > the command line refuses the real data folders under HOME [136.00ms]
(pass) T-216: seed-demo > the command line seeds a temporary folder and says what it wrote [58.00ms]

test/hub.test.mjs:
(pass) store: memories and search > add, get, dedupe by content, update, delete [4.00ms]
(pass) store: memories and search > a memory needs a title or text [7.00ms]
(pass) store: memories and search > full-text search ranks, prefix-matches, filters, and follows edits and deletes [10.00ms]
(pass) store: memories and search > hostile search text cannot break the query [5.00ms]
(pass) store: memories and search > timeline returns neighbours in time order around an anchor, skipping raw events [11.00ms]
(pass) store: memories and search > list filters, pins sort first, pagination counts [10.00ms]
(pass) store: memories and search > merging projects keeps one copy of identical memories [8.00ms]
(pass) store: memories and search > context gives pinned, recent and rules, and honours the tool filter and size cap [10.00ms]
(pass) store: rules > add validates, dedupes, updates, removes [8.00ms]
(pass) bundles: export and import > a bundle round-trips into an empty store, twice without duplicates [12.00ms]
(pass) bundles: export and import > raw events are included only when asked [8.00ms]
(pass) bundles: export and import > a non-bundle, a newer version and bad lines are handled [4.00ms]
(pass) bundles: export and import > markdown export is readable and leaves out prompts and events [8.00ms]
(pass) rules sync > render groups by scope, filters by tool, drops disabled
(pass) rules sync > a managed block is appended, replaced in place, and never touches the user's text
(pass) rules sync > syncTool previews without writing, then writes with a backup and is idempotent [10.00ms]
(pass) rules sync > each tool gets its own file; Cursor's is a whole .mdc with frontmatter; a tool with no global file is skipped [8.00ms]
(pass) rules sync > global scope writes under HOME [4.00ms]
(pass) rules sync > rules are parsed back out of a managed block, or a plain file, with scopes
(pass) tools: detection and MCP connection > detection follows what exists in HOME [3.00ms]
(pass) tools: detection and MCP connection > JSON tools: plan, connect (backup + merge keeping other servers), and idempotence [4.00ms]
(pass) tools: detection and MCP connection > a config file that is not valid JSON is refused, not overwritten [5.00ms]
(pass) tools: detection and MCP connection > Windsurf: uses whichever of its two documented config files exists [9.00ms]
(pass) tools: detection and MCP connection > Codex gets a TOML block appended; OpenCode its own shape; Claude Code a command [4.00ms]
(pass) capture: redaction and normalisation > secrets and <private> never survive [1.00ms]
(pass) capture: redaction and normalisation > a Claude Code style prompt and tool event become memories; noise is dropped
(pass) MCP server > initialize negotiates, lists seven tools, and notifications get no reply [1.00ms]
(pass) MCP server > the 3-layer flow works across tools: one saves, another finds, fetches and sees context [4.00ms]
(pass) MCP server > secrets are redacted before saving, bad input is an error result, unknown tools too [3.00ms]
(pass) MCP server > the stdio entry point speaks the protocol end to end [83.00ms]
(pass) import from claude-mem > observations, summaries and prompts arrive with their tool and are not duplicated on a second run [27.00ms]
(pass) compress > validates a model's observations strictly
(pass) compress > raw events become observations once; the watermark prevents reprocessing; a refusal is retried [9.00ms]
(pass) compress > two refusals fail loudly and move nothing [7.00ms]
aletheia: file /tmp/work-view-fixture-gWiuFa/hub.db mode 0644 -> 0600
(pass) HTTP: hub routes, /v1 and the UI > the Hub UI is served, and never uses innerHTML [6.00ms]
aletheia: file /tmp/work-view-fixture-gWiuFa/hub-keyed.db mode 0644 -> 0600
(pass) HTTP: hub routes, /v1 and the UI > /api/hub is local-only and /v1 needs the key when one is set [19.00ms]
(pass) HTTP: hub routes, /v1 and the UI > /v1: save from one tool, search from another, context, events with redaction [6.00ms]
(pass) HTTP: hub routes, /v1 and the UI > memory CRUD, filters and projects [4.00ms]
(pass) HTTP: hub routes, /v1 and the UI > rules API, preview then write, and importing back from the written file [12.00ms]
(pass) HTTP: hub routes, /v1 and the UI > tools API: list, preview, connect needs confirm, then writes the config [3.00ms]
(pass) HTTP: hub routes, /v1 and the UI > export and import through HTTP, claude-mem import, overview and audit [9.00ms]

test/mcp-http.test.mjs:
(pass) T-067: MCP Streamable HTTP transport > initialize returns a session id and tools/list answers with it [3.00ms]
(pass) T-067: MCP Streamable HTTP transport > a wrong Origin is rejected with 403 [1.00ms]
(pass) T-067: MCP Streamable HTTP transport > a loopback Origin is accepted
(pass) T-067: MCP Streamable HTTP transport > GET answers 405 because no server-initiated stream is offered
(pass) T-067: MCP Streamable HTTP transport > a non-init request without a session id is 400 and an unknown id is 404 [1.00ms]
(pass) T-067: MCP Streamable HTTP transport > DELETE terminates a session and later requests get 404
(pass) T-067: MCP Streamable HTTP transport > a batch is answered as an array and notifications get no response [2.00ms]
(pass) T-067: MCP Streamable HTTP transport > a notification-only POST is answered 202 with no body
(pass) T-067: MCP Streamable HTTP transport > a body over the cap is refused with 413 [8.00ms]
(pass) T-067: MCP Streamable HTTP transport > tools/call saves and searches through the HTTP transport [2.00ms]
(pass) T-067: MCP Streamable HTTP transport > a missing bearer key is rejected when a key is configured [9.00ms]
(pass) T-067: MCP Streamable HTTP transport > an unparsable body is a 400 JSON-RPC parse error [1.00ms]
(pass) T-067: MCP Streamable HTTP transport > a request whose body never finishes gets 408 after the timeout [508.99ms]

test/work.test.mjs:
aletheia: file /tmp/work-view-fixture-wWSXO6/work.db mode 0644 -> 0600
(pass) T-142: the Work query layer > a project shows its sessions newest first, with counts, the last prompt, summary and source facts [8.00ms]
(pass) T-142: the Work query layer > a real session-end event wins over the 5-minute heuristic and is labelled [10.00ms]
(pass) T-142: the Work query layer > facts, pinned items, review, queue, dismissals and last capture all come from rows [5.00ms]
(pass) T-142: the Work query layer > all projects and one project differ; an empty store says so [13.00ms]
(pass) T-142: the Work query layer > a session detail has the timeline, summary and facts with sources [2.00ms]
(pass) T-142: the Work query layer > the /v1/work routes answer with the same shapes [12.00ms]
aletheia: file /tmp/work-view-fixture-wWSXO6/empty-work.db mode 0644 -> 0600
(pass) T-142: the Work query layer > /v1/work on an empty hub says empty, not fake [17.00ms]

test/sync-e2ee.test.mjs:
(pass) T-117: end-to-end encryption for sync > the crypto primitives round-trip, a wrong passphrase fails cleanly, tampering is rejected [751.99ms]
(pass) T-117: end-to-end encryption for sync > enable-e2ee stores only a wrapped key; the raw data key never appears in the server DB [438.99ms]
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/a mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/a/client.db mode 0644 -> 0600
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/locked mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/locked/client.db mode 0644 -> 0600
(pass) T-117: end-to-end encryption for sync > ciphertext on the wire and in the server DB has none of the plaintext markers [464.99ms]
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/wrong mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/wrong/client.db mode 0644 -> 0600
(pass) T-117: end-to-end encryption for sync > a wrong passphrase fails cleanly [447.99ms]
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/conv-a mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/conv-a/client.db mode 0644 -> 0600
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/conv-b mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/conv-b/client.db mode 0644 -> 0600
(pass) T-117: end-to-end encryption for sync > two devices converge with E2EE on [829.99ms]
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/tamper mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/tamper/client.db mode 0644 -> 0600
(pass) T-117: end-to-end encryption for sync > tampering with the ciphertext is rejected by the client (GCM tag fails) [410.99ms]
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/nonces mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/nonces/client.db mode 0644 -> 0600
(pass) T-117: end-to-end encryption for sync > nonces are unique over 10,000 ops [4562.94ms]
(pass) T-117: end-to-end encryption for sync > a server compromise simulation: the DB holds ciphertext only and cannot be decrypted without the passphrase [397.99ms]
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/rotate mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/rotate/client.db mode 0644 -> 0600
(pass) T-117: end-to-end encryption for sync > rotation: new ops use the new kid and both keys decrypt; passphrase change re-wraps [3620.95ms]
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/recovery-src mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/recovery-src/client.db mode 0644 -> 0600
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/recovery-dst mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/recovery-dst/client.db mode 0644 -> 0600
(pass) T-117: end-to-end encryption for sync > export-recovery-key round-trips without a passphrase and has 0600 permissions [888.99ms]
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/plain mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/plain/client.db mode 0644 -> 0600
(pass) T-117: end-to-end encryption for sync > unencrypted accounts keep working, and purge-plaintext re-wraps old bodies [764.99ms]
(pass) T-117: end-to-end encryption for sync > the Hub UI sync status carries the E2EE line data
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/legacy mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/legacy/client.db mode 0644 -> 0600
(pass) T-117: end-to-end encryption for sync > an account created with the old scrypt parameters still unlocks from the record, not a constant [105.00ms]
aletheia: data directory /tmp/aletheia-e2ee-njH8dp/upgrade mode 0775 -> 0700
aletheia: file /tmp/aletheia-e2ee-njH8dp/upgrade/client.db mode 0644 -> 0600
aletheia: file /tmp/aletheia-e2ee-njH8dp/upgrade/fresh.db mode 0644 -> 0600
(pass) T-117: end-to-end encryption for sync > upgrade-kdf re-wraps the data key under the OWASP minimum and never touches op ciphertext [915.99ms]
(pass) T-117: end-to-end encryption for sync > upgrade-kdf refuses a wrong passphrase [88.00ms]

test/ui-memory.test.mjs:
(pass) T-208: the list query string > empty values are left out [6.00ms]
(pass) T-208: the memories page > asks the server for one page and shows rows, a count and the pager [26.00ms]
(pass) T-208: the memories page > the next page changes the offset, the URL and the rows [18.00ms]
(pass) T-208: the memories page > a text filter resets to page one, goes into the URL and reaches the server [18.00ms]
(pass) T-208: the memories page > the project from the header is sent [10.00ms]
(pass) T-208: the memories page > an empty store says what to do, with the install command and a note button [8.00ms]
(pass) T-208: the memories page > a filter with no match offers Clear filters, which resets the filters [18.00ms]
(pass) T-208: the memories page > the filter controls follow Back [28.00ms]
(pass) T-208: the memories page > a failing server shows the error with Retry [18.00ms]
(pass) T-208: the memories page > hostile text in a title or a body stays text [10.00ms]
(pass) T-208: the memories page > an Arabic title and a 200-character token keep their direction and wrap rules [9.00ms]
(pass) T-208: memory card actions > Pin changes the card at once, and a failure puts it back and says why [11.00ms]
(pass) T-208: memory card actions > a successful pin shows an Undo that unpins [18.00ms]
(pass) T-208: memory card actions > Dismiss hides the card first, then asks the server, then offers Undo [20.00ms]
(pass) T-208: memory card actions > a failed dismiss brings the card back [18.00ms]
(pass) T-208: memory card actions > a search word is highlighted in the title and the body [1.00ms]
(pass) T-208: memory card actions > Edit opens a dialog; Save sends the patch and updates the card [10.00ms]
(pass) T-208: facts, dismissed and search > a fact row shows its status and a Dismiss; in the dismissed list it shows Restore [1.00ms]
(pass) T-208: facts, dismissed and search > the facts page sends the status and the date range [10.00ms]
(pass) T-208: facts, dismissed and search > the dismissed page shows what was hidden and Restore brings it back [17.00ms]
(pass) T-208: facts, dismissed and search > an empty dismissed list explains that nothing is ever deleted [8.00ms]
(pass) T-208: facts, dismissed and search > search without words shows a prompt and sends nothing [9.00ms]
(pass) T-208: facts, dismissed and search > search posts the words and filters and lists facts before memories [9.00ms]
(pass) T-208: facts, dismissed and search > no results explains why [9.00ms]
(pass) T-209: the review queue > the queue and the duplicates each ask only for what they show [9.00ms]
(pass) T-209: the review queue > folded sections make no request until they are opened [18.00ms]
(pass) T-209: the review queue > Accept hides the row, posts the action and offers Undo, which reopens it [27.00ms]
(pass) T-209: the review queue > a failed Reject puts the row back [27.00ms]
(pass) T-209: the review queue > Merge on a pair asks first and does nothing when cancelled [20.00ms]
(pass) T-209: the review queue > Merge on a pair posts the merge when confirmed [22.00ms]
(pass) T-209: the review queue > Keep both is optimistic and undoable [29.00ms]
(pass) T-209: the review queue > an empty queue says what will appear and that nothing changes without you [10.00ms]
(pass) T-209: the review queue > the old export name still points at the view
(pass) T-208: the Memory frame > renders the title, five counts, the page links and the chosen page [22.00ms]
(pass) T-208: the Memory frame > moving to another page keeps the frame and swaps the page [54.00ms]

test/watcher.test.mjs:
aletheia: file /tmp/aletheia-watch-qGf0QI/hub.db mode 0644 -> 0600
(pass) T-063: transcript watcher > one pass imports user and assistant turns from all three verified layouts [5.00ms]
(pass) T-063: transcript watcher > a restart resumes at the stored offset and does not duplicate [2.00ms]
(pass) T-063: transcript watcher > a line without a newline waits until it is complete [2.00ms]
(pass) T-063: transcript watcher > an unknown JSON line and a bad line are stored as raw episodes, not dropped [3.00ms]
(pass) T-063: transcript watcher > batch size caps one pass and the rest is picked up next time [6.00ms]
(pass) T-063: transcript watcher > the polling interval is at least one second [1.00ms]
(pass) T-063: transcript watcher > the source folders gain no files

test/docs-claims.test.mjs:
(pass) T-141: docs and claims match what was tested > the README does not claim unbuilt capture or a real install [2.00ms]
(pass) T-141: docs and claims match what was tested > docs/25 records every new host with a source URL and date
(pass) T-141: docs and claims match what was tested > the manual test marks every new host as not run
(pass) T-141: docs and claims match what was tested > the matrix row carries a dated correction [1.00ms]
(pass) T-141: docs and claims match what was tested > the unverified list records the new gaps

test/provenance.test.mjs:
(pass) provenance > a fact without an episode is refused [9.00ms]
(pass) provenance > provenance returns the episode text and source ref for a fact [10.00ms]
(pass) provenance > a captured memory becomes an episode once, and the chain resolves [7.00ms]
(pass) provenance > deleting an episode is refused while a fact references it [7.00ms]
(pass) provenance > an observation with a source episode keeps that link [8.00ms]

test/audit-deps.test.mjs:
(pass) dependency audit > zero required dependencies passes and names the vendored licences [35.00ms]
(pass) dependency audit > a required dependency fails unless allowlisted [43.00ms]

test/sync-core.test.mjs:
aletheia: data directory /tmp/aletheia-sync-core-SUnttn/a mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-core-SUnttn/a/client.db mode 0644 -> 0600
aletheia: data directory /tmp/aletheia-sync-core-SUnttn/b mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-core-SUnttn/b/client.db mode 0644 -> 0600
(pass) T-102: replicated log with per-operation results > (a) A writes, B pulls, same rows [8.00ms]
(pass) T-102: replicated log with per-operation results > (b) both write offline, both sync, converge to identical content hash [8.00ms]
aletheia: data directory /tmp/aletheia-sync-core-SUnttn/c mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-core-SUnttn/c/client.db mode 0644 -> 0600
(pass) T-102: replicated log with per-operation results > (c) a batch with one malformed op returns per-op results and applies the rest [8.00ms]
(pass) T-102: replicated log with per-operation results > (d) replay of the same batch changes nothing [4.00ms]
(pass) T-102: replicated log with per-operation results > conflict rules: facts are append-only, edits are last-writer-wins by (hlc, device_id), supersedes union
aletheia: data directory /tmp/aletheia-sync-core-SUnttn/redact mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-core-SUnttn/redact/client.db mode 0644 -> 0600
(pass) T-102: replicated log with per-operation results > redaction runs before any operation leaves the machine [4.00ms]
aletheia: data directory /tmp/aletheia-sync-core-SUnttn/folder-a mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-core-SUnttn/folder-a/client.db mode 0644 -> 0600
aletheia: data directory /tmp/aletheia-sync-core-SUnttn/folder-b mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-core-SUnttn/folder-b/client.db mode 0644 -> 0600
(pass) T-102: replicated log with per-operation results > folder transport exports and imports signed op files that converge [4.00ms]
aletheia: data directory /tmp/aletheia-sync-core-SUnttn/kill mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-core-SUnttn/kill/client.db mode 0644 -> 0600
aletheia: file /tmp/aletheia-sync-core-SUnttn/kill/other.db mode 0644 -> 0600
(pass) T-102: crash safety > (e) kill -9 mid-push, restart, no loss and no duplicates [194.00ms]

test/remote-mcp.test.mjs:
aletheia: data directory /tmp/aletheia-remote-mcp-vbjb6o/hub mode 0775 -> 0700
aletheia: file /tmp/aletheia-remote-mcp-vbjb6o/hub/hub.db mode 0644 -> 0600
(pass) T-107: the private remote MCP endpoint > an mcp-scoped token completes initialize and tools/list [4.00ms]
(pass) T-107: the private remote MCP endpoint > a read token gets read tools only; save_memory needs sync or admin [3.00ms]
(pass) T-107: the private remote MCP endpoint > a token limited to named projects sees only those projects [3.00ms]
(pass) T-107: the private remote MCP endpoint > missing, unknown and revoked tokens get 401; a non-MCP scope gets 403 [2.00ms]
(pass) T-107: the private remote MCP endpoint > the per-token rate limit answers 429 with Retry-After [3.00ms]
(pass) T-107: the private remote MCP endpoint > every tool call writes an audit row with tool, project and result, and no payload [2.00ms]
(pass) T-107: the private remote MCP endpoint > an unknown Origin is 403 and an allow-listed Origin passes [2.00ms]
(pass) T-107: the private remote MCP endpoint > a non-loopback bind needs the explicit TLS-proxy flag [1.00ms]
(pass) T-107: the private remote MCP endpoint > mcp-link create prints a URL with no secret in the path and copy-ready client config [5.00ms]
aletheia: data directory /tmp/aletheia-remote-mcp-vbjb6o/ui mode 0775 -> 0700
aletheia: file /tmp/aletheia-remote-mcp-vbjb6o/ui/hub.db mode 0644 -> 0600
(pass) T-107: the private remote MCP endpoint > the Hub UI routes create, list and revoke MCP links [25.00ms]

test/hub-login.test.mjs:
aletheia: file /tmp/aletheia-login-4vybB1/hub-main.db mode 0644 -> 0600
(pass) T-110: remote login for the Hub > unauthenticated requests get 401 and the login page is served for / [2.00ms]
(pass) T-110: remote login for the Hub > a wrong admin token is 401; the right one sets the session and CSRF cookies with the right flags [2.00ms]
(pass) T-110: remote login for the Hub > with a session, GET works and a state-changing call without CSRF is 403 [3.00ms]
(pass) T-110: remote login for the Hub > logout clears the session and the next request is 401 [1.00ms]
aletheia: file /tmp/aletheia-login-4vybB1/hub-lock.db mode 0644 -> 0600
(pass) T-110: remote login for the Hub > failed logins lock out with back-off and unlock afterwards [220.00ms]
aletheia: file /tmp/aletheia-login-4vybB1/hub-ttl.db mode 0644 -> 0600
(pass) T-110: remote login for the Hub > sessions expire [165.00ms]
aletheia: file /tmp/aletheia-login-4vybB1/hub-tls.db mode 0644 -> 0600
(pass) T-110: remote login for the Hub > the session cookie is Secure when the server is behind TLS [21.00ms]
aletheia: file /tmp/aletheia-login-4vybB1/hub-loop.db mode 0644 -> 0600
(pass) T-110: remote login for the Hub > loopback-only keeps today's behaviour: no login required [15.00ms]

test/tokens-quotas-audit.test.mjs:
(pass) T-108: scoped tokens, quotas and audit > (j) a read token cannot push [1.00ms]
aletheia: data directory /tmp/aletheia-sync-token-CJ7TGR/scoped mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-token-CJ7TGR/scoped/client.db mode 0644 -> 0600
(pass) T-108: scoped tokens, quotas and audit > a sync token is limited to its named projects [4.00ms]
aletheia: data directory /tmp/aletheia-sync-token-CJ7TGR/quota mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-token-CJ7TGR/quota/client.db mode 0644 -> 0600
(pass) T-108: scoped tokens, quotas and audit > an ops-per-day quota blocks writes once reached and never reads [3.00ms]
aletheia: data directory /tmp/aletheia-sync-token-CJ7TGR/audit mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-token-CJ7TGR/audit/client.db mode 0644 -> 0600
(pass) T-108: scoped tokens, quotas and audit > the audit log is append-only and never holds secrets or payloads [3.00ms]
(pass) T-108: scoped tokens, quotas and audit > admin can mint a scoped token and read the audit log [1.00ms]

test/contradictions.test.mjs:
(pass) contradictions > 30 update pairs resolve newest-wins 30/30, no row is deleted, and history returns both [73.00ms]
(pass) contradictions > a same-time disagreement keeps both facts, lowers confidence and queues a review [9.00ms]
(pass) contradictions > an incoming fact that started earlier is stored as history and keeps the newer fact current [9.00ms]
(pass) contradictions > a different predicate is a different sense and does not invalidate [10.00ms]
(pass) contradictions > an explicit supersedes id from the model closes that fact [9.00ms]
(pass) contradictions > resolveContradictions is idempotent for a fact that is no longer active [10.00ms]

test/i18n-check.test.mjs:
(pass) i18n-check > a fresh set is current [1.00ms]
(pass) i18n-check > changing prose makes the translation stale [1.00ms]
(pass) i18n-check > changing only a code block does not move the hash
(pass) i18n-check > --update records the new hash in the file and the state [1.00ms]
(pass) i18n-check > --update syncs a state entry whose header already matches
(pass) i18n-check > a translation without a source hash is an error
(pass) i18n-check > the CLI prints the same verdict [30.00ms]

test/decay.test.mjs:
(pass) decay and pruning > an old low-confidence single-source fact goes cold and leaves default search, but history keeps it [9.00ms]
(pass) decay and pruning > high confidence, a second source and a pinned or important observation protect a fact [7.00ms]
(pass) decay and pruning > old episode text is shortened with a pointer and an audit row; pinned and evidentiary episodes stay [5.00ms]
(pass) decay and pruning > property: a pinned item is never pruned, for every old pinned observation [31.00ms]
(pass) decay and pruning > recall on the retained fixture loses at most one point [18.00ms]
(pass) decay and pruning > default retention windows are the documented ones

test/server.test.mjs:
aletheia: data directory /tmp/work-view-fixture-j05S9G/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-j05S9G/data/hub.db mode 0644 -> 0600
(pass) static > / serves the SPA shell with framing blocked [1.00ms]
(pass) static > assets are served with their types [2.00ms]
(pass) static > path traversal is refused [1.00ms]
(pass) static > unknown API routes 404 like the original
(pass) guards > a spoofed Host header is refused [157.00ms]
(pass) guards > proxy headers are refused [1.00ms]
(pass) guards > a POST without a JSON content type is refused
(pass) guards > a POST from another origin is refused
(pass) guards > a POST from this server's own origin is accepted [16.00ms]
(pass) guards > bad bodies are 400 with a reason [3.00ms]
(pass) snapshot > has the original's top-level keys in order [3.00ms]
(pass) snapshot > every card carries a fingerprint, a review and human copy state [2.00ms]
(pass) snapshot > the revision changes when something is saved [14.00ms]
(pass) review > a request that is not reported complete cannot be checked [6.00ms]
(pass) review > a stale fingerprint is refused with the latest snapshot [5.00ms]
(pass) review > an unknown request is 404 [3.00ms]
(pass) rules > add -> edit -> turn off -> turn on -> replace -> dismiss, with MY-RULES.md following [53.00ms]
(pass) rules > a project rule needs a name; a missing rule is 404; restore-suggestion needs a learned rule [16.00ms]
(pass) rules > a project-scoped rule is grouped under its project in MY-RULES.md [8.00ms]
(pass) rules > load-in-claude-code appends the @ line once [10.00ms]
(pass) subagents > mark finished records a stop and flips the agent [15.00ms]
(pass) subagents > a top-level session cannot be marked finished [4.00ms]
(pass) evidence and work-state writes > evidence returns the recorded row, 404 for unknown, 400 for a bad id [3.00ms]
(pass) evidence and work-state writes > POST /api/work-state/entries saves under the project of cwd and the view reflects it [14.00ms]
(pass) evidence and work-state writes > my-rules cannot be written through the generic route; oversize fields are refused [1.00ms]
(pass) events > the stream opens with a retry hint and a full snapshot [4.00ms]
(pass) setup > setup is permanently complete

test/work-ui-contract.test.mjs:
aletheia: file /tmp/work-view-fixture-iol2XD/contract.db mode 0644 -> 0600
(pass) T-147: the Work UI contract > the served / page has no old-viewer name, star count, repository URL or iframe [1.00ms]
(pass) T-147: the Work UI contract > every Work module is clean; Tools and Memory keep only their named legacy features [1.00ms]
(pass) T-147: the Work UI contract > the classic viewer page still exists for the optional Tools link [1.00ms]
(pass) T-147: the Work UI contract > every Work view has an empty-state shape, not a fabricated row [1.00ms]
(pass) T-147: the Work UI contract > the docs describe the new Work view, not the old default
(pass) T-147: the Work UI contract > an empty hub through /v1/work is empty [2.00ms]

test/dedupe.test.mjs:
(pass) near duplicates > a 200-pair labelled set reaches precision >= 0.95 at the auto threshold [15.00ms]
(pass) near duplicates > the IDF veto stops boilerplate from making different memories look alike [1.00ms]
(pass) near duplicates > the store scan finds a near pair and ignores an unrelated one [5.00ms]
(pass) near duplicates > the scan is bounded and exact duplicates collapse [8.00ms]

test/importer-schema.test.mjs:
(pass) claude-mem schema probe > a database without observations names the missing table [3.00ms]
(pass) claude-mem schema probe > a database with a missing column names the column [1.00ms]
aletheia: file /tmp/aletheia-importer-I0P8eY/hub.db mode 0644 -> 0600
(pass) claude-mem schema probe > the importer refuses a stripped database instead of importing zero rows [7.00ms]
aletheia: file /tmp/aletheia-importer-6XpzR5/hub.db mode 0644 -> 0600
(pass) claude-mem schema probe > a valid fixture still imports [14.00ms]

test/rule-suggest.test.mjs:
(pass) rule suggestions > a 20-correction fixture proposes at least 10 rules with at most one false positive [13.00ms]
(pass) rule suggestions > nothing is auto-enabled and every suggestion is in the review queue and audited [15.00ms]
(pass) rule suggestions > a second run proposes nothing new [21.00ms]
(pass) rule suggestions > suggestions do not cross projects [17.00ms]
(pass) rule suggestions > the matcher handles each sentence shape and rejects ordinary prose

test/optimize.test.mjs:
(pass) optimizeFts > rebuilds the three FTS indexes and leaves search working [34.00ms]

test/translations.test.mjs:
(pass) README translations > all ten files exist and carry the machine-translation header [2.00ms]
(pass) README translations > code blocks, badge URLs and generated tables are byte-identical to English [2.00ms]
(pass) README translations > Arabic is wrapped for right-to-left reading
(pass) README translations > each translation links to the other nine and to English [1.00ms]

test/install-codex.test.mjs:
(pass) T-062: Codex CLI installer and hooks > a dry run plans the TOML MCP block and hooks, writing nothing [5.00ms]
(pass) T-062: Codex CLI installer and hooks > the TOML block merges with other tables and refuses a foreign aletheia table [18.00ms]
aletheia: data directory /tmp/work-view-fixture-Qp9JqH/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-Qp9JqH/data/hub.db mode 0644 -> 0600
(pass) T-062: Codex CLI installer and hooks > the installed hooks capture a session without secrets and doctor sees 5/5 [423.99ms]
(pass) T-062: Codex CLI installer and hooks > uninstall removes the TOML block and our hooks, keeping the user's [22.00ms]

test/search-facts.test.mjs:
(pass) fact search > a word in the fact text or an extracted key finds the fact and its source [10.00ms]
(pass) fact search > searchAll returns the fact hit and the memory hit, both with a source [10.00ms]
(pass) fact search > a superseded fact is hidden by default, history returns both newest-current first, and as-of sees the old one [8.00ms]
(pass) fact search > an optional fact vector can surface a fact the words do not match [10.00ms]

test/consolidation.test.mjs:
(pass) summaries > a summary always carries its source ids and never exists without them [14.00ms]
(pass) summaries > a session summary links its observation to the facts and replaces the raw Stop summary [13.00ms]
(pass) summaries > the footprint drops 40% with no fact or episode deleted [12.00ms]
(pass) summaries > project and entity summaries use the same provenance rule [12.00ms]
(pass) summaries > a session with no fact gets no summary [7.00ms]

test/work-views.test.mjs:
(pass) T-143: the Work overview view > the header strip derives every value from the response [1.00ms]
(pass) T-143: the Work overview view > a session card has state, counts, prompt, summary, source facts and a session link
(pass) T-143: the Work overview view > a long prompt is truncated in the card and keeps the full text for expansion
(pass) T-143: the Work overview view > the card labels whether a session-end event or the heuristic decided the end
(pass) T-143: the Work overview view > needs-you has review, rule and dismissed items with actions [1.00ms]
(pass) T-143: the Work overview view > an empty response gives an instruction, not a fake session
(pass) T-143: the Work overview view > fact lines carry the source and the importance label
(pass) T-143: the Work overview view > the session hash still routes to Work
(pass) T-144: the goal view > a goal shows its count, session count, last-seen date and dated quote ids
(pass) T-145: the session page view > a session detail shows the ordered timeline, summary and facts with sources, and no actions [1.00ms]
(pass) T-145: the session page view > a session with no rows still has a readable empty timeline

test/compare-bench.test.mjs:
(pass) compare-bench > prints the table and marks the previous numbers as reproduced [32.00ms]
(pass) compare-bench > says changed when a number moves and not rerun when a file is absent [32.00ms]
(pass) compare-bench > fails loudly on an empty directory [29.00ms]

test/temporal-parse.test.mjs:
(pass) temporal parser > an ISO day is explicit and a range includes the last day
(pass) temporal parser > today, yesterday and tomorrow use the base day
(pass) temporal parser > relative counts and calendar units
(pass) temporal parser > months, quarters and weekdays [1.00ms]
(pass) temporal parser > since keeps the start and leaves the fact open
(pass) temporal parser > an ambiguous expression is null, not a guess
(pass) temporal parser > the same expression moves with the event clock
(pass) temporal parser > stored facts use the episode clock and lose 0.1 confidence when the date was inferred [10.00ms]

test/goals-rollup.test.mjs:
(pass) T-168: goals roll-up > goals are linked to requests with status and aggregate progress [14.00ms]
(pass) T-168: goals roll-up > the no-goal bucket holds requests serving none of the goals [12.00ms]
(pass) T-168: goals roll-up > open asks split into nothing-working and being-worked-on [11.00ms]
(pass) T-168: goals roll-up > an empty store says empty with no invented numbers [6.00ms]

test/provider-chain.test.mjs:
(pass) T-119: presets and chain parsing > the named presets exist for every local server and the remote endpoints [2.00ms]
(pass) T-119: presets and chain parsing > the classification keeps a client error out of the fallback path
(pass) T-119: fallback on each failure type > a quota (429) moves to the next provider [2.00ms]
(pass) T-119: fallback on each failure type > a 5xx moves to the next provider [1.00ms]
(pass) T-119: fallback on each failure type > a timeout moves to the next provider [52.00ms]
(pass) T-119: fallback on each failure type > a 400 is surfaced and the next provider is not tried
(pass) T-119: cool-down > a failed provider is skipped until its cool-down ends [2.00ms]
(pass) T-119: cool-down > when every provider is cooling down the error says so instead of guessing
(pass) T-119: concurrency cap > one in-flight request by default and two when asked for [840.99ms]

test/ui-status.test.mjs:
(pass) T-206: indicators > a healthy store gives the nine indicators plus live [1.00ms]
(pass) T-206: indicators > nothing is shown as fine before it has answered [1.00ms]
(pass) T-206: indicators > a failed database check is an error with the doctor command
(pass) T-206: indicators > a failed index check offers the optimize command
(pass) T-206: indicators > vectors are idle with no rows and ok with rows; the model follows
(pass) T-206: indicators > queue states: empty ok, waiting warn, running working, failed error [1.00ms]
(pass) T-206: indicators > extractor shows the mode and whether a model provider is set [1.00ms]
(pass) T-206: indicators > capture shows the newest tool and a line per tool; an old capture is idle [1.00ms]
(pass) T-206: indicators > sync: off, connected, syncing with a count, behind, error
(pass) T-206: indicators > offline turns the server red and says what to run [1.00ms]
(pass) T-206: indicators > live says WebSocket or polling
(pass) T-206: indicators > overall: error beats working beats idle, and a sync error alone does not turn the favicon red [1.00ms]
(pass) T-206: indicators > new errors and recoveries are found by comparing two lists
(pass) T-206: indicators > retry delays double and cap at 30 s; the banner counts down
(pass) T-206: indicators > only known frame kinds count
(pass) T-206: controller > the first refresh asks every source once and reports indicators [2.00ms]
(pass) T-206: controller > the work request carries the project and asks for a small answer [1.00ms]
(pass) T-206: controller > polling runs on a timer, every 10 s without a socket [10.00ms]
(pass) T-206: controller > no timer runs while the page is hidden, and showing it pulls at once [7.00ms]
(pass) T-206: controller > hiding the page cancels the pending poll
(pass) T-206: controller > a socket that opens switches to the slow poll and marks live [10.00ms]
(pass) T-206: controller > a frame triggers one light refresh after a short pause, without the health check [9.00ms]
(pass) T-206: controller > when the socket closes it falls back to polling and reconnects with a delay [8.00ms]
(pass) T-206: controller > losing the server turns on offline mode, counts down and retries [11.00ms]
(pass) T-206: controller > each failed retry waits longer [26.00ms]
(pass) T-206: controller > a manual refresh during the wait retries now [1.00ms]
(pass) T-206: controller > a new error is reported once, and recovery once [2.00ms]
(pass) T-206: controller > an unhealthy 503 answer is data, not a lost connection [1.00ms]
(pass) T-206: controller > a failing sync route shows a sync error and leaves the rest alone
(pass) T-206: controller > a failing work route is not a lost connection
(pass) T-206: controller > two refreshes at once share one request set [1.00ms]
(pass) T-206: controller > stopping clears every timer and closes the socket
(pass) T-206: controller > changing the project reconnects the socket [7.00ms]
(pass) T-206: frames reach other views > each known frame is passed on, once, before the refresh pause [1.00ms]

test/refresh.test.mjs:
(pass) ledger commands > grouping-input returns one project root at a time with the opening asks [9.00ms]
(pass) ledger commands > refresh-needs reports ungrouped conversations before any grouping [6.00ms]
(pass) ledger commands > apply refuses to join conversations without a link or across projects [6.00ms]
(pass) ledger commands > record-progress refuses a shipped request without 100% and a ship date [7.00ms]
(pass) grouping validation > every conversation must be decided
(pass) grouping validation > a conversation that was not asked about is refused, except an open request's anchor first [1.00ms]
(pass) grouping validation > extractJson takes the outermost object
(pass) the full refresh with a fake model > groups, reviews, aligns and writes the story; the view then shows all of it [34.00ms]
(pass) the full refresh with a fake model > a refused answer is retried once with the refusal quoted; a second refusal fails and keeps the raw answer [8.00ms]
(pass) auto refresh scheduling > runs when something is due, records the outcome, and goes idle when nothing is [21.00ms]
(pass) auto refresh scheduling > a failing job is recorded as failed with its error [4.00ms]
(pass) auto refresh scheduling > disabled does nothing [4.00ms]

test/entities.test.mjs:
(pass) entity extraction > the fixture yields the expected entities and types [9.00ms]
(pass) entity extraction > the same entity mentioned twice creates one row [13.00ms]
(pass) entity extraction > different projects do not share rows [15.00ms]
(pass) entity extraction > rule candidates find paths, repos and git authors
(pass) entity extraction > normalisation folds case and separators

test/health.test.mjs:
(pass) health detail > a healthy store reports ok and counts [8.00ms]
(pass) health detail > a closed database is an error with a reason [6.00ms]
(pass) health detail > the response never contains an API key [4.00ms]
aletheia: data directory /tmp/aletheia-health-H6M1bH/data mode 0775 -> 0700
aletheia: file /tmp/aletheia-health-H6M1bH/data/hub.db mode 0644 -> 0600
(pass) health detail > doctor does not fail for a tool that is not installed and shows database, FTS, vectors and model [15.00ms]

test/ui-guide.test.mjs:
(pass) T-212: when the guide shows > only for a store with no memories and no facts [1.00ms]
(pass) T-212: when the guide shows > hooks count as installed only when every expected hook is present
(pass) T-212: when the guide shows > a hidden guide is remembered, and blocked storage does not break
(pass) T-212: the three steps > shows three steps with the exact commands for the detected tool [2.00ms]
(pass) T-212: the three steps > each command has a Copy button that copies exactly that text [9.00ms]
(pass) T-212: the three steps > choosing another tool changes the commands [1.00ms]
(pass) T-212: the three steps > with no tool list it still offers the Claude Code commands
(pass) T-212: the three steps > step 1 shows done when the hooks are already there; steps 2 and 3 wait [1.00ms]
(pass) T-212: the three steps > while waiting it says so, with a status role and a loader [1.00ms]
(pass) T-212: waiting for the first event > it flips to done the moment data arrives and then calls back once [124.00ms]
(pass) T-212: waiting for the first event > a poll that finds new hooks marks step 1 done without arriving [1.00ms]
(pass) T-212: waiting for the first event > a failing poll keeps waiting and does not throw
(pass) T-212: waiting for the first event > the timer asks again and again until data arrives, and stops after dispose [173.00ms]
(pass) T-212: waiting for the first event > the default check reads the overview, the doctor and the work overview
(pass) T-212: waiting for the first event > Hide this guide is offered while waiting and calls back

test/story.test.mjs:
(pass) T-169: the build story > counts and velocity come from shipped and working requests [10.00ms]
(pass) T-169: the build story > repeated corrections become learned preferences with dated quotes [8.00ms]
(pass) T-169: the build story > an empty store says empty with no invented numbers [7.00ms]

test/install-claude.test.mjs:
(pass) install: Claude Code > a dry run plans mcp, hooks and rules and writes nothing [5.00ms]
(pass) install: Claude Code > apply merges the user's hooks and servers, backs up both files, and records a manifest [17.00ms]
(pass) install: Claude Code > a second install changes nothing: same bytes, no new backups, runner not rebuilt [20.00ms]
(pass) install: Claude Code > the CLI is a dry run by default and creates no files, data dir or database [120.00ms]
(pass) install: Claude Code > an unparsable settings file is refused and left untouched [5.00ms]
(pass) install: Claude Code > uninstall removes only our entries and restores the user's own text [18.00ms]
(pass) install: Claude Code > unknown tools are refused with the list
(pass) install: Claude Code > doctor reports hooks present, spool empty and the last capture [17.00ms]
(pass) install: Command Code > writes its own hook and MCP shapes, keeps existing settings, and says what it cannot capture [20.00ms]

test/dismiss-restore.test.mjs:
aletheia: file /tmp/aletheia-dismiss-QHJZ3f/hub.db mode 0644 -> 0600
(pass) T-123: reversible dismiss and restore > dismiss hides a memory from search and context without deleting the row [4.00ms]
(pass) T-123: reversible dismiss and restore > a fact can be dismissed and comes back on restore [3.00ms]
(pass) T-123: reversible dismiss and restore > the CLI dismiss, dismissed and restore commands agree with the store [245.00ms]
(pass) T-123: reversible dismiss and restore > the REST routes dismiss, list and restore [5.00ms]
(pass) T-123: reversible dismiss and restore > the MCP tool dismisses and restores the same rows [2.00ms]
(pass) T-123: reversible dismiss and restore > a dismissal survives a restart and only prune --apply deletes the row [4.00ms]

test/fact-budget.test.mjs:
(pass) batching > a window never exceeds the configured episode count or character budget
(pass) batching > one oversized episode is truncated, and the count cap stays in 20-40
(pass) cost record > one usage row per call, with tokens and dollars from configured prices [10.00ms]
(pass) cost record > a rejected answer is recorded with its raw output and stores no fact [6.00ms]
(pass) cost record > a provider error writes an error row and is re-thrown, so the queue retries [6.00ms]

test/ui-work-goals-rollup.test.mjs:
(pass) T-219: the goals roll-up > shows the roll-up, the open-ask split and the no-goal bucket [23.00ms]
(pass) T-219: the goals roll-up > a goal card shows its status, aggregate progress, requests and artifacts [18.00ms]
(pass) T-219: the goals roll-up > Pin is optimistic and Undo unpins through the old goal route [53.00ms]
(pass) T-219: the goals roll-up > Dismiss hides the goal first and Undo restores it [54.00ms]
(pass) T-219: the goals roll-up > dismissed goals are listed with Restore [17.00ms]
(pass) T-219: the goals roll-up > the empty state explains how a goal appears [16.00ms]

test/ui-story-economics.test.mjs:
(pass) T-221: the build story > shows counts, velocity and learned habits with dated quotes [18.00ms]
(pass) T-221: the build story > a missing average says n/a instead of a number [16.00ms]
(pass) T-221: the build story > an empty story says so [16.00ms]
(pass) T-221: context economics > shows the totals, the counter and one row per context memory [16.00ms]
(pass) T-221: context economics > a null work-token total is n/a with its reason, never zero [16.00ms]
(pass) T-221: context economics > formatTokens never turns null into zero
(pass) T-221: context economics > Memory has an Economics page

test/uninstall.test.mjs:
(pass) T-071: every installer has one generic uninstall and doctor path > install --list names the capability and verification for every installer [5.00ms]
(pass) T-071: every installer has one generic uninstall and doctor path > a dry run followed by an uninstall leaves the tree identical [3.00ms]
(pass) T-071: every installer has one generic uninstall and doctor path > install then uninstall restores both files and keeps the user's entries [17.00ms]
(pass) T-071: every installer has one generic uninstall and doctor path > a file edited after install is refused until --force [20.00ms]
(pass) T-071: every installer has one generic uninstall and doctor path > a partial install can be undone when one file is already gone [19.00ms]
(pass) T-071: every installer has one generic uninstall and doctor path > the hook stripper handles both documented shapes and leaves user handlers
(pass) T-071: every installer has one generic uninstall and doctor path > doctor reports every registered installer without failing on missing ones [18.00ms]

test/ui-motion.test.mjs:
(pass) T-213: reduced motion > it is read from the media query
(pass) T-213: reduced motion > movement becomes a short fade when reduced
(pass) T-213: reduced motion > with motion allowed the same call moves and uses the token duration
(pass) T-213: reduced motion > an animation that only moves does nothing when reduced [1.00ms]
(pass) T-213: reduced motion > every kind of enter and leave keeps to opacity and transform
(pass) T-213: reduced motion > leave holds its end state until the element is removed
(pass) T-213: reduced motion > an element without animate() resolves at once
(pass) T-213: reduced motion > expand and collapse animate height, and collapse hides at the end
(pass) T-213: reduced motion > expand skips motion when reduced [1.00ms]
(pass) T-213: count up, tokens, visibility > a count-up ends on the final value [2.00ms]
(pass) T-213: count up, tokens, visibility > under reduced motion the number is set at once
(pass) T-213: count up, tokens, visibility > a count-up to the same value does not animate [1.00ms]
(pass) T-213: count up, tokens, visibility > durations are read from the CSS tokens, with a fallback
(pass) T-213: count up, tokens, visibility > hiding the page marks the root so loops pause, and showing it clears the mark
(pass) T-213: the stylesheets > duration tokens are 120, 200 and 320 ms
(pass) T-213: the stylesheets > reduced motion shortens every token and the components block stops loops and movement
(pass) T-213: the stylesheets > transitions list their properties and never use `all` [1.00ms]
(pass) T-213: the stylesheets > transitions use duration tokens, not loose numbers
(pass) T-213: the stylesheets > layout properties are never transitioned or keyframed
(pass) T-213: the stylesheets > looping animations exist only for loading marks and live status, and pause when the page is hidden [17.00ms]
(pass) T-213: the stylesheets > the interactive pieces named in the task have motion: press, lift, stagger, shimmer, slide

test/one-ui.test.mjs:
aletheia: file /tmp/work-view-fixture-VUSrGa/ui.db mode 0644 -> 0600
(pass) T-139: the one page > / serves one shell with the four tab containers, the Work mount and both scripts [3.00ms]
(pass) T-139: the one page > the UI never builds markup from strings [1.00ms]
(pass) T-139: the one page > the small-screen stylesheet rearranges the header, and controls keep a 40 px target
(pass) T-139: the one page > /hub redirects to the Memory tab and keeps serving its assets [1.00ms]
(pass) T-139: the one page > every /v1 route the UI calls exists and has the shape it reads [4.00ms]
(pass) T-139: the one page > the hub routes the tabs read answer JSON [12.00ms]
(pass) T-139: the facts route > the facts route has the shape the Memory tab reads [2.00ms]
(pass) T-139: the review route > the review queue route reads and resolves an item [4.00ms]
(pass) T-139: the rule suggestions route > the rule suggestions route accepts, restores and dismisses [4.00ms]
(pass) T-139: tab modules > memory, review, rules and tools load without a DOM and export their renderer [3.00ms]
(pass) T-139: DOM-free router and view helpers > the four routes parse and anything else falls back to Work
(pass) T-139: DOM-free router and view helpers > health, facts, channels and review rows are shaped for the DOM
(pass) T-139: DOM-free router and view helpers > the classic viewer is offered only when the old database exists

test/claude-desktop.test.mjs:
(pass) T-076: Claude Desktop MCP config > the documented macOS and Windows paths and the observed Linux path [5.00ms]
(pass) T-076: Claude Desktop MCP config > the generated entry has the documented mcpServers shape and merges with a real file [5.00ms]
(pass) T-076: Claude Desktop MCP config > an unparsable config is refused and left untouched [4.00ms]
(pass) T-076: Claude Desktop MCP config > the doc names the exact paths and the unverified Linux note

test/sync-devices.test.mjs:
(pass) T-104: device pairing, tokens and revoke > the hub binds to loopback by default
(pass) T-104: device pairing, tokens and revoke > a pairing code is single use and exchanges for a device token [2.00ms]
(pass) T-104: device pairing, tokens and revoke > (h) an expired pairing code is refused [6.00ms]
(pass) T-104: device pairing, tokens and revoke > tokens are random 256-bit values stored hashed, never plaintext
(pass) T-104: device pairing, tokens and revoke > token comparison is constant time
(pass) T-104: device pairing, tokens and revoke > (g) a revoked token gets 401 on the next call [3.00ms]
(pass) T-104: device pairing, tokens and revoke > devices list shows name, last seen and revoke state [1.00ms]
(pass) T-104: device pairing, tokens and revoke > revoking a device stops its pushes immediately [2.00ms]
(pass) T-104: device pairing, tokens and revoke > pairing attempts are rate limited [6.00ms]

test/memory-pipeline.test.mjs:
aletheia: data directory /tmp/work-view-fixture-uQuY7W/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-uQuY7W/data/hub.db mode 0644 -> 0600
(pass) memory pipeline > captured events become sourced facts, a contradiction supersedes, history keeps the old fact, and search finds the key [878.99ms]

test/manifests.test.mjs:
(pass) T-066: plugin manifests > every manifest parses and carries a stable identity
(pass) T-066: plugin manifests > every referenced path resolves inside the package [1.00ms]
(pass) T-066: plugin manifests > a hook command names a real script and a real hook subcommand
(pass) T-066: plugin manifests > the Claude manifest points at the MCP server
(pass) T-066: plugin manifests > the Gemini extension points at the MCP server with the documented variable
(pass) T-066: plugin manifests > the Qoder manifest makes no component claim we could not verify
(pass) T-066: plugin manifests > every source URL is recorded with its fetch date [1.00ms]

test/requests-progress.test.mjs:
(pass) T-166: progress and ETA > a shipped request is 100% complete with no ETA [9.00ms]
(pass) T-166: progress and ETA > one of three sessions completed gives 33% and a paced ETA [8.00ms]
(pass) T-166: progress and ETA > one session has no pace, and no completed session has no ETA [9.00ms]
(pass) T-166: progress and ETA > a summary marks a session complete and feeds progress evidence [6.00ms]

test/readme.test.mjs:
(pass) README claims > every badge is an allowed real endpoint in this repository [1.00ms]
(pass) README claims > no test, star or download count is typed by hand
(pass) README claims > no host is claimed as working without a real-install test
(pass) README claims > relative documentation links resolve [132.00ms]

test/ui-work-requests.test.mjs:
(pass) T-218: request helpers > a request route is 16 hex digits and nothing else
(pass) T-218: request helpers > durations read as words, and a missing time says unknown [1.00ms]
(pass) T-218: request helpers > only http links are links; anything else stays text
(pass) T-218: request helpers > no artifacts says so instead of showing an empty box
(pass) T-218: the request list > loads one page with the filter, sort and limit, and prints the counts [18.00ms]
(pass) T-218: the request list > group=tool renders one heading per tool [34.00ms]
(pass) T-218: the request list > dismiss is optimistic and Undo restores [55.00ms]
(pass) T-218: the request list > the empty state says what a request is [16.00ms]
(pass) T-218: the request detail > shows where it came from, the artifact links and a link to each session [17.00ms]
(pass) T-218: the request detail > the dismiss button posts and returns to the Work page [33.00ms]

test/queue.test.mjs:
(pass) queue mechanics > enqueue is idempotent, one claim at a time, and completion is counted [8.00ms]
(pass) queue mechanics > a failed job backs off exponentially and then is claimable again [7.00ms]
(pass) queue mechanics > a running job whose lease expired is recovered after a restart [7.00ms]
(pass) queue mechanics > the Stop hook only writes a setting; the worker turns it into jobs [9.00ms]
(pass) worker > a provider error is retried later and the job is not lost [14.00ms]
(pass) worker > executeJob batches by the configured budget and marks each window done [16.00ms]
aletheia: file /tmp/aletheia-kill-3i7F5w/hub.db mode 0644 -> 0600
(pass) kill -9 resume > a killed worker leaves the unprocessed window claimable, with no duplicate and no loss [99.00ms]

test/sync-live.test.mjs:
aletheia: file /tmp/aletheia-live-nRvQwe/hub.db mode 0644 -> 0600
(pass) T-105: live update frames over WebSocket > a write pushes a session frame with id and kind only [5.00ms]
(pass) T-105: live update frames over WebSocket > an unauthenticated socket is refused [1.00ms]
(pass) T-105: live update frames over WebSocket > a bad Origin is refused
(pass) T-105: live update frames over WebSocket > a socket can reconnect and keep receiving frames [2.00ms]
(pass) T-105: live update frames over WebSocket > an out-of-scope project does not get a frame [2.00ms]
(pass) T-105: live update frames over WebSocket > a dismissed memory does not get a frame [6.00ms]

test/scopes.test.mjs:
(pass) scopes > a project search never returns another project's rows [12.00ms]
(pass) scopes > scope=all is the explicit cross-project read [9.00ms]
(pass) scopes > a promoted fact is visible from another project and promotion is audited [11.00ms]
(pass) scopes > a global rule is visible everywhere and the scope column exists [8.00ms]

test/erasure.test.mjs:
aletheia: file /tmp/aletheia-erase-fB6rKB/hub.db mode 0644 -> 0600
aletheia: file /tmp/aletheia-erase-fB6rKB/client.db mode 0644 -> 0600
(pass) T-113: erase, export and receipt > the report counts rows and lists ids without printing content [9.00ms]
(pass) T-113: erase, export and receipt > apply removes the content from tables, FTS, vectors, sync log and the outbox; exports after it are clean [12.00ms]
(pass) T-113: erase, export and receipt > a signed receipt verifies, and a changed receipt does not [2.00ms]
(pass) T-113: erase, export and receipt > erase by id removes only the named memory and its provenance chain [8.00ms]
(pass) T-113: erase, export and receipt > erase --before removes old rows and leaves newer ones [6.00ms]
(pass) T-113: erase, export and receipt > an unknown id selector is refused before anything changes

test/gen-tables.test.mjs:
(pass) gen-tables > the capability table is generated from the JSON and keeps unknown cells UNVERIFIED [4.00ms]
(pass) gen-tables > the tool table says not tested on a real install for every current host
(pass) gen-tables > the benchmark table is computed from result files and includes the parsed baseline [1.00ms]
(pass) gen-tables > a changed block is drift and replaceBlock repairs it
(pass) gen-tables > the committed files are current [51.00ms]

test/ui-a11y.test.mjs:
(pass) T-214: the audit itself > it finds an unnamed button, a bad role, a duplicate id and an unlabelled dialog [3.00ms]
(pass) T-214: the audit itself > it accepts a label wrapped around an input, and aria-labelledby
(pass) T-214: the audit itself > a right-to-left string without a direction is reported
(pass) T-214: names, roles and tab order on every page > memory/memories: every control is named, ids are unique, text that may be right-to-left has a direction [22.00ms]
(pass) T-214: names, roles and tab order on every page > memory/facts: every control is named, ids are unique, text that may be right-to-left has a direction [19.00ms]
(pass) T-214: names, roles and tab order on every page > memory/review: every control is named, ids are unique, text that may be right-to-left has a direction [20.00ms]
(pass) T-214: names, roles and tab order on every page > memory/dismissed: every control is named, ids are unique, text that may be right-to-left has a direction [18.00ms]
(pass) T-214: names, roles and tab order on every page > memory/economics: every control is named, ids are unique, text that may be right-to-left has a direction [18.00ms]
(pass) T-214: names, roles and tab order on every page > memory/search: every control is named, ids are unique, text that may be right-to-left has a direction [18.00ms]
(pass) T-214: names, roles and tab order on every page > rules/rules: every control is named, ids are unique, text that may be right-to-left has a direction [18.00ms]
(pass) T-214: names, roles and tab order on every page > rules/suggestions: every control is named, ids are unique, text that may be right-to-left has a direction [17.00ms]
(pass) T-214: names, roles and tab order on every page > rules/sync: every control is named, ids are unique, text that may be right-to-left has a direction [16.00ms]
(pass) T-214: names, roles and tab order on every page > rules/import: every control is named, ids are unique, text that may be right-to-left has a direction [16.00ms]
(pass) T-214: names, roles and tab order on every page > tools/tools: every control is named, ids are unique, text that may be right-to-left has a direction [16.00ms]
(pass) T-214: names, roles and tab order on every page > tools/devices: every control is named, ids are unique, text that may be right-to-left has a direction [17.00ms]
(pass) T-214: names, roles and tab order on every page > tools/access: every control is named, ids are unique, text that may be right-to-left has a direction [16.00ms]
(pass) T-214: names, roles and tab order on every page > tools/alerts: every control is named, ids are unique, text that may be right-to-left has a direction [17.00ms]
(pass) T-214: names, roles and tab order on every page > tools/team: every control is named, ids are unique, text that may be right-to-left has a direction [17.00ms]
(pass) T-214: names, roles and tab order on every page > tools/checks: every control is named, ids are unique, text that may be right-to-left has a direction [17.00ms]
(pass) T-214: names, roles and tab order on every page > tools/activity: every control is named, ids are unique, text that may be right-to-left has a direction [18.00ms]
(pass) T-214: names, roles and tab order on every page > work overview [20.00ms]
(pass) T-214: names, roles and tab order on every page > work session [17.00ms]
(pass) T-214: names, roles and tab order on every page > work request detail [16.00ms]
(pass) T-214: names, roles and tab order on every page > the first-run guide, the shortcut sheet, the palette and the dialogs [52.00ms]
(pass) T-214: names, roles and tab order on every page > the status regions, toasts and the page announcer are polite live regions
(pass) T-214: the page and the stylesheets > the page declares its language, has a skip link and one main landmark
(pass) T-214: the page and the stylesheets > form controls in the header have labels
(pass) T-214: the page and the stylesheets > every control has a visible focus style and the outline is never removed without a replacement [10.00ms]
(pass) T-214: the page and the stylesheets > touch targets are 40 px for buttons, chips, segments, tabs, pager and inputs [1.00ms]
(pass) T-214: the page and the stylesheets > long text wraps and tables and code scroll instead of widening the page
(pass) T-214: the page and the stylesheets > the visually hidden helper stays inside its container's corner, so it cannot widen the page
(pass) T-214: the page and the stylesheets > the header rearranges below 960 px and the page never forces a horizontal scroll
(pass) T-214: the page and the stylesheets > icon-only buttons are always built with a label [1.00ms]
(pass) T-214: the page and the stylesheets > no inline event handler attributes or style attributes in any script, and no positive tabindex [2.00ms]

test/rule-strength.test.mjs:
(pass) T-171: rule strength and evidence > strength thresholds are Strong at 5+, Steady at 3-4, Light at 1-2 [1.00ms]
(pass) T-171: rule strength and evidence > suggestRules stores times seen, latest date and dated quotes [5.00ms]
(pass) T-171: rule strength and evidence > a second run does not duplicate quotes and keeps the same times seen [6.00ms]
(pass) T-171: rule strength and evidence > a fresh database has the strength columns and the quotes table [5.00ms]

test/hybrid-search.test.mjs:
(pass) hybrid search > keyword search answers without an embedder and says vectors are off [12.00ms]
(pass) hybrid search > a fact vector is written automatically and rescues a lexically absent query [7.00ms]
(pass) hybrid search > facts and episodes are fused with RRF and both kinds are present [8.00ms]
(pass) hybrid search > scope and history are stated in the channel report [8.00ms]

test/assets.test.mjs:
(pass) visual assets > every asset exists, is a real PNG and stays small enough for a README [3.00ms]
(pass) visual assets > the social card is 1280x640 and the favicons are square [1.00ms]
(pass) visual assets > README, translations, site header and app pages point at the new files
(pass) visual assets > no old SVG logo files remain
(pass) visual assets > no demo GIF is referenced or claimed

test/temp-dirs.test.mjs:
(pass) temp dir registry > a registered dir is removed by cleanup [4.00ms]
(pass) temp dir registry > cleanup is idempotent and does not throw on a missing dir
(pass) temp dir registry > a fixture directory is registered and does not survive cleanup [5.00ms]

test/ui-markdown.test.mjs:
(pass) T-202: Markdown blocks > headings shift down one level so the page keeps its own h1 [1.00ms]
(pass) T-202: Markdown blocks > paragraphs keep soft line breaks as <br>
(pass) T-202: Markdown blocks > unordered, ordered and nested lists [1.00ms]
(pass) T-202: Markdown blocks > task lists render disabled checkboxes
(pass) T-202: Markdown blocks > fenced code keeps its text, shows the language and has a copy button
(pass) T-202: Markdown blocks > the copy button sends the code to the copy callback
(pass) T-202: Markdown blocks > an unclosed fence runs to the end [1.00ms]
(pass) T-202: Markdown blocks > blockquotes nest blocks
(pass) T-202: Markdown blocks > tables with alignment
(pass) T-202: Markdown blocks > a horizontal rule
(pass) T-202: Markdown blocks > a pipe in a paragraph is not a table
(pass) T-202: Markdown inline > code, strong, emphasis and strikethrough [1.00ms]
(pass) T-202: Markdown inline > snake_case words are not emphasis
(pass) T-202: Markdown inline > code spans protect markup characters
(pass) T-202: Markdown inline > a link has rel and target, and the label is text
(pass) T-202: Markdown inline > mailto and bare URLs become links; trailing punctuation stays outside
(pass) T-202: Markdown inline > backslash escapes
(pass) T-202: hostile input stays inert > inert: "<script>alert(1)</script>"
(pass) T-202: hostile input stays inert > inert: "[x](javascript:alert(1))"
(pass) T-202: hostile input stays inert > inert: "[x](JaVaScRiPt:alert(1))"
(pass) T-202: hostile input stays inert > inert: "[x](java\nscript:alert(1))"
(pass) T-202: hostile input stays inert > inert: "[x](java\tscript:alert(1))"
(pass) T-202: hostile input stays inert > inert: "[x](data:text/html;base64,PHNjcmlwdD4=)"
(pass) T-202: hostile input stays inert > inert: "[x](vbscript:msgbox(1))"
(pass) T-202: hostile input stays inert > inert: "[x](//evil.example/x)"
(pass) T-202: hostile input stays inert > inert: "[x](/relative)"
(pass) T-202: hostile input stays inert > inert: "<img src=x onerror=alert(1)>"
(pass) T-202: hostile input stays inert > inert: "![x](javascript:alert(1))"
(pass) T-202: hostile input stays inert > inert: "<a href=\"javascript:alert(1)\" onclick=\"x()\">y
(pass) T-202: hostile input stays inert > inert: "**<svg onload=alert(1)>**" [1.00ms]
(pass) T-202: hostile input stays inert > inert: "| <b>x</b> |\n|---|\n| <img onerror=x> |"
(pass) T-202: hostile input stays inert > inert: "```<script>```\n<script>\n```"
(pass) T-202: hostile input stays inert > inert: "- <iframe src=x></iframe>"
(pass) T-202: hostile input stays inert > inert: "> <style>*{display:none}</style>"
(pass) T-202: hostile input stays inert > inert: "# <script>x</script>"
(pass) T-202: hostile input stays inert > inert: "[a](https://ok.example \"title\" onmouseover=aler
(pass) T-202: hostile input stays inert > inert: "‮<script>"
(pass) T-202: hostile input stays inert > script text survives as visible text, not markup
(pass) T-202: hostile input stays inert > a javascript: link keeps its label as plain text
(pass) T-202: hostile input stays inert > safeUrl only accepts http, https and mailto
(pass) T-202: hostile input stays inert > deep nesting and huge input do not blow the stack or hang [150.00ms]
(pass) T-202: hostile input stays inert > very long text is cut with a notice [1.00ms]
(pass) T-202: hostile input stays inert > user text carries dir=auto for right-to-left scripts

test/ui-tools-team.test.mjs:
(pass) T-217: alerts > rules with their target, signing and a feed paged from the server [13.00ms]
(pass) T-217: alerts > an empty rule list explains what a rule does and that nothing is sent yet [13.00ms]
(pass) T-217: alerts > Send a test reports the counts [25.00ms]
(pass) T-217: alerts > Remove asks first and says it cannot be undone; cancel sends nothing, confirm deletes [42.00ms]
(pass) T-217: alerts > adding a rule needs a place to send to, then posts every field [41.00ms]
(pass) T-217: alerts > Deliver due now runs the queue and reports [29.00ms]
(pass) T-217: team > shows the team, its members, the board, the brief and the counts [12.00ms]
(pass) T-217: team > no teams explains what a team is and offers Create [12.00ms]
(pass) T-217: team > creating a team needs a name, then posts it [39.00ms]
(pass) T-217: team > sharing a project posts it with the team id; a viewer cannot [40.00ms]
(pass) T-217: team > the chosen team and project live in the address [13.00ms]
(pass) T-217: team > search needs words and lists the shared results [39.00ms]

test/requests.test.mjs:
aletheia: file /tmp/work-view-fixture-z2RxCh/requests.db mode 0644 -> 0600
(pass) T-152: the request layer > sessions of one goal in one project form one request; a different goal is another [3.00ms]
(pass) T-152: the request layer > status comes from stored rows: Working, Shipped, Waiting on you and Idle [12.00ms]
(pass) T-152: the request layer > detail returns where this came from: sessions, prompts and facts [6.00ms]
(pass) T-152: the request layer > dismiss and restore are reversible settings, not deletes [5.00ms]
(pass) T-152: the request layer > the /v1/work/requests routes answer with the same shapes and an empty store says empty [16.00ms]

test/e2e-more-hosts.test.mjs:
aletheia: data directory /tmp/work-view-fixture-dmskcR/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-dmskcR/data/hub.db mode 0644 -> 0600
(pass) T-140: end to end capture for every full-capability host > install, feed a recorded payload set, assert rows and no secrets [2690.97ms]
(pass) T-140: end to end capture for every full-capability host > hook work stays under 100 ms at p95 for every host [194.00ms]

test/server-bin.test.mjs:
(pass) bin/aletheia-server.mjs starts without --host and answers health [219.00ms]

test/rules-decide.test.mjs:
aletheia: file /tmp/work-view-fixture-FIxXpA/rules-decide.db mode 0644 -> 0600
(pass) T-172: rule decide flow > approve creates a rule and marks the suggestion accepted [9.00ms]
(pass) T-172: rule decide flow > edit-then-approve uses the edited text; reject dismisses [10.00ms]
(pass) T-172: rule decide flow > toggle turns a rule off and back on without deleting it [9.00ms]
(pass) T-172: rule decide flow > replace records replaced by and replaced at on the old rule [7.00ms]
(pass) T-172: rule decide flow > the learning run record survives and is read back [8.00ms]
(pass) T-172: rule decide flow > the decide routes answer [8.00ms]

test/sync-tombstones.test.mjs:
aletheia: data directory /tmp/aletheia-sync-tomb-jiTPSm/a mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-tomb-jiTPSm/a/client.db mode 0644 -> 0600
aletheia: data directory /tmp/aletheia-sync-tomb-jiTPSm/b mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-tomb-jiTPSm/b/client.db mode 0644 -> 0600
aletheia: data directory /tmp/aletheia-sync-tomb-jiTPSm/fresh mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-tomb-jiTPSm/fresh/client.db mode 0644 -> 0600
(pass) T-103: tombstones, compaction and purge > (f) a tombstone propagates and compaction keeps convergence [14.00ms]
aletheia: data directory /tmp/aletheia-sync-tomb-jiTPSm/stale mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-tomb-jiTPSm/stale/client.db mode 0644 -> 0600
(pass) T-103: tombstones, compaction and purge > a device older than the window re-bootstraps from a snapshot [2.00ms]
aletheia: data directory /tmp/aletheia-sync-tomb-jiTPSm/dismiss mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-tomb-jiTPSm/dismiss/client.db mode 0644 -> 0600
aletheia: data directory /tmp/aletheia-sync-tomb-jiTPSm/dismiss-replay mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-tomb-jiTPSm/dismiss-replay/client.db mode 0644 -> 0600
(pass) T-103: tombstones, compaction and purge > dismiss and restore keep their content through compaction [10.00ms]
aletheia: data directory /tmp/aletheia-sync-tomb-jiTPSm/purge mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-tomb-jiTPSm/purge/client.db mode 0644 -> 0600
aletheia: data directory /tmp/aletheia-sync-tomb-jiTPSm/purge-other mode 0775 -> 0700
aletheia: file /tmp/aletheia-sync-tomb-jiTPSm/purge-other/client.db mode 0644 -> 0600
(pass) T-103: tombstones, compaction and purge > purge removes content everywhere and leaves only the tombstone [7.00ms]

test/merge-duplicates.test.mjs:
(pass) merge duplicates > the older id survives, facts are unioned, and the loser is kept as merged [7.00ms]
(pass) merge duplicates > the audit row names both ids and the merge is idempotent [7.00ms]
(pass) merge duplicates > a merge across projects and a self merge are refused [5.00ms]

test/empty-results.test.mjs:
(pass) empty search results > no searchable terms says no_terms [5.00ms]
(pass) empty search results > an empty store with a real query says no_rows [4.00ms]
(pass) empty search results > a project filter that excludes all says filtered [6.00ms]
(pass) empty search results > the MCP text response carries the reason [7.00ms]

test/service.test.mjs:
(pass) T-151: auto-start service > the Linux unit is loopback-only with Restart, Nice and documented quota defaults [1.00ms]
(pass) T-151: auto-start service > quota flags write active overrides instead of the commented defaults
(pass) T-151: auto-start service > the macOS plist is written from the launchd docs and labelled from-docs-only [1.00ms]
(pass) T-151: auto-start service > Windows is not supported and says so
(pass) T-151: auto-start service > install is dry-run by default and idempotent with --write
(pass) T-151: auto-start service > uninstall is dry-run by default and removes the file and manifest with --write [1.00ms]

test/no-folder-pollution.test.mjs:
(pass) T-122: no writes into a project folder > install writes under HOME only, and a full simulated session leaves the project byte-identical [915.99ms]

test/pagination.test.mjs:
aletheia: file /tmp/work-view-fixture-d04W6r/paging.db mode 0644 -> 0600
(pass) T-203: paging rules > pagingOf caps the limit and clamps bad input [1.00ms]
(pass) T-203: paging rules > whenOf reads dates, instants and epochs; a bare end date covers the whole day
(pass) T-203: memories > pages never overlap and add up to the total (dismissed rows excluded) [11.00ms]
(pass) T-203: memories > the limit is capped at the hard maximum [1.00ms]
(pass) T-203: memories > an offset past the end is empty with the same total [1.00ms]
(pass) T-203: memories > project, kind, type and tool filters narrow the total [10.00ms]
(pass) T-203: memories > date range filters on the creation time [4.00ms]
(pass) T-203: memories > sorting changes the order but keeps paging stable [8.00ms]
(pass) T-203: memories > status=dismissed lists only hidden memories [4.00ms]
(pass) T-203: memories > free text keeps the total honest [2.00ms]
(pass) T-203: facts > current facts page and exclude dismissed rows [6.00ms]
(pass) T-203: facts > status filter: history and dismissed [3.00ms]
(pass) T-203: facts > the old history=1 flag still works [2.00ms]
(pass) T-203: facts > scope, date range and text filters [9.00ms]
(pass) T-203: facts > sorting by confidence is stable across pages [7.00ms]
(pass) T-203: review queue > pending items page with a total [8.00ms]
(pass) T-203: review queue > the near-duplicate lists report their own totals [1.00ms]
(pass) T-203: review queue > resolved items are a separate page set [7.00ms]
(pass) T-203: review queue > the project filter narrows the queue [6.00ms]
(pass) T-203: rule suggestions > pending and dismissed page separately [4.00ms]
(pass) T-203: rule suggestions > project, text and sort filters [4.00ms]
(pass) T-203: rule suggestions > the limit is capped [2.00ms]
(pass) T-203: dismissed items > pages, labels and type filter [8.00ms]
(pass) T-203: dismissed items > a project filter counts only matching targets [2.00ms]
(pass) T-203: audit > pages newest first with a total [6.00ms]
(pass) T-203: audit > actor, action and date filters [4.00ms]
(pass) T-203: sessions > /v1/work/sessions pages merged sessions [7.00ms]
(pass) T-203: sessions > state, project and date filters [11.00ms]
(pass) T-203: goals and devices > goals carry paging fields [3.00ms]
(pass) T-203: goals and devices > sync devices carry paging fields [2.00ms]
(pass) T-203: search > the unpaged call keeps its old shape [1.00ms]
(pass) T-203: search > with an offset the results page and report a total [4.00ms]
(pass) T-203: search > facts come first, then memories, and the limit is capped [6.00ms]
(pass) T-203: search > mix alternates facts and memories so a short window shows both [5.00ms]
(pass) T-203: search > an empty result explains itself [1.00ms]
(pass) T-203: search > a date range filters hits [3.00ms]

test/install-windsurf.test.mjs:
(pass) T-065: Windsurf installer and hooks > a dry run plans the current MCP path, hooks and global rules [5.00ms]
(pass) T-065: Windsurf installer and hooks > an existing legacy MCP file is merged, and a second install is a no-op [21.00ms]
aletheia: data directory /tmp/work-view-fixture-ZHoQ4t/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-ZHoQ4t/data/hub.db mode 0644 -> 0600
(pass) T-065: Windsurf installer and hooks > the installed hooks capture prompts, commands and responses, and doctor sees 4/4 [314.00ms]
(pass) T-065: Windsurf installer and hooks > uninstall removes only our entries and leaves the user's hook [20.00ms]

test/providers.test.mjs:
(pass) provider routing > none makes zero network calls
(pass) provider routing > a local endpoint completes a fixture extraction [1.00ms]
(pass) provider routing > models are routed: small for extraction, larger for summaries
(pass) provider routing > a fake provider answers without the network
(pass) provider routing > a misconfigured provider fails with a message that names the setting [1.00ms]
(pass) extraction modes > the four modes load and describe their output language
(pass) extraction modes > a mode changes the output language in a fixture
(pass) extraction modes > an explicit answer with no output still refuses cleanly

test/poisoning.test.mjs:
aletheia: file /tmp/poison-mX8oGJ/hub.db mode 0644 -> 0600
(pass) T-011: the wrapper > opens and closes once and carries the one-line rule
(pass) T-011: the wrapper > a copy of the tag inside the text is made inert, in any case or spacing
(pass) T-011: the wrapper > it survives JSON and Markdown
(pass) T-011: every path that recalls memory is wrapped > MCP search [1.00ms]
(pass) T-011: every path that recalls memory is wrapped > MCP get_observations
(pass) T-011: every path that recalls memory is wrapped > MCP timeline [1.00ms]
(pass) T-011: every path that recalls memory is wrapped > MCP session_start_context
(pass) T-011: every path that recalls memory is wrapped > the hook session context [1.00ms]
(pass) T-011: every path that recalls memory is wrapped > an attack that closes the tag early cannot escape on any path [1.00ms]
(pass) T-011: every path that recalls memory is wrapped > an empty result is a plain message, not a fake memory block [1.00ms]

test/economics.test.mjs:
aletheia: file /tmp/work-view-fixture-v9z7SM/economics.db mode 0644 -> 0600
(pass) T-170: context economics > read tokens are counted from text; work tokens come from the usage ledger [7.00ms]
(pass) T-170: context economics > no usage record means work tokens are null and labelled [7.00ms]
(pass) T-170: context economics > the route answers with the economics shape [3.00ms]
aletheia: file /tmp/aletheia-econ-u0OM8m/hub.db mode 0644 -> 0600
(pass) T-170: context economics > aletheia context economics prints the same data [70.00ms]

test/ui-components.test.mjs:
(pass) T-204: the library > every component named in the task is exported as a function [1.00ms]
(pass) T-204: the library > no module builds markup from strings or loads anything from outside [2.00ms]
(pass) T-204: the library > every public script transpiles [12.00ms]
(pass) T-204: buttons > label, variant, icon slot and a plain click
(pass) T-204: buttons > an async handler shows loading, disables, then a check [5.00ms]
(pass) T-204: buttons > a second click while busy does nothing [2.00ms]
(pass) T-204: buttons > a rejected handler shows the error and a toast [4.00ms]
(pass) T-204: buttons > an icon button must carry a label
(pass) T-204: buttons > a link-style button keeps its href
(pass) T-204: toasts > three show at once, the rest wait and appear as others close [11.00ms]
(pass) T-204: toasts > undo toast has an Undo button that calls back once [2.00ms]
(pass) T-204: toasts > message text is text, not markup
(pass) T-204: dialogs > a modal traps Tab, closes on Escape and returns focus
(pass) T-204: dialogs > the dialog title labels the dialog
(pass) T-204: dialogs > confirm resolves true on the confirm button and false on cancel
(pass) T-204: dialogs > a dangerous confirm focuses Cancel and Escape means no [1.00ms]
(pass) T-204: dialogs > a click on the backdrop closes
(pass) T-204: dialogs > the app root is inert while a dialog is open
(pass) T-204: dialogs > a drawer is a dialog too
(pass) T-204: dialogs > prompt returns the typed text [1.00ms]
(pass) T-204: tabs, segmented control, toggle > tabs expose roles and the active one
(pass) T-204: tabs, segmented control, toggle > arrow keys move and notify; setActive does not notify [1.00ms]
(pass) T-204: tabs, segmented control, toggle > link tabs render anchors
(pass) T-204: tabs, segmented control, toggle > segmented control is a radio group
(pass) T-204: tabs, segmented control, toggle > a switch flips and reports [1.00ms]
(pass) T-204: tabs, segmented control, toggle > chip filters: single and multi
(pass) T-204: popover and tooltip > a popover opens on click, closes on Escape and gives focus back [1.00ms]
(pass) T-204: popover and tooltip > a click outside closes it
(pass) T-204: popover and tooltip > a tooltip is the element's description and shows on focus
(pass) T-204: progress, tiles, skeletons > a determinate bar carries its value and a text
(pass) T-204: progress, tiles, skeletons > an indeterminate bar has no value
(pass) T-204: progress, tiles, skeletons > a stat tile shows a dash for no value and a number once known
(pass) T-204: progress, tiles, skeletons > skeletons are hidden from screen readers and sized by count
(pass) T-204: progress, tiles, skeletons > the loader announces its text [1.00ms]
(pass) T-204: empty and error states > empty state shows the fix command with a copy button [3.00ms]
(pass) T-204: empty and error states > error state has Retry and Copy details [5.00ms]
(pass) T-204: empty and error states > banner updates its text
(pass) T-204: the pager > labels, current page and disabled ends
(pass) T-204: the pager > clicks give an offset and a limit [1.00ms]
(pass) T-204: the pager > the size select offers 10, 25, 50, 100 and resets to the first page [1.00ms]
(pass) T-204: the pager > arrow keys inside the pager change page
(pass) T-204: the pager > an empty list says so and has no active buttons
(pass) T-204: the pager > a list enters with a stagger index [1.00ms]
(pass) T-204: text components > highlight marks matches and keeps hostile text as text
(pass) T-204: text components > clamp shows the button only when text overflows
(pass) T-204: text components > disclosure toggles aria-expanded [3.00ms]
(pass) T-204: text components > code block carries the language and the whitespace
(pass) T-204: text components > a time element has the exact time in its title
(pass) T-204: text components > mono copies its text [2.00ms]
(pass) T-204: text components > timeline renders each item
(pass) T-204: text components > a card with a title and actions
(pass) T-204: text components > a status dot says what it is when labelled [1.00ms]

test/aliases.test.mjs:
(pass) entity aliases > a 50-pair labelled fixture reaches precision >= 0.95 [23.00ms]
(pass) entity aliases > a cross-project alias is not merged [5.00ms]
(pass) entity aliases > every merge is audited and keeps the alias [6.00ms]
(pass) entity aliases > an ambiguous match creates a row and queues a review instead of guessing [9.00ms]
(pass) entity aliases > Jaro-Winkler scores agree with the textbook examples
(pass) entity aliases > resolveEntity reports an ambiguous candidate set without creating a row [9.00ms]

test/ui-work.test.mjs:
(pass) T-218: the overview > asks for a small overview, one page of requests and the goals [21.00ms]
(pass) T-218: the overview > shows the tiles, request cards, needs, recent facts and goals [24.00ms]
(pass) T-218: the overview > a request card shows status, progress evidence, ETA and what came out of it [25.00ms]
(pass) T-218: the overview > the heuristic labels link to the UNVERIFIED note [20.00ms]
(pass) T-218: the overview > Accept on a review item hides it, posts, and Undo reopens it [68.00ms]
(pass) T-218: the overview > a failed action puts the card back and says why [52.00ms]
(pass) T-218: the overview > Dismiss hides a request first, posts, and Undo restores it [54.00ms]
(pass) T-218: the overview > a failed dismiss puts the card back and says why [57.00ms]
(pass) T-218: the overview > a dismissed request is listed with Restore [37.00ms]
(pass) T-218: the overview > filter, sort and group controls refetch with the chosen values [51.00ms]
(pass) T-218: the overview > at most six needs-you items are shown, with a count and links to the full pages [19.00ms]
(pass) T-218: the overview > an empty hub shows the first-run guide, not made-up rows [18.00ms]
(pass) T-218: the overview > goals page from the server and Pin is optimistic [35.00ms]
(pass) T-215: refresh > a change frame from the status bar refreshes the overview after a short pause [668.99ms]
(pass) T-215: refresh > leaving the tab removes the listeners [20.00ms]
(pass) T-218: one request > opens from the address and shows where this came from, with a session link [18.00ms]
(pass) T-218: one request > an unknown request shows the error with Retry [17.00ms]
(pass) T-215: one session > shows the summary, the timeline in order, and the facts, and links back [17.00ms]
(pass) T-215: one session > an unknown session shows the error with Retry [17.00ms]

test/transcript-backfill.test.mjs:
(pass) T-121: transcript back-fill > the verified layout is found and checkpoint/meta files are ignored
(pass) T-121: transcript back-fill > a transcript parses into redacted user and assistant turns [1.00ms]
aletheia: file /tmp/aletheia-transcripts-GP38Z4/hub.db mode 0644 -> 0600
(pass) T-121: transcript back-fill > import writes episodes and one job per session, is idempotent, and never changes the source [20.00ms]
aletheia: file /tmp/aletheia-transcripts-GP38Z4/order.db mode 0644 -> 0600
(pass) T-121: transcript back-fill > a session whose only turn duplicates another session is still queued (CI order flake regression) [11.00ms]
aletheia: file /tmp/aletheia-transcripts-GP38Z4/dry.db mode 0644 -> 0600
(pass) T-121: transcript back-fill > a dry run counts without writing, and --since filters by the turn timestamp [11.00ms]
(pass) T-121: transcript back-fill > the CLI prints a dry-run summary and refuses an unknown tool [260.00ms]

test/install-cursor.test.mjs:
(pass) T-061: Cursor installer and hooks > a dry run plans MCP and flat hooks, and writes nothing [6.00ms]
(pass) T-061: Cursor installer and hooks > apply merges user entries, keeps version 1, and a second run is a no-op [21.00ms]
aletheia: data directory /tmp/work-view-fixture-LNtjR1/data mode 0775 -> 0700
aletheia: file /tmp/work-view-fixture-LNtjR1/data/hub.db mode 0644 -> 0600
(pass) T-061: Cursor installer and hooks > the installed commands capture prompts, tools and responses without secrets [506.99ms]
(pass) T-061: Cursor installer and hooks > uninstall removes only the cursor entries [25.00ms]

test/site.test.mjs:
(pass) docs site > the build and sitemap check pass [409.99ms]
(pass) docs site > there is one page per top-level document [1.00ms]
(pass) docs site > a page renders headings, tables, lists, code and TechArticle data
(pass) docs site > every relative href and asset resolves [3.00ms]
(pass) docs site > the site uses no CDN or external script [4.00ms]
(pass) docs site > the landing page carries FAQPage data and a docs link
(pass) docs site > robots.txt points at the generated sitemap

test/ui-rules-decide.test.mjs:
(pass) T-220: suggestion strength and evidence > shows strength, times seen, the latest date and the first two dated quotes [20.00ms]
(pass) T-220: suggestion strength and evidence > Approve posts approve and Undo restores and turns the new rule off [52.00ms]
(pass) T-220: suggestion strength and evidence > Edit posts the edited text with action edit and closes the dialog [51.00ms]
(pass) T-220: suggestion strength and evidence > Reject posts reject and offers Undo [52.00ms]
(pass) T-220: rules, toggle, replace and the learning run > Turn off posts to /toggle and Undo posts the reverse [52.00ms]
(pass) T-220: rules, toggle, replace and the learning run > Replace explains itself, posts the new text and reports the new rule [51.00ms]
(pass) T-220: rules, toggle, replace and the learning run > the learning run is read and can be run again [35.00ms]
(pass) T-220: rules, toggle, replace and the learning run > a rule that was replaced shows the replacement on its card [17.00ms]

test/readmodel.test.mjs:
(pass) text rules > a greeting is not a request, an ask is
(pass) text rules > scaffolding is stripped from the request text [1.00ms]
(pass) text rules > a title is the first sentence, at most 100 characters
(pass) work state fold > task fields accumulate and null deletes
(pass) work state fold > done closes a task and the list stops being open
(pass) work state fold > list state without a task lives on the list
(pass) work product from recorded Bash calls > commit, branch and repo from commit then push output [1.00ms]
(pass) work product from recorded Bash calls > gh pr create yields a pull request
(pass) work product from recorded Bash calls > git hides the user in ssh remotes, so the repo is unknown (same as the original)
(pass) work product from recorded Bash calls > a failed push produces no branch
(pass) projection on the fixture database > connected and read-only
(pass) projection on the fixture database > one card per human request, newest first [1.00ms]
(pass) projection on the fixture database > later asks in a session are scope updates, not new cards
(pass) projection on the fixture database > commit, branch and PR attach to the request of their session
(pass) projection on the fixture database > a subagent is its own agent with its launch as the request
(pass) projection on the fixture database > explicit request ids group work-state items under one request
(pass) projection on the fixture database > goals come from the owner-goals list
(pass) projection on the fixture database > observations are read even though the table has no content_session_id
(pass) projection on the fixture database > bug-compatible mode reproduces the original's empty observation half [4.00ms]
(pass) projection on the fixture database > the content fingerprint is stable and changes with the source work [1.00ms]
(pass) projection on the fixture database > evidence URLs resolve to recorded rows
(pass) projection on the fixture database > joins by conversation: a sibling ask in the same project is a separate card until the ledger groups it [1.00ms]

test/team-mode.test.mjs:
(pass) T-112: team mode > the owner sees every project; a member sees only its shares
(pass) T-112: team mode > (a) a viewer cannot write, and the store refuses it, not only a route [1.00ms]
(pass) T-112: team mode > (b) a member of project A cannot read project B [3.00ms]
(pass) T-112: team mode > (c) a revoked member loses access on the next call [2.00ms]
(pass) T-112: team mode > a sync token revoked elsewhere fails the next team call [1.00ms]
(pass) T-112: team mode > the board records pins and decisions with author and time [1.00ms]
(pass) T-112: team mode > the brief is rule-based, cites source ids and names no model [3.00ms]
(pass) T-112: team mode > shared search respects project ACLs [1.00ms]
(pass) T-112: team mode > only an owner can manage the team [1.00ms]
(pass) T-112: team mode > leave tombstones the member's shared rows and removes its shares [2.00ms]
(pass) T-112: team mode > the HTTP routes run the same store checks (viewer 403, cross-project 403, revoke 401) [18.00ms]

test/artifacts.test.mjs:
(pass) T-167: what came out of it > detectArtifacts finds a PR URL, a bracketed commit+branch, a push branch and a PR number
(pass) T-167: what came out of it > a request carries its commit, PR and branch evidence ids [9.00ms]
(pass) T-167: what came out of it > cameOutOfIt scans only the named sessions [6.00ms]

test/ui-shell.test.mjs:
(pass) T-205: routes with pages inside tabs > tab, page and the rest
(pass) T-205: routes with pages inside tabs > an unknown page falls back to the first page of the tab
(pass) T-205: routes with pages inside tabs > a work session keeps its id in the key, so opening another session rebuilds the view [1.00ms]
(pass) T-205: routes with pages inside tabs > a page number or filter alone does not change the key
(pass) T-205: routes with pages inside tabs > every tab has a shortcut letter and a hint, and the letters are unique
(pass) T-205: theme preference > auto means no attribute; dark and light set it
(pass) T-205: theme preference > applying stores the choice and sets the root attribute; auto clears both
(pass) T-205: theme preference > a missing, odd or blocked store reads as auto
(pass) T-205: theme preference > the early script uses the same key and the same rule as the module [1.00ms]
(pass) T-205: the page > index.html has the skip link, the status region, the live announcer and no inline script or style
(pass) T-205: header search > typing waits, then asks once for the best matches [362.00ms]
(pass) T-205: header search > one character does not search [321.00ms]
(pass) T-205: header search > Enter with nothing chosen opens the full results page
(pass) T-205: header search > arrow keys move the active result and Escape closes [342.00ms]
(pass) T-205: header search > a failed search says so in the list [341.00ms]
(pass) T-205: header search > an answer for an old query never replaces a newer one [543.99ms]
(pass) T-205: header search > the results link hash is stable
(pass) T-205: shortcuts > g then a letter jumps to a tab [1.00ms]
(pass) T-205: shortcuts > g then an unknown letter does nothing, and a lone letter does nothing
(pass) T-205: shortcuts > slash focuses search; Ctrl+K and Cmd+K open the palette
(pass) T-205: shortcuts > nothing fires while typing in a field, except Ctrl+K
(pass) T-205: shortcuts > nothing fires while a dialog is open
(pass) T-205: shortcuts > [ and ] click the visible pager's buttons [1.00ms]
(pass) T-205: shortcuts > the browser's own shortcuts are left alone
(pass) T-205: shortcuts > the sheet lists what the handler does [1.00ms]
(pass) T-205: the palette > static commands cover every tab and sub page, and are findable
(pass) T-205: the palette > opening the palette shows a labelled combobox and Escape closes it [2.00ms]
(pass) T-205: the palette > Enter runs the highlighted command [12.00ms]
(pass) T-216: demo label and the page's security headers > ?demo=1 is the only thing that marks demo mode

test/ui-contract.test.mjs:
aletheia: file /tmp/work-view-fixture-fXHOKC/contract.db mode 0644 -> 0600
(pass) T-216: the UI's API contract > the scripts name a believable number of routes [5.00ms]
(pass) T-216: the UI's API contract > every path the UI calls is a route the server has [50.00ms]
(pass) T-216: the UI's API contract > paths with an id are real routes too, not just a prefix [4.00ms]
(pass) T-216: the UI's API contract > an invented path is reported missing, so the check can fail
(pass) T-216: the UI's API contract > the app page has a strict security header, and every script it loads is served as JavaScript [4.00ms]
(pass) T-216: the UI's API contract > every module the shell imports is served [7.00ms]

test/excluded-projects.test.mjs:
(pass) excluded projects > the list parses and matches case-insensitively
(pass) excluded projects > normalizeHook refuses an excluded project before building a memory
aletheia: data directory /tmp/aletheia-excluded-tC5nSY/data mode 0775 -> 0700
aletheia: file /tmp/aletheia-excluded-tC5nSY/data/hub.db mode 0644 -> 0600
(pass) excluded projects > the hook writes no memory and no episode for an excluded project and says why [11.00ms]
(pass) excluded projects > config reads ALETHEIA_EXCLUDED_PROJECTS
(pass) excluded projects > context scope=current is the default and scope=all includes other projects [7.00ms]

test/permissions.test.mjs:
aletheia: data directory /tmp/aletheia-perm-2N2jGS/data mode 0775 -> 0700
aletheia: file /tmp/aletheia-perm-2N2jGS/data/hub.db mode 0644 -> 0600
(pass) data permissions > a new store secures the data dir, the db and the WAL sidecars [10.00ms]
aletheia: data directory /tmp/aletheia-repair-jH5AL2/data mode 0775 -> 0700
aletheia: file /tmp/aletheia-repair-jH5AL2/data/hub.db mode 0644 -> 0600
aletheia: data directory /tmp/aletheia-repair-jH5AL2/data mode 0755 -> 0700
aletheia: file /tmp/aletheia-repair-jH5AL2/data/hub.db mode 0644 -> 0600
aletheia: file /tmp/aletheia-repair-jH5AL2/data/hub.db-wal mode 0644 -> 0600
aletheia: file /tmp/aletheia-repair-jH5AL2/data/hub.db-shm mode 0644 -> 0600
(pass) data permissions > an existing 0755 dir and 0644 db are repaired on open [10.00ms]
aletheia: data directory /tmp/aletheia-symlink-5tpEX5/data mode 0775 -> 0700
aletheia: file /tmp/aletheia-symlink-5tpEX5/data/hub.db mode 0644 -> 0600
(pass) data permissions > POSIX symlinks and mode bits are not available on Windows [8.00ms]
aletheia: data directory /tmp/aletheia-spool-NElkdk/spool mode 0775 -> 0700
aletheia: file /tmp/aletheia-spool-NElkdk/spool/hook-spool.jsonl mode 0664 -> 0600
aletheia: file /tmp/aletheia-spool-NElkdk/sync-client.db mode 0644 -> 0600
(pass) data permissions > spool and token files are 0600 [1.00ms]
(pass) data permissions > the helpers are graceful on missing paths and no-ops on :memory: [1.00ms]

test/ui-contrast.test.mjs:
(pass) T-200: design tokens > contrast maths matches known values [1.00ms]
(pass) T-200: design tokens > every text pair meets 4.5:1 and every control edge 3:1 in both themes [1.00ms]
(pass) T-200: design tokens > the automatic light theme and the manual light theme define the same tokens
(pass) T-200: design tokens > light overrides every theme token the dark theme sets
(pass) T-200: design tokens > the stylesheet loads nothing from outside [1.00ms]
(pass) T-200: design tokens > reduced motion collapses every duration token

test/install-targets/rules.test.mjs:
(pass) T-070: rules targets match the documented format > every target records a verification key and source key
(pass) T-070: rules targets match the documented format > the dated table covers every target
(pass) T-070: rules targets match the documented format > Cursor writes a whole .mdc with valid frontmatter and managed markers [7.00ms]
(pass) T-070: rules targets match the documented format > Windsurf writes the current workspace rule path with trigger: always_on [8.00ms]
(pass) T-070: rules targets match the documented format > block tools preserve user text outside the markers [7.00ms]
(pass) T-070: rules targets match the documented format > the verified global paths resolve and write [5.00ms]
(pass) T-070: rules targets match the documented format > targetPath agrees with syncTool for every target [9.00ms]

 1111 pass
 0 fail
 18659 expect() calls
Ran 1111 tests across 118 files. [44.90s]
```

## bun scripts/check-tasks.mjs

Exit code: 0 · 0.04s

```text
check-tasks: ok — 179 tasks (todo=56 doing=1 validated=122)
```

