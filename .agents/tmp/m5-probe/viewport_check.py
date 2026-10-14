# -*- coding: utf-8 -*-
"""Positive control + taller-viewport screenshots for the gate.

Answers two questions the 1440x900 shot cannot:
  (a) is the orange really PAINTED when nothing occludes body? (positive control)
  (b) does the shell's full-page layout expose body further down the page?
"""
import sys, json, os
from playwright.sync_api import sync_playwright
from PIL import Image

url = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))

def orange_pct(path):
    im = Image.open(path).convert("RGB"); w,h = im.size
    cols = im.getcolors(maxcolors=1<<24) or []
    n = sum(c for c,px in cols if px[0]>240 and 120<px[1]<160 and px[2]<30)
    return round(100.0*n/(w*h), 2)

out = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)

    # --- (b) taller viewport, same page ---
    ctx = b.new_context(viewport={"width": 1440, "height": 2000})
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1200)
    pg.screenshot(path=os.path.join(here, "probe-tall.png"))
    pg.screenshot(path=os.path.join(here, "probe-tall-fullpage.png"), full_page=True)
    out["tall_2000"] = {
        "viewport": orange_pct(os.path.join(here, "probe-tall.png")),
        "fullpage": orange_pct(os.path.join(here, "probe-tall-fullpage.png")),
        "scrollHeight": pg.evaluate("() => document.documentElement.scrollHeight"),
        "innerHeight": pg.evaluate("() => innerHeight"),
    }
    ctx.close()

    # --- (a) positive control: remove the shell root, body orange must paint ---
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1200)
    pg.evaluate("() => { const r = document.getElementById('root'); if (r) r.style.display = 'none'; }")
    pg.wait_for_timeout(600)
    pg.screenshot(path=os.path.join(here, "positive-control-root-hidden.png"))
    out["positive_control"] = {
        "orangePct": orange_pct(os.path.join(here, "positive-control-root-hidden.png")),
        "bodyBg": pg.evaluate("() => getComputedStyle(document.body).backgroundColor"),
    }
    ctx.close()
    b.close()

with open(os.path.join(here, "viewport-check.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1))
