# -*- coding: utf-8 -*-
"""Diagnostic: why did state sampling return null after new_session()?"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))

FACTS = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const slot = document.querySelector('[data-slot="conversation.input.left"]');
  const ed = document.querySelector('[contenteditable="true"]');
  return {
    rootExists: !!root,
    spriteExists: !!s,
    rootConnected: root ? root.isConnected : null,
    rootParent: root && root.parentNode ? (root.parentNode.tagName + '|' + (root.parentNode.getAttribute('data-slot')||'')) : null,
    bg: s ? getComputedStyle(s).backgroundImage : null,
    slotExists: !!slot,
    editorExists: !!ed,
    editorCount: document.querySelectorAll('[contenteditable="true"]').length,
    sessionAttr: (() => { const e = document.querySelector('[data-conversation-session]'); return e ? e.getAttribute('data-conversation-session') : null; })(),
    contentPhase: (() => { const e = document.querySelector('[data-content-phase]'); return e ? e.getAttribute('data-content-phase') : null; })(),
    url: location.href.slice(0, 120),
    bodyLen: (document.body.innerText||'').length,
    htmlAttrs: [...document.documentElement.attributes].map(a=>a.name),
  };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pages_before = len(ctx.pages)
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)
    R = {"before": pg.evaluate(FACTS), "pagesBefore": pages_before}

    # click 新建会话 and watch
    clicked = pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '新建会话');
      if (b) { b.click(); return true; } return false;
    }""")
    R["newSessionClicked"] = clicked
    pg.wait_for_timeout(3000)
    R["afterNewSession"] = pg.evaluate(FACTS)
    R["pagesAfterNewSession"] = len(ctx.pages)
    R["pageUrlsAfter"] = [x.url[:100] for x in ctx.pages]

    # try to send
    ed = pg.query_selector('[contenteditable="true"]')
    R["editorFoundByPlaywright"] = ed is not None
    if ed is not None:
        ed.click(); pg.wait_for_timeout(400)
        pg.keyboard.type("Use the pwsh tool to run: Start-Sleep -Seconds 40 . You MUST call the tool. Then reply DONE.", delay=3)
        pg.wait_for_timeout(400)
        pg.keyboard.press("Enter")
        R["sent"] = True
    else:
        R["sent"] = False

    samples = []
    for i in range(20):
        pg.wait_for_timeout(1000)
        f = pg.evaluate(FACTS)
        samples.append({"t": i+1, "rootExists": f["rootExists"], "spriteExists": f["spriteExists"],
                        "bg": (f["bg"] or "")[-40:], "sessionAttr": (f["sessionAttr"] or "")[-12:],
                        "phase": f["contentPhase"]})
    R["samples"] = samples
    R["pagesFinal"] = len(ctx.pages)
    pg.screenshot(path=os.path.join(HERE, "diag-after-newsession.png"))
    b.close()

with open(os.path.join(HERE, "diag-result.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1)[:5000])
