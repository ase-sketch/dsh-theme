
import sys
from playwright.sync_api import sync_playwright
url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    try: pg.click("text=继续", timeout=3000); pg.wait_for_timeout(600)
    except Exception: pass
    n = pg.locator("text=设置").count()
    print("text=设置 匹配数:", n)
    for i in range(min(n, 5)):
        el = pg.locator("text=设置").nth(i)
        print(i, el.bounding_box())
    # 点最后一个（侧栏底部那个）
    pg.locator("text=设置").last.click(timeout=5000)
    pg.wait_for_timeout(2000)
    pg.screenshot(path=".agents/shots/e2e-settings.png")
    # 找皮肤中心
    for label in ["皮肤中心", "皮肤", "Skin", "skin"]:
        c = pg.locator(f"text={label}").count()
        if c: print("入口:", label, c)
    b.close()
