# -*- coding: utf-8 -*-
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto("file:///E:/dsh-theme/design/preview.html")
        await pg.wait_for_timeout(1200)
        # 深色（默认应为 dark 或 light，按实际）
        theme = await pg.evaluate("document.documentElement.dataset.theme || '(none)'")
        print("initial theme:", theme)
        await pg.screenshot(path="E:/dsh-theme/.agents/shots/m7-design-" + ("dark" if theme=="dark" else "light") + ".png")
        # 切换主题
        await pg.evaluate("document.querySelector('[data-theme-toggle], .theme-toggle, button[aria-pressed]')?.click()")
        await pg.wait_for_timeout(1200)
        theme2 = await pg.evaluate("document.documentElement.dataset.theme")
        print("after toggle:", theme2)
        await pg.screenshot(path="E:/dsh-theme/.agents/shots/m7-design-" + theme2 + ".png")
        # 整页全长截图（供组件画廊审查）
        await pg.evaluate("document.documentElement.dataset.theme='dark'")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path="E:/dsh-theme/.agents/shots/m7-design-dark-full.png", full_page=True)
        await pg.evaluate("document.documentElement.dataset.theme='light'")
        await pg.wait_for_timeout(800)
        await pg.screenshot(path="E:/dsh-theme/.agents/shots/m7-design-light-full.png", full_page=True)
        await b.close()

asyncio.run(main())
print("done")
