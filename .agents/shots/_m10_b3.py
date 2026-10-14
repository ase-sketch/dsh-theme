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
    ed = pg.query_selector('[contenteditable="true"]')
    ed.click(); pg.keyboard.type("ping", delay=30); pg.keyboard.press("Enter")
    pg.wait_for_timeout(4000)
    ed2 = pg.query_selector('[contenteditable="true"]')
    ed2.click(); pg.keyboard.type("typing", delay=40)
    pg.wait_for_timeout(1000)
    r = pg.evaluate("""() => {
      const d = document.querySelector('#dsh-theme-deepy');
      const sp = d ? d.querySelector('.dsh-theme-deepy-sprite') : null;
      return { editing: d ? d.getAttribute('data-dsh-editing') : null,
               sprite: sp ? (sp.style.backgroundImage || '').slice(-30) : null };
    }""")
    print("typing:", json.dumps(r))
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m10-lookup.png")
    pg.keyboard.press("Control+a"); pg.keyboard.press("Backspace"); pg.wait_for_timeout(1000)
    r2 = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); const sp = d ? d.querySelector('.dsh-theme-deepy-sprite') : null; return sp ? (sp.style.backgroundImage || '').slice(-30) : null; }""")
    print("cleared:", json.dumps(r2))
    ok = r["editing"] is not None and "idle-look" in (r["sprite"] or "") and "idle-look" not in (r2 or "")
    print("B3-RETEST:", "PASS" if ok else "FAIL")
    b.close()
