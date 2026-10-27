# Project status page

Open `docs/status/index.html` in Visual Studio Code with right-click, then "Open with Live Preview", or double-click it
to open it in any browser. It is one file with its CSS, JavaScript and data inline. It needs no server, no network, no
CDN and no external fonts. Regenerate it with `bun scripts/gen-status.mjs` (or `bun run status`). `bun scripts/gen-status.mjs --check`
exits 1 if the committed page no longer matches the repository files; CI runs it. The same data is in `status.json`.

Computed on every run, from the repository's files: task counts, phases, eligible and blocked tasks, stale validations
(a file in a validated task's "Files to touch" has a later commit date), table-versus-file mismatches, feature coverage
from documents 20 and 27, the document list and broken links, static test-file and `test(` counts, git state, the
workflows declared in `.github/workflows`, the HTTP routes and CLI commands. Only recorded, never run by the generator:
the test, check and link results from `docs/tasks/run-report.md` (shown as "last recorded run"), the declared CI jobs
("declared, not run"), and the UNVERIFIED and NOT RUN BY AUTHOR items, which are text taken from the documents.
`--check` ignores the generation time, the commit sha, git history and stale flags so it does not fail only because a commit happened.
The page layout lives in `scripts/status-page.css` and `scripts/status-page.js`.
