# -*- coding: utf-8 -*-
"""Round-4 diag 3: find pet summon button, session row delete affordance, workspace switcher."""
import sys, os, json
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(11000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)

    R = {}
    R["summonButtons"] = pg.evaluate("""() => [...document.querySelectorAll('button')]
      .filter(e => /summon/i.test((e.className||'').toString()))
      .map(e => { const r = e.getBoundingClientRect();
        return {cls: (e.className||'').toString().slice(0,70),
                rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
                text: (e.textContent||'').trim().slice(0,30),
                aria: e.getAttribute('aria-label')}; })""")
    R["allClassSamples"] = pg.evaluate("""() => {
      const out = new Set();
      for (const e of document.querySelectorAll('body *')) {
        const c = (e.className||'').toString();
        if (/v78Lda|pet/i.test(c)) out.add(e.tagName + '.' + c.slice(0,70));
      }
      return [...out].slice(0, 20);
    }""")
    R["workspaceBtn"] = pg.evaluate("""() => [...document.querySelectorAll('button')]
      .filter(e => /工作区/.test((e.getAttribute('aria-label')||'')))
      .map(e => ({aria: e.getAttribute('aria-label'), cls: (e.className||'').toString().slice(0,50)}))""")
    R["sidebarSessionRows"] = pg.evaluate("""() => {
      const cands = [...document.querySelectorAll('a, [role="button"], li, div')]
        .filter(e => e.offsetParent !== null && /刚刚|分钟|小时/.test(e.textContent||'') && (e.textContent||'').length < 80);
      return cands.slice(0,6).map(e => ({tag: e.tagName, cls: (e.className||'').toString().slice(0,60),
        text: (e.textContent||'').trim().slice(0,50)}));
    }""")
    # hover a session row and look for a newly-revealed button
    R["hoverReveal"] = pg.evaluate("""() => {
      const rows = [...document.querySelectorAll('a, [role="button"], li, div')]
        .filter(e => e.offsetParent !== null && /刚刚|分钟/.test(e.textContent||'') && (e.textContent||'').length < 80);
      if (!rows.length) return {found:false};
      const r = rows[0].getBoundingClientRect();
      return {found: true, x: Math.round(r.x + r.width - 20), y: Math.round(r.y + r.height/2),
              text: (rows[0].textContent||'').trim().slice(0,40)};
    }""")
    if R["hoverReveal"].get("found"):
        pg.mouse.move(R["hoverReveal"]["x"], R["hoverReveal"]["y"])
        pg.wait_for_timeout(900)
        R["revealedButtons"] = pg.evaluate("""() => {
          const btns = [...document.querySelectorAll('button')].filter(e => {
            const r = e.getBoundingClientRect();
            return e.offsetParent !== null && r.width > 0 && r.width < 40 && r.x > 100;
          });
          return btns.slice(0,10).map(e => ({aria: e.getAttribute('aria-label'), title: e.title,
            cls: (e.className||'').toString().slice(0,50)}));
        }""")
    b.close()

with open(os.path.join(HERE, "round4-diag3.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1)[:5000])
