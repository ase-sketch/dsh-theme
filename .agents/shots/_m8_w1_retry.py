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
    pg.wait_for_timeout(2500)
    # 确保从浅色出发
    cur = pg.evaluate("document.body.hasAttribute('data-ds-dark-theme')")
    print("initial dark:", cur)
    if cur:
        pg.evaluate("""() => { const b=[...document.querySelectorAll('button,[role=button]')].find(x=>/设置|Settings/i.test(x.getAttribute('aria-label')||x.textContent||'')); if(b) b.click(); }""")
        pg.wait_for_timeout(2000)
        pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='浅色'); if(b) b.click(); }""")
        pg.wait_for_timeout(2000)
        pg.evaluate("""() => { const b=[...document.querySelectorAll('button,[role=button]')].find(x=>/关闭|Close/i.test(x.getAttribute('aria-label')||'')); if(b) b.click(); }""")
        pg.wait_for_timeout(1500)
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m8-cover-final-light.png")
    # 熄灯：连采 8 帧
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button,[role=button]')].find(x=>/设置|Settings/i.test(x.getAttribute('aria-label')||x.textContent||'')); if(b) b.click(); }""")
    pg.wait_for_timeout(2000)
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='深色'); if(b) b.click(); }""")
    frames = []
    for i in range(8):
        pg.wait_for_timeout(60)
        w = pg.evaluate("""() => { const w = document.querySelector('#dsh-theme-wipe'); return w ? w.getAttribute('data-dsh-wipe') : null; }""")
        frames.append(w)
    print("wipe frames:", json.dumps(frames))
    hit = "lights-out" in frames
    print("W1 RETRY:", "PASS" if hit else "FAIL")
    pg.wait_for_timeout(1500)
    print("final dark:", pg.evaluate("document.body.hasAttribute('data-ds-dark-theme')"))
    b.close()
