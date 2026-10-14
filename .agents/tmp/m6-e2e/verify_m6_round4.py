# -*- coding: utf-8 -*-
"""M6 round 4 (HEAD ecc2b4e): lifecycle boundaries + dsh-pet coexistence + event-layer
attribution of the 6/10 error trigger rate.

Usage: python verify_m6_round4.py <url>
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
    print("      " + json.dumps(raw, ensure_ascii=False)[:1500])

FACTS = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const bg = s ? getComputedStyle(s).backgroundImage : null;
  let stt = null;
  if (bg && bg.includes('deepy/')) stt = bg.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
  const r = s ? s.getBoundingClientRect() : null;
  return {state: stt, alive: !!s, rootInDom: !!root,
          rect: r ? {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)} : null,
          viewport: {w: window.innerWidth, h: window.innerHeight}};
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
    path = os.path.join(HERE, "r4-%s-clip.png" % tag)
    pg.screenshot(path=path, clip={"x": rect["x"], "y": rect["y"], "width": rect["w"], "height": rect["h"]})
    im = Image.open(path).convert("RGBA"); px = list(im.getdata())
    bg = Counter(px).most_common(1)[0][0]
    return {"total": len(px), "dominant": list(bg), "nonBgCount": sum(1 for c in px if c != bg)}

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    console, pageerrors = [], []
    pg.on("console", lambda m: console.append({"type": m.type, "text": m.text[:300]}))
    pg.on("pageerror", lambda e: pageerrors.append(str(e)[:300]))
    pngs = []
    pg.on("request", lambda r: pngs.append(r.url.split("/")[-1]) if "deepy" in r.url and r.url.endswith(".png") else None)

    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    settle(pg)

    # ══════════ B. dsh-pet coexistence ══════════
    pet = pg.evaluate(r"""() => {
      const cands = [...document.querySelectorAll('*')].filter(e => {
        const c = (e.className||'').toString();
        return /pet|Pet/.test(c) && e.offsetParent !== null;
      }).slice(0, 12);
      return {
        petishCount: cands.length,
        samples: cands.map(e => ({tag: e.tagName, cls: (e.className||'').toString().slice(0,70),
                                  rect: (() => { const r = e.getBoundingClientRect(); return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; })()})),
        bodyHasPetText: /鲸鱼|宠物|pet/i.test(document.body.innerText||''),
      };
    }""")
    deepy = pg.evaluate(FACTS)
    rec("B-pet-present", "dsh-pet 与 dsh-theme 同时启用：两者都在 DOM 中",
        pet["petishCount"] > 0 and deepy["alive"],
        {"petCandidates": pet["petishCount"], "petSamples": pet["samples"][:6],
         "deepy": {"alive": deepy["alive"], "state": deepy["state"], "rect": deepy["rect"]}})
    pg.screenshot(path=os.path.join(HERE, "r4-pet-coexist.png"))

    # does Deepy still switch state with pet enabled?
    pngs.clear()
    send(pg, "Use the pwsh tool to run this command: Start-Sleep -Seconds 20 . You MUST call the tool exactly once. Then reply DONE.")
    seq, seen = [], None
    t0 = time.time()
    while time.time() - t0 < 40:
        pg.wait_for_timeout(250)
        q = pg.evaluate(FACTS)
        if q["state"] != seen:
            seq.append({"t": round(time.time()-t0, 2), "state": q["state"]}); seen = q["state"]
        if seen == "happy":
            break
    states = [x["state"] for x in seq if x["state"]]
    rec("B-deepy-functional", "共存下 Deepy 仍能正常切状态",
        len(set(states)) >= 2,
        {"sequence": seq, "distinctStates": sorted(set(states)),
         "pngRequests": sorted(set(pngs))})
    pg.wait_for_timeout(3000)
    pet_after = pg.evaluate(r"""() => {
      const cands = [...document.querySelectorAll('*')].filter(e => /pet|Pet/.test((e.className||'').toString()) && e.offsetParent !== null);
      return {petishCount: cands.length};
    }""")
    rec("B-pet-functional", "共存下 pet 元素仍在（未被 Deepy 破坏）",
        pet_after["petishCount"] > 0,
        {"petBefore": pet["petishCount"], "petAfter": pet_after["petishCount"]})

    # visual overlap
    overlap = pg.evaluate(r"""() => {
      const deepyEl = document.getElementById('dsh-theme-deepy');
      const petEls = [...document.querySelectorAll('*')].filter(e => /pet|Pet/.test((e.className||'').toString()) && e.offsetParent !== null);
      if (!deepyEl) return {deepy: null};
      const d = deepyEl.getBoundingClientRect();
      const out = [];
      for (const e of petEls) {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const ox = Math.max(0, Math.min(d.right, r.right) - Math.max(d.left, r.left));
        const oy = Math.max(0, Math.min(d.bottom, r.bottom) - Math.max(d.top, r.top));
        out.push({cls: (e.className||'').toString().slice(0,60),
                  rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
                  overlapArea: Math.round(ox*oy)});
      }
      return {deepy: {x:Math.round(d.x),y:Math.round(d.y),w:Math.round(d.width),h:Math.round(d.height)},
              pets: out, anyOverlap: out.some(o => o.overlapArea > 0)};
    }""")
    rec("B-visual-overlap", "共存视觉：两角色是否互相遮挡（信息性，非缺陷判定）",
        None, overlap)

    # ══════════ A1. session deletion ══════════
    pg.wait_for_timeout(2000)
    before_del = pg.evaluate(FACTS)
    del_result = pg.evaluate(r"""() => {
      // find a session row context-menu / delete affordance
      const rows = [...document.querySelectorAll('[class*="sessionRow"], [class*="session"]')]
        .filter(e => e.offsetParent !== null && /pwsh|Start-Sleep|echo/i.test(e.textContent||''));
      if (!rows.length) return {found: false};
      const row = rows[0];
      const r = row.getBoundingClientRect();
      return {found: true, rect: {x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2)},
              text: (row.textContent||'').trim().slice(0,40)};
    }""")
    deleted = False
    if del_result.get("found"):
        pg.mouse.move(del_result["rect"]["x"], del_result["rect"]["y"])
        pg.wait_for_timeout(600)
        # look for a hover-revealed menu button
        menu = pg.evaluate(r"""() => {
          const btns = [...document.querySelectorAll('button')].filter(e => e.offsetParent !== null);
          const m = btns.find(b => /更多|菜单|more|\.\.\./i.test((b.getAttribute('aria-label')||'') + (b.title||'') + (b.textContent||'')));
          if (m) { m.click(); return {clicked: true, aria: m.getAttribute('aria-label')}; }
          return {clicked: false};
        }""")
        pg.wait_for_timeout(1200)
        deleted = pg.evaluate(r"""() => {
          const items = [...document.querySelectorAll('[role="menuitem"], button, li, div')].filter(e => e.offsetParent !== null);
          const d = items.find(e => /删除/.test((e.textContent||'').trim()) && (e.textContent||'').trim().length < 12);
          if (d) { d.click(); return true; }
          return false;
        }""")
        pg.wait_for_timeout(1500)
        # possible confirm dialog
        pg.evaluate(r"""() => {
          const btns = [...document.querySelectorAll('button')].filter(e => e.offsetParent !== null);
          const c = btns.find(b => /^(删除|确定|确认)$/.test((b.textContent||'').trim()));
          if (c) c.click();
        }""")
        pg.wait_for_timeout(3000)
    after_del = pg.evaluate(FACTS)
    rec("A-session-delete", "会话删除后：精灵状态如何、有无残留/报错",
        after_del["alive"] and after_del["state"] is not None,
        {"deleteAffordance": del_result, "menuClick": deleted,
         "beforeDelete": before_del, "afterDelete": after_del,
         "note": "判据：删除后精灵仍存活且状态非 null；若残留或报错按缺陷报"})
    pg.screenshot(path=os.path.join(HERE, "r4-after-delete.png"))

    # ══════════ A2. narrow viewport ══════════
    narrow = []
    for w in (420, 320):
        pg.set_viewport_size({"width": w, "height": 800})
        pg.wait_for_timeout(2500)
        q = pg.evaluate(FACTS)
        slot = pg.evaluate(r"""() => {
          const sl = document.querySelector('[data-slot="conversation.input.left"]');
          if (!sl) return null;
          const r = sl.getBoundingClientRect();
          return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),
                  overflowX: getComputedStyle(sl).overflowX};
        }""")
        narrow.append({"width": w, "deepy": q, "slot": slot,
                       "deepyFullyInViewport": bool(q["rect"] and q["rect"]["x"] >= 0 and q["rect"]["x"] + q["rect"]["w"] <= w),
                       "deepyVisible": bool(q["rect"] and q["rect"]["w"] > 0 and q["rect"]["h"] > 0)})
        pg.screenshot(path=os.path.join(HERE, "r4-narrow-%d.png" % w))
    pg.set_viewport_size({"width": 1440, "height": 900})
    pg.wait_for_timeout(2500)
    rec("A-narrow-viewport", "极窄视口(420/320)：精灵是否溢出/被裁/消失",
        all(n["deepyVisible"] for n in narrow),
        {"results": narrow,
         "note": "若被挤出，需区分 shell 输入卡布局行为 vs Deepy 自身问题"})

    # ══════════ A3. page hidden/visible ══════════
    pg.evaluate(r"""() => {
      window.__visLog = [];
      document.addEventListener('visibilitychange', () => window.__visLog.push({t: Date.now(), hidden: document.hidden}));
    }""")
    # use CDP-free approach: Playwright can emulate visibility via page.evaluate of document.hidden?
    # document.hidden is read-only; instead open a second page to steal focus isn't reliable headless.
    # Use CDP Emulation.setPageVisibilityOverride if available.
    vis_supported = True
    try:
        cdp = ctx.new_cdp_session(pg)
        cdp.send("Emulation.setPageVisibilityOverride", {"visibility": "hidden"})
    except Exception as exc:
        vis_supported = False
        vis_err = str(exc)[:200]
    pg.wait_for_timeout(1500)
    hidden_state = pg.evaluate(r"""() => ({
      hidden: document.hidden,
      deepy: (() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
        if (!s) return null; const b = getComputedStyle(s).backgroundImage;
        return b && b.includes('deepy/') ? b.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','') : null; })()
    })""")
    pos_a = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    pg.wait_for_timeout(1200)
    pos_b = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    if vis_supported:
        try:
            cdp.send("Emulation.setPageVisibilityOverride", {"visibility": "visible"})
        except Exception:
            pass
    pg.wait_for_timeout(1500)
    pos_c = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    pg.wait_for_timeout(600)
    pos_d = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    rec("A-visibility", "页面隐藏/恢复：隐藏时停帧，恢复后继续推进",
        (None if not vis_supported else (hidden_state["hidden"] and pos_a == pos_b and pos_c != pos_d)),
        {"cdpSupported": vis_supported, "hiddenFlag": hidden_state["hidden"],
         "posWhileHidden_a": pos_a, "posWhileHidden_b": pos_b, "frozenWhileHidden": pos_a == pos_b,
         "posAfterVisible_c": pos_c, "posAfterVisible_d": pos_d, "resumed": pos_c != pos_d,
         "note": "隐藏用 CDP Emulation.setPageVisibilityOverride 模拟"})

    # ══════════ A4. workspace switch / slot re-render ══════════
    ws = pg.evaluate(r"""() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '选择工作区');
      if (!b) return {found: false};
      b.click(); return {found: true};
    }""")
    pg.wait_for_timeout(1500)
    ws_pick = pg.evaluate(r"""() => {
      const items = [...document.querySelectorAll('button, [role="menuitem"], [role="option"], li, div')]
        .filter(e => e.offsetParent !== null && /^ds-cs$/.test((e.textContent||'').trim()));
      if (items.length) { items[0].click(); return true; }
      const any = [...document.querySelectorAll('button, [role="menuitem"], [role="option"]')]
        .filter(e => e.offsetParent !== null && (e.textContent||'').trim().length > 2 && (e.textContent||'').trim().length < 30);
      return {clicked: false, candidates: any.slice(0,10).map(e => (e.textContent||'').trim())};
    }""")
    pg.wait_for_timeout(4000)
    after_ws = pg.evaluate(FACTS)
    rec("A-workspace-switch", "切换工作区 / slot 重渲染后：精灵仍在且能渲染",
        after_ws["alive"] and after_ws["state"] is not None,
        {"switchOpened": ws, "picked": ws_pick, "afterSwitch": after_ws})
    pg.screenshot(path=os.path.join(HERE, "r4-after-workspace.png"))

    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"head": "ecc2b4e", "results": RES, "consoleErrors": errs, "pageerrors": pageerrors}
with open(os.path.join(HERE, "round4-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("\n=== ROUND 4 (A/B) SUMMARY ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
