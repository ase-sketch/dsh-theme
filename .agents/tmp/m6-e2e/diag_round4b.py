# -*- coding: utf-8 -*-
"""Round-4 diag 2: locate the pet with its REAL selectors (data-pet-dock / summon button)."""
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
    R["petDock"] = pg.evaluate("""() => {
      const d = document.querySelectorAll('[data-pet-dock]');
      const t = document.querySelectorAll('[data-testid="pet-dock"]');
      return {dockCount: d.length, testidCount: t.length,
              html: d.length ? d[0].outerHTML.slice(0, 300) : null};
    }""")
    R["summonBtn"] = pg.evaluate("""() => {
      const s = [...document.querySelectorAll('button, [class*="summon"]')];
      return s.slice(0,5).map(e => {
        const r = e.getBoundingClientRect();
        return {tag: e.tagName, cls: (e.className||'').toString().slice(0,60),
                rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
                visible: e.offsetParent !== null, text: (e.textContent||'').trim().slice(0,20)};
      });
    }""")
    R["petApi"] = pg.evaluate("""async () => {
      try {
        const r = await fetch('/api/pet/state', {credentials:'same-origin'});
        return {status: r.status, body: (await r.text()).slice(0, 400)};
      } catch (e) { return {error: String(e).slice(0,200)}; }
    }""")
    R["petApiCandidates"] = pg.evaluate("""async () => {
      const out = [];
      for (const u of ['/api/pet/state','/api/pet/snapshot','/api/pet/pets','/api/pet/config']) {
        try { const r = await fetch(u, {credentials:'same-origin'}); out.push({u, status: r.status}); }
        catch (e) { out.push({u, error: String(e).slice(0,80)}); }
      }
      return out;
    }""")
    R["consoleAll"] = console
    R["pageerrors"] = pageerrors
    pg.screenshot(path=os.path.join(HERE, "r4-diag-pet2.png"))
    b.close()

with open(os.path.join(HERE, "round4-diag2.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1)[:5000])
