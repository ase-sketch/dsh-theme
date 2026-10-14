# -*- coding: utf-8 -*-
"""M7 图标层：通过**真实设置面板**拨开关，验证 OFF 全量还原 / ON 重新替换。

跑法：PYTHONUTF8=1 python .agents/tmp/m7-icons/verify_icons_toggle.py <token-url>
"""
import asyncio, json, sys, os

URL = sys.argv[1]
OUT = os.path.dirname(os.path.abspath(__file__))

SNAPSHOT = """(() => {
  const all = [...document.querySelectorAll('svg')];
  return {
    svgTotal: all.length,
    svgReplaced: all.filter(s => s.hasAttribute('data-dsh-icon')).length,
    lucideGroups: document.querySelectorAll('g[data-dsh-icon-lucide]').length,
    hiddenMarkers: document.querySelectorAll('[data-dsh-icon-hidden]').length,
    hiddenStillDisplayNone: [...document.querySelectorAll('[data-dsh-icon-hidden]')].filter(e => getComputedStyle(e).display === 'none').length,
    iconStyleTag: !!document.getElementById('dsh-theme-icon-style'),
    statsAttr: document.documentElement.getAttribute('data-dsh-icons'),
    deepyHost: !!document.getElementById('dsh-theme-deepy'),
    deepyHero: !!document.getElementById('dsh-theme-deepy-hero'),
    deepyStyleTag: !!document.getElementById('dsh-theme-deepy-style'),
    rootAttr: document.documentElement.hasAttribute('data-dsh-theme'),
  };
})()"""

# 给每个 svg 打探针 id 并记下替换前的 viewBox，供 OFF 后逐条比对
TAG = """(() => {
  const all = [...document.querySelectorAll('svg')];
  return all.map((s, i) => {
    s.setAttribute('data-probe-id', String(i));
    return { id: i, viewBox: s.getAttribute('viewBox'), replaced: s.hasAttribute('data-dsh-icon') };
  });
})()"""

VERIFY_RESTORE = """(() => {
  const all = [...document.querySelectorAll('svg')];
  const bad = [];
  for (const s of all) {
    const id = s.getAttribute('data-probe-id');
    if (id === null) { bad.push({ id: null, why: 'probe-id 丢失（svg 被 React 重建）' }); continue; }
    if (s.hasAttribute('data-dsh-icon')) bad.push({ id, why: '仍带 data-dsh-icon' });
    if (s.querySelector('g[data-dsh-icon-lucide]')) bad.push({ id, why: '仍有 Lucide 注入节点' });
    if (s.querySelector('[data-dsh-icon-hidden]')) bad.push({ id, why: '仍有隐藏标记' });
  }
  return {
    badCount: bad.length,
    badSample: bad.slice(0, 8),
    leftoverGroups: document.querySelectorAll('g[data-dsh-icon-lucide]').length,
    leftoverMarkers: document.querySelectorAll('[data-dsh-icon-hidden]').length,
    leftoverAttr: document.querySelectorAll('svg[data-dsh-icon]').length,
    iconStyleTag: !!document.getElementById('dsh-theme-icon-style'),
  };
})()"""

# OFF 后逐条比对 viewBox 是否回到替换前的值
VIEWBOX_DIFF = """(() => {
  const all = [...document.querySelectorAll('svg')];
  const out = [];
  for (const s of all) {
    const id = s.getAttribute('data-probe-id');
    out.push({ id, viewBox: s.getAttribute('viewBox') });
  }
  return out;
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
        await pg.wait_for_timeout(2600)
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

        R["on"] = await pg.evaluate(SNAPSHOT)
        baseline = await pg.evaluate(TAG)
        R["baselineReplaced"] = sum(1 for x in baseline if x["replaced"])
        await pg.screenshot(path=os.path.join(OUT, "toggle-on.png"))

        await open_settings(pg)
        R["toggleOff"] = await set_toggle(pg, False)
        R["offSnapshot"] = await pg.evaluate(SNAPSHOT)
        R["offRestore"] = await pg.evaluate(VERIFY_RESTORE)
        after = await pg.evaluate(VIEWBOX_DIFF)
        byid = {x["id"]: x["viewBox"] for x in after if x["id"] is not None}
        diff = []
        for row in baseline:
            if not row["replaced"]:
                continue
            now = byid.get(str(row["id"]), "__gone__")
            if now != row["viewBox"]:
                diff.append({"id": row["id"], "before": row["viewBox"], "after": now})
        R["viewBoxMismatch"] = diff[:10]
        R["viewBoxMismatchCount"] = len(diff)
        await pg.screenshot(path=os.path.join(OUT, "toggle-off.png"))

        R["toggleOn"] = await set_toggle(pg, True)
        R["on2Snapshot"] = await pg.evaluate(SNAPSHOT)
        await pg.screenshot(path=os.path.join(OUT, "toggle-on2.png"))

        R["consoleErrors"] = errs[:20]
        await b.close()

    with open(os.path.join(OUT, "toggle-result.json"), "w", encoding="utf-8") as f:
        json.dump(R, f, ensure_ascii=False, indent=2)
    print(json.dumps(R, ensure_ascii=False, indent=2)[:7000])


asyncio.run(main())
