# -*- coding: utf-8 -*-
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        pg = await b.new_page(viewport={"width":1440,"height":900})
        await pg.goto("file:///E:/dsh-theme/design/preview.html")
        await pg.wait_for_timeout(1000)
        h = await pg.evaluate("document.body.scrollHeight")
        print("page height:", h)
        for theme in ["dark", "light"]:
            await pg.evaluate(f"document.documentElement.dataset.theme='{theme}'")
            await pg.wait_for_timeout(600)
            n = 0
            y = 900
            while y < h and n < 7:
                await pg.evaluate(f"window.scrollTo(0,{y})")
                await pg.wait_for_timeout(400)
                await pg.screenshot(path=f"E:/dsh-theme/.agents/shots/m7-sec-{theme}-{n:02d}.png")
                y += 900
                n += 1
            print(theme, "sections:", n)
        await b.close()

asyncio.run(main())
print("done")
