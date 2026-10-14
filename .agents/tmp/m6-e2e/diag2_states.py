# -*- coding: utf-8 -*-
"""Diagnostic 2: replicate the round-2 concurrency scenario with FULL fact sampling."""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))

FACTS = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const slot = document.querySelector('[data-slot="conversation.input.left"]');
  const bg = s ? getComputedStyle(s).backgroundImage : null;
  let stt = null;
  if (bg && bg.includes('deepy/')) stt = bg.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
  return {
    root: !!root, sprite: !!s, st: stt,
    parent: root && root.parentNode ? (root.parentNode.getAttribute('data-slot')||root.parentNode.tagName) : null,
    slot: !!slot,
    editors: document.querySelectorAll('[contenteditable="true"]').length,
    session: (() => { const e = document.querySelector('[data-conversation-session]'); return e ? e.getAttribute('data-conversation-session').slice(-8) : null; })(),
    phase: (() => { const e = document.querySelector('[data-content-phase]'); return e ? e.getAttribute('data-content-phase') : null; })(),
    running: (() => { const t = document.querySelectorAll('[class*="running" i], [class*="spinner" i], [class*="loading" i]').length; return t; })(),
    composerText: (() => { const e = document.querySelector('[contenteditable="true"]'); return e ? (e.textContent||'').slice(0,25) : null; })(),
    stopBtn: [...document.querySelectorAll('button')].filter(b => /停止|stop/i.test((b.getAttribute('aria-label')||'') + (b.title||''))).length,
    bodyMsgCount: document.querySelectorAll('[data-message-role], [class*="message"]').length,
  };
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
    ok = pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '新建会话');
      if (b) { b.click(); return true; } return false;
    }""")
    pg.wait_for_timeout(2500)
    return ok

LONG = ("Use the pwsh tool to run this exact command: Start-Sleep -Seconds 75 . "
        "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pngs = []
    pg.on("request", lambda r: pngs.append((round(time.time(),2), r.url.split("/")[-1])) if "deepy" in r.url and r.url.endswith(".png") else None)
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)
    R = {"steps": []}

    R["new1"] = new_session(pg)
    R["send1"] = send(pg, LONG)
    for i in range(10):
        pg.wait_for_timeout(1000)
        R["steps"].append({"phase": "after-send1", "t": i+1, **pg.evaluate(FACTS)})

    R["new2"] = new_session(pg)
    R["steps"].append({"phase": "after-new2", **pg.evaluate(FACTS)})
    R["send2"] = send(pg, LONG)
    for i in range(25):
        pg.wait_for_timeout(1000)
        R["steps"].append({"phase": "after-send2", "t": i+1, **pg.evaluate(FACTS)})

    R["pngRequests"] = pngs
    pg.screenshot(path=os.path.join(HERE, "diag2-two-sessions.png"))
    b.close()

with open(os.path.join(HERE, "diag2-result.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print(json.dumps({"new1": R["new1"], "send1": R["send1"], "new2": R["new2"], "send2": R["send2"],
                  "pngRequests": R["pngRequests"]}, ensure_ascii=False))
print("--- steps (compact) ---")
for s in R["steps"]:
    print(json.dumps(s, ensure_ascii=False))
