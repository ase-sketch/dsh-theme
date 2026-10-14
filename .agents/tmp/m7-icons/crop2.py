# -*- coding: utf-8 -*-
from PIL import Image
import os
OUT = r"E:\dsh-theme\.agents\tmp\m7-icons"
box = (95, 74, 145, 106)
ims = []
for src in ["aba-A-off.png", "final-light.png"]:
    p = os.path.join(OUT, src)
    im = Image.open(p).convert("RGB")
    if im.width > 2000:
        im = im.resize((im.width//2, im.height//2), Image.LANCZOS)
    ims.append(im.crop(box).resize((400, 256), Image.NEAREST))
c = Image.new("RGB", (820, 256), (255,255,255))
c.paste(ims[0], (0,0)); c.paste(ims[1], (420,0))
c.save(os.path.join(OUT, "final-newsession-compare.png"))
print("saved", c.size)
