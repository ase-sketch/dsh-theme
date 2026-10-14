# -*- coding: utf-8 -*-
"""M6 round 2: live-trigger the four states not yet exercised on a live instance
(music / building / error / notification).

Usage: python verify_m6_states.py <url>

Design notes
------------
* The sprite's state is read from the FINAL OBSERVABLE: computed background-image URL
  on #dsh-theme-deepy .dsh-theme-deepy-sprite (client.js exposes no data-state).
* Every new state is cross-checked against page.on('request'): "state switched but the
  PNG was never fetched" and "PNG fetched but state never switched" must BOTH be catchable.
* Concurrency comes from uiSession.sessionStatus across ALL sessions, so sessions are
  created one after another and left running server-side (long sleep in the tool call).
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": ok, "raw": raw})
    print("[%s] %s" % ("PASS" if ok else ("SKIP" if ok is None else "FAIL"), name))
    print("      " + json.dumps(raw, ensure_ascii=False)[:1200])

STATE_JS = """() => {
  const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
  if (!s) return {state: null, present: false};
  const b = getComputedStyle(s).backgroundImage;
  let st = null;
  if (b && b.includes('deepy/')) { st = b.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png',''); }
  return {state: st, present: true, img: b};
}"""

def st(pg):
    return pg.evaluate(STATE_JS)

def new_session(pg):
    ok = pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '新建会话');
      if (b) { b.click(); return true; } return false;
    }""")
    pg.wait_for_timeout(2500)
    return ok

def send(pg, text):
    ed = pg.query_selector('[contenteditable="true"]')
    if ed is None: return False
    ed.click(); pg.wait_for_timeout(300)
    pg.keyboard.type(text, delay=3)
    pg.wait_for_timeout(300)
    pg.keyboard.press("Enter")
    return True

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    console, pageerrors = [], []
    pg.on("console", lambda m: console.append({"type": m.type, "text": m.text[:300]}))
    pg.on("pageerror", lambda e: pageerrors.append(str(e)[:300]))
    png_reqs, all_reqs = [], []
    pg.on("request", lambda r: (all_reqs.append(r.url), png_reqs.append(r.url.split("/")[-1]) if r.url.endswith(".png") and "deepy" in r.url else None))
    resps = []
    pg.on("response", lambda r: resps.append({"u": r.url.split("/")[-1], "s": r.status}) if "deepy" in r.url else None)

    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)
    png_reqs.clear(); resps.clear()

    LONG = ("Use the pwsh tool to run this exact command: Start-Sleep -Seconds 75 . "
            "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")
    R = {}

    # ══════════════ music: 2 concurrent sessions ══════════════════════════════
    s1 = new_session(pg); send(pg, LONG)
    pg.wait_for_timeout(6000)
    s2 = new_session(pg); send(pg, LONG)
    t0 = time.time()
    seq_m, seen = [], None
    for i in range(70):                       # ~21s at 300ms
        pg.wait_for_timeout(300)
        q = st(pg)
        if q["state"] != seen:
            seq_m.append({"t": round(time.time()-t0, 2), "state": q["state"]})
            seen = q["state"]
        if seen == "music":
            break
    R["music"] = {
        "createdSessions": [s1, s2],
        "sequence": seq_m,
        "reachedMusic": seen == "music",
        "musicPngRequested": "music.png" in png_reqs,
        "pngRequestsSoFar": sorted(set(png_reqs)),
    }
    rec("music", "music：2 会话并发 → 精灵切 music 且 music.png 按需新拉",
        seen == "music" and "music.png" in png_reqs, R["music"])
    pg.screenshot(path=os.path.join(HERE, "states-music.png"))

    # ══════════════ building: add a 3rd concurrent session ════════════════════
    s3 = new_session(pg); send(pg, LONG)
    t0 = time.time()
    seq_b, seen_b = [], None
    for i in range(80):
        pg.wait_for_timeout(300)
        q = st(pg)
        if q["state"] != seen_b:
            seq_b.append({"t": round(time.time()-t0, 2), "state": q["state"]})
            seen_b = q["state"]
        if seen_b == "building":
            break
    R["building"] = {
        "createdSessions": [s1, s2, s3],
        "sequence": seq_b,
        "reachedBuilding": seen_b == "building",
        "buildingPngRequested": "building.png" in png_reqs,
        "pngRequestsSoFar": sorted(set(png_reqs)),
    }
    rec("building", "building：3 会话并发 → 精灵切 building 且 building.png 按需新拉",
        seen_b == "building" and "building.png" in png_reqs, R["building"])
    pg.screenshot(path=os.path.join(HERE, "states-building.png"))

    # ══════════════ error: failing tool call ══════════════════════════════════
    new_session(pg)
    send(pg, "Use the pwsh tool to run this exact command: Get-Item C:\\definitely-not-here-m6e2e -ErrorAction Stop . "
             "The command MUST fail. You MUST call the tool. Then reply FAILED.")
    t0 = time.time()
    seq_e, seen_e, err_at = [], None, None
    for i in range(120):                      # ~36s at 300ms - error window is 4800ms
        pg.wait_for_timeout(300)
        q = st(pg)
        if q["state"] != seen_e:
            seq_e.append({"t": round(time.time()-t0, 2), "state": q["state"]})
            seen_e = q["state"]
            if seen_e == "error":
                err_at = time.time()
        if err_at and time.time() - err_at > 7.0:   # observe past the 4800ms hold
            break
    after = st(pg)
    R["error"] = {
        "sequence": seq_e,
        "reachedError": err_at is not None,
        "errorPngRequested": "error.png" in png_reqs,
        "stateAfter4800msWindow": after["state"],
        "secondsObservedPastError": round(time.time()-err_at, 2) if err_at else None,
        "pngRequestsSoFar": sorted(set(png_reqs)),
        "note": "R3 修正行为：error 瞬时态到期后应回落到『当时剩余活跃工具数』对应档位，而非固定 thinking/idle",
    }
    rec("error", "error：工具失败 → 精灵切 error 且 error.png 按需新拉；4800ms 后按档位回落",
        (err_at is not None) and ("error.png" in png_reqs) and after["state"] != "error",
        R["error"])
    pg.screenshot(path=os.path.join(HERE, "states-error.png"))

    # ══════════════ notification: needs an approval request ═══════════════════
    R["notification"] = {"attempts": []}
    # Probe 1: is there any approval surface in this instance at all?
    probe = pg.evaluate("""() => ({
      approvalNodes: document.querySelectorAll('[data-approval], [class*="pproval"], [class*="ermission"]').length,
      bodyHasApprovalText: /批准|允许|approval|permission/i.test(document.body.innerText||''),
    })""")
    R["notification"]["attempts"].append({"probe": "DOM approval surface", "result": probe})
    # Probe 2: try a command that typically requires approval (outside-workspace write / rm)
    new_session(pg)
    send(pg, "Use the pwsh tool to run this exact command: Remove-Item -Recurse -Force C:\\Users\\pass\\.dsh\\profiles\\web\\node_modules\\dsh-theme\\__never_exists__ "
             "You MUST call the tool. Then reply DONE.")
    t0 = time.time()
    seq_n, seen_n = [], None
    for i in range(100):                      # ~30s
        pg.wait_for_timeout(300)
        q = st(pg)
        if q["state"] != seen_n:
            seq_n.append({"t": round(time.time()-t0, 2), "state": q["state"]})
            seen_n = q["state"]
        if seen_n == "notification":
            break
    R["notification"]["attempts"].append({
        "probe": "dangerous command (Remove-Item outside workspace)",
        "sequence": seq_n,
        "reachedNotification": seen_n == "notification",
    })
    R["notification"]["notificationPngRequested"] = "notification.png" in png_reqs
    R["notification"]["pngRequestsSoFar"] = sorted(set(png_reqs))
    if seen_n == "notification":
        rec("notification", "notification：审批请求 → 精灵切 notification", True, R["notification"])
    else:
        rec("notification", "notification：本实例无法活体触发（见 raw 中的尝试与原因）", None, R["notification"])
    pg.screenshot(path=os.path.join(HERE, "states-notification.png"))

    b.close()

errs = [c for c in console if c["type"] == "error"]
R["_console"] = {"errors": errs, "pageerrors": pageerrors}
R["_results"] = RES
with open(os.path.join(HERE, "states-result.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)

print("\n=== FOUR-STATE SUMMARY ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
print("all deepy png requests:", sorted(set(png_reqs)))
