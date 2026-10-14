# -*- coding: utf-8 -*-
import sys, os
from playwright.sync_api import sync_playwright
url = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(7000)
    pg.mouse.click(933, 577); pg.wait_for_timeout(1200)
    pg.mouse.click(56, 869); pg.wait_for_timeout(2500)
    pg.evaluate(r"""() => { for (const el of document.querySelectorAll('button')) if ((el.textContent||'').trim() === '插件') { el.click(); return; } }""")
    pg.wait_for_timeout(2500)
    pg.evaluate(r"""() => { for (const el of document.querySelectorAll('button')) if ((el.textContent||'').trim() === '内置插件') { el.click(); return; } }""")
    pg.wait_for_timeout(3000)
    pg.screenshot(path=os.path.join(here, "settings-builtin.png"))
    tabs = pg.evaluate(r"""() => [...document.querySelectorAll('button,[role=tab]')].map(el => (el.textContent||'').trim()).filter(Boolean)""")
    print("== buttons now ==", tabs)
    fail = pg.evaluate(r"""() => { const el = document.querySelector('[data-client-sync-failure]'); return el ? el.innerText : null; }""")
    print("== data-client-sync-failure ==")
    print(fail if fail else "(none)")
    if fail is None:
        # try clicking any tab that looks like a plugin list
        for label in ['插件列表','插件清单','Plugin inventory','清单','列表']:
            r = pg.evaluate(r"""(label) => { for (const el of document.querySelectorAll('button,[role=tab]')) if ((el.textContent||'').trim() === label) { el.click(); return label; } return null; }""", label)
            if r:
                print("clicked tab:", r); pg.wait_for_timeout(2500)
                fail = pg.evaluate(r"""() => { const el = document.querySelector('[data-client-sync-failure]'); return el ? el.innerText : null; }""")
                if fail: break
    print("== FAILURE BANNER ==")
    print(fail if fail else "(none)")
    body = pg.evaluate("() => document.body.innerText")
    with open(os.path.join(here, "settings-builtin.txt"), "w", encoding="utf-8") as f: f.write(body)
    pg.screenshot(path=os.path.join(here, "settings-inventory2.png"))
    b.close()
