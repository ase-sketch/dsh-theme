# -*- coding: utf-8 -*-
import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1]
scripts = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width":1440,"height":900})
    pg = ctx.new_page()
    pg.on("response", lambda r: scripts.append(r.url) if ('.js' in r.url or 'batch' in r.url or 'plugin' in r.url) else None)
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    # read the served combo text straight from the page's own module loader
    info = pg.evaluate(r"""() => {
      const out = { bootIds: null, hasSkinCenterEntry: null, scriptSrcs: [...document.querySelectorAll('script[src]')].map(s=>s.src) };
      if (window.__DSH_BOOT__ && Array.isArray(window.__DSH_BOOT__.entries)) {
        out.bootIds = window.__DSH_BOOT__.entries.map(e=>e.id).filter(id=>typeof id==='string' && (id.includes('theme')||id.includes('skin')));
        out.hasSkinCenterEntry = window.__DSH_BOOT__.entries.some(e=>e.id && e.id.includes('skin-center'));
      }
      return out;
    }""")
    b.close()
print(json.dumps({"info": info, "scriptUrls": scripts[:60]}, ensure_ascii=False, indent=1))
