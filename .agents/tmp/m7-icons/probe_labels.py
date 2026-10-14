# -*- coding: utf-8 -*-
import asyncio, json, sys, os
URL = sys.argv[1]; OUT = os.path.dirname(os.path.abspath(__file__))
JS = """(() => {
  const all = [...document.querySelectorAll('svg')];
  const label = (el) => {
    let cur = el;
    for (let i = 0; i < 6 && cur; i++) {
      const t = cur.getAttribute && (cur.getAttribute('aria-label') || cur.getAttribute('title') || cur.getAttribute('data-slot'));
      if (t) return t;
      const txt = (cur.textContent || '').trim();
      if (txt && txt.length < 14) return 'text:' + txt;
      cur = cur.parentElement;
    }
    return '(no-label)';
  };
  return all.map(s => ({
    name: s.getAttribute('data-dsh-icon'),
    replaced: s.hasAttribute('data-dsh-icon'),
    vb: s.getAttribute('viewBox'),
    label: label(s.parentElement || s),
  }));
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
        rows = await pg.evaluate(JS)
        seen = {}
        for r in rows:
            key = (r['name'] or 'UNREPLACED')
            seen.setdefault(key, []).append(r['label'])
        for k in sorted(seen):
            print(k, '->', sorted(set(seen[k]))[:6], 'x' + str(len(seen[k])))
        with open(os.path.join(OUT, 'icon-labels.json'), 'w', encoding='utf-8') as f:
            json.dump(rows, f, ensure_ascii=False, indent=2)
        await b.close()
asyncio.run(main())
