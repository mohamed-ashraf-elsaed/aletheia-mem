# Contributing to Aletheia

Aletheia (aletheia-mem) is a free, local memory and rules hub for AI coding tools. It is small on purpose. This page
says what is most useful, how to set up, and what a pull request must contain.

## The most useful contribution: a real-install report

Several tools have a config that was written from their documentation and tested against fixtures, but not opened in
the real tool. The list is in the tools table of the [README](README.md#which-tools-it-connects-to) and in
[Tools overview](docs/tools/overview.md). A report from a real install is worth more than a patch.

Open an issue (use the "New host" template) with:

1. The tool and its version.
2. The command you ran, for example `aletheia install cursor --write`.
3. What the tool did: did it list the MCP server, did a hook fire, did the next session get context back.
4. The output of `aletheia doctor`, with secrets removed.

## Set up

Aletheia needs [Bun](https://bun.sh) 1.1 or newer. There are no runtime dependencies to install.

```bash
git clone https://github.com/mohamed-ashraf-elsaed/aletheia-mem
cd aletheia-mem
bun test                      # the full suite
bun bin/aletheia-server.mjs   # http://127.0.0.1:37790
```

Use a throwaway data directory while you work, so your own memory is never touched:

```bash
export ALETHEIA_DATA_DIR=$(mktemp -d)
export ALETHEIA_PORT=37999
```

## Before you open a pull request

1. Run `bun test`. All tests must pass.
2. Add a test that fails without your change. A bug fix without a test is not finished.
3. Run the checks that match your change:
   - `bun scripts/gen-tables.mjs --check` when you change an installer, a tool or a benchmark table.
   - `bun scripts/check-docs-links.mjs` when you change Markdown.
   - `bun scripts/build-site.mjs && bun scripts/check-sitemap.mjs` when you change `docs/` or `site/`.
   - `bun scripts/check-claims.mjs` when you change the README.
   - `bun scripts/i18n-check.mjs` when you change the README (the translations record the English text they came from).
4. Keep it dependency-free. A new runtime dependency needs a reason in the pull request. `bun scripts/audit-deps.mjs`
   is the check.
5. State what you measured. A claim about speed, recall or compatibility needs the command and its real output.

## Writing documentation

The Markdown in `docs/` is canonical. The documentation site and the GitHub wiki are generated from it.

- Pages are listed in `docs/_nav.json`. A new page needs an entry there, or the site build fails.
- Start a page with one `#` heading that contains the phrase a person would search for.
- Add two comment lines under the heading: `<!-- description: ... -->` (70 to 175 characters) and
  `<!-- keywords: ... -->` (three or more search phrases). They are invisible on GitHub and used for page metadata.
- The first paragraph should define the topic in one or two sentences and stand alone.
- Every fact about another project needs a source URL and the date you fetched it. If you cannot check it, write
  `UNVERIFIED` and say why.
- Never write "works with <tool>" unless a test or a real install shows it. Write what was checked.
- Do not type a count of tests, stars or downloads. Link to the command that prints it.
- Build and look at the result: `bun scripts/build-site.mjs`, then open `site/docs/index.html`. Build the wiki copy with
  `bun scripts/build-wiki.mjs`.

## Style

- Two-space indents, ES modules, no comments except where the logic is not obvious.
- Small commits, one logical change each. A commit message says what changed and why.
- Plain, direct English in docs and messages. Short sentences.

## Security

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## Conduct

This project follows [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

Open work is in the [issue tracker](https://github.com/mohamed-ashraf-elsaed/aletheia-mem/issues).
