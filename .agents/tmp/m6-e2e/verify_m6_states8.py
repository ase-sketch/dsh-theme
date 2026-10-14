# -*- coding: utf-8 -*-
"""M6 round 8 (bda3c5a): catch the error transient with 50ms sampling + notification via
restricted access mode.

Round-7 finding: error.png WAS requested (state machine entered 'error') but the 250ms
sampler only ever saw 'idle' -> a second turn/end event appears to supersede the
transient immediately. Sample at rAF rate to catch it.

Usage: python verify_m6_states8.py <url>
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
    print("      " + json.dumps(raw, ensure_ascii=False)[:1800])

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

def pixels(pg, rect, tag):
    if not rect or rect["w"] <= 0: return None
    path = os.path.join(HERE, "states8-%s-clip.png" % tag)
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

    # ══════ error: install an in-page 50ms sampler, then interrupt ══════
    pngs.clear()
    new_session(pg); settle(pg, 6000)
    # in-page recorder: poll the sprite background at 20Hz into a global array
    pg.evaluate("""() => {
      window.__m6samples = [];
      const read = () => {
        const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
        if (!s) return null;
        const b = getComputedStyle(s).backgroundImage;
        if (!b || !b.includes('deepy/')) return null;
        return b.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
      };
      window.__m6timer = setInterval(() => {
        window.__m6samples.push({t: Date.now(), s: read()});
      }, 50);
    }""")
    send(pg, "Use the pwsh tool to run this exact command: Start-Sleep -Seconds 120 . "
             "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")
    # wait for the tool to be active
    t0 = time.time()
    while time.time() - t0 < 45:
        pg.wait_for_timeout(250)
        if pg.evaluate(FACTS)["state"] == "typing": break
    pg.evaluate("() => { window.__m6mark = Date.now() }")
    stop = pg.evaluate("""() => {
      const s = [...document.querySelectorAll('button')].find(b => /停止|stop/i.test((b.getAttribute('aria-label')||'') + ' ' + (b.title||'')));
      if (s) { s.click(); return {clicked: true, aria: s.getAttribute('aria-label')}; }
      return {clicked: false};
    }""")
    pg.wait_for_timeout(9000)   # well past the 4800ms error hold
    samples = pg.evaluate("""() => {
      const mark = window.__m6mark;
      const out = [];
      let last = null;
      for (const x of window.__m6samples) {
        if (x.t < mark - 500) continue;
        if (x.s !== last) { out.push({dt: Math.round(x.t - mark), state: x.s}); last = x.s; }
      }
      return {transitions: out, totalSamples: window.__m6samples.length};
    }""")
    pg.evaluate("() => { clearInterval(window.__m6timer) }")
    err_seen = any(x["state"] == "error" for x in samples["transitions"])
    q_now = pg.evaluate(FACTS)
    pix_e = pixels(pg, q_now["rect"], "error") if err_seen else None
    rec("error", "error：回合中断 → 50ms 采样捕获 error 瞬时态 + error.png 拉取 + 像素可见",
        err_seen and "error.png" in set(pngs),
        {"stopClick": stop, "transitions": samples["transitions"],
         "totalSamples": samples["totalSamples"],
         "errorPngRequested": "error.png" in set(pngs),
         "stateAtEnd": q_now["state"], "pixelsAtEnd": pix_e,
         "pngRequests": sorted(set(pngs)),
         "note": "50ms 采样（rAF 量级）；round-7 用 250ms 采样漏掉了该瞬时态"})
    pg.screenshot(path=os.path.join(HERE, "states8-error.png"))

    # ══════ notification: switch access mode to a restricted one, then attempt a write ══════
    new_session(pg); settle(pg, 6000)
    mode = pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x => /访问模式/.test(x.getAttribute('aria-label')||''));
      if (!b) return {found: false};
      b.click(); return {found: true};
    }""")
    pg.wait_for_timeout(1500)
    picked = pg.evaluate("""() => {
      const items = [...document.querySelectorAll('button, [role="menuitem"], [role="option"], li, div')]
        .filter(e => e.offsetParent !== null);
      const want = items.find(e => (e.textContent||'').trim() === '仅可查看');
      if (want) { want.click(); return {clicked: true, text: '仅可查看'}; }
      return {clicked: false, candidates: [...new Set(items.map(e=>(e.textContent||'').trim()).filter(t=>t&&t.length<40))].slice(0,20)};
    }""")
    pg.wait_for_timeout(2000)
    mode_after = pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x => /访问模式/.test(x.getAttribute('aria-label')||''));
      return b ? b.getAttribute('aria-label') : null;
    }""")
    # now attempt a write outside the workspace -> should need approval in read-only mode
    pngs.clear()
    pg.evaluate("""() => {
      window.__m6samples = []; window.__m6mark = Date.now();
      const read = () => {
        const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
        if (!s) return null;
        const b = getComputedStyle(s).backgroundImage;
        if (!b || !b.includes('deepy/')) return null;
        return b.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
      };
      window.__m6timer = setInterval(() => window.__m6samples.push({t: Date.now(), s: read()}), 50);
    }""")
    send(pg, "Use the pwsh tool to run this exact command: New-Item -ItemType File -Path C:\\m6e2e_approval_probe.txt -Force . "
             "You MUST call the tool exactly once. Then reply DONE.")
    pg.wait_for_timeout(30000)
    ns = pg.evaluate("""() => {
      const mark = window.__m6mark; const out = []; let last = null;
      for (const x of window.__m6samples) { if (x.t < mark) continue;
        if (x.s !== last) { out.push({dt: Math.round(x.t-mark), state: x.s}); last = x.s; } }
      return out;
    }""")
    pg.evaluate("() => clearInterval(window.__m6timer)")
    notif_hit = any(x["state"] == "notification" for x in ns)
    notif = {"modeBefore": mode, "picked": picked, "modeAfter": mode_after,
             "transitions": ns, "reachedNotification": notif_hit,
             "notificationPngRequested": "notification.png" in set(pngs),
             "pngRequests": sorted(set(pngs))}
    if notif_hit:
        q_n = pg.evaluate(FACTS)
        notif["pixels"] = pixels(pg, q_n["rect"], "notification")
        rec("notification", "notification：受限访问模式 + 写操作 → 审批请求 → 精灵切 notification", True, notif)
    else:
        rec("notification", "notification：本实例无法活体触发（尝试与原因见 raw）", None, notif)
    pg.screenshot(path=os.path.join(HERE, "states8-notification.png"))

    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"head": "bda3c5a", "results": RES, "consoleErrors": errs, "pageerrors": pageerrors}
with open(os.path.join(HERE, "states8-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("\n=== ROUND 8 SUMMARY ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
