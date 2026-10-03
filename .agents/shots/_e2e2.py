
import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    # 关掉预览版说明
    try:
        pg.click("text=继续", timeout=4000); pg.wait_for_timeout(800)
    except Exception as e: print("dialog:", e)
    # 开设置
    pg.click("text=设置", timeout=5000); pg.wait_for_timeout(1500)
    pg.screenshot(path=".agents/shots/e2e-settings.png")
    # 找皮肤中心入口
    for label in ["皮肤中心", "皮肤", "Skin"]:
        if pg.locator(f"text={label}").count():
            print("入口:", label, pg.locator(f"text={label}").count())
    b.close()
