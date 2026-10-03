
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
    pg.mouse.click(933, 577); pg.wait_for_timeout(1200)   # 关弹窗
    pg.mouse.click(56, 869); pg.wait_for_timeout(2500)    # 设置
    pg.screenshot(path=".agents/shots/e2e-6-settings.png")
    # 找皮肤中心入口并点进去
    c = pg.locator("text=皮肤中心").count()
    print("皮肤中心入口数:", c)
    if c:
        pg.locator("text=皮肤中心").first.click(timeout=5000)
        pg.wait_for_timeout(2500)
        pg.screenshot(path=".agents/shots/e2e-6-skincenter.png")
        print("当前:", skin(pg), bg(pg))
        d = pg.locator("text=dsh-ui").count()
        print("dsh-ui 卡片文本命中:", d)
    b.close()
