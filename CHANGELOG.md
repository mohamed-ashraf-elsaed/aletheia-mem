# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html). This file is built from the git
history and the validated tasks in [docs/tasks/TASKS.md](docs/tasks/TASKS.md).

## [Unreleased]

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
