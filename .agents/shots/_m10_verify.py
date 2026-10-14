# -*- coding: utf-8 -*-
"""T10 编排方验收：M9 编辑台 v2 + Deepy 出格 + 拥挤/窄视口 + po06 回归。"""
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:19488/?token=<REDACTED>"
OUT = "E:/dsh-theme/.agents/shots"
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "pass": bool(ok)})
    print("[%s] %-4s %s | %s" % ("PASS" if ok else "FAIL", cid, name, json.dumps(raw, ensure_ascii=False)[:380]))

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

    # ① hero 态：3 行编辑区 92px + placeholder 衬线 + 布局结构
    s0 = pg.evaluate("""() => {
      const card = document.querySelector('[data-composer-card]');
      const scroll = document.querySelector('[class*=composerHero] [data-input-scroll]') || document.querySelector('[data-input-scroll]');
      const ph = card ? card.querySelector('[class*=placeholder]') : null;
      const trailing = card ? card.querySelector('[class*=trailing]') : null;
      const tools = card ? card.querySelector('[class*=tools]') : null;
      const pcs = ph ? getComputedStyle(ph) : null;
      const tcs = trailing ? getComputedStyle(trailing) : null;
      return { cardH: card ? Math.round(card.getBoundingClientRect().height) : null,
               editorH: scroll ? Math.round(scroll.getBoundingClientRect().height) : null,
               phFont: pcs ? pcs.fontFamily.slice(0,40) : null, phSize: pcs ? pcs.fontSize : null, phStyle: pcs ? pcs.fontStyle : null,
               trailingDir: tcs ? tcs.flexDirection : null,
               cardOverflow: card ? getComputedStyle(card).overflow : null,
               toolsNowrap: tools ? getComputedStyle(tools).flexWrap : null };
    }""")
    rec("A1", "hero 编辑区 92px（3 行）", s0["editorH"] is not None and abs(s0["editorH"]-92) < 2, s0["editorH"])
    rec("A2", "placeholder 衬线斜体大字", bool(s0["phFont"]) and "Palatino" in s0["phFont"] and s0["phStyle"] == "italic", {"f": s0["phFont"], "s": s0["phSize"], "i": s0["phStyle"]})
    rec("A3", "右簇竖排", s0["trailingDir"] == "column", s0["trailingDir"])
    rec("A4", "卡片 overflow visible（鲸鱼出格前提）", s0["cardOverflow"] == "visible", s0["cardOverflow"])
    pg.screenshot(path=OUT + "/m10-hero-empty.png")

    # ② 打字 → 发送键大圆朱砂 + 鲸鱼抬头（idle-look）
    ed = pg.query_selector('[contenteditable="true"]')
    ed.click(); pg.keyboard.type("测试打字联动", delay=30)
    pg.wait_for_timeout(900)
    s1 = pg.evaluate("""() => {
      const card = document.querySelector('[data-composer-card]');
      const send = card ? [...card.querySelectorAll('[class*=trailing] > [class*=primary]')].pop() : null;
      const sc = send ? getComputedStyle(send).scale : null;
      const sb = send ? getComputedStyle(send).backgroundColor : null;
      const deepy = document.querySelector('#dsh-theme-deepy');
      const sprite = deepy ? deepy.querySelector('.dsh-theme-deepy-sprite') : null;
      return { scale: sc, sendBg: sb, editing: deepy ? deepy.getAttribute('data-dsh-editing') : null,
               sprite: sprite ? (sprite.style.backgroundImage || getComputedStyle(sprite).backgroundImage).slice(-40) : null };
    }""")
    rec("B1", "filled 发送键放大（scale 1.18）", s1["scale"] and s1["scale"].startswith("1.18"), s1["scale"])
    rec("B2", "filled 发送键朱砂", s1["sendBg"] == "rgb(210, 62, 12)", s1["sendBg"])
    rec("B3", "打字 → 鲸鱼抬头（idle-look 素材）", bool(s1["sprite"]) and "idle-look" in s1["sprite"], s1["sprite"])
    pg.screenshot(path=OUT + "/m10-hero-typing.png")

    # ③ 长文 → 高度不动
    pg.keyboard.insert_text("长文。" * 300)
    pg.wait_for_timeout(600)
    s2 = pg.evaluate("""() => {
      const scroll = document.querySelector('[class*=composerHero] [data-input-scroll]') || document.querySelector('[data-input-scroll]');
      const card = document.querySelector('[data-composer-card]');
      return { editorH: scroll ? Math.round(scroll.getBoundingClientRect().height) : null,
               cardH: card ? Math.round(card.getBoundingClientRect().height) : null,
               canScroll: scroll ? scroll.scrollHeight > scroll.clientHeight : null };
    }""")
    rec("C1", "长文后编辑区仍 92px + 内滚", s2["editorH"] is not None and abs(s2["editorH"]-92) < 2 and s2["canScroll"], s2)
    pg.screenshot(path=OUT + "/m10-longtext.png")

    # ④ po06 面板回归（新布局下仍须在视口内）
    pg.evaluate("""() => { const e=document.querySelector('[contenteditable=true]'); e.focus(); }""")
    pg.keyboard.press("Control+a"); pg.keyboard.press("Backspace"); pg.wait_for_timeout(300)
    pg.evaluate("""() => { const b=[...document.querySelectorAll('button,[role=button],div,span')].find(x=>(x.textContent||'').trim()==='优化选项'); if(b) b.click(); }""")
    pg.wait_for_timeout(1200)
    panel = pg.evaluate("""() => {
      const vw = window.innerWidth; const out = [];
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && el.getBoundingClientRect().width > 200 && el.textContent.includes('档位')) {
          const r = el.getBoundingClientRect(); out.push({ right: Math.round(r.right), inView: r.right <= vw && r.left >= 0 });
        }
      });
      return out;
    }""")
    rec("P1", "po06 面板在新布局下完整在视口", len(panel) > 0 and all(x["inView"] for x in panel), panel)
    pg.screenshot(path=OUT + "/m10-po06.png")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(400)

    # ⑤ 窄视口 900px：工具条不折行
    await_promise = None
    pg.set_viewport_size({"width": 900, "height": 800})
    pg.wait_for_timeout(1000)
    s3 = pg.evaluate("""() => {
      const card = document.querySelector('[data-composer-card]');
      const tools = card ? card.querySelector('[class*=tools]') : null;
      const trailing = card ? card.querySelector('[class*=trailing]') : null;
      const th = tools ? Math.round(tools.getBoundingClientRect().height) : null;
      return { cardW: card ? Math.round(card.getBoundingClientRect().width) : null, toolsH: th, toolsCanScroll: tools ? tools.scrollWidth > tools.clientWidth : null };
    }""")
    rec("N1", "900px 视口：工具簇单行（高 ≤40px）", s3["toolsH"] is not None and s3["toolsH"] <= 40, s3)
    pg.screenshot(path=OUT + "/m10-narrow.png")
    pg.set_viewport_size({"width":1440,"height":900})
    pg.wait_for_timeout(600)

    # ⑥ 发送进活跃会话：主卡 76px + 单鲸
    ed3 = pg.query_selector('[contenteditable="true"]')
    ed3.click(); pg.keyboard.type("ping", delay=30); pg.keyboard.press("Enter")
    pg.wait_for_timeout(3500)
    s4 = pg.evaluate("""() => {
      const scroll = document.querySelector('[data-input-scroll]');
      return { mainH: scroll ? Math.round(scroll.getBoundingClientRect().height) : null,
               heroGone: !document.querySelector('#dsh-theme-deepy-hero'),
               mainBack: !!document.querySelector('#dsh-theme-deepy') };
    }""")
    rec("D1", "主卡 76px 档", s4["mainH"] is not None and abs(s4["mainH"]-76) < 2, s4["mainH"])
    rec("D2", "单鲸规则", s4["heroGone"] and s4["mainBack"], {"h": s4["heroGone"], "m": s4["mainBack"]})
    pg.screenshot(path=OUT + "/m10-active.png")

    rec("Z1", "console 零错", len(errs) == 0, errs[:3])
    b.close()

ok = sum(1 for r in RES if r["pass"])
print("\n=== %d/%d PASS ===" % (ok, len(RES)))
