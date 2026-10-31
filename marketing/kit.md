# Marketing kit

The single source of messaging for every public channel. Every post an agent writes comes from this file, the README and the Dev.to article. It changes only when Mohamed edits the positioning section of the distribution plan.

## One-liner

A free, local memory and rules hub for AI coding tools. One store on your machine; Claude Code, Codex CLI, Cursor, Gemini CLI, Windsurf and OpenCode read it over MCP, REST or the CLI.

## Audiences, in priority order

1. Developers who use two or more coding agents and lose context when they switch. This is the differentiation no competitor in the README table matches (rules sync to 9 targets, hook capture on six hosts).
2. Claude Code users running claude-mem or a sprawl of CLAUDE.md files. The importer and the side-by-side benchmark exist for them.
3. Local-first and self-hosting developers who reject accounts and telemetry (r/LocalLLaMA, r/selfhosted, Mastodon).
4. Later: small teams who want one set of rules across machines (team mode and sync, once tested across two real hosts).

## Pillars and proof points

| Pillar | Proof point to reuse (as stated in the README) |
| --- | --- |
| One memory for every tool | 13 MCP tools, REST under /v1, CLI; MCP server passes against the official SDK client, protocol versions 2024-11-05 to 2025-11-25 |
| Rules written once | synced into CLAUDE.md, AGENTS.md, GEMINI.md, .cursor/rules, .windsurf/rules, Copilot and Aider files: 9 targets |
| Local, free, no account | Apache-2.0, loopback only, no telemetry, no network call unless a model provider is configured |
| Safe by default | secrets and private blocks redacted on every write path (0.1.11); memory returned to the model as marked untrusted data; hooks always exit 0 |
| Honest numbers | LoCoMo Recall@5 57.4% raw turns vs 36.0% for claude-mem 15.2.0 as shipped, 3.72 ms/query vs p50 1,699 ms; 1,505 tests, 0 failures; CI on Linux, macOS, Windows |

The benchmark measures retrieval, not answer accuracy. The README says this next to the numbers; every post that quotes them must too.

## Tone rules

- Plain sentences. No superlatives, no "game-changer", no exclamation marks, no emojis.
- Every benchmark mention says "retrieval, not answer accuracy" in the same sentence. The README does this; a post that drops it breaks trust with the exact audience that liked the README.
- Never claim "works with" a tool that has not been tested on a real install. Say "config written from docs, not tested on a real install" where the README does.
- Compare on facts, never on tone. claude-mem is "the original", not a target. The NOTICE.md attribution stays visible.
- Lead with the user's problem (context lost between tools, rules duplicated per tool), then the mechanism, then the install command. Three commands, always the same three.
- Public channels are English only. The 10 machine-translated READMEs are mentioned only with the "no native review" caveat.
- Every post ends with one concrete ask: try it on a real install and open an issue with tool, version, command and result. That is the contribution the README asks for, and it is the one that moves the alpha forward.

## The three install commands

Copied from README.md "Install in three commands". Every post uses these same three.

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun bin/aletheia-server.mjs
```

Open <http://127.0.0.1:37790>. Needs [Bun](https://bun.sh) 1.1 or newer. To install the published package instead,
run `npm install -g aletheia-mem`, then start it with `aletheia-server`. There are no runtime dependencies to
install.
