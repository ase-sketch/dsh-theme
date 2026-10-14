# -*- coding: utf-8 -*-
"""深色像素对照：插件期深色截图 vs 纯皮肤期深色基线截图（.agents/shots/）。
目的：判断「卡片/侧栏在深色下仍是浅色」是插件引入的，还是纯皮肤期就有的既有行为。
同时给出暗区像素占比，证明深色真实可见（非仅计算值）。"""
import os, json, sys
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
S = r"E:/dsh-theme/.agents/shots"

def load(p):
    return Image.open(p).convert("RGB")

def stats(im, label):
    w, h = im.size
    px = im.load()
    dark = mid = light = 0
    tot = 0
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            r, g, b = px[x, y]
            lum = 0.2126*r + 0.7152*g + 0.0722*b
            tot += 1
            if lum < 60: dark += 1
            elif lum < 180: mid += 1
            else: light += 1
    return {"file": label, "size": [w, h], "darkPct": round(100*dark/tot, 2),
            "midPct": round(100*mid/tot, 2), "lightPct": round(100*light/tot, 2)}

POINTS = {"body_canvas": (720, 300), "sidebar": (90, 450), "composer_card": (720, 442),
          "composer_card_center": (720, 800), "new_session_btn": (140, 89)}

cands = {
  "plugin_dark_on": os.path.join(here, "dark-on.png"),
  "plugin_dark_off": os.path.join(here, "dark-off.png"),
  "skin_m2_dark_home": os.path.join(S, "m2-dark-home.png"),
  "skin_m3_dark_home": os.path.join(S, "m3-dark-home.png"),
  "skin_m3_preview_dark": os.path.join(S, "m3-preview-dark.png"),
}
res = {"points": {}, "stats": {}}
ims = {}
for k, p in cands.items():
    if not os.path.exists(p):
        res["stats"][k] = {"error": "missing", "path": p}; continue
    im = load(p); ims[k] = im
    res["stats"][k] = stats(im, k)
    res["points"][k] = {}
    for pn, (x, y) in POINTS.items():
        if x < im.size[0] and y < im.size[1]:
            res["points"][k][pn] = list(im.getpixel((x, y)))
        else:
            res["points"][k][pn] = None
with open(os.path.join(here, "dark-pixel-compare.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
