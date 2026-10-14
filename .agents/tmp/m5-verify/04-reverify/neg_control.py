# -*- coding: utf-8 -*-
"""验收 4（负控制，独立补强）：不只比 md5，还做 DOM 级负控制。
固定视口 + 禁用动画 + 等首屏稳定后截图；对同一裁剪区域取 md5；
并断言禁用态下 style 标签 / data-dsh-theme 属性确实不存在（防像素差异假通过）。
用法: python neg_control.py <url>
"""
import sys, json, os, hashlib, io
from playwright.sync_api import sync_playwright
from PIL import Image

url = sys.argv[1]
here = os.path.dirname(os.path.abspath(__file__))

PROBE = r"""() => ({
  htmlHasAttr: document.documentElement.hasAttribute('data-dsh-theme'),
  styleElExists: !!document.getElementById('dsh-theme-style'),
  styleLen: (document.getElementById('dsh-theme-style') || {textContent:''}).textContent.length,
  sidebarBg: (() => { const e = document.querySelector('[class*="sidebarCol"]'); return e ? getComputedStyle(e).backgroundColor : null; })(),
  bodyBg: getComputedStyle(document.body).backgroundColor,
})"""

def open_settings(pg):
    pg.evaluate("""() => { const bs=[...document.querySelectorAll('button')];
      const g=bs.find(b=>(b.getAttribute('aria-label')||'').includes('设置')||(b.title||'').includes('设置')); if(g)g.click(); }""")
    pg.wait_for_timeout(2200)

def close_settings(pg):
    try: pg.keyboard.press("Escape")
    except Exception: pass
    pg.wait_for_timeout(1200)

def toggle(pg, want):
    open_settings(pg)
    pg.evaluate(r"""() => { const items=[...document.querySelectorAll('button, [role="tab"], li, div')];
      const hit=items.find(e=>(e.textContent||'').trim()==='dsh-theme 主题'&&e.offsetParent!==null); if(hit)hit.click(); }""")
    pg.wait_for_timeout(1800)
    cur = pg.evaluate("""() => { const t=document.querySelector('[data-dsh-part="theme-toggle"]'); return t?t.checked:null; }""")
    if cur is not None and cur != want:
        pg.evaluate("""() => { const t=document.querySelector('[data-dsh-part="theme-toggle"]'); if(t)t.click(); }""")
        pg.wait_for_timeout(2200)
    close_settings(pg)
    return cur

def crop_md5(png_bytes, box):
    im = Image.open(io.BytesIO(png_bytes)).convert("RGB").crop(box)
    return hashlib.md5(im.tobytes()).hexdigest(), im.size

R = {}
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900}, device_scale_factor=1,
                        reduced_motion="reduce")
    pg = ctx.new_page()
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(1500)
    # 冻结动效
    pg.add_style_tag(content="*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}")
    pg.wait_for_timeout(1200)

    # ON 态
    R["on_dom"] = pg.evaluate(PROBE)
    on_png = pg.screenshot()
    with open(os.path.join(here, "neg-on.png"), "wb") as f: f.write(on_png)

    # 关掉插件
    R["toggle_from"] = toggle(pg, False)
    pg.wait_for_timeout(1500)
    R["off_dom"] = pg.evaluate(PROBE)
    off_png = pg.screenshot()
    with open(os.path.join(here, "neg-off.png"), "wb") as f: f.write(off_png)

    # 还原
    R["toggle_back_from"] = toggle(pg, True)
    pg.wait_for_timeout(1500)
    R["restored_dom"] = pg.evaluate(PROBE)
    b.close()

BOX = (0, 0, 1440, 900)
CROP = (0, 60, 900, 700)   # 侧栏+输入卡区域，避开顶部状态与右侧空白
R["full_md5"] = {"on": hashlib.md5(on_png).hexdigest(), "off": hashlib.md5(off_png).hexdigest()}
R["full_md5"]["differ"] = R["full_md5"]["on"] != R["full_md5"]["off"]
a, sz = crop_md5(on_png, CROP)
c, _ = crop_md5(off_png, CROP)
R["crop_md5"] = {"box": list(CROP), "size": list(sz), "on": a, "off": c, "differ": a != c}
R["dom_negative_control"] = {
  "on_has_style_el": R["on_dom"]["styleElExists"],
  "on_has_attr": R["on_dom"]["htmlHasAttr"],
  "off_has_style_el": R["off_dom"]["styleElExists"],
  "off_has_attr": R["off_dom"]["htmlHasAttr"],
  "pass": (R["on_dom"]["styleElExists"] and R["on_dom"]["htmlHasAttr"]
           and not R["off_dom"]["styleElExists"] and not R["off_dom"]["htmlHasAttr"]),
}
with open(os.path.join(here, "neg-control.json"), "w", encoding="utf-8") as f:
    json.dump(R, f, ensure_ascii=False, indent=1)
print(json.dumps(R, ensure_ascii=False, indent=1))
