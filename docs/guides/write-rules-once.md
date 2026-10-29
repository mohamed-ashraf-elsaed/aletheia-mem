# Write your AI coding rules once and sync them to every tool

<!-- description: Add rules once in Aletheia, preview the change, lint them, and write them into CLAUDE.md, AGENTS.md and other tool files with a backup. -->
<!-- keywords: sync rules across ai coding tools, claude.md agents.md sync, aletheia rules sync, share rules between claude code and codex, rules lint, write rules once -->

Aletheia (aletheia-mem) keeps your standing rules in one list and writes them into the instruction file each AI coding tool reads, such as `CLAUDE.md` and `AGENTS.md`. You edit the list in one place, preview the result, and then write the files.

This guide walks through the full loop with the CLI and the dashboard. Every command output below came from a temporary home folder and project folder, not from real files.

## Step 1: Add rules

Add a rule from the command line. The text is the rule. Add `--when` for a rule that applies only in a situation.

```bash
aletheia rules add "Run the tests before you commit"
aletheia rules add "Use the repo's formatter" --when "you edit a .mjs file"
```

```text
Added r_a188fedbf2.
Added r_daf40b0979.
```

Adding the same rule again prints `Already there (<id>).` and changes nothing.

In the dashboard, open the Rules tab and click **Add a rule**. The dialog has these fields:

- What the tool should do (the rule text)
- When (optional)
- Applies to: Everywhere, One project, or One situation
- Only for these tools (leave all unticked for every tool)

List your rules at any time:

```bash
aletheia rules list
```

```text
on  r_a188fedbf2  Run the tests before you commit  [everywhere]  (added 2026-10-29, source: you, last confirmed 2026-10-29)
on  r_daf40b0979  When you edit a .mjs file: Use the repo's formatter  [everywhere]  (added 2026-10-29, source: you, last confirmed 2026-10-29)
```

Rules live in the Aletheia database. The tool files are an output, not the source. Editing a tool file by hand does not change the list.

## Step 2: Choose a scope

A rule has a scope and an optional tool filter.

- **Everywhere** puts the rule under the heading `## Everywhere`.
- **One project** puts it under `## In <project name>`.
- **One situation** puts it under a heading with the name you give.
- **Only for these tools** limits the rule to the tools you tick. A rule with no tool filter goes to every tool.

The scope sets the heading. It does not filter by folder. In a test, a rule scoped to the project `shop` appeared under `## In shop` in the `AGENTS.md` of a different folder. A rule limited to `codex` was missing from the `CLAUDE.md` that was written in the same run.

The CLI `rules add` command makes Everywhere rules. Set a project scope or a tool filter in the dashboard dialog, or import rules from a file that already has headings (Step 3).

## Step 3: Import the rules you already have

If your tools already have rule files, import them instead of retyping.

```bash
aletheia rules import --tool claude-code --dir /path/to/project
aletheia rules import --tool claude-code --global
```

```text
{
  "found": 3,
  "added": 3,
  "skipped": 0
}
```

The importer reads bullet lines (`- ...` or `* ...`). A `## Heading` above a bullet becomes the scope name, so the bullets under `## Testing` become rules in the situation `Testing`. A file with no heading gives Everywhere rules. Running the import again skips rules you already have.

Two limits to know:

- If the file already has an Aletheia managed block, the importer reads only the bullets inside the block. Your own bullets outside the block are not read.
- Rule ids are new on each hub. The same rule text gets a different id on another machine.

In the dashboard, use Rules, then **Import**: pick the tool, type a project folder (blank means the global file) and click **Import rules**.

## Step 4: Preview, diff and lint

Nothing is written until you ask. Two read-only commands show where the files and the list disagree.

```bash
aletheia rules diff --dir /path/to/project --tools claude-code,codex
```

```text
claude-code  /path/to/project/CLAUDE.md  differs
  only in store  r_8358622fa2  Always run bun test before a commit
  ...
codex  /path/to/project/AGENTS.md  differs
  only in file   /path/to/project/AGENTS.md:10  Prefer tabs
  text differs   r_a188fedbf2 vs /path/to/project/AGENTS.md:8
    store: Run the tests before you commit
    file:  Run all tests before you commit
2 tools out of sync.
```

`rules diff` compares only files that contain the managed block. A file without the block is reported as unmanaged, not as a difference. Add `--json` for machine-readable output. The command exits with code 0 even when files differ.

`rules lint` checks the list and the managed blocks for hygiene problems:

```bash
aletheia rules lint --dir /path/to/project --tools claude-code,codex
```

```text
r_1732204248  drift_store_only  Rule r_1732204248 is in the store but missing from the managed block in .../CLAUDE.md.
  fix: Run aletheia rules sync --write for that tool.
file:.../AGENTS.md:3  drift_file_only  The managed block in .../AGENTS.md has a rule the store does not: "Prefer tabs".
  fix: Add it in the Rules view or run aletheia rules sync --write to restore the block.
```

The checks, from [the lint code](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/src/hub/rule-lint.mjs): duplicate rules, direct contradictions (same scope, opposite polarity), a rule over 300 characters, an enabled set over 4,000 characters, text that tells an agent to ignore safety, a secret inside a rule, a stale rule, and drift between the store and a managed block. The command exits with code 1 when it finds anything, so you can run it in CI. With no findings it prints `No findings.`

## Step 5: Write the files

Write global files (in your home folder) or project files (in one folder). Add `--write` to apply; without it the command is a dry run.

```bash
aletheia rules sync --tools claude-code,codex --global --write
aletheia rules sync --tools claude-code,codex --dir /path/to/project --write
```

```text
- claude-code: /path/to/project/CLAUDE.md — 5 rules, written (backup /path/to/project/CLAUDE.md.aletheia-2026-10-29T19-47-38-813Z.bak)
- codex: /path/to/project/AGENTS.md — 5 rules, written
```

Run the same command again and each line ends with `already up to date`.

Always pass `--tools`. Without it, `rules sync` targets all ten entries in the tool registry, including `copilot`, `aider` and `agents-md`. The tool ids and their files:

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

A tool with no global file is skipped, and the command prints a line such as `- cursor: Cursor has no global rules file.`

In the dashboard, open Rules, then **Write to tools**. Tick the tools, choose **A project folder** (type its absolute path) or **Global**, click **Preview changes**, then **Write files**. The page asks you to confirm before it writes. The Rules page also shows a line such as `1 tool out of sync with these rules` when a file has drifted.

## What the generated file looks like

This is the `AGENTS.md` that `rules sync --tools codex` wrote after the steps above. The same block goes into `CLAUDE.md`.

```markdown
<!-- aletheia:rules:begin -->
# Rules

Managed by aletheia-mem. Edit them in the Rules page; this block is rewritten on sync.

## Everywhere

- Run the tests before you commit
- When you edit a .mjs file: use the repo's formatter

## In shop

- Deploy only from the staging branch

## Testing

- Always run bun test before a commit
- Never mock the database in integration tests
<!-- aletheia:rules:end -->
```

Cursor gets a whole file that Aletheia owns, with the front matter Cursor documents:

```markdown
---
description: Standing rules managed by aletheia-mem
alwaysApply: true
---

<!-- aletheia:rules:begin -->
...
<!-- aletheia:rules:end -->
```

Windsurf's project file is also written whole, with `trigger: always_on` front matter. Global scope always uses the block form.

Rules for Cursor, Gemini CLI and Windsurf: config written from docs, not tested on a real install. The files above are written and checked in temporary folders; see [the rules targets record](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/blob/main/docs/verification/rules-targets.md).

## Keep rules fresh

A rule can go stale. Aletheia flags it and keeps syncing it until you decide.

```bash
aletheia rules list --stale
aletheia rules confirm r_a188fedbf2
aletheia rules retire r_1732204248
```

```text
Confirmed r_a188fedbf2 on 2026-10-29. The rule is unchanged.
Retired r_1732204248: turned off, not deleted. Turn it back on in the Rules page.
```

A rule is flagged when its evidence changed after the last confirmation, or when nobody confirmed it within the review window (90 days by default). Confirm a rule to restart the clock. Retire a rule to turn it off. A retired rule stays in the list and leaves the files on the next sync. In a test, the managed block went from 5 rules to 4 after one `retire` and one `sync --write`.

## Safety

- Only the managed block changes. Text outside the `<!-- aletheia:rules:begin -->` and `<!-- aletheia:rules:end -->` markers is left alone. A hand-written `CLAUDE.md` with notes and bullets kept all of them.
- Every write that changes an existing file first copies it to `<file>.aletheia-<timestamp>.bak`.
- Do not edit inside the block. The next sync rewrites it. In a test, a hand-edited line and a hand-added line inside the block were both replaced.
- A file with no markers gets a new block appended at the end.
- `aletheia uninstall <tool>` removes the block with the other entries that tool's installer wrote.
- Rules are plain text that every tool will follow. `rules lint` flags a rule that tells an agent to ignore safety or that contains a secret. Read the file before you commit it.

## Next steps

- [Rules](../concepts/rules.md) - how rules, scopes and evidence fit together.
- [Installer reference](../25-installers.md) - what each tool's installer writes, with sources.
- [Tools overview](../tools/overview.md) - which tools were checked on a real install.
- [Troubleshooting](troubleshooting.md) - the Rules page is empty after an install.
