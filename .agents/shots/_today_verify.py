# -*- coding: utf-8 -*-
"""今日工作台实机验收；URL 通过 DSH_TODAY_URL 注入，禁止把 token 写入仓库。"""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright

URL = os.environ["DSH_TODAY_URL"]
OUT = Path(os.environ.get("DSH_TODAY_OUT", "E:/dsh-theme/.dsh-tmp/today"))
OUT.mkdir(parents=True, exist_ok=True)
RESULTS = []
ERRORS = []

def rec(cid, name, ok, raw):
    RESULTS.append({"id": cid, "name": name, "pass": bool(ok), "raw": raw})
    print("[%s] %-7s %s | %s" % ("PASS" if ok else "FAIL", cid, name, json.dumps(raw, ensure_ascii=False)[:500]))

with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    page = browser.new_context(viewport={"width": 1440, "height": 900}).new_page()
    page.on("console", lambda msg: ERRORS.append(msg.text[:300]) if msg.type == "error" else None)
    page.on("pageerror", lambda err: ERRORS.append("pageerror:" + str(err)[:300]))
    try:
        page.goto(URL, wait_until="domcontentloaded", timeout=45000)
        page.wait_for_timeout(7000)
        try:
            page.mouse.click(933, 577)
        except Exception:
            pass
        if page.locator(".dsh-today").count() == 0:
            page.get_by_role("button", name="新会话").first.click()
        page.wait_for_selector(".dsh-today", timeout=30000)
        page.wait_for_timeout(5000)

        rec("T01", "今日工作台挂载", page.locator(".dsh-today").count() == 1, page.locator(".dsh-today").count())
        clock = page.locator(".dsh-today-clock").inner_text()
        rec("T02", "本地分钟时钟", re.fullmatch(r"\d{2}:\d{2}", clock) is not None, clock)
        title_display = page.locator("[class*='titleGroup']").first.evaluate("el => getComputedStyle(el).display")
        rec("T03", "旧口号与预览徽章隐藏", title_display == "none", title_display)
        rec("T04", "旧迎宾封面移除", page.locator(".dsh-hero-cover").count() == 0, page.locator(".dsh-hero-cover").count())
        scene = page.evaluate("""() => { const chat=document.querySelector('[data-conversation-region=chat]'); const weather=document.querySelector('.dsh-today-weather'); return {background:getComputedStyle(chat).backgroundImage, ruler:getComputedStyle(chat,'::before').content, border:getComputedStyle(weather).borderTopWidth, shadow:getComputedStyle(weather).boxShadow}; }""")
        rec("S01", "新会话无网格与排版标尺", "repeating-linear-gradient" not in scene["background"] and scene["ruler"] == "none", scene)
        rec("S02", "天气卡使用墨线且无阴影", scene["border"] == "1px" and scene["shadow"] == "none", scene)

        layout = page.evaluate("""() => {
          const rect = s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}; };
          return {intro:rect('.dsh-today-intro'), rail:rect('.dsh-today-rail'), card:rect('[data-composer-card]'), vw:innerWidth};
        }""")
        two_columns = layout["intro"] and layout["rail"] and layout["rail"]["x"] > layout["intro"]["x"]
        rec("T05", "桌面左右两栏落位", bool(two_columns), layout)
        no_overlap = layout["card"] and layout["rail"] and layout["card"]["right"] <= layout["rail"]["x"] + 1
        rec("T06", "输入卡与右栏不重叠", bool(no_overlap), layout)

        weather = page.evaluate("""async () => { const r = await fetch('/api/dsh-theme/weather'); const body = await r.json(); return {status:r.status, body}; }""")
        original_location = weather["body"].get("location")
        weather_ok = weather["status"] == 200 and weather["body"].get("ok") is True and weather["body"].get("city") == "东莞" and isinstance(weather["body"].get("current", {}).get("temperature"), (int, float))
        rec("W01", "Open-Meteo 真实天气契约", weather_ok, weather)
        page.wait_for_timeout(1200)
        status = page.locator(".dsh-today-weather-status").inner_text()
        rec("W02", "天气界面未进入失败态", "不可用" not in status and "正在" not in status, status)
        forecast_count = page.locator(".dsh-today-forecast-day").count()
        rec("W03", "五日预报渲染", forecast_count == 5, forecast_count)
        with page.expect_response(lambda r: "/api/dsh-theme/weather" in r.url, timeout=15000) as response_info:
            page.get_by_role("button", name="刷新天气").click()
        rec("W04", "手动刷新天气", response_info.value.status == 200, response_info.value.status)

        month_before = page.locator(".dsh-today-calendar strong").inner_text()
        page.get_by_role("button", name="下个月").click()
        month_next = page.locator(".dsh-today-calendar strong").inner_text()
        rec("C01", "月历翻页", month_next != month_before, {"before": month_before, "next": month_next})
        page.get_by_role("button", name="今天", exact=True).click()
        month_back = page.locator(".dsh-today-calendar strong").inner_text()
        rec("C02", "返回当前月", month_back == month_before, month_back)
        rec("C03", "固定 42 格月历", page.locator(".dsh-today-days > span").count() == 42, page.locator(".dsh-today-days > span").count())

        page.wait_for_selector("#dsh-theme-deepy .dsh-theme-deepy-sprite", timeout=15000)
        rec("D01", "仅输入卡 Deepy 保留", page.locator("#dsh-theme-deepy").count() == 1 and page.locator("#dsh-theme-deepy-hero").count() == 0, {"main": page.locator("#dsh-theme-deepy").count(), "hero": page.locator("#dsh-theme-deepy-hero").count()})
        page.screenshot(path=str(OUT / "today-desktop.png"), full_page=True)

        # 深色 token 实渲染（只改主题属性，不作为用户切换操作的证据）。
        page.evaluate("""() => { document.body.setAttribute('data-ds-dark-theme',''); }""")
        page.wait_for_timeout(800)
        dark_bg = page.evaluate("""() => getComputedStyle(document.body).backgroundColor""")
        rec("V01", "夜版纸色（#121110）实渲染", dark_bg == "rgb(18, 17, 16)", dark_bg)
        page.screenshot(path=str(OUT / "today-dark.png"), full_page=True)

        page.set_viewport_size({"width": 900, "height": 800})
        page.wait_for_timeout(1000)
        narrow900 = page.evaluate("""() => ({cols:getComputedStyle(document.querySelector('.dsh-today-rail')).gridTemplateColumns, calendar:getComputedStyle(document.querySelector('.dsh-today-calendar')).display, overflow:document.documentElement.scrollWidth > innerWidth})""")
        rec("N01", "900px 天气与月历双列下移", narrow900["calendar"] != "none" and not narrow900["overflow"], narrow900)
        page.screenshot(path=str(OUT / "today-900.png"), full_page=True)

        page.set_viewport_size({"width": 720, "height": 800})
        page.wait_for_timeout(1000)
        narrow720 = page.evaluate("""() => ({calendar:getComputedStyle(document.querySelector('.dsh-today-calendar')).display, art:getComputedStyle(document.querySelector('.dsh-today-weather-art')).display, overflow:document.documentElement.scrollWidth > innerWidth, cardW:document.querySelector('[data-composer-card]').getBoundingClientRect().width})""")
        rec("N02", "720px 月历折叠且无横溢", narrow720["calendar"] == "none" and narrow720["art"] == "none" and not narrow720["overflow"] and narrow720["cardW"] > 240, narrow720)
        page.screenshot(path=str(OUT / "today-720.png"), full_page=True)
        # 地点选择：记录原地点并在 finally 恢复，避免污染其他 profile 的共享偏好。
        try:
            page.get_by_title("点击更换地点").click()
            rec("L01", "点击城市打开地点编辑器", page.locator(".dsh-today-location-editor").count() == 1, page.locator(".dsh-today-location-editor").count())
            page.get_by_label("城市名称").fill("上海")
            with page.expect_response(lambda r: "/api/dsh-theme/weather/locations" in r.url, timeout=20000) as search_info:
                page.get_by_role("button", name="搜索", exact=True).click()
            rec("L02", "地理编码返回候选地点", search_info.value.status == 200 and page.locator(".dsh-today-location-result").count() > 0, {"status": search_info.value.status, "count": page.locator(".dsh-today-location-result").count()})
            page.screenshot(path=str(OUT / "location-picker.png"), full_page=True)
            if page.locator(".dsh-today-location-result").count() > 0:
                with page.expect_response(lambda r: r.url.endswith("/api/dsh-theme/weather") and r.request.method == "GET", timeout=20000) as weather_info:
                    page.locator(".dsh-today-location-result").first.click()
                page.wait_for_timeout(800)
                selected_city = page.locator(".dsh-today-city").inner_text()
                rec("L03", "选择候选后刷新当前天气", weather_info.value.status == 200 and "上海" in selected_city, {"status": weather_info.value.status, "city": selected_city})
                page.reload(wait_until="domcontentloaded", timeout=45000)
                page.wait_for_selector(".dsh-today-city", timeout=30000)
                page.wait_for_timeout(4000)
                persisted_city = page.locator(".dsh-today-city").inner_text()
                rec("L04", "刷新页面后地点仍保留", "上海" in persisted_city, persisted_city)
        finally:
            if original_location:
                restore = page.evaluate("""async (location) => { const r = await fetch('/api/dsh-theme/weather/location', {method:'POST', headers:{'content-type':'application/json'}, body:JSON.stringify(location)}); return {status:r.status, body:await r.json()}; }""", original_location)
                print("[RESTORE]", json.dumps(restore, ensure_ascii=False))
        rec("Z01", "浏览器 console 零错", len(ERRORS) == 0, ERRORS[:5])
    finally:
        (OUT / "report.json").write_text(json.dumps({"results": RESULTS, "errors": ERRORS}, ensure_ascii=False, indent=2), encoding="utf-8")
        browser.close()

passed = sum(1 for item in RESULTS if item["pass"])
print("\n=== %d/%d PASS ===" % (passed, len(RESULTS)))
raise SystemExit(0 if passed == len(RESULTS) else 1)
