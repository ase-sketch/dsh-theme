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
      const out = [];
      tools.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.flexWrap === 'wrap') out.push({ tag: el.tagName, cls: (el.className||'').toString().slice(-40), inline: el.getAttribute('style'), slot: el.getAttribute('data-slot'), id: el.id || null });
      });
      return out;
    }""")
    print(json.dumps(info, ensure_ascii=False, indent=1))
    b.close()
