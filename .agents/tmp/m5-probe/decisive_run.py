# -*- coding: utf-8 -*-
"""Decisive run: is the orange PAINTED? One page load, one screenshot, one DOM query.

Kills the alternative explanation "the screenshot was taken in a non-probe state":
the same page instance that yields the screenshot also reports the probe's presence,
so probe-state and image are provably the same moment.
"""
import sys, json, os
from playwright.sync_api import sync_playwright
from PIL import Image

url = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))

def orange_pct(path):
    im = Image.open(path).convert("RGB"); w, h = im.size
    cols = im.getcolors(maxcolors=1<<24) or []
    n = sum(c for c, px in cols if px[0] > 240 and 120 < px[1] < 160 and px[2] < 30)
    return round(100.0*n/(w*h), 2)

EVAL = r"""() => {
  const el = document.getElementById('dsh-theme-probe-style');
  const probePresent = document.documentElement.hasAttribute('data-dsh-theme-probe');
  const pts = [[720,450],[86,270],[1353,270],[720,765]];
  const chain = pts.map(([x,y]) => {
    const out = []; let n = document.elementFromPoint(x,y);
    while (n && n !== document.documentElement.parentNode) {
      const cs = getComputedStyle(n);
      out.push({tag:n.tagName.toLowerCase(), cls:(typeof n.className==='string'?n.className:'').slice(0,60)||null,
                id:n.id||null, bg:cs.backgroundColor, pos:cs.position, z:cs.zIndex, rect:(()=>{const r=n.getBoundingClientRect();return [Math.round(r.width),Math.round(r.height)];})()});
      n = n.parentElement;
    }
    return {xy:[x,y], chain: out};
  });
  const root = document.getElementById('root');
  const rc = root ? getComputedStyle(root) : null;
  return {
    probePresent, styleElExists: !!el, styleElText: el ? el.textContent.trim() : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    rootBg: rc ? rc.backgroundColor : null, rootZ: rc ? rc.zIndex : null, rootPos: rc ? rc.position : null,
    chain,
  };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width":1440,"height":900})
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933,577)
    except Exception: pass
    pg.wait_for_timeout(1500)
    dom = pg.evaluate(EVAL)            # DOM query FIRST
    pg.screenshot(path=os.path.join(here,"decisive.png"))   # then the image, same page
    dom2 = pg.evaluate("() => document.documentElement.hasAttribute('data-dsh-theme-probe')")  # and again after
    b.close()

res = {
  "samePageProof": {"probePresentBeforeShot": dom["probePresent"], "probePresentAfterShot": dom2,
                    "styleElText": dom["styleElText"], "bodyBg": dom["bodyBg"]},
  "rootLayer": {"bg": dom["rootBg"], "position": dom["rootPos"], "zIndex": dom["rootZ"]},
  "elementFromPointChain": dom["chain"],
  "orangePctOfDecisiveShot": orange_pct(os.path.join(here,"decisive.png")),
}
with open(os.path.join(here,"decisive-run.json"),"w",encoding="utf-8") as f:
    json.dump(res,f,ensure_ascii=False,indent=1)
print(json.dumps(res,ensure_ascii=False,indent=1)[:4000])
