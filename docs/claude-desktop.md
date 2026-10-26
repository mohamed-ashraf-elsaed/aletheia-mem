# Claude Desktop and the aletheia MCP server

Claude Desktop speaks MCP over stdio. Aletheia's server is `bin/mcp.mjs`; one JSON entry under `mcpServers`
is all it needs. No hook and no rules file exist for Claude Desktop, so this page is setup only.

## Config file location

| OS | Path | Source |
|---|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` | MCP quickstart, fetched 2026-10-26 |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` | MCP quickstart, fetched 2026-10-26 |
| Linux | `~/.config/Claude/claude_desktop_config.json` | **UNVERIFIED**: the file exists on this machine, but the MCP quickstart does not name a Linux path |

Source: <https://modelcontextprotocol.io/quickstart/user> (fetched 2026-10-26).

## The entry

Use an absolute Bun path and an absolute path to `bin/mcp.mjs`:

```json
{
  "mcpServers": {
    "aletheia": {
      "command": "/absolute/path/to/bun",
      "args": ["/absolute/path/to/aletheia-mem/bin/mcp.mjs"],
      "env": {}
    }
  }
}
```

`aletheia` is the server name. The store path comes from `ALETHEIA_HUB_DB`; set it in `env` if the default
`<data dir>/hub.db` is not what you want.

## Merge, never replace

The config file already holds Claude Desktop preferences and other MCP servers. Aletheia only adds or removes
`mcpServers.aletheia`; everything else is kept byte-for-byte apart from JSON formatting. Running the merge twice
is a no-op, and a changed file gets a `.aletheia-bak-<timestamp>` copy first. An unparsable file is refused.

## What was and was not tested

- The merge and the generated JSON are tested against fixtures (`test/claude-desktop.test.mjs`).
- Claude Desktop was **not** opened with this config here. `docs/manual-test.md` records the manual step.

## Restart

Quit Claude Desktop completely and reopen it. The server appears under the hammer/tools icon. If it does not,
run the command from the entry by hand and read its stderr.
