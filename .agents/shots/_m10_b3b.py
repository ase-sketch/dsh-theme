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
    # 等回合结束（鲸鱼回 idle）
    for i in range(30):
        s = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); const sp = d ? d.querySelector('.dsh-theme-deepy-sprite') : null; return sp ? (sp.style.backgroundImage || '').split('/').pop() : 'none'; }""")
        if "idle" in s and "look" not in s: break
        pg.wait_for_timeout(2000)
    print("settled state:", s)
    ed = pg.query_selector('[contenteditable="true"]')
    ed.click(); pg.keyboard.type("hello", delay=50)
    pg.wait_for_timeout(1000)
    r = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); const sp = d ? d.querySelector('.dsh-theme-deepy-sprite') : null; return sp ? (sp.style.backgroundImage || '').split('/').pop() : null; }""")
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m10-lookup.png")
    print("typing →", r)
    pg.keyboard.press("Control+a"); pg.keyboard.press("Backspace"); pg.wait_for_timeout(1000)
    r2 = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); const sp = d ? d.querySelector('.dsh-theme-deepy-sprite') : null; return sp ? (sp.style.backgroundImage || '').split('/').pop() : null; }""")
    print("cleared →", r2)
    ok = r and "idle-look" in r and r2 and "idle-look" not in r2
    print("B3-RETEST:", "PASS" if ok else "FAIL")
    b.close()
