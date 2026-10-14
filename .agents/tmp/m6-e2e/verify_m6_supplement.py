# -*- coding: utf-8 -*-
"""M6 supplementary verification: hardens items 2/4/5/6/9 and adds a mutation
negative control proving THIS harness can go red.

Usage: python verify_m6_supplement.py <url>
"""
import sys, os, json, time
from PIL import Image
from collections import Counter
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
R = {}

def probe(pg):
    return pg.evaluate(r"""() => {
      const root = document.getElementById('dsh-theme-deepy');
      const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
      const cs = s ? getComputedStyle(s) : null;
      const r = s ? s.getBoundingClientRect() : null;
      return {
        rootExists: !!root, spriteExists: !!s,
        w: cs ? cs.width : null, h: cs ? cs.height : null,
        img: cs ? cs.backgroundImage : null,
        pos: cs ? cs.backgroundPosition : null,
        rect: r ? {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)} : null,
      };
    }""")

def state_of(p):
    b = p.get("img") or ""
    if "deepy/" not in b: return None
    t = b.split("deepy/")[-1].split('"')[0].split(")")[0]
    return t[:-4] if t.endswith(".png") else t

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    console = []
    pg.on("console", lambda m: console.append({"type": m.type, "text": m.text[:300]}))
    reqs = []
    pg.on("request", lambda r: reqs.append({"url": r.url.split("/")[-1], "t": round(time.time(), 3)}))
    resp = []
    pg.on("response", lambda r: resp.append({"u": r.url.split("/")[-1], "s": r.status, "t": round(time.time(), 3)}))

    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)

    # ── A. rAF leak probe: instrument rAF, then toggle OFF and count callbacks ──
    pg.evaluate("""() => {
      window.__rafCount = 0;
      const orig = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = function(cb) { window.__rafCount++; return orig(cb); };
    }""")
    pg.wait_for_timeout(1200)
    raf_on = pg.evaluate("() => window.__rafCount")
    pg.evaluate("""() => {
      const bt = [...document.querySelectorAll('button')].find(x =>
        (x.getAttribute('aria-label')||'').includes('设置') || (x.title||'').includes('设置'));
      if (bt) bt.click();
    }""")
    pg.wait_for_timeout(2200)
    pg.evaluate("""() => {
      const items = [...document.querySelectorAll('button, [role="tab"], li, div')];
      const hit = items.find(e => (e.textContent||'').trim() === 'dsh-theme 主题' && e.offsetParent !== null);
      if (hit) hit.click();
    }""")
    pg.wait_for_timeout(1800)
    toggled = pg.evaluate("""() => {
      const t = document.querySelector('[data-dsh-part="theme-toggle"]');
      if (!t) return null;
      const was = t.checked;
      if (was) t.click();
      return {was, now: t.checked};
    }""")
    pg.wait_for_timeout(1500)
    try: pg.keyboard.press("Escape"); pg.wait_for_timeout(900)
    except Exception: pass
    raf_at_off = pg.evaluate("() => window.__rafCount")
    pg.wait_for_timeout(2500)          # 2s+ observation window
    raf_after_off = pg.evaluate("() => window.__rafCount")
    off_probe = probe(pg)
    R["A_raf_leak"] = {
        "toggled": toggled,
        "rafCallbacksWhileOn": raf_on,
        "rafAtOff": raf_at_off,
        "rafAfter2_5sOff": raf_after_off,
        "rafCallbacksInWindow": raf_after_off - raf_at_off,
        "rootExistsAfter2_5s": off_probe["rootExists"],
        "spriteExistsAfter2_5s": off_probe["spriteExists"],
        "note": "requestAnimationFrame 回调计数在 OFF 后 2.5s 内应停止增长（rAF 循环已随 dispose 撤销）",
    }
    # OFF baseline pixels in the rect the sprite used to occupy
    rect_off = pg.evaluate("""() => {
      const slot = document.querySelector('[data-slot="conversation.input.left"]');
      if (!slot) return null;
      const r = slot.getBoundingClientRect();
      return {x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height)};
    }""")
    if rect_off and rect_off["w"] > 0:
        pg.screenshot(path=os.path.join(HERE, "supp-off-slotclip.png"),
                      clip={"x": rect_off["x"], "y": rect_off["y"],
                            "width": rect_off["w"], "height": rect_off["h"]})
        im = Image.open(os.path.join(HERE, "supp-off-slotclip.png")).convert("RGBA")
        px = list(im.getdata())
        bg = Counter(px).most_common(1)[0][0]
        R["A_off_baseline_pixels"] = {"slotRect": rect_off, "total": len(px),
                                      "dominant": list(bg),
                                      "nonBgCount": sum(1 for c in px if c != bg)}

    # ── turn ON again ──
    pg.evaluate("""() => {
      const bt = [...document.querySelectorAll('button')].find(x =>
        (x.getAttribute('aria-label')||'').includes('设置') || (x.title||'').includes('设置'));
      if (bt) bt.click();
    }""")
    pg.wait_for_timeout(2200)
    pg.evaluate("""() => {
      const items = [...document.querySelectorAll('button, [role="tab"], li, div')];
      const hit = items.find(e => (e.textContent||'').trim() === 'dsh-theme 主题' && e.offsetParent !== null);
      if (hit) hit.click();
    }""")
    pg.wait_for_timeout(1800)
    pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); if (t && !t.checked) t.click(); }""")
    pg.wait_for_timeout(2000)
    try: pg.keyboard.press("Escape"); pg.wait_for_timeout(1200)
    except Exception: pass

    # ── B. per-state on-demand asset fetch, fine-grained timeline ──
    reqs.clear(); resp.clear()
    ed = pg.query_selector('[contenteditable="true"]')
    if ed is not None:
        ed.click(); pg.wait_for_timeout(300)
        pg.keyboard.type("Use the bash tool to run echo m6sup. You MUST call the tool. Then reply DONE.", delay=4)
        pg.wait_for_timeout(300)
        pg.keyboard.press("Enter")
    t0 = time.time()
    timeline, seen = [], None
    for i in range(90):                       # 500ms cadence, up to 45s
        pg.wait_for_timeout(500)
        q = probe(pg)
        st = state_of(q)
        if st != seen:
            timeline.append({"t": round(time.time()-t0, 2), "state": st})
            seen = st
        if st in ("happy", "error") and len(timeline) > 2 and i > 4:
            break
    R["B_timeline"] = {
        "cadenceMs": 500,
        "transitions": timeline,
        "distinctStates": sorted({x["state"] for x in timeline if x["state"]}),
        "observationPoint": "#dsh-theme-deepy .dsh-theme-deepy-sprite computed background-image (最终可观察量)",
    }
    R["B_asset_fetch_order"] = {
        "deepyRequests": [{"f": r["url"], "t": round(r["t"]-t0, 2)} for r in reqs if r["url"].endswith(".png") or r["url"] == "deepy.json"],
        "statuses": sorted({(r["u"], r["s"]) for r in resp if r["u"].endswith(".png") or r["u"] == "deepy.json"}),
        "statesReached": sorted({x["state"] for x in timeline if x["state"]}),
        "note": "按需加载 = 只有真正进入过的状态才发 PNG 请求；首屏只拉 idle",
    }

    # ── C. mutation negative control on THIS harness (inject CSS, no repo writes) ──
    # 若断言真有区分力，把精灵拉宽到 96px 后「帧窗口宽=displayPx」必须变红。
    pg.add_style_tag(content="#dsh-theme-deepy .dsh-theme-deepy-sprite{width:96px !important;height:96px !important;}")
    pg.wait_for_timeout(800)
    mut = probe(pg)
    R["C_mutation_negative_control"] = {
        "injected": "sprite width/height -> 96px",
        "computedWidthAfterMutation": mut["w"],
        "computedHeightAfterMutation": mut["h"],
        "expectedByAssertion": "64px",
        "assertionWouldGoRed": mut["w"] != "64px",
        "note": "不改仓库文件，仅在页面注入 CSS 造红；证明「帧窗口宽=displayPx」断言有区分力",
    }
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)
    after = probe(pg)
    R["C_restored"] = {"widthPx": after["w"], "state": state_of(after), "rootExists": after["rootExists"]}

    b.close()

R["consoleErrors"] = [c for c in console if c["type"] == "error"]
with open(os.path.join(HERE, "supplement-result.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1)[:6000])
