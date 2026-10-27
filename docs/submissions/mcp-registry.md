# MCP Registry submission (prepared)

Source: the registry quickstart and package-types doc, fetched 2026-10-27.

- `https://raw.githubusercontent.com/modelcontextprotocol/registry/main/README.md`
- `https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/modelcontextprotocol-io/quickstart.mdx`
- `https://raw.githubusercontent.com/modelcontextprotocol/registry/main/docs/modelcontextprotocol-io/package-types.mdx`

A pull request to the registry repository does **not** publish a server. Publishing runs from the server's own
project with the `mcp-publisher` CLI. The npm ownership marker is `mcpName` in `package.json`, and it must equal the
`name` in `server.json`.

## The manifest

Already written to the repository root as `server.json`:

```json
{
  "$schema": "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json",
  "name": "io.github.mohamed-ashraf-elsaed/aletheia-mem",
  "title": "Aletheia",
  "description": "A free, local memory and rules hub for AI coding tools, served over MCP.",
  "repository": {
    "url": "https://github.com/mohamed-ashraf-elsaed/aletheia-mem",
    "source": "github"
  },
  "version": "0.1.0",
  "packages": [
    {
      "registryType": "npm",
      "identifier": "aletheia-mem",
      "version": "0.1.0",
      "transport": {
        "type": "stdio"
      }
    }
  ]
}
```

`package.json` carries the matching marker:

```json
{
  "name": "aletheia-mem",
  "version": "0.1.0",
  "mcpName": "io.github.mohamed-ashraf-elsaed/aletheia-mem"
}
```

The stdio transport is launched from the npm package's `bin` entry `aletheia-mcp` (`bin/mcp.mjs`). A self-hostable
Streamable HTTP endpoint (`/mcp`) also exists, but the registry entry uses the published npm package and stdio, which
is what the quickstart verifies for npm.

## Exact owner commands

The package must already be published (it is: `aletheia-mem@0.1.0`, T-080). Then, in the repository root:

```bash
# 1. Install the publisher (prebuilt binary, macOS/Linux)
curl -L "https://github.com/modelcontextprotocol/registry/releases/latest/download/mcp-publisher_$(uname -s | tr '[:upper:]' '[:lower:]')_$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/').tar.gz" | tar xz mcp-publisher && sudo mv mcp-publisher /usr/local/bin/

# 2. Validate without publishing
mcp-publisher validate

# 3. Authenticate as the GitHub owner (the server name starts with io.github.mohamed-ashraf-elsaed/)
mcp-publisher login github

# 4. Publish
mcp-publisher publish
```

Verify with:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.mohamed-ashraf-elsaed/aletheia-mem"
```

The registry hosts metadata only; the npm artifact is what end users install. Do not add an `mcp-publisher init`
`packages` environment-variables block: this server has no required secret.
