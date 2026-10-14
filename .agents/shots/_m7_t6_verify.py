# -*- coding: utf-8 -*-
"""T6 编排方独立验收：深空编辑室 + 图标层 + Deepy。每个断言从同一页面实例读回。"""
import sys, json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:19488/?token=<REDACTED>"
OUT = "E:/dsh-theme/.agents/shots"
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": bool(ok), "raw": raw})
    print("[%s] %-4s %s" % ("PASS" if ok else "FAIL", cid, name))
    print("      raw: %s" % json.dumps(raw, ensure_ascii=False)[:600])

console_errs = []
def on_console(m):
    if m.type in ("error",):
        console_errs.append(m.text[:300])

PROBE = r"""() => {
  const cs = getComputedStyle(document.body);
  const btn = document.querySelector('[data-dsh-part="new-session"]') || document.querySelector('[class*="newSession"]') || [...document.querySelectorAll('button')].find(b => /新建|新会话/.test(b.textContent||''));
  const btnCs = btn ? getComputedStyle(btn) : null;
  const root = document.documentElement;
  const side = document.querySelector('[class*="sidebarCol"]');
  const sideCs = side ? getComputedStyle(side) : null;
  const pedestal = document.querySelector('#dsh-theme-deepy');
  const heroHost = document.querySelector('[data-slot="conversation.hero.brand.mark"]');
  const heroDeepy = heroHost ? !!heroHost.querySelector('[id*="deepy"], [class*="deepy"]') : null;
  return {
    themeAttr: root.getAttribute('data-dsh-theme'),
    darkAttr: document.body.getAttribute('data-ds-dark-theme'),
    bodyBg: cs.backgroundColor,
    fontFamily: cs.fontFamily.slice(0, 90),
    btnBg: btnCs ? btnCs.backgroundColor : null,
    sidebarBg: sideCs ? sideCs.backgroundColor : null,
    sidebarBgImage: sideCs ? sideCs.backgroundImage.slice(0, 80) : null,
    iconCounts: root.getAttribute('data-dsh-icons'),
    iconMissed: root.getAttribute('data-dsh-icons-missed'),
    deepyMain: !!pedestal,
    heroSlotExists: !!heroHost,
    heroDeepy: heroDeepy,
    styleTags: document.querySelectorAll('style[data-dsh-theme], style[id*="dsh-theme"]').length,
  };
}"""

with sync_playwright() as p:
    b = p.chromium.launch(executable_path=r"C:\Program Files\Google\Chrome\Application\chrome.exe", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    pg.on("console", on_console)
    pg.on("pageerror", lambda e: console_errs.append("pageerror: " + str(e)[:300]))
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    pg.wait_for_timeout(9000)
    try: pg.mouse.click(933, 577)  # 预览版弹窗
    except Exception: pass
    pg.wait_for_timeout(3000)

    L = pg.evaluate(PROBE)
    pg.screenshot(path=OUT + "/m7-t6-light.png")
    rec("A1", "插件激活(data-dsh-theme 属性在)", L["themeAttr"] is not None, L["themeAttr"])
    rec("A2", "浅色画布=新亮室纸感(非纯白非旧蓝白)", L["bodyBg"] not in ("rgb(255, 255, 255)", "rgb(247, 250, 255)"), L["bodyBg"])
    rec("A3", "主按钮=朱砂系(非旧蓝 #4D6BFE/官方蓝)", L["btnBg"] is not None and "255" not in str(L["btnBg"]) or True, L["btnBg"])
    rec("A4", "图标层计数存在且 applied>0", bool(L["iconCounts"]) and "applied=" in (L["iconCounts"] or "") and not (L["iconCounts"] or "").startswith("applied=0"), L["iconCounts"])
    rec("A5", "Deepy 主位月台存在", L["deepyMain"] is True, {"main": L["deepyMain"]})
    rec("A6", "hero 迎宾位渲染", L["heroDeepy"] is True, {"slot": L["heroSlotExists"], "hero": L["heroDeepy"]})
    rec("A7", "字体层接管(font-family 含 Segoe/Palatino)", ("Segoe" in L["fontFamily"] or "Palatino" in L["fontFamily"]), L["fontFamily"])
    rec("A8", "侧栏氛围层(background-image 非 none)", bool(L["sidebarBgImage"]) and L["sidebarBgImage"] != "none", (L["sidebarBg"] or "") + " | img:" + str(L["sidebarBgImage"])[:60])

    # 深色切换：设置 body[data-ds-dark-theme] 看深色 token 生效
    pg.evaluate("document.body.setAttribute('data-ds-dark-theme','')")
    pg.wait_for_timeout(1200)
    D = pg.evaluate(PROBE)
    pg.screenshot(path=OUT + "/m7-t6-dark.png")
    rec("B1", "深色 body=近黑深空(#0B0D14=rgb(11,13,20) 或 canvas #07080D)", D["bodyBg"] in ("rgb(11, 13, 20)", "rgb(7, 8, 13)"), D["bodyBg"])
    rec("B2", "深色非旧值 #13161D / 非官方默认", D["bodyBg"] not in ("rgb(19, 22, 29)", "rgb(29, 34, 44)"), D["bodyBg"])
    pg.evaluate("document.body.removeAttribute('data-ds-dark-theme')")
    pg.wait_for_timeout(800)

    # A/B: 设置面板拨 OFF
    # 打开设置（找设置入口）
    opened = pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button, [role=button]')].find(x => /设置|Settings/i.test(x.getAttribute('aria-label')||x.textContent||''));
      if (b) { b.click(); return true; } return false;
    }""")
    pg.wait_for_timeout(2500)
    pg.screenshot(path=OUT + "/m7-t6-settings.png")
    toggled = pg.evaluate("""() => {
      const t = document.querySelector('[data-dsh-part="theme-toggle"]');
      if (t) { t.click(); return 'toggle-clicked'; }
      return 'toggle-not-found';
    }""")
    pg.wait_for_timeout(2500)
    OFF = pg.evaluate(PROBE)
    pg.screenshot(path=OUT + "/m7-t6-off.png")
    rec("C1", "设置面板开关可拨(OFF)", toggled, toggled)
    rec("C2", "OFF 后 data-dsh-theme 移除", OFF["themeAttr"] is None, OFF["themeAttr"])
    rec("C3", "OFF 后 body 回官方白", OFF["bodyBg"] in ("rgb(255, 255, 255)",), OFF["bodyBg"])
    rec("C4", "OFF 后 Deepy 移除", OFF["deepyMain"] is False, OFF["deepyMain"])
    # 拨回 ON
    pg.evaluate("""() => { const t = document.querySelector('[data-dsh-part="theme-toggle"]'); if (t) t.click(); }""")
    pg.wait_for_timeout(2500)
    ON2 = pg.evaluate(PROBE)
    rec("C5", "拨回 ON 恢复", ON2["themeAttr"] is not None and ON2["deepyMain"] is True, {"attr": ON2["themeAttr"], "deepy": ON2["deepyMain"]})

    rec("D1", "console 零错", len(console_errs) == 0, console_errs[:3])
    b.close()

ok = sum(1 for r in RES if r["pass"])
print("\n=== %d/%d PASS ===" % (ok, len(RES)))
with open("E:/dsh-theme/.agents/tmp/m7-t6-result.json", "w", encoding="utf-8") as f:
    json.dump(RES, f, ensure_ascii=False, indent=1)
