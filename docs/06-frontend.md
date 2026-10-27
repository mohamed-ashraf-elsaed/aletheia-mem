# 6. Frontend

Aletheia has one app page at `/`. It is plain HTML, CSS and JavaScript: no framework, no build step, no font file, no
CDN and no dependency. It works offline. The older claude-mem viewer is kept as an optional page; it is described at
the end of this file.

Screens (real captures of the running app on seeded demo data, labelled `?demo=1`; taken 2026-10-26 and 2026-10-27 UTC):

| | |
|---|---|
| ![Work, dark](screenshots/work-dark.webp) | ![Memory, dark](screenshots/memory-dark.webp) |
| ![Memory, light](screenshots/memory-light.webp) | ![Review queue, dark](screenshots/review-dark.webp) |
| ![Suggested rules, light](screenshots/rules-light.webp) | ![Tools, dark](screenshots/tools-dark.webp) |
| ![Status popover](screenshots/status-popover-dark.webp) | ![Command palette](screenshots/palette-dark.webp) |
| ![Search results](screenshots/search-dark.webp) | ![First-run guide](screenshots/guide-dark.webp) |
| ![Memory at 375 px, light](screenshots/memory-375-light.webp) | ![Memory at 375 px, dark](screenshots/memory-375-dark.webp) |
| ![Requests, dark](screenshots/requests-dark.webp) | ![Requests, light](screenshots/requests-light.webp) |
| ![Requests at 375 px, dark](screenshots/requests-375-dark.webp) | ![Requests at 375 px, light](screenshots/requests-375-light.webp) |
| ![Goals roll-up, dark](screenshots/goals-story-dark.webp) | ![Build story, dark](screenshots/story-dark.webp) |
| ![Suggested rules with strength, dark](screenshots/rules-strength-dark.webp) | ![Suggested rules with strength, light](screenshots/rules-strength-light.webp) |
| ![Context economics, light](screenshots/economics-light.webp) | |

## 6.1 Files

| File | What it holds |
|---|---|
| `public/index.html` | The shell: header, tab links, search, theme switch, status strip, four page containers, live regions. No inline script or style. |
| `public/ui-theme.css`, `public/ui-theme-init.js`, `public/ui-theme.js` | Design tokens, and the Auto, Dark, Light switch saved in `localStorage` (`aletheia.theme`). See [ui-design.md](ui-design.md). |
| `public/ui-components.css`, `public/ui-components.js` | The component library: buttons, toasts, dialogs, drawer, tabs, segmented control, switch, tooltip, popover, cards, stat tiles, skeletons, progress, empty and error states, pager, code block, Markdown view, timeline, chip filters, clamped text, disclosure. |
| `public/ui-brand.js`, `public/ui-icons.js`, `public/ui-motion.js` | The brain mark and loader, the tab icon in three states, inline SVG icons, Web Animations helpers. |
| `public/ui-pure.js`, `public/ui-core.js`, `public/ui-status-model.js` | DOM-free logic: pager maths, relative time, highlight, URL hash state, the Region state machine, poll backoff, the nine status indicators, routes. |
| `public/ui-markdown.js` | A small safe Markdown renderer that builds DOM nodes only. |
| `public/ui-region.js`, `public/ui-actions.js` | `region()` (loading, content, empty, error), `pagedList()` (server pages with state in the URL), optimistic actions with Undo, progress for long calls. |
| `public/ui-status.js` | The status bar, the connection banner, polling and the `/v1/live` socket. |
| `public/ui-search.js`, `public/ui-keys.js`, `public/ui-detail.js`, `public/ui-guide.js`, `public/ui-views.js`, `public/ui-frame.js` | Header search, shortcuts and the command palette, detail drawers, the first-run guide, shared cards and filters, the tab frame. |
| `public/tabs/*.js` | One module per tab (`work`, `memory`, `rules`, `tools`) plus the pages inside them (`memory-views`, `review`, `rules-views`, `tools-views`, `tools-team`) and the request panels (`work-requests`, `work-goals`, `work-story`, `memory-economics`). Loaded on the first visit. `team.js` and `alerts.js` are older standalone modules that nothing loads; the same features are the Team and Alerts pages of Tools. |
| `public/ui-estimates.js` | The "estimated" label and its link to the UNVERIFIED note, used for request grouping, progress, ETA, goal progress, strength bands and read tokens. |
| `public/one-ui.js`, `public/one-ui.css` | The shell logic and the shell and page styles. |

## 6.2 Pages and the URL

The address is the state. `#/memory/facts?status=history&page=3&limit=50` opens the Facts page, History, page 3, 50 rows per
page. Back, Forward and reload return to the same place. Changing only a page number or a filter does not rebuild the
page.

| Tab | Pages (`#/<tab>/<page>`) |
|---|---|
| Work | the overview, `#/work/request/<16 hex>`, and `#/work/session/<id>?project=<name>` |
| Memory | `memories`, `facts`, `review`, `dismissed`, `economics`, `search?q=…` |
| Rules | `rules`, `suggestions`, `sync` (write to tools), `import` |
| Tools | `tools`, `devices`, `access`, `alerts`, `team`, `checks`, `activity` |

## 6.3 Every list is paged on the server

Each list route takes `limit` (default 25, **hard maximum 100**) and `offset`, orders by a unique id so pages never overlap,
and answers `total`, `limit`, `offset` and `hasMore`. The UI sends the page size you pick (10, 25, 50 or 100).

| Route | Filters and sorting |
|---|---|
| `GET /api/hub/memories` | `project`, `q`, `kind`, `type`, `tool`, `pinned=1`, `scope=project\|global`, `since`, `until`, `sort=default\|newest\|oldest\|title`, `status=dismissed` |
| `GET /api/hub/facts` | `project`, `q`, `status=current\|history\|dismissed`, `scope`, `since`, `until`, `sort=recent\|oldest\|confidence` |
| `GET /api/hub/review` | `status`, `type`, `project`; near-duplicates page with `dupLimit` and `dupOffset`; `items=0` and `dupes=0` skip a part |
| `GET /api/hub/rule-suggestions` | `project`, `status`, `q`, `sort=newest\|confidence\|oldest` |
| `GET /api/hub/dismissed` | `type`, `project` (each row names what was hidden) |
| `GET /api/hub/audit` | `actor`, `action`, `since`, `until` |
| `GET /api/hub/sync/status` | `limit`, `offset` over the devices |
| `GET /api/hub/alerts/feed` | `limit`, `offset` over the newest 500 deliveries |
| `GET /v1/work/sessions` | `project`, `state=in_progress\|finished`, `since`, `until`, `q` (session id) |
| `GET /v1/work/goals` | `project`, `limit`, `offset`; the roll-up from T-168 |
| `GET /v1/work/requests` | `project`, `filter` (all, needs-you, shipped), `sort` (newest, needs-you, most-progress), `group=tool`, `limit`; **no `offset`**, so the Work tab has a page size and the server's counts, never a pager |
| `GET /v1/work/requests/:id` | one request plus `whereThisCameFrom` (sessions, prompts and facts) |
| `POST /api/hub/requests/:id` | body `{action: "dismiss"}` or `{action: "restore"}`; reversible |
| `GET /v1/work/story` | `project`; counts, shipping velocity and learned habits |
| `GET /v1/context/economics` | `project`, `limit`; read tokens per context row and ledger work tokens |
| `GET /api/hub/rules/learning-run` | the last recorded learning run |
| `POST /api/hub/rules/learning-run` | run `suggestRules` and record the run |
| `POST /api/hub/rules/:id/toggle` | body `{enabled}` |
| `POST /api/hub/rules/:id/replace` | body `{then, when?}`; the old rule is kept and marked replaced |
| `POST /api/hub/rule-suggestions/:id` | body `{action, text?}`; action is approve, edit, reject or restore |
| `POST /v1/search` | body `limit`, `offset`, `paged: true`, `scope`, `includeHistory`, `since`, `until`, `order=relevance\|date_desc\|date_asc`, `kind`, `mix`; without `offset` or `paged` it keeps its older shape |

A date without a time as `until` means the end of that day. Tests: `test/pagination.test.mjs`.

## 6.4 The four states of every region

`region()` shows exactly one of: a skeleton shaped like the final layout (the height is held, so nothing jumps), the content,
an empty state that says what it means and gives the command or button to fix it, or an error with Retry and Copy details. A
background refresh keeps the content on screen; a failed refresh shows a notice beside it. A late answer from an older
request is ignored. Buttons that call the API show a spinner, disable, then a check or the error.

Pin, Dismiss, Restore, Accept, Reject, Keep both and Turn off change the screen first and show an Undo for 8 seconds; a
failed request rolls the screen back and says why. Merging rows, revoking a device or a link, and writing files into your
tools ask first and say what will happen.

## 6.5 The status bar

Nine indicators (server, database, search index, vectors, embedding model, queue, extractor, last capture, sync) plus Live or
Polling. Each is a dot and a short label. Hover, focus or click opens a popover with the details and the exact command to fix
it. Sources: `/v1/health`, `/v1/work`, `/api/hub/sync/status` and `/api/hub/overview`. A source that has not answered is shown as
"checking", never as fine.

The bar polls every 10 s, or every 30 s while the `/v1/live` WebSocket is connected, doubles the wait after each failure up to
60 s, and stops while the page is hidden. A change frame triggers one light refresh and is passed to other views as an
`aletheia:frame` event (the Work tab listens to it). When the server cannot be reached a banner slides in with a countdown and
Retry now; the tab icon turns red.

## 6.6 Keyboard

`Ctrl+K` or `⌘K` the command palette, `/` the search box, `g` then `w`, `m`, `r` or `t` to switch tab, `[` and `]` for the
previous and next page of a list, `?` the shortcut sheet, `Esc` closes a dialog. Shortcuts never fire while you type in a field or
while a dialog is open. Tabs, switches and the pager also answer the arrow keys.

## 6.7 Accessibility, motion and security

- Contrast is computed from the tokens and tested (WCAG AA, 4.5:1 for text, 3:1 for control edges). Every control has a name, every
  list row title has a heading, user text carries `dir="auto"`, toasts and status changes are polite live regions, targets are 40 px.
- Motion uses CSS transitions and the Web Animations API on `transform` and `opacity`, with duration tokens of 120, 200 and 320 ms.
  Under `prefers-reduced-motion: reduce` movement becomes a short fade. Only loading marks and live status loop, and they pause when
  the tab is hidden.
- The app page is served with `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'self'`.
  No `innerHTML` is used with data, there is no inline handler, and nothing loads from another origin.
- Secrets are redacted by the server before they reach the page.

## 6.8 Try it

```bash
mkdir -p /tmp/aletheia-demo/data /tmp/aletheia-demo/home
bun scripts/seed-demo.mjs --data /tmp/aletheia-demo/data --rows 150
ALETHEIA_DATA_DIR=/tmp/aletheia-demo/data HOME=/tmp/aletheia-demo/home ALETHEIA_PORT=37891 \
  bun bin/aletheia-server.mjs --host 127.0.0.1
# open http://127.0.0.1:37891/?demo=1
```

`?demo=1` shows a banner saying the data is made up. `bun scripts/measure-api.mjs http://127.0.0.1:37891` times the list routes.
Tests: `bun test test/ui-*.test.mjs test/pagination.test.mjs test/seed-demo.test.mjs`. Measured numbers are in
[ui-design.md](ui-design.md#measured-performance).

## 6.9 Requests, goals, story and economics

The Work tab is built around requests now, not a flat session list. Each request card shows its status, its progress
and the ids behind that progress, an ETA only when one can be measured (otherwise the reason there is none), and what
came out of it: commits, pull requests and branches, each with the evidence id and a link to its session page. The
filter (all, needs you, shipped), sort (newest, needs you, most progress) and group (by tool) controls refetch
`GET /v1/work/requests`; the route has no `offset`, so the page size is the only paging control. Dismiss is optimistic
and Undo restores; dismissed requests sit in their own folded list. `#/work/request/<id>` reads
`GET /v1/work/requests/:id` and shows "where this came from": every session with its dated prompts and facts, and a
link back to the T-145 session page.

The Goals section is the T-168 roll-up: a status per goal (Moving, Stalled, Nothing on it), aggregate progress with
the request count, the linked requests, the merged artifacts, and the open asks split into being worked and nothing
working. Requests that serve no goal are counted and linked. Pin, Unpin, Dismiss and Restore still use
`POST /api/hub/goals/:id`.

Below it, the Build story shows shipped, working, waiting and idle counts, the weekly shipping line, the average days
to ship (or "n/a") and the corrections that repeat in the owner's own prompts, with dated quotes. Memory gains an
Economics page for the T-170 data: the totals strip, the documented read-token counter, and one row per context
memory. A per-observation work token value is `null` by design, so the row prints "n/a" with the response's own
sentence; zero is never substituted.

Every value that is a chosen rule rather than a measurement carries an "estimated" link to
[tasks/unverified.md](tasks/unverified.md#request-layer-story-and-economics-2026-10-27): request grouping, progress,
ETA, goal progress, rule strength bands and read tokens.

## 6.10 The classic viewer (optional)

`public/work.html` and `public/assets/` are the original claude-mem viewer, kept byte for byte and linked from Tools only when the
old database exists. Everything below describes that page, not the Aletheia app.

### What it is

`public/` is the original's production build, copied unchanged from
`claude-mem/15.2.0/ui/work-view/`: `index.html`, `assets/index-s8vzksbN.js` (798 KB, React + Vite, minified, no
source map), `assets/index-C6x466ZD.css`, a lazily loaded `setup-page-*.js` chunk, fonts (Geist, Hanken
Grotesk), three images, `favicon.png` (was `favicon.svg` until 2026-10-27), `icons.svg`. The clone serves these byte for byte. The decision not to
rewrite the UI is deliberate: the original source is not shipped, the bundle is Apache-2.0, and it already
speaks the API in [03-http-api.md](03-http-api.md).

### Runtime contract (read from the bundle)

| Aspect | Behaviour |
|---|---|
| Entry | `GET /` returns `index.html`, which loads `/work-view/assets/index-s8vzksbN.js` (module) and the CSS. |
| Data | `fetch('/api/work-view')`, then a single `EventSource('/api/work-view/events')`. It listens to `work-view` (replace the snapshot) and `heartbeat`. The setup chunk also listens to `setup-scan`, `setup-state`, `setup-import`. |
| Writes | `POST /api/work-view/review`, `/rules`, `/rules/load-in-claude-code`, `/agents/mark-finished` with `Content-Type: application/json`. |
| Setup chunk | Loaded only when the URL has `?setup=1`. Uses `/api/setup/*`, `/api/search`, `/api/memory/save`, `/api/observation/:id`. None of these exist in the clone; the chunk shows an error if opened. |
| Query parameters | `?goal=<goal id>` focuses a goal; `?theme=dark\|light` forces a theme (else `prefers-color-scheme`); `?source=sample` renders built-in demo data without the API; `?setup=1` opens onboarding. |
| Storage | None found: no `localStorage` or `sessionStorage` calls in the bundle. State lives in the page and the snapshot. |
| History API | `history.replaceState` only, to drop `?setup`. |
| Navigation | Sidebar: **Monitor** > My Work; **Steer** > My Goals, My Rules. My Work has Cards, List and By agent views, filters (All, Needs you, Shipped) and a sort menu. The header shows "Live updates" while the event stream is connected, a machine count, and a link to `/viewer` (the original's classic viewer, absent in the clone). |
| Cards | Each card shows: status chip (Working / Needs you / Shipped), a recent-activity box, "Next step", the goal it serves ("No goal" when unaligned, "Goal not linked yet" when the alignment step has not seen it), stage, start time, run time, a progress meter (`progress.percent`) with "reviewed <time>" and a projected finish. |

### Known gaps in the clone

- `/viewer` and `/tv` (other pages of the original) are not provided. The header link 404s.
- Anything in the setup chunk beyond its first screen.
- The header shows a "Star" button with a star count. Whether it fetches the count from GitHub at runtime was not checked; if it does, that is the original's behaviour and it needs internet access.

### Replacing the classic UI

To write your own front end, you need only: one JSON snapshot, one event stream, four POSTs. Use
`GET /api/work-view` as a typed contract (the key list is asserted in `test/server.test.mjs`) and keep the
fingerprint round trip: send the fingerprint you rendered when reviewing, and re-render from the returned
snapshot after any `409`.
