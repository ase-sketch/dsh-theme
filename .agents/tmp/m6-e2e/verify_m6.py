# -*- coding: utf-8 -*-
"""M6 Deepy 独立端到端验收 (verifier-authored, from scratch).

Usage: python verify_m6.py <url>

Every claim is read back from the SAME page instance that produces the screenshot.
State is asserted on the FINAL OBSERVABLE: the sprite's computed background-image URL
(= which state PNG the user actually sees). client.js exposes NO data-state attribute,
so any DOM-attribute-based assertion would be inventing a mechanism that does not exist.
"""
import sys, os, json, time, hashlib
from PIL import Image
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
RES = []          # rows: {id, name, pass, raw}
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": bool(ok), "raw": raw})
    print("[%s] %-3s %s" % ("PASS" if ok else "FAIL", cid, name))
    print("      raw: %s" % json.dumps(raw, ensure_ascii=False)[:900])

# ── console classification ────────────────────────────────────────────────────
console_all, pageerrors = [], []
# Resource-load failures that are deliberately induced by the negative control are
# recorded separately and NOT counted as "console error" for assertion 8.
NETERR_MARKERS = ("net::ERR_FAILED", "net::ERR_ABORTED", "Failed to load resource")

def on_console(m):
    entry = {"type": m.type, "text": m.text[:400]}
    console_all.append(entry)
def on_pageerror(e):
    pageerrors.append(str(e)[:400])

# ── DOM probe (one round trip) ────────────────────────────────────────────────
PROBE = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const sprite = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const cs = sprite ? getComputedStyle(sprite) : null;
  const rs = sprite ? sprite.getBoundingClientRect() : null;
  const slot = document.querySelector('[data-slot="conversation.input.left"]');
  // shell 的不透明白层候选：M5 教训 #root / frame 子元素
  let frame = null;
  const r0 = document.getElementById('root');
  if (r0) for (const c of r0.children) {
    const s = getComputedStyle(c);
    if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') { frame = c; break; }
  }
  const cx = rs ? Math.round(rs.x + rs.width/2) : null;
  const cy = rs ? Math.round(rs.y + rs.height/2) : null;
  const hit = (cx !== null && cx > 0 && cy !== null && cy > 0) ? document.elementFromPoint(cx, cy) : null;
  const hitDesc = hit ? (hit.tagName + '.' + (hit.className||'').toString().slice(0,60)) : null;
  const hitIsSprite = hit ? (hit === sprite || (root && root.contains(hit))) : false;
  return {
    rootExists: !!root,
    rootParentIsSlot: !!(root && slot && root.parentNode === slot),
    rootParentTag: root && root.parentNode ? (root.parentNode.tagName + '|' + (root.parentNode.getAttribute('data-slot')||'')) : null,
    rootDshPart: root ? root.getAttribute('data-dsh-part') : null,
    slotExists: !!slot,
    spriteExists: !!sprite,
    rect: rs ? {x: Math.round(rs.x), y: Math.round(rs.y), w: Math.round(rs.width), h: Math.round(rs.height)} : null,
    widthPx: cs ? cs.width : null,
    heightPx: cs ? cs.height : null,
    bgImage: cs ? cs.backgroundImage : null,
    bgPos: cs ? cs.backgroundPosition : null,
    bgSize: cs ? cs.backgroundSize : null,
    htmlAttr: document.documentElement.hasAttribute('data-dsh-theme'),
    styleEl: !!document.getElementById('dsh-theme-deepy-style'),
    themeStyleEl: !!document.getElementById('dsh-theme-style'),
    hitDesc: hitDesc,
    hitIsSprite: hitIsSprite,
    frameCls: frame ? (frame.className||'').toString().slice(0,60) : null,
    frameBg: frame ? getComputedStyle(frame).backgroundColor : null,
  };
}"""

def probe(pg):
    return pg.evaluate(PROBE)

def state_of(p):
    """Extract the state name from the background-image URL - the final observable."""
    b = p.get("bgImage") or ""
    if "deepy/" not in b:
        return None
    tail = b.split("deepy/")[-1].split('"')[0].split(")")[0]
    return tail[:-4] if tail.endswith(".png") else tail

def toggle(pg, want):
    """Drive the real UI: settings gear -> dsh-theme section -> checkbox."""
    pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x =>
        (x.getAttribute('aria-label')||'').includes('设置') || (x.title||'').includes('设置'));
      if (b) b.click();
    }""")
    pg.wait_for_timeout(2200)
    pg.evaluate("""() => {
      const items = [...document.querySelectorAll('button, [role="tab"], li, div')];
      const hit = items.find(e => (e.textContent||'').trim() === 'dsh-theme 主题' && e.offsetParent !== null);
      if (hit) hit.click();
    }""")
    pg.wait_for_timeout(1800)
    cur = pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); return t ? t.checked : null; }""")
    if cur is not None and cur != want:
        pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); if (t) t.click(); }""")
        pg.wait_for_timeout(2200)
    after = pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); return t ? t.checked : null; }""")
    try:
        pg.keyboard.press("Escape"); pg.wait_for_timeout(900)
    except Exception:
        pass
    return {"before": cur, "after": after}

def clip_pixels(pg, rect, path):
    """Screenshot the sprite rect and count non-background pixels."""
    pg.screenshot(path=path, clip={"x": rect["x"], "y": rect["y"], "width": rect["w"], "height": rect["h"]})
    im = Image.open(path).convert("RGBA")
    px = list(im.getdata())
    # background = most common colour (the card behind the sprite)
    from collections import Counter
    bg = Counter(px).most_common(1)[0][0]
    nonbg = [p for p in px if p != bg]
    return {"w": im.width, "h": im.height, "bg": bg, "total": len(px),
            "nonBgCount": len(nonbg), "path": os.path.basename(path)}

def saturated_palette(state):
    """Saturated (non-grey) opaque colours of the shipped PNG - the Deepy brand orange,
    immune to antialiasing/JPEG-ish noise on edges. Grey/white shell layers can never match."""
    p = os.path.abspath(os.path.join(HERE, "..", "..", "..",
                                     "plugins", "dsh-theme", "assets", "deepy", state + ".png"))
    im = Image.open(p).convert("RGBA")
    out = set()
    for c in im.getdata():
        if c[3] <= 200:
            continue
        mx, mn = max(c[:3]), min(c[:3])
        if mx > 100 and (mx - mn) > 60:      # clearly chromatic
            out.add(c[:3])
    return out

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("console", on_console)
    pg.on("pageerror", on_pageerror)

    reqs, resps = [], []
    pg.on("request", lambda r: reqs.append({"url": r.url, "t": time.time(), "method": r.method}))
    pg.on("response", lambda r: resps.append({"url": r.url, "status": r.status, "t": time.time()}))

    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)

    # ══ 1 slot 注入 ══════════════════════════════════════════════════════════
    f1 = probe(pg)
    rec(1, "slot 注入：元素存在 + 挂在 conversation.input.left + data-dsh-part=deepy",
        f1["rootExists"] and f1["slotExists"] and f1["rootParentIsSlot"] and f1["rootDshPart"] == "deepy" and f1["spriteExists"],
        {"rootExists": f1["rootExists"], "slotExists": f1["slotExists"],
         "rootParentIsSlot": f1["rootParentIsSlot"], "rootParentTag": f1["rootParentTag"],
         "rootDshPart": f1["rootDshPart"], "spriteExists": f1["spriteExists"],
         "rect": f1["rect"], "state": state_of(f1)})
    pg.screenshot(path=os.path.join(HERE, "shot-01-firstscreen.png"))

    # ══ 3 帧窗口宽 = 帧宽 (manifest displayPx = 64) ══════════════════════════
    rec(3, "帧窗口宽 = displayPx(64)：计算宽高 === 64px",
        f1["widthPx"] == "64px" and f1["heightPx"] == "64px",
        {"computedWidth": f1["widthPx"], "computedHeight": f1["heightPx"],
         "rectW": f1["rect"]["w"] if f1["rect"] else None, "manifestDisplayPx": 64,
         "bgSize": f1["bgSize"]})

    # ══ 2 帧在推进：>=500ms 窗口高频采样 ═════════════════════════════════════
    samples = []
    t0 = time.time()
    for i in range(28):
        q = pg.evaluate("""() => {
          const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
          if (!s) return null;
          const cs = getComputedStyle(s);
          return {pos: cs.backgroundPosition, img: cs.backgroundImage};
        }""")
        if q: samples.append({"t": round(time.time()-t0, 3), **q})
        pg.wait_for_timeout(20)
    distinct_pos = sorted({s["pos"] for s in samples})
    distinct_img = sorted({s["img"] for s in samples})
    rec(2, "帧在推进：500ms 窗口内 background-position 取值 >=2 且首尾不同",
        len(distinct_pos) >= 2 and samples and samples[0]["pos"] != samples[-1]["pos"],
        {"windowMs": round((time.time()-t0)*1000), "sampleCount": len(samples),
         "distinctPositionCount": len(distinct_pos), "distinctPositionValues": distinct_pos[:12],
         "distinctImageCount": len(distinct_img),
         "firstPos": samples[0]["pos"] if samples else None,
         "lastPos": samples[-1]["pos"] if samples else None,
         "allPositions": [s["pos"] for s in samples]})

    # ══ 4 素材按需加载 ═══════════════════════════════════════════════════════
    first_reqs = [r["url"] for r in reqs if "/api/dsh-theme/deepy/" in r["url"]]
    first_pngs = sorted({u.split("/")[-1] for u in first_reqs if u.endswith(".png")})
    first_status = {}
    for r in resps:
        if "/api/dsh-theme/deepy/" in r["url"]:
            first_status[r["url"].split("/")[-1]] = r["status"]
    all_ok = all(v == 200 for v in first_status.values()) if first_status else False
    first_states = sorted({n[:-4] for n in first_pngs if n.endswith(".png")})
    rec(4, "素材按需加载：首屏只拉首态 PNG（非 8 张全拉）+ HTTP 200",
        len(first_pngs) <= 2 and len(first_pngs) >= 1 and "idle" in first_states and all_ok,
        {"firstScreenPngs": first_pngs, "firstScreenStates": first_states,
         "pngCount": len(first_pngs), "totalStatesInManifest": 8,
         "statusByFile": first_status, "all200": all_ok,
         "rawRequestUrls": sorted(set(first_reqs))})

    # ══ 9 像素可见 + 没被白层盖住 ═══════════════════════════════════════════
    rect = f1["rect"]
    if rect and rect["w"] > 0:
        pix = clip_pixels(pg, rect, os.path.join(HERE, "shot-09-sprite-clip.png"))
        pal_sat = saturated_palette(state_of(f1) or "idle")
        clipped = Image.open(os.path.join(HERE, "shot-09-sprite-clip.png")).convert("RGBA")
        hit_sat = sum(1 for c in clipped.getdata()
                      if any(abs(c[0]-p[0]) <= 12 and abs(c[1]-p[1]) <= 12 and abs(c[2]-p[2]) <= 12 for p in pal_sat))
        stack = pg.evaluate("""() => {
          const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
          if (!s) return null;
          const r = s.getBoundingClientRect();
          const cx = Math.round(r.x + r.width/2), cy = Math.round(r.y + r.height/2);
          return {
            stack: document.elementsFromPoint(cx, cy).slice(0, 6).map(e => e.tagName + '.' + (e.className||'').toString().slice(0,40)),
            spriteInStack: document.elementsFromPoint(cx, cy).some(e => e === s || e.id === 'dsh-theme-deepy'),
            spritePointerEvents: getComputedStyle(s).pointerEvents,
            spriteOpacity: getComputedStyle(s).opacity,
            spriteVisibility: getComputedStyle(s).visibility,
          };
        }""")
        rec(9, "像素可见：精灵区域存在非背景像素 + 含素材饱和色（同源）→ 未被不透明白层盖住",
            pix["nonBgCount"] > 0 and hit_sat > 0,
            {"nonBgPixelCount": pix["nonBgCount"], "totalPixels": pix["total"],
             "nonBgRatio": round(pix["nonBgCount"]/pix["total"], 4),
             "clipSize": [pix["w"], pix["h"]], "dominantBg": list(pix["bg"]),
             "pixelsMatchingSaturatedAssetPalette": hit_sat, "saturatedPaletteSize": len(pal_sat),
             "elementStackAtCenter": stack,
             "note": "精灵 CSS 为 pointer-events:none（设计如此，装饰性元素），故 elementsFromPoint 命中的是下层 shell 元素；可见性由截图像素证明，不靠 elementFromPoint"})
    else:
        rec(9, "像素可见", False, {"error": "sprite rect zero/absent", "rect": rect})

    # ══ 5 事件 → 状态 ════════════════════════════════════════════════════════
    timeline = []
    reqs.clear()
    try:
        ed = pg.query_selector('[contenteditable="true"]')
        if ed is not None:
            ed.click(); pg.wait_for_timeout(300)
            pg.keyboard.type("Use the bash tool to run echo m6e2e. You MUST call the tool. Then reply OK.", delay=5)
            pg.wait_for_timeout(300)
            pg.keyboard.press("Enter")
    except Exception as exc:
        timeline.append({"error": str(exc)[:300]})
    t5 = time.time()
    for i in range(60):
        pg.wait_for_timeout(1000)
        q = pg.evaluate("""() => {
          const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
          return s ? getComputedStyle(s).backgroundImage : null;
        }""")
        st = None
        if q and "deepy/" in q:
            tail = q.split("deepy/")[-1].split('"')[0].split(")")[0]
            st = tail[:-4] if tail.endswith(".png") else tail
        if not timeline or timeline[-1].get("state") != st:
            timeline.append({"t": round(time.time()-t5, 2), "state": st})
        if st in ("happy", "error") and len(timeline) > 2:
            break
    seq = [x.get("state") for x in timeline if x.get("state") or "error" in x]
    rec(5, "事件→状态：状态序列随回合推进变化（原始序列见 raw）",
        len([s for s in seq if s]) >= 2,
        {"timeline": timeline, "distinctStates": sorted({s for s in seq if s}),
         "note": "判定口径假设：milestones L46 把并发档位口径列为待复核；本行只断言『状态随回合推进发生变化』，不断言具体档位映射"})
    pg.screenshot(path=os.path.join(HERE, "shot-05-active.png"))

    # ══ 11 负控制：page.route 打断素材路由 ═══════════════════════════════════
    abort_hits = {"n": 0}
    def abort_deepy(route):
        abort_hits["n"] += 1
        route.abort()
    pg.route("**/api/dsh-theme/deepy/**", abort_deepy)
    ncerr_mark = len(console_all)
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)
    nc = probe(pg)
    nc_console = console_all[ncerr_mark:]
    nc_warns = [c for c in nc_console if c["type"] == "warning"]
    nc_errs = [c for c in nc_console if c["type"] == "error"]
    nc_neterr = [c for c in nc_errs if any(m in c["text"] for m in NETERR_MARKERS)]
    nc_real = [c for c in nc_errs if not any(m in c["text"] for m in NETERR_MARKERS)]
    nc_painted = bool(nc["bgImage"] and "deepy/" in (nc["bgImage"] or ""))
    rec(11, "负控制(abort 素材路由)：降级生效——精灵未绘制、无真实报错、warn 恰好 1 次",
        abort_hits["n"] > 0 and not nc_painted and len(nc_real) == 0 and len(nc_warns) == 1,
        {"abortedRequests": abort_hits["n"], "spritePainted": nc_painted,
         "bgImage": nc["bgImage"], "rootExists": nc["rootExists"], "rect": nc["rect"],
         "warnCount": len(nc_warns), "warnTexts": [w["text"] for w in nc_warns],
         "consoleErrorsRaw": len(nc_errs), "consoleErrorsResourceLoad": len(nc_neterr),
         "consoleErrorsReal": len(nc_real),
         "rawErrTexts": [e["text"] for e in nc_errs][:6]})
    pg.screenshot(path=os.path.join(HERE, "shot-11-negative.png"))

    # 恢复：unroute → 重载 → 关键断言复绿
    pg.unroute("**/api/dsh-theme/deepy/**")
    reqs.clear(); resps.clear()
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)
    rec2 = probe(pg)
    s2 = []
    for i in range(20):
        s2.append(pg.evaluate("""() => {
          const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
          return s ? getComputedStyle(s).backgroundPosition : null;
        }"""))
        pg.wait_for_timeout(25)
    rec(11.1, "负控制恢复：unroute 后重载，精灵复绿且帧在动",
        rec2["rootExists"] and rec2["spriteExists"] and state_of(rec2) is not None
        and rec2["widthPx"] == "64px" and len(set(s2)) >= 2,
        {"state": state_of(rec2), "widthPx": rec2["widthPx"], "rect": rec2["rect"],
         "distinctPositions": len(set(s2)), "positions": list(dict.fromkeys(s2))[:8],
         "assetRequestsAfterUnroute": sorted({r["url"].split("/")[-1] for r in reqs if "/api/dsh-theme/deepy/" in r["url"]})})

    # ══ 6 开关 OFF 全撤 ══════════════════════════════════════════════════════
    off_toggle = toggle(pg, False)
    pg.wait_for_timeout(1500)
    off = probe(pg)
    req_before = len([r for r in reqs if "/api/dsh-theme/deepy/" in r["url"]])
    pg.wait_for_timeout(2000)   # 等 2 秒，防泄漏的定时器/rAF 复活
    req_after = len([r for r in reqs if "/api/dsh-theme/deepy/" in r["url"]])
    off2 = probe(pg)
    rec(6, "开关 OFF 全撤：元素/内联 style/html 属性全消失，+2s 未复活、无新素材请求",
        off_toggle["after"] is False and not off["rootExists"] and not off["styleEl"]
        and not off["htmlAttr"] and not off2["rootExists"]
        and req_after == req_before,
        {"toggle": off_toggle, "rootExists": off["rootExists"], "styleElExists": off["styleEl"],
         "htmlAttr": off["htmlAttr"], "themeStyleEl": off["themeStyleEl"],
         "after2s_rootExists": off2["rootExists"], "after2s_spriteExists": off2["spriteExists"],
         "deepyRequestsBeforeWait": req_before, "deepyRequestsAfterWait": req_after})
    pg.screenshot(path=os.path.join(HERE, "shot-06-off.png"))

    # ══ 7 开关 ON 恢复 ═══════════════════════════════════════════════════════
    on_toggle = toggle(pg, True)
    pg.wait_for_timeout(2000)
    on = probe(pg)
    s7 = []
    for i in range(24):
        s7.append(pg.evaluate("""() => {
          const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
          return s ? getComputedStyle(s).backgroundPosition : null;
        }"""))
        pg.wait_for_timeout(25)
    rec(7, "开关 ON 恢复：精灵重新出现且帧继续推进",
        on_toggle["after"] is True and on["rootExists"] and on["spriteExists"]
        and on["widthPx"] == "64px" and len(set(s7)) >= 2,
        {"toggle": on_toggle, "rootExists": on["rootExists"], "state": state_of(on),
         "rect": on["rect"], "widthPx": on["widthPx"], "distinctPositions": len(set(s7)),
         "positions": list(dict.fromkeys(s7))[:8]})
    pg.screenshot(path=os.path.join(HERE, "shot-07-on-restored.png"))

    # ══ 10 深色模式 ══════════════════════════════════════════════════════════
    pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x =>
        (x.getAttribute('aria-label')||'').includes('设置') || (x.title||'').includes('设置'));
      if (b) b.click();
    }""")
    pg.wait_for_timeout(2200)
    dark_clicked = pg.evaluate("""() => {
      const d = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === '深色' && b.offsetParent !== null);
      if (d) { d.click(); return true; } return false;
    }""")
    pg.wait_for_timeout(2500)
    try:
        pg.keyboard.press("Escape"); pg.wait_for_timeout(1200)
    except Exception: pass
    dark = probe(pg)
    dark_body_bg = pg.evaluate("() => getComputedStyle(document.body).backgroundColor")
    dark_pix = clip_pixels(pg, dark["rect"], os.path.join(HERE, "shot-10-dark-clip.png")) if dark["rect"] and dark["rect"]["w"] > 0 else None
    rec(10, "深色模式：精灵仍可见、尺寸正确、有非背景像素",
        dark_clicked and dark["rootExists"] and dark["spriteExists"]
        and dark["widthPx"] == "64px" and dark_pix is not None and dark_pix["nonBgCount"] > 0,
        {"darkClicked": dark_clicked, "bodyBg": dark_body_bg, "state": state_of(dark),
         "rect": dark["rect"], "widthPx": dark["widthPx"],
         "nonBgPixelCount": dark_pix["nonBgCount"] if dark_pix else None,
         "dominantBg": list(dark_pix["bg"]) if dark_pix else None})
    pg.screenshot(path=os.path.join(HERE, "shot-10-dark.png"))
    # 恢复浅色
    pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x =>
        (x.getAttribute('aria-label')||'').includes('设置') || (x.title||'').includes('设置'));
      if (b) b.click();
    }""")
    pg.wait_for_timeout(2000)
    pg.evaluate("""() => {
      const d = [...document.querySelectorAll('button')].find(b => (b.textContent||'').trim() === '浅色' && b.offsetParent !== null);
      if (d) d.click();
    }""")
    pg.wait_for_timeout(2000)
    try:
        pg.keyboard.press("Escape"); pg.wait_for_timeout(800)
    except Exception: pass

    b.close()

# ══ 8 console 零错 ═══════════════════════════════════════════════════════════
all_errs = [c for c in console_all if c["type"] == "error"]
neterr = [c for c in all_errs if any(m in c["text"] for m in NETERR_MARKERS)]
real_errs = [c for c in all_errs if not any(m in c["text"] for m in NETERR_MARKERS)]
rec(8, "console 零错（负控制期间被故意打断的资源加载错误单列，不计入）",
    len(real_errs) == 0 and len(pageerrors) == 0,
    {"consoleErrorTotal": len(all_errs), "resourceLoadErrorsFromNegativeControl": len(neterr),
     "realConsoleErrors": len(real_errs), "realErrorTexts": [e["text"] for e in real_errs][:10],
     "pageerrorCount": len(pageerrors), "pageerrors": pageerrors[:5],
     "consoleTotal": len(console_all)})

summary = {
    "url": URL, "viewport": "1440x900",
    "passCount": sum(1 for r in RES if r["pass"]),
    "failCount": sum(1 for r in RES if not r["pass"]),
    "results": RES,
    "console": {"all": console_all, "errors": all_errs, "pageerrors": pageerrors},
}
with open(os.path.join(HERE, "verify-result.json"), "w", encoding="utf-8") as f:
    json.dump(summary, f, ensure_ascii=False, indent=1)

print("\n=== SUMMARY: %d PASS / %d FAIL ===" % (summary["passCount"], summary["failCount"]))
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else "FAIL", r["name"]))
print("console errors total=%d resource-load=%d real=%d pageerrors=%d"
      % (len(all_errs), len(neterr), len(real_errs), len(pageerrors)))
sys.exit(0 if summary["failCount"] == 0 else 1)
