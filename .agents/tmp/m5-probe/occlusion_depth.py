# -*- coding: utf-8 -*-
"""How deep is the opaque shell stack that hides body's background? (diagnostic only)"""
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

FIND = r"""() => {
  const vw = innerWidth, vh = innerHeight, hits = [];
  document.querySelectorAll('body *').forEach(el => {
    if (el.dataset.__occl) return;
    const cs = getComputedStyle(el), r = el.getBoundingClientRect();
    const opaque = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.opacity === '1';
    if (opaque && r.width >= vw*0.9 && r.height >= vh*0.9) {
      el.dataset.__occl = '1';
      hits.push({tag: el.tagName.toLowerCase(), cls: (typeof el.className==='string'?el.className:'').slice(0,70), bg: cs.backgroundColor});
    }
  });
  return hits;
}"""

rounds = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1200)
    sp = os.path.join(here, "depth-0.png"); pg.screenshot(path=sp)
    rounds.append({"round": 0, "found": [], "orangePct": orange_pct(sp)})
    for i in range(1, 8):
        found = pg.evaluate(FIND)
        if not found: break
        pg.evaluate("() => document.querySelectorAll('[data__occl]').forEach(e => e.style.backgroundColor='transparent')")
        pg.wait_for_timeout(400)
        sp = os.path.join(here, "depth-%d.png" % i); pg.screenshot(path=sp)
        rounds.append({"round": i, "found": found, "orangePct": orange_pct(sp)})
        if rounds[-1]["orangePct"] > 1: break
    b.close()

with open(os.path.join(here,"occlusion-depth.json"),"w",encoding="utf-8") as f:
    json.dump(rounds,f,ensure_ascii=False,indent=1)
for r in rounds:
    print("round", r["round"], "orange%=", r["orangePct"], "layers=", [x["cls"] or x["tag"] for x in r["found"]])
