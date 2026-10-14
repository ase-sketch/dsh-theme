# -*- coding: utf-8 -*-
import sys, json, os
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
    pg.evaluate(r"""() => { for (const el of document.querySelectorAll('button,a,[role=tab],[role=button],span,div')) {
        if ((el.textContent||'').trim() === '插件' && el.getBoundingClientRect().width > 20) { el.click(); return; } } }""")
    pg.wait_for_timeout(3000)
    print("== all [role=tab] / tab-ish after 插件 ==")
    tabs = pg.evaluate(r"""() => [...document.querySelectorAll('[role=tab],button,a')].map(el => {
        const r = el.getBoundingClientRect();
        return { tag: el.tagName, role: el.getAttribute('role'), text: (el.textContent||'').trim().slice(0,30),
                 x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }; })
        .filter(o => o.w > 10 && o.h > 8)""")
    for o in tabs: print("   ", o)
    pg.screenshot(path=os.path.join(here, "settings-plugins2.png"))
    b.close()
