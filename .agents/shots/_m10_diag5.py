# -*- coding: utf-8 -*-
import json
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:19488/?token=<REDACTED>"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    pg = b.new_context(viewport={"width":900,"height":800}).new_page()
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)
    info = pg.evaluate("""() => {
      const tools = document.querySelector('[data-composer-card] [class*=tools]');
      const out = [];
      const walk = (el, depth) => {
        if (depth > 5) return;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        if (r.height > 0 || depth < 2) out.push({ d: depth, tag: el.tagName,
          cls: (el.className||'').toString().slice(-26) || (el.getAttribute('data-slot')||'') || (el.id||''),
          pos: cs.position, h: Math.round(r.height), top: Math.round(r.top), w: Math.round(r.width) });
        [...el.children].forEach(c => walk(c, depth + 1));
      };
      walk(tools, 0);
      return { toolsH: Math.round(tools.getBoundingClientRect().height), items: out };
    }""")
    print("toolsH:", info["toolsH"])
    for r in info["items"]:
        print("  " * r["d"] + r["tag"], r["cls"], "| pos:", r["pos"], "| top:", r["top"], "h:", r["h"], "w:", r["w"])
    b.close()
