# 30. The private remote MCP endpoint

Status: implemented, 2026-10-26. This page describes the code that
exists and is tested by `test/remote-mcp.test.mjs`.

Aletheia's MCP server (search, timeline, get_observations, save_memory, context, rules) is also reachable over
the MCP Streamable HTTP transport from other machines. The same tool handlers run over stdio and HTTP.

## 30.1 What it is

The sync hub serves one MCP endpoint at `/mcp` when it is started with the Hub database path. Every request needs
a bearer token from the sync account, with the token in the
`Authorization` header — never in the URL, because URLs leak into logs and shell history.

| Token scope | What it can call |
|---|---|
| `mcp`, `read` | the read tools only: search, timeline, get_observations, session_start_context, list_rules |
| `sync`, `admin` | all tools, including save_memory, add_rule, confirm_rule, dismiss_memory, restore_memory |

A token with named projects can only read those projects and only write into them. An empty project list means
every project. Every `tools/call` writes one append-only audit row (`action = mcp.call`) with the tool name, the
project and the result — never the payload or the arguments.

Rate limit: 60 MCP requests per minute per token; the answer is 429 with `Retry-After`. Revoking a token makes
the next call 401. Origin validation is on: no Origin header (non-browser clients) and loopback origins pass, and
extra origins can be allowed explicitly. Unknown origins get 403.

## 30.2 Create a link

On the hub machine (hub-side; it reads `sync.db` directly):

```bash
aletheia mcp-link create --projects shop,api
```

Prints, once:

- the endpoint URL, for example `http://127.0.0.1:37791/mcp` — no secret in the path;
- the bearer token (shown once, stored only as a hash);
- the copy-ready client config for Claude Code and Claude Desktop.

The command syntax in the snippets comes from the official Claude Code MCP reference
(https://docs.claude.com/en/docs/claude-code/mcp, fetched 2026-10-26):

```bash
claude mcp add --transport http aletheia http://127.0.0.1:37791/mcp --header "Authorization: Bearer <token>"
```

Claude Desktop (`claude_desktop_config.json`, same `mcpServers` shape the Claude Code docs show for other
clients):

```json
{
  "mcpServers": {
    "aletheia": {
      "type": "http",
      "url": "http://127.0.0.1:37791/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Manage links:

```bash
aletheia mcp-link list
aletheia mcp-link revoke <id>
```

The same actions exist in the Tools tab of the Hub UI under "Remote access".

## 30.3 Remote use (tunnel or reverse proxy)

The sync hub binds to loopback by default. For remote use it must sit behind TLS. Any reverse proxy or tunnel
works — no vendor lock. A Cloudflare Tunnel example (same pattern as docs/29 §29.8):

```bash
bun bin/aletheia-sync.mjs --db ~/.aletheia/sync.db --hub-db ~/.aletheia/hub.db
cloudflared tunnel --url http://127.0.0.1:37791
aletheia mcp-link create --projects shop --url https://<assigned-host>.trycloudflare.com
```

A non-loopback bind without `--behind-tls` prints a warning: the bearer token would otherwise travel in clear
text. With `--behind-tls`, add the client origins you expect with `--mcp-origins https://claude.ai,...` so a
browser-based client passes the Origin check.

## 30.4 What is not covered

- The endpoint authenticates with a bearer token, not OAuth. The ChatGPT/Claude.ai connector (OAuth 2.1) is
  not built.
- TLS itself is delegated to the proxy or tunnel; Aletheia does not terminate TLS.
- Payloads are plaintext to the hub process (redaction runs before send, but there is no end-to-end encryption
  on this endpoint; E2EE is not built, and docs/29 §29.6 states the threat).
- A real-client connection test has not been run; see docs/manual-test.md §9 (NOT RUN BY AUTHOR).
