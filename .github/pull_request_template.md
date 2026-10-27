## What changed

<!-- One or two sentences. Link the issue this closes, if any. -->

## Validation

Paste the real command output, not a summary.

- [ ] `bun test` passes.
- [ ] `bun scripts/gen-tables.mjs --check` passes (if README or docs tables changed).
- [ ] `bun scripts/check-docs-links.mjs` passes (if links or headings changed).

```
$ bun test
...
```

## Claims

- [ ] No number is typed by hand. A speed, recall or size claim includes the command that produced it.
- [ ] No `works with <tool>` claim without a test on a real install of that tool.
- [ ] A new runtime dependency has a reason; the default is none.
- [ ] No secret, token, private transcript or personal path is in the diff or the test fixtures.
- [ ] Anything still unverified is marked `UNVERIFIED`.

## Measurement command (delete if not applicable)

```
$ ...
```
