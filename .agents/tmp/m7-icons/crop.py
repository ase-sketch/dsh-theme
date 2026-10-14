# -*- coding: utf-8 -*-
from PIL import Image
import os
OUT = r"E:\dsh-theme\.agents\tmp\m7-icons"
# 新会话按钮图标区域：1440x900 下约 (100,78)-(132,101)
box = (95, 74, 145, 106)
for src, dst, scale in [("aba-A-off.png", "crop-newsession-off.png", 8), ("toggle-on2.png", "crop-newsession-on.png", 8), ("aba-B-on.png", "crop-newsession-onB.png", 8)]:
    p = os.path.join(OUT, src)
    if not os.path.exists(p): continue
    im = Image.open(p).convert("RGB").crop(box)
    im = im.resize((im.width*scale, im.height*scale), Image.NEAREST)
    im.save(os.path.join(OUT, dst))
    print(dst, im.size)
# 并排拼一张
a = Image.open(os.path.join(OUT, "crop-newsession-off.png"))
b = Image.open(os.path.join(OUT, "crop-newsession-on.png"))
c = Image.new("RGB", (a.width + b.width + 20, max(a.height, b.height)), (255,255,255))
c.paste(a, (0,0)); c.paste(b, (a.width+20, 0))
c.save(os.path.join(OUT, "crop-newsession-compare.png"))
print("compare saved", c.size)
