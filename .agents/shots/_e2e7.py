
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
    pg.mouse.click(373, 308); pg.wait_for_timeout(2500)   # 皮肤
    pg.screenshot(path=".agents/shots/e2e-7-skin.png")
    print("当前:", skin(pg), bg(pg))
    print("dsh-ui 文本命中:", pg.locator("text=dsh-ui").count())
    print("官方默认命中:", pg.locator("text=官方默认").count())
    b.close()
