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
    # 进活跃会话（点第一个会话行）
    pg.evaluate("""() => { const rows=[...document.querySelectorAll('[class*=sessionRow]')]; if(rows.length) rows[0].click(); }""")
    pg.wait_for_timeout(2500)
    st = pg.evaluate("""() => ({
      deepy: !!document.querySelector('#dsh-theme-deepy'),
      hero: !!document.querySelector('#dsh-theme-deepy-hero')
    })""")
    print("active session state:", json.dumps(st))
    ed = pg.query_selector('[contenteditable="true"]')
    ed.click(); pg.keyboard.type("测试联动", delay=40)
    pg.wait_for_timeout(800)
    r = pg.evaluate("""() => {
      const d = document.querySelector('#dsh-theme-deepy');
      return { editing: d ? d.getAttribute('data-dsh-editing') : null, exists: !!d };
    }""")
    print("typing →", json.dumps(r))
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m9-editing-glow.png")
    # 清空回落
    pg.keyboard.press("Control+a"); pg.keyboard.press("Backspace"); pg.wait_for_timeout(800)
    r2 = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); return d ? d.getAttribute('data-dsh-editing') : null; }""")
    print("cleared →", json.dumps(r2))
    ok = r["exists"] and r["editing"] is not None and r2 is None
    print("F3-RETEST:", "PASS" if ok else "FAIL")
    b.close()
