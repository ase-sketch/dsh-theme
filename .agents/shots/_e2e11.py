
import sys
from playwright.sync_api import sync_playwright
url = sys.argv[1]
def bg(pg): return pg.evaluate("getComputedStyle(document.body).backgroundColor")
def skin(pg): return pg.evaluate("document.documentElement.getAttribute('data-dsh-skin')")
def click_card_button(pg, name, btn):
    return pg.evaluate("""([name, btn]) => {
      for (const el of document.querySelectorAll('*')) {
        if (el.children.length === 0 && el.textContent === name) {
          el.scrollIntoView({block:'center'});
          let card = el;
          for (let i=0; i<8 && card; i++) {
            if (card.querySelector && card.querySelector('button')) break;
            card = card.parentElement;
          }
          if (!card) return 'no-card';
          for (const b of card.querySelectorAll('button')) {
            if (b.textContent.trim() === btn) { b.click(); return 'clicked'; }
          }
          return 'no-btn';
        }
      }
      return 'no-name';
    }""", [name, btn])
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    pg.mouse.click(933, 577); pg.wait_for_timeout(1200)
    pg.mouse.click(56, 869); pg.wait_for_timeout(2500)
    pg.mouse.click(373, 308); pg.wait_for_timeout(2500)

    print("== 切到官方默认 ==")
    print(click_card_button(pg, "官方默认", "应用"))
    pg.wait_for_timeout(2500)
    print("状态:", skin(pg), bg(pg))
    pg.screenshot(path=".agents/shots/e2e-11-stock.png")

    print("== 切回 dsh-ui ==")
    print(click_card_button(pg, "dsh-ui Design Spec", "应用"))
    pg.wait_for_timeout(2500)
    print("状态:", skin(pg), bg(pg))
    pg.screenshot(path=".agents/shots/e2e-11-dshui.png")

    print("== 深色模式检查 ==")
    # 皮肤面板有 主题预览 亮色/暗色；系统外观在通用设置。直接用 shell 的 dark 属性试
    dark_bg = pg.evaluate("""() => {
      document.body.setAttribute('data-ds-dark-theme','');
      const v = getComputedStyle(document.body).backgroundColor;
      document.body.removeAttribute('data-ds-dark-theme');
      return v;
    }""")
    print("手动置 dark 后 body bg:", dark_bg)
    b.close()
