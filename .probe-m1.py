
import json, sys
from playwright.sync_api import sync_playwright

console_msgs = []
reqs = []

with sync_playwright() as p:
    browser = p.chromium.launch(channel="msedge", headless=True)
    page = browser.new_page()
    page.on("console", lambda m: console_msgs.append(f"[{m.type}] {m.text[:300]}"))
    page.on("pageerror", lambda e: console_msgs.append(f"[pageerror] {str(e)[:300]}"))
    page.on("request", lambda r: reqs.append(r.url) if ("dsh-theme" in r.url or "plugins/" in r.url) else None)
    try:
        page.goto("http://127.0.0.1:19387", wait_until="domcontentloaded", timeout=20000)
    except Exception as e:
        print("GOTO_ERROR:", e)
    page.wait_for_timeout(5000)
    print("FINAL_URL:", page.url)
    print("TITLE:", page.title())
    checks = page.evaluate("""() => ({
        hasAttr: document.documentElement.hasAttribute('data-dsh-theme'),
        attrValue: document.documentElement.getAttribute('data-dsh-theme'),
        styleEl: !!document.getElementById('dsh-theme-style'),
        styleElContent: (document.getElementById('dsh-theme-style')||{}).textContent || null,
        bodyBg: getComputedStyle(document.body).backgroundColor,
        hasModuleLoader: typeof window.__ModuleLoader__ !== 'undefined',
        mlKeys: (typeof window.__ModuleLoader__ !== 'undefined') ? Object.keys(window.__ModuleLoader__) : null,
        titleProbe: document.title
    })""")
    print("CHECKS:", json.dumps(checks, ensure_ascii=False, indent=1))
    # try to inspect module loader records if possible
    ml = page.evaluate("""() => {
        const ml = window.__ModuleLoader__;
        if (!ml) return null;
        const out = {};
        for (const k of Object.keys(ml)) {
            const v = ml[k];
            out[k] = typeof v === 'function' ? 'function' : (v && typeof v === 'object' ? Object.keys(v).slice(0,20) : String(v).slice(0,100));
        }
        return out;
    }""")
    print("MODULELOADER:", json.dumps(ml, ensure_ascii=False, indent=1))
    print("REQS:", json.dumps(reqs[:20], indent=1))
    print("CONSOLE:", json.dumps(console_msgs[:30], ensure_ascii=False, indent=1))
    browser.close()
