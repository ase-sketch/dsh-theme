# -*- coding: utf-8 -*-
"""M6 DEFECT minimal reproduction: sprite permanently lost after session switch.

Symptom: #dsh-theme-deepy exists in DOM but has NO .dsh-theme-deepy-sprite child,
and no state ever renders again (paint() returns false because el.firstChild === null).

Usage: python repro_sprite_loss.py <url>
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
  return {
    rootInDom: !!root,
    rootChildCount: root ? root.children.length : null,
    rootChildClasses: root ? [...root.children].map(c => c.className) : null,
    spriteInDom: !!s,
    spriteIsChildOfRoot: !!(root && s && s.parentNode === root),
    state: stt,
    phase: (() => { const e = document.querySelector('[data-content-phase]'); return e ? e.getAttribute('data-content-phase') : null; })(),
    session: (() => { const e = document.querySelector('[data-conversation-session]'); return e ? e.getAttribute('data-conversation-session').slice(-8) : null; })(),
  };
}"""

def new_session(pg):
    pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '新建会话');
      if (b) b.click();
    }""")
    pg.wait_for_timeout(3000)

def send(pg, text):
    ed = pg.query_selector('[contenteditable="true"]')
    if ed is None: return False
    ed.click(); pg.wait_for_timeout(300)
    pg.keyboard.type(text, delay=3)
    pg.wait_for_timeout(300)
    pg.keyboard.press("Enter")
    return True

R = {"variants": []}

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pngs = []
    pg.on("request", lambda r: pngs.append(r.url.split("/")[-1]) if "deepy" in r.url and r.url.endswith(".png") else None)
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)

    R["v0_initial"] = pg.evaluate(FACTS)

    # ── Variant A: blank session -> new blank session (no send) ──
    new_session(pg)
    R["vA_blank_to_blank"] = pg.evaluate(FACTS)

    # ── Variant B: send in current session (make it active) -> new session ──
    send(pg, "Use the pwsh tool to run: Start-Sleep -Seconds 60 . You MUST call the tool. Then reply DONE.")
    pg.wait_for_timeout(6000)
    R["vB_active_before_switch"] = pg.evaluate(FACTS)
    new_session(pg)
    R["vB_after_new_session"] = pg.evaluate(FACTS)
    pg.wait_for_timeout(6000)
    R["vB_after_6s_wait"] = pg.evaluate(FACTS)

    # ── Variant C: switch back to the active session ──
    pg.evaluate("""() => {
      const rows = [...document.querySelectorAll('[class*="sessionRow"], [class*="session"][role="button"], li')];
      const hit = rows.find(e => (e.textContent||'').includes('Start-Sleep') || (e.textContent||'').includes('pwsh'));
      if (hit) hit.click();
    }""")
    pg.wait_for_timeout(4000)
    R["vC_after_switch_back"] = pg.evaluate(FACTS)

    # ── Variant D: does reload recover? ──
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)
    R["vD_after_reload"] = pg.evaluate(FACTS)

    R["pngRequests"] = pngs
    pg.screenshot(path=os.path.join(HERE, "repro-sprite-loss.png"))
    b.close()

with open(os.path.join(HERE, "repro-result.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1))
