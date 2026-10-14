# -*- coding: utf-8 -*-
"""T8 编排方验收：M8 全部特性 + M7 回归。同一页面实例读回。"""
import json, time
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:19488/?token=<REDACTED>"
OUT = "E:/dsh-theme/.agents/shots"
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": bool(ok), "raw": raw})
    print("[%s] %-4s %s" % ("PASS" if ok else "FAIL", cid, name))
    print("      raw: %s" % json.dumps(raw, ensure_ascii=False)[:500])

errs = []
with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("console", lambda m: errs.append(m.text[:200]) if m.type == "error" else None)
    pg.on("pageerror", lambda e: errs.append("pageerror:" + str(e)[:200]))
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2500)

    # ── 场面一：hero 封面 ──
    cover = pg.evaluate("""() => {
      const k = document.querySelector('.dsh-hero-kicker');
      const c = document.querySelector('.dsh-hero-colophon');
      const hero = document.querySelector('#dsh-theme-deepy-hero');
      const headline = document.querySelector('[data-conversation-region="chat"] [class*="headline"]');
      const hcs = headline ? getComputedStyle(headline) : null;
      return { kicker: k ? k.textContent : null, colophon: c ? c.textContent : null,
               heroDeepy: !!hero, headlineFont: hcs ? hcs.fontFamily.slice(0,60) : null,
               headlineSize: hcs ? hcs.fontSize : null,
               bodyBg: getComputedStyle(document.body).backgroundColor,
               icons: document.documentElement.getAttribute('data-dsh-icons') };
    }""")
    rec("S1", "封面刊号行", cover["kicker"] and "DEEP SPACE" in cover["kicker"], cover["kicker"])
    rec("S2", "封面版记行", bool(cover["colophon"]), cover["colophon"])
    rec("S3", "hero 迎宾鲸在场", cover["heroDeepy"] is True, cover["heroDeepy"])
    rec("S4", "hero 大标题衬线化", bool(cover["headlineFont"]) and "Palatino" in (cover["headlineFont"] or ""), cover["headlineFont"])
    rec("S5", "M7 回归：浅纸底+图标层", cover["bodyBg"] == "rgb(245, 241, 232)" and "applied=" in (cover["icons"] or ""), {"bg": cover["bodyBg"], "icons": cover["icons"]})
    pg.screenshot(path=OUT + "/m8-cover-light.png")

    # ── 输入卡固定尺寸 ──
    ed = pg.query_selector('[contenteditable="true"]')
    h1 = pg.evaluate("""() => { const c = document.querySelector('[data-input-scroll]'); return c ? c.getBoundingClientRect().height : null; }""")
    ed.click()
    long_text = "这是一段测试文本。" * 60  # 约 480 字
    pg.keyboard.insert_text(long_text)
    pg.wait_for_timeout(800)
    h2 = pg.evaluate("""() => { const c = document.querySelector('[data-input-scroll]'); const card = document.querySelector('[data-composer-card]') || document.querySelector('[class*="composerHero"]'); return { scroll: c ? c.getBoundingClientRect().height : null, scrollTop: c ? c.scrollTop : -1, canScroll: c ? c.scrollHeight > c.clientHeight : null }; }""")
    pg.screenshot(path=OUT + "/m8-composer-fixed.png")
    rec("C1", "输入区固定 36px（长文输入后不变）", h1 is not None and h2["scroll"] == h1 and abs(h1 - 36) < 2, {"before": h1, "after": h2["scroll"]})
    rec("C2", "长文在内部滚动（scrollHeight>clientHeight）", h2["canScroll"] is True, h2)
    pg.evaluate("""() => { const ed = document.querySelector('[contenteditable="true"]'); ed.textContent=''; ed.dispatchEvent(new InputEvent('input',{bubbles:true})); }""")

    # ── 发送消息：会话激活 + 流态 ──
    ed.click(); pg.keyboard.type("ping", delay=30); pg.keyboard.press("Enter")
    pg.wait_for_timeout(1500)
    mid = pg.evaluate("""() => ({
      streaming: document.querySelector('[data-conversation-content]') ? document.querySelector('[data-conversation-content]').getAttribute('data-dsh-streaming') : 'NO-CONTAINER',
      heroGone: !document.querySelector('#dsh-theme-deepy-hero'),
      mainBack: !!document.querySelector('#dsh-theme-deepy'),
      colWidth: (() => { const c = document.querySelector('[data-conversation-region="chat"] [class*="column"][data-chat-flow]'); return c ? getComputedStyle(c).maxWidth : null; })(),
    })""")
    print("      [发送后 1.5s]", json.dumps(mid, ensure_ascii=False))
    rec("F1", "会话激活：hero 退 / 主位回（单鲸）", mid["heroGone"] is True and mid["mainBack"] is True, {"heroGone": mid["heroGone"], "main": mid["mainBack"]})
    rec("F2", "版心 720px", mid["colWidth"] == "720px", mid["colWidth"])
    rec("F3", "流态钩子 data-dsh-streaming", mid["streaming"] in ("", "true"), mid["streaming"])
    if mid["streaming"] in ("", "true"):
        pg.screenshot(path=OUT + "/m8-streaming.png")
    pg.wait_for_timeout(12000)
    end = pg.evaluate("""() => ({
      streaming: document.querySelector('[data-conversation-content]') ? document.querySelector('[data-conversation-content]').getAttribute('data-dsh-streaming') : 'NO-CONTAINER',
      bodyHasError: document.body.innerText.includes('不可用') || document.body.innerText.includes('MISSING'),
      hairline: !!document.querySelector('[data-chat-flow-kind="user"]'),
      tools: document.querySelectorAll('[data-tool]').length,
      scrollW: (() => { const el = document.querySelector('[data-conversation-scroll]'); return el ? getComputedStyle(el).scrollbarWidth || 'css' : null; })(),
    })""")
    rec("F4", "回合结束流态摘除", end["streaming"] is None, end["streaming"])
    print("      [回合末]", json.dumps(end, ensure_ascii=False))
    pg.screenshot(path=OUT + "/m8-conversation.png")

    # ── 熄灯仪式：设置 → 深色，抓中间帧 ──
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button,[role=button]')].find(x=>/设置|Settings/i.test(x.getAttribute('aria-label')||x.textContent||'')); if(b) b.click(); }""")
    pg.wait_for_timeout(2000)
    darkBtn = pg.evaluate("""() => { const els=[...document.querySelectorAll('*')].filter(x=>x.children.length===0 && x.textContent==='深色'); if(els.length){els[0].click();return true;} return false; }""")
    pg.wait_for_timeout(150)  # 擦除中段
    mid_wipe = pg.evaluate("""() => { const w = document.querySelector('#dsh-theme-wipe'); return w ? { exists: true, dir: w.getAttribute('data-dsh-wipe') } : { exists: false }; }""")
    pg.screenshot(path=OUT + "/m8-wipe-mid.png")
    pg.wait_for_timeout(1200)
    after = pg.evaluate("""() => ({ dark: document.body.hasAttribute('data-ds-dark-theme'), bg: getComputedStyle(document.body).backgroundColor, wipeGone: !document.querySelector('#dsh-theme-wipe') })""")
    pg.screenshot(path=OUT + "/m8-dark.png")
    rec("W1", "熄灯中间帧 overlay 在场且方向=lights-out", mid_wipe.get("exists") is True and mid_wipe.get("dir") == "lights-out", mid_wipe)
    rec("W2", "擦除结束 overlay 移除 + 深空底", after["dark"] is True and after["wipeGone"] is True and after["bg"] == "rgb(11, 13, 20)", after)
    # 开灯（回浅色）
    lightBtn = pg.evaluate("""() => { const els=[...document.querySelectorAll('*')].filter(x=>x.children.length===0 && x.textContent==='浅色'); if(els.length){els[0].click();return true;} return false; }""")
    pg.wait_for_timeout(150)
    mid_wipe2 = pg.evaluate("""() => { const w = document.querySelector('#dsh-theme-wipe'); return w ? { exists: true, dir: w.getAttribute('data-dsh-wipe') } : { exists: false }; }""")
    pg.wait_for_timeout(1200)
    after2 = pg.evaluate("""() => ({ dark: document.body.hasAttribute('data-ds-dark-theme'), bg: getComputedStyle(document.body).backgroundColor, wipeGone: !document.querySelector('#dsh-theme-wipe') })""")
    rec("W3", "开灯反向擦除 lights-on", mid_wipe2.get("exists") is True and mid_wipe2.get("dir") == "lights-on", mid_wipe2)
    rec("W4", "回到浅纸底", after2["dark"] is False and after2["bg"] == "rgb(245, 241, 232)" and after2["wipeGone"], after2)
    pg.screenshot(path=OUT + "/m8-back-light.png")

    rec("Z1", "console 零错", len(errs) == 0, errs[:3])
    b.close()

ok = sum(1 for r in RES if r["pass"])
print("\n=== %d/%d PASS ===" % (ok, len(RES)))
with open("E:/dsh-theme/.agents/tmp/m7-t8-result.json", "w", encoding="utf-8") as f:
    json.dump(RES, f, ensure_ascii=False, indent=1)
