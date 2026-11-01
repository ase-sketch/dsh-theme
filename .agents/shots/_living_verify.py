# -*- coding: utf-8 -*-
"""M12 活字剧场真实聊天区验收；URL 通过 DSH_LIVING_URL 注入。"""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ["DSH_LIVING_URL"]
OUT = Path(os.environ.get("DSH_LIVING_OUT", "E:/dsh-theme/.dsh-tmp/living"))
OUT.mkdir(parents=True, exist_ok=True)
RESULTS = []
ERRORS = []
HTTP_ERRORS = []
ENV_ERRORS = []

def rec(cid, name, ok, raw):
    RESULTS.append({"id": cid, "name": name, "pass": bool(ok), "raw": raw})
    print("[%s] %-4s %s | %s" % ("PASS" if ok else "FAIL", cid, name, json.dumps(raw, ensure_ascii=False)[:600]))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
    # 资源错误统一由 response 的 URL 归因，避免 console 与网络日志重复计数。
    page.on("console", lambda msg: ERRORS.append(msg.text[:300]) if msg.type == "error" and not msg.text.startswith("Failed to load resource:") else None)
    page.on("pageerror", lambda err: ERRORS.append("pageerror:" + str(err)[:300]))
    def track_response(res):
        if res.status < 400:
            return
        target = ENV_ERRORS if "/api/changes.summary" in res.url else HTTP_ERRORS
        target.append(str(res.status) + " " + res.url)
    page.on("response", track_response)
    try:
        page.goto(URL, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(7000)
        try:
            page.mouse.click(933, 577)
        except Exception:
            pass
        expand = page.get_by_role("button", name="展开其余")
        if expand.count() > 0:
            expand.first.click()
            page.wait_for_timeout(1200)
        rows = page.locator("[class*='sessionRow']")
        found = False
        for index in range(min(rows.count(), 10)):
            rows.nth(index).click()
            page.wait_for_timeout(1800)
            if page.locator("[data-chat-flow-kind='turn-process']").count() > 0:
                found = True
                break
        rec("L01", "打开含真实助手消息的会话", found, {"sessions": rows.count(), "turns": page.locator("[data-chat-flow-kind='turn-process']").count()})
        page.wait_for_timeout(2500)

        scene = page.evaluate("""() => { const chat=document.querySelector('[data-conversation-region=chat]'); return {background:getComputedStyle(chat).backgroundImage, label:chat.getAttribute('data-dsh-scene-label'), before:getComputedStyle(chat,'::before').content}; }""")
        rec("L02", "聊天区使用沉浸场景而非网格", "repeating-linear-gradient" not in scene["background"] and "radial-gradient" in scene["background"], scene)

        typography = page.evaluate("""() => { const el=document.querySelector('[data-chat-flow-kind^=assistant] [class*=markdown]'); const cs=getComputedStyle(el); return {fontSize:cs.fontSize,lineHeight:cs.lineHeight}; }""")
        rec("L03", "助手正文采用章节阅读排版", typography["fontSize"] == "16px" and typography["lineHeight"] == "28px", typography)

        user = page.evaluate("""() => { const el=document.querySelector('[data-chat-flow-kind=user]'); const cs=getComputedStyle(el); const r=el.getBoundingClientRect(); const parent=el.parentElement.getBoundingClientRect(); return {border:cs.borderLeftWidth,maxWidth:cs.maxWidth,width:r.width,parentWidth:parent.width,background:cs.backgroundImage}; }""")
        rec("L04", "用户消息是缩进导演批注而非气泡", user["border"] == "2px" and user["maxWidth"] == "672px" and "linear-gradient" in user["background"], user)

        tool = page.evaluate("""() => { const el=document.querySelector('[data-tool]'); if(!el)return null; const before=getComputedStyle(el,'::before'); const after=getComputedStyle(el,'::after'); return {state:el.getAttribute('data-state'),railWidth:before.width,railColor:before.backgroundColor,done:after.display}; }""")
        rec("L05", "工具调用使用真实状态轨", bool(tool) and tool["railWidth"] == "2px" and tool["done"] == "none", tool)
        if page.locator("[data-tool]").count() > 0:
            page.locator("[data-tool]").first.scroll_into_view_if_needed()
            page.wait_for_timeout(600)
            page.screenshot(path=str(OUT / "living-tools.png"), full_page=True)

        page.mouse.wheel(0, 500)
        page.wait_for_timeout(500)
        page.mouse.wheel(0, -500)
        page.wait_for_timeout(800)
        flow = page.evaluate("""() => { const item=[...document.querySelectorAll('.dsh-flow-in')].find(el=>el.querySelector('p,h1,h2,h3,blockquote')); if(!item)return null; const leaf=item.querySelector('p,h1,h2,h3,blockquote'); return {className:item.className,leafAnimation:leaf?getComputedStyle(leaf).animationName:null}; }""")
        rec("L06", "滚动动效落在文字叶子", bool(flow) and flow["leafAnimation"] == "dsh-theme-flow-leaf", flow)

        card = page.locator("[data-composer-card]").first
        page.evaluate("""() => { if (document.activeElement && typeof document.activeElement.blur === 'function') document.activeElement.blur(); }""")
        page.wait_for_timeout(250)
        before_border = card.evaluate("el => getComputedStyle(el).borderTopColor")
        page.locator("[contenteditable='true']").first.click()
        page.wait_for_timeout(400)
        after_border = card.evaluate("el => getComputedStyle(el).borderTopColor")
        rec("L07", "输入聚焦只改变场景边缘", before_border != after_border, {"before": before_border, "after": after_border})
        page.screenshot(path=str(OUT / "living-light.png"), full_page=True)

        page.evaluate("""() => { document.body.setAttribute('data-ds-dark-theme',''); }""")
        page.wait_for_timeout(800)
        dark_bg = page.evaluate("""() => getComputedStyle(document.body).backgroundColor""")
        rec("L08", "深色聊天场景实渲染", dark_bg == "rgb(11, 13, 20)", dark_bg)
        page.screenshot(path=str(OUT / "living-dark.png"), full_page=True)

        page.set_viewport_size({"width": 900, "height": 800})
        page.wait_for_timeout(800)
        page.screenshot(path=str(OUT / "living-900.png"), full_page=True)
        narrow900 = page.evaluate("""() => ({overflow:document.documentElement.scrollWidth > innerWidth})""")
        rec("L09", "900px 聊天区无横向溢出", not narrow900["overflow"], narrow900)

        page.set_viewport_size({"width": 720, "height": 800})
        page.wait_for_timeout(800)
        narrow720 = page.evaluate("""() => { const md=document.querySelector('[data-chat-flow-kind^=assistant] [class*=markdown]'); return {overflow:document.documentElement.scrollWidth > innerWidth,fontSize:getComputedStyle(md).fontSize,lineHeight:getComputedStyle(md).lineHeight}; }""")
        rec("L10", "720px 流式排版保持可读", not narrow720["overflow"] and narrow720["fontSize"] == "14px", narrow720)
        page.screenshot(path=str(OUT / "living-720.png"), full_page=True)
        rec("Z01", "聊天区 console 与资源请求零错", len(ERRORS) == 0 and len(HTTP_ERRORS) == 0, {"console": ERRORS[:5], "http": HTTP_ERRORS[:8]})
    finally:
        (OUT / "report.json").write_text(json.dumps({"results": RESULTS, "errors": ERRORS, "environment": ENV_ERRORS}, ensure_ascii=False, indent=2), encoding="utf-8")
        if ENV_ERRORS:
            print("[ENV] 非主题变更摘要服务限制:", json.dumps(ENV_ERRORS, ensure_ascii=False))
        browser.close()

passed = sum(1 for item in RESULTS if item["pass"])
print("\n=== %d/%d PASS ===" % (passed, len(RESULTS)))
raise SystemExit(0 if passed == len(RESULTS) else 1)
