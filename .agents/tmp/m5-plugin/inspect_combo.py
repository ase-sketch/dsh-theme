# -*- coding: utf-8 -*-
import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width":1440,"height":900})
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    res = pg.evaluate(r"""async () => {
      const srcs = [...document.querySelectorAll('script[src]')].map(s=>s.src);
      const combo = srcs.find(s => s.includes('dsh-theme/client.js'));
      if (!combo) return { found: false };
      const text = await (await fetch(combo, {credentials:'same-origin'})).text();
      return {
        found: true,
        comboUrl: combo.slice(0, 200),
        len: text.length,
        hasSkinCenterPresent: text.includes('skinCenterPresent'),
        hasBootCheck: text.includes('__DSH_BOOT__'),
        hasOldMarkerCheck: text.includes('data-dsh-skin-center'),
        hasActiveUrl: text.includes('/api/skin-center/v2/active'),
        guardSnippet: (() => {
          const i = text.indexOf('skinCenterPresent');
          return i === -1 ? null : text.slice(Math.max(0, i-300), i+400);
        })(),
      };
    }""")
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
