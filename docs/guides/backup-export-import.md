# Back up, export and move Aletheia memory between machines

<!-- description: Export Aletheia memory and rules as JSONL or Markdown, copy hub.db safely with its WAL files, import on another machine, and erase with a receipt. -->
<!-- keywords: aletheia backup, export ai memory, import memory bundle, copy sqlite wal database, move memory to another machine, erase memory receipt -->

Aletheia (aletheia-mem) stores everything in one SQLite database, `hub.db`, in `~/.aletheia` by default. You can export your memories and rules as a portable file, copy the database itself, or keep two machines in step with sync.

Each method keeps different things, so pick by what you need to move.

## Pick a method

| Method | What it carries | Use it when |
|---|---|---|
| Export bundle (`.jsonl`) | Memories and rules | You move to another machine or tool and want a small, readable file. |
| Export Markdown | Rules and notes, as text | You want to paste your memory into a chat tool or read it. |
| Copy `hub.db` | Everything in the database: memories, facts, episodes, settings, dismissals | You want an exact backup or a full move. |
| Sync | Live changes between devices | You use two machines every day. See [Sync](../29-sync.md). |

## Export a bundle

```bash
aletheia export --out bundle.jsonl
aletheia export --project shop --out shop.jsonl
aletheia export --events --out everything.jsonl
```

Without `--out` the bundle goes to the terminal. The first line is a manifest; then comes one line per memory and one per rule. This is the manifest line from a test hub:

```json
{"type":"manifest","format":"aletheia-bundle","version":1,"exportedAt":"2026-10-29T19:46:20.267Z","project":null,"counts":{"memories":5,"rules":2}}
```

What the bundle holds, from [the export code](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/store.mjs):

- Memories: project, kind, type, title, subtitle, text, facts, concepts, files, tool, session id, pinned flag, origin and creation time.
- Rules: scope, text, enabled flag, tool filter and source. `--project` filters memories only. Every export contains all rules.
- Tool events (`kind` event) only with `--events`. They are left out by default.
- Prompts are included by default.

What it does not hold: facts, episodes, settings, sync data, and which memories you dismissed. A dismissed memory is still exported. In a test, `aletheia dismiss 1` followed by an export still showed all 5 memories.

In the dashboard, open Knowledge, click **Import and export**, then **Export bundle (.jsonl)** or **Export Markdown**.

## Export Markdown

```bash
aletheia export --format markdown --out memory.md
```

The file starts with your enabled rules, then one section per project, newest first. It skips events and prompts and lists at most 500 items per project. It is for reading and pasting. It is not an import format.

## Import a bundle

```bash
aletheia import bundle bundle.jsonl
```

```json
{
  "memories": {
    "added": 5,
    "skipped": 0
  },
  "rules": {
    "added": 2,
    "skipped": 0
  },
  "errors": []
}
```

Import is idempotent. Run it again and every row is skipped, because the store compares project, kind, title and text.

Memory ids and rule ids are new in the target hub. The importer stops with `Not an aletheia bundle` when the first line is not a manifest, and with a version message when the bundle is newer than the program. A bad line inside the file is reported in `errors` and the rest still imports.

In the dashboard, use **Import bundle** in the same panel. After a large import, run:

```bash
aletheia optimize
```

It rebuilds the full-text index segments. Search stays correct without it. The step keeps query time low.

## Copy hub.db safely

`hub.db` runs in write-ahead log (WAL) mode. Recent writes can live in `hub.db-wal`, not in `hub.db`. A copy of `hub.db` alone can be missing everything.

I checked this on a test hub after a few commands. The data directory held:

```text
hub.db       4096 bytes
hub.db-shm  32768 bytes
hub.db-wal  1079472 bytes
```

A copy of `hub.db` alone opened with `no such table: memories`. SQLite's documentation says the same: the WAL file is part of the database and must stay with it when you copy or move it; a database separated from its WAL can lose committed transactions or become corrupt (https://www.sqlite.org/wal.html, fetched 2026-10-29).

Do not assume that stopping the server empties the WAL. In my test the CLI commands had all exited and the `-wal` file was still there. Use one of these methods.

### Method 1: copy all three files together

Stop the server and every hook-driven tool, then copy `hub.db`, `hub.db-wal` and `hub.db-shm` as a set. In the test, a copy of all three opened with all rows present.

```bash
cp ~/.aletheia/hub.db ~/.aletheia/hub.db-wal ~/.aletheia/hub.db-shm /backup/
```

### Method 2: make a consistent copy with SQLite

These work while the server runs. I ran each one on a test hub and the copy held every row; `PRAGMA integrity_check` returned `ok`.

```bash
sqlite3 ~/.aletheia/hub.db ".backup /backup/hub.db"
sqlite3 ~/.aletheia/hub.db "VACUUM INTO '/backup/hub.db'"
```

Aletheia does not ship the `sqlite3` program. If you do not have it, Bun can run `VACUUM INTO`:

```bash
bun -e 'import { Database } from "bun:sqlite"; new Database(process.argv[1], { readonly: true }).exec(`VACUUM INTO "${process.argv[2]}"`)' ~/.aletheia/hub.db /backup/hub.db
```

`VACUUM INTO` needs a target that does not exist yet, or one that is empty (https://www.sqlite.org/lang_vacuum.html, fetched 2026-10-29). The `.backup` command is documented in the SQLite shell page (https://www.sqlite.org/cli.html, fetched 2026-10-29).

### Method 3: checkpoint, then copy

`aletheia migrate` uses this approach when it backs up before a schema change: it runs `PRAGMA wal_checkpoint(TRUNCATE)` and then copies the main file. You can do the same by hand:

```bash
sqlite3 ~/.aletheia/hub.db "PRAGMA wal_checkpoint(TRUNCATE);"
cp ~/.aletheia/hub.db /backup/hub.db
```

In the test the command printed `0|0|0` and the copy held every row. A write that lands between the checkpoint and the copy is not in the copy.

### Related files

The data directory also holds `sync.db`, `team.db`, `alerts.db`, `watcher.db`, `erasure.key` and folders for spool, erasure receipts and models. Copy them only if you use those features. Keep `erasure.key` private: it signs erasure receipts.

## Move to another machine

1. Install the same or a newer version of Aletheia on the new machine. A database with a newer schema than the program stops with `This database is schema v<N>; this build understands up to v<M>.` Check a database with `aletheia migrate --dry-run`.
2. Move the data with a bundle (see "Export a bundle" and "Import a bundle" above) or with a copy of the database files.
3. Run `aletheia doctor`. It checks the data folder and database file permissions (folder `0700`, files `0600`) and reports loose ones.
4. Install your tools again. Do not copy `install-manifest.json` or `aletheia.bundle.mjs` from the old machine. The hook commands in tool settings hold absolute paths to Bun and to that bundle.

   ```bash
   aletheia install claude-code --write
   ```

5. Write your rules into the tool files again. See [Write rules once](write-rules-once.md).

## Erase memory and keep a receipt

`aletheia erase` removes rows and signs a receipt. It reports first. It deletes only when you add `--apply`.

```bash
aletheia erase --project shop
```

```text
Erasure report for project "shop"

  memories              5  ids 1, 2, 3, 4, 5
  observations          0
  episodes              0
  facts                 0
  summaries             0
  rule suggestions      0

Nothing was deleted. Add --apply to erase, export first with --export <file>.
Report only. Add --apply to erase.
```

Pick what to erase with `--project <name>`, `--id 12,fact:3` or `--before 2026-01-31`. Apply with an export and a receipt path:

```bash
aletheia erase --project shop --apply --export pre-erase.jsonl --receipt receipt.json
aletheia erase verify receipt.json
```

```text
Pre-erase export: pre-erase.jsonl
Erased {"memories":5,"observations":0,"episodes":0,"facts":0,"summaries":0,"ruleSuggestions":0}; sync entities purged 0, local sync rows 0.
Receipt: receipt.json
Verify: aletheia erase verify receipt.json
ok receipt.json
```

Without `--export` and `--receipt`, the files go to `erasure-exports/` and `erasure-receipts/` in the data directory. The receipt lists counts and ids, never content, and carries an HMAC-SHA256 signature made with `erasure.key`. Verification needs that key.

Limits:

- Erase does not delete rules. It does delete rule suggestions for the scope you pick.
- It deletes rows. I found no `VACUUM` or secure-delete step in the erase code. SQLite's `secure_delete` setting is normally off, so deleted text can stay in free pages of the file until they are reused (https://www.sqlite.org/pragma.html, fetched 2026-10-29). If you must remove text from the file, make a `VACUUM INTO` copy after the erase and use that copy.
- A backup or bundle you made earlier still holds the data.

## Next steps

- [Sync](../29-sync.md) - keep two machines in step instead of moving files.
- [Privacy and redaction](../concepts/privacy.md) - what is redacted before it is stored.
- [Run as a service](run-as-a-service.md) - stop and restart the server around a copy.
- [Troubleshooting](troubleshooting.md) - database locked, corruption and permission problems.
