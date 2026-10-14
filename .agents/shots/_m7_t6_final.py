# -*- coding: utf-8 -*-
"""T6 终检：单鲸规则 + 全要素回归。"""
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:19488/?token=<REDACTED>"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    pg = b.new_context(viewport={"width":1440,"height":900}).new_page()
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("pageerror:" + str(e)[:200]))
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(3000)

    empty_state = pg.evaluate("""() => {
      const hero = document.querySelector('#dsh-theme-deepy-hero') || document.querySelector('[data-slot="conversation.hero.brand.mark"] [id*="deepy"]');
      const main = document.querySelector('#dsh-theme-deepy');
      const dbg = window.__deepy || null;
      return {
        heroPresent: !!hero,
        mainPresent: !!main,
        mainVisibleInDom: main ? !!main.offsetParent || main.getClientRects().length > 0 : false,
        dbgHero: dbg && dbg.isHeroPresent ? dbg.isHeroPresent() : null,
        dbgMain: dbg && dbg.isMainVisible ? dbg.isMainVisible() : null,
        icons: document.documentElement.getAttribute('data-dsh-icons'),
        bodyBg: getComputedStyle(document.body).backgroundColor,
      };
    }""")
    print("空会话:", json.dumps(empty_state, ensure_ascii=False))
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m7-t6-singlewhale.png")

    # 发一条消息激活会话 → hero 应消失、主位应回来
    sent = pg.evaluate("""() => {
      const ed = document.querySelector('[contenteditable="true"]');
      if (!ed) return false;
      ed.focus(); ed.textContent = 'ping';
      ed.dispatchEvent(new InputEvent('input', {bubbles:true}));
      return true;
    }""")
    pg.wait_for_timeout(500)
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>x.getAttribute('aria-label')==='发送' || /发送|Send/.test(x.getAttribute('aria-label')||'')); if(b) b.click(); }""")
    pg.wait_for_timeout(4000)
    active_state = pg.evaluate("""() => {
      const hero = document.querySelector('#dsh-theme-deepy-hero');
      const main = document.querySelector('#dsh-theme-deepy');
      const dbg = window.__deepy || null;
      return {
        heroPresent: !!hero,
        mainPresent: !!main,
        dbgHero: dbg && dbg.isHeroPresent ? dbg.isHeroPresent() : null,
        dbgMain: dbg && dbg.isMainVisible ? dbg.isMainVisible() : null,
        icons: document.documentElement.getAttribute('data-dsh-icons'),
      };
    }""")
    print("活跃会话:", json.dumps(active_state, ensure_ascii=False))
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m7-t6-active.png")
    print("console errors:", errs[:5] if errs else "0")

    ok = (empty_state["heroPresent"] and not empty_state["mainPresent"]
          and active_state["mainPresent"] and len(errs) == 0)
    print("SINGLE-WHALE + ACTIVATION:", "PASS" if ok else "FAIL")
    b.close()
