# -*- coding: utf-8 -*-
import asyncio, json, sys, os
URL = sys.argv[1]; OUT = os.path.dirname(os.path.abspath(__file__))
JS = """(() => {
  const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null; const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
    return { bg: el.style.backgroundImage, pos: el.style.backgroundPosition, size: el.style.backgroundSize, w: el.style.width, h: el.style.height,
             rect: {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)}, z: cs.zIndex, order: cs.order }; };
  return { heroSprite: pick('#dsh-theme-deepy-hero .dsh-theme-deepy-sprite'), heroBase: pick('#dsh-theme-deepy-hero .dsh-theme-deepy-base'),
           mainSprite: pick('#dsh-theme-deepy .dsh-theme-deepy-sprite'), mainBase: pick('#dsh-theme-deepy .dsh-theme-deepy-base'),
           rootBg: getComputedStyle(document.body).backgroundColor,
           htmlAttrs: [...document.documentElement.attributes].map(a => a.name + '=' + a.value.slice(0,60)) };
})()"""
async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        pg = await b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        try: await pg.mouse.click(933, 577); await pg.wait_for_timeout(400)
        except Exception: pass
        await pg.wait_for_timeout(2000)
        print(json.dumps(await pg.evaluate(JS), ensure_ascii=False, indent=2))
        # 只截 hero 与 main 的元素框（含重叠内容），放大看
        for sel, name in [('#dsh-theme-deepy-hero', 'hero2x'), ('#dsh-theme-deepy', 'main2x')]:
            el = await pg.query_selector(sel)
            if el: await el.screenshot(path=os.path.join(OUT, name + '.png'))
        # 深色尝试
        await pg.emulate_media(color_scheme="dark")
        await pg.wait_for_timeout(1500)
        print('after dark:', await pg.evaluate("() => getComputedStyle(document.body).backgroundColor"))
        await pg.screenshot(path=os.path.join(OUT, "dark-attempt.png"))
        await b.close()
asyncio.run(main())
