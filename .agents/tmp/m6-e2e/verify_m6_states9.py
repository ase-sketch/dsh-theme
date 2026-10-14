# -*- coding: utf-8 -*-
"""M6 round 9 (bda3c5a): characterize the error transient - is it reachable at all, and
is it immediately overwritten?

Round 7: interrupt -> error.png WAS fetched, but sampler only saw 'idle'.
Round 8: interrupt -> error.png NOT fetched, sampler saw thinking->typing->idle.
Run 3 attempts with 40ms sampling and per-attempt request attribution.

Usage: python verify_m6_states9.py <url>
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

def recorder(pg):
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

def harvest(pg):
    return pg.evaluate("""() => {
      clearInterval(window.__t);
      const mark = window.__mark; const out = []; let last = null;
      for (const x of window.__r) { if (x.t < mark - 300) continue;
        if (x.s !== last) { out.push({dt: Math.round(x.t-mark), state: x.s}); last = x.s; } }
      return {transitions: out, samples: window.__r.length};
    }""")

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    console, pageerrors = [], []
    pg.on("console", lambda m: console.append({"type": m.type, "text": m.text[:250]}))
    pg.on("pageerror", lambda e: pageerrors.append(str(e)[:250]))
    pngs = []
    pg.on("request", lambda r: pngs.append({"f": r.url.split("/")[-1], "t": round(time.time(), 3)})
          if "deepy" in r.url and r.url.endswith(".png") else None)

    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    settle(pg)

    attempts = []
    for i in range(3):
        new_session(pg); settle(pg, 6000)
        pngs.clear()
        recorder(pg)
        send(pg, "Use the pwsh tool to run this exact command: Start-Sleep -Seconds 150 . "
                 "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")
        t0 = time.time(); reached_typing = False
        while time.time() - t0 < 45:
            pg.wait_for_timeout(250)
            if pg.evaluate(FACTS)["state"] == "typing":
                reached_typing = True; break
        stop = pg.evaluate("""() => {
          const s = [...document.querySelectorAll('button')].find(b => /停止|stop/i.test((b.getAttribute('aria-label')||'') + ' ' + (b.title||'')));
          if (s) { s.click(); return s.getAttribute('aria-label'); }
          return null;
        }""")
        pg.wait_for_timeout(8000)     # past the 4800ms hold
        h = harvest(pg)
        attempts.append({"attempt": i+1, "reachedTyping": reached_typing, "stopAria": stop,
                         "transitions": h["transitions"], "samples": h["samples"],
                         "errorPngRequested": "error.png" in {x["f"] for x in pngs},
                         "pngRequests": sorted({x["f"] for x in pngs})})

    err_any = any(a["errorPngRequested"] for a in attempts)
    err_visible = any(any(x["state"] == "error" for x in a["transitions"]) for a in attempts)
    out = {"head": "bda3c5a", "attempts": attempts,
           "errorPngRequestedAnyAttempt": err_any,
           "errorVisibleInSamplerAnyAttempt": err_visible,
           "consoleErrors": [c for c in console if c["type"] == "error"],
           "pageerrors": pageerrors}
    with open(os.path.join(HERE, "states9-result.json"), "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print(json.dumps(out, ensure_ascii=False, indent=1)[:6000])
    b.close()
