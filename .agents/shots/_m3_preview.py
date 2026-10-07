import sys
from playwright.sync_api import sync_playwright

url = sys.argv[1]
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width":1440,"height":900}, device_scale_factor=1)
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    pg.mouse.click(933, 577); pg.wait_for_timeout(1200)
    pg.evaluate("""async () => { await fetch('/api/skin-center/v2/active', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({active: null}) }); }""")
    pg.wait_for_timeout(1000)
    pg.evaluate("""async () => { await fetch('/api/skin-center/v2/active', { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({active: 'dsh-ui'}) }); }""")
    pg.wait_for_timeout(2500)
    # 亮色
    pg.screenshot(path="E:/dsh-theme/skins/dsh-ui/preview/light.jpg", type="jpeg", quality=88)
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m3-preview-light.png")
    # 暗色
    pg.evaluate("() => document.body.setAttribute('data-ds-dark-theme','')")
    pg.wait_for_timeout(900)
    pg.screenshot(path="E:/dsh-theme/skins/dsh-ui/preview/dark.jpg", type="jpeg", quality=88)
    pg.screenshot(path="E:/dsh-theme/.agents/shots/m3-preview-dark.png")
    print("预览图已生成")
    b.close()
