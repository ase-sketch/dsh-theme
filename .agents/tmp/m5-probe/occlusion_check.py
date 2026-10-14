# -*- coding: utf-8 -*-
"""Occlusion diagnostic: is the probe's orange actually painted UNDER an opaque shell layer?

Not gate evidence — this deliberately mutates the live DOM (in-page only, the probe
package is untouched) to show WHY the screenshot shows no orange.
"""
import sys, json, os
from playwright.sync_api import sync_playwright

url = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))

FIND = r"""() => {
  const vw = innerWidth, vh = innerHeight, hits = [];
  document.querySelectorAll('body *').forEach(el => {
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    if (cs.backgroundColor === 'rgb(255, 255, 255)' && r.width >= vw*0.9 && r.height >= vh*0.9) {
      el.dataset.__occluder = '1';
      hits.push({tag: el.tagName.toLowerCase(), cls: (typeof el.className==='string'?el.className:'').slice(0,60),
                 rect: [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)], bg: cs.backgroundColor});
    }
  });
  return hits;
}"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1200)
    before = pg.evaluate(FIND)
    pg.screenshot(path=os.path.join(here, "occlusion-before.png"))
    # neutralise ONLY the opaque shell layers, in-page, nothing written to disk
    pg.evaluate("() => document.querySelectorAll('[data__occluder]').forEach(e => e.style.backgroundColor = 'transparent')")
    pg.wait_for_timeout(600)
    after = pg.evaluate("() => ({ bodyBg: getComputedStyle(document.body).backgroundColor })")
    pg.screenshot(path=os.path.join(here, "occlusion-after.png"))
    b.close()

from PIL import Image
def orange_pct(path):
    im = Image.open(path).convert("RGB"); w,h = im.size
    cols = im.getcolors(maxcolors=1<<24) or []
    n = sum(c for c,px in cols if px[0]>240 and 120<px[1]<160 and px[2]<30)
    return round(100.0*n/(w*h), 2)

res = {
  "occludersFound": before,
  "bodyBgAfterNeutralising": after["bodyBg"],
  "orangePct_before": orange_pct(os.path.join(here,"occlusion-before.png")),
  "orangePct_after": orange_pct(os.path.join(here,"occlusion-after.png")),
}
with open(os.path.join(here,"occlusion-diagnostic.json"),"w",encoding="utf-8") as f:
    json.dump(res,f,ensure_ascii=False,indent=1)
print(json.dumps(res,ensure_ascii=False,indent=1))
