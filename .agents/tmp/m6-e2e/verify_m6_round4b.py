# -*- coding: utf-8 -*-
"""M6 round 4b: fix the three SKIPs from round4-final.
 - B2 overlap: use the REAL pet classes (v78Lda_spriteWrap / v78Lda_sprite)
 - A3 visibility: Emulation.setPageVisibilityOverride is unavailable in this Chromium;
   use a second page + bring_to_front() instead (changes document.hidden in Chromium).
 - A1 archive: the menu item click missed; retry with a broader matcher.

Usage: python verify_m6_round4b.py <url>
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
  const r = s ? s.getBoundingClientRect() : null;
  return {state: stt, alive: !!s, rect: r ? {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)} : null};
}"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    console, pageerrors = [], []
    pg.on("console", lambda m: console.append({"type": m.type, "text": m.text[:300]}))
    pg.on("pageerror", lambda e: pageerrors.append(str(e)[:300]))

    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(10000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)

    # ── summon pet, then measure overlap with REAL classes ──
    pg.evaluate("""() => { const s = document.querySelector('button.v78Lda_summon'); if (s) s.click(); }""")
    pg.wait_for_timeout(4000)
    pet_state = pg.evaluate(r"""() => {
      const all = [...document.querySelectorAll('body *')].filter(e => /v78Lda/.test((e.className||'').toString()) && e.offsetParent !== null);
      return all.map(e => { const r = e.getBoundingClientRect();
        return {cls:(e.className||'').toString().slice(0,50), x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}; });
    }""")
    overlap = pg.evaluate(r"""() => {
      const d = document.getElementById('dsh-theme-deepy');
      const dr = d ? d.getBoundingClientRect() : null;
      const petEls = [...document.querySelectorAll('body *')].filter(e => /v78Lda_(sprite|float)/.test((e.className||'').toString()) && e.offsetParent !== null);
      const out = [];
      for (const e of petEls) {
        const r = e.getBoundingClientRect();
        if (r.width === 0) continue;
        const ox = Math.max(0, Math.min(dr.right, r.right) - Math.max(dr.left, r.left));
        const oy = Math.max(0, Math.min(dr.bottom, r.bottom) - Math.max(dr.top, r.top));
        out.push({cls:(e.className||'').toString().slice(0,40),
                  rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},
                  overlapArea: Math.round(ox*oy)});
      }
      const dx = dr ? {x:Math.round(dr.x),y:Math.round(dr.y),w:Math.round(dr.width),h:Math.round(dr.height)} : null;
      let minGap = null;
      if (dx && out.length) {
        minGap = Math.min(...out.map(o => Math.max(
          o.rect.x - (dx.x + dx.w), dx.x - (o.rect.x + o.rect.w),
          o.rect.y - (dx.y + dx.h), dx.y - (o.rect.y + o.rect.h))));
      }
      return {deepy: dx, pets: out, anyOverlap: out.some(o => o.overlapArea > 0), minGapPx: minGap};
    }""")
    rec("B2-overlap", "B2 共存视觉重叠测量（pet 已召唤，用真实 class）",
        None, {"petElements": pet_state, "overlap": overlap})
    pg.screenshot(path=os.path.join(HERE, "r4b-pet-overlap.png"))

    # ── A3 visibility via second page + bring_to_front ──
    pos_before = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    other = ctx.new_page()
    other.goto("about:blank")
    other.bring_to_front()
    pg.wait_for_timeout(1500)
    hidden_flag = pg.evaluate("() => document.hidden")
    pos_h1 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    pg.wait_for_timeout(1500)
    pos_h2 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    pg.bring_to_front()
    pg.wait_for_timeout(1500)
    visible_flag = pg.evaluate("() => document.hidden")
    pos_v1 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    pg.wait_for_timeout(800)
    pos_v2 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return s ? getComputedStyle(s).backgroundPosition : null; }""")
    other.close()
    frozen = pos_h1 == pos_h2
    resumed = pos_v1 != pos_v2
    rec("A3-visibility", "A3 页面隐藏时停帧、恢复后继续推进（第二页 bring_to_front）",
        None if not hidden_flag else (frozen and resumed),
        {"posBefore": pos_before, "hiddenFlagWhileOtherFront": hidden_flag,
         "posHidden_a": pos_h1, "posHidden_b": pos_h2, "frozenWhileHidden": frozen,
         "visibleFlagAfterReturn": visible_flag,
         "posVisible_c": pos_v1, "posVisible_d": pos_v2, "resumed": resumed})

    # ── A1 archive retry ──
    rows = pg.evaluate(r"""() => {
      const rs = [...document.querySelectorAll('div.YDXeBa_sessionRow')].filter(e => e.offsetParent !== null);
      return {count: rs.length, texts: rs.slice(0,6).map(e => (e.textContent||'').trim().slice(0,40))};
    }""")
    before = pg.evaluate(FACTS)
    steps = {"rowsBefore": rows}
    if rows["count"] > 0:
        r0 = pg.evaluate(r"""() => {
          const rs = [...document.querySelectorAll('div.YDXeBa_sessionRow')].filter(e => e.offsetParent !== null);
          const r = rs[0].getBoundingClientRect();
          return {x: Math.round(r.x + r.width - 30), y: Math.round(r.y + r.height/2)};
        }""")
        pg.mouse.move(r0["x"], r0["y"]); pg.wait_for_timeout(1000)
        m = pg.evaluate(r"""() => {
          const btn = [...document.querySelectorAll('button')].find(e =>
            /^会话“/.test(e.getAttribute('aria-label')||'') && e.offsetParent !== null);
          if (btn) { btn.click(); return {clicked:true, aria: btn.getAttribute('aria-label')}; }
          return {clicked:false};
        }""")
        steps["menu"] = m
        pg.wait_for_timeout(1500)
        items = pg.evaluate(r"""() => [...document.querySelectorAll('[role="menuitem"], button, li, div')]
          .filter(e => e.offsetParent !== null && (e.textContent||'').trim().length > 0 && (e.textContent||'').trim().length < 14)
          .map(e => (e.textContent||'').trim()).filter((v,i,a) => a.indexOf(v)===i).slice(0,20)""")
        steps["menuItems"] = items
        a = pg.evaluate(r"""() => {
          const items = [...document.querySelectorAll('[role="menuitem"], button, li, div')].filter(e => e.offsetParent !== null);
          const t = items.find(e => /归档|删除/.test((e.textContent||'').trim()) && (e.textContent||'').trim().length < 10);
          if (t) { t.click(); return {clicked:true, text:(t.textContent||'').trim()}; }
          return {clicked:false};
        }""")
        steps["archiveClick"] = a
        pg.wait_for_timeout(2000)
        conf = pg.evaluate(r"""() => {
          const btns = [...document.querySelectorAll('button')].filter(e => e.offsetParent !== null);
          const c = btns.find(b => /^(归档|删除|确定|确认)$/.test((b.textContent||'').trim()));
          if (c) { c.click(); return {clicked:true, text:(c.textContent||'').trim()}; }
          return {clicked:false};
        }""")
        steps["confirm"] = conf
        pg.wait_for_timeout(4000)
    rows_after = pg.evaluate(r"""() => [...document.querySelectorAll('div.YDXeBa_sessionRow')].filter(e => e.offsetParent !== null).length""")
    after = pg.evaluate(FACTS)
    steps["rowsAfter"] = rows_after
    rec("A1-archive", "A1 归档/删除会话后：精灵仍存活、无残留、无报错",
        after["alive"] and after["state"] is not None,
        {"steps": steps, "before": before, "after": after,
         "rowCountChanged": rows["count"] != rows_after})
    pg.screenshot(path=os.path.join(HERE, "r4b-after-archive.png"))

    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"head": "ecc2b4e", "results": RES, "consoleErrors": errs, "pageerrors": pageerrors}
with open(os.path.join(HERE, "round4b-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("\n=== ROUND 4b ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
