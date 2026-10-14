# -*- coding: utf-8 -*-
"""逐项对照 _m3_verify.py 的 24 条断言口径（插件期应同样成立）。"""
import sys, json
from playwright.sync_api import sync_playwright
url = sys.argv[1]
PROBE = r"""() => {
  const q = (s) => document.querySelector(s);
  const cs = (s) => { const el = q(s); return el ? getComputedStyle(el) : null; };
  const card = cs('[data-dsh-surface="composer"] [class*="card"]');
  const sb = cs('[class*="sidebarCol"]');
  const ns = cs('[data-dsh-part="new-session"]');
  const row = cs('[data-dsh-surface="sidebar"] [class*="sessionRow"][class*="selected"]');
  const root = getComputedStyle(document.body);
  return {
    tok_radius_panel: root.getPropertyValue('--dsw-radius-panel').trim(),
    tok_radius_md: root.getPropertyValue('--dsw-radius-md').trim(),
    tok_input_major: root.getPropertyValue('--dsw-specific-input-major').trim(),
    tok_sidebar_fill: root.getPropertyValue('--dsw-specific-sidebar-fill').trim(),
    tok_dsh_radius_xl: root.getPropertyValue('--dsh-radius-xl').trim(),
    card_radius: card && card.borderRadius, card_bg: card && card.backgroundColor,
    card_border: card && (card.borderTopWidth + ' ' + card.borderTopColor), card_shadow: card && card.boxShadow,
    sb_bg: sb && sb.backgroundColor, sb_border: sb && (sb.borderRightWidth + ' ' + sb.borderRightColor),
    ns_bg: ns && ns.backgroundColor, ns_color: ns && ns.color, ns_radius: ns && ns.borderRadius, ns_border: ns && ns.borderTopWidth,
    row_bg: row && row.backgroundColor, row_shadow: row && row.boxShadow,
    nsFound: !!q('[data-dsh-part="new-session"]'),
    rowFound: !!q('[data-dsh-surface="sidebar"] [class*="sessionRow"][class*="selected"]'),
    cardFound: !!q('[data-dsh-surface="composer"] [class*="card"]'),
    sbFound: !!q('[class*="sidebarCol"]'),
  };
}"""
fails = []
def check(label, got, want):
    ok = got == want
    if not ok: fails.append(f"{label}: got {got!r} want {want!r}")
    print(("  OK  " if ok else "  FAIL") + f" {label} = {got!r}")
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width":1440,"height":900})
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1500)
    r = pg.evaluate(PROBE)
    b.close()
print("== 亮色（插件期） ==")
check("--dsh-radius-xl 已发射", r["tok_dsh_radius_xl"], "20px")
check("--dsw-radius-panel", r["tok_radius_panel"], "20px")
check("--dsw-radius-md", r["tok_radius_md"], "10px")
check("--dsw-specific-input-major", r["tok_input_major"], "#FFFFFF")
check("--dsw-specific-sidebar-fill", r["tok_sidebar_fill"], "#F3F7FE")
check("输入卡 圆角", r["card_radius"], "20px")
check("输入卡 底色", r["card_bg"], "rgb(255, 255, 255)")
check("输入卡 描边", r["card_border"], "1px rgb(226, 232, 242)")
check("输入卡 阴影", r["card_shadow"], "none")
check("侧栏 底色", r["sb_bg"], "rgb(243, 247, 254)")
check("侧栏 分隔线", r["sb_border"], "1px rgb(226, 232, 242)")
check("新建会话 底", r["ns_bg"], "rgb(77, 107, 254)")
check("新建会话 字", r["ns_color"], "rgb(255, 255, 255)")
check("新建会话 圆角", r["ns_radius"], "10px")
check("新建会话 无描边", r["ns_border"], "0px")
check("会话选中 底", r["row_bg"], "rgb(226, 234, 248)")
check("会话选中 指示条", r["row_shadow"], "rgb(77, 107, 254) 2px 0px 0px 0px inset")
print("found:", {k: r[k] for k in r if k.endswith('Found')})
print("FAILS:", json.dumps(fails, ensure_ascii=False))
