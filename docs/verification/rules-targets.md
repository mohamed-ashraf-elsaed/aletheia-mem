# Rules targets, verified 2026-10-26

`aletheia rules sync` writes one managed block per tool. This table records the path and format each tool's
own documentation states, the date the source was read, and whether we tested the file with the tool itself.

"Aletheia test" means the format is covered by `test/install-targets/rules.test.mjs` (temp folders, no tool
launch). "Real tool read" means the tool loaded the file; none of those were run in this pass.

| Tool | Project file | Global file | Format | Source | Aletheia test | Real tool read |
|---|---|---|---|---|---|---|
| `cursor` | `.cursor/rules/aletheia.mdc` | none (no global file) | YAML frontmatter `description`, `alwaysApply: true`, then the managed block | <https://cursor.com/docs/context/rules> (2026-10-26) | pass | not run |
| `codex` | `AGENTS.md` | `~/.codex/AGENTS.md` | managed block | <https://developers.openai.com/codex/agent-configuration/agents-md> (2026-10-26) | pass | not run |
| `gemini-cli` | `GEMINI.md` | `~/.gemini/GEMINI.md` | managed block | <https://raw.githubusercontent.com/google-gemini/gemini-cli/main/docs/cli/gemini-md.md> (2026-10-26) | pass | not run |
| `windsurf` | `.windsurf/rules/aletheia.md` | `~/.codeium/windsurf/memories/global_rules.md` | YAML frontmatter `trigger: always_on`, then the managed block; global is a plain block | <https://docs.windsurf.com/windsurf/cascade/memories> (2026-10-26) | pass | not run |
| `opencode` | `AGENTS.md` | `~/.config/opencode/AGENTS.md` | managed block | <https://opencode.ai/docs/rules/> (2026-10-26) | pass | not run |
| `claude-code` | `CLAUDE.md` | `~/.claude/CLAUDE.md` | managed block | real hook/plugin files, see [25](../25-installers.md) (2026-10-26) | pass | not run |
| `command-code` | `AGENTS.md` | `~/.commandcode/AGENTS.md` | managed block | bundled reference, see [25](../25-installers.md) (2026-10-26) | pass | not run |
| `copilot` | `.github/copilot-instructions.md` | none | managed block | **not verified** in this pass | pass | not run |
| `aider` | `CONVENTIONS.md` | none | managed block | **not verified** in this pass | pass | not run |
| `agents-md` | `AGENTS.md` | none | managed block | open standard; no vendor page | pass | not run |

## Drift fixed in this pass

- Windsurf's project rules moved from the legacy `.windsurfrules` to `.windsurf/rules/aletheia.md` and now carry
  `trigger: always_on`. The legacy file is still read by the tool, but the current documented workspace-rule
  path is written.
- Cursor's `.mdc` now includes the managed markers, so a later sync can replace only our text.
- Codex's global rules path `~/.codex/AGENTS.md` was verified and added to the installer.
- Windsurf's MCP path now prefers `~/.config/devin/mcp_config.json`, falling back to an existing legacy
  `~/.codeium/windsurf/mcp_config.json`.

## Not done

No tool was launched to confirm it read the file. That needs a manual pass per tool; see
[docs/manual-test.md](../manual-test.md). Copilot and Aider formats were not re-fetched.
