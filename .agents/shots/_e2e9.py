
import sys
from playwright.sync_api import sync_playwright
url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    pg.mouse.click(933, 577); pg.wait_for_timeout(1200)
    pg.mouse.click(56, 869); pg.wait_for_timeout(2500)
    pg.mouse.click(373, 308); pg.wait_for_timeout(2500)
    info = pg.evaluate("""() => {
      const out = [];
      const all = document.querySelectorAll('*');
      for (const el of all) {
        if (el.children.length === 0 && el.textContent && el.textContent.includes('dsh-ui')) {
          const r = el.getBoundingClientRect();
          out.push({ tag: el.tagName, cls: (el.className||'').toString().slice(0,50), text: el.textContent.slice(0,40), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width) });
        }
      }
      return out.slice(0, 10);
    }""")
    for it in info: print(it)
    b.close()
