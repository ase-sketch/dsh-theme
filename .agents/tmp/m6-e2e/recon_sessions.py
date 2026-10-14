# -*- coding: utf-8 -*-
"""Recon: how to create/switch sessions in the DSH web shell (for concurrency scenarios)."""
import sys, os, json
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)

    R = {}
    R["buttons"] = pg.evaluate("""() => [...document.querySelectorAll('button')].map(b => ({
        text: (b.textContent||'').trim().slice(0,40),
        aria: b.getAttribute('aria-label'),
        title: b.title,
        cls: (b.className||'').toString().slice(0,50),
        visible: b.offsetParent !== null
      })).filter(b => b.visible).slice(0, 40)""")
    R["newSessionCandidates"] = pg.evaluate("""() => [...document.querySelectorAll('button,a,[role="button"]')]
        .filter(e => /新会话|新建|New/i.test((e.textContent||'') + (e.getAttribute('aria-label')||'') + (e.title||'')))
        .map(e => ({tag: e.tagName, text: (e.textContent||'').trim().slice(0,30), aria: e.getAttribute('aria-label'), title: e.title}))""")
    R["sessionRows"] = pg.evaluate("""() => {
      const els = [...document.querySelectorAll('[data-session-id], [data-conversation-session]')];
      return els.slice(0,10).map(e => ({tag: e.tagName, attrs: [...e.attributes].map(a=>a.name+'='+a.value.slice(0,50)).slice(0,8)}));
    }""")
    R["sidebarLinks"] = pg.evaluate("""() => [...document.querySelectorAll('a[href*="session"], a[href*="/s/"]')]
        .slice(0,10).map(a => a.getAttribute('href'))""")
    R["htmlAttrs"] = pg.evaluate("() => [...document.documentElement.attributes].map(a=>a.name)")
    R["sessionAttrVal"] = pg.evaluate("() => { const e = document.querySelector('[data-conversation-session]'); return e ? e.getAttribute('data-conversation-session') : null; }")
    R["url"] = pg.url

    b.close()

with open(os.path.join(HERE, "recon-sessions.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1)[:4000])
