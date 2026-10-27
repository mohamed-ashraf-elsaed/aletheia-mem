# Distribution and directory submissions

Status: **prepared, not submitted** (2026-10-27). Nothing below has been sent. The owner runs the commands and opens
the PRs/issue form. A directory or list is claimed only after it accepts the entry.

This is the execution half of [24 §24.5](24-repo-parity-and-growth.md). Each target's exact copy is in
[submissions/](submissions/). Sources were fetched on 2026-10-27 and are recorded in
[tasks/research-log.md](tasks/research-log.md).

| Target | Kind | Submit via | Status | Ready copy |
|---|---|---|---|---|
| MCP Registry | official directory | `mcp-publisher publish` (not a PR) | prepared, not published | [submissions/mcp-registry.md](submissions/mcp-registry.md) |
| awesome-mcp-servers | curated list | fork + PR to `punkpeye/awesome-mcp-servers` | prepared, not submitted | [submissions/awesome-mcp-servers.md](submissions/awesome-mcp-servers.md) |
| awesome-claude-code | curated list | web issue form (not a PR, not `gh`) | prepared, blocked on the age/star rule | [submissions/awesome-claude-code.md](submissions/awesome-claude-code.md) |

Honesty rules:

- The MCP Registry entry points at the published npm package `aletheia-mem` (`server.json`), never at an unpublished
  package. The registry hosts metadata only; it does not host the artifact.
- No list or directory is claimed until it accepts the entry. The README and site do not add an "as seen in" badge
  from this pass.
- awesome-claude-code requires 14 days of active development **or** 100 stars, and a human filing the web form. The
  repository has 0 stars today, so the copy is a draft and is not submitted until the rule is met.
- awesome-mcp-servers requires a public GitHub repo with an install path; `aletheia-mem` is `npm install -g
  aletheia-mem` (stdio) plus a self-hostable HTTP server, so it qualifies as installable, not remote-only.
