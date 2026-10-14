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
      // 确认 !important 规则是否注入
      let ruleFound = false;
      for (const st of document.styleSheets) {
        try { for (const r of st.cssRules) { if ((r.cssText||'').includes('nowrap !important')) ruleFound = true; } } catch {}
      }
      const out = { ruleFound, toolsH: Math.round(tools.getBoundingClientRect().height), items: [] };
      const walk = (el, depth) => {
        if (depth > 3) return;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        out.items.push({ d: depth, tag: el.tagName, cls: (el.className||'').toString().slice(-28) || (el.getAttribute('data-slot')||''), wrap: cs.flexWrap, dir: cs.flexDirection, top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) });
        [...el.children].forEach(c => walk(c, depth + 1));
      };
      walk(tools, 0);
      return out;
    }""")
    print("ruleFound:", info["ruleFound"], "toolsH:", info["toolsH"])
    for r in info["items"]:
        if r["h"] > 0:
            print("  " * r["d"], r["tag"], r["cls"], "| wrap:", r["wrap"], r["dir"], "| top:", r["top"], "h:", r["h"], "w:", r["w"])
    b.close()
