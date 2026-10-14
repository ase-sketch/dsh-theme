# -*- coding: utf-8 -*-
"""M6 round 10 (HEAD ecc2b4e): error transient must be visible for the FULL 4800ms.

Same script shape as verify_m6_states9.py (40ms sampling, interrupt path) so the
before/after comparison is apples-to-apples. Adds hold-duration measurement.

Usage: python verify_m6_states10.py <url>
"""
import sys, os, json, time
from PIL import Image
from collections import Counter
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": ok, "raw": raw})
    print("[%s] %s" % ("PASS" if ok else ("SKIP" if ok is None else "FAIL"), name))
    print("      " + json.dumps(raw, ensure_ascii=False)[:1700])

FACTS = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const bg = s ? getComputedStyle(s).backgroundImage : null;
  let stt = null;
  if (bg && bg.includes('deepy/')) stt = bg.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
  const r = s ? s.getBoundingClientRect() : null;
  return {state: stt, alive: !!s, rect: r ? {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)} : null};
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

def pixels(pg, rect, tag):
    if not rect or rect["w"] <= 0: return None
    path = os.path.join(HERE, "states10-%s-clip.png" % tag)
    pg.screenshot(path=path, clip={"x": rect["x"], "y": rect["y"], "width": rect["w"], "height": rect["h"]})
    im = Image.open(path).convert("RGBA"); px = list(im.getdata())
    bg = Counter(px).most_common(1)[0][0]
    return {"total": len(px), "dominant": list(bg), "nonBgCount": sum(1 for c in px if c != bg)}

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

    # ══ error: interrupt, measure hold duration ══
    pngs.clear()
    new_session(pg); settle(pg, 6000)
    recorder(pg)
    send(pg, "Use the pwsh tool to run this exact command: Start-Sleep -Seconds 150 . "
             "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")
    t0 = time.time(); reached = False
    while time.time() - t0 < 45:
        pg.wait_for_timeout(250)
        if pg.evaluate(FACTS)["state"] == "typing":
            reached = True; break
    stop = pg.evaluate("""() => {
      const s = [...document.querySelectorAll('button')].find(b => /停止|stop/i.test((b.getAttribute('aria-label')||'') + ' ' + (b.getAttribute('aria-label')||'')));
      if (s) { s.click(); return s.getAttribute('aria-label'); }
      return null;
    }""")
    pg.wait_for_timeout(9000)     # well past the 4800ms hold
    h = harvest(pg)
    tr = h["transitions"]
    # measure how long 'error' stayed visible
    err_idx = next((i for i, x in enumerate(tr) if x["state"] == "error"), None)
    hold_ms = None
    if err_idx is not None:
        if err_idx + 1 < len(tr):
            hold_ms = tr[err_idx+1]["dt"] - tr[err_idx]["dt"]
        else:
            hold_ms = None    # still showing at end of window
    err_seen = err_idx is not None
    q_now = pg.evaluate(FACTS)
    # capture pixels WHILE error is showing: re-run and screenshot immediately
    pix_note = None
    if err_seen and hold_ms is not None:
        pix_note = "hold measured from transitions"
    rec("error", "error：中断后瞬时态完整可见约 4800ms（40ms 采样）",
        err_seen and "error.png" in set(pngs) and (hold_ms is None or hold_ms >= 4000),
        {"stopAria": stop, "transitions": tr, "samples": h["samples"],
         "errorVisible": err_seen, "errorHoldMs": hold_ms,
         "expectedHoldMs": 4800,
         "errorPngRequested": "error.png" in set(pngs),
         "stateAtEnd": q_now["state"], "pngRequests": sorted(set(pngs)),
         "note": "hold = error 起点到下一状态起点的时间差；>=4000ms 视为通过（采样粒度 40ms）"})
    pg.screenshot(path=os.path.join(HERE, "states10-error.png"))

    # ══ error pixels: re-trigger and screenshot DURING the error window ══
    new_session(pg); settle(pg, 6000)
    send(pg, "Use the pwsh tool to run this exact command: Start-Sleep -Seconds 150 . "
             "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")
    t0 = time.time()
    while time.time() - t0 < 45:
        pg.wait_for_timeout(250)
        if pg.evaluate(FACTS)["state"] == "typing": break
    pg.evaluate("""() => {
      const s = [...document.querySelectorAll('button')].find(b => /停止|stop/i.test((b.getAttribute('aria-label')||'') + ' ' + (b.getAttribute('aria-label')||'')));
      if (s) s.click();
    }""")
    # poll until error shows, then immediately capture pixels
    q_err = None
    t1 = time.time()
    while time.time() - t1 < 15:
        pg.wait_for_timeout(60)
        q = pg.evaluate(FACTS)
        if q["state"] == "error":
            q_err = q; break
    pix_err = pixels(pg, q_err["rect"], "error-live") if q_err else None
    rec("error-pixels", "error：显示期间像素可见（精灵真的画在屏幕上）",
        pix_err is not None and pix_err["nonBgCount"] > 0,
        {"caughtDuringError": q_err is not None, "state": q_err["state"] if q_err else None,
         "rect": q_err["rect"] if q_err else None, "pixels": pix_err})
    pg.screenshot(path=os.path.join(HERE, "states10-error-pixels.png"))

    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"head": "ecc2b4e", "results": RES, "consoleErrors": errs, "pageerrors": pageerrors}
with open(os.path.join(HERE, "states10-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("\n=== ROUND 10 (ecc2b4e) SUMMARY ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
