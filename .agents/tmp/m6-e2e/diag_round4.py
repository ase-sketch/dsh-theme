# -*- coding: utf-8 -*-
"""Round-4 diagnostic: what does dsh-pet actually render, and why is my selector missing it?"""
import sys, os, json
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    console, pageerrors = [], []
    pg.on("console", lambda m: console.append({"type": m.type, "text": m.text[:300]}))
    pg.on("pageerror", lambda e: pageerrors.append(str(e)[:300]))
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(11000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)

    R = {}
    R["bootEntriesPet"] = pg.evaluate("""() => {
      const b = window.__DSH_BOOT__;
      if (!b || !Array.isArray(b.entries)) return null;
      return b.entries.map(e => e && e.id).filter(Boolean).filter(id => /pet/i.test(id));
    }""")
    R["canvasCount"] = pg.evaluate("() => document.querySelectorAll('canvas').length")
    R["canvasInfo"] = pg.evaluate("""() => [...document.querySelectorAll('canvas')].map(c => {
      const r = c.getBoundingClientRect();
      return {w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y),
              cls: (c.className||'').toString().slice(0,60),
              parentCls: c.parentElement ? (c.parentElement.className||'').toString().slice(0,60) : null};
    })""")
    R["bodyDirectChildren"] = pg.evaluate("""() => [...document.body.children].map(e => ({
      tag: e.tagName, id: e.id, cls: (e.className||'').toString().slice(0,70)
    }))""")
    R["fixedElements"] = pg.evaluate("""() => [...document.querySelectorAll('body *')].filter(e => {
      const s = getComputedStyle(e);
      return (s.position === 'fixed' || s.position === 'absolute') && e.getBoundingClientRect().width > 40
             && e.getBoundingClientRect().width < 400;
    }).slice(0, 15).map(e => {
      const r = e.getBoundingClientRect();
      return {tag: e.tagName, id: e.id, cls: (e.className||'').toString().slice(0,60),
              rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}};
    })""")
    R["consoleAll"] = console
    R["pageerrors"] = pageerrors
    R["cdpAvailable"] = hasattr(ctx, "new_cdp_session")
    R["dshPetScripts"] = pg.evaluate("""() => [...document.querySelectorAll('script')].length""")
    pg.screenshot(path=os.path.join(HERE, "r4-diag-pet.png"))
    b.close()

with open(os.path.join(HERE, "round4-diag.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1)[:6000])
