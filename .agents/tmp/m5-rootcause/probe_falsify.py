# -*- coding: utf-8 -*-
"""Falsification run: pristine dsh-theme vs the one-change fix, same page load."""
import sys, json, os
from playwright.sync_api import sync_playwright
url = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else "falsify"
here = os.path.dirname(os.path.abspath(__file__))

EVAL = r"""() => {
  const g = (id) => { const el = document.getElementById(id); return el ? { exists: true, text: el.textContent.trim().slice(0,160) } : { exists: false }; };
  return {
    bootEntryIds: (window.__DSH_BOOT__ ? window.__DSH_BOOT__.entries.map(e => e.id) : null),
    A_htmlAttr: document.documentElement.hasAttribute('data-dsh-theme'),
    A_style: g('dsh-theme-style'),
    B_htmlAttr: document.documentElement.hasAttribute('data-dsh-theme-fixed'),
    B_style: g('dsh-theme-fixed-style'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlAttrs: [...document.documentElement.attributes].map(a => a.name),
  };
}"""
logs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("console", lambda m: logs.append("[%s] %s" % (m.type, m.text[:400])))
    pg.on("pageerror", lambda e: logs.append("[pageerror] " + str(e)[:400]))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    pg.mouse.click(933, 577); pg.wait_for_timeout(1200)
    res = pg.evaluate(EVAL)
    pg.screenshot(path=os.path.join(here, label + ".png"))
    b.close()
with open(os.path.join(here, label + ".json"), "w", encoding="utf-8") as f:
    json.dump({"result": res, "console": logs}, f, ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
print("console:", logs)
