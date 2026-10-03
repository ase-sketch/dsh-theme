
import sys
from playwright.sync_api import sync_playwright
url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(6000)
    skin = pg.evaluate("document.documentElement.getAttribute('data-dsh-skin')")
    bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    brand = pg.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--dsw-alias-brand-primary')")
    pg.screenshot(path=".agents/shots/e2e-first-paint.png")
    print("data-dsh-skin:", skin)
    print("body background:", bg)
    print("--dsw-alias-brand-primary:", brand.strip())
    print("pageerrors:", errors[:3] if errors else "无")
    b.close()
