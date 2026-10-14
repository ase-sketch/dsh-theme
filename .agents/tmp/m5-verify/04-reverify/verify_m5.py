# -*- coding: utf-8 -*-
"""M5 插件本体验收 v2：七条逐项 + 像素采样 + md5 对照。

v1 的教训：直接 fetch POST 状态绕过了 client 半自己的 store，界面不会重绘，
于是 OFF 看起来"没卸载"——那是测试假红。v2 一律走**真实 UI**（点设置 → 点面板 → 点开关）。

用法: python verify_m5.py <url>
"""
import sys, json, os, hashlib
from playwright.sync_api import sync_playwright

url = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))
R = {}
console_msgs, page_errors = [], []

def md5(p):
    with open(p, "rb") as f:
        return hashlib.md5(f.read()).hexdigest()

PROBE = r"""() => {
  const el = document.getElementById('dsh-theme-style');
  const cs = getComputedStyle(document.body);
  const root = document.getElementById('root');
  // 找 shell 的实际绘制层：#root 下第一个有非透明背景的直接子元素
  let frame = null, frameDepth = 0;
  if (root) {
    for (const child of root.children) {
      const s = getComputedStyle(child);
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') { frame = child; break; }
    }
  }
  return {
    htmlHasAttr: document.documentElement.hasAttribute('data-dsh-theme'),
    styleElExists: !!el,
    styleLen: el ? el.textContent.length : 0,
    styleHasDerivation: el ? el.textContent.includes('color-mix(in srgb, var(--dsw-alias-bg-layer-1) 60%') : false,
    bodyBg: cs.backgroundColor,
    tok: {
      radiusPanel: cs.getPropertyValue('--dsw-radius-panel').trim(),
      radiusMd: cs.getPropertyValue('--dsw-radius-md').trim(),
      specificInputMajor: cs.getPropertyValue('--dsw-specific-input-major').trim(),
      specificSidebarFill: cs.getPropertyValue('--dsw-specific-sidebar-fill').trim(),
      aliasBgLayer1: cs.getPropertyValue('--dsw-alias-bg-layer-1').trim(),
      aliasBgBase: cs.getPropertyValue('--dsw-alias-bg-base').trim(),
      brandPrimary: cs.getPropertyValue('--dsw-alias-brand-primary').trim(),
      dshSidebarBg: cs.getPropertyValue('--dsh-sidebar-bg').trim(),
    },
    sidebar: (() => { const e = document.querySelector('[class*="sidebarCol"]'); if (!e) return null; const s = getComputedStyle(e); return { bg: s.backgroundColor, border: s.borderRightWidth + ' ' + s.borderRightColor }; })(),
    frameSel: frame ? (frame.className || frame.tagName) : null,
    frameBg: frame ? getComputedStyle(frame).backgroundColor : null,
  };
}"""

# 像素采样：找真正有非透明背景的绘制元素
PIXEL = r"""() => {
  const desc = (e) => {
    if (!e) return null;
    const s = getComputedStyle(e);
    return { tag: e.tagName, cls: (e.className || '').toString().slice(0, 70), bg: s.backgroundColor };
  };
  const firstOpaque = (from, x, y) => {
    // elementFromPoint 会命中透明覆盖层；这里沿父链找第一个有非透明背景的
    let e = document.elementFromPoint(x, y);
    while (e) {
      const s = getComputedStyle(e);
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)') return desc(e);
      e = e.parentElement;
    }
    return null;
  };
  return {
    sidebar: firstOpaque(null, 90, 450),
    composerArea: firstOpaque(null, 720, 820),
    canvas: firstOpaque(null, 720, 300),
  };
}"""

def open_settings(pg):
    pg.evaluate("""() => {
      const btns = [...document.querySelectorAll('button')];
      const gear = btns.find(b => (b.getAttribute('aria-label')||'').includes('设置') || (b.title||'').includes('设置'));
      if (gear) gear.click();
    }""")
    pg.wait_for_timeout(2000)

def open_theme_section(pg):
    ok = pg.evaluate(r"""() => {
      const items = [...document.querySelectorAll('button, [role="tab"], li, div')];
      const hit = items.find(e => (e.textContent || '').trim() === 'dsh-theme 主题' && e.offsetParent !== null);
      if (hit) { hit.click(); return true; }
      return false;
    }""")
    pg.wait_for_timeout(1800)
    return ok

def close_settings(pg):
    """关掉设置对话框，让全页截图与负控制可比（否则截图被对话框遮罩污染）。"""
    try:
        pg.keyboard.press("Escape")
        pg.wait_for_timeout(800)
    except Exception:
        pass
    # 兜底：点对话框的关闭按钮
    try:
        pg.evaluate("""() => {
          const btn = [...document.querySelectorAll('button')].find(b => (b.getAttribute('aria-label')||'').includes('关闭'));
          if (btn) btn.click();
        }""")
        pg.wait_for_timeout(800)
    except Exception:
        pass

def toggle_state(pg):
    return pg.evaluate(r"""() => {
      const t = document.querySelector('[data-dsh-part="theme-toggle"]');
      if (!t) return null;
      return t.checked;
    }""")

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("console", lambda m: console_msgs.append("[%s] %s" % (m.type, m.text[:600])))
    pg.on("pageerror", lambda e: page_errors.append(str(e)[:800]))
    failed_requests = []
    pg.on("response", lambda r: failed_requests.append({"status": r.status, "url": r.url}) if r.status >= 400 else None)
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    # 首屏弹窗：按文本定位，坐标兜底
    try:
        btn = pg.get_by_role("button", name=lambda n: n and ("知道了" in n or "确定" in n))
        if btn.count() > 0:
            btn.first.click(timeout=3000)
        else:
            pg.mouse.click(933, 577)
    except Exception:
        try: pg.mouse.click(933, 577)
        except Exception: pass
    pg.wait_for_timeout(1500)

    # ── 验收 3：默认 ON ──
    on = pg.evaluate(PROBE)
    R["c3_on"] = on
    R["c7_paint_on"] = pg.evaluate(PIXEL)
    pg.screenshot(path=os.path.join(here, "on-full.png"))

    # ── 验收 2：设置页面板 + 开关存在 ──
    open_settings(pg)
    sectionOpened = open_theme_section(pg)
    R["c2_panel"] = {
        "sectionNavOpened": sectionOpened,
        "hasPanelTitle": pg.evaluate("() => (document.body.innerText||'').includes('dsh-theme 主题')"),
        "toggleExists": pg.evaluate("() => !!document.querySelector('[data-dsh-part=\"theme-toggle\"]')"),
        "toggleChecked": toggle_state(pg),
    }
    pg.screenshot(path=os.path.join(here, "settings-panel.png"))

    # ── 验收 4：真实点击开关 → OFF ──
    clicked = pg.evaluate(r"""() => {
      const t = document.querySelector('[data-dsh-part="theme-toggle"]');
      if (!t) return false;
      t.click();
      return true;
    }""")
    pg.wait_for_timeout(2000)
    R["c4_off"] = pg.evaluate(PROBE)
    R["c4_off"]["toggleClicked"] = clicked
    R["c4_off"]["toggleChecked"] = toggle_state(pg)
    close_settings(pg)
    R["c7_paint_off"] = pg.evaluate(PIXEL)
    pg.screenshot(path=os.path.join(here, "off-full.png"))

    # ── 再点回来 → ON（对话框已关，需重新打开设置与本节） ──
    open_settings(pg)
    open_theme_section(pg)
    pg.evaluate(r"""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); if (t) t.click(); }""")
    pg.wait_for_timeout(2000)
    R["c4_back_on"] = pg.evaluate(PROBE)
    R["c4_back_on"]["toggleChecked"] = toggle_state(pg)
    close_settings(pg)
    R["c7_paint_restored"] = pg.evaluate(PIXEL)
    pg.screenshot(path=os.path.join(here, "on-restored.png"))

    # ── 验收 5：重载后持久化 ──
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1500)
    R["c5_after_reload"] = pg.evaluate(PROBE)
    R["c7_paint_reload"] = pg.evaluate(PIXEL)
    pg.screenshot(path=os.path.join(here, "on-after-reload.png"))

    # ── 验收 5b：OFF 状态也持久化（关掉 → 重载 → 仍是关） ──
    open_settings(pg); open_theme_section(pg)
    pg.evaluate(r"""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); if (t) t.click(); }""")
    pg.wait_for_timeout(1500)
    pg.reload(wait_until="domcontentloaded")
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1500)
    R["c5_off_after_reload"] = pg.evaluate(PROBE)
    pg.screenshot(path=os.path.join(here, "off-after-reload.png"))

    # 还原成 ON，供后续/收工状态干净
    pg.evaluate("""async () => {
      await fetch('/api/dsh-theme/state', {method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({enabled:true})});
    }""")
    pg.wait_for_timeout(800)

    b.close()

console_errors = [m for m in console_msgs if m.startswith("[error]")]
R["console"] = {"errors": console_errors, "errorCount": len(console_errors), "pageerrors": page_errors, "all": console_msgs[:40], "failedRequests": [f for f in failed_requests if f["status"] >= 400][:20]}
names = ["on-full.png", "off-full.png", "on-restored.png", "on-after-reload.png", "off-after-reload.png", "settings-panel.png"]
R["md5"] = {n: md5(os.path.join(here, n)) for n in names}
R["md5"]["on_vs_off_differ"] = R["md5"]["on-full.png"] != R["md5"]["off-full.png"]

with open(os.path.join(here, "acceptance.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)

print(json.dumps({
  "c2_panel": R["c2_panel"],
  "c3_on": {"attr": R["c3_on"]["htmlHasAttr"], "style": R["c3_on"]["styleElExists"], "len": R["c3_on"]["styleLen"], "derivation": R["c3_on"]["styleHasDerivation"], "tok": R["c3_on"]["tok"], "sidebar": R["c3_on"]["sidebar"]},
  "c4_off": {"attr": R["c4_off"]["htmlHasAttr"], "style": R["c4_off"]["styleElExists"], "len": R["c4_off"]["styleLen"], "checked": R["c4_off"].get("toggleChecked"), "sidebar": R["c4_off"]["sidebar"]},
  "c4_back_on": {"attr": R["c4_back_on"]["htmlHasAttr"], "checked": R["c4_back_on"].get("toggleChecked")},
  "c5_reload": {"attr": R["c5_after_reload"]["htmlHasAttr"], "style": R["c5_after_reload"]["styleElExists"]},
  "c5_off_reload": {"attr": R["c5_off_after_reload"]["htmlHasAttr"], "style": R["c5_off_after_reload"]["styleElExists"]},
  "md5": R["md5"],
  "consoleErrors": R["console"]["errorCount"],
  "failedRequests": R["console"]["failedRequests"],
  "pageerrors": len(page_errors),
}, ensure_ascii=False, indent=1))
