# 7. Operations

## Requirements

- Bun >= 1.1 (tested on 1.3.10). Nothing to install: no dependencies.
- A claude-mem database. Without one the page loads and shows "Local work-state database is unavailable."
- For the refresh: `python3` (stdlib only) and either the `claude` CLI (logged in) or an OpenAI-compatible key.
- Linux or macOS. Windows is untested.

## Run

```bash
bun bin/aletheia-server.mjs
```

It prints the port, the database path, the data directory and whether the refresh is on.
Stop with Ctrl-C (SIGINT/SIGTERM close the database handles).

## Run as a user service (systemd)

`scripts/aletheia.service`:

```ini
[Unit]
Description=aletheia-mem
After=default.target

[Service]
WorkingDirectory=%h/Projects/aletheia-mem
ExecStart=%h/.bun/bin/bun bin/aletheia-server.mjs
Environment=ALETHEIA_PORT=37790
# Environment=ALETHEIA_PROVIDER=claude-cli
Restart=on-failure

[Install]
WantedBy=default.target
```

```bash
mkdir -p ~/.config/systemd/user
cp scripts/aletheia.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now aletheia
journalctl --user -u aletheia -f
```

## Sharing the original's ledger

By default the clone keeps its own ledger. To read what the original's refresh already produced, set
`ALETHEIA_LEDGER_DIR=~/.claude-mem/work-view`. Both servers then read the same files. Do not enable the
clone's refresh on that directory while the original's refresh is also on: two writers, one ledger. (A
refresh in one process refuses to start while another live pid holds `state: running`, but the check is a
courtesy, not a lock.)

## Security model

- Binds `127.0.0.1` only. Refuses any request whose peer, `Host` or forwarding headers say it is not local.
- POSTs must be same-origin JSON.
- The database is opened read-only with `query_only`. The server writes only under its data directory,
  plus two explicit user actions: **Load in Claude Code** appends one `@<rules file>` line to
  `ALETHEIA_CLAUDE_MD`, and saving a rule rewrites `ALETHEIA_RULES_FILE`.
- The file route serves only absolute, `..`-free paths with an allow-listed extension that exist as regular
  files, with `nosniff` and a sandbox CSP.
- Do not put the server behind a reverse proxy: the proxy headers make it refuse.
- The page and API expose your prompts and tool calls. Treat the port like a local password manager.

## Files and growth

| Path | Grows with | Safe to delete? |
|---|---|---|
| `<data>/overlay.db` | each rule or "finished" action | no: your saved rules live here |
| `<data>/work-view-reviews.db` | each checked card | yes (marks are lost) |
| `<ledger>/` | refreshes | yes; the next refresh rebuilds it (costs model calls) |
| `<data>/human-copy.json`, `human-copy-usage.jsonl` | model calls | yes |
| `<ledger>/failed-answers/` | refused model answers | yes |

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Page says the work-state database is unavailable | `CLAUDE_MEM_DB` wrong or claude-mem not installed. `ls ~/.claude-mem/claude-mem.db`. |
| 403 "available only on this computer" | You used a non-loopback host name, a proxy, or `0.0.0.0`. Use `http://localhost:<port>`. |
| 403 on a POST | Browser sent another `Origin` (a different port or host) or a non-JSON content type. |
| No agents shown, 0 observations | Running with `ALETHEIA_BUG_COMPAT=1`, or your database has no `observations` rows. |
| Cards but no progress meters | The refresh has not run. Set a provider, then check `<ledger>/refresh.json`. |
| `refresh.json` says `failed` | Read `error` and `steps`; look in `<ledger>/failed-answers/`. A provider error shows the CLI's first line. |
| `waiting-for-agent` | (original only) no logged-in agent CLI; the clone reports `failed` with the provider error instead. |
| Rule saved but Claude Code does not follow it | Click **Load in Claude Code**, or add `@<rules path>` to your CLAUDE.md yourself. |
| Port in use | `ALETHEIA_PORT=<n>`. |

## Answer-accuracy harness

`bench/accuracy.mjs` measures answer accuracy (not retrieval) with a fixed reader and a blind judge across four
arms: no-memory, full-context, retrieval and packed. It is not part of `bun test` or CI, and answer accuracy is
not measured until this harness is run. It makes model calls.

```bash
bun bench/accuracy.mjs --provider openai --model gpt-4o-mini --data /path/to/questions.json --out /tmp/accuracy.json
```

- `--data` is a local JSON array of `{ id, question, answer, evidence: [string] }` rows. The harness never
  downloads a dataset.
- `--provider` is `fake`, `local`, `openai`, `openrouter` or `claude-cli`, and `--model` names the model. The
  `openai` and `openrouter` providers read `ALETHEIA_OPENAI_API_KEY`; `local` reads `ALETHEIA_LOCAL_BASE_URL`.
  The `fake` provider makes no network call and exists for tests.
- Each of the four arms makes two model calls per question (one reader, one judge), so a run costs model calls.
- `--limit N` runs the first N questions. `--dry-run` prints the plan and the number of model calls and stops
  without calling a model.
- The output JSON records the provider, model, dataset sha256, reader and judge prompt versions and hashes, the
  date and machine, plus per-arm exact-match and judge accuracy with 95% bootstrap confidence intervals. The
  judge prompt is blind: it never sees the system name.
