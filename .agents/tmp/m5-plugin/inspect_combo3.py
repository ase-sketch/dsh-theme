# -*- coding: utf-8 -*-
import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width":1440,"height":900})
    pg = ctx.new_page()
    reqs = []
    pg.on("request", lambda r: reqs.append(r.url))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    combo = [u for u in reqs if 'dsh-theme/client.js' in u]
    res = {"comboUrl": combo[0] if combo else None}
    if combo:
        txt = pg.evaluate("""async (u) => { const r = await fetch(u, {credentials:'same-origin'}); return await r.text(); }""", combo[0])
        res["len"] = len(txt)
        res["hasGuard"] = 'skinCenterPresent' in txt
        res["hasOldMarker"] = 'data-dsh-skin-center' in txt
        res["hasActiveUrl"] = '/api/skin-center/v2/active' in txt
        i = txt.find('dsh-theme')
        res["snippet"] = txt[i-100:i+1200] if i >= 0 else None
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
