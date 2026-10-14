# -*- coding: utf-8 -*-
from PIL import Image
for name, src in [("light", "m7-t6-light.png"), ("dark", "m7-t6-dark.png")]:
    im = Image.open(f"E:/dsh-theme/.agents/shots/{src}").convert("RGB")
    im.save(f"E:/dsh-theme/skins/dsh-ui/preview/{name}.jpg", quality=88)
    print(name, im.size)
