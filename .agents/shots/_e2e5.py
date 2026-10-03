
import sys
from playwright.sync_api import sync_playwright
url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    pg.mouse.click(933, 577)  # 继续按钮中心
    pg.wait_for_timeout(1500)
    probe = pg.evaluate("() => { const e = document.elementFromPoint(56, 869); return e ? e.tagName + '.' + (e.className||'').toString().slice(0,60) : 'null' }")
    print("遮挡检查:", probe)
    pg.screenshot(path=".agents/shots/e2e-after-dismiss.png")
    b.close()
