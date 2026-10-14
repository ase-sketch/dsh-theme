# -*- coding: utf-8 -*-
"""T8 复测（修正版）：封面叠印 / 双档输入卡 / 熄灯双向 / 回归。"""
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:19488/?token=<REDACTED>"
OUT = "E:/dsh-theme/.agents/shots"
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": bool(ok), "raw": raw})
    print("[%s] %-4s %s | %s" % ("PASS" if ok else "FAIL", cid, name, json.dumps(raw, ensure_ascii=False)[:400]))

errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    pg = b.new_context(viewport={"width":1440,"height":900}).new_page()
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("pageerror:" + str(e)[:200]))
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)

    # 封面无叠印：kicker/colophon/headline 的包围盒互不重叠
    cover = pg.evaluate("""() => {
      const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return {t:b.top,b:b.bottom,h:b.height}; };
      const k = r('.dsh-hero-kicker'), c = r('.dsh-hero-colophon'), h = r('[data-conversation-region=chat] [class*="headline"]');
      const overlap = (a,b2) => a && b2 && a.b > b2.t && b2.b > a.t;
      return { k, c, h, kOverH: overlap(k,h), cOverH: overlap(c,h) };
    }""")
    rec("S1", "封面三层与大标题无纵向叠印", cover["k"] and cover["c"] and cover["h"] and not cover["kOverH"] and not cover["cOverH"], cover)
    pg.screenshot(path=OUT + "/m8-cover-fixed.png")

    # hero 输入卡固定 52px
    h_before = pg.evaluate("() => { const c = document.querySelector('[class*=composerHero] [data-input-scroll]') || document.querySelector('[data-input-scroll]'); return c ? c.getBoundingClientRect().height : null; }")
    ed = pg.query_selector('[contenteditable="true"]')
    ed.click()
    pg.keyboard.insert_text("测试文本。" * 100)
    pg.wait_for_timeout(800)
    h_after = pg.evaluate("() => { const c = document.querySelector('[class*=composerHero] [data-input-scroll]') || document.querySelector('[data-input-scroll]'); return c ? { h: c.getBoundingClientRect().height, canScroll: c.scrollHeight > c.clientHeight } : null; }")
    rec("C1", "hero 输入卡锁 52px 且内滚", h_before is not None and h_after and abs(h_after["h"] - 52) < 2 and abs(h_before - 52) < 2 and h_after["canScroll"], { "before": h_before, "after": h_after })
    pg.screenshot(path=OUT + "/m8-composer-hero-fixed.png")
    pg.evaluate("() => { const e = document.querySelector('[contenteditable=true]'); e.textContent=''; e.dispatchEvent(new InputEvent('input',{bubbles:true})); }")

    # 激活会话 → 主输入卡 36px
    ed.click(); pg.keyboard.type("ping", delay=30); pg.keyboard.press("Enter")
    pg.wait_for_timeout(2500)
    pg.evaluate("""() => { const items=[...document.querySelectorAll('[class*="sessionRow"]')]; if(items.length) items[0].click(); }""")
    pg.wait_for_timeout(2000)
    a_before = pg.evaluate("() => { const c = document.querySelector('[data-conversation-region=chat] [data-input-scroll]') || document.querySelector('[data-input-scroll]'); return c ? c.getBoundingClientRect().height : null; }")
    ed2 = pg.query_selector('[contenteditable="true"]')
    if ed2:
        ed2.click(); pg.keyboard.insert_text("长文本。" * 150); pg.wait_for_timeout(800)
    a_after = pg.evaluate("() => { const c = document.querySelector('[data-conversation-region=chat] [data-input-scroll]') || document.querySelector('[data-input-scroll]'); return c ? { h: c.getBoundingClientRect().height, canScroll: c.scrollHeight > c.clientHeight } : null; }")
    rec("C2", "主输入卡锁 36px 且内滚", a_before is not None and a_after and abs(a_after["h"] - 36) < 2 and a_after["canScroll"], { "before": a_before, "after": a_after })
    pg.screenshot(path=OUT + "/m8-composer-main-fixed.png")

    # 熄灯双向（themeCube 控件）
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button,[role=button]')].find(x=>/设置|Settings/i.test(x.getAttribute('aria-label')||x.textContent||'')); if(b) b.click(); }""")
    pg.wait_for_timeout(2000)
    clicked = pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='深色'); if(b){b.click();return true;} return false; }""")
    pg.wait_for_timeout(150)
    mid1 = pg.evaluate("""() => { const w = document.querySelector('#dsh-theme-wipe'); return w ? w.getAttribute('data-dsh-wipe') : null; }""")
    pg.screenshot(path=OUT + "/m8-wipe-mid.png")
    pg.wait_for_timeout(1500)
    d1 = pg.evaluate("""() => ({ dark: document.body.hasAttribute('data-ds-dark-theme'), bg: getComputedStyle(document.body).backgroundColor, gone: !document.querySelector('#dsh-theme-wipe') })""")
    rec("W1", "熄灯 lights-out 中间帧", clicked and mid1 == "lights-out", {"clicked": clicked, "mid1": mid1})
    rec("W2", "深空底到位且 overlay 已撤", d1["dark"] and d1["bg"] == "rgb(11, 13, 20)" and d1["gone"], d1)
    pg.screenshot(path=OUT + "/m8-dark.png")
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').trim()==='浅色'); if(b) b.click(); }""")
    pg.wait_for_timeout(150)
    mid2 = pg.evaluate("""() => { const w = document.querySelector('#dsh-theme-wipe'); return w ? w.getAttribute('data-dsh-wipe') : null; }""")
    pg.wait_for_timeout(1500)
    d2 = pg.evaluate("""() => ({ dark: document.body.hasAttribute('data-ds-dark-theme'), bg: getComputedStyle(document.body).backgroundColor, gone: !document.querySelector('#dsh-theme-wipe') })""")
    rec("W3", "开灯 lights-on 中间帧", mid2 == "lights-on", mid2)
    rec("W4", "回到浅纸底", (not d2["dark"]) and d2["bg"] == "rgb(245, 241, 232)" and d2["gone"], d2)

    rec("Z1", "console 零错", len(errs) == 0, errs[:3])
    b.close()

ok = sum(1 for r in RES if r["pass"])
print("\n=== %d/%d PASS ===" % (ok, len(RES)))
