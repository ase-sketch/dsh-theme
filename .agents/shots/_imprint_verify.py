# -*- coding: utf-8 -*-
"""M13 压印层验收：真实隔离实例上跑，URL 由 DSH_IMPRINT_URL 注入。"""
import os, json
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ["DSH_IMPRINT_URL"]
OUT = Path(os.environ.get("DSH_IMPRINT_OUT", "E:/dsh-theme/.agents/shots"))
RESULTS, ERRORS = [], []

def rec(cid, name, ok, raw):
    RESULTS.append({"id": cid, "name": name, "pass": bool(ok), "raw": raw})
    print("[%s] %-4s %s | %s" % ("PASS" if ok else "FAIL", cid, name, json.dumps(raw, ensure_ascii=False)[:400]))

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    pg = b.new_context(viewport={"width": 1440, "height": 900}).new_page()
    pg.on("console", lambda m: ERRORS.append(m.text[:200]) if m.type == "error" and not m.text.startswith("Failed to load resource") else None)
    pg.on("pageerror", lambda e: ERRORS.append("pageerror:" + str(e)[:200]))
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(7500)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)

    rec("I01", "插件已挂主题属性", pg.evaluate("() => document.documentElement.hasAttribute('data-dsh-theme')"), pg.evaluate("() => document.documentElement.getAttribute('data-dsh-theme')"))
    paper = pg.evaluate("() => getComputedStyle(document.body).backgroundColor")
    rec("I02", "纸色（浅色 #F6F3EC）", paper == "rgb(246, 243, 236)", paper)

    hero = pg.evaluate("""() => {
      const clock = document.querySelector('.dsh-today-clock');
      const title = document.querySelector('.dsh-today-title');
      const intro = document.querySelector('.dsh-today-intro');
      const card = document.querySelector('[data-composer-card]');
      const cs = (el) => el ? getComputedStyle(el) : null;
      const k = intro ? getComputedStyle(intro, '::before') : null;
      return {
        clockFamily: clock ? cs(clock).fontFamily.split(',')[0] : null,
        clockSize: clock ? cs(clock).fontSize : null,
        titleFamily: title ? cs(title).fontFamily.split(',')[0] : null,
        titleSize: title ? cs(title).fontSize : null,
        kicker: k ? k.content : null,
        cardRadius: card ? cs(card).borderRadius : null,
        cardTop: card ? cs(card).borderTopWidth + ' ' + cs(card).borderTopColor : null,
      };
    }""")
    rec("I03", "报头时刻用 Georgia 96px", hero["clockFamily"] == "Georgia" and hero["clockSize"] == "96px", hero)
    rec("I04", "主标题思源宋体 72px", hero["titleFamily"] == '"Noto Serif SC"' and hero["titleSize"] == "72px", hero)
    rec("I05", "报头刊名小标存在", hero["kicker"] and "THE DAILY SHEET" in hero["kicker"], hero["kicker"])
    rec("I06", "输入卡零圆角 + 顶部墨线", hero["cardRadius"] == "0px" and hero["cardTop"].startswith("1px"), hero)

    nav = pg.evaluate("""() => { const r = document.querySelector('[class*=panelRow]'); if (!r) return null; const s = getComputedStyle(r, '::before'); return {content: s.content, family: s.fontFamily.split(',')[0], size: s.fontSize}; }""")
    rec("I07", "目录项带 Georgia 序号", bool(nav) and nav["family"] == "Georgia" and nav["size"] == "9px", nav)

    cal = pg.evaluate("""() => { const d = document.querySelector('.dsh-today-days'); if (!d) return null; const t = [...d.querySelectorAll('*')].find(e => e.textContent.trim() === '1'); return t ? {bg: getComputedStyle(t).backgroundColor, radius: getComputedStyle(t).borderRadius} : null; }""")
    rec("I08", "日历今日用墨块而非色块", bool(cal) and cal["bg"] in ("rgb(22, 19, 15)", "rgb(18, 17, 16)") and cal["radius"] == "0px", cal)

    pg.evaluate("() => document.body.setAttribute('data-ds-dark-theme','')")
    pg.wait_for_timeout(1200)
    dark = pg.evaluate("() => getComputedStyle(document.body).backgroundColor")
    rec("I09", "夜版纸色（#121110）", dark == "rgb(18, 17, 16)", dark)
    pg.screenshot(path=str(OUT / "m13-hero-dark.png"))
    pg.evaluate("() => document.body.removeAttribute('data-ds-dark-theme')")
    pg.wait_for_timeout(1000)
    pg.screenshot(path=str(OUT / "m13-hero-light.png"))

    rows = pg.locator("[class*='sessionRow']")
    opened = False
    for i in range(min(rows.count(), 10)):
        rows.nth(i).click(); pg.wait_for_timeout(1800)
        if pg.locator("[data-chat-flow-kind='turn-process']").count() > 0: opened = True; break
    pg.wait_for_timeout(2500)
    rec("I10", "打开含真实消息的会话", opened, {"rows": rows.count()})

    chat = pg.evaluate("""() => {
      const user = document.querySelector('[data-chat-flow-kind=user]');
      const md = document.querySelector('[data-chat-flow-kind^=assistant] [class*=markdown]');
      const bubble = user ? user.querySelector('[class*=bubble]') : null;
      const cs = (el) => el ? getComputedStyle(el) : null;
      return {
        gutter: user ? getComputedStyle(user, '::before').content : null,
        gutterFamily: user ? getComputedStyle(user, '::before').fontFamily.split(',')[0] : null,
        userGrid: user ? cs(user).gridTemplateColumns : null,
        bubbleBg: bubble ? cs(bubble).backgroundColor : null,
        mdFamily: md ? cs(md).fontFamily.split(',')[0] : null,
        mdSize: md ? cs(md).fontSize : null,
        mdLh: md ? cs(md).lineHeight : null,
      };
    }""")
    rec("I11", "用户消息带页边注（序号 + 你）", chat["gutterFamily"] == "Georgia" and ("你" in (chat["gutter"] or "")), chat)
    rec("I12", "用户消息不再有气泡底色", chat["bubbleBg"] in ("rgba(0, 0, 0, 0)", None), chat["bubbleBg"])
    rec("I13", "助手正文思源宋体 15.5/31", chat["mdFamily"] == '"Noto Serif SC"' and chat["mdSize"] == "15.5px" and chat["mdLh"] == "31px", {"family": chat["mdFamily"], "size": chat["mdSize"], "lh": chat["mdLh"]})

    tool = pg.evaluate("""() => { const t = document.querySelector('[data-tool]'); if (!t) return null; const s = getComputedStyle(t); return {family: s.fontFamily.split(',')[0], size: s.fontSize, border: s.borderBottomWidth}; }""")
    rec("I14", "工具行等宽小字", bool(tool) and tool["family"] == '"Cascadia Mono"', tool)

    pg.screenshot(path=str(OUT / "m13-chat-light.png"))
    pg.evaluate("() => document.body.setAttribute('data-ds-dark-theme','')")
    pg.wait_for_timeout(1200)
    pg.screenshot(path=str(OUT / "m13-chat-dark.png"))
    rec("I15", "console 零错误", len(ERRORS) == 0, ERRORS[:4])

    b.close()

passed = sum(1 for r in RESULTS if r["pass"])
report = {"total": len(RESULTS), "passed": passed, "results": RESULTS, "errors": ERRORS}
(OUT / "m13-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print("RESULT: %d/%d passed" % (passed, len(RESULTS)))
