
import sys
from playwright.sync_api import sync_playwright
url = sys.argv[1]
def bg(pg): return pg.evaluate("getComputedStyle(document.body).backgroundColor")
def skin(pg): return pg.evaluate("document.documentElement.getAttribute('data-dsh-skin')")
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    pg.mouse.click(933, 577); pg.wait_for_timeout(1200)
    pg.mouse.click(56, 869); pg.wait_for_timeout(2500)
    pg.mouse.click(373, 308); pg.wait_for_timeout(2500)
    # 列出卡片文本位置
    for label in ["官方默认", "dsh-ui 设计规范", "蓝色幻想", "使用中", "应用", "试穿"]:
        loc = pg.locator("text=" + label)
        for i in range(min(loc.count(), 3)):
            bb = loc.nth(i).bounding_box()
            if bb: print(f"{label}[{i}]:", round(bb["x"]), round(bb["y"]), round(bb["width"]), round(bb["height"]))
    b.close()
