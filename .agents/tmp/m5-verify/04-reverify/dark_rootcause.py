# -*- coding: utf-8 -*-
"""深色根因探针：在插件期深色下，逐层读 html / body 的自定义属性计算值，
定位「侧栏与输入卡仍是浅色」到底卡在哪一层。"""
import sys, json, os
from playwright.sync_api import sync_playwright
url = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))

PROBE = r"""() => {
  const names = ['--dsh-bg-subtle','--dsh-bg-surface','--dsh-sidebar-bg','--dsh-card-bg','--dsh-input-bg',
                 '--dsw-alias-bg-layer-1','--dsw-alias-bg-base','--dsw-specific-sidebar-fill',
                 '--dsw-specific-input-major','--dsw-specific-selector','--dsw-alias-specific-sidebar-fill',
                 '--dsw-alias-specific-input-major'];
  const htmlCs = getComputedStyle(document.documentElement);
  const bodyCs = getComputedStyle(document.body);
  const out = { html: {}, body: {} };
  for (const n of names) { out.html[n] = htmlCs.getPropertyValue(n).trim(); out.body[n] = bodyCs.getPropertyValue(n).trim(); }
  const sb = document.querySelector('[class*="sidebarCol"]');
  const card = document.querySelector('[data-dsh-surface="composer"] [class*="card"]');
  out.paint = {
    sidebarBg: sb ? getComputedStyle(sb).backgroundColor : null,
    cardBg: card ? getComputedStyle(card).backgroundColor : null,
    bodyBg: bodyCs.backgroundColor,
  };
  // 找 theme.css 里实际生效的规则顺序
  const rules = [];
  const el = document.getElementById('dsh-theme-style');
  if (el && el.sheet) {
    for (const r of el.sheet.cssRules) {
      const t = r.cssText || '';
      if (t.includes('--dsw-specific-sidebar-fill') || t.includes('--dsw-specific-input-major')) {
        rules.push(t.slice(0, 260));
      }
    }
  }
  out.rules = rules;
  return out;
}"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1500)
    # 设置 → 深色
    pg.evaluate("""() => { const bs=[...document.querySelectorAll('button')];
      const g=bs.find(b=>(b.getAttribute('aria-label')||'').includes('设置')||(b.title||'').includes('设置')); if(g)g.click(); }""")
    pg.wait_for_timeout(2200)
    pg.evaluate("""() => { const bs=[...document.querySelectorAll('button')];
      const d=bs.find(b=>(b.textContent||'').trim()==='深色'&&b.offsetParent!==null); if(d)d.click(); }""")
    pg.wait_for_timeout(2500)
    try: pg.keyboard.press("Escape")
    except Exception: pass
    pg.wait_for_timeout(1000)
    res = pg.evaluate(PROBE)
    # 恢复浅色
    pg.evaluate("""() => { const bs=[...document.querySelectorAll('button')];
      const g=bs.find(b=>(b.getAttribute('aria-label')||'').includes('设置')||(b.title||'').includes('设置')); if(g)g.click(); }""")
    pg.wait_for_timeout(2000)
    pg.evaluate("""() => { const bs=[...document.querySelectorAll('button')];
      const d=bs.find(b=>(b.textContent||'').trim()==='浅色'&&b.offsetParent!==null); if(d)d.click(); }""")
    pg.wait_for_timeout(1500)
    b.close()
with open(os.path.join(here, "dark-rootcause.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
