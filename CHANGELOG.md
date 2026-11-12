# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). This file is built from the git
history.

## [Unreleased]

### Fixed

- `aletheia doctor`'s evidence line for Claude Code now lists `PreToolUse` among the hook events that have run in tests only, like the README and `install --list`.

## [0.2.0] - 2026-11-12

### Security

- Remote mode (a non-loopback bind) served `/v1/*`, the `/v1/live` socket and `/mcp` to anyone who could reach the port when `ALETHEIA_API_KEY` was not set; the login covered only `/` and `/api/*`. In remote mode `/v1` now needs a login session or the key, `/mcp` needs the key, and the server warns at startup when no key is set. Loopback installs, the default, were not affected.
- On a loopback bind with no key, `/mcp` now answers only this computer, like `/v1`. Behind a reverse proxy or tunnel it answered anyone.
- `ALETHEIA_API_KEY` now guards every `/api` and `/v1` route, not only `/v1` and `/mcp`. The dashboard asks for the key once per tab and sends it as a bearer header; the live socket uses a one-time ticket, so the key never goes in a URL. A key must be at least 32 characters in remote mode, and repeated wrong keys are throttled.
- Every prompt is redacted again, and `<private>` blocks dropped, before any model call: the Work view refresh, summaries, compress and fact extraction.
- The sync hub checks the pairing lockout before the code, so a correct guess no longer succeeds while locked out.
- Hardening: a Host header that would change the routed path is refused; malformed percent sequences return 4xx instead of 500; the CSRF token is tied to the login session; logout closes that session's live streams; the login lockout map is bounded.

### Added

- `aletheia backup run|list|status` and `aletheia restore <file>`: scheduled local snapshots of `hub.db` (off by default, every 24 h, keep 7). Restore refuses while another process holds the database.
- Git worktree sessions share their main project's memory (`project.worktrees`, default `main`). `aletheia projects` lists project keys, and `aletheia projects fold-worktrees [--write]` folds old worktree keys into their main project. Project merges move every table in one transaction.
- Search finds Chinese, Japanese and Korean words inside stored text through a bigram channel.
- Dense (vector) results on `/v1/search`, MCP `search` and the dashboard when the optional embeddings package is installed, with a keyword fallback and a note when it is not.
- Opt-in cross-encoder rerank in search (`search.rerank`), with a time budget; the rerank benchmark rows are labelled bench only.
- Graph retrieval can be turned on with `graph.enabled` (off by default; measured on synthetic data only). `aletheia entities` and `GET /v1/entities` list entities.
- Claude Code hooks capture failed tool calls (`PostToolUseFailure`) and subagent results (`SubagentStop`); subagent rows stay out of session-start context by default.
- An opt-in file-read gate for Claude Code (`readGate.enabled`, a `PreToolUse` hook) and a `file_outline` MCP tool.
- `team_brief` and `team_search` MCP tools for team members, locally and on the sync hub.
- `aletheia import claude-memory` imports Claude Code auto-memory files, read-only and redacted.
- `aletheia connect` writes MCP config for GitHub Copilot CLI, Goose and Roo Code (from their docs, not tested on a real install).
- `aletheia folder-context <dir> [--write]`, an explicit, dry-run-first command for folder context files.
- `aletheia install claude-desktop [--write]`.
- The dashboard has team write controls, an erasure screen and a project-merge screen with a preview.
- The dashboard can be switched into the ten README languages (machine-translated), with right-to-left layout for Arabic.
- `GET /api/hub/projects/merge-plan`; `docs/openapi.json` now documents every implemented route, and a test fails when one is missing.
- A LoCoMo retrieval run against claude-mem 15.17.0 (Recall@5 43.5%, MRR 0.377, Chroma on), committed with its raw output.

### Changed

- The compress queue no longer drops sessions past 200 when no worker runs; health and doctor report it.
- `aletheia install --list`, doctor and the tools tables show capture and context separately; Windsurf has capture but no context.
- `--help` and `help` exit 0 and list every command; known errors print one line; `aletheia-server --help` prints usage.
- `/healthz` answers from a cache, and doctor waits up to about 3 s and reports a slow server as slow.
- `retention` and `context.format` are in the dashboard Settings.
- The README interfaces table lists `aletheia mcp` and `npx aletheia-mem mcp` as ways to start the stdio MCP server, in all eleven languages.

### Fixed

- The remote login page's Content-Security-Policy blocked its own login request, and the login and logout cookies were sent in one header, so browsers lost the CSRF cookie. Remote login, writes and logout work in a browser again.
- In remote mode the live socket refused the dashboard's own non-loopback origin.
- `test/refresh.test.mjs` failed from 2026-11-08 because it used the wall clock against fixture dates.
- The test suite no longer rewrites tracked `site/` files.
- Two backups written in the same millisecond overwrote each other in `aletheia connect`.
- `gemini-extension.json` still said version 0.1.0. It now carries the package version, and `scripts/release.mjs --prepare` bumps `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json` and `gemini-extension.json` with the package. `--verify` fails when one of them differs.

### Removed

- The unused result cache module, the `setupStateFile` config key and the always-501 `GET /api/work-state` route.

## [0.1.13] - 2026-11-03

### Added

- `aletheia mcp` runs the MCP server over stdio, the same server as `aletheia-mcp`. From npm it starts with `npx aletheia-mem mcp` or `bunx aletheia-mem mcp`.
- Release notes on the docs site: one page per version under `docs/releases/`, a release notes overview at the old `docs/changelog.html` address with an anchor per version, an Atom feed (`docs/releases/feed.xml`), a "Release notes" sidebar section, the latest version in the header and the latest release on the landing page. All of it is generated from this file.
- A search dialog on every docs page, over a generated `docs/search.json`. Open it with Ctrl K (Cmd K on a Mac), `/` or the header search box; arrow keys move and Enter opens.
- A colour theme switch (system, light, dark) that remembers the choice, a releases menu in the header, "Copy as Markdown", "Edit this page on GitHub" and a "Last updated" date on each page.

### Changed

- The docs site has a new design, laid out like the Laravel documentation: a header with the logo and a search box, a sidebar of collapsible groups where the current page carries an accent bar, a reading column with light headings, and an "On this page" column that marks the section you are reading. Code blocks are dark, with line numbers, syntax colours for bash, JSON, INI, TOML, SQL and XML, and a copy button. Tables are bordered, notes and warnings are boxed, and "Next steps" lists show as cards. On phones the sidebar is a drawer and each page opens with its list of sections. The fonts (Instrument Sans and IBM Plex Mono, SIL OFL 1.1) are served from the site; the pages still load no script file and nothing from another origin.
- Each page head adds the Atom feed, the Markdown copy as an alternate, `og:image` size and alt text, `og:locale`, `article:modified_time` and a light and dark `theme-color`. The structured data adds `datePublished` on release pages and `softwareVersion` and `releaseNotes` on the landing page, the docs index and the release notes page.
- Version 0.1.1 is marked `[YANKED]` in this file.

### Fixed

- The MCP Registry entry did not start the server. A registry client runs `npx aletheia-mem`, which is the CLI and only prints its usage. `server.json` now passes the package argument `mcp`, so the client runs `npx aletheia-mem mcp`.
- The docs index page put its content into the 250 px sidebar column, because it had no sidebar. It now has the sidebar and uses the main column.

## [0.1.12] - 2026-11-01

### Added

- The release workflow now publishes to the official MCP registry on every tag: it bumps `server.json` to the tag and publishes the manifest with the registry's pinned, signature-verified `mcp-publisher` CLI (v1.8.7) using OIDC authentication. `release.mjs --prepare` bumps `server.json` with `package.json`, `--sync-server-json` back-fills a hand-made release, and `--verify` fails when the manifest drifts. The mechanism follows the registry's GitHub Actions guide (https://github.com/modelcontextprotocol/registry/blob/main/docs/modelcontextprotocol-io/github-actions.mdx, fetched 2026-11-01); the registry accepts no server-listing pull requests.
- `scripts/build-site.mjs` generates a docs changelog page (`site/docs/changelog.html`) from `CHANGELOG.md`, with a sitemap entry and a link from `llms.txt`; the release workflow rebuilds it and pushes it to main on every tag.

### Changed

- The documentation site moves from `https://mohamed-ashraf-elsaed.github.io/aletheia-mem/` to `https://aletheia.mohamedashrafelsaed.com/`. Canonical URLs, Open Graph tags, structured data, the sitemap, `robots.txt`, `llms.txt`, `llms-full.txt`, the README links and the plugin manifests use the new address. Paths are unchanged, and GitHub Pages redirects the old address. Every docs page has a footer credit that links to the author's site, and the `author` in the structured data carries his URL.
- Package metadata: the npm `homepage` is the project page at `https://mohamedashrafelsaed.com/projects/aletheia/`, and `author` is an object with name, email and URL. The README link row adds the project page. No code changed.
- The Settings page lists only the three settings that code reads: `facts.minConfidence`, `context.facts` and `rules.reviewDays`. The seven that nothing read (`provider`, `providers`, `factBudget.*`, `redaction`, `excludedProjects`, `apiKey`) are removed, along with the masked-secret handling. Use the environment variables for the provider, fact budgets and excluded projects; redaction is always on.

## [0.1.11] - 2026-10-30

### Added

- A full documentation site: 49 pages in eight sections (Get started, Concepts, Connect your tools, Guides, Reference, Compare, Project, Internals) with a sidebar, breadcrumbs, previous and next links and a search box on the index. Pages cover installation, a quickstart, a page for each tool, the CLI, MCP tools, configuration, hooks, migration from claude-mem, backup, running as a service, model providers, troubleshooting, comparisons and benchmarks.
- `llms.txt` and `llms-full.txt` for AI readers, a plain Markdown copy beside every page, per-page Open Graph and structured data (`TechArticle`, `BreadcrumbList`, `FAQPage`), and a `robots.txt` that names the main search and AI crawlers.
- `scripts/build-wiki.mjs` builds a GitHub wiki from the same pages.
- Search keywords in the package metadata, the registry description and the README tagline.

### Changed

- The landing page no longer shows an old test count, the old "My Work" card or the old latency note.
- `CONTRIBUTING.md` explains set-up, the checks to run and how to write a documentation page.

### Fixed

- Redaction now covers every write path. The store redacts in `add()` and `update()`, so notes written through `POST /v1/memories` or the dashboard, edits, `import bundle` and `import claude-mem` no longer store secrets as typed. Names with a prefix (`MY_API_KEY`, `DB_PASSWORD`, `AUTH_TOKEN`), JSON-quoted keys (`{"password":"..."}`) and `secret_key` are matched, and a redacted JSON value stays valid JSON. An unclosed `<private>` tag drops the rest of the text.
- New `aletheia scrub [--apply]` redacts rows stored by earlier versions.
- `/healthz` and `aletheia doctor` no longer report `fts5: corruption found` while another process writes. `quick_check` was the cause: it failed about 1 time in 40 on a busy database, while real searches never failed. The check now retries and confirms with a real search query.
- `aletheia compress` no longer downloads an embedding model by default. Set `ALETHEIA_EMBED_FACTS=1` to embed new facts. `aletheia embed` and `aletheia search --semantic` still load the model because you ask for vectors.
- The MCP `search` tool description now says that an omitted `project` searches all projects, which is what the code does.
- `aletheia uninstall` no longer prints `(no aletheia hooks)` on a line that removes hooks.
- A read-scope token on the HTTP MCP endpoint could call `work_state_write`. It is now a write tool and needs a `sync` or `admin` token.

## [0.1.10] - 2026-10-29

### Added

- A **Home** page, now the default. It lists the projects you work in and, for one project, shows in plain words what Aletheia knows about it (readable titles, a Hide button, a box to save a note), the rules that apply (switches, a box to add a rule with example chips, and a preview-first button that writes them into each tool's file), the connected tools (on, needs setup or not installed, with the command to copy) and what happened lately. Every block has a hint and an example.

### Changed

- The tabs now use plain names: Home, Activity (was Work), Knowledge (was Memory), Rules and Connections (was Tools). The addresses (`#/work`, `#/memory`, `#/tools`) are unchanged. Sub-pages are renamed too: Needs a look, Hidden, Savings, Health checks, What tools receive and History.
- The project list in the header no longer shows worktree folders, temporary folders or folders with almost nothing in them. The Home page lists them under "other folders".
- Request cards on the Activity page show a readable title instead of pasted text, JSON or a row of numbers, and say "How we worked this out" and "What was done" instead of "Progress evidence" and "Came out of it".

## [0.1.9] - 2026-10-28

### Added

- A `context.facts` setting (`auto`, `on`, `off`, default `auto`) that controls which facts the session-start Facts section lists. `auto` lists only pinned, provider-extracted or confidence ≥ 0.6 facts, leaving the rule extractor's 0.45/0.35 output out; `on` keeps the historical behaviour; `off` hides the section. The measured context-economics line now counts only what is actually listed.
- `aletheia facts clean --ineligible-sources`, which also dismisses facts whose source episode kind is not `summary` or `note` with reason `quality:ineligible_source`.

### Changed

- The fact quality gate now rejects narration with a `narration` reason: first/second person, moment words (`now`, `today`, `yet`, `currently`, `right now`), progress/status phrases, session/meta references and imperative openings.
- The rule extractor's sentence splitter no longer cuts on a dot inside a version number, IP address, URL, file name or domain.

## [0.1.8] - 2026-10-28

### Added

- `aletheia facts clean --dry-run` (the default) and `aletheia facts clean --apply`. The command applies the fact quality gate to already-stored facts, reports counts and the first ten examples per rejection reason, and `--apply` dismisses the failures with `quality:<reason>` through the normal reversible dismissal path.
- A `facts.minConfidence` setting (0.3–0.9, default 0.4). The existing confidence calculation is unchanged; the floor only stops weaker facts from being stored.

### Fixed

- `scripts/release.mjs --prepare` corrupted the changelog when a release note contained the text `$` followed by a backtick: it expanded as a replacement pattern and copied the header into the note. Notes are now copied literally.

### Changed

- Fact extraction now keeps only assistant summaries and notes as eligible sources. User prompts and tool output/file contents (including raw back-filled transcripts) are no longer extracted into facts.
- Every candidate fact passes a quality gate before it is stored: balanced quotes and brackets, no escaped newlines/tabs, no code-like tokens (`$`, `->`, `::`, `=>`, braces, backticks, SQL or HTML tags), 3–40 words and at most 200 characters, a 1–8 word subject that is not a bare pronoun/demonstrative and does not start with a continuation word, and an object that does not end mid-clause. Each rejection returns a stable reason code and is counted.
- The session-start Facts section caps each fact line at 140 characters (dismissed facts were already skipped).
- The CI regression gate now uses a harder seeded corpus (near-duplicate distractors, answers ranked 3rd and 6th, 50,000 rows). Its baseline is Recall@5 0.90 and p95 latency about 7.8 ms, above the 5 ms floor, so a latency regression of more than 20% now fails the build too.
- The default test timeout is 20 s instead of 5 s, because three installer tests timed out on a slow Windows runner.

## [0.1.7] - 2026-10-28

### Added

- A recall and latency regression gate runs in CI on Linux: it fails a change that loses more than one point of Recall@5 on a seeded synthetic corpus. Its latency check is report-only below a 5 ms baseline.
- The test suite now runs in CI on Windows as well as Linux and macOS. On Windows, the hook-execution checks for Windsurf and Gemini CLI and one temp-folder cleanup check are skipped, and no real tool was tried there.

### Fixed

- On Windows, `aletheia uninstall codex` left its block in `~/.codex/config.toml`: the installer wrote the command path with TOML escapes, but the reader did not unescape them, so it did not recognise its own entry. The reader now parses TOML basic strings.

### Changed

- `session_start_context`, the SessionStart hook, `/v1/context`, `/api/hub/context` and `aletheia context` now return a compact index by default: recent memories are grouped by day and first file and printed one line each with no narrative, followed by session requests, facts and rules, plus a legend, a fetch-more hint and a measured context-economics line. The previous flat shape stays available through the `context.format = "classic"` setting.

## [0.1.6] - 2026-10-28

### Fixed

- The MCP `initialize` reply and `GET /v1/info` reported version 0.1.0 whatever the installed version. They now report the package version.
- The hook checker counted session-end rows from every tool for each tool, so a tool with no Stop hook run could still pass. It now counts only rows for that tool's own sessions, and accepts `--tool codex`.

### Changed

- Corrected the public hook claims: hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), all on the author's machine and one user; Cursor, Gemini CLI, Windsurf and OpenCode hooks have not run.

## [0.1.5] - 2026-10-28

### Changed

- A rule flagged for re-check now carries its reason and "Verify before applying." into synced rules files and into the session context an agent receives, not only into `list_rules`. The rule is still delivered. Reading a rules file back strips the note, so it never becomes part of the rule text.
- Recorded the first real-hook evidence: hooks ran in real Claude Code sessions on the author's machine over two days (prompts and tool events captured, secrets redacted, no leaks), and the hook checker now counts summary memories as the Stop/SessionEnd signal with the session-end table as a fallback.

## [0.1.4] - 2026-10-28

### Added

- A graph retrieval channel and entity pages, off by default behind a flag. On a synthetic test it found related
  memories that keyword search missed; it has not been measured on real data.
- Rule-based entity summaries and belief tracking. No model is used.
- A file-read gate and a smart outline for files.
- Rules keep their date, source and evidence. A rule made from an approved suggestion copies the suggestion's source ids
  and dated quotes; `add_rule` and `POST /api/hub/rules` accept evidence ids. Rules made before this have no evidence.
- A rule is flagged for re-check, with reasons, when an evidence fact is superseded or expired, an evidence memory is
  dismissed, a newer fact covers the same subject and predicate, or nobody confirmed it within the review window
  (`rules.reviewDays`, default 90). It is a flag, never a deletion: the rule stays on and keeps syncing.
- `POST /api/hub/rules/:id/confirm`, `aletheia rules confirm <id>` and the `confirm_rule` MCP tool (13 tools now) record
  that a rule is still right. `aletheia rules retire <id>` turns a rule off without deleting it.
- `GET /api/hub/rules` returns `evidence`, `last_confirmed_epoch`, `stale` and `reasons`, with `?stale=1` and
  `?older_than_days=N` filters. `aletheia rules lint` reports a stale rule as a warning.
- `aletheia rules diff` and `GET /api/hub/rules/diff` show, per tool file, rules only in the store, only in the file or
  worded differently, with file and line. Read-only. The Rules page shows how many tools are out of sync.
- `older_than_days` on the memory list, `/v1/search` and the `search` MCP tool, so pruning old memories is a query.
- `aletheia audit export` and `GET /v1/audit/export` (admin token) stream the sync audit log as JSONL or CSV.

### Changed

- Search is faster at 50,000 memories: project-scoped p95 fell from 67.5 ms to 32.7 ms on a synthetic test, and
  all-projects p95 is 58.6 ms. On the real LoCoMo set, Recall@5 did not change.
- `fact_history` and `GET /v1/facts` accept `as_of` as epoch milliseconds as well as ISO 8601.
- The README lists all 13 MCP tools.
- `list_rules` prints each rule's date, source, last-confirmed date and a `[re-check: reason]` marker. `get_observations`
  and the memory detail panel show the source (tool, session, origin) and the files a memory touched.

## [0.1.3] - 2026-10-27

### Added

- `GET /v1/facts` and the `fact_history` MCP tool: how a fact changed over time.
- Search by file: files are indexed, with `file` and `file_suffix` filters on search and in the MCP search tool.
- `work_state_write` and `work_state_read` MCP tools for named to-do lists per project.
- Folder context files and a connector verification status in the tools view and in doctor.
- `glama.json`, so the Glama listing can be claimed.
- A settings page in the Tools tab, with a settings API that validates every value and never returns the API key.
- A live feed, session pages and a context preview in the app.
- Query and result caching for search.
- Rule-based query expansion, round-level indexing, and `since` and `until` filters on search.

### Changed

- MCP tool definitions now carry annotations and parameter descriptions.
- The README platform badge says Linux and macOS, which CI covers.

## [0.1.2] - 2026-10-27

### Changed

- The npm package now ships code and licence files only. Version 0.1.1 also shipped the whole `docs/` tree by mistake.
- Search filters, OpenAPI document, MCP registry `server.json`, and a crash-safety test.

## [0.1.1] - 2026-10-27 [YANKED]

Withdrawn from npm and never tagged: the package also shipped the whole `docs/` tree by mistake. Version 0.1.2 replaced it.

### Added

- `docs/releasing.md`: versioning policy, the release sequence with the owner-only steps marked, and rollback notes.
- `scripts/release.mjs --prepare <version>` bumps `package.json` and dates the CHANGELOG section; `--verify` checks
  versions, the tag, tarball contents and size, and that README images are absolute https URLs.
- `.github/workflows/release.yml`: on a `v*` tag it tests, verifies, publishes to npm only when trusted publishing
  or `NPM_TOKEN` is set up, and creates the GitHub release.

### Changed

- README top block redone for the npm package page: centred logo, npm version badge, install and run lines, two
  screenshots and a link row, all with absolute URLs. The ten translations were not re-translated for it.

## [0.1.0] - 2026-10-27

First public release, published to npm as `aletheia-mem@0.1.0`. CI runs on Linux and macOS; Windows is not supported yet.

### Added

- Generated comparison, tool-support and measured-number tables. `scripts/gen-tables.mjs --check` fails when a
  marked block drifts from its source (`docs/28-competitor-report.json`, the installer registry, or
  `bench/results/`).
- README restructured with real badges only: licence, test workflow, last commit, stars, open issues, status, Bun
  version and the Linux-tested platform. A test rejects a forbidden badge or a hand-typed count.
- Issue forms for bugs, features and new hosts; a pull request template with the validation checklist; Contributor
  Covenant 2.1; and a security policy that names GitHub private vulnerability reporting.
- CI workflow that runs the test suite, the task checker, the table drift check and the documentation link checker
  on Linux only.
- `check:claims`, `check:links` and `check:tables` scripts.

## [0.1.0] — not released (2026-10-26)

Not tagged and not published. The feature set below exists in the repository and is covered by tests.

### Added

- **Local store and retrieval.** One SQLite database with WAL, FTS5 full-text search, hybrid BM25 plus dense
  retrieval with reciprocal-rank fusion, optional local ONNX embeddings and an optional cross-encoder reranker.
  Schema v3 with an additive migration.
- **Interfaces.** MCP over stdio, MCP over the Streamable HTTP transport with bearer tokens, a REST API under
  `/v1`, a CLI, and rules written into each tool's own instruction file.
- **Rules hub.** One rule set with project and global scopes, a managed block that never touches the user's own
  text, preview, backup, import back, and sync into nine tool formats.
- **Capture.** Installers for Claude Code, Command Code, Cursor, Codex CLI, Gemini CLI, Windsurf and OpenCode
  (MCP plus rules), with uninstall. Hooks redact secrets and `<private>` blocks before storage, spool when the
  database is unavailable, and always exit 0. Automatic capture is proven end to end for six hosts through the
  installed hook commands; no host application has been opened with a generated config.
- **Memory building.** Fact extraction with a strict validator, a resumable background queue, bi-temporal fact
  columns, supersession of contradicted facts without deletion, near-duplicate detection and a merge audit trail,
  importance scoring, decay and audited pruning, session/project/entity summaries, entities and alias resolution,
  project and global scopes, rule suggestions from corrections, transcript back-fill for Claude Code and Command
  Code, an output-language setting, provider presets with an ordered fallback chain and a concurrency cap.
- **One UI.** Work, Memory, Rules and Tools tabs. The Work tab is Aletheia's own view of captured sessions, facts
  and goals; the optional classic viewer is linked from Tools only when its database exists.
- **Aletheia Sync.** An append-only operation log with one result per operation, tombstones and compaction, purge,
  device pairing with revocable device tokens, scoped tokens with quotas and an append-only audit log, remote login
  for the Hub, and an optional end-to-end encryption mode that covers payloads but not metadata.
- **Remote MCP.** The read tools and, with a `sync` or `admin` token, the write tools over HTTP, with a per-token
  rate limit, project scope and an audit row per call.
- **Import and export.** A versioned JSONL bundle, Markdown export, a read-only repeatable claude-mem import, and
  reversible dismiss/restore across the store, CLI, MCP, REST and the UI.
- **Measurement.** A LoCoMo retrieval harness, a claude-mem baseline harness run in an isolated worker, and a
  50,000-row scale harness, with raw result files in `bench/results/`.
- **Documentation.** 30 numbered documents, the task system, the unverified list and a manual test script.

### Changed

- The Work tab replaced the iframe with Aletheia's own overview. The original built viewer remains available from
  Tools as an optional legacy page.
- The matrix and the README corrected stale capability rows: MCP over HTTP, hook capture for six hosts, entity
  rows, bi-temporal facts and self-hosted sync are built; answer accuracy is still not measured.
- Measured numbers in the README are generated from `bench/results/`, not copied from prose.

### Fixed

- Empty search results now say why they are empty.
- `aletheia doctor` reports database, FTS, vector and model health.
- An FTS `optimize` pass reduced the 50,000-row keyword p95 from 137.8 ms to 108.1 ms. The 50 ms target is still
  not met.
- Install and capture do not write into a project folder; a test compares the project tree byte for byte.
- The rule editor no longer nests labels inside its checkboxes.

### Security

- Redaction runs before storage and again before a sync operation leaves the device.
- Loopback bind by default; a non-loopback bind turns on Hub login and needs TLS at a proxy.
- Optional end-to-end encryption encrypts sync payloads on the device. Metadata stays visible.
- Audit rows contain ids, counts and tool names, never payloads or secrets.

### Known limits

- No host application has been opened with a generated hook configuration. Configs are fixture-tested only.
- macOS and Windows are untested; CI is Linux only.
- Answer accuracy is not measured. Recall@5 is retrieval, not correctness.
- The first local extraction run (Ollama `llama3.2:1b`, the `facts-v1` prompt) failed with HTTP 500 after
  4 min 41 s. The rule extractor added 1,672 facts and moved Recall@5 by +0.4 points, below the +5 target.
- Sync and E2EE are tested on loopback only. E2EE covers payloads, not metadata.
- Ten README translations are machine-translated, with no native review.

[Unreleased]: https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main
