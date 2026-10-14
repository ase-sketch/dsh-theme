# -*- coding: utf-8 -*-
import json
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:19488/?token=<REDACTED>"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    pg = b.new_context(viewport={"width":1440,"height":900}).new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)
    ed = pg.query_selector('[contenteditable="true"]')
    ed.click()
    pg.keyboard.type("ping", delay=30)
    pg.wait_for_timeout(500)
    pg.keyboard.press("Enter")
    pg.wait_for_timeout(6000)
    st = pg.evaluate("""() => {
      const hero = document.querySelector('#dsh-theme-deepy-hero');
      const main = document.querySelector('#dsh-theme-deepy');
      const heroSlot = document.querySelector('[data-slot="conversation.hero.brand.mark"]');
      return { hero: !!hero, main: !!main, heroSlotRendered: !!heroSlot,
               url: location.href.slice(0, 90),
               hasMessages: document.body.innerText.includes('ping') };
    }""")
    print("激活后:", json.dumps(st, ensure_ascii=False))
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m7-t6-active2.png")
    print("pageerrors:", errs if errs else "0")
    ok = st["main"] and not st["hero"] and st["hasMessages"]
    print("ACTIVATION-SWITCH:", "PASS" if ok else "FAIL")
    b.close()
