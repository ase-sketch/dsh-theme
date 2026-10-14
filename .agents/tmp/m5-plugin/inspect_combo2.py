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
    combo = [u for u in reqs if 'dsh-theme' in u]
    res = {"comboUrls": [c[:160] for c in combo]}
    if combo:
        txt = pg.evaluate("""async (u) => {
          const r = await fetch(u, {credentials:'same-origin'});
          return { status: r.status, text: (await r.text()).slice(0, 200) };
        }""", combo[0])
        res["fetchStatus"] = txt["status"]
    # 直接从已加载的 script 元素里读文本
    inline = pg.evaluate(r"""() => {
      const out = [];
      for (const s of document.querySelectorAll('script')) {
        const t = s.textContent || '';
        if (t.includes('dsh-theme')) out.push({ kind: 'inline', len: t.length, hasGuard: t.includes('skinCenterPresent'), hasOld: t.includes('data-dsh-skin-center'), hasActiveUrl: t.includes('/api/skin-center/v2/active') });
      }
      return out;
    }""")
    res["inlineScripts"] = inline
    b.close()
print(json.dumps(res, ensure_ascii=False, indent=1))
