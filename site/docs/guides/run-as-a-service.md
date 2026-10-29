# Run Aletheia as a background service (systemd, launchd, Docker)

<!-- description: Generate a systemd user unit or a macOS launchd plist for the Aletheia server, set CPU and memory limits, read logs, upgrade, or run it in Docker. -->
<!-- keywords: run aletheia as a service, aletheia systemd, aletheia launchd, aletheia docker, aletheia-server autostart, systemd user service bun -->

Aletheia (aletheia-mem) needs its server running to serve the dashboard, the REST API and the background extraction worker. `aletheia service install` writes a systemd user unit on Linux or a launchd plist on macOS so that the server starts on its own. It only writes the file. You start the service yourself.

Hooks and the CLI do not need the server. They open `hub.db` directly. The server matters for the dashboard, the HTTP API and extraction.

## What the service command does

```bash
aletheia service status
aletheia service install [--write] [--cpu-quota 25%] [--memory-max 512M]
aletheia service uninstall [--write]
```

- `install` and `uninstall` are dry runs until you add `--write`.
- The command writes a text file and a record, `service-manifest.json`, in the data directory. It never calls `systemctl` or `launchctl`.
- The output says `"verification": "from-docs-only"`. The generated unit was written from documentation. I did not start a generated unit for this page. Run the commands below on your own machine and read what they print.
- Windows is not covered. The command prints `Windows auto-start is not supported. Start aletheia-server manually or through Task Scheduler.`

## Linux: a systemd user unit

Preview the unit. The paths below are placeholders. Your output shows your own Bun path and package path, as absolute paths.

```bash
aletheia service install
```

```json
{
  "platform": "linux",
  "supported": true,
  "kind": "systemd",
  "label": "aletheia.service",
  "file": "/home/you/.config/systemd/user/aletheia.service",
  "content": "[Unit]\nDescription=Aletheia memory hub (loopback)\n...",
  "verification": "from-docs-only",
  "dryRun": true,
  "changed": true,
  "note": "Dry run: nothing was written. Add --write to apply."
}
```

Write it, then start it with systemd:

```bash
aletheia service install --write
systemctl --user daemon-reload
systemctl --user enable --now aletheia
```

The `systemctl` lines are the ones in [the operations notes](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/07-operations.md). The service command does not run them.

### The unit the command writes

```ini
[Unit]
Description=Aletheia memory hub (loopback)
After=network.target

[Service]
Type=simple
ExecStart=/home/you/.bun/bin/bun /path/to/package/bin/aletheia-server.mjs
Restart=on-failure
Nice=10
Environment=ALETHEIA_HOST=127.0.0.1
Environment=ALETHEIA_DATA_DIR=/home/you/.aletheia
Environment=ALETHEIA_HUB_DB=/home/you/.aletheia/hub.db
Environment=ALETHEIA_PORT=37790

# Defaults (override with --cpu-quota / --memory-max):
# CPUQuota=50%
# MemoryMax=1G

[Install]
WantedBy=default.target
```

Three things to know:

- The port, data directory and database path are taken from the shell that ran the command. In a test, running the command with `ALETHEIA_PORT=37999` wrote `ALETHEIA_PORT=37999`, and running it again without that variable changed the file back to 37790 and made a backup.
- `ExecStart` holds the absolute path of Bun and of the server script at install time. If you move Bun or reinstall the package in a new place, run `aletheia service install --write` again, then `systemctl --user daemon-reload`.
- The unit sets only those four `Environment` lines. Provider settings such as `ALETHEIA_PROVIDER` are not copied. Add them with `systemctl --user edit aletheia`, or edit the file and run `daemon-reload`. See [Model providers](model-providers.md).

### CPU and memory limits

Pass limits at install time. They become `CPUQuota=` and `MemoryMax=` lines in the `[Service]` section.

```bash
aletheia service install --write --cpu-quota 25% --memory-max 512M
```

Without these flags the two lines are written as comments that show the defaults (50% and 1G). Those defaults are not applied until you pass a flag. `Nice=10` is always set. The two flags apply to the Linux unit only. The macOS plist has no limit keys.

### Check it and read logs

```bash
aletheia service status
systemctl --user status aletheia
journalctl --user -u aletheia -f
```

`aletheia service status` prints the plan and whether the unit file exists (`"installed": true`) plus the stored record. It does not ask systemd whether the service is running. Use `systemctl --user status aletheia` for that. The unit sets no log file, so output goes to systemd's default destination for the user service, which `journalctl --user -u aletheia` reads.

For a quick liveness check, ask the server directly:

```bash
curl -s http://127.0.0.1:37790/healthz
```

```json
{"status":"ok","db":{"ok":true,"detail":"quick_check ok"},"fts":{"ok":true,"detail":"FTS5 query answered"},"vectors":{"memories":0,"facts":0},"model":"Xenova/bge-small-en-v1.5"}
```

A `503` with `"status":"error"` means the database check or the search-index check failed. See [Troubleshooting](troubleshooting.md).

### Remove the unit

```bash
systemctl --user disable --now aletheia
aletheia service uninstall --write
systemctl --user daemon-reload
```

The uninstall copies the unit to `aletheia.service.aletheia-bak-<timestamp>`, deletes it and deletes the record.

### The hand-written unit in the repository

A git checkout also has `scripts/aletheia.service`. It runs from the checkout (`WorkingDirectory=%h/Projects/aletheia-mem`, `ExecStart=%h/.bun/bin/bun bin/aletheia-server.mjs`, `ALETHEIA_PORT=37790`). Edit the paths to match your checkout, then copy it to `~/.config/systemd/user/`. Use it only if you run from a clone. The command above is the better choice for an installed package.

## macOS: a launchd plist

On macOS the command writes `~/Library/LaunchAgents/aletheia.plist`, label `com.aletheia.mem`. It sets `KeepAlive` to true and sends output to `<data dir>/aletheia.log`. The same four environment variables go into the plist. This is the program section:

```xml
<key>Label</key>
<string>com.aletheia.mem</string>
<key>ProgramArguments</key>
<array>
  <string>/Users/you/.bun/bin/bun</string>
  <string>/path/to/package/bin/aletheia-server.mjs</string>
</array>
<key>KeepAlive</key>
<true/>
```

I rendered this plist on Linux by asking the code for the macOS plan. I did not run it on a Mac. Apple's launchd documentation says launchd loads user agents from the `LaunchAgents` folder in the user's Library (https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html, fetched 2026-10-29). That page does not describe `launchctl` commands, and the command here does not run them. Load the agent the way Apple's `launchctl` manual describes, and read `<data dir>/aletheia.log` for output.

## Port conflicts

The server listens on port 37790. If another process holds it, the server stops with `EADDRINUSE`. Find the owner, or pick another port:

```bash
ss -ltnp | grep 37790
ALETHEIA_PORT=37791 aletheia-server
```

For a service, change the port with `ALETHEIA_PORT=37791 aletheia service install --write`, then restart. `aletheia doctor` checks the port in `ALETHEIA_PORT`, so set the same value in your shell when you run it.

## Restart after an upgrade

A running server keeps the old code in memory until you restart it.

```bash
npm install -g aletheia-mem@latest
systemctl --user restart aletheia
aletheia --version
aletheia install claude-code --write
```

The last command rebuilds the hook bundle that tools run. The installer rebuilds `aletheia.bundle.mjs` in the data directory only when the package sources are newer than the bundle. Repeat it for each tool you installed. If the package moved to a new path, run `aletheia service install --write` and `systemctl --user daemon-reload` as well.

## Docker

The repository has a `Dockerfile` and a `compose.yaml`. I did not run `docker build` or `docker compose` for this page. The repository's own test (`test/dockerfile.test.mjs`) only checks the text of the files, and its header says `docker build` is not run by the author.

What the files say:

- The image starts from `oven/bun:1.3.10-alpine`, creates a non-root user `aletheia`, and copies `bin`, `src`, `public`, `public-hub`, `prompts` and `vendor`.
- It sets `ALETHEIA_DATA_DIR=/data` and `ALETHEIA_PORT=37790`, declares `/data` as a volume, and runs `bun bin/aletheia-server.mjs`.
- The health check calls `http://127.0.0.1:37790/healthz` every 30 seconds with `wget`.
- No secret is baked in.
- `compose.yaml` uses `network_mode: host`, `restart: unless-stopped` and a named volume `aletheia-data` mounted at `/data`. Host networking works on Linux only. The server then binds `127.0.0.1` in the host's network, so only your machine reaches it.
- The comments in `compose.yaml` say that on Docker Desktop you replace `network_mode` with `ports: ["127.0.0.1:37790:37790"]` and set `ALETHEIA_HOST=0.0.0.0`. A non-loopback bind turns on Hub login. Create an admin token first, as [Sync](../29-sync.md) describes.

The usual commands:

```bash
docker compose up -d --build
docker compose logs -f
docker compose down
```

One limit follows from how the hooks work. A hook or CLI command on your host opens the host's `hub.db` directly. It does not call the container. A container with its own `aletheia-data` volume therefore holds a different database from `~/.aletheia/hub.db`. To share one database you would have to mount the host data directory at `/data`. I did not test that, and the `aletheia` user in the container needs write access to the files.

## Next steps

- [Troubleshooting](troubleshooting.md) - port in use, an old dashboard after an upgrade, and a database that will not open.
- [Configuration reference](../reference/configuration.md) - every environment variable.
- [Model providers](model-providers.md) - put provider variables into the unit.
- [Operations notes](../07-operations.md) - the longer internal notes on running the server.
