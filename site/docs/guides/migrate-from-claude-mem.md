# Migrate from claude-mem to Aletheia

<!-- description: Import your claude-mem observations, summaries and prompts into Aletheia, run both side by side, switch the Claude Code hook and roll back. -->
<!-- keywords: migrate from claude-mem, import claude-mem, claude-mem alternative, claude-mem database, switch from claude-mem, claude-mem to aletheia -->

Aletheia (aletheia-mem) can copy your claude-mem history into its own store with one command, `aletheia import claude-mem`. The import opens the claude-mem database read-only, so your old memory stays where it is.

This page covers the import, what maps to what, running both tools side by side, switching the Claude Code hook, and rolling back.

## Import your claude-mem history

Run the importer. With no flags it reads `~/.claude-mem/claude-mem.db`, the default database path in the claude-mem installation page (https://docs.claude-mem.ai/installation, fetched 2026-10-29).

```bash
aletheia import claude-mem
```

The command prints how many rows it added and how many it skipped. This output comes from a small test database (2 observations, 1 summary, 1 prompt) in a temporary home folder, not from real data.

```json
{
  "observations": {
    "added": 2,
    "skipped": 0
  },
  "summaries": {
    "added": 1,
    "skipped": 0
  },
  "prompts": {
    "added": 1,
    "skipped": 0
  }
}
```

Run it again and every row is skipped. The import is idempotent: the store drops a memory when a memory with the same project, kind, title and text already exists.

```bash
aletheia import claude-mem
# "observations": { "added": 0, "skipped": 2 } ... "prompts": { "added": 0, "skipped": 1 }
```

### Flags

| Flag | Effect |
|---|---|
| `--path <file>` | Read a database at another path. The default is `~/.claude-mem/claude-mem.db`, or the value of `CLAUDE_MEM_DB`. |
| `--no-prompts` | Skip the `user_prompts` table. Observations and summaries are still imported. |
| `--project <name>` | Import only rows whose project is `<name>`. |

A missing file stops the command with `No claude-mem database at <path>.` The command prints a stack trace after that line; the message is the part to read.

### Import from the dashboard

Open the dashboard, go to the Knowledge tab, click **Import and export**, then click **Import from claude-mem**. The section appears only when the database file exists. I checked these labels in a real browser against a temporary server.

### Schema check

Before it reads any row, the importer checks that the tables `sdk_sessions`, `observations`, `session_summaries` and `user_prompts` exist and have the columns it needs. If claude-mem changes its schema, the import stops with a message that names the missing table or column, instead of importing nothing. Aletheia's tests use a synthetic database with the table shapes of claude-mem 15.2.0. I did not run the importer against a real claude-mem 15.x database for this page.

## What maps to what

| claude-mem | Aletheia memory | Notes |
|---|---|---|
| `observations` row | kind `observation` | Keeps type (`bugfix`, `feature`, `refactor`, `change`, `discovery`, `decision`; other types pass through), title, subtitle, narrative, facts, concepts, and the union of files read and modified. |
| `session_summaries` row | kind `summary`, type `note` | The fields request, investigated, learned, completed, next steps and notes become one text with a bold label per field. An empty summary is skipped. |
| `user_prompts` row | kind `prompt` | The prompt text becomes the title and the body. |

Every imported memory keeps its original timestamp, the project name, the session id and the tool name from `platform_source` (default `claude`). The `origin` field records the source row, for example `claude-mem:obs:3`.

The importer reads only those four tables. Every other table in the claude-mem database is ignored, and so are claude-mem's settings and its vector index. claude-mem's installation page lists `uv` as the provider of Python for Chroma's embedding service (https://docs.claude-mem.ai/installation, fetched 2026-10-29). Aletheia does not import vectors. Imported memories are found by keyword search unless you install the optional embedding package and run `aletheia embed`.

### The import redacts secrets

The store redacts every text it saves, imports included, so a fake AWS key id or a `password=` value in claude-mem's database is stored as `[redacted:...]`. Versions before this change copied the text exactly. If you imported with an older version, redact those rows in place:

```bash
aletheia scrub            # count the rows that redaction would change
aletheia scrub --apply    # redact them (back up hub.db first)
```

Redaction is pattern based, so check what you imported before you rely on it:

```bash
aletheia search "password"
aletheia search "AKIA"
```

Remove a memory you do not want. Report first, then apply:

```bash
aletheia erase --id 12
aletheia erase --id 12 --apply
```

Fact extraction redacts text again before it sends it to a model provider. See [Model providers](model-providers.md) for what is and is not redacted on each path.

## Run claude-mem and Aletheia side by side

The two tools keep separate stores.

- Aletheia writes only under its data directory (`~/.aletheia` by default). It listens on port 37790.
- claude-mem keeps `~/.claude-mem/`. Its worker port defaults to `37700 + (uid % 100)` (https://docs.claude-mem.ai/troubleshooting, fetched 2026-10-29). The two defaults collide only when `uid % 100` is 90. Change Aletheia's port with `ALETHEIA_PORT`.
- Aletheia never writes to the claude-mem database. It opens the file with `readonly` and `query_only`. In my test the file's checksum was identical before and after two imports.

I did not test an import while claude-mem was writing to its database. Run the import while claude-mem is idle.

If both tools have hooks in Claude Code, each one captures the same prompts and each one adds its own context block at session start. Expect duplicate context until you turn one off.

## Switch the Claude Code hook to Aletheia

1. Preview the install. Without `--write` the command is a dry run and writes nothing.

   ```bash
   aletheia install claude-code
   ```

   ```text
   Claude Code (claude-code) — full, mcp-verified
     write  mcp      ~/.claude.json  (mcpServers.aletheia)
     write  hooks    ~/.claude/settings.json  (SessionStart, UserPromptSubmit, PostToolUse, Stop, SessionEnd)
     write  rules    ~/.claude/CLAUDE.md  (0 rules)
   ...
   Dry run: nothing was written. Add --write to apply.
   ```

2. Apply it. Each changed file gets a timestamped backup.

   ```bash
   aletheia install claude-code --write
   ```

   The installer adds its own hook entries and leaves other hooks alone. In a test, a hook I had put in `settings.json` by hand was still there after install and after uninstall.

3. Turn off the claude-mem plugin so only one tool captures. Claude Code's documentation describes `/plugin disable` inside a session and `claude plugin disable <name>@<marketplace>` on the command line (https://code.claude.com/docs/en/discover-plugins, fetched 2026-10-29). On the machine where I wrote this page, `claude plugin list` shows the plugin as `claude-mem@thedotmack`:

   ```bash
   claude plugin disable claude-mem@thedotmack
   ```

   I did not run this command, because `claude plugin list` already showed that plugin as disabled, and I did not check the exact screens of the `/plugin` panel. If you installed claude-mem with `npx claude-mem install` instead of the plugin marketplace, the plugin id may not exist. Follow claude-mem's own documentation to remove its hooks. Whether disabling the plugin also stops claude-mem's background worker is UNVERIFIED; check the worker port from your claude-mem settings.

4. Confirm the install.

   ```bash
   aletheia doctor
   aletheia install claude-code --verify
   ```

   `doctor` should show `hooks claude-code  5/5`. `--verify` compares the files with the install record. These checks read configuration files. They do not prove a hook ran. Start a new Claude Code session, send one prompt, then run `aletheia search <word from the prompt>`.

   Hooks ran in real sessions of Claude Code (two days of use), Command Code (one short session) and Codex CLI (one interactive session), one user on one machine.

## What you keep and what you lose

You keep:

- Observations, summaries and prompts as searchable memories, in the Knowledge tab, in `aletheia search` and through the MCP `search` tool.
- Your claude-mem database, untouched.

You do not get from the import:

- claude-mem's vector index. Aletheia's vector search is optional and builds its own vectors.
- Tool-use records and work-state entries. The importer does not read those tables.
- Facts. Imported observations are not turned into facts, because fact extraction reads only summaries and notes.
- claude-mem's own viewer and modes. Aletheia has its own dashboard.

## Roll back

1. Remove Aletheia's entries from Claude Code. This is a dry run until you add `--write`, and it removes only the entries listed in Aletheia's install record.

   ```bash
   aletheia uninstall claude-code --write
   ```

2. Turn the claude-mem plugin back on.

   ```bash
   claude plugin enable claude-mem@thedotmack
   ```

3. Remove the imported memories if you want a clean slate. Pick the project name, check the report, then apply.

   ```bash
   aletheia erase --project shop
   aletheia erase --project shop --apply
   ```

Nothing in these steps changes the claude-mem database.

## Next steps

- [Write rules once](write-rules-once.md) - turn the rules you repeat in every tool into one list.
- [Claude Code](../tools/claude-code.md) - what the Claude Code installer writes and what was checked.
- [Aletheia vs claude-mem](../compare/aletheia-vs-claude-mem.md) - a sourced comparison of the two tools.
- [Backup, export and import](backup-export-import.md) - copy your new store to another machine.
- [Troubleshooting](troubleshooting.md) - fixes for the problems people hit after an install.
