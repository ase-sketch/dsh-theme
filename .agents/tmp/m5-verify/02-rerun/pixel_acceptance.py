# -*- coding: utf-8 -*-
"""验收 7：像素采样 —— 皮肤色是否真的画在 shell 的实际绘制层上。
ON / OFF 同视口、同区域、同坐标对比。采样点全部选在 M3 已验收的组件上。
"""
import json, os
from PIL import Image

here = os.path.dirname(os.path.abspath(__file__))
def load(n): return Image.open(os.path.join(here, n)).convert("RGB")

on, off = load("on-full.png"), load("off-full.png")
w, h = on.size
# 采样点：侧栏衬底、侧栏主按钮（实心品牌蓝）、输入卡（纯白+描边）、会话选中行
POINTS = {
    "sidebar_bg":    (90, 450),
    "new_session_btn": (140, 89),
    "composer_card_border": (720, 442),
    "selected_row":  (120, 257),
}
res = {"size": [w, h], "points": {}, "allDiffer": True}
for name, (x, y) in POINTS.items():
    a, b = on.getpixel((x, y)), off.getpixel((x, y))
    res["points"][name] = {"xy": [x, y], "on": list(a), "off": list(b), "differ": a != b}
    if a == b: res["allDiffer"] = False

diff = 0; sampled = 0
pa, pb = on.load(), off.load()
for y in range(0, h, 3):
    for x in range(0, w, 3):
        sampled += 1
        if pa[x, y] != pb[x, y]: diff += 1
res["diffPctSampled"] = round(100.0 * diff / sampled, 2)

def count(im, target, tol=6):
    n = 0; px = im.load()
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            if abs(r-target[0]) <= tol and abs(g-target[1]) <= tol and abs(b-target[2]) <= tol: n += 1
    return n
res["brandBlue_4D6BFE"] = {"on": count(on, (77,107,254)), "off": count(off, (77,107,254))}
res["sidebarTint_F3F7FE"] = {"on": count(on, (243,247,254)), "off": count(off, (243,247,254))}
res["verdict"] = "皮肤色确实画在 shell 绘制层上" if (res["allDiffer"] and res["brandBlue_4D6BFE"]["on"] > res["brandBlue_4D6BFE"]["off"]) else "未证明"

with open(os.path.join(here, "pixel-acceptance.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
