# -*- coding: utf-8 -*-
"""深色缺陷定量：在「同视口同坐标」下，比较
   (a) 插件期深色  dark-on.png
   (b) 插件关闭(官方深色) dark-off.png
   (c) 纯皮肤期深色基线 .agents/shots/m2-dark-home.png / m3-dark-home.png
采样点选在各表面的实心区域（避开文字与描边）。"""
import os, json
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
S = r"E:/dsh-theme/.agents/shots"

PTS = {
  "sidebar_fill":        (200, 620),   # 侧栏空白处
  "sidebar_fill_2":      (60, 700),
  "canvas":              (1100, 200),  # 主画布
  "composer_card_center":(720, 500),   # 输入卡实心区
  "composer_card_2":     (900, 530),
  "new_session_btn":     (140, 89),    # 侧栏主按钮
  "selected_row":        (200, 257),   # 会话选中行
}
FILES = {
  "plugin_dark_ON":   os.path.join(here, "dark-on.png"),
  "plugin_dark_OFF":  os.path.join(here, "dark-off.png"),
  "skin_baseline_m2": os.path.join(S, "m2-dark-home.png"),
  "skin_baseline_m3": os.path.join(S, "m3-dark-home.png"),
}
def lum(p): return round(0.2126*p[0] + 0.7152*p[1] + 0.0722*p[2], 1)
res = {"points": {}, "darkPct": {}}
ims = {}
for k, p in FILES.items():
    im = Image.open(p).convert("RGB"); ims[k] = im
    res["points"][k] = {}
    for n, (x, y) in PTS.items():
        px = im.getpixel((x, y))
        res["points"][k][n] = {"rgb": list(px), "lum": lum(px)}
    w, h = im.size; px = im.load(); dark = tot = 0
    for y in range(0, h, 3):
        for x in range(0, w, 3):
            tot += 1
            if lum(px[x, y]) < 60: dark += 1
    res["darkPct"][k] = round(100*dark/tot, 2)

# 判定：插件期深色 vs 纯皮肤期基线，逐点 Δ
res["verdict"] = {}
for n in PTS:
    a = res["points"]["plugin_dark_ON"][n]["rgb"]
    b = res["points"]["skin_baseline_m3"][n]["rgb"]
    d = max(abs(a[i]-b[i]) for i in range(3))
    res["verdict"][n] = {"plugin": a, "skin_baseline": b, "maxChannelDelta": d,
                         "match_within_2": d <= 2}
with open(os.path.join(here, "dark-defect-quant.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
