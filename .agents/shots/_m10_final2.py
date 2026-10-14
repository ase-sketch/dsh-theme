# -*- coding: utf-8 -*-
"""T10 终检：窄视口 nowrap 修复 + po06 面板（!important 波及面）+ 鲸鱼抬头。"""
import json
from playwright.sync_api import sync_playwright
URL = "http://127.0.0.1:19488/?token=<REDACTED>"
errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    pg = b.new_context(viewport={"width":900,"height":800}).new_page()
    pg.on("pageerror", lambda e: errs.append(str(e)[:200]))
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)

    # ① 窄视口不折行
    tools = pg.evaluate("""() => { const t = document.querySelector('[data-composer-card] [class*=tools]'); return t ? { h: Math.round(t.getBoundingClientRect().height), canScroll: t.scrollWidth > t.clientWidth } : null; }""")
    print("[N1]", "PASS" if tools and tools["h"] <= 40 else "FAIL", "| tools:", json.dumps(tools))
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m10-narrow-fixed.png")

    # ② po06 面板（!important 波及面核查）
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button,[role=button],div,span')].find(x=>(x.textContent||'').trim()==='优化选项'); if(b) b.click(); }""")
    pg.wait_for_timeout(1200)
    panel = pg.evaluate("""() => {
      const vw = window.innerWidth; const out = [];
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && el.getBoundingClientRect().width > 200 && el.textContent.includes('档位')) {
          const r = el.getBoundingClientRect();
          let inSlot = false; let a = el.parentElement;
          while (a) { if (a.getAttribute && (a.getAttribute('data-slot')||'').startsWith('conversation.input')) { inSlot = true; break; } a = a.parentElement; }
          out.push({ right: Math.round(r.right), inView: r.right <= vw && r.left >= 0, inSlot, wraps: el.querySelectorAll('*').length });
        }
      });
      return out;
    }""")
    print("[P1]", "PASS" if panel and all(x["inView"] for x in panel) else "FAIL", "|", json.dumps(panel), "| panel-in-slot:", panel[0]["inSlot"] if panel else None)
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m10-po06-final.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    # ③ 鲸鱼抬头（激活会话 → 等 idle → 打字）
    pg.set_viewport_size({"width":1440,"height":900}); pg.wait_for_timeout(600)
    ed = pg.query_selector('[contenteditable="true"]')
    ed.click(); pg.keyboard.type("ping", delay=30); pg.keyboard.press("Enter")
    sprite = None
    for i in range(10):
        pg.wait_for_timeout(2000)
        sprite = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); const sp = d ? d.querySelector('.dsh-theme-deepy-sprite') : null; return sp ? (sp.style.backgroundImage||'').split('/').pop() : 'none'; }""")
        if sprite == 'idle.png")': break
    print("settled:", sprite)
    ed2 = pg.query_selector('[contenteditable="true"]')
    ed2.click(); pg.keyboard.type("hello", delay=50); pg.wait_for_timeout(1000)
    r = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); const sp = d.querySelector('.dsh-theme-deepy-sprite'); return { editing: d.getAttribute('data-dsh-editing'), sprite: (sp.style.backgroundImage||'').split('/').pop() }; }""")
    print("typing →", json.dumps(r))
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m10-lookup.png")
    pg.keyboard.press("Control+a"); pg.keyboard.press("Backspace"); pg.wait_for_timeout(1000)
    r2 = pg.evaluate("""() => { const d = document.querySelector('#dsh-theme-deepy'); const sp = d.querySelector('.dsh-theme-deepy-sprite'); return (sp.style.backgroundImage||'').split('/').pop(); }""")
    ok = "idle-look" in (r["sprite"] or "") and "idle-look" not in (r2 or "")
    print("[B3]", "PASS" if ok else "FAIL", "| cleared →", r2)
    print("pageerrors:", errs if errs else "0")
    b.close()
