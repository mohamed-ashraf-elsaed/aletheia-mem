# Privacy and redaction in Aletheia

<!-- description: What Aletheia stores and where, which secrets it redacts and which it misses, how private blocks work, what can leave your machine, and how to erase data. -->
<!-- keywords: aletheia privacy, redact secrets ai memory, private tag, erase memory with receipt, local-first ai memory, loopback only, no telemetry, aletheia security -->

Aletheia (aletheia-mem) stores your coding-session memory in a local SQLite file, listens on the loopback address only, has no telemetry and no account, and removes secrets and `<private>` blocks from captured text before it stores it. Redaction is pattern based, so it is not complete.

## What stays on your machine by default

- **Loopback only.** The server binds to `127.0.0.1`. `ALETHEIA_HOST` changes that. A non-loopback bind turns on Hub login with an admin token, and the server prints a warning unless you pass `--behind-tls` and put a TLS-terminating proxy in front. `ALETHEIA_API_KEY` adds an optional bearer key for the `/v1` routes.
- **No telemetry, no account.** The code makes no usage-reporting calls, and there is nothing to sign up for.
- **No model call.** The default provider is `none`. Extraction then uses a rule-based extractor and makes no network call.
- **Hooks stay quiet.** A hook never calls the network or a model. If anything inside it fails, it exits with status 0 so the host keeps working. If the database cannot be opened, the already-redacted item goes to a spool file and the next hook that can reach the database writes it:

```
{"kind":"memory","memory":{"project":"w","tool":"claude-code","sessionId":"s7","kind":"prompt","type":"note","title":"deploy with token=[redacted] now","narrative":"deploy with token=[redacted] now"},"at":1793303598934}
```

That line is the spool content after a hook ran against an unwritable database path. The secret was removed before it reached the disk.

## What is stored where

The data directory is `~/.aletheia`, or `ALETHEIA_DATA_DIR`. On POSIX systems Aletheia sets owner-only modes when it opens the store, and it prints a warning when it has to tighten one:

```
aletheia: data directory .../d mode 0775 -> 0700
aletheia: file .../d/hub.db mode 0644 -> 0600
```

```
700 d
600 d/hub.db
600 d/erasure.key
600 d/erasure-receipts/90cc8cbbd16c69ba.json
664 d/erasure-exports/erase-3b2071736f7713d7.jsonl
```

The database, its `-wal` and `-shm` files, the spool and the erasure key and receipts get mode 0600. The erasure export (see below) was 0664, and a few other database files such as `alerts.db` were 0644. The 0700 data directory keeps other users out of all of them. On Windows the mode step is skipped, and Windows' own file permissions (ACLs) apply.

`hub.db` holds the memories, facts, rules and settings. Everything is plain SQLite with no encryption at rest. Use disk encryption if you need it.

## What redaction removes

Before a captured text is stored, Aletheia first replaces every `<private>...</private>` block with `[private]`. Then it replaces text that matches these patterns with a marker such as `[redacted:github-token]`:

- Anthropic keys (`sk-ant-...`) and other `sk-...` keys of 20 or more characters, which covers OpenAI and OpenRouter.
- Stripe keys (`sk_live_`, `rk_test_` and so on), GitLab tokens (`glpat-`), npm tokens (`npm_`), GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), Slack tokens (`xoxb-` and relatives), AWS access key ids (`AKIA...`) and Google API keys (`AIza...`).
- JSON Web Tokens and PEM private key blocks.
- The password inside a URL, as in `https://user:secret@host`.
- `Authorization: Bearer <token>` values of 12 or more characters.
- A value of 6 or more characters after `password`, `passwd`, `secret`, `token` or `api_key`, joined by `:` or `=`.

The patterns are in [redact.mjs](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/redact.mjs). Real results:

```
"git clone https://user:hunter2pass@example.com/repo.git"  ->  "git clone https://user:[redacted]@example.com/repo.git"
"Authorization: Bearer abcdefghijklmnop1234"               ->  "Authorization: Bearer [redacted]"
"ghp_abcdefghijklmnopqrstuvwxyz0123456789"                 ->  "[redacted:github-token]"
"Use <private>my home address is 12 Elm St</private> for the demo"  ->  "Use [private] for the demo"
```

### Which paths redact

These paths redact before they store: hooks (`aletheia hook`), `aletheia capture`, `POST /v1/events`, `aletheia save`, the MCP `save_memory` tool, transcript import and `aletheia watch`, and rule evidence quotes. Fact extraction redacts again, once before it builds a prompt for a provider and once more before it stores each fact. Sync redacts every payload before it leaves the device.

These paths store the text exactly as given:

- `POST /v1/memories`, and the note box in the dashboard, which calls `POST /api/hub/memories`;
- edits made with `PATCH /api/hub/memories/<id>`;
- `aletheia import bundle` and `aletheia import claude-mem`;
- the text of a rule. `aletheia rules lint` warns when a rule looks like it holds a secret.

A test against a temporary store showed it. The same string sent to `/v1/events` was redacted, and sent to `/v1/memories` it was not:

```
rest save     deploy key is token=abcdef1234567890 for prod
events route  use token=[redacted] please
```

## Limits of redaction

Redaction is pattern based. It misses secrets that do not look like one of the patterns above. These gaps were observed with the shipped code:

- **JSON-quoted keys.** Tool input is stored as JSON text. A secret under a JSON key is not matched by the generic rule, because the quote sits between the key and the colon. This input was stored as typed: `{"password":"hunter2hunter2"}`. A secret that matches a vendor pattern, such as a GitHub token, is still caught inside JSON.
- **Prefixed variable names.** `API_KEY=...`, `token: ...` and `password: ...` are redacted. `MY_API_KEY=...`, `AUTH_TOKEN=...` and `DB_PASSWORD='...'` are not, because the keyword has to start at a word boundary and `_` counts as part of a word.
- **Short values.** A value shorter than 6 characters after a keyword is left alone.
- **Personal data.** Nothing matches email addresses, card numbers, national ids, names, addresses or hostnames. `4111 1111 1111 1111` passed through unchanged.
- **An unclosed `<private>` tag.** The block is dropped only when the closing tag is present. `Unclosed <private>this text has no closing tag` was stored whole.
- **Secrets inside tool output.** A tool call's input and output are stored together, cut to 1,500 characters in total. They are checked against the same patterns and nothing more.

Do not rely on redaction for material that must never be stored. Keep secrets in the environment, close every `<private>` tag, and exclude a project you do not want captured by setting `ALETHEIA_EXCLUDED_PROJECTS=name1,name2` in the environment the host runs in.

The Settings screen lists "Redact before storing" and "Excluded projects". The capture code does not read either value. Redaction is always on in the paths listed above, and exclusion works through the environment variable.

## What leaves your machine

Nothing leaves by default. The code reaches the network only in these cases, each of which you start:

- **A model provider.** If you set `ALETHEIA_PROVIDER` or `ALETHEIA_PROVIDERS`, extraction sends windows of stored summaries and notes (at most 20 episodes and 12,000 characters per call) to that provider. `local` presets such as Ollama point at loopback by default, `claude-cli` runs your `claude` command, and `openai` and `openrouter` send the text to those services. The Work-view refresh, the plain-language card text and `POST /api/hub/compress` also use a provider and send stored text. Those three paths do not run the redaction step again.
- **Sync.** Only after you pair a device with a hub you run. Payloads are redacted first. Optional end-to-end encryption hides payloads from the hub, but not metadata such as device id, operation kind, entity id, timing or size. See [Sync](../29-sync.md).
- **An export you share.** `aletheia export` writes a JSONL or Markdown file. Whatever you send on with it leaves with it.
- **An alert webhook** you add with `aletheia alerts add`.
- **The embedding model.** The first semantic search or `aletheia embed` downloads the model once. See [Search](../concepts/search.md#semantic-and-hybrid-search).

## Erase data with a receipt

`aletheia erase` removes memories, observations, episodes, facts, summaries and rule suggestions. Choose what to erase with `--project`, `--id` or `--before`. It first reports what it would touch, using ids and counts and never text:

```bash
aletheia erase --id 14
```

```
Erasure report for ids memory:14

  memories              1  ids 14
  observations          0
  episodes              0
  facts                 0
  summaries             0
  rule suggestions      0

Nothing was deleted. Add --apply to erase, export first with --export <file>.
Report only. Add --apply to erase.
```

The plan follows provenance. A memory's episode, an observation's facts and a fact's episode all join the same erasure. With `--apply`, Aletheia writes an export, deletes the rows in one transaction, purges the matching sync entities and device rows when a sync store exists, and writes a signed receipt:

```bash
aletheia erase --id 14 --apply
aletheia erase verify <receipt.json>
```

```
...
Pre-erase export: .../d/erasure-exports/erase-3b2071736f7713d7.jsonl
Erased {"memories":1,"observations":0,"episodes":0,"facts":0,"summaries":0,"ruleSuggestions":0}; sync entities purged 0, local sync rows 0.
Receipt: .../d/erasure-receipts/90cc8cbbd16c69ba.json
Verify: aletheia erase verify .../d/erasure-receipts/90cc8cbbd16c69ba.json
ok .../d/erasure-receipts/90cc8cbbd16c69ba.json
```

The receipt lists counts and ids, never content. It carries an HMAC-SHA256 signature made with a local key in `erasure.key`, so `erase verify` proves the receipt was not edited. It does not prove that the data is gone from the disk.

Know these limits before you rely on it:

- **The export holds more than you erased.** Erasing by `--id` or `--before` exports the whole store, every project and every rule. In the test above, erasing one memory wrote an export with 15 memories and 6 rules. `--project` limits the export to that project. The export file keeps the erased text, so delete it when you no longer need it, or pass `--export <path>` to choose where it goes.
- **Rules stay.** Erase does not delete rules or the evidence quotes attached to them.
- **Freed pages.** Aletheia does not run `VACUUM` or turn on SQLite's `secure_delete`. By SQLite's default behaviour, freed pages in `hub.db` and its write-ahead log are not overwritten at once. This was not tested here.

## Dismiss or erase

| | Dismiss | Erase |
|---|---|---|
| Command | `aletheia dismiss <id>` | `aletheia erase --apply` |
| Row removed | No, it is hidden | Yes |
| Reversible | Yes, `aletheia restore` | No, except by importing the pre-erase export |
| Receipt | No | Yes |

Use dismiss for a memory that is stale or wrong. Use erase for something that must not stay. `aletheia prune --apply` deletes dismissed rows without a receipt.

## Report a security problem

Use GitHub's private vulnerability reporting on the repository, as described in [SECURITY.md](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/SECURITY.md). Do not open a public issue with the details.

## Next steps

- [Memory model](../concepts/memory-model.md) - what is stored, and how dismiss and promote work.
- [Search](../concepts/search.md) - the one feature that can download a model.
- [Model providers](../guides/model-providers.md) - what each provider receives.
- [Sync](../29-sync.md) - end-to-end encryption and what it does not cover.
- [Backup, export and import](../guides/backup-export-import.md) - the export formats.
