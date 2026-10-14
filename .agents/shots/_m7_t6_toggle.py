# -*- coding: utf-8 -*-
"""T6 补测：真实设置面板 OFF/ON 往返。"""
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:19488/?token=<REDACTED>"
PROBE = r"""() => ({
  themeAttr: document.documentElement.getAttribute('data-dsh-theme'),
  bodyBg: getComputedStyle(document.body).backgroundColor,
  deepy: !!document.querySelector('#dsh-theme-deepy'),
  icons: document.documentElement.getAttribute('data-dsh-icons'),
})"""
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
    pg.wait_for_timeout(2000)
    on1 = pg.evaluate(PROBE)
    # 打开设置 → dsh-theme 主题
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button,[role=button]')].find(x=>/设置|Settings/i.test(x.getAttribute('aria-label')||x.textContent||'')); if(b) b.click(); }""")
    pg.wait_for_timeout(2000)
    nav = pg.evaluate("""() => { const n=[...document.querySelectorAll('*')].find(x=>x.children.length===0 && /dsh-theme 主题/.test(x.textContent||'')); if(n){n.click();return 'clicked';} return 'not-found'; }""")
    pg.wait_for_timeout(1500)
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m7-t6-theme-panel.png")
    t = pg.evaluate("""() => { const t=document.querySelector('[data-dsh-part="theme-toggle"]'); if(t){t.click();return 'clicked';} return 'not-found'; }""")
    pg.wait_for_timeout(2500)
    off = pg.evaluate(PROBE)
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m7-t6-off2.png")
    pg.evaluate("""() => { const t=document.querySelector('[data-dsh-part="theme-toggle"]'); if(t) t.click(); }""")
    pg.wait_for_timeout(2500)
    on2 = pg.evaluate(PROBE)
    print("nav:", nav, "| toggle:", t)
    print("ON1:", json.dumps(on1))
    print("OFF:", json.dumps(off))
    print("ON2:", json.dumps(on2))
    print("console errors:", errs[:3] if errs else "0")
    ok = (on1["themeAttr"] is not None and off["themeAttr"] is None and off["bodyBg"]=="rgb(255, 255, 255)"
          and off["deepy"] is False and on2["themeAttr"] is not None and on2["deepy"] is True and len(errs)==0)
    print("TOGGLE-ROUNDTRIP:", "PASS" if ok else "FAIL")
    b.close()
