# -*- coding: utf-8 -*-
"""M6 round 7 (bda3c5a): error via turn interrupt + notification recon.

error: rounds 3-6 showed tool "failures" (exit N / missing file / unknown tool) all
surface as turn/end reason=completed -> 'happy'. The state machine's error branch also
covers turn/end reason=interrupted, which IS live-triggerable via the stop button.

notification: recon the access-mode dropdown for a stricter mode that requires approval.

Usage: python verify_m6_states7.py <url>
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

def wait_state(pg, want, budget_s, cadence=0.25):
    t0 = time.time(); seq = []; seen = None
    while time.time() - t0 < budget_s:
        pg.wait_for_timeout(int(cadence*1000))
        q = pg.evaluate(FACTS)
        if q["state"] != seen:
            seq.append({"t": round(time.time()-t0, 2), "state": q["state"], "alive": q["alive"]})
            seen = q["state"]
        if seen == want:
            return seq, True, q
    return seq, False, pg.evaluate(FACTS)

def pixels(pg, rect, tag):
    if not rect or rect["w"] <= 0: return None
    path = os.path.join(HERE, "states7-%s-clip.png" % tag)
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

    # ══════ error via INTERRUPT: start a long tool, then click stop ══════
    pngs.clear()
    new_session(pg); settle(pg, 6000)
    send(pg, "Use the pwsh tool to run this exact command: Start-Sleep -Seconds 120 . "
             "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")
    # wait until the tool is actually running (sprite shows typing = a tool is active)
    seq_pre, in_tool, q_pre = wait_state(pg, "typing", 40)
    stop_info = None
    if in_tool:
        stop_info = pg.evaluate("""() => {
          const btns = [...document.querySelectorAll('button')];
          const s = btns.find(b => /停止|stop/i.test((b.getAttribute('aria-label')||'') + ' ' + (b.title||'') + ' ' + (b.textContent||'')));
          if (s) { s.click(); return {clicked: true, aria: s.getAttribute('aria-label'), title: s.title, text: (s.textContent||'').trim().slice(0,20)}; }
          return {clicked: false};
        }""")
    seq_e, ok_e, q_e = wait_state(pg, "error", 25)
    pix_e = pixels(pg, q_e["rect"], "error") if ok_e else None
    fb = None
    if ok_e:
        t_err = time.time(); fbs = []; seen2 = "error"
        while time.time() - t_err < 8.0:
            pg.wait_for_timeout(250)
            q = pg.evaluate(FACTS)
            if q["state"] != seen2:
                fbs.append({"t": round(time.time()-t_err, 2), "state": q["state"]}); seen2 = q["state"]
        fb = {"sequence": fbs, "stateAfter": seen2, "secondsObserved": round(time.time()-t_err, 2)}
    rec("error", "error：回合被中断 → 状态切 error + error.png 拉取 + 像素可见（三合一）",
        ok_e and "error.png" in set(pngs) and pix_e and pix_e["nonBgCount"] > 0,
        {"preSequence": seq_pre, "stopClick": stop_info, "errorSequence": seq_e,
         "reached": ok_e, "state": q_e["state"], "rect": q_e["rect"],
         "errorPngRequested": "error.png" in set(pngs), "pixels": pix_e,
         "fallback": fb, "pngRequests": sorted(set(pngs)),
         "note": "turn/end reason=interrupted 走 deepyProject 的 error 分支；4800ms 后应按档位回落（R3）"})
    pg.screenshot(path=os.path.join(HERE, "states7-error.png"))

    # ══════ notification recon: access-mode dropdown options ══════
    new_session(pg); settle(pg, 6000)
    recon = pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x => /访问模式/.test(x.getAttribute('aria-label')||''));
      if (!b) return {found: false};
      b.click();
      return {found: true, aria: b.getAttribute('aria-label')};
    }""")
    pg.wait_for_timeout(1500)
    recon["options"] = pg.evaluate("""() => {
      const items = [...document.querySelectorAll('[role="menuitem"], [role="option"], button, li, div')]
        .filter(e => e.offsetParent !== null)
        .map(e => (e.textContent||'').trim())
        .filter(t => t && t.length < 60);
      const uniq = [...new Set(items)];
      return uniq.filter(t => /只读|读写|完全|沙箱|访问|模式|read|write|full|sandbox|ask|询问|批准/i.test(t)).slice(0, 25);
    }""")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    rec("notification-recon", "notification：审批面侦察（access-mode 选项 + approval 插件存在性）",
        None, {"recon": recon,
               "approvalPluginsInBoot": pg.evaluate("""() => {
                 const b = window.__DSH_BOOT__;
                 if (!b || !Array.isArray(b.entries)) return null;
                 return b.entries.map(e => e && e.id).filter(Boolean).filter(id => /approv|permission|confirm/i.test(id));
               }"""),
               "note": "若存在可切换的严格访问模式，下一轮据此构造审批请求"})

    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"head": "bda3c5a", "results": RES, "consoleErrors": errs, "pageerrors": pageerrors}
with open(os.path.join(HERE, "states7-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("\n=== ROUND 7 SUMMARY ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
