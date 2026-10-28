# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). This file is built from the git
history.

## [Unreleased]

### Added

- `aletheia facts clean --dry-run` (the default) and `aletheia facts clean --apply`. The command applies the fact quality gate to already-stored facts, reports counts and the first ten examples per rejection reason, and `--apply` dismisses the failures with `quality:<reason>` through the normal reversible dismissal path.
- A `facts.minConfidence` setting (0.3–0.9, default 0.4). The existing confidence calculation is unchanged; the floor only stops weaker facts from being stored.

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

## [0.1.1] - 2026-10-27

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
