# AGENTS.md

This file is for any AI agent working in this repository. Read it before you touch anything else.

## 1. Read the task system first

1. Read `docs/tasks/TASKS.md`.
2. Pick the **first `todo` task whose dependencies are all `validated`**.
3. Open its `docs/tasks/T-<id>.md` file and follow it exactly.
4. Set its status to `doing` in **both** the table and the task file before the first edit.
5. Do the work.
6. Run the task's **Validation command** exactly as written.
7. Paste the real output into the task's **Evidence** field.
8. Only then set the status:
   - `implemented` — code is done, validation has **not** been run.
   - `validated` — validation ran and passed. Evidence contains the real output.
   - `failed` — validation ran and failed. Evidence contains the failing output and the task gets a dated note.
9. Update the status table and the task file **in the same commit**.

Hard rules:

- **Never mark a task `validated` from reasoning, a summary, a code review, or "it should work".** Only a passing command does that.
- **Never edit another task's status.** You own the task you claimed, nothing else.
- **Never delete a failed task.** Edit it with a dated note and what was observed.
- **No task without a runnable validation command.** If you add a task, add its command.
- If your work uncovers a new gap, add a new task with the template; do not silently expand the current one.
- Run `bun scripts/check-tasks.mjs` before committing. It must exit 0.

## 2. Writing rules for every document

These rules exist because this project's only real asset is that its claims can be checked.

1. **No fabrication.** Every fact about another project — feature, number, star count, price, licence, benchmark
   score — needs a source URL you actually fetched, plus the fetch date, in the same row or sentence. If you cannot
   fetch it, write `UNVERIFIED` and say why. Never fill a gap from memory.
2. **Conflicting numbers are shown, not resolved.** Put each number with its source and conditions (dataset, metric,
   model, who ran it). Mark vendor claims `vendor-claimed` and our own `measured-by-us (command)`.
3. **No fake badges, stars, downloads, test counts or "supported tools".** A badge must read a real value or state an
   honest status. Never write "works with X" unless a test or a real install proves it; otherwise say
   `config written from docs, not tested on a real install`.
4. **Do not copy another project's text, logo or artwork.** Copy structure and coverage, not words. Apache-2.0
   attribution for reused code goes in `NOTICE.md`. Quote at most 25 words from any source; paraphrase the rest.
5. **Plain, direct English. No marketing superlatives. Short sentences.**
6. **A source wins over this repository's assumptions.** If the source disagrees with the docs, report the difference.

## 3. Repository invariants

- **Do not edit `src/`, `bin/`, `public/`, `public-hub/`, `test/`, or `bench/` when the task is documentation-only.**
  The task file says which files it may touch.
- **Do not push.** Commit locally on the working branch. The human decides when to push.
- **Zero required runtime dependencies** unless a task explicitly approves one with a reason. `bun scripts/audit-deps.mjs`
  is the check.
- **Loopback only by default.** Do not bind a server to `0.0.0.0` without an explicit task that also adds auth.
- **No telemetry, no account, no network call unless the user configured a provider.**
- **Redact before storing and again before any model call.** `<private>` content is dropped, never stored.
- **Never write to claude-mem's database.** Imports are read-only (`src/hub/importers.mjs`).
- **Do not edit `.commandcode/taste/`.** It is managed by the learning system. Use the `taste` tool if a preference
  must be recorded.
- **Do not add a dependency to make a test pass.** Fix the code or write the test with the standard library.

## 4. How to work

- Small commits, one logical change each. Commit messages describe the change, not the ceremony.
- Read a file before editing it. Match the existing style; this codebase uses two-space indents, ESM, and no comments
  except where the logic is non-obvious.
- Run the narrow test first (`bun test test/<file>.test.mjs`), then `bun test`, then `bun scripts/check-tasks.mjs`.
- A task that changes retrieval, memory building, or install behaviour must rerun its benchmark/experiment and record
  the number in `docs/22-improve-the-numbers.md` or the task's Evidence.
- Keep `docs/tasks/research-log.md` current: every URL you fetch gets a dated line.
- If something is `UNVERIFIED`, add it to `docs/tasks/unverified.md` with what would verify it.

## 5. If you are blocked

Record the blocker in the task file under Status history, set the status to `failed` only if the validation ran and
failed; otherwise leave it `doing` and write a dated note. Do not guess a fact to get unstuck. Do not mark a task
validated to make the table look green.

## 6. Where things are

| Path | Purpose |
|---|---|
| `docs/tasks/TASKS.md` | The task table and status legend. Start here. |
| `docs/tasks/T-*.md` | One work order per task. |
| `docs/20-claude-mem-feature-matrix.md` | What claude-mem has and where this repo stands. |
| `docs/21-competitor-landscape.md` | The market, with sources. |
| `docs/22-improve-the-numbers.md` | The public scoreboard and the experiments. |
| `docs/23-memory-building.md` | How raw activity becomes memory. |
| `docs/24-repo-parity-and-growth.md` | README, i18n, badges, distribution. |
| `docs/tasks/research-log.md` | Every source fetched, with date and what it gave. |
| `docs/tasks/unverified.md` | Every `UNVERIFIED` and what would resolve it. |
| `docs/tasks/run-report.md` | The last real test and task-check output. |

## 7. Definition of done for a task

- The task's acceptance criteria are observably true.
- The validation command was run and its real output is in Evidence.
- `bun test` passes.
- `bun scripts/check-tasks.mjs` passes.
- Docs that make a claim affected by the change are updated in the same commit.
- The status table and the task file agree.
