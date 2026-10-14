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
    pg.wait_for_timeout(2500)
    # 激活会话看主位鲸鱼
    ed = pg.query_selector('[contenteditable="true"]')
    ed.click(); pg.keyboard.type("ping", delay=30); pg.keyboard.press("Enter")
    pg.wait_for_timeout(3500)
    r = pg.evaluate("""() => {
      const d = document.querySelector('#dsh-theme-deepy');
      const card = document.querySelector('[data-composer-card]');
      if (!d || !card) return null;
      const dr = d.getBoundingClientRect(); const cr = card.getBoundingClientRect();
      return { whaleTop: Math.round(dr.top), whaleRight: Math.round(dr.right),
               cardTop: Math.round(cr.top), cardRight: Math.round(cr.right),
               aboveCard: dr.top < cr.top, nearRight: Math.abs(dr.right - cr.right) < 40,
               pos: getComputedStyle(d).position };
    }""")
    print("whale:", json.dumps(r))
    ok = r and r["pos"] == "absolute" and r["aboveCard"] and r["nearRight"]
    print("POSITION:", "PASS" if ok else "FAIL")
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m10-perch-topright2.png")
    print("pageerrors:", errs if errs else "0")
    b.close()
