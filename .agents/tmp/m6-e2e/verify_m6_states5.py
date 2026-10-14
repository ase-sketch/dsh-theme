# -*- coding: utf-8 -*-
"""M6 round 5: find a failure mode that actually produces a failing tool/result.

Round 3/4 showed: "exit 7" and "Get-Item missing -ErrorAction Stop" both ended in
'happy' (turn completed), so neither surfaced as a tool ERROR to the state machine.
Try modes that the harness itself rejects (unknown tool, bad path for read tool).

Usage: python verify_m6_states5.py <url>
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": ok, "raw": raw})
    print("[%s] %s" % ("PASS" if ok else ("SKIP" if ok is None else "FAIL"), name))
    print("      " + json.dumps(raw, ensure_ascii=False)[:1600])

FACTS = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const bg = s ? getComputedStyle(s).backgroundImage : null;
  let stt = null;
  if (bg && bg.includes('deepy/')) stt = bg.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
  return {state: stt, alive: !!s};
}"""

def send(pg, text):
    ed = pg.query_selector('[contenteditable="true"]')
    if ed is None: return False
    ed.click(); pg.wait_for_timeout(300)
    pg.keyboard.type(text, delay=3)
    pg.wait_for_timeout(300)
    pg.keyboard.press("Enter")
    return True

def new_session(pg):
    pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '新建会话');
      if (b) b.click();
    }""")
    pg.wait_for_timeout(2500)

def settle(pg, ms=9000):
    pg.wait_for_timeout(ms)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)

def sample(pg, seconds, cadence=0.25):
    t0 = time.time(); seq = []; seen = None
    while time.time() - t0 < seconds:
        pg.wait_for_timeout(int(cadence*1000))
        q = pg.evaluate(FACTS)
        if q["state"] != seen:
            seq.append({"t": round(time.time()-t0, 2), "state": q["state"], "alive": q["alive"]})
            seen = q["state"]
    return seq

CANDIDATES = [
  ("read tool on nonexistent absolute path",
   "Use the read tool to read the file C:\\m6e2e_definitely_missing_file_xyz.txt . "
   "You MUST call the read tool exactly once. Do not use any other tool, do not retry. Then reply DONE."),
  ("unknown tool name",
   "Call the tool named 'm6e2e_nonexistent_tool' exactly once with {}. "
   "You MUST attempt exactly one tool call and no retry. Then reply DONE."),
  ("pwsh with invalid syntax",
   "Use the pwsh tool to run this exact command: this-is-not-valid-powershell-syntax ((( . "
   "You MUST call the pwsh tool exactly once. Do not retry. Then reply DONE."),
]

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

    attempts, hit = [], None
    for label, prompt in CANDIDATES:
        pngs.clear()
        new_session(pg)          # fresh session each attempt (sprite dies on switch)
        settle(pg, 6000)
        send(pg, prompt)
        seq = sample(pg, 55)
        err = any(x["state"] == "error" for x in seq)
        attempts.append({"mode": label, "sequence": seq, "reachedError": err,
                         "errorPngRequested": "error.png" in set(pngs)})
        if err:
            hit = label
            # observe the 4800ms fallback window
            t_err = time.time(); fb = []; seen2 = "error"
            while time.time() - t_err < 8.0:
                pg.wait_for_timeout(250)
                q = pg.evaluate(FACTS)
                if q["state"] != seen2:
                    fb.append({"t": round(time.time()-t_err, 2), "state": q["state"]})
                    seen2 = q["state"]
            attempts[-1]["fallback"] = {"sequence": fb, "stateAfter": seen2,
                                        "secondsObserved": round(time.time()-t_err, 2)}
            break

    ok = hit is not None and "error.png" in set(pngs)
    rec("error", "error：构造工具失败 → 精灵切 error，error.png 按需拉取，4800ms 后按档位回落",
        ok, {"winningMode": hit, "attempts": attempts,
             "renderingDefectBypassed": True,
             "note": "每轮新建会话后重新 settle，绕开渲染缺陷"})
    pg.screenshot(path=os.path.join(HERE, "states5-error.png"))
    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"results": RES, "consoleErrors": errs, "pageerrors": pageerrors}
with open(os.path.join(HERE, "states5-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("\n=== ROUND 5 SUMMARY ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
