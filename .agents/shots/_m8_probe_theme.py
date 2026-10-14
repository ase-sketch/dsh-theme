# -*- coding: utf-8 -*-
import json
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:19488/?token=<REDACTED>"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    pg = b.new_context(viewport={"width":1440,"height":900}).new_page()
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button,[role=button]')].find(x=>/设置|Settings/i.test(x.getAttribute('aria-label')||x.textContent||'')); if(b) b.click(); }""")
    pg.wait_for_timeout(2500)
    # 找主题控件
    probe = pg.evaluate("""() => {
      const hits = [];
      document.querySelectorAll('*').forEach(el => {
        const t = (el.textContent||'').trim();
        if (el.children.length <= 2 && /^(深色|浅色|跟随系统|Dark|Light|System)$/.test(t)) {
          hits.push({ tag: el.tagName, text: t, role: el.getAttribute('role'), cls: (el.className||'').toString().slice(0,60), parentRole: el.parentElement && el.parentElement.getAttribute('role') });
        }
      });
      const radios = [...document.querySelectorAll('[role="radio"],[role="tab"]')].map(e => ({ text: (e.textContent||'').trim().slice(0,20), checked: e.getAttribute('aria-checked') || e.getAttribute('aria-selected') }));
      return { hits: hits.slice(0, 10), radios: radios.slice(0, 15) };
    }""")
    print(json.dumps(probe, ensure_ascii=False, indent=1))
    b.close()
