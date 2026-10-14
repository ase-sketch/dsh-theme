# -*- coding: utf-8 -*-
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto("file:///E:/dsh-theme/design/preview.html")
        await pg.wait_for_timeout(1000)
        for theme in ["dark", "light"]:
            await pg.evaluate(f"document.documentElement.dataset.theme='{theme}'")
            await pg.wait_for_timeout(500)
            for aid, name in [("g-sidebar","sidebar"), ("g-settings","settings"), ("tokens","tokens")]:
                el = await pg.query_selector("#" + aid)
                await el.scroll_into_view_if_needed()
                await pg.wait_for_timeout(300)
                await el.screenshot(path=f"E:/dsh-theme/.agents/shots/m7-sec-{theme}-{name}.png")
        await b.close()

asyncio.run(main())
print("done")
