# -*- coding: utf-8 -*-
"""验收 6：cordis.patch.yml 静态 disabled:true 可整体禁用，且效果可逆。"""
import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1]
PROBE = r"""() => ({
  bootIds: (window.__DSH_BOOT__ && window.__DSH_BOOT__.entries || []).map(e => e.id).filter(id => typeof id === 'string' && (id.includes('dsh-theme') || id.includes('skin-center'))),
  htmlHasAttr: document.documentElement.hasAttribute('data-dsh-theme'),
  styleElExists: !!document.getElementById('dsh-theme-style'),
  sidebarBg: (() => { const e = document.querySelector('[class*="sidebarCol"]'); return e ? getComputedStyle(e).backgroundColor : null; })(),
  // 插件被禁用时 host 路由也应消失
})"""
errs, pes = [], []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width":1440,"height":900})
    pg = ctx.new_page()
    pg.on("console", lambda m: errs.append("[%s] %s" % (m.type, m.text[:300])))
    pg.on("pageerror", lambda e: pes.append(str(e)[:400]))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1200)
    r = pg.evaluate(PROBE)
    # host 路由是否还在
    route = pg.evaluate("""async () => { try { const r = await fetch('/api/dsh-theme/state', {credentials:'same-origin'}); return r.status; } catch (e) { return 'error'; } }""")
    pg.screenshot(path="disabled-full.png")
    b.close()
r["hostRouteStatus"] = route
r["consoleErrors"] = [m for m in errs if m.startswith("[error]")]
r["pageerrors"] = pes
print(json.dumps(r, ensure_ascii=False, indent=1))
