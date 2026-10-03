
import sys
from playwright.sync_api import sync_playwright
url = sys.argv[1]
def bg(pg): return pg.evaluate("getComputedStyle(document.body).backgroundColor")
def skin(pg): return pg.evaluate("document.documentElement.getAttribute('data-dsh-skin')")
def open_panel(pg):
    pg.mouse.click(933, 577); pg.wait_for_timeout(1200)
    pg.mouse.click(56, 869); pg.wait_for_timeout(2500)
    pg.mouse.click(373, 308); pg.wait_for_timeout(2500)
def scroll_card(pg, name):
    return pg.evaluate("""(name) => {
      for (const el of document.querySelectorAll('*')) {
        if (el.children.length === 0 && el.textContent === name) {
          el.scrollIntoView({block:'center'});
          let card = el;
          for (let i=0; i<8 && card; i++) {
            if (card.querySelector && card.querySelector('button')) break;
            card = card.parentElement;
          }
          const btns = card ? [...card.querySelectorAll('button')].map(b=>b.textContent.trim()) : [];
          return btns;
        }
      }
      return null;
    }""", name)
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    open_panel(pg)
    btns = scroll_card(pg, "dsh-ui Design Spec")
    print("dsh-ui 卡按钮:", btns)
    pg.wait_for_timeout(800)
    pg.screenshot(path=".agents/shots/e2e-10-card.png")
    print("当前:", skin(pg), bg(pg))
    b.close()
