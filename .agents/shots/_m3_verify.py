import sys, json
from playwright.sync_api import sync_playwright

url = sys.argv[1]
fails = []
def check(label, got, want):
    ok = got == want
    if not ok: fails.append(f"{label}: got {got!r} want {want!r}")
    print(("  OK  " if ok else "  FAIL") + f" {label} = {got}")

PROBE = """() => {
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
    skin: document.documentElement.getAttribute('data-dsh-skin'),
  };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width":1440,"height":900})
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    pg.mouse.click(933, 577); pg.wait_for_timeout(1200)
    # 重新应用一次，强制加载新 patches.css
    pg.evaluate("""async () => { await fetch('/api/skin-center/v2/active', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({active: null}) }); }""")
    pg.wait_for_timeout(1200)
    pg.evaluate("""async () => { await fetch('/api/skin-center/v2/active', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({active: 'dsh-ui'}) }); }""")
    pg.wait_for_timeout(2500)

    print("== 亮色 ==")
    r = pg.evaluate(PROBE)
    check("skin 属性", r["skin"], "dsh-ui")
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
    pg.screenshot(path=".agents/shots/m3-light-home.png")

    print("== 暗色 ==")
    pg.evaluate("() => document.body.setAttribute('data-ds-dark-theme','')")
    pg.wait_for_timeout(800)
    r2 = pg.evaluate(PROBE)
    check("[dark] --dsw-specific-input-major", r2["tok_input_major"], "#1D222C")
    check("[dark] --dsw-specific-sidebar-fill", r2["tok_sidebar_fill"], "#171B24")
    check("[dark] 输入卡 底色", r2["card_bg"], "rgb(29, 34, 44)")
    check("[dark] 输入卡 圆角", r2["card_radius"], "20px")
    check("[dark] 侧栏 底色", r2["sb_bg"], "rgb(23, 27, 36)")
    check("[dark] 新建会话 底", r2["ns_bg"], "rgb(123, 144, 255)")
    check("[dark] 会话选中 底", r2["row_bg"], "rgb(44, 51, 65)")
    pg.screenshot(path=".agents/shots/m3-dark-home.png")
    pg.evaluate("() => document.body.removeAttribute('data-ds-dark-theme')")
    pg.wait_for_timeout(500)

    print("== 设置面板 ==")
    pg.mouse.click(56, 869); pg.wait_for_timeout(2500)
    r3 = pg.evaluate("""() => {
      const el = document.querySelector('[data-dsh-surface="settings"]') || document.querySelector('[role="dialog"]');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { radius: cs.borderRadius, bg: cs.backgroundColor, w: Math.round(el.getBoundingClientRect().width) };
    }""")
    print("  设置面板:", json.dumps(r3, ensure_ascii=False))
    if r3: check("设置面板 圆角", r3["radius"], "20px")
    pg.screenshot(path=".agents/shots/m3-light-settings.png")
    b.close()

print()
if fails:
    print("FAIL", len(fails))
    for f in fails: print("  ", f)
    sys.exit(1)
print("PASS: M3 组件层全部断言命中")