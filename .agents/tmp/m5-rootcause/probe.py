# -*- coding: utf-8 -*-
"""M5 root-cause probe: does the client half of a bundle plugin execute in the live page?

Usage: python probe.py <url> <label>
Writes <label>.json + <label>.png next to this file.
"""
import sys, json, os
from playwright.sync_api import sync_playwright

url = sys.argv[1]
label = sys.argv[2] if len(sys.argv) > 2 else "run"
here = os.path.dirname(os.path.abspath(__file__))

EVAL = r"""() => {
  const boot = window.__DSH_BOOT__ || null;
  const entries = boot ? boot.entries.map(r => ({id:r.id, url:r.url, rev:r.rev,
      inject:r.inject||[], external:r.external||[], immediately:!!r.immediately})) : null;
  const batches = boot ? boot.batches.map(b => ({phase:b.phase, url:b.url, entries:b.entries})) : null;
  const styleEl = document.getElementById('dsh-theme-style');
  const scripts = [...document.querySelectorAll('script[src]')].map(s => s.src);
  return {
    bootPresent: !!boot,
    bootRev: boot ? boot.rev : null,
    entryIds: entries ? entries.map(e => e.id) : null,
    dshThemeRow: entries ? (entries.find(e => e.id === 'dsh-theme') || null) : null,
    batches: batches,
    dshThemeInBatch: batches ? batches.some(b => b.entries.indexOf('dsh-theme') >= 0) : null,
    htmlHasAttr: document.documentElement.hasAttribute('data-dsh-theme'),
    styleElExists: !!styleEl,
    styleElText: styleEl ? styleEl.textContent.trim().slice(0,200) : null,
    bodyBg: getComputedStyle(document.body).backgroundColor,
    htmlBg: getComputedStyle(document.documentElement).backgroundColor,
    probeGlobal: (typeof window.__DTS_PROBE__ === 'undefined') ? null : window.__DTS_PROBE__,
    ctrlGlobal: (typeof window.__DTS_CTRL__ === 'undefined') ? null : window.__DTS_CTRL__,
    docTitle: document.title,
    loaderMode: window.__ModuleLoader__ ? window.__ModuleLoader__.mode : null,
    pluginScripts: scripts.filter(s => s.indexOf('/plugins/') >= 0),
  };
}"""

console_msgs, page_errors, failed_reqs, plugin_reqs = [], [], [], []
with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("console", lambda m: console_msgs.append("[%s] %s" % (m.type, m.text[:600])))
    pg.on("pageerror", lambda e: page_errors.append(str(e)[:800]))
    pg.on("requestfailed", lambda r: failed_reqs.append("%s :: %s" % (r.url, r.failure)))
    pg.on("response", lambda r: plugin_reqs.append("%s %s" % (r.status, r.url)) if "/plugins/" in r.url else None)
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(8000)
    try:
        pg.mouse.click(933, 577)   # dismiss the preview notice
    except Exception:
        pass
    pg.wait_for_timeout(1500)
    res = pg.evaluate(EVAL)
    pg.screenshot(path=os.path.join(here, label + ".png"))
    b.close()

out = {
    "label": label, "url": url,
    "probe": res,
    "console": console_msgs,
    "pageerrors": page_errors,
    "requestfailed": failed_reqs,
    "pluginResponses": plugin_reqs,
}
with open(os.path.join(here, label + ".json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print("== %s ==" % label)
print("bootPresent      :", res["bootPresent"], "rev=", res["bootRev"])
print("dshThemeInBatch  :", res["dshThemeInBatch"])
print("dshThemeRow      :", json.dumps(res["dshThemeRow"], ensure_ascii=False))
print("htmlHasAttr      :", res["htmlHasAttr"])
print("styleElExists    :", res["styleElExists"])
print("bodyBg           :", res["bodyBg"])
print("probeGlobal      :", res["probeGlobal"])
print("ctrlGlobal       :", res["ctrlGlobal"])
print("loaderMode       :", res["loaderMode"])
print("pluginScripts    :", len(res["pluginScripts"]))
print("pageerrors       :", page_errors[:3] if page_errors else "none")
errs = [m for m in console_msgs if m.startswith("[error]")]
print("console errors   :", len(errs))
for m in errs[:6]:
    print("   ", m)
print("warnings(dsh)    :")
for m in console_msgs:
    if m.startswith("[warning]") and ("dsh" in m or "module" in m or "plugin" in m):
        print("   ", m)
print("pluginResponses  :", plugin_reqs[:6])
