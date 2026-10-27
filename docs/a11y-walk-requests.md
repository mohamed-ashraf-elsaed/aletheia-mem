# Keyboard and small-screen walk: Requests, Goals, Story, Suggested rules, Economics

Date: 2026-10-27. Task: T-224.

## What was run

- Server: `ALETHEIA_PORT=37894 bun bin/aletheia-server.mjs --host 127.0.0.1` on a data folder made by
  `bun scripts/seed-demo.mjs --data <scratch>/data --rows 150`. The server ran with the real `HOME`; it only read
  the scratch data folder.
- Browser: the Playwright MCP browser (Chromium), driven with `page.keyboard`, `page.evaluate` and
  `emulateMedia`. Measured by us, not by a screen reader.
- Pages, all with `?demo=1`: `#/work`, `#/work/request/<id>` (a shipped request, a request whose title holds a
  200-character unbroken token, a request whose title is long Arabic), `#/rules/suggestions`, `#/rules` (Replace
  dialog) and `#/memory/economics`.
- Viewports: 1280x900 and 375x812. Schemes: light and dark. Reduced motion: `prefers-reduced-motion: reduce`.
- Seed change: `scripts/seed-demo.mjs` now adds two requests (long Arabic title, 200-character token title) and one
  suggested rule with long Arabic text plus a 200-character token. All rows are labelled demo.
- Tab walk: 60 presses of Tab per page at 1280 px; every stop was recorded with its role, name, focus ring,
  on-screen state and `aria-expanded`.

## Results

P = pass, F = fail (before the fixes), P* = pass after a fix in this task. "n/a" = the check does not apply.

| Check | Work | Request detail | Suggested | Economics | Notes |
|---|---|---|---|---|---|
| Tab order is logical, no trap (1280) | P | P | P | P | Dialogs keep focus inside; Esc closes and returns focus to the opener (Edit, Replace) |
| Every stop visible with a focus ring | P | P | P | P | 60/60 stops had a ring and were on screen |
| Expanders: Enter and Space, `aria-expanded` | P | P | P | n/a | Progress evidence, Sessions, Came out of it, More quotes; the Sessions button has `aria-controls` to a real panel |
| Filter, sort, group, page size by keys | P | n/a | P | n/a | Sort select changed the list with ArrowDown |
| Approve, Edit, Reject, Replace by keys | n/a | n/a | P | n/a | Edit and Replace dialogs trap Tab and close on Esc |
| Focus after Dismiss, Approve, Reject | F then P* | n/a | F then P* | n/a | Focus fell to `body`; now lands on the next card |
| Shortcuts `g w`, `g r`, `?`, `/`, Ctrl+K | P | P | P | P | Not fired while typing in the search box or the palette |
| Shortcut `]` and `[` | not exercised | n/a | not exercised | n/a | They page a list; no list had more than one page |
| Every control has an accessible name | P | P | P | P | 0 unnamed controls in 24 page/viewport/scheme runs |
| Headings h1 > h2 > h3 | P | P | P | P | One h1 on each page, no skipped level |
| Live region for undo toast and counts | P | P | P | P | `role=status` with `aria-live=polite` |
| "estimated" is text, not colour only | P | P | P | P | Visible text "estimated"; the name now says what is estimated |
| No sideways page scroll at 375 | P | P | P | P | The sub-navigation row scrolls inside its own box |
| Touch targets >= 40 px at 375 | F then P* | F then P* | F then P* | F then P* | See fixes 1 and 2 |
| Long Arabic and 200-char token wrap at 375 | P | P | P | n/a | No clipped text, no page overflow |
| Reduced motion: nothing loops | P | P | P | P | Only `ui-rise` runs, 1 iteration, 0.01 ms, finished |

The light and dark runs gave the same results at both widths.

## Failures found, with selectors

1. `a.ui-estimate` was 59x20 or 68x23 px (touch target). Found on every page that prints the label.
2. `.ui-meta li > a` (the `#42` pull request link on the request detail page) was 23x40 px.
3. After a keyboard Dismiss on `#/work` or Approve or Reject on `#/rules/suggestions`, `document.activeElement` was
   `body`. The card was hidden and then the list was rebuilt, so a keyboard user restarted from the page top.
4. Thirteen links on one page all had the name "estimated" (the explanation was only a `title`).

## Fixes

| # | Change | Before | After |
|---|---|---|---|
| 1 | `public/ui-components.css`: `.ui-estimate` is 40 px high and wide at 480 px and below | 15 targets under 40 px on `#/work`, 13 on `#/rules/suggestions` | 0 on all pages at 375 px |
| 2 | `public/tabs/work-requests.js` and CSS: `.ui-artifact-link` has `min-width: var(--ui-touch)` | 23 px wide | 40 px |
| 3 | `public/ui-views.js` `hideCard` moves focus to the next (or previous) card; `public/ui-region.js` returns focus to the same kind of control after a rebuild | focus on `body` | focus on the next card's control (Dismiss, Reject and Approve checked) |
| 4 | `public/ui-estimates.js`: `aria-label` is "Progress: estimated" and so on | "estimated" x13 | one name per value |

Tests (all in `test/ui-a11y.test.mjs`, the `T-224` block): estimated label, narrow touch rule, `hideCard` focus
move, no focus change when the card did not hold focus, soft reload keeps focus.
The page list in that file already rendered Requests, Goals, Story, Suggested and Economics with stubbed API data.

## Still failing or open

- The sub-navigation tab row (`div.ui-tablist.ui-subnav-tabs`) scrolls sideways inside itself at 375 px (419 px wide
  content in 336 px). It is a scroll row, not a page overflow. Left as it is; it is not a redesign-sized fix.
- At 1280 px `a.ui-estimate` is 20 to 23 px high. The 40 px rule applies to narrow screens only.
- `]` and `[` were not exercised on a list with more than one page.

## Not checked

- A real screen reader (NVDA, JAWS, VoiceOver, TalkBack). The accessible names, roles and live regions were read
  from the DOM, which is a proxy.
- A real touch device. Target size came from `getBoundingClientRect` in a desktop browser at a 375 px width.
- Browsers other than Chromium.
- Colour contrast values.
- Real data (only the demo seed).
