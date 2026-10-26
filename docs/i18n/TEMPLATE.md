# README translation template

Copy this file to `docs/i18n/README.<code>.md`. Replace `<code>` with the language code used in the file name
(for example `es`, `pt-br`, `zh`). Add the language to `.translation-state.json` by running
`bun scripts/i18n-check.mjs --update` after the file exists.

The first lines of every translation must be:

```markdown
> Machine-translated from the English README on <date>. Review welcome: open a pull request against this file.
> Source: [README.md](../../README.md) · source-sha256: <64 lowercase hex characters>
```

Rules:

1. Translate prose only. Keep code blocks, commands, environment variable names, file paths and URLs unchanged.
2. Badge lines stay byte-identical to the English README.
3. Keep the generated blocks. Translate their headings only; leave every table cell as the generated source text.
4. For Arabic, Hebrew and Urdu, wrap the body in `<div dir="rtl">` and close it at the end.
5. Never write `reviewed by` unless a named person actually reviewed the file on a stated date.
6. After the English README changes, run `bun scripts/i18n-check.mjs`. A stale translation stays published but
   must not be presented as current.
