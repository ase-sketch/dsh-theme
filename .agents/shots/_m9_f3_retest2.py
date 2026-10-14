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
    # 从 hero 态发一条消息激活会话
    ed = pg.query_selector('[contenteditable="true"]')
    ed.click(); pg.keyboard.type("ping", delay=30); pg.keyboard.press("Enter")
    pg.wait_for_timeout(4000)
    st = pg.evaluate("""() => ({ deepy: !!document.querySelector('#dsh-theme-deepy'), hero: !!document.querySelector('#dsh-theme-deepy-hero') })""")
    print("after send:", json.dumps(st))
    if st["deepy"]:
        ed2 = pg.query_selector('[contenteditable="true"]')
        ed2.click(); pg.keyboard.type("测试联动", delay=40)
        pg.wait_for_timeout(800)
        r = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); return d ? d.getAttribute('data-dsh-editing') : null; }""")
        pg.screenshot(path="E:/dsh-theme/.agents/shots/m9-editing-glow.png")
        pg.keyboard.press("Control+a"); pg.keyboard.press("Backspace"); pg.wait_for_timeout(800)
        r2 = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); return d ? d.getAttribute('data-dsh-editing') : null; }""")
        print("typing:", json.dumps(r), "| cleared:", json.dumps(r2))
        print("F3-RETEST:", "PASS" if (r is not None and r2 is None) else "FAIL")
    else:
        print("F3-RETEST: SKIP (session not activated)")
    b.close()
