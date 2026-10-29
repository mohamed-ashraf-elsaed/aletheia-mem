# Rules: write standing instructions once and sync them to every tool

<!-- description: How Aletheia rules work: scopes, enabled, stale, confirm and retire, the managed block in each tool file, preview, diff, lint, sync and import. -->
<!-- keywords: ai coding rules sync, claude.md agents.md gemini.md sync, cursor rules mdc, aletheia rules, managed block, stale rule recheck, rules diff lint -->

Aletheia (aletheia-mem) keeps your standing instructions as rules in one list and writes them into the instruction file that each AI coding tool reads. A rule is one instruction, such as "Run the tests before you commit."

## What a rule is

A rule has these parts:

- **then**: the instruction itself, at most 800 characters.
- **when**: an optional situation, such as "running scripts in this repo". A rule with a situation is written as `When <situation>: <instruction>`.
- **scope**: where it applies. See [Scopes](#scopes).
- **tools**: an optional list of tool ids. A rule limited to `claude-code` and `codex` is not written into any other tool's file.
- **enabled**: on or off. Only enabled rules are synced.
- **source**: who made it: `you`, `suggested`, `import:<tool>`, or the name of the tool that called the MCP `add_rule` tool.
- **dates and evidence**: when it was added, when it was last confirmed, and the memories or facts it rests on.

Rule ids look like `r_d459528269`. The same text in the same scope is never stored twice.

## Scopes

A rule has one of three scope tiers.

- **everywhere**: applies in every project. It is written under `## Everywhere`.
- **project**: applies in one named project. It is written under `## In <project>`.
- **situation**: applies in a named situation, such as "code review". It is written under a heading with that name.

`aletheia rules add` creates `everywhere` rules. Create project and situation rules in the Rules tab, through the MCP `add_rule` tool (`scopeTier` and `scopeName`), or with `POST /api/hub/rules`.

Sync does not filter rules by the folder you sync into. A rule for the project `demo` is written under `## In demo` in every file you sync, and the tool reads it as text. To make a rule reach only some tools, set its tools list when you create the rule (`tools` in `POST /api/hub/rules`).

## Add and list rules

```bash
aletheia rules add "Run the tests before you commit."
aletheia rules add "Use bun, not npm." --when "running scripts in this repo"
aletheia rules list
```

```
Added r_d459528269.
Added r_069d2c0e9e.
on  r_d459528269  Run the tests before you commit.  [everywhere]  (added 2026-10-29, source: you, last confirmed 2026-10-29)
on  r_069d2c0e9e  When running scripts in this repo: Use bun, not npm.  [everywhere]  (added 2026-10-29, source: you, last confirmed 2026-10-29)
```

## Enabled, stale, confirm and retire

A rule is either on or off. `aletheia rules retire <id>` turns a rule off. It does not delete it, and you turn it back on in the Rules tab. Replacing a rule in the dashboard keeps the old rule and marks it as replaced.

Use an id from `aletheia rules list`:

```bash
aletheia rules retire r_dc75399976
```

```
Retired r_dc75399976: turned off, not deleted. Turn it back on in the Rules page.
```

### The "still right?" re-check

Aletheia computes a stale flag every time it reads a rule. The flag never turns a rule off or edits it. A rule is flagged when any of these is true:

- A fact it rests on was superseded or closed after the rule was last confirmed.
- A fact it rests on expired after the rule was last confirmed.
- A memory it rests on was dismissed after the rule was last confirmed.
- A newer active fact states a different object for the same subject and predicate as a fact it rests on.
- Nobody confirmed the rule for longer than the review window. The default is 90 days. The `rules.reviewDays` setting changes it, from 7 to 730.

```bash
aletheia rules list --stale
```

```
on  r_d459528269  Run the tests before you commit.  [everywhere]  (added 2026-06-21, source: you, last confirmed 2026-07-01) [re-check: Not confirmed for 120 days (review window 90 days, last confirmed 2026-07-01).]
```

(`--older-than N` lists rules last confirmed more than N days ago. When nothing matches, the command prints `No rules yet.`)

If the rule is still right, confirm it. The rule text does not change. Only its last-confirmed date moves to today.

```bash
aletheia rules confirm r_d459528269
```

```
Confirmed r_d459528269 on 2026-10-29. The rule is unchanged.
```

The MCP `confirm_rule` tool does the same. An agent should call it only after you agree the rule still holds.

### The recheck note

A flagged rule is still delivered. Aletheia adds a recheck note to its text, in synced files and in the session-start context, so the agent knows to verify it before it applies the rule:

```
- Run the tests before you commit. [re-check: Not confirmed for 120 days (review window 90 days, last confirmed 2026-07-01). Verify before applying.]
```

`aletheia rules import` strips the note again, so it never becomes part of the rule text.

## The managed block

For most tools Aletheia writes one block between two marker comments and leaves everything else in the file alone:

```
# My project

Existing notes the user wrote.

<!-- aletheia:rules:begin -->
# Rules

Managed by aletheia-mem. Edit them in the Rules page; this block is rewritten on sync.

## Everywhere

- Run the tests before you commit.
- When running scripts in this repo: use bun, not npm.

## In demo

- Keep hooks free of network calls.
<!-- aletheia:rules:end -->
```

The next sync replaces whatever sits between the markers, so edit rules in Aletheia, not in the block. When the file already exists, the first change keeps a copy next to it as `<file>.aletheia-<timestamp>.bak`. A sync that would change nothing writes nothing.

Two files are owned by Aletheia and written whole, with the front matter the tool expects: the project rules file for Cursor (`.cursor/rules/aletheia.mdc`) and for Windsurf (`.windsurf/rules/aletheia.md`). Text you add to those files is lost on the next sync, apart from the backup.

## Which files Aletheia writes

| Tool id | Project file | Global file |
|---|---|---|
| `claude-code` | `CLAUDE.md` | `~/.claude/CLAUDE.md` |
| `command-code` | `AGENTS.md` | `~/.commandcode/AGENTS.md` |
| `codex` | `AGENTS.md` | `~/.codex/AGENTS.md` |
| `gemini-cli` | `GEMINI.md` | `~/.gemini/GEMINI.md` |
| `cursor` | `.cursor/rules/aletheia.mdc` | none |
| `windsurf` | `.windsurf/rules/aletheia.md` | `~/.codeium/windsurf/memories/global_rules.md` |
| `opencode` | `AGENTS.md` | `~/.config/opencode/AGENTS.md` |
| `copilot` | `.github/copilot-instructions.md` | none |
| `aider` | `CONVENTIONS.md` | none |
| `agents-md` | `AGENTS.md` | none |

The paths come from each tool's own documentation as recorded on 2026-10-26 in [rules-targets.md](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/verification/rules-targets.md). They were not fetched again for this page. The Copilot and Aider formats were not verified in that pass. Aletheia's tests write each file in temp folders. No tool was launched to confirm that it read the file it was given.

Cursor, Gemini CLI and Windsurf: config written from docs, not tested on a real install. No hook ran in Cursor, Gemini CLI, Windsurf or OpenCode.

## Preview before you write

`aletheia rules sync` is a dry run until you add `--write`. It prints one line per tool and changes nothing:

```bash
aletheia rules sync --tools claude-code,cursor,codex,windsurf,copilot,aider,gemini-cli --dir .
```

```
- claude-code: .../w/CLAUDE.md — 3 rules, would change (add --write)
- cursor: .../w/.cursor/rules/aletheia.mdc — 2 rules, would change (add --write)
- codex: .../w/AGENTS.md — 3 rules, would change (add --write)
- windsurf: .../w/.windsurf/rules/aletheia.md — 2 rules, would change (add --write)
- copilot: .../w/.github/copilot-instructions.md — 2 rules, would change (add --write)
- aider: .../w/CONVENTIONS.md — 2 rules, would change (add --write)
- gemini-cli: .../w/GEMINI.md — 2 rules, would change (add --write)
```

The counts differ because one rule was limited to `claude-code` and `codex`. Add `--write` to apply the change. Use `--global` instead of `--dir` to write the files under your home directory.

```bash
aletheia rules sync --tools claude-code,cursor,windsurf --dir . --write
```

```
- claude-code: .../w/CLAUDE.md — 3 rules, written (backup .../w/CLAUDE.md.aletheia-2026-10-29T19-48-01-019Z.bak)
- cursor: .../w/.cursor/rules/aletheia.mdc — 2 rules, written
- windsurf: .../w/.windsurf/rules/aletheia.md — 2 rules, written
```

Running the same command again prints `already up to date` for each file and writes nothing.

In the dashboard, the Rules tab has a Preview changes button that shows the new content, and a confirmation before Write files. The API follows the same order: `POST /api/hub/rules/preview` returns the before and after text, and `POST /api/hub/rules/sync` refuses to write unless the body has `"confirm": true`.

## Check for drift with diff and lint

`aletheia rules diff` compares each tool's managed block with the rules in the store. It reads files and writes nothing. After someone edits the block by hand it reports:

```
claude-code  .../w/CLAUDE.md  differs
  only in store  r_5a235350fa  Write commit messages in the imperative mood.
  only in file   .../w/CLAUDE.md:18  Never push to main.
  text differs   r_d459528269 vs .../w/CLAUDE.md:12
    store: Run the tests before you commit.
    file:  Run the tests before every commit.
1 tool out of sync.
```

A file with no managed block is reported as not compared.

`aletheia rules lint` checks the rules themselves and the drift. It prints one finding per problem with a fix hint, and exits with status 1 when it finds any. The checks are:

- duplicate rules, and rules that contradict each other (same scope and situation, "always" against "never");
- a rule longer than 300 characters, or enabled rules totalling more than 4,000 characters;
- a rule that tells an agent to ignore safety, or that contains something that looks like a secret;
- a stale rule;
- a rule in the store that is missing from a managed block, or a rule in a block that the store does not have.

```
r_d459528269  stale_rule  Rule r_d459528269 may be out of date. Not confirmed for 120 days (review window 90 days, last confirmed 2026-07-01).
  fix: Confirm it with aletheia rules confirm, or retire it with aletheia rules retire.
```

## Import rules from an existing file

`aletheia rules import` reads the bullet lines from a tool's file and adds each one as a rule with the source `import:<tool>`. It reads the managed block when there is one, and the whole file when there is not. A `## In <project>` heading becomes a project-scoped rule. Rules already in the store are skipped.

```bash
aletheia rules import --tool claude-code --dir .
```

```
{
  "found": 4,
  "added": 2,
  "skipped": 2
}
```

## Let Aletheia suggest rules

`aletheia rules suggest` scans your captured prompts for corrections such as "use X instead of Y", "always", "never", "don't" and "from now on". Each match becomes a pending suggestion with dated quotes. A suggestion seen once or twice is Light, three or four times is Steady, five or more is Strong. Nothing becomes a rule until you approve it in the Rules tab.

```bash
aletheia rules suggestions
```

```
#1 [pending] Use pnpm, not npm for installs  (demo, confidence 0.8)
```

## Next steps

- [Write your rules once](../guides/write-rules-once.md) - a step-by-step guide from first rule to synced files.
- [Session-start context](../concepts/session-context.md) - where enabled rules appear at the start of a session.
- [Memory model](../concepts/memory-model.md) - the facts and memories that rules can rest on.
- [CLI reference](../reference/cli.md) - every `aletheia rules` option.
