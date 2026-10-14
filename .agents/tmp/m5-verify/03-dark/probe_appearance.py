# -*- coding: utf-8 -*-
"""深色模式探索：定位 设置 → 通用设置 → 外观 → 深色 的可点击元素。"""
import sys, json
from playwright.sync_api import sync_playwright

url = sys.argv[1]
R = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    errs = []
    pg.on("console", lambda m: errs.append("[%s] %s" % (m.type, m.text[:300])))
    pg.on("pageerror", lambda e: errs.append("PAGEERROR " + str(e)[:300]))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1500)

    # 打开设置（齿轮）
    pg.evaluate("""() => {
      const btns = [...document.querySelectorAll('button')];
      const gear = btns.find(b => (b.getAttribute('aria-label')||'').includes('设置') || (b.title||'').includes('设置'));
      if (gear) gear.click();
    }""")
    pg.wait_for_timeout(2500)
    R["after_gear_text"] = pg.evaluate("() => (document.body.innerText||'').slice(0,3000)")
    # 列出设置里的导航项
    R["nav_candidates"] = pg.evaluate("""() => {
      const out = [];
      for (const e of document.querySelectorAll('button,[role="tab"],[role="menuitem"],li,a')) {
        const t = (e.textContent||'').trim();
        if (!t || t.length > 24) continue;
        if (e.offsetParent === null) continue;
        out.push({tag:e.tagName, role:e.getAttribute('role'), text:t, cls:(e.className||'').toString().slice(0,60)});
      }
      return out.slice(0, 80);
    }""")
    pg.screenshot(path="probe-settings.png")
    b.close()
print(json.dumps(R, ensure_ascii=False, indent=1))
