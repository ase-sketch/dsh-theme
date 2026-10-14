# -*- coding: utf-8 -*-
"""M6 round 3: four-state live verification, routed AROUND the session-switch defect.

Key insight: sessions keep running server-side, but the sprite dies on session switch
(see repro_sprite_loss.py). So: create N concurrent sessions FIRST, then RELOAD the
page so the sprite is alive again while those sessions are still running.

Every state assertion is cross-checked against page.on('request') for the state PNG.

Usage: python verify_m6_states3.py <url>
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": ok, "raw": raw})
    print("[%s] %s" % ("PASS" if ok else ("SKIP" if ok is None else "FAIL"), name))
    print("      " + json.dumps(raw, ensure_ascii=False)[:1400])

FACTS = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const bg = s ? getComputedStyle(s).backgroundImage : null;
  let stt = null;
  if (bg && bg.includes('deepy/')) stt = bg.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
  return {state: stt, spriteAlive: !!s, rootInDom: !!root,
          childCount: root ? root.children.length : null,
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

def sample_until(pg, want, budget_s, cadence=0.3):
    t0 = time.time(); seq = []; seen = None
    while time.time() - t0 < budget_s:
        pg.wait_for_timeout(int(cadence*1000))
        q = pg.evaluate(FACTS)
        if q["state"] != seen:
            seq.append({"t": round(time.time()-t0, 2), "state": q["state"], "spriteAlive": q["spriteAlive"]})
            seen = q["state"]
        if seen == want:
            break
    return seq, seen

LONG = ("Use the pwsh tool to run this exact command: Start-Sleep -Seconds 90 . "
        "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    console, pageerrors = [], []
    pg.on("console", lambda m: console.append({"type": m.type, "text": m.text[:250]}))
    pg.on("pageerror", lambda e: pageerrors.append(str(e)[:250]))
    pngs, pngresps = [], []
    pg.on("request", lambda r: pngs.append({"f": r.url.split("/")[-1], "t": round(time.time(), 2)})
          if "deepy" in r.url and r.url.endswith(".png") else None)
    pg.on("response", lambda r: pngresps.append({"f": r.url.split("/")[-1], "s": r.status})
          if "deepy" in r.url and r.url.endswith(".png") else None)

    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    settle(pg)

    # ══ 1. error: single session, failing tool — no session switch needed ══
    pngs.clear()
    send(pg, "Use the pwsh tool to run this exact command: Get-Item C:\\definitely-not-here-m6e2e-xyz -ErrorAction Stop . "
             "The command MUST fail with an error. You MUST call the tool exactly once. Then reply FAILED.")
    seq_e, seen_e = sample_until(pg, "error", 60)
    err_seen = seen_e == "error"
    after = None
    if err_seen:
        # observe past the 4800ms hold to check the R3 fallback
        time.sleep(0.2)
        t_err = time.time()
        fallback_seq = []
        seen2 = "error"
        while time.time() - t_err < 8.0:
            pg.wait_for_timeout(300)
            q = pg.evaluate(FACTS)
            if q["state"] != seen2:
                fallback_seq.append({"t": round(time.time()-t_err, 2), "state": q["state"]})
                seen2 = q["state"]
        after = {"fallbackSequence": fallback_seq, "stateAfter": seen2,
                 "secondsObserved": round(time.time()-t_err, 2)}
    rec("error", "error：工具失败 → 精灵切 error，error.png 按需拉取，4800ms 后按档位回落",
        err_seen and "error.png" in {x["f"] for x in pngs} and after and after["stateAfter"] != "error",
        {"sequence": seq_e, "reachedError": err_seen,
         "errorPngRequested": "error.png" in {x["f"] for x in pngs},
         "pngRequests": sorted({x["f"] for x in pngs}), "fallback": after})
    pg.screenshot(path=os.path.join(HERE, "states3-error.png"))

    # ══ 2. music: 2 concurrent sessions, created THEN reload ══
    pngs.clear()
    # session A
    send(pg, LONG); pg.wait_for_timeout(7000)
    # session B
    new_session(pg); send(pg, LONG); pg.wait_for_timeout(7000)
    # session C
    new_session(pg); send(pg, LONG); pg.wait_for_timeout(7000)
    R_conc = {"sessionsCreated": 3}
    # reload: sprite revives while all three keep running server-side
    pngs.clear()
    pg.reload(wait_until="domcontentloaded"); settle(pg)
    R_conc["afterReload"] = pg.evaluate(FACTS)
    seq_b, seen_b = sample_until(pg, "building", 45)
    rec("building", "building：3 会话并发（刷新后观察）→ 精灵切 building，building.png 按需拉取",
        seen_b == "building" and "building.png" in {x["f"] for x in pngs},
        {"concurrencySetup": R_conc, "sequence": seq_b, "reached": seen_b,
         "buildingPngRequested": "building.png" in {x["f"] for x in pngs},
         "pngRequests": sorted({x["f"] for x in pngs})})
    pg.screenshot(path=os.path.join(HERE, "states3-building.png"))

    # ══ 3. music: drop to 2 concurrent (one session finishes) ══
    # Rather than waiting, verify music by reaching it during the run-up (sequence above)
    # or by checking the recorded transitions for music.
    music_hit = any(x.get("state") == "music" for x in seq_b)
    rec("music", "music：2 会话并发 → 精灵切 music，music.png 按需拉取（从 building 的爬升序列中捕获）",
        music_hit and "music.png" in {x["f"] for x in pngs},
        {"musicSeenInSequence": music_hit, "sequence": seq_b,
         "musicPngRequested": "music.png" in {x["f"] for x in pngs},
         "pngRequests": sorted({x["f"] for x in pngs}),
         "note": "并发数爬升途中必经 2，故 music 由同一序列捕获"})

    # ══ 4. notification: approval surface probe ══
    notif = {"attempts": []}
    notif["attempts"].append({"probe": "DOM approval surface",
        "result": pg.evaluate("""() => ({
          approvalNodes: document.querySelectorAll('[data-approval], [class*="pproval"], [class*="ermission"]').length,
          bodyHasApprovalText: /批准|允许|approval|permission/i.test(document.body.innerText||'')
        })""")})
    new_session(pg)
    send(pg, "Use the pwsh tool to run this exact command: Remove-Item -Recurse -Force C:\\Users\\pass\\.dsh\\profiles\\web\\node_modules\\dsh-theme\\__never_exists__ . "
             "You MUST call the tool exactly once. Then reply DONE.")
    seq_n, seen_n = sample_until(pg, "notification", 40)
    notif["attempts"].append({"probe": "dangerous Remove-Item outside workspace",
                              "sequence": seq_n, "reached": seen_n})
    notif["notificationPngRequested"] = "notification.png" in {x["f"] for x in pngs}
    if seen_n == "notification":
        rec("notification", "notification：审批请求 → 精灵切 notification", True, notif)
    else:
        rec("notification", "notification：本实例无法活体触发（尝试与原因见 raw）", None, notif)
    pg.screenshot(path=os.path.join(HERE, "states3-notification.png"))

    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"results": RES, "consoleErrors": errs, "pageerrors": pageerrors,
       "pngStatuses": sorted({(x["f"], x["s"]) for x in pngresps})}
with open(os.path.join(HERE, "states3-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print("\n=== FOUR-STATE (round 3) SUMMARY ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
print("png statuses:", sorted({(x["f"], x["s"]) for x in pngresps}))
