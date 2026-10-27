#!/usr/bin/env python3
"""Sample the Aletheia logo and print its palette as JSON. Read-only; no dependency except Pillow."""
import json, sys
from collections import Counter
from PIL import Image

path = sys.argv[1] if len(sys.argv) > 1 else "docs/assets/logo.png"
im = Image.open(path).convert("RGBA")
w, h = im.size
px = im.load()

def hexc(c): return "#%02x%02x%02x" % c[:3]
def lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
def sat(c):
    mx, mn = max(c[:3]), min(c[:3])
    return 0 if mx == 0 else (mx - mn) / mx

corners = [px[2, 2], px[w - 3, 2], px[2, h - 3], px[w - 3, h - 3]]
opaque = [px[x, y][:3] for y in range(0, h, 3) for x in range(0, w, 3) if px[x, y][3] > 200]
q = Counter(tuple(v // 8 * 8 + 4 for v in c) for c in opaque)
bg = Counter(tuple(v // 8 * 8 + 4 for v in c[:3]) for c in corners).most_common(1)[0][0]
bright = [c for c in opaque if lum(c) > 0.2]
saturated = sorted((c for c in opaque if sat(c) > 0.45 and lum(c) > 0.08), key=lum)
silver = [c for c in opaque if sat(c) < 0.15 and lum(c) > 0.5]
def avg(cs): return tuple(sum(c[i] for c in cs) // len(cs) for i in range(3)) if cs else None
def pct(cs, p): return cs[int(len(cs) * p)] if cs else None
hue_cyan = [c for c in saturated if c[2] > c[0] + 60 and c[1] > c[0] + 40]
hue_blue = [c for c in saturated if c[2] > c[1] + 40 and c[2] > c[0] + 60]
out = {
    "size": [w, h],
    "background": hexc(bg),
    "corner_alpha": [c[3] for c in corners],
    "dominant": [[hexc(k), n] for k, n in q.most_common(8)],
    "cyan_range": {"dark": hexc(pct(hue_cyan, 0.1)), "mid": hexc(pct(hue_cyan, 0.5)), "light": hexc(pct(hue_cyan, 0.95))} if hue_cyan else None,
    "blue_nodes": {"mid": hexc(pct(hue_blue, 0.5)), "light": hexc(pct(hue_blue, 0.9))} if hue_blue else None,
    "silver": hexc(avg(silver)) if silver else None,
    "brightest": hexc(max(opaque, key=lum)),
}
print(json.dumps(out, indent=2))
