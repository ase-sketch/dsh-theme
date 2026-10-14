# -*- coding: utf-8 -*-
"""M7：把运行时**未替换**的 svg 抓出来，供后续补映射；并给 Deepy 月台/hero 拍近景。"""
import asyncio, json, sys, os

URL = sys.argv[1]
OUT = os.path.dirname(os.path.abspath(__file__))

PROBE = """(() => {
  const all = [...document.querySelectorAll('svg')];
  const un = all.filter(s => !s.hasAttribute('data-dsh-icon'));
  const chain = (el) => {
    const out = [];
    let cur = el;
    for (let i = 0; i < 4 && cur; i++) {
      const cls = (typeof cur.className === 'string' ? cur.className : '').split(' ').filter(Boolean).slice(0, 2).join('.');
      out.push(cur.tagName.toLowerCase() + (cls ? '.' + cls : '') + (cur.getAttribute && cur.getAttribute('data-slot') ? '[' + cur.getAttribute('data-slot') + ']' : ''));
      cur = cur.parentElement;
    }
    return out.join(' < ');
  };
  return {
    unreplacedCount: un.length,
    rows: un.map(s => ({
      viewBox: s.getAttribute('viewBox'),
      w: s.getAttribute('width'),
      h: s.getAttribute('height'),
      kids: s.children.length,
      tags: [...s.children].map(c => c.tagName.toLowerCase()).join(','),
      html: (s.outerHTML || '').slice(0, 260),
      chain: chain(s.parentElement || s),
    })),
    stats: document.documentElement.getAttribute('data-dsh-icons'),
  };
})()"""

HERO_RECT = """(() => {
  const h = document.getElementById('dsh-theme-deepy-hero');
  const m = document.getElementById('dsh-theme-deepy');
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height}; };
  return { hero: r(h), main: r(m) };
})()"""


async def main():
    from playwright.async_api import async_playwright
    R = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        await pg.goto(URL)
        await pg.wait_for_timeout(3500)
        try:
            await pg.mouse.click(933, 577); await pg.wait_for_timeout(500)
        except Exception: pass
        await pg.wait_for_timeout(2000)
        # 打开设置并拨 ON
        await pg.evaluate("""() => { const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'').includes('设置') || (x.title||'').includes('设置')); if (b) b.click(); }""")
        await pg.wait_for_timeout(2200)
        await pg.evaluate("""() => { const items = [...document.querySelectorAll('button, [role="tab"], li, div')]; const hit = items.find(e => (e.textContent||'').trim() === 'dsh-theme 主题' && e.offsetParent !== null); if (hit) hit.click(); }""")
        await pg.wait_for_timeout(1800)
        cur = await pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); return t ? t.checked : null; }""")
        if cur is False:
            await pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); if (t) t.click(); }""")
            await pg.wait_for_timeout(2800)
        await pg.keyboard.press("Escape"); await pg.wait_for_timeout(1500)

        R["probe"] = await pg.evaluate(PROBE)
        R["rects"] = await pg.evaluate(HERO_RECT)
        await pg.screenshot(path=os.path.join(OUT, "probe-full.png"))
        r = R["rects"]
        if r.get("hero"):
            x = max(0, r["hero"]["x"] - 40); y = max(0, r["hero"]["y"] - 60)
            await pg.screenshot(path=os.path.join(OUT, "probe-hero-closeup.png"),
                                clip={"x": x, "y": y, "width": min(400, 1440 - x), "height": min(280, 900 - y)})
        if r.get("main"):
            x = max(0, r["main"]["x"] - 60); y = max(0, r["main"]["y"] - 40)
            await pg.screenshot(path=os.path.join(OUT, "probe-main-closeup.png"),
                                clip={"x": x, "y": y, "width": min(420, 1440 - x), "height": min(200, 900 - y)})
        await b.close()
    with open(os.path.join(OUT, "probe-unreplaced.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, ensure_ascii=False, indent=2)
    print(json.dumps(R, ensure_ascii=False, indent=2)[:6000])


asyncio.run(main())
