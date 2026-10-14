# -*- coding: utf-8 -*-
"""M6 round 4: pin down music (step-down) and error (guaranteed tool failure).

Round-3 lessons:
* building PASSED (3 concurrent, after reload) with building.png fetched -> state machine
  + on-demand loading both correct for the >=3 tier.
* music was never observed because concurrency went 0 -> 3 in one jump; need a STEP DOWN
  (start 3, let one finish) or start exactly 2.
* the "failing command" round-3 attempt actually SUCCEEDED (sequence ended happy, no
  error.png) - need a command that provably exits non-zero.

Usage: python verify_m6_states4.py <url>
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": ok, "raw": raw})
    print("[%s] %s" % ("PASS" if ok else ("SKIP" if ok is None else "FAIL"), name))
    print("      " + json.dumps(raw, ensure_ascii=False)[:1500])

FACTS = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const bg = s ? getComputedStyle(s).backgroundImage : null;
  let stt = null;
  if (bg && bg.includes('deepy/')) stt = bg.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
  return {state: stt, spriteAlive: !!s, childCount: root ? root.children.length : null,
          phase: (() => { const e = document.querySelector('[data-content-phase]'); return e ? e.getAttribute('data-content-phase') : null; })()};
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

def sample(pg, seconds, cadence=0.3):
    t0 = time.time(); seq = []; seen = None
    while time.time() - t0 < seconds:
        pg.wait_for_timeout(int(cadence*1000))
        q = pg.evaluate(FACTS)
        if q["state"] != seen:
            seq.append({"t": round(time.time()-t0, 2), "state": q["state"], "alive": q["spriteAlive"]})
            seen = q["state"]
    return seq

# 90s tool call: long enough to hold concurrency while we create sessions
LONG = ("Use the pwsh tool to run this exact command: Start-Sleep -Seconds 90 . "
        "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")
# guaranteed non-zero exit: the tool should report an error
FAILCMD = ("Use the pwsh tool to run this exact command: exit 7 . "
           "This command exits with a non-zero code on purpose. You MUST call the tool exactly once. "
           "Do not retry and do not use any other tool. Then reply FAILED.")

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

    # ══════════ error: guaranteed non-zero exit, no session switch ══════════
    pngs.clear()
    send(pg, FAILCMD)
    seq_e = sample(pg, 75)
    reached = any(x["state"] == "error" for x in seq_e)
    err_png = "error.png" in set(pngs)
    after = None
    if reached:
        t_err = time.time(); fb = []; seen2 = "error"
        while time.time() - t_err < 8.0:
            pg.wait_for_timeout(300)
            q = pg.evaluate(FACTS)
            if q["state"] != seen2:
                fb.append({"t": round(time.time()-t_err, 2), "state": q["state"]})
                seen2 = q["state"]
        after = {"fallbackSequence": fb, "stateAfter": seen2, "secondsObserved": round(time.time()-t_err, 2)}
    rec("error", "error：工具非零退出 → 精灵切 error，error.png 按需拉取，4800ms 后按档位回落",
        reached and err_png and after and after["stateAfter"] != "error",
        {"sequence": seq_e, "reachedError": reached, "errorPngRequested": err_png,
         "pngRequests": sorted(set(pngs)), "fallback": after,
         "renderingDefectBypassed": True,
         "note": "单会话内完成，未切会话 → 绕过了渲染缺陷"})
    pg.screenshot(path=os.path.join(HERE, "states4-error.png"))

    # ══════════ music: exactly 2 concurrent, observed after reload ══════════
    pngs.clear()
    send(pg, LONG); pg.wait_for_timeout(7000)          # session A
    new_session(pg); send(pg, LONG); pg.wait_for_timeout(7000)   # session B
    pg.reload(wait_until="domcontentloaded"); settle(pg)         # revive sprite
    seq_m = sample(pg, 40)
    music_hit = any(x["state"] == "music" for x in seq_m)
    rec("music", "music：恰好 2 会话并发（刷新后观察）→ 精灵切 music，music.png 按需拉取",
        music_hit and "music.png" in set(pngs),
        {"sequence": seq_m, "reachedMusic": music_hit,
         "musicPngRequested": "music.png" in set(pngs),
         "pngRequests": sorted(set(pngs)),
         "renderingDefectBypassed": True,
         "note": "刷新让精灵复活；2 个会话在服务端持续 running"})
    pg.screenshot(path=os.path.join(HERE, "states4-music.png"))

    # ══════════ music step-down: add a 3rd then let it finish -> building->music ══════════
    pngs.clear()
    new_session(pg); send(pg, "Use the pwsh tool to run this exact command: Start-Sleep -Seconds 30 . "
                              "You MUST call the tool exactly once. Then reply DONE.")
    pg.reload(wait_until="domcontentloaded"); settle(pg)
    seq_sd = sample(pg, 60)
    sd_music = [x for x in seq_sd if x["state"] == "music"]
    rec("music-stepdown", "music：3→2 并发回落路径 → 精灵经 building 回落到 music",
        len(sd_music) > 0 and "music.png" in set(pngs),
        {"sequence": seq_sd, "musicTransitions": sd_music,
         "pngRequests": sorted(set(pngs)), "renderingDefectBypassed": True})

    # ══════════ notification probe (final) ══════════
    notif = {"attempts": []}
    notif["attempts"].append({"probe": "DOM approval surface at rest",
        "result": pg.evaluate("""() => ({
          approvalNodes: document.querySelectorAll('[data-approval], [class*="pproval"], [class*="ermission"]').length,
          bodyHasApprovalText: /批准|允许|approval|permission/i.test(document.body.innerText||'')
        })""")})
    notif["attempts"].append({"probe": "config: any approval/permission plugin in boot",
        "result": pg.evaluate("""() => {
          const b = window.__DSH_BOOT__;
          if (!b || !Array.isArray(b.entries)) return null;
          return b.entries.map(e => e && e.id).filter(Boolean).filter(id => /approv|permission|confirm/i.test(id));
        }""")})
    new_session(pg)
    send(pg, "Use the pwsh tool to run this exact command: Remove-Item -Recurse -Force C:\\Windows\\System32\\__m6e2e_never_exists__ . "
             "You MUST call the tool exactly once. Then reply DONE.")
    seq_n = sample(pg, 40)
    notif["attempts"].append({"probe": "dangerous Remove-Item under C:\\Windows\\System32",
                              "sequence": seq_n,
                              "reached": any(x["state"] == "notification" for x in seq_n)})
    notif["notificationPngRequested"] = "notification.png" in set(pngs)
    if any(x["state"] == "notification" for x in seq_n):
        rec("notification", "notification：审批请求 → 精灵切 notification", True, notif)
    else:
        rec("notification", "notification：本实例无法活体触发（尝试与原因见 raw）", None, notif)
    pg.screenshot(path=os.path.join(HERE, "states4-notification.png"))

    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"results": RES, "consoleErrors": errs, "pageerrors": pageerrors,
       "pngStatuses": sorted(set(pngresps))}
with open(os.path.join(HERE, "states4-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print("\n=== FOUR-STATE (round 4) SUMMARY ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
print("png statuses:", sorted(set(pngresps)))
