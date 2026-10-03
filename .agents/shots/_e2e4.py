
import sys
from playwright.sync_api import sync_playwright
url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    try:
        pg.click("text=继续", timeout=3000); print("dialog 已关")
    except Exception as e: print("无 dialog 或已关")
    pg.wait_for_timeout(1000)
    # 检查遮挡：设置按钮坐标处的实际元素
    el = pg.evaluate("() => { const e = document.elementFromPoint(56, 869); return e ? e.tagName + '.' + (e.className||'').toString().slice(0,80) : 'null' }")
    print("elementFromPoint(56,869):", el)
    pg.mouse.click(56, 869)
    pg.wait_for_timeout(2000)
    pg.screenshot(path=".agents/shots/e2e-settings.png")
    print("url:", pg.url)
    for label in ["皮肤中心", "皮肤"]:
        c = pg.locator("text=" + label).count()
        if c: print("入口:", label, c)
    b.close()
