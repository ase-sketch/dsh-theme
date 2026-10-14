# -*- coding: utf-8 -*-
"""Which element actually PAINTS the page background? (computed body bg is not it)"""
import sys, json, os
from playwright.sync_api import sync_playwright

url = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))

EVAL = r"""() => {
  const pts = [[720,450],[86,270],[1353,270],[720,765],[86,828]];
  const chain = pts.map(([x,y]) => {
    const el = document.elementFromPoint(x, y);
    const path = [];
    let n = el;
    while (n && n !== document.documentElement.parentNode) {
      const cs = getComputedStyle(n);
      path.push({
        tag: n.tagName.toLowerCase(),
        id: n.id || null,
        cls: (typeof n.className === 'string' ? n.className : '').slice(0,80) || null,
        bg: cs.backgroundColor,
        bgImage: cs.backgroundImage === 'none' ? null : cs.backgroundImage.slice(0,60),
      });
      n = n.parentElement;
    }
    return {xy:[x,y], chain: path};
  });
  // element at top-left of the viewport, the classic "painted surface"
  const body = document.body;
  const html = document.documentElement;
  const rootKids = [...body.children].map(c => ({
    tag: c.tagName.toLowerCase(), id: c.id||null,
    cls: (typeof c.className==='string'?c.className:'').slice(0,80)||null,
    rect: (()=>{const r=c.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})(),
    bg: getComputedStyle(c).backgroundColor,
  }));
  return {
    htmlBg: getComputedStyle(html).backgroundColor,
    bodyBg: getComputedStyle(body).backgroundColor,
    bodyBgImage: getComputedStyle(body).backgroundImage.slice(0,80),
    htmlBgImage: getComputedStyle(html).backgroundImage.slice(0,80),
    bodyChildren: rootKids,
    chain,
  };
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
    res = pg.evaluate(EVAL)
    b.close()

with open(os.path.join(here, "paint-surface.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print("htmlBg     :", res["htmlBg"])
print("bodyBg     :", res["bodyBg"])
print("htmlBgImage:", res["htmlBgImage"])
print("bodyBgImage:", res["bodyBgImage"])
print("bodyChildren:")
for c in res["bodyChildren"]:
    print("   ", c)
print("elementFromPoint chains:")
for c in res["chain"]:
    print("  at", c["xy"])
    for n in c["chain"][:6]:
        print("     ", n["tag"], n["id"], n["cls"], "bg=", n["bg"])
