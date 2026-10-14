# -*- coding: utf-8 -*-
"""Hook window.__ModuleLoader__ so we can inspect the live ClientModuleSystem.

add_init_script runs before the page's own inline bootstrap, so the property
setter catches the facade assignment and wraps create() to retain the returned
module system. Nothing in the tested artifact is modified.
"""
import sys, json, os
from playwright.sync_api import sync_playwright

url = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else "ms"
here = os.path.dirname(os.path.abspath(__file__))

INIT = r"""
(() => {
  let stored;
  Object.defineProperty(window, '__ModuleLoader__', {
    configurable: true,
    get() { return stored; },
    set(v) {
      if (v && typeof v.create === 'function') {
        const orig = v.create.bind(v);
        v.create = function (...args) {
          const ms = orig(...args);
          window.__MS__ = ms;
          return ms;
        };
      }
      stored = v;
    }
  });
})();
"""

EVAL = r"""() => {
  const ms = window.__MS__;
  if (!ms) return { hooked: false };
  const safe = (f) => { try { return f(); } catch (e) { return 'ERR: ' + String(e); } };
  const managed = safe(() => [...ms.entries.managed.entries()].map(([id, e]) => ({
      id,
      entryId: e.id,
      entryName: e.options && e.options.name,
      hasFiber: e.fiber !== undefined,
      fiberState: e.fiber === undefined ? null : e.fiber.state,
      fiberInertia: e.fiber === undefined ? null : (e.fiber.inertia !== undefined),
  })));
  const lc = safe(() => [...ms.loadCache.keys()]);
  const dt = safe(() => { const r = ms.loadCache.get('dsh-theme'); return r ? { keys: Object.keys(r.exports), styles: r.styles, edges: [...r.edges] } : null; });
  return {
    hooked: true,
    manifestIds: safe(() => ms.manifest.modules.map(r => r.id)),
    factoryIds: safe(() => [...ms.factories.keys()]),
    loadCacheIds: lc,
    dshThemeRecord: dt,
    importErrors: safe(() => [...ms.importErrors.entries()].map(([k, v]) => [k, String(v)])),
    syncFailures: safe(() => ms.entries.snapshot.failures),
    syncing: safe(() => ms.entries.snapshot.syncing),
    managed,
    graphRowDshTheme: safe(() => ms.graphRows.get('dsh-theme') || null),
    executedBundles: safe(() => [...ms.executedBundleUrls].length),
    failedBundles: safe(() => [...ms.failedBundleUrls]),
    htmlHasAttr: document.documentElement.hasAttribute('data-dsh-theme'),
    styleEl: !!document.getElementById('dsh-theme-style'),
    bodyBg: getComputedStyle(document.body).backgroundColor,
  };
}"""

logs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    pg.on("console", lambda m: logs.append("[%s] %s" % (m.type, m.text[:500])))
    pg.on("pageerror", lambda e: logs.append("[pageerror] " + str(e)[:500]))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    res = pg.evaluate(EVAL)
    pg.screenshot(path=os.path.join(here, label + ".png"))
    b.close()

with open(os.path.join(here, label + ".json"), "w", encoding="utf-8") as f:
    json.dump({"result": res, "console": logs}, f, ensure_ascii=False, indent=1)

print(json.dumps(res, ensure_ascii=False, indent=1))
print("== console ==")
for m in logs: print("  ", m)
