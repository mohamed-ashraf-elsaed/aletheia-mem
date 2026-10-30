# Troubleshooting Aletheia: port in use, MCP closed, no memories and more

<!-- description: Fix common Aletheia problems: EADDRINUSE, MCP CONNECTION_CLOSED, an old dashboard, E404 on install, missing memories, locked or corrupt database. -->
<!-- keywords: aletheia troubleshooting, EADDRINUSE aletheia, mcp CONNECTION_CLOSED aletheia, aletheia doctor, aletheia no memories, database is locked aletheia, aletheia dashboard old version -->

This page lists problems people hit with Aletheia (aletheia-mem) and the exact command that fixes each one. Every fix was checked against the code, and most were reproduced in a temporary home folder with a temporary data directory.

Start with `aletheia doctor`. It checks the host and port, the server, the hook entries, the spool, file permissions, the last capture, the job queue and the database.

## Port 37790 is already in use (EADDRINUSE)

Cause: another process holds the port. The usual one is the service you already started, or a second `aletheia-server`.

```text
error: Failed to start server. Is port 37999 in use?
 syscall: "listen",
   errno: 0,
    code: "EADDRINUSE"
```

The number in the message is the port you configured. Fix: find the owner, or use another port.

```bash
ss -ltnp | grep 37790
systemctl --user status aletheia
ALETHEIA_PORT=37791 aletheia-server
```

On macOS use `lsof -nP -iTCP:37790 -sTCP:LISTEN` instead of `ss` (not tested on a Mac). If you run a service, change its port with `ALETHEIA_PORT=37791 aletheia service install --write`. See [Run as a service](run-as-a-service.md).

## `aletheia-server --help` started the server

Cause: the server binary has no help flag. It reads only `--host` and `--behind-tls`, ignores anything else and starts. I ran it with `--help` on a test port and it printed:

```text
aletheia-mem listening on http://localhost:38417
  source db : ~/.claude-mem/claude-mem.db (read-only)
  data dir  : ~/.aletheia
  refresh   : off (set ALETHEIA_PROVIDER=claude-cli|openai to enable)
  extraction: worker on (rule-based)
```

Fix: press Ctrl-C. For command help, run `aletheia` with no arguments. It prints the full command list. Settings are environment variables; see the [Configuration reference](../reference/configuration.md).

## Claude Code shows the aletheia MCP server as CONNECTION_CLOSED

Cause: the entry in `~/.claude.json` holds the absolute path of Bun and of `mcp.mjs`. If that path no longer exists, the process cannot start and Claude Code reports the connection as closed. This happens after the package moves, for example when you switch Node versions or the npm prefix. In a test I pointed the entry at a missing path and started it by hand:

```text
error: Module not found "/old/node/lib/node_modules/aletheia-mem/bin/mcp.mjs"
```

Fix: write the entry again. The installer replaces the `aletheia` entry with the current paths.

```bash
aletheia install claude-code --verify
aletheia install claude-code --write
```

The first command printed `drift  mcp` for the broken entry. The second wrote only `~/.claude.json` and left the hooks as they were. Start a new Claude Code session afterwards. `aletheia connect claude-code` is not the fix: for Claude Code it prints a `claude mcp add` command instead of editing the file.

To check an entry by hand, read the `command` and `args` under `mcpServers.aletheia` in `~/.claude.json` and confirm both files exist. The MCP server was listed by the real Claude Code 2.1.312 CLI on 2026-10-27.

## The dashboard looks old after an upgrade

Three causes, in the order to check them.

1. The installed package is older than you think. More than one install can be on the path.

   ```bash
   aletheia --version
   npm ls -g aletheia-mem
   which -a aletheia
   ```

2. The running server still has the old code. The server reads `index.html` once and keeps it in memory, so a running server serves the old page until it restarts.

   ```bash
   systemctl --user restart aletheia
   curl -s http://127.0.0.1:37790/v1/info
   ```

   The `/v1/info` answer includes `"version"`, the version of the code the server runs. If you set `ALETHEIA_API_KEY`, send `Authorization: Bearer <key>`.

3. The browser kept old files. The page itself is sent with `Cache-Control: no-store`. The JavaScript and CSS files under `/work-view/` carry no cache header, so a browser can reuse an old copy. Hard reload the page (Ctrl+Shift+R, or Cmd+Shift+R on macOS).

After an upgrade, also run `aletheia install <tool> --write` for each tool, so the hook bundle in the data directory is rebuilt.

## `npm install -g aletheia-mem@X` returns E404 right after a release

Cause: the registry does not list that version yet. I could not observe a release delay, but a version the registry does not have gives the same message:

```text
npm error code E404
npm error 404 No match found for version 0.1.999
```

Fix: ask the registry what it has, then wait and retry.

```bash
npm view aletheia-mem version
npm view aletheia-mem@0.1.10 version
npm install -g aletheia-mem@latest
```

If `npm view` does not show the new version, wait a few minutes. `@latest` installs whatever the registry shows as the newest.

## Hooks are installed but no memories appear

Work through these checks in order.

1. Read the doctor rows.

   ```bash
   aletheia doctor | grep -E "hooks|spool|last capture|server"
   ```

   `hooks claude-code  5/5` means the five hook entries are in the settings file. It does not mean a hook ran. `last capture` shows the time of the newest stored prompt, event or summary. `no capture yet` means nothing has been stored.

2. Run a hook by hand. It should store one memory and exit 0.

   ```bash
   echo '{"hook_event_name":"UserPromptSubmit","session_id":"s-1","cwd":"/tmp/demo","prompt":"Add a health endpoint"}' | aletheia hook claude-code UserPromptSubmit
   aletheia search health
   ```

   ```text
   #1 2026-10-29 [note] Add a health endpoint (demo, claude-code)
   ```

3. Look at the spool. When the database cannot be opened, a hook writes the item to `<data dir>/spool/hook-spool.jsonl` and the next successful hook replays it. In a test with a broken database path the doctor row read `FAIL spool  1 item(s) at .../spool/hook-spool.jsonl`, and the next good hook emptied it. A spool that stays full points at a database problem; see the sections below.

4. Check that the host and your shell use the same data directory. A hook reads `ALETHEIA_DATA_DIR` from the environment of the tool that starts it. If you set it only in your shell, the hook and the dashboard use different databases.

5. Check excluded projects. A project named in `ALETHEIA_EXCLUDED_PROJECTS` is skipped before any row is written, and the hook still exits 0. Only the environment variable is read. I found no code that reads the excluded-projects value saved on the Settings page.

6. Check what the tool can send. Command Code has no prompt hook and no session-end hook, so prompts are not captured there. `SessionStart` only injects context and stores no row.

7. Codex: Codex requires non-managed hooks to be reviewed and trusted before they run. Its documentation says new or changed hooks are marked for review and skipped until trusted, and that you inspect and trust them with `/hooks` in the CLI (https://developers.openai.com/codex/hooks, fetched 2026-10-29). I did not test whether a reinstall that changes the hook command asks for a new review.

8. Other tools. Cursor, Gemini CLI and Windsurf: config written from docs, not tested on a real install. No hook ran in Cursor, Gemini CLI, Windsurf or OpenCode. OpenCode has MCP and rules only.

Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine.

Facts are separate from memories. A memory appears as soon as a hook stores it. Facts need extraction, which the server worker or `aletheia compress` runs after a session ends.

## The rules page is empty

Cause: rules live in the Aletheia database. They are not read from `CLAUDE.md`, `AGENTS.md` or any other tool file. A new install has no rules, and `aletheia install` writes an empty block (`0 rules`).

Fix: add rules, or import them from a file you already have.

```bash
aletheia rules list
aletheia rules import --tool claude-code --global
aletheia rules import --tool claude-code --dir /path/to/project
```

In the dashboard use Rules, then **Import**. Details are in [Write rules once](write-rules-once.md).

## The session-start block is too large

Cause: the block that a hook injects is capped at 6,000 characters. It holds pinned memories (up to 50), the 20 newest memories, up to 5 recent session requests, up to 10 facts and every enabled rule. The code cuts the text at the end, and the rules come near the end, so a large block can cut off rules first.

Fix: measure it, then shrink it.

```bash
aletheia context --project shop | wc -c
```

- Unpin memories you no longer need, in the Knowledge tab.
- Hide a memory: `aletheia dismiss <id>`. Undo with `aletheia restore <id>`.
- Retire a rule you do not need: `aletheia rules retire <id>`.
- Set **Facts in context** to `off` in Connections, then Settings. The default `auto` already hides low-confidence rule-extracted facts.

The Connections page **What tools receive** shows what a tool gets. See [Session-start context](../concepts/session-context.md).

## Facts look like noise

Cause: the extractor stored sentences that read like narration or code. A quality gate now checks new facts. Older rows can still fail it.

Fix: dry run first. The command is a dry run until you add `--apply`.

```bash
aletheia facts clean
aletheia facts clean --apply
aletheia restore fact:42
```

```text
Dry run: 0 of 0 fact(s) fail the quality gate.
Add --apply to dismiss the failures (reversible with aletheia restore fact:<id>).
```

On a store with failing facts the command prints a count per reason and up to 10 examples for each. The `--dry-run` flag is not read; leaving `--apply` off is the dry run. The gate rules are in [Facts and contradictions](../33-facts.md).

## Database is locked or busy

Cause: SQLite allows one writer at a time. Another process holds a write lock for longer than Aletheia waits. The store waits 3 seconds. I held a write transaction open from another process and ran `aletheia save`:

```text
SQLiteError: database is locked
```

The call returned after about 3 seconds. Once its store is open, a hook lowers the wait to 50 milliseconds and spools the item instead of failing the session.

Fix: find and end the process that holds the lock. Common ones are a long import, a backup tool, or a `sqlite3` shell with an open transaction. Do not put the data directory on a network drive. SQLite's documentation says WAL mode does not work over a network filesystem and allows one writer at a time (https://www.sqlite.org/wal.html, fetched 2026-10-29). Run `aletheia doctor` afterwards. The spool row shows whether hooks were waiting.

## `/healthz` returns 503, or doctor shows `FAIL database`

Cause: the database or search-index check failed. There are two very different reasons.

**A false alarm while something writes.** Before this change, `quick_check` could print `fts5: corruption found reading blob ...` for a healthy index while a hook or sync wrote at the same moment. On the author's service it appeared in about 1 of 40 `/healthz` calls; a snapshot copy of the same database passed `quick_check` and the FTS integrity check, and real search queries never failed (0 errors in 400,000 queries during the test). The health check now retries three times, and if only search-index rows still complain it runs a real search query. When that works it reports `quick_check ok (FTS integrity check skipped while writes were in progress; FTS query answered)`. If your version is older, upgrade.

**A damaged index.** I reproduced this error by damaging a search-index block in a copy of a test database. It stays after the retries and a real search query fails too:

```text
FAIL database             fts5: corruption found reading blob 687194767361 from table "memories_fts"
```

`aletheia optimize` fails on such an index with the same message. I do not know what damages an index on a real machine.

Fix: back up first. Stop the server and copy `hub.db`, `hub.db-wal` and `hub.db-shm` together; see [Backup, export and import](backup-export-import.md). Then rebuild the two search indexes from the stored rows. The `sqlite3` shell often lacks FTS5, so use Bun:

```bash
cat > rebuild-fts.mjs <<'EOF'
import { Database } from "bun:sqlite";
const db = new Database(process.argv[2]);
db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild')");
db.exec("INSERT INTO facts_fts(facts_fts) VALUES('rebuild')");
db.close();
EOF
bun rebuild-fts.mjs ~/.aletheia/hub.db
aletheia doctor | grep -E "database|fts"
```

SQLite documents the `rebuild` command as rebuilding an index from the content table (https://www.sqlite.org/fts5.html, fetched 2026-10-29). In my test, `database` went from FAIL to `quick_check ok` after the rebuild. If `quick_check` still fails, restore from a backup or from an export bundle.

## doctor shows `FAIL server`

Cause: the server is not running, or it listens on a port other than the one doctor checks. Doctor reads `ALETHEIA_PORT` from your shell. Hooks and the CLI do not need the server, so this row alone is not a capture problem.

Fix: start the server or the service, or set the port.

```bash
ALETHEIA_PORT=37791 aletheia doctor
```

An `HTTP 503` detail means the server answered and its health check failed; see the section above.

## A line says `mode 0644 -> 0600`

```text
aletheia: file ~/.aletheia/hub.db mode 0644 -> 0600
```

Cause: Aletheia tightens the data directory to `0700` and the database files to `0600` when it opens them, and prints one line when it changes a mode. It is a notice, not an error. `aletheia doctor` has a `permissions` row that reports loose modes.

## Windows notes

- Continuous integration runs the test suite on Windows (GitHub's `windows-latest` runner, Bun 1.3.10). Two hook checks (Windsurf and Gemini CLI) and one temp-folder cleanup check are skipped there. No real tool was tried on Windows. Treat Windows as tested in CI only.
- `aletheia service install` writes nothing on Windows. Start `aletheia-server` yourself or use Task Scheduler.
- `aletheia doctor` skips the permissions check on Windows, because there are no POSIX mode bits.
- The CLI runs on Bun, not Node. Install Bun 1.1 or newer.

## Collect a useful bug report

Open an issue at https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues and choose the Bug report template. Collect this first:

```bash
aletheia --version
bun --version
uname -a
aletheia doctor | sed "s#$HOME#~#g"
aletheia install --list
```

- Add the host tool and its version, for example `claude --version`.
- Add the exact command, what you expected and what happened, with the error text.
- `aletheia doctor --json` gives the same checks as JSON.
- Replace your home folder with `~`, as the `sed` above does. Doctor output holds file paths and your user name. It is built not to include API keys, but read it before you paste it.
- Do not paste `~/.claude.json`, a settings file or an environment dump without removing tokens. Remove prompts and `<private>` content.
- For a security problem, do not open a public issue. Use GitHub's private vulnerability reporting on the repository (Security tab), as `SECURITY.md` describes.

## Next steps

- [Run as a service](run-as-a-service.md) - ports, logs and restarts for the server.
- [Backup, export and import](backup-export-import.md) - copy the database files safely before a repair.
- [Tools overview](../tools/overview.md) - what was checked on a real install, per tool.
- [Reference: hooks](../reference/hooks.md) - the events each hook handles.
