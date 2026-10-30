<p align="center"><img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/aletheia-mem/main/docs/assets/logo.png" alt="Aletheia: a network brain with a stack of memory layers" width="280"></p>

<h1 align="center">Aletheia</h1>

<p align="center"><strong>A free, local memory and rules hub for AI coding tools.</strong><br>One store on your machine. Any tool reads it over MCP, REST or the CLI.<br>Persistent memory for Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf and OpenCode: a local, tool-neutral alternative to claude-mem.</p>

<div align="center">

[![npm version](https://img.shields.io/npm/v/aletheia-mem)](https://www.npmjs.com/package/aletheia-mem)
[![Glama score](https://glama.ai/mcp/servers/mohamed-ashraf-elsaed/aletheia-mem/badges/score.svg)](https://glama.ai/mcp/servers/mohamed-ashraf-elsaed/aletheia-mem)
[![Socket](https://badge.socket.dev/npm/package/aletheia-mem)](https://socket.dev/npm/package/aletheia-mem)
[![Licence](https://img.shields.io/github/license/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/LICENSE)
[![Tests](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml/badge.svg)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/actions/workflows/test.yml)
[![Last commit](https://img.shields.io/github/last-commit/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/commits/main)
[![Stars](https://img.shields.io/github/stars/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/stargazers)
[![Open issues](https://img.shields.io/github/issues/mohamed-ashraf-elsaed/aletheia-mem)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues)
![Status](https://img.shields.io/badge/status-alpha-orange)
![Bun](https://img.shields.io/badge/bun-%3E%3D1.1-black)
![Platform](https://img.shields.io/badge/platform-linux%20%7C%20macOS%20%7C%20Windows%20%28CI%20tested%29-lightgrey)

[![As seen on Open Source Alternatives](https://www.opensourcealternatives.to/badge-osa.svg)](https://www.opensourcealternatives.to)

</div>

Install and run. Bun 1.1 or newer is required; the CLI runs on Bun, not Node.

~~~bash
npm install -g aletheia-mem
aletheia-server
# open http://127.0.0.1:37790
~~~

<p align="center"><img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/aletheia-mem/main/docs/screenshots/memory-dark.webp" alt="The Memory tab: search, edit, pin and export what Aletheia stored" width="48%"> <img src="https://raw.githubusercontent.com/mohamed-ashraf-elsaed/aletheia-mem/main/docs/screenshots/work-dark.webp" alt="The Work tab: captured sessions, facts and goals" width="48%"></p>

<p align="center"><a href="https://mohamed-ashraf-elsaed.github.io/aletheia-mem/">Docs site</a> · <a href="https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/06-frontend.md">Frontend guide</a> · <a href="https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/CHANGELOG.md">Changelog</a> · <a href="https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues">Issues</a></p>

**Status: alpha.** The memory engine and the installers work in tests. The real Claude Code, Command Code, Codex CLI and
OpenCode listed the generated MCP config. Hooks have run in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), all on the author's machine and one user, with secrets redacted and no leaks found by the checker. No hook has run inside Cursor, Gemini CLI, Windsurf or OpenCode yet, and answer accuracy is not measured. CI runs the test suite on Linux, macOS and Windows. On Windows, two hook checks (Windsurf and Gemini CLI) are skipped and no real tool was tried there, so Windows is tested in CI only.

<!-- claims:begin -->
**1,493 tests** — 0 failures (run `bun test`).
<!-- claims:end -->

[English](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/README.md) · [中文](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/i18n/README.zh.md) · [Español](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/i18n/README.es.md) · [Português (Brasil)](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/i18n/README.pt-br.md) · [日本語](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/i18n/README.ja.md) · [Deutsch](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/i18n/README.de.md) · [Français](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/i18n/README.fr.md) · [한국어](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/i18n/README.ko.md) · [हिन्दी](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/i18n/README.hi.md) · [العربية](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/i18n/README.ar.md) · [Русский](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/i18n/README.ru.md).
Machine translations live in `docs/i18n/`; English is canonical. No translation has had native review.

## What it is

Aletheia is a free, local memory and rules hub for AI coding tools. One SQLite store is read by any tool over MCP,
REST or the CLI, and your rules are written into each tool's own instruction file. It is built to give Claude Code,
Codex CLI, Cursor, Gemini CLI, Windsurf and OpenCode one shared, persistent memory; the sections below say which of
them has been checked on a real install.

Every coding agent forgets between sessions, and each one remembers differently. Aletheia keeps the memory and the
rules once, on your machine, and lets each tool read them in the format it already understands. There is no account,
no telemetry and no network call unless you configure a model provider. It listens on loopback only.

## Install in three commands

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

Open <http://127.0.0.1:37790>. Needs [Bun](https://bun.sh) 1.1 or newer. To install the published package instead,
run `npm install -g aletheia-mem`, then start it with `aletheia-server`. There are no runtime dependencies to
install.

The first screen has five tabs: **Home** (start here: pick a project and see what Aletheia knows about it, its rules and its connected
tools, in plain words), **Activity** (Aletheia's own view of the requests and sessions your tools worked on), **Knowledge** (search, edit, pin, hide, export),
**Rules** (write once and sync) and **Connections** (installer status and audit).

## How capture works

```bash
aletheia install claude-code --write
aletheia install cursor --write
aletheia install --list          # capability level and verification per tool
```

Without `--write` the command is a dry run. It prints every file it would change and writes nothing. Each changed
file gets a timestamped backup. Hooks call the installed `aletheia` command, redact secrets and `<private>` blocks
before storing, spool to disk if the database is unavailable, and always exit 0 so they never block the host.
Compression is queued, not run inside the hook. Details and the exact hook list per host: [docs/25](docs/25-installers.md).

## Which tools it connects to

Aletheia does not depend on any one tool. It speaks MCP (stdio and HTTP), a plain REST API and a CLI, and it writes
the instruction file each tool already reads. What has and has not been checked:

| Check | Result |
|---|---|
| MCP server against the official MCP SDK client | Passes (protocol versions 2025-11-25 to 2024-11-05) |
| Config formats for Claude Code, Command Code, Cursor, Codex CLI, Gemini CLI, Windsurf, OpenCode | Written from official docs fetched 2026-10-26 and tested against fixtures. The real CLI listed the aletheia MCP server for Claude Code, Command Code, Codex CLI and OpenCode on 2026-10-27; Cursor, Gemini CLI and Windsurf are **Not tested on a real install.** |
| Claude Desktop MCP config | Documented and merge-tested against a fixture; not opened in the app |
| Rules files: `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.cursor/rules/*.mdc`, `.windsurf/rules/*.md`, Copilot, Aider | Written and tested in temp folders (`docs/verification/rules-targets.md`) |
| Any of the above **on a real install of that tool** | MCP config was read back by the real CLI for Claude Code, Command Code, Codex CLI and OpenCode on 2026-10-27. Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), all on the author's machine and one user (prompts and tool events captured, secrets redacted, no leaks). No hook ran inside Cursor, Gemini CLI, Windsurf or OpenCode. |
| Automatic capture through a tool's hooks | Built for Claude Code, Command Code, Cursor, Codex CLI, Gemini CLI and Windsurf. Each installed hook command is exercised end to end in a temp HOME with a recorded payload. Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine; Cursor, Gemini CLI, Windsurf and OpenCode hooks have not run. OpenCode is MCP+rules. |

<!-- gen:tools -->
| Tool | Level | Verification | Hook events installed |
|---|---|---|---|
| claude-code | full | MCP connection 2.1.312 on 2026-10-27; hooks ran in real sessions over two days of use; one user on one machine | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| command-code | full | MCP connection 1.88.1 on 2026-10-27; hooks ran in one short session; one user on one machine | SessionStart, PostToolUse, Stop |
| cursor | full | config written from docs, not tested on a real install | sessionStart, beforeSubmitPrompt, postToolUse, afterAgentResponse, stop, sessionEnd |
| codex | full | MCP connection 0.130.0 on 2026-10-27; hooks ran in one interactive session (reviewed once with /hooks); one user on one machine | SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd |
| gemini-cli | full | config written from docs, not tested on a real install | SessionStart, BeforeAgent, AfterTool, AfterAgent, SessionEnd |
| windsurf | full | config written from docs, not tested on a real install | pre_user_prompt, post_run_command, post_write_code, post_cascade_response |
| opencode | mcp+rules | MCP connection 1.18.33 on 2026-10-27; hooks not run | none (MCP and rules only) |

_Generated from src/hub/install.mjs via `aletheia install --list`. A row says MCP connection when the real CLI listed the server. Hooks have run in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine; Cursor, Gemini CLI, Windsurf and OpenCode hooks have not run._
<!-- /gen:tools -->

## Measured numbers

On LoCoMo, claude-mem 15.2.0 as shipped vs this project. **These are retrieval numbers, not answer accuracy.**

<!-- gen:bench -->
| Run | Questions | Recall@5 | MRR | ms/query |
|---|---|---|---|---|
| claude-mem 15.2.0 (as shipped), raw turns — measured-by-us | 1,536 | 36.0% | 0.285 | p50 1,699 ms, p95 2,824 ms (idle, 40 queries) |
| Raw turns, all 10 conversations | 1,536 | 57.4% | 0.497 | 3.72 |
| Dataset facts, all 10 | 1,536 | 64.8% | 0.591 | 5.53 |
| Dataset facts, 3 conversations | 383 | 67.4% | 0.620 | 5.80 |
| Dataset facts, 3 conversations, + rerank | 383 | 73.9% | 0.686 | 251.16 |
| Dataset facts, all 10, + rerank | 1,536 | 72.3% | 0.680 | 646.19 |
| Our rule-extracted facts, all 10 | 1,536 | 57.7% | 0.492 | 4.94 |

_Retrieval only: Recall@5 asks whether the gold evidence is in the top five results. It is not answer accuracy. Every row is measured-by-us on the same LoCoMo questions; no vendor-claimed benchmark number is in this table. Generated from bench/results/2026-10-26/ (bench/claude-mem-baseline.mjs, raw-turns.json (hybrid), dataset-facts.json (hybrid+facts), dataset-facts-3-rerank.json (hybrid+facts), dataset-facts-3-rerank.json (hybrid+facts+rerank), dataset-facts-rerank.json (hybrid+facts+rerank), our-facts-rules.json (hybrid+facts)); re-run with `bun scripts/compare-bench.mjs`._
<!-- /gen:bench -->

Read the table this way:

- **Recall@5 is retrieval.** It asks whether the gold evidence is in the top five results. It is not a judgment of
  whether an answer was right.
- **Answer accuracy is not measured.** There is no reader or judge harness yet.
- **The gap is not 2×** when both systems receive the same extracted facts. The speed difference is larger than the
  quality difference.
- **The first local extraction run failed.** Ollama `llama3.2:1b` answered a trivial call, but the `facts-v1` prompt
  over a two-turn window returned HTTP 500 after 4 min 41 s. No fact was extracted from that run.
- **Our rule extractor does not reproduce the fact gain.** It added 1,672 facts and moved Recall@5 from 57.3% to
  57.7%; the dataset's own facts added 7.3 points. Method, raw files and the negative result:
  [bench/results](bench/results/).

## How it compares

<!-- gen:capabilities -->
| Capability | Aletheia (today) | claude-mem | Mem0 | Zep/Graphiti | Supermemory | Basic Memory |
|---|---|---|---|---|---|---|
| Local-first | yes | yes | yes OSS | partial (Graphiti only) | yes self-host | yes |
| Free | yes | yes OSS | yes OSS | partial (Graphiti free) | yes OSS | yes OSS |
| No account | yes | yes local | yes OSS | yes Graphiti | yes self-host | yes |
| MCP | yes stdio + HTTP | yes | yes | partial (reference servers) | yes | yes |
| REST | yes `/v1` | yes worker API | yes | yes | yes | partial |
| CLI | yes | yes `npx` | partial | no | partial | yes |
| Rules sync to tool files | yes 9 targets | no | no | no | no | partial (AGENTS.md) |
| Import/export between tools | partial (own bundle + claude-mem) | partial (export/import) | partial (platform migration) | partial | partial | yes Markdown |
| Hook capture | yes six hosts, fixture-tested; no host opened | yes | no | no | no | partial |
| Vector search | partial (optional ONNX) | yes Chroma | yes | yes | yes | yes |
| Graph / entity memory | partial (entity rows exist; graph retrieval) | no | yes | yes | UNVERIFIED | yes wikilinks |
| Temporal reasoning | partial (bi-temporal facts, invalidation; as-of query) | partial (dates) | yes | yes | yes | partial |
| Team sharing | partial (self-hosted sync and devices; team mode) | partial (paid) | yes paid | yes paid | yes paid | no |
| Benchmark published and reproducible | partial (retrieval yes; answer no) | no | vendor only | vendor only | vendor only | no |
| Languages supported | 11 (English + 10 machine translations; no native review) | 29 modes, 32 READMEs | SDK | SDK | SDK | SDK |

_Competitor cells are copied from each project's own public documentation, fetched 2026-10-26. Aletheia cells were updated 2026-10-26 from tested features; installer sources are in `docs/25-installers.md`. Cells the source did not state read UNVERIFIED._
<!-- /gen:capabilities -->

## Sync and remote MCP

Both are self-hosted and free; neither is tested across two real machines.

- **Aletheia Sync** is an append-only operation log with one result per operation, device pairing, tombstones,
  compaction, purge and scoped tokens. Optional end-to-end encryption encrypts payloads on the device before they
  are sent; **it does not hide metadata** such as device id, operation kind, entity id, timing or ciphertext size.
  Unencrypted accounts keep plaintext payloads on the hub. Tested on loopback only. [docs/29](docs/29-sync.md)
- **Remote MCP** serves the read tools (and, with a `sync` or `admin` token, the write tools) over the MCP Streamable
  HTTP transport. Each call needs a bearer token, is rate-limited and is written to an append-only audit row.
  TLS is delegated to a reverse proxy or tunnel; OAuth is not built. [docs/30](docs/30-remote-mcp.md)

## Interfaces

| Interface | Where | Use |
|---|---|---|
| MCP (stdio) | `bun bin/mcp.mjs` | the 13 MCP tools below (read and write) |
| MCP (HTTP) | sync hub `/mcp` | the same tools with a bearer token and per-token scope |
| REST | `/v1/memories`, `/v1/search`, `/v1/timeline`, `/v1/observations/batch`, `/v1/context`, `/v1/events`, `/v1/info`, `/v1/work` | scripts, CI, any language; optional `ALETHEIA_API_KEY` bearer key |
| CLI | `bin/aletheia.mjs` | hooks, shell, cron, sync |
| Files | rules sync | each tool's own instruction file |

### MCP tools

| Tool | Purpose | Access |
|---|---|---|
| `search` | Search shared memory | read |
| `timeline` | Show context around a memory | read |
| `get_observations` | Get full memory text by id | read |
| `save_memory` | Save a memory | write |
| `session_start_context` | Load session start context | read |
| `fact_history` | Show how a fact changed | read |
| `list_rules` | List standing rules | read |
| `add_rule` | Add a standing rule | write |
| `confirm_rule` | Confirm a rule is still right | write |
| `dismiss_memory` | Dismiss a memory | write |
| `restore_memory` | Restore a dismissed memory | write |
| `work_state_write` | Write a work-state list | write |
| `work_state_read` | Read a work-state list | read |

## Configuration

All settings are environment variables. The defaults are safe for a single-user machine.

| Variable | Default | Meaning |
|---|---|---|
| `ALETHEIA_PORT` | `37790` | Listen port. |
| `ALETHEIA_HOST` | `127.0.0.1` | Bind address. A non-loopback bind turns on Hub login. |
| `ALETHEIA_DATA_DIR` | `~/.aletheia` | Everything this project writes, including `hub.db`. |
| `ALETHEIA_HUB_DB` | `<data dir>/hub.db` | The shared memory store. |
| `ALETHEIA_API_KEY` | empty | Bearer key required on `/v1/*` when set. |
| `CLAUDE_MEM_DB` | `~/.claude-mem/claude-mem.db` | claude-mem's database (read-only; importer and optional legacy viewer). |
| `ALETHEIA_RULES_FILE` | `<data dir>/MY-RULES.md` | The legacy Work view's rules file. |
| `ALETHEIA_PROVIDER` | `none` | `none`, `claude-cli` or an OpenAI-compatible provider. |
| `ALETHEIA_PROVIDERS` | empty | Ordered fallback chain, for example `ollama,openai`. |
| `ALETHEIA_OPENAI_BASE_URL`, `_API_KEY`, `_MODEL` | OpenRouter URL, empty, empty | For `openai` and human copy. |
| `ALETHEIA_OUTPUT_LANGUAGE` | empty | Language for extracted facts and summaries. |
| `ALETHEIA_BUG_COMPAT` | off | `1` reproduces the original's empty observation half. |
| `ALETHEIA_TOOL`, `ALETHEIA_CWD` | | MCP server: names the calling tool and default project. |

## Limits and unverified claims

This list is the honest half of the README.

- MCP config was listed by the real CLI for Claude Code, Command Code, Codex CLI and OpenCode on 2026-10-27. Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), all on the author's machine and one user; Cursor, Gemini CLI, Windsurf and OpenCode hooks have not run. Cursor, Gemini CLI and Windsurf remain "config written from docs, not tested on a real install."
- CI runs the test suite on Linux, macOS and Windows (GitHub's windows-latest runner, Bun 1.3.10). On Windows, the hook-execution checks for Windsurf and Gemini CLI and one temp-folder cleanup check are skipped, and no real tool was tried. The install smoke test runs on Linux and macOS, and the benchmark gate on Linux only.
- Answer accuracy is not measured. Recall@5 is retrieval, not whether an answer was correct.
- The 1B-model extraction run failed; facts from our own extractor were measured with the rule extractor only.
- Sync and E2EE are tested with temp data dirs and a loopback hub. No real tunnel or second host was used.
- E2EE covers payloads, not metadata.
- At 50,000 synthetic rows, keyword search p95 is 32.7 ms project-scoped and 58.6 ms across all projects (measured-by-us, `bun bench/scale.mjs 50000 20000 --index tuned --queries 200 --seed 1`, Linux). The 50 ms target is met for project-scoped search.
- The 10 README translations are machine-translated. No native speaker has reviewed them.
- "Works with <tool>" is not claimed for any tool. Only a real install test would justify it.

## Layout

```
bin/            server, CLI, MCP server, sync hub, legacy Work ledger CLI
src/
  server.mjs app.mjs source.mjs config.mjs humancopy.mjs      server and the legacy Work API
  readmodel/ ledger/ refresh/ store/ http/                     legacy Work internals
  hub/            store (memories, FTS5, rules, bundles)  rules-sync  tools  importers  capture  compress  mcp  routes  sync
public/         the one UI (index.html, one-ui.*, tabs/, work-view.js);
                work.html and assets/ are the optional legacy viewer
public-hub/     the old Memory Hub assets, still served at /hub/app.js
prompts/ vendor/ the original's skill prompts and Python scripts
test/           the test suite and a synthetic fixture database
docs/           the documents
```

## Documentation

The full documentation is at <https://mohamed-ashraf-elsaed.github.io/aletheia-mem/docs/>. The Markdown in `docs/` is
canonical.

1. **Get started:** [Introduction](docs/start/introduction.md) · [Installation](docs/start/installation.md)
   · [Quickstart](docs/start/quickstart.md) · [How it works](docs/start/how-it-works.md)
   · [Dashboard](docs/start/dashboard.md) · [FAQ](docs/start/faq.md)
2. **Concepts:** [Memory model](docs/concepts/memory-model.md) · [Rules](docs/concepts/rules.md)
   · [Search](docs/concepts/search.md) · [Session-start context](docs/concepts/session-context.md)
   · [Privacy](docs/concepts/privacy.md) · [Facts](docs/33-facts.md) · [Glossary](docs/concepts/glossary.md)
3. **Connect your tools:** [Overview](docs/tools/overview.md) · [Claude Code](docs/tools/claude-code.md)
   · [Command Code](docs/tools/command-code.md) · [Codex CLI](docs/tools/codex.md) · [Cursor](docs/tools/cursor.md)
   · [Gemini CLI](docs/tools/gemini-cli.md) · [Windsurf](docs/tools/windsurf.md) · [OpenCode](docs/tools/opencode.md)
   · [Claude Desktop](docs/claude-desktop.md) · [Other tools](docs/tools/other-tools.md)
4. **Guides:** [Migrate from claude-mem](docs/guides/migrate-from-claude-mem.md)
   · [Write rules once](docs/guides/write-rules-once.md) · [Back up, export, import](docs/guides/backup-export-import.md)
   · [Run as a service](docs/guides/run-as-a-service.md) · [Model providers](docs/guides/model-providers.md)
   · [Troubleshooting](docs/guides/troubleshooting.md) · [Sync](docs/29-sync.md) · [Remote MCP](docs/30-remote-mcp.md)
   · [Team mode](docs/31-team.md) · [Requests and goals](docs/32-requests.md)
5. **Reference:** [CLI](docs/reference/cli.md) · [MCP tools](docs/reference/mcp-tools.md)
   · [Configuration](docs/reference/configuration.md) · [Hooks](docs/reference/hooks.md) · [HTTP API](docs/03-http-api.md)
   · [Installers](docs/25-installers.md) · [Rules targets](docs/verification/rules-targets.md)
6. **Compare:** [Aletheia vs claude-mem](docs/compare/aletheia-vs-claude-mem.md)
   · [Other memory tools](docs/compare/memory-tools.md) · [Claude Code memory options](docs/compare/claude-code-memory.md)
7. **Project:** [Benchmarks](docs/project/benchmarks.md) · [Status and limits](docs/project/status-and-limits.md)
   · [Dependencies and licences](docs/dependencies.md)
8. **Internals:** [Architecture](docs/01-architecture.md) · [Data model](docs/02-data-model.md)
   · [Frontend](docs/06-frontend.md) · [Operations](docs/07-operations.md)

AI tools can read [llms.txt](https://mohamed-ashraf-elsaed.github.io/aletheia-mem/llms.txt), or
[llms-full.txt](https://mohamed-ashraf-elsaed.github.io/aletheia-mem/llms-full.txt) for every page in one file.

## Contributing

The most useful contribution is a report from a real install: open an issue with the tool, its version, the command
you ran and what the tool did. See [CONTRIBUTING.md](CONTRIBUTING.md). Run `bun test` and
`bun scripts/gen-tables.mjs --check` before a pull request. A new runtime dependency needs a reason.

## Licence

Apache-2.0. See [NOTICE.md](NOTICE.md) for what comes from claude-mem. Not affiliated with or endorsed by the
claude-mem authors or Anthropic.

## Author

Made by [Mohamed Ashraf Elsaed](https://mohamedashrafelsaed.com), technical lead and backend architect in Cairo. Project page and more tools: [mohamedashrafelsaed.com/projects/aletheia/](https://mohamedashrafelsaed.com/projects/aletheia/).
