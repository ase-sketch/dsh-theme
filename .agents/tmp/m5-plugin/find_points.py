# -*- coding: utf-8 -*-
"""找输入卡区域里真正有区分力的采样点（ON vs OFF）。"""
import os, json
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
on = Image.open(os.path.join(here,"on-full.png")).convert("RGB")
off = Image.open(os.path.join(here,"off-full.png")).convert("RGB")
po, pf = on.load(), off.load()
# 输入卡大致区域 x 470..1250, y 440..560
cands = []
for y in range(430, 580, 2):
    for x in range(455, 1270, 4):
        a, b = po[x,y], pf[x,y]
        if a != b:
            cands.append((x, y, a, b))
print("differing pixels in composer band:", len(cands))
for c in cands[:15]:
    print(" ", c)
# 卡上边缘 y 扫描
for y in range(438, 452):
    a, b = po[720,y], pf[720,y]
    print(f"  y={y} on={a} off={b} {'DIFF' if a!=b else ''}")
