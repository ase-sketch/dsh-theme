# -*- coding: utf-8 -*-
"""M7 图标层 + Deepy 深空编辑室：隔离 web profile 实机验证。

跑法：PYTHONUTF8=1 python .agents/tmp/m7-icons/verify_icons.py <token-url>
证据：.agents/tmp/m7-icons/verify-result.json + *.png
"""
import asyncio, json, sys, os

URL = sys.argv[1]
OUT = os.path.dirname(os.path.abspath(__file__))
RESULT = {}

COUNT_JS = """(() => {
  const all = [...document.querySelectorAll('svg')];
  const replaced = all.filter(s => s.hasAttribute('data-dsh-icon'));
  const lucideGroups = document.querySelectorAll('g[data-dsh-icon-lucide]');
  const hidden = document.querySelectorAll('[data-dsh-icon-hidden]');
  const root = document.documentElement;
  return {
    svgTotal: all.length,
    svgReplaced: replaced.length,
    lucideGroups: lucideGroups.length,
    hiddenOriginals: hidden.length,
    statsAttr: root.getAttribute('data-dsh-icons'),
    names: replaced.slice(0, 40).map(s => s.getAttribute('data-dsh-icon')),
    badViewBox: replaced.filter(s => s.getAttribute('viewBox') !== '0 0 24 24').length,
    replacedWithoutGroup: replaced.filter(s => !s.querySelector('g[data-dsh-icon-lucide]')).length,
    groupsWithoutGeometry: [...lucideGroups].filter(g => g.children.length === 0).length,
    // 原节点必须还在 DOM 里（React 的引用要有效）
    replacedWithOriginalsGone: replaced.filter(s => !s.querySelector('[data-dsh-icon-hidden]')).length,
    deepyHost: !!document.getElementById('dsh-theme-deepy'),
    deepyBase: !!document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-base'),
    deepyState: (document.getElementById('dsh-theme-deepy') || {}).getAttribute
      ? document.getElementById('dsh-theme-deepy').getAttribute('data-dsh-deepy-state') : null,
    deepyHero: !!document.getElementById('dsh-theme-deepy-hero'),
    deepyHeroBase: !!document.querySelector('#dsh-theme-deepy-hero .dsh-theme-deepy-base'),
    heroSpritePainted: (() => {
      const el = document.querySelector('#dsh-theme-deepy-hero .dsh-theme-deepy-sprite');
      return el ? !!(el.style.backgroundImage && el.style.backgroundImage.length > 0) : false;
    })(),
    spritePainted: (() => {
      const el = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
      return el ? !!(el.style.backgroundImage && el.style.backgroundImage.length > 0) : false;
    })(),
    baseGlow: (() => {
      const el = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-base');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { boxShadow: cs.boxShadow, animationName: cs.animationName, animationDuration: cs.animationDuration, opacity: cs.opacity };
    })(),
    iconStyleTag: !!document.getElementById('dsh-theme-icon-style'),
  };
})()"""


async def snapshot(pg, label):
    return await pg.evaluate(COUNT_JS)


async def main():
    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        errors = []
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        await pg.goto(URL)
        await pg.wait_for_timeout(3500)
        # 关掉可能出现的「预览版说明」弹窗
        try:
            await pg.mouse.click(933, 577)
            await pg.wait_for_timeout(500)
        except Exception:
            pass
        await pg.wait_for_timeout(2500)

        RESULT["on"] = await snapshot(pg, "on")
        await pg.screenshot(path=os.path.join(OUT, "verify-on.png"))

        # 建一个空会话，看 hero 迎宾位
        try:
            await pg.keyboard.press("Control+N")
            await pg.wait_for_timeout(2000)
        except Exception:
            pass
        RESULT["blank"] = await snapshot(pg, "blank")
        await pg.screenshot(path=os.path.join(OUT, "verify-hero.png"))

        # 拨 OFF（走 host 的 state 路由，等价于设置面板拨开关）
        await pg.evaluate("""() => fetch('/api/dsh-theme/state', {method:'POST', credentials:'same-origin',
            headers:{'content-type':'application/json'}, body: JSON.stringify({enabled:false})}).then(r=>r.json())""")
        await pg.wait_for_timeout(1800)
        RESULT["off"] = await snapshot(pg, "off")
        await pg.screenshot(path=os.path.join(OUT, "verify-off.png"))

        # 拨回 ON
        await pg.evaluate("""() => fetch('/api/dsh-theme/state', {method:'POST', credentials:'same-origin',
            headers:{'content-type':'application/json'}, body: JSON.stringify({enabled:true})}).then(r=>r.json())""")
        await pg.wait_for_timeout(2200)
        RESULT["on2"] = await snapshot(pg, "on2")
        await pg.screenshot(path=os.path.join(OUT, "verify-on2.png"))

        RESULT["consoleErrors"] = errors[:20]
        await b.close()

    with open(os.path.join(OUT, "verify-result.json"), "w", encoding="utf-8") as f:
        json.dump(RESULT, f, ensure_ascii=False, indent=2)
    print(json.dumps(RESULT, ensure_ascii=False, indent=2)[:6000])


asyncio.run(main())
