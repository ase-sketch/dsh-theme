# -*- coding: utf-8 -*-
import json
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:19488/?token=<REDACTED>"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    pg = b.new_context(viewport={"width":1440,"height":900}).new_page()
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)
    # 点含 ping 的会话行
    clicked = pg.evaluate("""() => {
      const rows = [...document.querySelectorAll('[class*=sessionRow]')];
      const t = rows.find(r => /ping|typing|hello/.test(r.textContent||''));
      const any = rows.find(r => (r.textContent||'').trim().length > 0);
      const pick = t || any;
      if (pick) { pick.click(); return (pick.textContent||'').slice(0, 30); }
      return null;
    }""")
    print("clicked:", clicked)
    pg.wait_for_timeout(3000)
    st = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); const sp = d ? d.querySelector('.dsh-theme-deepy-sprite') : null; return { deepy: !!d, hero: !!document.querySelector('#dsh-theme-deepy-hero'), sprite: sp ? (sp.style.backgroundImage||'').split('/').pop() : null }; }""")
    print("state:", json.dumps(st))
    if st["deepy"]:
        ed = pg.query_selector('[contenteditable="true"]')
        ed.click(); pg.keyboard.type("hello", delay=50)
        pg.wait_for_timeout(1000)
        r = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); const sp = d.querySelector('.dsh-theme-deepy-sprite'); return { editing: d.getAttribute('data-dsh-editing'), sprite: (sp.style.backgroundImage||'').split('/').pop() }; }""")
        print("typing →", json.dumps(r))
        pg.screenshot(path="E:/dsh-theme/.agents/shots/m10-lookup.png")
        pg.keyboard.press("Control+a"); pg.keyboard.press("Backspace"); pg.wait_for_timeout(1000)
        r2 = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); const sp = d.querySelector('.dsh-theme-deepy-sprite'); return (sp.style.backgroundImage||'').split('/').pop(); }""")
        print("cleared →", r2)
        ok = "idle-look" in (r["sprite"] or "") and "idle-look" not in (r2 or "")
        print("B3-RETEST:", "PASS" if ok else "FAIL")
    b.close()
