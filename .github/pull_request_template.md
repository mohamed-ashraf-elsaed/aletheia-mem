## What changed

<!-- One or two sentences. Link the task file, for example docs/tasks/T-079.md, if this closes one. -->

## Validation

Paste the real command output, not a summary.

- [ ] `bun test` passes.
- [ ] `bun scripts/check-tasks.mjs` passes.
- [ ] `bun scripts/gen-tables.mjs --check` passes (if README or docs tables changed).
- [ ] `bun scripts/check-docs-links.mjs` passes (if links or headings changed).
- [ ] The task file and `docs/tasks/TASKS.md` agree, and both are in this pull request (if this closes a task).

```
$ bun test
...
```

## Claims

- [ ] No number is typed by hand. A speed, recall or size claim includes the command that produced it.
- [ ] No `works with <tool>` claim without a test on a real install of that tool.
- [ ] A new runtime dependency has a reason; the default is none.
- [ ] No secret, token, private transcript or personal path is in the diff or the test fixtures.
- [ ] Anything still unverified is listed in `docs/tasks/unverified.md` or marked `UNVERIFIED`.

## Measurement command (delete if not applicable)

```
$ ...
```
