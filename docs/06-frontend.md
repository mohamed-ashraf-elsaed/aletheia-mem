# 6. Frontend

## What it is

`public/` is the original's production build, copied unchanged from
`claude-mem/15.2.0/ui/work-view/`: `index.html`, `assets/index-s8vzksbN.js` (798 KB, React + Vite, minified, no
source map), `assets/index-C6x466ZD.css`, a lazily loaded `setup-page-*.js` chunk, fonts (Geist, Hanken
Grotesk), three images, `favicon.png` (was `favicon.svg` until 2026-10-27), `icons.svg`. The clone serves these byte for byte. The decision not to
rewrite the UI is deliberate: the original source is not shipped, the bundle is Apache-2.0, and it already
speaks the API in [03-http-api.md](03-http-api.md).

## Runtime contract (read from the bundle)

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

## Known gaps in the clone

- `/viewer` and `/tv` (other pages of the original) are not provided. The header link 404s.
- Anything in the setup chunk beyond its first screen.
- The header shows a "Star" button with a star count. Whether it fetches the count from GitHub at runtime was not checked; if it does, that is the original's behaviour and it needs internet access.

## Replacing the UI

To write your own front end, you need only: one JSON snapshot, one event stream, four POSTs. Use
`GET /api/work-view` as a typed contract (the key list is asserted in `test/server.test.mjs`) and keep the
fingerprint round trip: send the fingerprint you rendered when reviewing, and re-render from the returned
snapshot after any `409`.
