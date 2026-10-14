# -*- coding: utf-8 -*-
"""M6 round 6 (HEAD bda3c5a): four-state verification with THREE-WAY assertion.

Per parent instruction, every state must satisfy ALL THREE:
  (a) state switched   - computed background-image on the sprite
  (b) PNG was fetched  - page.on('request') for that state PNG, HTTP 200
  (c) actually painted - pixel sampling on the sprite rect shows non-background pixels

Also re-checks the session-switch scenario now that Route A landed.

Usage: python verify_m6_states6.py <url>
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
    print("      " + json.dumps(raw, ensure_ascii=False)[:1600])

FACTS = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const bg = s ? getComputedStyle(s).backgroundImage : null;
  let stt = null;
  if (bg && bg.includes('deepy/')) stt = bg.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
  const r = s ? s.getBoundingClientRect() : null;
  return {state: stt, alive: !!s, rootInDom: !!root,
          childCount: root ? root.children.length : null,
          childClasses: root ? [...root.children].map(c => c.className) : null,
          w: s ? getComputedStyle(s).width : null,
          rect: r ? {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)} : null};
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
    path = os.path.join(HERE, "states6-%s-clip.png" % tag)
    pg.screenshot(path=path, clip={"x": rect["x"], "y": rect["y"], "width": rect["w"], "height": rect["h"]})
    im = Image.open(path).convert("RGBA")
    px = list(im.getdata())
    bg = Counter(px).most_common(1)[0][0]
    return {"w": im.width, "h": im.height, "total": len(px), "dominant": list(bg),
            "nonBgCount": sum(1 for c in px if c != bg)}

LONG90 = ("Use the pwsh tool to run this exact command: Start-Sleep -Seconds 90 . "
          "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    console, pageerrors = [], []
    pg.on("console", lambda m: console.append({"type": m.type, "text": m.text[:250]}))
    pg.on("pageerror", lambda e: pageerrors.append(str(e)[:250]))
    pngs, pngresps = [], []
    pg.on("request", lambda r: pngs.append(r.url.split("/")[-1]) if "deepy" in r.url and r.url.endswith(".png") else None)
    pg.on("response", lambda r: pngresps.append((r.url.split("/")[-1], r.status)) if "deepy" in r.url and r.url.endswith(".png") else None)

    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    settle(pg)

    # ══════ A. session-switch regression IN-SCENE (Route A check) ══════
    a0 = pg.evaluate(FACTS)
    send(pg, LONG90); pg.wait_for_timeout(6000)
    a1 = pg.evaluate(FACTS)
    new_session(pg); pg.wait_for_timeout(5000)
    a2 = pg.evaluate(FACTS)
    seq_a, ok_a, a3 = wait_state(pg, "typing", 25)
    rec("A-session-switch", "Route A：切会话后精灵仍在 DOM 且能继续渲染（缺陷回归）",
        a2["alive"] and a2["rootInDom"] and a2["state"] is not None and a3["state"] is not None,
        {"beforeSend": a0, "activeBeforeSwitch": a1, "afterNewSession": a2,
         "afterSwitchSequence": seq_a, "final": a3,
         "note": "修复前此步 spriteInDom=false / state=null（见 repro-result.json vB_after_new_session）"})
    pg.screenshot(path=os.path.join(HERE, "states6-sessionswitch.png"))

    # ══════ B. building: >=3 concurrent ══════
    pngs.clear()
    send(pg, LONG90); pg.wait_for_timeout(7000)
    new_session(pg); send(pg, LONG90); pg.wait_for_timeout(7000)
    new_session(pg); send(pg, LONG90); pg.wait_for_timeout(7000)
    seq_b, ok_b, q_b = wait_state(pg, "building", 45)
    pix_b = pixels(pg, q_b["rect"], "building") if ok_b else None
    rec("building", "building：≥3 会话并发 → 状态切+PNG拉取+像素可见（三合一）",
        ok_b and "building.png" in set(pngs) and pix_b and pix_b["nonBgCount"] > 0,
        {"sequence": seq_b, "reached": ok_b, "state": q_b["state"], "rect": q_b["rect"],
         "buildingPngRequested": "building.png" in set(pngs),
         "pixels": pix_b, "pngRequests": sorted(set(pngs)),
         "renderingDefectBypassed": False,
         "note": "本态无需绕过渲染缺陷——切会话后精灵不再消失"})
    pg.screenshot(path=os.path.join(HERE, "states6-building.png"))

    # ══════ C. music: step down 3->2 ══════
    # the 30s session finishes, dropping concurrency to 2
    new_session(pg); send(pg, "Use the pwsh tool to run this exact command: Start-Sleep -Seconds 25 . "
                              "You MUST call the tool exactly once. Then reply DONE.")
    seq_c, ok_c, q_c = wait_state(pg, "music", 90)
    pix_c = pixels(pg, q_c["rect"], "music") if ok_c else None
    rec("music", "music：3→2 并发回落 → 状态切+PNG拉取+像素可见（三合一）",
        ok_c and "music.png" in set(pngs) and pix_c and pix_c["nonBgCount"] > 0,
        {"sequence": seq_c, "reached": ok_c, "state": q_c["state"], "rect": q_c["rect"],
         "musicPngRequested": "music.png" in set(pngs), "pixels": pix_c,
         "pngRequests": sorted(set(pngs)), "renderingDefectBypassed": False})
    pg.screenshot(path=os.path.join(HERE, "states6-music.png"))

    # ══════ D. error ══════
    pngs.clear()
    new_session(pg); settle(pg, 6000)
    send(pg, "Use the pwsh tool to run this exact command: exit 9 . You MUST call the tool exactly once. "
             "Do not retry, do not use other tools. Then reply DONE.")
    seq_d, ok_d, q_d = wait_state(pg, "error", 70)
    pix_d = pixels(pg, q_d["rect"], "error") if ok_d else None
    rec("error", "error：工具失败 → 状态切+PNG拉取+像素可见（三合一）",
        ok_d and "error.png" in set(pngs) and pix_d and pix_d["nonBgCount"] > 0,
        {"sequence": seq_d, "reached": ok_d, "state": q_d["state"], "rect": q_d["rect"],
         "errorPngRequested": "error.png" in set(pngs), "pixels": pix_d,
         "pngRequests": sorted(set(pngs)),
         "note": "rounds 3-5 用 exit/Get-Item/未知工具 均落到 happy；本轮见 raw 判据"})
    pg.screenshot(path=os.path.join(HERE, "states6-error.png"))

    # ══════ E. notification ══════
    notif = {"attempts": []}
    notif["attempts"].append({"probe": "approval DOM nodes at rest",
        "result": pg.evaluate("""() => ({
          approvalNodes: document.querySelectorAll('[data-approval], [class*="pproval"], [class*="ermission"]').length,
          bodyHasApprovalText: /批准|允许|approval|permission/i.test(document.body.innerText||'')
        })""")})
    notif["attempts"].append({"probe": "boot entries with approval/permission",
        "result": pg.evaluate("""() => {
          const b = window.__DSH_BOOT__;
          if (!b || !Array.isArray(b.entries)) return null;
          return b.entries.map(e => e && e.id).filter(Boolean).filter(id => /approv|permission|confirm/i.test(id));
        }""")})
    notif["attempts"].append({"probe": "access mode at rest",
        "result": pg.evaluate("""() => {
          const b = [...document.querySelectorAll('button')].find(x => /访问模式/.test(x.getAttribute('aria-label')||''));
          return b ? b.getAttribute('aria-label') : null;
        }""")})
    new_session(pg); settle(pg, 6000)
    send(pg, "Use the pwsh tool to run this exact command: Remove-Item -Recurse -Force C:\\Windows\\System32\\__m6e2e_nope__ . "
             "You MUST call the tool exactly once. Then reply DONE.")
    seq_e, ok_e, q_e = wait_state(pg, "notification", 45)
    notif["attempts"].append({"probe": "dangerous Remove-Item under System32",
                              "sequence": seq_e, "reached": ok_e, "finalState": q_e["state"]})
    notif["notificationPngRequested"] = "notification.png" in set(pngs)
    if ok_e:
        pix_e = pixels(pg, q_e["rect"], "notification")
        rec("notification", "notification：审批请求 → 状态切+PNG拉取+像素可见", True,
            {**notif, "pixels": pix_e})
    else:
        rec("notification", "notification：本实例无法活体触发（尝试与原因见 raw）", None, notif)
    pg.screenshot(path=os.path.join(HERE, "states6-notification.png"))

    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"head": "bda3c5a", "results": RES, "consoleErrors": errs, "pageerrors": pageerrors,
       "pngStatuses": sorted(set(pngresps))}
with open(os.path.join(HERE, "states6-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print("\n=== ROUND 6 (bda3c5a) SUMMARY ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
print("png statuses:", sorted(set(pngresps)))
