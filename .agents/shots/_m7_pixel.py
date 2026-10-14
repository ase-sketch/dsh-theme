# -*- coding: utf-8 -*-
from PIL import Image
im = Image.open(r"E:/dsh-theme/.agents/shots/m7-icon-final-dark.png").convert("RGB")
w,h = im.size
print("size:", im.size)
for label,(x,y) in {"canvas-topright":(int(w*0.6),int(h*0.05)),"main-area":(int(w*0.55),int(h*0.55)),"sidebar":(int(w*0.09),int(h*0.5)),"button":(int(w*0.09),int(h*0.105))}.items():
    print(label, im.getpixel((x,y)))
