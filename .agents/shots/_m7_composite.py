# -*- coding: utf-8 -*-
from PIL import Image
import os
D = "E:/dsh-theme/.agents/shots"

def pair(a, b, out, w=720):
    ia, ib = Image.open(f"{D}/{a}"), Image.open(f"{D}/{b}")
    ha = int(ia.height * w / ia.width); hb = int(ib.height * w / ib.width)
    h = max(ha, hb)
    c = Image.new("RGB", (w*2+8, h), (24,24,24))
    c.paste(ia.resize((w,ha)), (0,0)); c.paste(ib.resize((w,hb)), (w+8,0))
    c.save(f"{D}/{out}")
    print(out, c.size)

def quad(a, b, c_, d, out, w=720):
    ims = [Image.open(f"{D}/{x}") for x in (a,b,c_,d)]
    rs = []
    for im in ims:
        hh = int(im.height * w / im.width)
        rs.append(im.resize((w,hh)))
    colh = [max(rs[0].height, rs[2].height), max(rs[1].height, rs[3].height)]
    H = max(colh); W = w*2+8
    c = Image.new("RGB", (W, H*2+8), (24,24,24))
    c.paste(rs[0], (0,0)); c.paste(rs[1], (w+8,0))
    c.paste(rs[2], (0,H+8)); c.paste(rs[3], (w+8,H+8))
    c.save(f"{D}/{out}")
    print(out, c.size)

# 1. hero 对照
pair("m7-design-dark.png", "m7-design-light.png", "m7-pair-hero.png")
# 2. 侧栏 + 设置面板 对照
quad("m7-sec-dark-sidebar.png", "m7-sec-light-sidebar.png", "m7-sec-dark-settings.png", "m7-sec-light-settings.png", "m7-pair-a.png")
# 3. 消息流/输入卡区段 + toast/图标区段 对照（用固定滚动段）
quad("m7-sec-dark-00.png", "m7-sec-light-00.png", "m7-sec-dark-01.png", "m7-sec-light-01.png", "m7-pair-b.png")
# 4. token 面板头部可读裁切（原分辨率）
t = Image.open(f"{D}/m7-sec-dark-tokens.png")
print("tokens full:", t.size)
t.crop((0, 0, 1440, 1300)).save(f"{D}/m7-tokens-head.png")
print("tokens head:", (1440, 1300))
