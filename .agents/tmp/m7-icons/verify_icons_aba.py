# -*- coding: utf-8 -*-
"""M7 图标层 A/B/A 往返验证：先在 OFF 下取**原始 viewBox**，再 ON，再 OFF，逐条比对。

跑法：PYTHONUTF8=1 python .agents/tmp/m7-icons/verify_icons_aba.py <token-url>
"""
import asyncio, json, sys, os

URL = sys.argv[1]
OUT = os.path.dirname(os.path.abspath(__file__))

TAG_AND_SNAP = """(() => {
  const all = [...document.querySelectorAll('svg')];
  const rows = all.map((s, i) => {
    if (!s.hasAttribute('data-probe-id')) s.setAttribute('data-probe-id', 'p' + i);
    return {
      id: s.getAttribute('data-probe-id'),
      viewBox: s.getAttribute('viewBox'),
      replaced: s.hasAttribute('data-dsh-icon'),
      hasGroup: !!s.querySelector('g[data-dsh-icon-lucide]'),
      hidden: s.querySelectorAll('[data-dsh-icon-hidden]').length,
      kids: s.children.length,
      name: s.getAttribute('data-dsh-icon'),
    };
  });
  return {
    rows,
    stats: document.documentElement.getAttribute('data-dsh-icons'),
    missed: document.documentElement.getAttribute('data-dsh-icons-missed'),
    iconStyleTag: !!document.getElementById('dsh-theme-icon-style'),
    deepyHost: !!document.getElementById('dsh-theme-deepy'),
    deepyHero: !!document.getElementById('dsh-theme-deepy-hero'),
    rootAttr: document.documentElement.hasAttribute('data-dsh-theme'),
  };
})()"""


async def open_settings(pg):
    await pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x =>
        (x.getAttribute('aria-label')||'').includes('设置') || (x.title||'').includes('设置'));
      if (b) b.click();
    }""")
    await pg.wait_for_timeout(2200)
    await pg.evaluate("""() => {
      const items = [...document.querySelectorAll('button, [role="tab"], li, div')];
      const hit = items.find(e => (e.textContent||'').trim() === 'dsh-theme 主题' && e.offsetParent !== null);
      if (hit) hit.click();
    }""")
    await pg.wait_for_timeout(1800)


async def set_toggle(pg, want):
    cur = await pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); return t ? t.checked : null; }""")
    if cur is not None and cur != want:
        await pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); if (t) t.click(); }""")
        await pg.wait_for_timeout(2800)
    after = await pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); return t ? t.checked : null; }""")
    return {"before": cur, "after": after}


async def main():
    from playwright.async_api import async_playwright
    R = {}
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe")
        pg = await b.new_page(viewport={"width": 1440, "height": 900})
        errs = []
        pg.on("console", lambda m: errs.append(m.text) if m.type == "error" else None)
        await pg.goto(URL)
        await pg.wait_for_timeout(3500)
        try:
            await pg.mouse.click(933, 577)
            await pg.wait_for_timeout(500)
        except Exception:
            pass
        await pg.wait_for_timeout(2000)

        # A：主题 OFF（启动时就是 OFF）—— 这就是「原始」基线
        A = await pg.evaluate(TAG_AND_SNAP)
        R["A_off"] = {k: v for k, v in A.items() if k != "rows"}
        R["A_rowCount"] = len(A["rows"])
        R["A_replaced"] = sum(1 for x in A["rows"] if x["replaced"])
        await pg.screenshot(path=os.path.join(OUT, "aba-A-off.png"))

        await open_settings(pg)
        R["toOn"] = await set_toggle(pg, True)
        B = await pg.evaluate(TAG_AND_SNAP)
        R["B_on"] = {k: v for k, v in B.items() if k != "rows"}
        R["B_replaced"] = sum(1 for x in B["rows"] if x["replaced"])
        await pg.screenshot(path=os.path.join(OUT, "aba-B-on.png"))

        R["toOff"] = await set_toggle(pg, False)
        C = await pg.evaluate(TAG_AND_SNAP)
        R["C_off"] = {k: v for k, v in C.items() if k != "rows"}
        R["C_replaced"] = sum(1 for x in C["rows"] if x["replaced"])
        await pg.screenshot(path=os.path.join(OUT, "aba-C-off.png"))

        # 逐条比对 A 与 C：探针 id 相同的 svg，viewBox 必须逐字相同
        amap = {x["id"]: x for x in A["rows"]}
        cmap = {x["id"]: x for x in C["rows"]}
        shared = [i for i in amap if i in cmap]
        vbDiff = [{"id": i, "A": amap[i]["viewBox"], "C": cmap[i]["viewBox"]}
                  for i in shared if amap[i]["viewBox"] != cmap[i]["viewBox"]]
        hiddenDiff = [{"id": i, "A": amap[i]["hidden"], "C": cmap[i]["hidden"]}
                      for i in shared if amap[i]["hidden"] != cmap[i]["hidden"]]
        R["sharedProbes"] = len(shared)
        R["viewBoxDiffCount"] = len(vbDiff)
        R["viewBoxDiffSample"] = vbDiff[:6]
        R["hiddenDiffCount"] = len(hiddenDiff)
        R["C_restoredFully"] = (R["C_replaced"] == 0
                                and C["iconStyleTag"] is False
                                and all(x["hasGroup"] is False and x["hidden"] == 0 for x in C["rows"]))
        R["consoleErrors"] = errs[:20]
        await b.close()

    with open(os.path.join(OUT, "aba-result.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, ensure_ascii=False, indent=2)
    print(json.dumps(R, ensure_ascii=False, indent=2)[:5000])


asyncio.run(main())
