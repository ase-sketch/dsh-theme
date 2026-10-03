
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
    print("起点:", skin(pg), bg(pg))
    # 经 API 切回官方默认
    r1 = pg.evaluate("""async () => {
      const res = await fetch('/api/skin-center/v2/active', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({active: null}) });
      return res.status;
    }""")
    pg.wait_for_timeout(2000)
    print("POST null:", r1, "→", skin(pg), bg(pg))
    pg.screenshot(path=".agents/shots/e2e-12-stock.png")
    # 经 API 切回 dsh-ui
    r2 = pg.evaluate("""async () => {
      const res = await fetch('/api/skin-center/v2/active', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({active: 'dsh-ui'}) });
      return res.status;
    }""")
    pg.wait_for_timeout(2000)
    print("POST dsh-ui:", r2, "→", skin(pg), bg(pg))
    pg.screenshot(path=".agents/shots/e2e-12-back.png")
    b.close()
