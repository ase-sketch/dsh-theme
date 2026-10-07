import sys, json
from playwright.sync_api import sync_playwright

url = sys.argv[1]

def norm(v):
    return (v or '').replace(' ', '')

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)

    # ── A. preview 基准页取值 ───────────────────────────────────────────
    pv = b.new_page(viewport={"width":1440,"height":900})
    pv.goto("file:///E:/dsh-ui/preview/index.html", wait_until="load", timeout=30000)
    pv.wait_for_timeout(2000)
    base = pv.evaluate("""() => {
      const find = (frag, extra) => [...document.querySelectorAll('[class]')].find(el => (el.className||'').toString().includes(frag) && (!extra || (el.className||'').toString().includes(extra)));
      const info = (el) => { if (!el) return null; const cs = getComputedStyle(el); return { radius: cs.borderTopLeftRadius, bg: cs.backgroundColor, border: cs.borderTopWidth + ' ' + cs.borderTopColor, shadow: cs.boxShadow }; };
      return {
        sidebar: info(find('dsh-sidebar')),
        newchat: info(find('dsh-btn-new-chat')),
        composer: info(find('dsh-input-card')),
        session_active: info(find('dsh-session-item', 'active')),
        badge: info(find('dsh-badge-tier')),
      };
    }""")
    print("=== preview 基准页 ===")
    print(json.dumps(base, ensure_ascii=False, indent=1))

    # ── B. GUI 实页取值 + 皮肤卡预览图 ─────────────────────────────────
    gp = b.new_page(viewport={"width":1440,"height":900})
    gp.goto(url, wait_until="domcontentloaded", timeout=30000)
    gp.wait_for_timeout(5000)
    gp.mouse.click(933, 577); gp.wait_for_timeout(1200)
    gp.evaluate("""async () => { await fetch('/api/skin-center/v2/active', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({active: null}) }); }""")
    gp.wait_for_timeout(900)
    gp.evaluate("""async () => { await fetch('/api/skin-center/v2/active', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({active: 'dsh-ui'}) }); }""")
    gp.wait_for_timeout(2500)
    gui = gp.evaluate("""() => {
      const cs = (s) => { const el = document.querySelector(s); if (!el) return null; const c = getComputedStyle(el); return { radius: c.borderTopLeftRadius, bg: c.backgroundColor, border: c.borderTopWidth + ' ' + c.borderTopColor, shadow: c.boxShadow }; };
      return {
        sidebar: cs('[class*="sidebarCol"]'),
        newchat: cs('[data-dsh-part="new-session"]'),
        composer: cs('[data-dsh-surface="composer"] [class*="card"]'),
        session_active: cs('[data-dsh-surface="sidebar"] [class*="sessionRow"][class*="selected"]'),
        badge: cs('[class*="previewBadge"]'),
      };
    }""")
    print("=== GUI 实页 ===")
    print(json.dumps(gui, ensure_ascii=False, indent=1))

    print("=== 逐项对照（bg / radius / border）===")
    fails = []
    for key in base:
        b_, g_ = base.get(key), gui.get(key)
        if not b_ or not g_:
            print(f"  SKIP {key}（一侧缺失）"); continue
        for prop in ['bg', 'radius', 'border']:
            same = norm(b_[prop]) == norm(g_[prop])
            mark = "OK  " if same else "DIFF"
            if not same: fails.append(f"{key}.{prop}: preview={b_[prop]} gui={g_[prop]}")
            print(f"  {mark} {key}.{prop}: preview={b_[prop]}  gui={g_[prop]}")

    # 皮肤卡预览图
    gp.mouse.click(56, 869); gp.wait_for_timeout(2500)
    gp.mouse.click(373, 308); gp.wait_for_timeout(3000)
    card = gp.evaluate("""() => {
      const imgs = [...document.querySelectorAll('img')].filter(i => /dsh-ui/.test(i.getAttribute('src') || ''));
      return imgs.map(i => ({ src: i.getAttribute('src'), natural: i.naturalWidth + 'x' + i.naturalHeight, shown: Math.round(i.getBoundingClientRect().width) + 'x' + Math.round(i.getBoundingClientRect().height) }));
    }""")
    print("=== dsh-ui 卡片预览图 ===")
    print(json.dumps(card, ensure_ascii=False, indent=1))
    gp.screenshot(path=".agents/shots/m3-skin-card.png")
    b.close()

print()
if fails:
    print("DIFF", len(fails))
    for f in fails: print("  ", f)
else:
    print("对照完成：无差异项")