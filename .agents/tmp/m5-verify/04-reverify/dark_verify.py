# -*- coding: utf-8 -*-
"""M5 验收 3（独立补做）：深色模式。
生产者未覆盖深色。本脚本在插件期切深色，逐 token 对照纯皮肤期深色基线
（基线口径 = .agents/shots/_m2_verify.py：正则解析 E:/dsh-ui/preview/index.html
  的 [data-theme="dark"] + mapping.json，期望 body bg = rgb(19,22,29)）。
容差：每通道 ±2（父代理 2026-10-10 裁决）。
另外做负控制：同实例把插件关掉（官方深色）再采一次，证明采样点有区分力。
用法: python dark_verify.py <url>
"""
import sys, json, os, re
from playwright.sync_api import sync_playwright

url = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
TOL = 2

# ── 基线：与 _m2_verify.py 同口径 ──
html = open(r"E:/dsh-ui/preview/index.html", encoding="utf-8").read()
def block(rex): return re.search(rex, html).group(1)
def parse(css): return {k: v.strip() for k, v in re.findall(r"(--dsh-[\w-]+)\s*:\s*([^;]+);", css)}
light = parse(block(r":root\s*\{([\s\S]*?)\n    \}"))
dark  = parse(block(r"\[data-theme=\"dark\"\]\s*\{([\s\S]*?)\n    \}"))
mapping = json.load(open(r"E:/dsh-theme/mapping.json", encoding="utf-8"))
def norm(v): return re.sub(r"\s+", " ", v.strip().lower().rstrip(";"))
def hex2rgb(v):
    h = norm(v).lstrip("#")
    if len(h) == 3: h = "".join(c*2 for c in h)
    return (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))
DARK_EXPECT = {dsw: norm(dark[ref["dark"]]) for dsw, ref in mapping["tokens"].items()}
DARK_ROOT_BG = hex2rgb(dark[mapping["root"]["background-color"]["dark"]])
DARK_ROOT_FG = hex2rgb(dark[mapping["root"]["color"]["dark"]])

PROBE = r"""() => {
  const cs = getComputedStyle(document.body);
  const root = getComputedStyle(document.documentElement);
  const out = {};
  const names = %s;
  for (const n of names) out[n] = cs.getPropertyValue(n).trim();
  // 卡片 / 侧栏 / 主按钮 的实际绘制色
  const card = document.querySelector('[data-dsh-surface="composer"] [class*="card"]');
  const sb = document.querySelector('[class*="sidebarCol"]');
  const ns = document.querySelector('[data-dsh-part="new-session"]');
  out['__bodyBg'] = cs.backgroundColor;
  out['__bodyColor'] = cs.color;
  out['__htmlBg'] = root.backgroundColor;
  out['__darkAttr'] = document.body.hasAttribute('data-ds-dark-theme');
  out['__cardBg'] = card ? getComputedStyle(card).backgroundColor : null;
  out['__cardBorder'] = card ? (getComputedStyle(card).borderTopWidth + ' ' + getComputedStyle(card).borderTopColor) : null;
  out['__cardRadius'] = card ? getComputedStyle(card).borderRadius : null;
  out['__sidebarBg'] = sb ? getComputedStyle(sb).backgroundColor : null;
  out['__sidebarBorder'] = sb ? (getComputedStyle(sb).borderRightWidth + ' ' + getComputedStyle(sb).borderRightColor) : null;
  out['__nsBg'] = ns ? getComputedStyle(ns).backgroundColor : null;
  out['__dshThemeAttr'] = document.documentElement.hasAttribute('data-dsh-theme');
  out['__styleEl'] = !!document.getElementById('dsh-theme-style');
  out['__dshSidebarBg'] = cs.getPropertyValue('--dsh-sidebar-bg').trim();
  return out;
}""" % json.dumps(list(DARK_EXPECT.keys()))

def open_settings(pg):
    pg.evaluate("""() => {
      const btns = [...document.querySelectorAll('button')];
      const gear = btns.find(b => (b.getAttribute('aria-label')||'').includes('设置') || (b.title||'').includes('设置'));
      if (gear) gear.click();
    }""")
    pg.wait_for_timeout(2200)

def close_settings(pg):
    try:
        pg.keyboard.press("Escape"); pg.wait_for_timeout(900)
    except Exception: pass

def set_dark(pg):
    ok = pg.evaluate("""() => {
      const cubes = [...document.querySelectorAll('button')];
      const d = cubes.find(b => (b.textContent||'').trim() === '深色' && b.offsetParent !== null);
      if (d) { d.click(); return true; }
      return false;
    }""")
    pg.wait_for_timeout(2500)
    return ok

def toggle_plugin(pg, want):
    open_settings(pg)
    pg.evaluate(r"""() => {
      const items = [...document.querySelectorAll('button, [role="tab"], li, div')];
      const hit = items.find(e => (e.textContent || '').trim() === 'dsh-theme 主题' && e.offsetParent !== null);
      if (hit) hit.click();
    }""")
    pg.wait_for_timeout(1800)
    cur = pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); return t ? t.checked : null; }""")
    if cur is not None and cur != want:
        pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); if (t) t.click(); }""")
        pg.wait_for_timeout(2200)
    after = pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); return t ? t.checked : null; }""")
    close_settings(pg)
    return {"before": cur, "after": after}

R = {"tolerance": TOL, "expected": {"bodyBg": list(DARK_ROOT_BG), "bodyColor": list(DARK_ROOT_FG)}}
console, pageerrors = [], []

def compare(tag, got):
    """逐 token 对照基线。返回 {fails, checked, values}"""
    fails, values = [], {}
    for dsw, want in DARK_EXPECT.items():
        g = norm(got.get(dsw, ""))
        values[dsw] = g
        if g == want: continue
        # 允许 ±2/通道（仅对 rgb 可比色）
        if g.startswith("#") and want.startswith("#"):
            a, b = hex2rgb(g), hex2rgb(want)
            if all(abs(a[i]-b[i]) <= TOL for i in range(3)): continue
        fails.append({"token": dsw, "got": g, "want": want})
    return fails, values

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("console", lambda m: console.append("[%s] %s" % (m.type, m.text[:400])))
    pg.on("pageerror", lambda e: pageerrors.append(str(e)[:400]))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1500)

    # ── 切深色 ──
    open_settings(pg)
    R["darkClicked"] = set_dark(pg)
    R["settings_text_has_dark_selected"] = pg.evaluate("""() => {
      const cubes = [...document.querySelectorAll('button')];
      const d = cubes.find(b => (b.textContent||'').trim() === '深色');
      return d ? (d.className||'').toString() : null;
    }""")
    close_settings(pg)

    # ── A：插件 ON + 深色 ──
    on = pg.evaluate(PROBE)
    R["on_dark"] = on
    fails, values = compare("on", on)
    R["on_dark_tokenFails"] = fails
    R["on_dark_tokenChecked"] = len(DARK_EXPECT)
    def rgb_of(s):
        m = re.match(r"rgba?\((\d+),\s*(\d+),\s*(\d+)", s or "")
        return tuple(int(m.group(i)) for i in (1,2,3)) if m else None
    gb = rgb_of(on.get("__bodyBg"))
    R["on_dark_bodyBg"] = {"got": on.get("__bodyBg"), "rgb": gb, "want": list(DARK_ROOT_BG),
                           "pass": bool(gb and all(abs(gb[i]-DARK_ROOT_BG[i]) <= TOL for i in range(3)))}
    pg.screenshot(path=os.path.join(here, "dark-on.png"))

    # ── B：插件 OFF + 深色（官方深色，负控制） ──
    R["toggle_off"] = toggle_plugin(pg, False)
    off = pg.evaluate(PROBE)
    R["off_dark"] = off
    gb2 = rgb_of(off.get("__bodyBg"))
    R["off_dark_bodyBg"] = {"got": off.get("__bodyBg"), "rgb": gb2, "want": list(DARK_ROOT_BG),
                            "pass": bool(gb2 and all(abs(gb2[i]-DARK_ROOT_BG[i]) <= TOL for i in range(3)))}
    pg.screenshot(path=os.path.join(here, "dark-off.png"))

    # ── 还原：插件 ON（保持深色，供像素采样） ──
    R["toggle_back"] = toggle_plugin(pg, True)
    R["restored_dark"] = pg.evaluate(PROBE)
    pg.screenshot(path=os.path.join(here, "dark-on-restored.png"))

    # ── 恢复浅色，避免污染后续验收 ──
    open_settings(pg)
    light_ok = pg.evaluate("""() => {
      const cubes = [...document.querySelectorAll('button')];
      const d = cubes.find(b => (b.textContent||'').trim() === '浅色' && b.offsetParent !== null);
      if (d) { d.click(); return true; } return false;
    }""")
    pg.wait_for_timeout(2000)
    close_settings(pg)
    R["lightRestored"] = light_ok
    R["final_bodyBg"] = pg.evaluate("() => getComputedStyle(document.body).backgroundColor")
    b.close()

R["consoleErrors"] = [m for m in console if m.startswith("[error]")]
R["pageerrors"] = pageerrors
with open(os.path.join(here, "dark-verify.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)

summary = {
  "darkClicked": R["darkClicked"],
  "on_dark": {"bodyBg": R["on_dark_bodyBg"], "tokenChecked": R["on_dark_tokenChecked"],
              "tokenFails": R["on_dark_tokenFails"],
              "cardBg": R["on_dark"].get("__cardBg"), "cardBorder": R["on_dark"].get("__cardBorder"),
              "sidebarBg": R["on_dark"].get("__sidebarBg"), "sidebarBorder": R["on_dark"].get("__sidebarBorder"),
              "nsBg": R["on_dark"].get("__nsBg"), "darkAttr": R["on_dark"].get("__darkAttr")},
  "off_dark": {"bodyBg": R["off_dark_bodyBg"], "cardBg": R["off_dark"].get("__cardBg"),
               "sidebarBg": R["off_dark"].get("__sidebarBg"), "darkAttr": R["off_dark"].get("__darkAttr"),
               "dshThemeAttr": R["off_dark"].get("__dshThemeAttr")},
  "toggle_off": R["toggle_off"], "toggle_back": R["toggle_back"],
  "lightRestored": R["lightRestored"], "final_bodyBg": R["final_bodyBg"],
  "consoleErrors": R["consoleErrors"], "pageerrors": R["pageerrors"],
}
print(json.dumps(summary, ensure_ascii=False, indent=1))
