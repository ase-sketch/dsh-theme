# -*- coding: utf-8 -*-
"""M6 round 11 (HEAD ecc2b4e): characterize error visibility across repeated interrupts.

Round-10 gave conflicting results: run A never saw error, run B caught it (851 px).
Run N=4 attempts, each measuring: did error appear, and for how long (40ms sampling).

Usage: python verify_m6_states11.py <url>
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))

FACTS = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const bg = s ? getComputedStyle(s).backgroundImage : null;
  let stt = null;
  if (bg && bg.includes('deepy/')) stt = bg.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
  return {state: stt, alive: !!s};
}"""

def new_session(pg):
    pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '新建会话');
      if (b) b.click();
    }""")
    pg.wait_for_timeout(2500)

def send(pg, text):
    ed = pg.query_selector('[contenteditable="true"]')
    if ed is None: return False
    ed.click(); pg.wait_for_timeout(300)
    pg.keyboard.type(text, delay=3)
    pg.wait_for_timeout(300)
    pg.keyboard.press("Enter")
    return True

def settle(pg, ms=9000):
    pg.wait_for_timeout(ms)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    console, pageerrors = [], []
    pg.on("console", lambda m: console.append({"type": m.type, "text": m.text[:250]}))
    pg.on("pageerror", lambda e: pageerrors.append(str(e)[:250]))
    pngs = []
    pg.on("request", lambda r: pngs.append(r.url.split("/")[-1]) if "deepy" in r.url and r.url.endswith(".png") else None)

    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    settle(pg)

    attempts = []
    for i in range(4):
        new_session(pg); settle(pg, 6000)
        pngs.clear()
        pg.evaluate("""() => {
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
        t0 = time.time(); reached = False
        while time.time() - t0 < 45:
            pg.wait_for_timeout(200)
            if pg.evaluate(FACTS)["state"] == "typing":
                reached = True; break
        clicked = pg.evaluate("""() => {
          const s = [...document.querySelectorAll('button')].find(b => /停止|stop/i.test(b.getAttribute('aria-label')||''));
          if (s) { s.click(); return true; } return false;
        }""")
        pg.wait_for_timeout(9000)
        h = pg.evaluate("""() => {
          clearInterval(window.__t);
          const mark = window.__mark; const out = []; let last = null;
          for (const x of window.__r) { if (x.t < mark - 300) continue;
            if (x.s !== last) { out.push({dt: Math.round(x.t-mark), state: x.s}); last = x.s; } }
          return {transitions: out, samples: window.__r.length};
        }""")
        tr = h["transitions"]
        idx = next((j for j, x in enumerate(tr) if x["state"] == "error"), None)
        hold = (tr[idx+1]["dt"] - tr[idx]["dt"]) if (idx is not None and idx+1 < len(tr)) else None
        attempts.append({"attempt": i+1, "reachedTyping": reached, "stopClicked": clicked,
                         "transitions": tr, "samples": h["samples"],
                         "errorVisible": idx is not None, "errorHoldMs": hold,
                         "errorPngRequested": "error.png" in set(pngs),
                         "pngRequests": sorted(set(pngs))})

    visible = sum(1 for a in attempts if a["errorVisible"])
    holds = [a["errorHoldMs"] for a in attempts if a["errorHoldMs"] is not None]
    out = {"head": "ecc2b4e", "attempts": attempts,
           "errorVisibleCount": "%d/%d" % (visible, len(attempts)),
           "errorHoldMsValues": holds,
           "consoleErrors": [c for c in console if c["type"] == "error"],
           "pageerrors": pageerrors}
    with open(os.path.join(HERE, "states11-result.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1)[:7000])
    b.close()
