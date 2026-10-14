# -*- coding: utf-8 -*-
"""Hook both the module facade and the DOM primitives the probe uses.

Records: every <style> creation, every data-dsh-theme set/remove, every
Element.remove() of an element whose id is dsh-theme-style, and every
__ModuleLoader__.load registration. Nothing in the artifact is modified.
"""
import sys, json, os
from playwright.sync_api import sync_playwright

url = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else "ms2"
here = os.path.dirname(os.path.abspath(__file__))

INIT = r"""
(() => {
  const T0 = Date.now();
  window.__TRACE__ = [];
  const rec = (kind, extra) => window.__TRACE__.push(Object.assign({ t: Date.now() - T0, kind }, extra || {}));
  const stack = () => { try { return new Error().stack.split('\n').slice(1, 5).join(' | ').slice(0, 400); } catch (e) { return ''; } };

  // module facade hook
  let stored;
  Object.defineProperty(window, '__ModuleLoader__', {
    configurable: true,
    get() { return stored; },
    set(v) {
      if (v && typeof v.create === 'function') {
        const orig = v.create.bind(v);
        v.create = function (...args) { const ms = orig(...args); window.__MS__ = ms; rec('facade.create'); return ms; };
      }
      if (v && typeof v.load === 'function') {
        const origLoad = v.load.bind(v);
        v.load = function (reg) { rec('load', { id: reg && reg.id }); return origLoad(reg); };
      }
      stored = v;
    }
  });

  const origCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...rest) {
    const el = origCreate.call(this, tag, ...rest);
    if (String(tag).toLowerCase() === 'style') rec('createElement.style', { id: el.id, stack: stack() });
    return el;
  };
  const origSet = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name === 'data-dsh-theme') rec('setAttribute.data-dsh-theme', { stack: stack() });
    return origSet.call(this, name, value);
  };
  const origRemoveAttr = Element.prototype.removeAttribute;
  Element.prototype.removeAttribute = function (name) {
    if (name === 'data-dsh-theme') rec('removeAttribute.data-dsh-theme', { stack: stack() });
    return origRemoveAttr.call(this, name);
  };
  const origRemove = Element.prototype.remove;
  Element.prototype.remove = function () {
    if (this.id === 'dsh-theme-style' || (this.getAttribute && this.getAttribute('data-plugin') === 'dsh-theme')) {
      rec('element.remove', { id: this.id, dataPlugin: this.getAttribute('data-plugin'), stack: stack() });
    }
    return origRemove.call(this);
  };
})();
"""

EVAL = r"""() => {
  const ms = window.__MS__;
  const safe = (f) => { try { return f(); } catch (e) { return 'ERR: ' + String(e); } };
  const styles = [...document.querySelectorAll('style')].map(s => ({ id: s.id, dataPlugin: s.getAttribute('data-plugin'), len: s.textContent.length, hasProbe: s.textContent.indexOf('dsh-theme') >= 0 || s.textContent.indexOf('255 138 0') >= 0 }));
  return {
    trace: window.__TRACE__,
    htmlAttrs: [...document.documentElement.attributes].map(a => a.name),
    stylesInHead: styles,
    probeStyleText: (document.getElementById('dsh-theme-style') || {}).textContent || null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    ms: ms ? {
      revisions: safe(() => [...ms.entries.revisions.entries()]),
      managedDshTheme: safe(() => { const e = ms.entries.managed.get('dsh-theme'); return e ? { entryId: e.id, options: e.options, hasFiber: e.fiber !== undefined, state: e.fiber && e.fiber.state, fiberKeys: e.fiber ? Object.keys(e.fiber) : null, runtime: e.fiber && e.fiber.runtime ? String(e.fiber.runtime.callback).slice(0,200) : null } : null; }),
      dshThemeRecord: safe(() => { const r = ms.loadCache.get('dsh-theme'); return r ? { keys: Object.keys(r.exports), styles: r.styles } : null; }),
      syncFailures: safe(() => ms.entries.snapshot.failures),
      importErrors: safe(() => [...ms.importErrors.entries()].map(([k,v])=>[k,String(v)])),
    } : null,
  };
}"""

logs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    pg.on("console", lambda m: logs.append("[%s] %s" % (m.type, m.text[:400])))
    pg.on("pageerror", lambda e: logs.append("[pageerror] " + str(e)[:400]))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    res = pg.evaluate(EVAL)
    pg.screenshot(path=os.path.join(here, label + ".png"))
    b.close()

with open(os.path.join(here, label + ".json"), "w", encoding="utf-8") as f:
    json.dump({"result": res, "console": logs}, f, ensure_ascii=False, indent=1)

tr = res["trace"]
print("== trace (%d events) ==" % len(tr))
for e in tr:
    if e["kind"] == "load":
        if e.get("id") == "dsh-theme":
            print("  ", json.dumps(e, ensure_ascii=False))
    else:
        print("  ", json.dumps(e, ensure_ascii=False)[:520])
print("== load registrations total ==", sum(1 for e in tr if e["kind"] == "load"))
print("== htmlAttrs ==", res["htmlAttrs"])
print("== stylesInHead (dsh-theme relevant) ==")
for s in res["stylesInHead"]:
    if s["hasProbe"] or s["id"] == "dsh-theme-style" or s["dataPlugin"] == "dsh-theme":
        print("  ", s)
print("== probeStyleText ==", res["probeStyleText"])
print("== ms ==")
print(json.dumps(res["ms"], ensure_ascii=False, indent=1)[:3000])
print("== console ==")
for m in logs: print("  ", m)
