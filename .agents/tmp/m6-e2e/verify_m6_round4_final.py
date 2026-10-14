# -*- coding: utf-8 -*-
"""M6 round 4 FINAL (HEAD ecc2b4e): lifecycle boundaries + dsh-pet coexistence + event-layer
attribution of the error trigger rate.

Real selectors discovered by read-only recon (round4-diag3.json):
  pet  : button.v78Lda_summon  ("召唤鲸鱼娘（原版）")  -- pet renders in HIDDEN mode
  del  : div.YDXeBa_sessionRow hover -> button[aria-label^="会话"] -> "归档会话"
  ws   : button[aria-label="选择工作区"]

Usage: python verify_m6_round4_final.py <url>
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

PET = r"""() => {
  const sum = [...document.querySelectorAll('button.v78Lda_summon')];
  const dock = document.querySelectorAll('[data-pet-dock]');
  return {summonCount: sum.length, dockCount: dock.length,
          summonText: sum.length ? (sum[0].textContent||'').trim().slice(0,30) : null,
          summonRect: sum.length ? (() => { const r = sum[0].getBoundingClientRect();
            return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; })() : null};
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

    # ══════════════ B. dsh-pet coexistence ══════════════
    pet_before = pg.evaluate(PET)
    deepy_before = pg.evaluate(FACTS)
    rec("B-both-present", "B1 共存：pet 与 Deepy 同时在 DOM",
        pet_before["summonCount"] > 0 and deepy_before["alive"],
        {"pet": pet_before, "deepy": {"alive": deepy_before["alive"], "state": deepy_before["state"],
                                      "rect": deepy_before["rect"]},
         "note": "pet 当前处于隐藏态（渲染 summon 按钮 button.v78Lda_summon，文案「召唤鲸鱼娘（原版）」）——这是 pet 自身的 display.visible 语义，非缺失"})
    pg.screenshot(path=os.path.join(HERE, "r4-final-coexist.png"))

    # try to summon the pet so we can measure real overlap
    pg.evaluate("""() => { const s = document.querySelector('button.v78Lda_summon'); if (s) s.click(); }""")
    pg.wait_for_timeout(3500)
    pet_shown = pg.evaluate(PET)
    pet_full = pg.evaluate(r"""() => {
      const els = [...document.querySelectorAll('body *')].filter(e => {
        const c = (e.className||'').toString();
        return /v78Lda|pet/i.test(c) && e.offsetParent !== null;
      });
      return els.slice(0,10).map(e => { const r = e.getBoundingClientRect();
        return {tag: e.tagName, cls: (e.className||'').toString().slice(0,60),
                rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}; });
    }""")
    rec("B-pet-summon", "B1b 点击 summon 后 pet 是否真正显示（用于测重叠）",
        None, {"afterSummon": pet_shown, "petElements": pet_full})
    pg.screenshot(path=os.path.join(HERE, "r4-final-pet-summoned.png"))

    # Deepy still switches state with pet active
    pngs.clear()
    send(pg, "Use the pwsh tool to run this command: Start-Sleep -Seconds 25 . You MUST call the tool exactly once. Then reply DONE.")
    seq, seen = [], None
    t0 = time.time()
    while time.time() - t0 < 45:
        pg.wait_for_timeout(250)
        q = pg.evaluate(FACTS)
        if q["state"] != seen:
            seq.append({"t": round(time.time()-t0, 2), "state": q["state"]}); seen = q["state"]
        if seen == "happy":
            break
    states = [x["state"] for x in seq if x["state"]]
    rec("B-deepy-functional", "B1c 共存下 Deepy 仍正常切状态",
        len(set(states)) >= 2,
        {"sequence": seq, "distinctStates": sorted(set(states)), "pngRequests": sorted(set(pngs))})

    # overlap measurement
    overlap = pg.evaluate(r"""() => {
      const d = document.getElementById('dsh-theme-deepy');
      const petEls = [...document.querySelectorAll('body *')].filter(e => {
        const c = (e.className||'').toString();
        return /v78Lda_(float|summon|root)/.test(c) && e.offsetParent !== null;
      });
      if (!d) return {deepy: null};
      const dr = d.getBoundingClientRect();
      const out = [];
      for (const e of petEls) {
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const ox = Math.max(0, Math.min(dr.right, r.right) - Math.max(dr.left, r.left));
        const oy = Math.max(0, Math.min(dr.bottom, r.bottom) - Math.max(dr.top, r.top));
        out.push({cls: (e.className||'').toString().slice(0,50),
                  rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
                  overlapArea: Math.round(ox*oy)});
      }
      return {deepy: {x:Math.round(dr.x),y:Math.round(dr.y),w:Math.round(dr.width),h:Math.round(dr.height)},
              pets: out, anyOverlap: out.some(o => o.overlapArea > 0),
              minGap: out.length ? Math.min(...out.map(o =>
                 Math.round(Math.max(o.rect.x - (dr.x+dr.width), dr.x - (o.rect.x+o.rect.w), 0)))) : null};
    }""")
    rec("B-visual-overlap", "B2 共存视觉：两角色是否互相遮挡（信息性）",
        None, overlap)

    # ══════════════ A1. session deletion (archive) ══════════════
    before_del = pg.evaluate(FACTS)
    del_info = pg.evaluate(r"""() => {
      const rows = [...document.querySelectorAll('div.YDXeBa_sessionRow')].filter(e => e.offsetParent !== null);
      if (!rows.length) return {found: false};
      const r = rows[0].getBoundingClientRect();
      return {found: true, count: rows.length, text: (rows[0].textContent||'').trim().slice(0,40),
              x: Math.round(r.x + r.width - 30), y: Math.round(r.y + r.height/2)};
    }""")
    del_steps = {"hover": del_info}
    if del_info.get("found"):
        pg.mouse.move(del_info["x"], del_info["y"]); pg.wait_for_timeout(900)
        menu = pg.evaluate(r"""() => {
          const btn = [...document.querySelectorAll('button')].find(e =>
            /^会话“/.test(e.getAttribute('aria-label')||'') && e.offsetParent !== null);
          if (btn) { btn.click(); return {clicked: true, aria: btn.getAttribute('aria-label')}; }
          return {clicked: false};
        }""")
        del_steps["menu"] = menu
        pg.wait_for_timeout(1200)
        arch = pg.evaluate(r"""() => {
          const items = [...document.querySelectorAll('button, [role="menuitem"], li, div')].filter(e => e.offsetParent !== null);
          const a = items.find(e => (e.textContent||'').trim() === '归档会话');
          if (a) { a.click(); return true; }
          return false;
        }""")
        del_steps["archived"] = arch
        pg.wait_for_timeout(2500)
        pg.evaluate(r"""() => {
          const btns = [...document.querySelectorAll('button')].filter(e => e.offsetParent !== null);
          const c = btns.find(b => /^(删除|确定|确认|归档)$/.test((b.textContent||'').trim()));
          if (c) c.click();
        }""")
        pg.wait_for_timeout(3500)
    after_del = pg.evaluate(FACTS)
    pet_after_del = pg.evaluate(PET)
    rec("A-session-delete", "A1 会话删除/归档后：精灵仍存活、无残留、无报错",
        after_del["alive"] and after_del["state"] is not None and after_del["rootInDom"],
        {"steps": del_steps, "beforeDelete": before_del, "afterDelete": after_del,
         "petAfterDelete": pet_after_del,
         "note": "用「归档会话」作为删除路径（DSH 的会话行操作菜单）"})
    pg.screenshot(path=os.path.join(HERE, "r4-final-after-delete.png"))

    # ══════════════ A2. narrow viewport ══════════════
    narrow = []
    for w in (420, 320):
        pg.set_viewport_size({"width": w, "height": 800})
        pg.wait_for_timeout(2500)
        q = pg.evaluate(FACTS)
        slot = pg.evaluate(r"""() => {
          const sl = document.querySelector('[data-slot="conversation.input.left"]');
          if (!sl) return null;
          const r = sl.getBoundingClientRect();
          return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};
        }""")
        inView = bool(q["rect"] and q["rect"]["x"] >= 0 and q["rect"]["x"] + q["rect"]["w"] <= w)
        narrow.append({"width": w, "deepy": q, "slot": slot,
                       "deepyFullyInViewport": inView,
                       "deepyVisible": bool(q["rect"] and q["rect"]["w"] > 0 and q["rect"]["h"] > 0)})
        pg.screenshot(path=os.path.join(HERE, "r4-final-narrow-%d.png" % w))
    pg.set_viewport_size({"width": 1440, "height": 900})
    pg.wait_for_timeout(2500)
    rec("A-narrow-viewport", "A2 极窄视口(420/320)：精灵是否溢出/被裁/消失",
        all(n["deepyVisible"] and n["deepyFullyInViewport"] for n in narrow),
        {"results": narrow})

    # ══════════════ A3. page hidden / visible (CDP) ══════════════
    vis = {"cdpSupported": True}
    try:
        cdp = ctx.new_cdp_session(pg)
        vis["cdpSession"] = True
        cdp.send("Emulation.setPageVisibilityOverride", {"visibility": "hidden"})
        vis["sent"] = "hidden"
    except Exception as exc:
        vis["cdpSupported"] = False
        vis["error"] = str(exc)[:250]
    pg.wait_for_timeout(1800)
    hid = pg.evaluate(r"""() => ({
      hidden: document.hidden,
      pos: (() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
        return s ? getComputedStyle(s).backgroundPosition : null; })()
    })""")
    pg.wait_for_timeout(1500)
    hid2 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    if vis.get("cdpSupported"):
        try:
            cdp.send("Emulation.setPageVisibilityOverride", {"visibility": "visible"})
        except Exception as exc:
            vis["restoreError"] = str(exc)[:200]
    pg.wait_for_timeout(1800)
    vis1 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    pg.wait_for_timeout(700)
    vis2 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    frozen = hid["pos"] == hid2
    resumed = vis1 != vis2
    rec("A-visibility", "A3 页面隐藏时停帧、恢复后继续推进（CDP 模拟）",
        None if not vis.get("cdpSupported") else (hid["hidden"] and frozen and resumed),
        {"cdp": vis, "hiddenFlag": hid["hidden"], "posHidden_a": hid["pos"], "posHidden_b": hid2,
         "frozenWhileHidden": frozen, "posVisible_c": vis1, "posVisible_d": vis2, "resumed": resumed,
         "note": "document.hidden 为只读，用 CDP Emulation.setPageVisibilityOverride 切换"})

    # ══════════════ A4. workspace switch / slot re-render ══════════════
    ws = pg.evaluate(r"""() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '选择工作区');
      if (b) { b.click(); return {found: true}; }
      return {found: false};
    }""")
    pg.wait_for_timeout(1600)
    pick = pg.evaluate(r"""() => {
      const items = [...document.querySelectorAll('button, [role="menuitem"], [role="option"], li, div')]
        .filter(e => e.offsetParent !== null && (e.textContent||'').trim() === 'ds-cs');
      if (items.length) { items[0].click(); return true; }
      const opts = [...document.querySelectorAll('[role="menuitem"], [role="option"]')].filter(e => e.offsetParent !== null);
      return {clicked: false, options: opts.slice(0,8).map(e => (e.textContent||'').trim())};
    }""")
    pg.wait_for_timeout(4000)
    after_ws = pg.evaluate(FACTS)
    rec("A-workspace-switch", "A4 切换工作区 / slot 重渲染后：精灵仍在且能渲染",
        after_ws["alive"] and after_ws["state"] is not None,
        {"opened": ws, "picked": pick, "afterSwitch": after_ws})
    pg.screenshot(path=os.path.join(HERE, "r4-final-after-workspace.png"))

    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"head": "ecc2b4e", "results": RES, "consoleErrors": errs, "pageerrors": pageerrors}
with open(os.path.join(HERE, "round4-final-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("\n=== ROUND 4 FINAL (A/B) ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
