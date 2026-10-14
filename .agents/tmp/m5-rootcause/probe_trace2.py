# -*- coding: utf-8 -*-
import sys, json, os
from playwright.sync_api import sync_playwright
url = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else "trace2"
here = os.path.dirname(os.path.abspath(__file__))

INIT = r"""
(() => {
  const T0 = Date.now();
  window.__TRACE__ = [];
  const rec = (kind, extra) => window.__TRACE__.push(Object.assign({ t: Date.now() - T0, kind }, extra || {}));
  const stack = () => { try { return new Error().stack.split('\n').slice(1, 26).join('\n'); } catch (e) { return ''; } };
  const short = (s) => s.split('\n').map(l => l.replace(/https?:\/\/[^ )]*\/plugins\/\?\?[^ )]*/g, '<COMBO>').replace(/https?:\/\/[^ )]*/g, '<URL>')).join('\n');

  let stored;
  Object.defineProperty(window, '__ModuleLoader__', {
    configurable: true,
    get() { return stored; },
    set(v) {
      if (v && typeof v.create === 'function') {
        const orig = v.create.bind(v);
        v.create = function (...args) { const ms = orig(...args); window.__MS__ = ms; return ms; };
      }
      stored = v;
    }
  });

  const origCreate = Document.prototype.createElement;
  Document.prototype.createElement = function (tag, ...rest) {
    const el = origCreate.call(this, tag, ...rest);
    if (String(tag).toLowerCase() === 'style') {
      const st = short(stack());
      if (st.indexOf('dsh-theme') >= 0 || /\bapply\b/.test(st.split('\n')[1] || '')) rec('createElement.style', { stack: st });
    }
    return el;
  };
  const origSet = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name === 'data-dsh-theme') rec('setAttribute.data-dsh-theme', { stack: short(stack()) });
    return origSet.call(this, name, value);
  };
  const origRemoveAttr = Element.prototype.removeAttribute;
  Element.prototype.removeAttribute = function (name) {
    if (name === 'data-dsh-theme') rec('removeAttribute.data-dsh-theme', { stack: short(stack()) });
    return origRemoveAttr.call(this, name);
  };
  const origRemove = Element.prototype.remove;
  Element.prototype.remove = function () {
    if (this.id === 'dsh-theme-style' || (this.getAttribute && this.getAttribute('data-plugin') === 'dsh-theme')) {
      rec('element.remove', { id: this.id, dataPlugin: this.getAttribute('data-plugin'), parent: this.parentNode ? this.parentNode.tagName : null, stack: short(stack()) });
    }
    return origRemove.call(this);
  };
})();
"""

EVAL = r"""() => ({ trace: window.__TRACE__, htmlAttrs: [...document.documentElement.attributes].map(a=>a.name), styleEl: !!document.getElementById('dsh-theme-style') })"""

logs = []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script(INIT)
    pg = ctx.new_page()
    pg.on("console", lambda m: logs.append("[%s] %s" % (m.type, m.text[:400])))
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(9000)
    res = pg.evaluate(EVAL)
    b.close()

with open(os.path.join(here, label + ".json"), "w", encoding="utf-8") as f:
    json.dump({"result": res, "console": logs}, f, ensure_ascii=False, indent=1)

print("trace events:", len(res["trace"]))
for e in res["trace"]:
    print("\n---- %s  t=%s ----" % (e["kind"], e["t"]))
    print(e.get("stack", ""))
print("\nhtmlAttrs:", res["htmlAttrs"], "styleEl:", res["styleEl"])
print("console:", logs)
