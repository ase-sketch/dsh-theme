# -*- coding: utf-8 -*-
"""精确定位 hero 迎宾位与主位：谁在画、画在哪、画的哪张图。"""
import asyncio, json, sys, os
URL = sys.argv[1]; OUT = os.path.dirname(os.path.abspath(__file__))
JS = """(() => {
  const info = (el) => {
    if (!el) return null;
    const b = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height),
             bg: el.style.backgroundImage || cs.backgroundImage, display: cs.display, pos: cs.position };
  };
  const hero = document.getElementById('dsh-theme-deepy-hero');
  const heroSprite = hero ? hero.querySelector('.dsh-theme-deepy-sprite') : null;
  const heroBase = hero ? hero.querySelector('.dsh-theme-deepy-base') : null;
  const main = document.getElementById('dsh-theme-deepy');
  const mainSprite = main ? main.querySelector('.dsh-theme-deepy-sprite') : null;
  const mainBase = main ? main.querySelector('.dsh-theme-deepy-base') : null;
  const slot = hero ? hero.parentElement : null;
  return {
    hero: info(hero), heroSprite: info(heroSprite), heroBase: info(heroBase),
    main: info(main), mainSprite: info(mainSprite), mainBase: info(mainBase),
    slotChain: (() => { const out=[]; let c = hero; for (let i=0;i<5&&c;i++){ out.push(c.tagName.toLowerCase()+(c.getAttribute('data-slot')?'['+c.getAttribute('data-slot')+']':'')+(typeof c.className==='string'&&c.className?'.'+c.className.split(' ')[0]:'')); c=c.parentElement;} return out.join(' < '); })(),
    heroSiblingSvgs: hero && hero.parentElement ? [...hero.parentElement.querySelectorAll('svg')].map(s => ({vb: s.getAttribute('viewBox'), w: s.getAttribute('width')})) : [],
  };
})()"""
async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        await pg.goto(URL); await pg.wait_for_timeout(3500)
        try: await pg.mouse.click(933, 577); await pg.wait_for_timeout(400)
        except Exception: pass
        await pg.wait_for_timeout(2000)
        R = await pg.evaluate(JS)
        print(json.dumps(R, ensure_ascii=False, indent=2))
        h = await pg.query_selector('#dsh-theme-deepy-hero')
        if h: await h.screenshot(path=os.path.join(OUT, "hero-element.png"))
        m = await pg.query_selector('#dsh-theme-deepy')
        if m: await m.screenshot(path=os.path.join(OUT, "main-element.png"))
        await b.close()
asyncio.run(main())
