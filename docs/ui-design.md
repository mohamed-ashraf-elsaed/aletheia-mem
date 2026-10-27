# Aletheia UI design

Tokens live in [public/ui-theme.css](../public/ui-theme.css). Every colour comes from the logo
([docs/assets/logo.png](assets/logo.png)) or is a darker or lighter step of one that does.

## Palette sampled from the logo

Sampled with `python3 -I scripts/palette.py` on 2026-10-27. The logo is 960 by 841 px.

| Part of the logo | Sampled value | Token it feeds |
|---|---|---|
| Background, navy-black (most common corner and fill colour, bucketed) | `#141c1c` bucket; fills run from `#0c1414` to `#14242c` | `--ui-s0` to `--ui-s3` (we use a bluer ramp: `#0a1017` to `#1d2c3c`) |
| Cyan, mid of the glow range | `#26bbea` | `--ui-accent` (dark theme) |
| Cyan, dark end | `#1b708d` | accent in light theme is darkened to `#08698e` for contrast |
| Teal, light end of the glow | `#33f0d8` | `--ui-accent-2` |
| Blue node colour | `#20adf7` (mid), `#23c5f9` (light) | `--ui-node` |
| Wordmark silver | `#e0e2e4` | `--ui-text` is `#e4e9ee`, a slightly cooler silver |

The surface ramp, border, status colours (success, warning, danger, info) and the highlight colour are our choice.
The logo has no green, amber or red, so those four are picked for contrast, not sampled.

## Tokens

- Surfaces 0 to 3, border, strong border, text, muted text, accent, accent-2, node, accent-ink, accent-soft, glow.
- Status: success, warning, danger, info.
- Type scale: 12, 13, 15, 18, 24, 32 px as `--ui-text-xs` to `--ui-text-2xl`. System font stack only. A monospace
  stack for ids, paths and code. Arabic falls through to the system Arabic face.
- Spacing: 4, 8, 12, 16, 24, 32, 48 px.
- Radius: 6, 10, 16 px and a pill.
- Shadow: three levels. Glow: a 1 px ring plus a soft halo in the accent colour. Focus ring: two rings.
- Motion: 120, 200 and 320 ms. Three easings: standard, out and a small spring. Under `prefers-reduced-motion` the
  three durations collapse to 0.01 ms.
- Touch target: 40 px.

## Themes

Dark is the base because the logo is dark. Light is a full alternative. The default is `prefers-color-scheme`. The
header toggle sets Auto, Dark or Light and stores it in `localStorage` under `aletheia.theme`. The automatic light
block and the manual light block must match; a test checks that.

## Contrast

Ratios are computed by `bun scripts/contrast.mjs` (WCAG 2 relative luminance) and checked by
`test/ui-contrast.test.mjs`. Text pairs need 4.5:1. Control edges and the accent against surfaces need 3:1.

```
dark  text          on s0  15.63:1  (min 4.5) pass
dark  text          on s1  14.50:1  (min 4.5) pass
dark  text          on s2  13.18:1  (min 4.5) pass
dark  text          on s3  11.63:1  (min 4.5) pass
dark  muted         on s0  7.56:1  (min 4.5) pass
dark  muted         on s1  7.01:1  (min 4.5) pass
dark  muted         on s2  6.37:1  (min 4.5) pass
dark  muted         on s3  5.62:1  (min 4.5) pass
dark  accent        on s0  8.53:1  (min 4.5) pass
dark  accent        on s1  7.91:1  (min 4.5) pass
dark  accent        on s2  7.19:1  (min 4.5) pass
dark  accent-ink    on accent 8.36:1  (min 4.5) pass
dark  success       on s1  10.02:1  (min 4.5) pass
dark  warning       on s1  9.77:1  (min 4.5) pass
dark  danger        on s1  6.46:1  (min 4.5) pass
dark  info          on s1  7.94:1  (min 4.5) pass
dark  success       on s2  9.11:1  (min 4.5) pass
dark  warning       on s2  8.88:1  (min 4.5) pass
dark  danger        on s2  5.88:1  (min 4.5) pass
dark  info          on s2  7.21:1  (min 4.5) pass
dark  border-strong on s0  4.25:1  (min 3) pass
dark  border-strong on s1  3.94:1  (min 3) pass
dark  accent        on s0  8.53:1  (min 3) pass
dark  accent        on s1  7.91:1  (min 3) pass
light text          on s0  16.34:1  (min 4.5) pass
light text          on s1  17.60:1  (min 4.5) pass
light text          on s2  15.29:1  (min 4.5) pass
light text          on s3  14.01:1  (min 4.5) pass
light muted         on s0  6.74:1  (min 4.5) pass
light muted         on s1  7.26:1  (min 4.5) pass
light muted         on s2  6.31:1  (min 4.5) pass
light muted         on s3  5.78:1  (min 4.5) pass
light accent        on s0  5.70:1  (min 4.5) pass
light accent        on s1  6.14:1  (min 4.5) pass
light accent        on s2  5.33:1  (min 4.5) pass
light accent-ink    on accent 6.14:1  (min 4.5) pass
light success       on s1  5.39:1  (min 4.5) pass
light warning       on s1  6.30:1  (min 4.5) pass
light danger        on s1  6.64:1  (min 4.5) pass
light info          on s1  6.06:1  (min 4.5) pass
light success       on s2  4.68:1  (min 4.5) pass
light warning       on s2  5.48:1  (min 4.5) pass
light danger        on s2  5.77:1  (min 4.5) pass
light info          on s2  5.27:1  (min 4.5) pass
light border-strong on s0  3.72:1  (min 3) pass
light border-strong on s1  4.00:1  (min 3) pass
light accent        on s0  5.70:1  (min 3) pass
light accent        on s1  6.14:1  (min 3) pass
```

## Brand details as built

- The brain mark (17 nodes, 34 lines) is an inline SVG in the header. As the loader its nodes pulse one after another; it stops under
  reduced motion and while the tab is hidden.
- The tab icon is an SVG data URL in three states: idle (cyan), working (teal with a dot) and error (red with a dot). It follows the
  status bar.
- Empty states use the faded brain with a small symbol (plus, magnifier, check, cross, rules). All colours are CSS variables, so both
  themes work.

## Screenshots

Twelve captures of the running app are in [screenshots/](screenshots/) (WebP, 420 KB in all) and shown in
[06-frontend.md](06-frontend.md). They were taken 2026-10-26 (UTC) from the Playwright Chromium on the seeded demo store, in dark and
light, at 1280 px and 375 px. Each shows the "Demo mode" banner because the page was opened with `?demo=1`. None shows real data.

## Accessibility audit

Contrast is in the table above and enforced by `test/ui-contrast.test.mjs`. `test/ui-a11y.test.mjs` checks names, roles, ids, tab
order, directions and the stylesheet rules on every page. A Chromium pass over 15 routes at 375, 768, 1280 and 1920 px (60
combinations, with a 200-character unbroken token and an Arabic paragraph in the data) found no page that scrolls sideways, no
control without a name and no duplicate id, after the fixes listed in [T-214](tasks/T-214.md). The two remaining targets under 40 px
are disabled Markdown task-list checkboxes and checkboxes inside a 40 px label.

## Measured performance

Machine: Intel Core i7-8850H, 12 logical CPUs, 30 GB RAM, Linux 7.0.0-38-generic. Browser: Chromium 156 through Playwright. Server and
browser on loopback, server started with `nice -n 10`, other processes running (the owner's tools and an agent). Date: 2026-10-26,
23:34 to 23:55 UTC. Data: `scripts/seed-demo.mjs --rows 5000` (5,000 memories, 1,667 facts, 278 review items), one run per
number unless a count is given. These are single-machine numbers, not a benchmark.

| Measure | Result |
|---|---|
| First paint of the shell (7 cold loads) | 68, 72, 76, 92, 92, 104, 104 ms; median 92 ms. **Under 100 ms in 5 of 7 loads, not in all.** |
| Layout shift, Memory page with 5,000 rows | 0.107 before the fixes in T-214 and T-216 (an empty status strip and brand mark changed height when script ran); after: Memory 0.012, Work 0.016, Rules 0.010, Tools 0.010, Facts 0.034 (under the 0.1 "good" line) |
| Scrolling a page of 100 cards (5,723 DOM nodes) | 302 frames in 4.0 s: median 13.3 ms, p95 13.4 ms, worst 13.5 ms, 0 frames over 33 ms |
| Clicking Next on the 5,000-row list until new rows show | 21 to 30 ms (8 clicks), scroll position kept |

API time per request (`bun scripts/measure-api.mjs`, 200 requests each, median and p95 in ms):

| Request | Median | p95 |
|---|---|---|
| `GET /api/hub/memories?limit=25 (random page)` | 6.1 | 13.3 |
| `GET /api/hub/memories?limit=100 (random page)` | 6.5 | 12.4 |
| `GET /api/hub/memories?q=retry&limit=25` | 8.6 | 14.1 |
| `GET /api/hub/memories?sort=oldest&since=… (date range)` | 10.1 | 20.7 |
| `GET /api/hub/facts?limit=25 (random page)` | 8.0 | 17.4 |
| `GET /api/hub/review?status=pending&limit=10&dupes=0` | 2.9 | 8.3 |
| `GET /api/hub/dismissed?limit=25` | 1.0 | 3.4 |
| `GET /api/hub/audit?limit=25` | 0.3 | 2.1 |
| `GET /v1/work/sessions?limit=10` | 42.1 | 54.2 |
| `GET /v1/work?sessions=1&facts=8&review=6` | 64.7 | 78.5 |
| `POST /v1/search (limit 25, paged)` | 31.2 | 38.7 |
| `GET /v1/health` | 34.8 | 43.4 |

Not measured: other machines, a spinning disk, Firefox or Safari, a store larger than 5,000 rows, and touch scrolling on a phone.
The health check (`/v1/health`) runs a SQLite quick check, which is why it costs 35 ms on this store; the status bar asks for it
every 10 to 30 s.
