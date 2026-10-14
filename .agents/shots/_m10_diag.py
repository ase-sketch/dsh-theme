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
    pg.wait_for_timeout(2000)
    info = pg.evaluate("""() => {
      const card = document.querySelector('[data-composer-card]');
      const tools = card ? card.querySelector('[class*=tools]') : null;
      if (!tools) return null;
      // 找 tools 下所有直接/间接孩子，报告它们的 display/flexWrap/尺寸与纵向位置
      const rows = [];
      const walk = (el, depth) => {
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        rows.push({ d: depth, tag: el.tagName, cls: (el.className||'').toString().slice(-30),
                    display: cs.display, wrap: cs.flexWrap, top: Math.round(r.top), h: Math.round(r.height), w: Math.round(r.width) });
        if (depth < 4) [...el.children].forEach(c => walk(c, depth + 1));
      };
      walk(tools, 0);
      return { toolsH: Math.round(tools.getBoundingClientRect().height), rows };
    }""")
    print(json.dumps(info, ensure_ascii=False, indent=1))
    b.close()
