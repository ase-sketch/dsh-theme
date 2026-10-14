# -*- coding: utf-8 -*-
"""Decision-relevant supplement: is the miss about the probe, or about the selector target?

Adds a SECOND style element in-page (the probe package on disk is NOT touched)
carrying the same orange rule but scoped to the layer that actually paints.
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

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1200)
    before = orange_pct(os.path.join(here, "probe.png"))
    pg.evaluate("""() => {
      const s = document.createElement('style');
      s.id = 'supplement-not-part-of-probe';
      s.textContent = 'html[data-dsh-theme-probe] #root { background-color: rgb(255 138 0) !important; }';
      document.head.appendChild(s);
    }""")
    pg.wait_for_timeout(700)
    pg.screenshot(path=os.path.join(here, "supplement-root-scoped.png"))
    after = orange_pct(os.path.join(here, "supplement-root-scoped.png"))
    b.close()

res = {
  "note": "in-page only; the probe package on disk is unchanged (verified by md5 in the report)",
  "orangePct_probeCssAsSpecified": before,
  "orangePct_sameRuleScopedToRoot": after,
}
with open(os.path.join(here, "supplement-selector-target.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
