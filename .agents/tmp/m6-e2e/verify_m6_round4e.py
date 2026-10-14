# -*- coding: utf-8 -*-
"""Round-4e: confirm the null-typed entry IS tool/result, and dump its keys.

Round-4d showed errorVisible <=> exactly one tool/result with isError=true, but the
entry type serialized as null. Dump entryKeys/evKeys to identify it definitively.

Usage: python verify_m6_round4e.py <url>
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))

FACTS = r"""() => {
  const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
  const bg = s ? getComputedStyle(s).backgroundImage : null;
  let stt = null;
  if (bg && bg.includes('deepy/')) stt = bg.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
  return {state: stt};
}"""

def send(pg, text):
    ed = pg.query_selector('[contenteditable="true"]')
    if ed is None: return False
    ed.click(); pg.wait_for_timeout(300)
    pg.keyboard.type(text, delay=3)
    pg.wait_for_timeout(300)
    pg.keyboard.press("Enter")
    return True

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(10000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)

    out = []
    for i in range(4):
        pg.evaluate("""() => {
          const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '新建会话');
          if (b) b.click();
        }""")
        pg.wait_for_timeout(3000)
        pg.evaluate("() => { if (window.__M6_EVTPROBE__) window.__M6_EVTPROBE__.clear() }")
        pg.evaluate(r"""() => {
          window.__r = []; window.__mark = Date.now();
          window.__t = setInterval(() => {
            const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
            let st = null;
            if (s) { const b = getComputedStyle(s).backgroundImage;
              if (b && b.includes('deepy/')) st = b.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png',''); }
            window.__r.push({t: Date.now(), s: st});
          }, 40);
        }""")
        send(pg, "Use the pwsh tool to run this exact command: Start-Sleep -Seconds 150 . "
                 "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")
        t0 = time.time()
        while time.time() - t0 < 45:
            pg.wait_for_timeout(200)
            if pg.evaluate(FACTS)["state"] == "typing": break
        pg.evaluate("""() => {
          const s = [...document.querySelectorAll('button')].find(b => /停止|stop/i.test(b.getAttribute('aria-label')||''));
          if (s) s.click();
        }""")
        pg.wait_for_timeout(8000)
        ui = pg.evaluate(r"""() => {
          clearInterval(window.__t);
          const mark = window.__mark; const out = []; let last = null;
          for (const x of window.__r) { if (x.t < mark - 300) continue;
            if (x.s !== last) { out.push({dt: Math.round(x.t-mark), state: x.s}); last = x.s; } }
          return out;
        }""")
        ev = pg.evaluate("() => window.__M6_EVTPROBE__ ? window.__M6_EVTPROBE__.get() : null")
        recs = ev["records"] if ev else []
        interesting = [r for r in recs if r.get("type") is None or r.get("type") in ("turn/end","tool/result","tool/call","step/end")]
        err_vis = any(x["state"] == "error" for x in ui)
        out.append({"trial": i+1, "errorVisible": err_vis, "ui": ui, "interesting": interesting})

    print(json.dumps(out, ensure_ascii=False, indent=1)[:6000])
    with open(os.path.join(HERE, "round4e-result.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    b.close()
