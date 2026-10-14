# -*- coding: utf-8 -*-
"""Read the client-sync failure list the GUI renders for the current page."""
import sys, json, os
from playwright.sync_api import sync_playwright

url = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    logs = []
    pg.on("console", lambda m: logs.append("[%s] %s" % (m.type, m.text[:400])))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(7000)
    pg.mouse.click(933, 577)
    pg.wait_for_timeout(1500)
    # open settings
    pg.mouse.click(56, 869)
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(here, "settings-open.png"))
    nav = pg.evaluate(r"""() => [...document.querySelectorAll('button,a,[role=tab],[role=button],li')]
        .map(el => { const r = el.getBoundingClientRect();
          return { text: (el.textContent||'').trim().slice(0,24), x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })
        .filter(o => o.text && o.w > 30 && o.h > 12 && o.x < 700)""")
    print("== nav candidates (x<700) ==")
    seen = set()
    for o in nav:
        k = (o["text"], o["x"], o["y"])
        if k in seen: continue
        seen.add(k)
        print("   ", o)
    # click 插件
    clicked = pg.evaluate(r"""() => {
      const targets = ['插件','Plugins','插件列表','Plugin inventory'];
      for (const el of document.querySelectorAll('button,a,[role=tab],[role=button],li,span,div')) {
        const tx = (el.textContent||'').trim();
        if (targets.includes(tx) && el.getBoundingClientRect().width > 20) { el.click(); return tx + '@' + Math.round(el.getBoundingClientRect().x) + ',' + Math.round(el.getBoundingClientRect().y); }
      }
      return null;
    }""")
    print("clicked:", clicked)
    pg.wait_for_timeout(3000)
    pg.screenshot(path=os.path.join(here, "settings-plugins.png"))
    # try the inventory tab
    clicked2 = pg.evaluate(r"""() => {
      for (const el of document.querySelectorAll('button,a,[role=tab],[role=button]')) {
        const tx = (el.textContent||'').trim();
        if (tx === '插件列表' || tx === 'Plugin inventory') { el.click(); return tx; }
      }
      return null;
    }""")
    print("clicked2:", clicked2)
    pg.wait_for_timeout(2500)
    pg.screenshot(path=os.path.join(here, "settings-inventory.png"))
    fail = pg.evaluate(r"""() => {
      const el = document.querySelector('[data-client-sync-failure]');
      return el ? el.innerText : null;
    }""")
    print("== data-client-sync-failure ==")
    print(fail if fail else "(no failure banner in DOM)")
    body = pg.evaluate(r"""() => document.body.innerText.slice(0, 3000)""")
    with open(os.path.join(here, "settings-inventory.txt"), "w", encoding="utf-8") as f:
        f.write(body)
    print("== body text (first 1500) ==")
    print(body[:1500])
    errs = [m for m in logs if m.startswith("[error]")]
    print("== console errors ==", len(errs))
    for m in errs[:10]: print("   ", m)
    b.close()
