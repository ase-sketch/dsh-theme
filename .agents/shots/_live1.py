
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto("http://127.0.0.1:19387", wait_until="domcontentloaded", timeout=15000)
    pg.wait_for_timeout(3000)
    pg.screenshot(path=".agents/shots/live-home.png")
    print("title:", pg.title())
    print("url:", pg.url)
    # 找设置入口候选
    for sel in ["[data-slot*=setting]", "[class*=setting]", "button[title*=设置]", "[aria-label*=setting]", "[aria-label*=设置]"]:
        n = pg.locator(sel).count()
        if n: print("候选:", sel, n)
    b.close()
