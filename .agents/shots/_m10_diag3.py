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
      const tools = document.querySelector('[data-composer-card] [class*=tools]');
      const hits = [];
      tools.querySelectorAll('*').forEach(el => {
        if (getComputedStyle(el).flexWrap === 'wrap') {
          const kids = [...el.querySelectorAll('button')].map(x => (x.getAttribute('aria-label') || x.textContent || '').trim().slice(0, 20));
          // 向上找有语义的祖先
          let anc = el.parentElement; const chain = [];
          while (anc && anc !== tools) { const c = (anc.className||'').toString(); chain.push((anc.tagName + (c ? '.' + c.slice(-25) : '') + (anc.getAttribute('data-slot') ? '[slot=' + anc.getAttribute('data-slot') + ']' : ''))); anc = anc.parentElement; }
          hits.push({ inline: el.getAttribute('style').slice(0, 80), kids, chain });
        }
      });
      return hits;
    }""")
    print(json.dumps(info, ensure_ascii=False, indent=1))
    b.close()
