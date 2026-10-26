# Notice

aletheia-mem is a re-implementation of the "My Work" view of **claude-mem**
(https://github.com/thedotmack/claude-mem, Apache-2.0, copyright its authors), reverse-engineered from the
claude-mem 15.2.0 plugin installed on the author's machine.

Taken from claude-mem 15.2.0:

| Path here | Origin | Change |
|---|---|---|
| `public/work.html`, `public/assets/` | `ui/work-view/` (built single-page app and assets) | none. This is the optional legacy viewer only; `public/index.html`, `public/one-ui.js`, `public/one-ui.css`, `public/ui-core.js`, `public/ui-dom.js`, `public/tabs/` and `public/work-view.js` are this project's own code. |
| `prompts/request-progress/SKILL.md`, `prompts/owner-goals/SKILL.md` | `skills/request-progress/SKILL.md`, `skills/owner-goals/SKILL.md` | none |
| `vendor/owner-goals/*.py` | `skills/owner-goals/scripts/` | none |
| `src/ledger/commands.mjs` | functions from `skills/request-progress/scripts/request-groups.mjs` | extracted, imports rewired, overlay-aware goal read, database path from config |

The legacy viewer is not part of the default Work tab. The Tools tab links to it only when `~/.claude-mem` exists,
and the default page shows this project's own Work view.

Everything else (`src/`, `bin/`, `test/`, the documents) was written for this project from the observed behaviour
of the original's HTTP API and its minified server code.

Licensed under the Apache License 2.0, https://www.apache.org/licenses/LICENSE-2.0. Not affiliated with or
endorsed by the claude-mem authors.
