# Aletheia configuration reference: environment variables, settings and data directory

<!-- description: Every Aletheia environment variable with its default, the runtime settings and where they are stored, and the files in the data directory. -->
<!-- keywords: aletheia configuration, aletheia environment variables, ALETHEIA_DATA_DIR, aletheia settings, facts.minConfidence, context.facts, aletheia data directory -->

Aletheia (aletheia-mem) is configured in two ways: environment variables read at start-up, and a small set of runtime settings stored in the hub database. This page lists both, and the files that appear in the data directory.

Defaults come from [src/config.mjs](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/config.mjs) and [src/hub/settings.mjs](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/settings.mjs). Command output on this page was produced on 2026-10-29 by version 0.1.10 in a temporary home and data directory. A command shown without output was not run.

## Set an environment variable

Set a variable in the shell that starts the command, or in the service unit that starts the server. A hook command runs with the environment of the host that starts it. If you use a custom `ALETHEIA_DATA_DIR`, set it in the host's environment too, or hooks write to the default directory.

```
$ ALETHEIA_DATA_DIR=/srv/aletheia ALETHEIA_PORT=37800 aletheia-server
```

## Server and network

| Variable | Default | Meaning |
|---|---|---|
| `ALETHEIA_HOST` | `127.0.0.1` | Bind address for `aletheia-server`. A non-loopback value turns on dashboard login. `--host` overrides it. |
| `ALETHEIA_PORT` | `37790` | Dashboard and API port. `aletheia doctor` checks `/healthz` on this port. |
| `ALETHEIA_BEHIND_TLS` | unset | `1` says a reverse proxy ends TLS. `--behind-tls` does the same. |
| `ALETHEIA_API_KEY` | empty | When set, the `/v1` API and the `/mcp` route on the main server need `Authorization: Bearer <key>`. |
| `ALETHEIA_EXTRACTION_WORKER` | unset | `1` starts the extraction worker when the server is embedded elsewhere. `aletheia-server` always starts it. |
| `ALETHEIA_AUTO_REFRESH` | `true` | `false` turns off the periodic model refresh. It runs only when a provider is set. |
| `ALETHEIA_REFRESH_CHECK_MS` | `600000` | How often the server checks whether a refresh is due. |
| `ALETHEIA_POLL_MS` | `1000` | How often the server re-reads the claude-mem database for the Activity page. |

## Paths and files

| Variable | Default | Meaning |
|---|---|---|
| `ALETHEIA_DATA_DIR` | `~/.aletheia` | Everything Aletheia writes lives here. If only `~/.work-view-local` exists, that folder is used. |
| `ALETHEIA_HUB_DB` | `<data>/hub.db` | The main store. |
| `ALETHEIA_SYNC_DB` | `<data>/sync.db` | The sync hub's log, tokens and audit. |
| `ALETHEIA_SYNC_CLIENT_DB` | `<data>/sync-client.db` | This device's replica, outbox and cursor. |
| `ALETHEIA_SYNC_HOST`, `ALETHEIA_SYNC_PORT` | `127.0.0.1`, `37791` | Where `bin/aletheia-sync.mjs` listens. |
| `ALETHEIA_TEAM_DB` | `<data>/team.db` | Teams, members and the shared board. |
| `ALETHEIA_ALERTS_DB` | `<data>/alerts.db` | Alert rules and their delivery queue. |
| `ALETHEIA_WATCH_DB` | `<data>/watcher.db` | Transcript offsets for `aletheia watch`. |
| `ALETHEIA_ERASURE_KEY` | `<data>/erasure.key` | The HMAC key that signs erasure receipts. |
| `CLAUDE_MEM_DB` | `~/.claude-mem/claude-mem.db` | The claude-mem database. It is only read. |
| `ALETHEIA_LEDGER_DIR` | `<data>/ledger` | Ledger files used by the model refresh and `bin/ledger.mjs`. |
| `ALETHEIA_RULES_FILE` | `<data>/MY-RULES.md` | The older rules file that the Load in Claude Code action points at. |
| `ALETHEIA_CLAUDE_MD` | `~/.claude/CLAUDE.md` | The file that action appends one `@<rules file>` line to. |

## Capture and privacy

| Variable | Default | Meaning |
|---|---|---|
| `ALETHEIA_EXCLUDED_PROJECTS` | empty | Comma-separated project keys that are never captured. Matching is exact and case-insensitive. `*` excludes every project. |
| `ALETHEIA_TOOL` | unset | MCP stdio only. Names the caller in saved memories. |
| `ALETHEIA_CWD` | the working directory | MCP stdio only. Sets the default project. |

Redaction has no switch. See [Privacy and redaction](../concepts/privacy.md).

## Extraction and model providers

With no provider, Aletheia extracts facts with a rule-based extractor and makes no model call. See [Model providers](../guides/model-providers.md).

| Variable | Default | Meaning |
|---|---|---|
| `ALETHEIA_PROVIDER` | `none` | `none`, `local`, `openai`, `openrouter` or `claude-cli`. |
| `ALETHEIA_PROVIDERS` | empty | An ordered fallback chain of presets: `ollama`, `lmstudio`, `llamacpp`, `local`, `openai`, `openrouter`, `claude-cli`, `anthropic-compatible`. It replaces `ALETHEIA_PROVIDER` when set. |
| `ALETHEIA_MODE` | `code` | Extraction mode: `code`, `chill`, `language-en` or `language-es`. |
| `ALETHEIA_OUTPUT_LANGUAGE` | empty | Language tag for facts and summaries. Empty follows the mode. `aletheia language set` sets it per project. |
| `ALETHEIA_EXTRACT_MODEL`, `ALETHEIA_SUMMARY_MODEL` | empty | Model for fact extraction and for summaries. |
| `ALETHEIA_OPENAI_API_KEY` | empty | Key for the `openai` and `openrouter` providers. |
| `ALETHEIA_OPENAI_BASE_URL` | `https://api.openai.com/v1/chat/completions` | Endpoint for OpenAI-style providers. |
| `ALETHEIA_OPENAI_MODEL` | empty | Default model when no stage model is set. |
| `ALETHEIA_LOCAL_BASE_URL` | `http://127.0.0.1:11434/v1/chat/completions` | Endpoint for the `local` provider. |
| `ALETHEIA_ANTHROPIC_BASE_URL` | empty | Gateway URL for the `anthropic-compatible` preset. It has no default. |
| `ALETHEIA_CLAUDE_BIN` | `claude` | The CLI the `claude-cli` provider runs. |
| `ALETHEIA_PROVIDER_TIMEOUT_MS` | `60000` | Time limit for one model request. |
| `ALETHEIA_MAX_CONCURRENT` | `1` | Most model requests in flight at once. |
| `ALETHEIA_PROVIDER_COOLDOWN_MS` | `60000` | How long a failing provider in a chain is skipped. |
| `ALETHEIA_FACT_MAX_EPISODES` | `20` | Most episodes in one extraction batch. |
| `ALETHEIA_FACT_CHAR_BUDGET` | `12000` | Most characters in one extraction batch. |
| `ALETHEIA_PRICE_IN_PER_1K`, `ALETHEIA_PRICE_OUT_PER_1K` | `0` | Your price per 1000 tokens, used for cost estimates. Aletheia sets no vendor price. |
| `ALETHEIA_EMBED_FACTS` | unset | `1` lets `aletheia compress` create embeddings for new facts. Off by default, because the first use downloads a model. |

## Optional embeddings

Semantic search needs the optional package `@huggingface/transformers`. The first use downloads the model (about 35 MB per the source comment) into `<HOME>/.aletheia/models`. That cache is not under `ALETHEIA_DATA_DIR`.

- `ALETHEIA_TRANSFORMERS_FROM`: a folder whose `node_modules` holds the package.
- `ALETHEIA_EMBED_MODEL`: only changes the model name shown by `aletheia doctor` and `/healthz`. The embedder in the code reads no variable and uses `Xenova/bge-small-en-v1.5`.

## Sync passphrases and test variables

- `ALETHEIA_SYNC_PASSPHRASE`: the passphrase for the `aletheia sync` encryption commands. `--passphrase` overrides it.
- `ALETHEIA_SYNC_OLD_PASSPHRASE`, `ALETHEIA_SYNC_NEW_PASSPHRASE`: used by `aletheia sync change-passphrase`.
- `ALETHEIA_FAKE_RESPONSE`, `ALETHEIA_FAKE_FILE`, `ALETHEIA_FAKE_DELAY_MS`: feed the `fake` provider that the tests use.
- `WORK_STATE_TEAM_MODE` (`1`) and `ALETHEIA_BUG_COMPAT` (`1`): legacy switches on the claude-mem source reader.

## Runtime settings

Runtime settings live in the `settings` table of `hub.db`, under the key `ui.settings.<name>`, as JSON. They survive a restart. There is no command-line command for them. Change them in the dashboard under Connections, then Settings, or with `PUT /api/hub/settings`. A value outside its range is refused with a `400` and a message.

| Key | Type | Default | Allowed | Effect |
|---|---|---|---|---|
| `facts.minConfidence` | number | `0.4` | 0.3 to 0.9 | Facts below this confidence are rejected when stored and by `aletheia facts clean`. |
| `context.facts` | enum | `auto` | `auto`, `on`, `off` | Facts in the session-start context. `off` lists none. `on` lists up to 10 active facts. `auto` lists a fact only if it came from a provider, has confidence 0.6 or more, or comes from a pinned observation. |
| `rules.reviewDays` | integer | `90` | 7 to 730 | Days after which an unconfirmed rule gets a re-check flag. |

The form lists seven more keys: `provider`, `providers`, `factBudget.maxEpisodes`, `factBudget.maxChars`, `redaction`, `excludedProjects` and `apiKey`. They are saved in the table, but in version 0.1.10 I found no code that reads the saved value. The active values come from the environment variables above, and redaction always runs. A fresh hub shows placeholder values for them in the form (`1`, `100`, `false`), which are not the active values.

```
$ curl -s -X PUT http://127.0.0.1:37790/api/hub/settings -H "Content-Type: application/json" \
    -d '{"facts.minConfidence":0.6,"context.facts":"on","rules.reviewDays":30}'
{"settings":[...],"saved":["facts.minConfidence","context.facts","rules.reviewDays"]}
$ curl -s -i -X PUT ... -d '{"facts.minConfidence":2,"context.facts":"maybe"}'
HTTP/1.1 400 Bad Request
{"error":"facts.minConfidence must be a number between 0.3 and 0.9 context.facts must be one of auto, on, off"}
```

Both calls ran against a temporary server on another port. The rows were stored as `ui.settings.context.facts = "on"`, `ui.settings.facts.minConfidence = 0.6` and `ui.settings.rules.reviewDays = 30`.

## The data directory

Aletheia keeps the data directory at mode `0700` and its databases at `0600`, and repairs looser modes with a one-line message on stderr. `aletheia doctor` reports them. This is what a data directory held after running `save`, `install claude-code --write`, a hook that could not reach the store, `alerts add`, `sync pair`, `sync status`, `team create`, `watch --once`, `service install --write` and `erase --apply`:

```
alerts.db              spool
alerts.db-shm          sync-client.db
alerts.db-wal          sync-client.db-shm
aletheia.bundle.mjs    sync-client.db-wal
erasure-exports        sync.db
erasure-receipts       sync.db-shm
erasure.key            sync.db-wal
hub.db                 sync.db.aletheia-bak-2026-10-29T19-49-58-125Z
hub.db-shm             team.db
hub.db-wal             team.db-shm
install-manifest.json  team.db-wal
service-manifest.json  watcher.db
```

- `hub.db` holds memories, facts, rules, the extraction queue and the settings table. `-wal` and `-shm` are SQLite's write-ahead files.
- `spool/hook-spool.jsonl` holds redacted hook items the store could not take. The next hook drains it. See [Hooks reference](hooks.md).
- `install-manifest.json` and `aletheia.bundle.mjs` come from `aletheia install --write`: the files written per tool, and the single-file runner a hook loads.
- `sync.db` appeared with a one-time copy `sync.db.aletheia-bak-<time>`. `sync-client.db` is this device's replica.
- `erasure.key`, `erasure-receipts/` and `erasure-exports/` appear after `aletheia erase --apply`.
- Starting `aletheia-server` adds `overlay.db` and `work-view-reviews.db`.

See [Operations](../07-operations.md) for backup and growth, and [Data model](../02-data-model.md) for the tables.

## Next steps

- [CLI reference](cli.md) - the commands that read these paths and settings.
- [Hooks reference](hooks.md) - how the spool and the excluded-project list work.
- [Model providers](../guides/model-providers.md) - choose and test a provider.
- [Run as a service](../guides/run-as-a-service.md) - set these variables in a service unit.
