# -*- coding: utf-8 -*-
"""M7 收口证据：图标层 + Deepy 深空编辑室（浅色/深色两套截图）。"""
import asyncio, json, sys, os
URL = sys.argv[1]; OUT = os.path.dirname(os.path.abspath(__file__))
JS = """(() => {
  const pick = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect();
    return { bg: (el.style.backgroundImage||'').split('/').pop(), pos: el.style.backgroundPosition, size: el.style.backgroundSize,
             rect: {x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height)} }; };
  const all = [...document.querySelectorAll('svg')];
  return {
    svgTotal: all.length, replaced: all.filter(s=>s.hasAttribute('data-dsh-icon')).length,
    groups: document.querySelectorAll('g[data-dsh-icon-lucide]').length,
    badViewBox: all.filter(s=>s.hasAttribute('data-dsh-icon') && s.getAttribute('viewBox') !== '0 0 24 24').length,
    stats: document.documentElement.getAttribute('data-dsh-icons'),
    missed: document.documentElement.getAttribute('data-dsh-icons-missed'),
    heroSprite: pick('#dsh-theme-deepy-hero .dsh-theme-deepy-sprite'),
    mainSprite: pick('#dsh-theme-deepy .dsh-theme-deepy-sprite'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
  };
})()"""
async def main():
    from playwright.async_api import async_playwright
    R = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        pg = await b.new_page(viewport={"width": 1440, "height": 900}, device_scale_factor=2)
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        try: await pg.mouse.click(933, 577); await pg.wait_for_timeout(400)
        except Exception: pass
        await pg.wait_for_timeout(2500)
        R["light"] = await pg.evaluate(JS)
        await pg.screenshot(path=os.path.join(OUT, "final-light.png"))
        h = await pg.query_selector('#dsh-theme-deepy-hero')
        if h: await h.screenshot(path=os.path.join(OUT, "final-hero-light.png"))
        m = await pg.query_selector('#dsh-theme-deepy')
        if m: await m.screenshot(path=os.path.join(OUT, "final-main-light.png"))

        await pg.emulate_media(color_scheme="dark")
        await pg.wait_for_timeout(2000)
        R["dark"] = await pg.evaluate(JS)
        await pg.screenshot(path=os.path.join(OUT, "final-dark.png"))
        h2 = await pg.query_selector('#dsh-theme-deepy-hero')
        if h2: await h2.screenshot(path=os.path.join(OUT, "final-hero-dark.png"))
        m2 = await pg.query_selector('#dsh-theme-deepy')
        if m2: await m2.screenshot(path=os.path.join(OUT, "final-main-dark.png"))
        R["consoleErrors"] = errs[:20]
        await b.close()
    with open(os.path.join(OUT, "final-result.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, ensure_ascii=False, indent=2)
    print(json.dumps(R, ensure_ascii=False, indent=2))
asyncio.run(main())
