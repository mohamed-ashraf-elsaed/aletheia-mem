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

## Brand details

- The brain mark is an inline SVG of connected nodes. It sits in the header and animates as the loading mark: the
  nodes pulse one after another.
- The favicon is an SVG that changes in three states (idle, working, error) by swapping a data URL in JavaScript.
- The empty-state picture is an inline SVG that uses the same palette through CSS variables.
