# Install Aletheia with npm, git or Docker

<!-- description: Install Aletheia (aletheia-mem) with npm, git or Docker, start the server on port 37790, set up auto-start, update it and remove it. Needs Bun 1.1+. -->
<!-- keywords: install aletheia, aletheia-mem npm, aletheia docker, bun memory server, aletheia systemd service, uninstall aletheia, aletheia data directory -->

Aletheia (aletheia-mem) installs as an npm package or from a git clone, and it runs on Bun 1.1 or newer. This page covers the three install paths, starting the server, auto-start, updating, uninstalling and where the data lives.

Command output on this page comes from runs on 2026-10-29 with a temporary home folder and a test port. Paths that start with `...` stand for that temporary folder, and your paths will differ.

## Install Bun first

The Aletheia commands start with `#!/usr/bin/env bun`, so Bun must be on your `PATH` even when you install with npm. Without it, the command fails like this:

```text
$ aletheia --version
env: 'bun': No such file or directory
```

The Bun installation page, https://bun.sh/docs/installation (fetched 2026-10-29), lists `curl -fsSL https://bun.com/install | bash` for macOS and Linux and `irm bun.sh/install.ps1|iex` in PowerShell for Windows. It also lists `npm install -g bun` and `brew install oven-sh/bun/bun`. Check the version afterwards:

```bash
bun --version
```

You need 1.1.0 or newer. The CI jobs use Bun 1.3.10.

## Install from npm

```bash
npm install -g aletheia-mem
aletheia --version
```

```text
0.1.10
```

The package has no runtime dependencies. It puts four commands on your `PATH`: `aletheia` (the command line), `aletheia-mem` (the same command), `aletheia-server` (the server and dashboard) and `aletheia-mcp` (the MCP server over stdio). The version above was the latest on the npm registry on 2026-10-29.

## Install from git

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

Inside a clone, run the command line as `bun bin/aletheia.mjs <command>`. Other pages write `aletheia <command>`, which is the npm form.

A clone has no `node_modules` folder. Bun's auto-install then fetches any package a command imports and finds missing (https://bun.sh/docs/runtime/auto-install, fetched 2026-10-29). Two Aletheia commands import the optional vector package `@huggingface/transformers` because you ask for vectors: `aletheia embed` and `aletheia search --semantic`. `aletheia compress` does so only when you set `ALETHEIA_EMBED_FACTS=1`. In a test on 2026-10-29, `aletheia compress` run from a clone with an empty Bun cache (before this default changed) took 99 seconds and added about 502 MB to that cache. Starting the server, installing a tool and running a hook did not download anything in either layout.

## Run with Docker

The repository has a `Dockerfile` and a `compose.yaml`. These two files are described from their contents. The image was not built or run for this page.

The `Dockerfile`:

- starts from `oven/bun:1.3.10-alpine`;
- creates a non-root user named `aletheia` and runs as that user;
- copies `package.json`, `bin`, `src`, `public`, `public-hub`, `prompts` and `vendor` into `/app`;
- sets `ALETHEIA_DATA_DIR=/data` and `ALETHEIA_PORT=37790`, and declares `/data` as a volume;
- runs a health check every 30 seconds that fetches `http://127.0.0.1:37790/healthz`;
- starts `bun bin/aletheia-server.mjs`.

The `compose.yaml` builds the image as `aletheia-mem:local`, restarts it unless stopped, stores data in a named volume called `aletheia-data`, and uses `network_mode: host`. Host networking works on Linux only. The server then binds `127.0.0.1` in the host's network, so only your machine can reach it. A comment in the file says that on Docker Desktop you replace `network_mode` with `ports: ["127.0.0.1:37790:37790"]` and set `ALETHEIA_HOST=0.0.0.0`, which turns on Hub login, so create an admin token first.

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
docker compose up -d --build
```

One consequence follows from how hooks work. A hook opens the SQLite file named by `ALETHEIA_DATA_DIR` on the host and writes to it directly. It does not call the server. A container with its own volume therefore does not see what host hooks capture, unless both use the same file. That setup was not tested.

## Start the server

```bash
aletheia-server
```

```text
aletheia-mem listening on http://localhost:37999
  source db : .../.claude-mem/claude-mem.db (read-only)
  data dir  : ...
  refresh   : off (set ALETHEIA_PROVIDER=claude-cli|openai to enable)
  extraction: worker on (rule-based)
```

The test run used `ALETHEIA_PORT=37999`. The default port is 37790. The `source db` line names the claude-mem database that the importer can read. Aletheia never writes to it. `extraction: worker on (rule-based)` means the server runs the queue worker with no model.

Stop the server with Ctrl-C. It closes the database on SIGINT and SIGTERM.

Two flags exist: `--host` and `--behind-tls`. A bind address other than loopback turns on Hub login and prints a warning unless you pass `--behind-tls`. Leave the host alone unless you have read [Sync](../29-sync.md).

## Open the dashboard

Open http://127.0.0.1:37790 in a browser. The first page is Home. On a new install it has no projects yet, and a short "What is Aletheia?" panel. To check the server without a browser:

```bash
curl -s http://127.0.0.1:37790/healthz
```

```text
{"status":"ok","db":{"ok":true,"detail":"quick_check ok"},"fts":{"ok":true,"detail":"FTS5 query answered"},"vectors":{"memories":0,"facts":0},"model":"Xenova/bge-small-en-v1.5"}
```

`aletheia doctor` runs a longer set of checks: server, hooks per tool, spool, permissions, last capture, queue and database.

## Connect a tool

Installing the package does not touch any tool. Run the installer for each tool you use. It is a dry run until you add `--write`:

```bash
aletheia install claude-code          # preview
aletheia install claude-code --write  # apply
```

The [Tools overview](../tools/overview.md) says what has been checked for each tool on a real install.

## Start the server automatically

`aletheia service` writes an auto-start file. It writes a systemd user unit on Linux and a launchd plist on macOS. On Windows it prints that auto-start is not supported and suggests Task Scheduler.

The command is a dry run by default. It prints one JSON object. This is the Linux output, shortened:

```bash
aletheia service install
```

```text
{
  "platform": "linux",
  "supported": true,
  "kind": "systemd",
  "label": "aletheia.service",
  "file": ".../.config/systemd/user/aletheia.service",
  "content": "[Unit]\nDescription=Aletheia memory hub (loopback)\n...",
  "verification": "from-docs-only",
  "source": "systemd user units (systemd.unit(5)); loopback only",
  "dryRun": true,
  "changed": true,
  "note": "Dry run: nothing was written. Add --write to apply."
}
```

The `content` field holds this unit file, here with its line breaks restored:

```text
[Unit]
Description=Aletheia memory hub (loopback)
After=network.target

[Service]
Type=simple
ExecStart=.../bun .../bin/aletheia-server.mjs
Restart=on-failure
Nice=10
Environment=ALETHEIA_HOST=127.0.0.1
Environment=ALETHEIA_DATA_DIR=.../.aletheia
Environment=ALETHEIA_HUB_DB=.../.aletheia/hub.db
Environment=ALETHEIA_PORT=37790

# Defaults (override with --cpu-quota / --memory-max):
# CPUQuota=50%
# MemoryMax=1G

[Install]
WantedBy=default.target
```

The target file is `~/.config/systemd/user/aletheia.service`. On macOS the target is `~/Library/LaunchAgents/aletheia.plist` with the label `com.aletheia.mem`.

The unit records the host, data directory, database path and port that are set when you run the command. Run it with the environment you want the service to use. Pass `--cpu-quota` or `--memory-max` to turn the two commented limits on.

With `--write`, the output ends like this:

```text
  "dryRun": false,
  "changed": true,
  "wrote": [
    ".../.config/systemd/user/aletheia.service"
  ],
  "backup": null,
  "note": "Installed."
```

It also writes `service-manifest.json` into the data directory. If the file already existed and differs, the command first copies it to `aletheia.service.aletheia-bak-<timestamp>`.

The command only writes text. It never calls `systemctl` or `launchctl`, and the unit is marked `"verification": "from-docs-only"`. The project's operations page, [Operations](../07-operations.md), lists these systemd commands for the user unit:

```bash
systemctl --user daemon-reload
systemctl --user enable --now aletheia
```

The source code notes that its author has not started the generated service on a real machine. [Run as a service](../guides/run-as-a-service.md) has the details.

Other subcommands: `aletheia service status` reports whether the file exists, and `aletheia service uninstall --write` backs the file up and removes it.

## Update Aletheia

```bash
npm install -g aletheia-mem@latest
aletheia --version
```

Then restart the server, or the service if you set one up. Next, run the installer again for each tool you connected:

```bash
aletheia install claude-code --write
```

Hooks do not run the package directly. They run a single-file bundle built at install time, `aletheia.bundle.mjs` in the data directory. The installer rebuilds that file when the package sources are newer. In a test, the installer reported `Already installed; nothing changed.` and still replaced a bundle whose modification time was set to 2020. The tool's own config files stay as they were.

To see whether the database schema needs a migration, run a dry run:

```bash
aletheia migrate --dry-run
```

```text
{
  "exists": true,
  "path": ".../hub.db",
  "version": 3,
  "target": 3,
  "needsMigration": false,
  ...
  "dryRun": true
}
```

## Uninstall Aletheia

1. Remove the entries Aletheia added to each tool. Only the entries listed in the install manifest are removed. Run the dry run first:

   ```bash
   aletheia uninstall claude-code
   aletheia uninstall claude-code --write
   ```

   ```text
   Claude Code (claude-code)
     remove mcp      .../.claude.json
     remove hooks    .../.claude/settings.json  (no aletheia hooks)
     remove rules    .../.claude/CLAUDE.md
   Removed our entries from 3 file(s):
     .../.claude.json
     .../.claude/settings.json
     .../.claude/CLAUDE.md
   ```

   The hooks line says `(no aletheia hooks)` even when hooks are present. The `--write` run did remove them in the test: `settings.json` held `{}` afterwards. Check with `aletheia doctor`. If a file changed after install, the command refuses and tells you to rerun with `--force`.

2. Remove the auto-start file: `aletheia service uninstall --write`.
3. Stop the server.
4. Remove the package: `npm uninstall -g aletheia-mem`.
5. Optional: delete the data. Export first, because deleting `~/.aletheia` deletes your memory.

   ```bash
   aletheia export --out aletheia-backup.jsonl
   rm -rf ~/.aletheia
   ```

## Where the data lives

The default data directory is `~/.aletheia`. Set `ALETHEIA_DATA_DIR` to move it. If `~/.aletheia` does not exist and `~/.work-view-local` does, Aletheia uses the older folder, which is the project's earlier name.

These files can appear there:

- `hub.db`, plus `hub.db-wal` and `hub.db-shm` while it is open. This is the shared store.
- `spool/hook-spool.jsonl`, only while a hook could not reach the database.
- `aletheia.bundle.mjs`, the hook bundle, and `install-manifest.json`, the list of what the installer wrote.
- `service-manifest.json`, after `aletheia service install --write`.
- Other SQLite files that the server creates, such as `alerts.db`, `overlay.db` and `work-view-reviews.db`.

`aletheia doctor` reports `data dir 0700, db 0600`. Aletheia sets the data directory to mode 0700 and the database and spool to 0600. Nothing is stored outside this folder, apart from the files the installer changes in each tool's own config.

## Next steps

- [Quickstart](quickstart.md) - save a memory and read it back in about ten minutes.
- [Tools overview](../tools/overview.md) - what was checked for each tool, and how to connect it.
- [Run as a service](../guides/run-as-a-service.md) - auto-start in more detail.
- [Back up, export and import](../guides/backup-export-import.md) - move or save your memory.
- [Configuration](../reference/configuration.md) - every environment variable.
