# -*- coding: utf-8 -*-
"""Pixel sample of the gate screenshots: is orange actually PAINTED, not just computed?"""
import sys, json, os
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
out = {}
for label in ("negctrl", "probe"):
    p = os.path.join(here, label + ".png")
    im = Image.open(p).convert("RGB")
    w, h = im.size
    # sample a grid, skipping the very top chrome and the preview dialog area
    pts = [(int(w*0.06), int(h*0.30)), (int(w*0.50), int(h*0.85)), (int(w*0.94), int(h*0.30)),
           (int(w*0.50), int(h*0.55)), (int(w*0.06), int(h*0.92))]
    samples = [{"xy": [x, y], "rgb": list(im.getpixel((x, y)))} for x, y in pts]
    colors = im.getcolors(maxcolors=1 << 24) or []
    colors.sort(reverse=True)
    out[label] = {
        "size": [w, h],
        "samples": samples,
        "topColors": [{"rgb": list(c), "count": n} for n, c in colors[:6]],
        "orangePixels": sum(n for n, c in colors if c[0] > 240 and 120 < c[1] < 160 and c[2] < 30),
        "totalPixels": w * h,
    }
    o = out[label]
    o["orangePct"] = round(100.0 * o["orangePixels"] / o["totalPixels"], 2)

with open(os.path.join(here, "pixel-check.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1))
