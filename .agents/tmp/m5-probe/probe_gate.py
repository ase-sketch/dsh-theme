# -*- coding: utf-8 -*-
"""M5 D4 gate: does a bundle plugin's client half actually stay alive in the page?

Usage: python probe_gate.py <url> <label>
Writes <label>.json next to this file, plus <label>.png full-page screenshot.

Three assertions (the gate):
  1. documentElement.hasAttribute('data-dsh-theme-probe') === true
  2. #dsh-theme-probe-style exists and its textContent is the expected rule
  3. getComputedStyle(document.body).backgroundColor === 'rgb(255, 138, 0)'
Plus: console/pageerror must be clean, and the pixel layer is screenshotted.
"""
import sys, json, os
from playwright.sync_api import sync_playwright

EXPECTED_CSS = 'html[data-dsh-theme-probe] body { background-color: rgb(255 138 0) !important; }'
EXPECTED_BG = 'rgb(255, 138, 0)'

url = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else "gate"
here = os.path.dirname(os.path.abspath(__file__))

EVAL = r"""() => {
  const el = document.getElementById('dsh-theme-probe-style');
  return {
    bootPresent: !!window.__DSH_BOOT__,
    bootEntryIds: window.__DSH_BOOT__ ? window.__DSH_BOOT__.entries.map(e => e.id) : null,
    probeRow: window.__DSH_BOOT__ ? (window.__DSH_BOOT__.entries.find(e => e.id === 'dsh-theme-probe') || null) : null,
    htmlHasAttr: document.documentElement.hasAttribute('data-dsh-theme-probe'),
    htmlAttrs: [...document.documentElement.attributes].map(a => a.name),
    styleElExists: !!el,
    styleElText: el ? el.textContent.trim() : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    bodyRect: (() => { const r = document.body.getBoundingClientRect(); return {w: Math.round(r.width), h: Math.round(r.height)}; })(),
  };
}"""

console_msgs, page_errors = [], []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("console", lambda m: console_msgs.append("[%s] %s" % (m.type, m.text[:600])))
    pg.on("pageerror", lambda e: page_errors.append(str(e)[:800]))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try:
        pg.mouse.click(933, 577)   # dismiss the preview notice
    except Exception:
        pass
    pg.wait_for_timeout(1500)
    res = pg.evaluate(EVAL)
    pg.screenshot(path=os.path.join(here, label + ".png"))
    pg.screenshot(path=os.path.join(here, label + "-fullpage.png"), full_page=True)
    b.close()

a1 = res["htmlHasAttr"] is True
a2 = res["styleElExists"] and (res["styleElText"] == EXPECTED_CSS)
a3 = res["bodyBg"] == EXPECTED_BG
console_errors = [m for m in console_msgs if m.startswith("[error]")]

out = {
    "label": label,
    "url": url.split("?")[0],
    "expectedCss": EXPECTED_CSS,
    "expectedBodyBg": EXPECTED_BG,
    "observed": res,
    "assertions": {
        "1_htmlHasProbeAttribute": {"pass": a1, "expected": True, "actual": res["htmlHasAttr"]},
        "2_styleElementPresentAndCorrect": {"pass": bool(a2), "expected": EXPECTED_CSS, "actual": res["styleElText"]},
        "3_bodyBackgroundIsOrange": {"pass": a3, "expected": EXPECTED_BG, "actual": res["bodyBg"]},
    },
    "allThreeGreen": bool(a1 and a2 and a3),
    "console": console_msgs,
    "consoleErrors": console_errors,
    "pageerrors": page_errors,
    "consoleClean": (len(console_errors) == 0 and len(page_errors) == 0),
}
with open(os.path.join(here, label + ".json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print("== %s ==" % label)
print("bootEntryIds        :", res["bootEntryIds"])
print("probeRow            :", json.dumps(res["probeRow"], ensure_ascii=False))
print("1 htmlHasAttr       :", a1, " actual=", res["htmlHasAttr"])
print("2 styleElExists     :", res["styleElExists"], " text==expected:", res["styleElText"] == EXPECTED_CSS)
print("   styleElText      :", repr(res["styleElText"]))
print("3 bodyBg            :", a3, " actual=", repr(res["bodyBg"]))
print("allThreeGreen       :", bool(a1 and a2 and a3))
print("consoleErrors       :", len(console_errors), console_errors[:3])
print("pageerrors          :", len(page_errors), page_errors[:3])
