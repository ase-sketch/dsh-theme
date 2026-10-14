# -*- coding: utf-8 -*-
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        pg = await b.new_page(viewport={"width":1440,"height":900})
        reqs = []
        pg.on("request", lambda r: reqs.append(r.url))
        await pg.goto("file:///E:/dsh-theme/design/preview.html")
        await pg.wait_for_timeout(1200)
        ext = [u for u in reqs if not u.startswith("file://") and not u.startswith("data:")]
        print("external requests:", ext if ext else "NONE (0)")
        h = await pg.evaluate("document.body.scrollHeight")
        # 找到 04 设置面板 与 07 token 面板的锚点位置
        anchors = await pg.evaluate("""(() => {
          const out = [];
          document.querySelectorAll('[id], section, [data-part]').forEach(el => {
            const t = (el.textContent||'').slice(0,30);
            if (/设置面板|Token|TOKEN|token 面板|侧栏|Sidebar|SIDEBAR/.test(t) && el.id) out.push(el.id + '@' + Math.round(el.getBoundingClientRect().top + window.scrollY));
          });
          return out.slice(0,20);
        })()""")
        print("anchors:", anchors)
        # 直接按元素截图：04 设置面板 / 07 token 面板 / 01 侧栏画廊
        for name, sel in [("sidebar-gallery", "04"), ("x", "x")]:
            pass
        secs = await pg.evaluate("""(() => {
          const hs = [...document.querySelectorAll('h1,h2,h3')].map(e => ({t:(e.textContent||'').trim().slice(0,24), y: Math.round(e.getBoundingClientRect().top + window.scrollY)}));
          return hs;
        })()""")
        for s in secs: print(s["y"], s["t"])
        await b.close()

asyncio.run(main())
