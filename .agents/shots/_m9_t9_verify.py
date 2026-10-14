# -*- coding: utf-8 -*-
"""T9 编排方验收：M8.5 编辑台 + po06 共存。组合场景全过。"""
import json
from playwright.sync_api import sync_playwright

URL = "http://127.0.0.1:19488/?token=<REDACTED>"
OUT = "E:/dsh-theme/.agents/shots"
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": bool(ok)})
    print("[%s] %-4s %s | %s" % ("PASS" if ok else "FAIL", cid, name, json.dumps(raw, ensure_ascii=False)[:400]))

errs = []
CARD = "document.querySelector('[data-composer-card]')"
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

    # ── hero 档（空会话 68px）+ 空态稿线 + 发送键空态 ──
    st0 = pg.evaluate("""() => {
      const card = %s;
      const ed = document.querySelector('[data-composer-input]') || document.querySelector('[contenteditable=true]');
      const send = card ? [...card.querySelectorAll('button[class*=primary]')].pop() : null;
      const scroll = document.querySelector('[class*=composerHero] [data-input-scroll]') || document.querySelector('[data-input-scroll]');
      const sc = scroll ? getComputedStyle(scroll) : null;
      return { editorAttr: card ? card.getAttribute('data-dsh-editor') : null,
               heroH: scroll ? scroll.getBoundingClientRect().height : null,
               ruleLines: sc ? sc.backgroundImage.slice(0, 60) : null,
               sendBg: send ? getComputedStyle(send).backgroundColor : null,
               cardH: card ? card.getBoundingClientRect().height : null };
    }""" % CARD)
    rec("E1", "空态：data-dsh-editor=empty", st0["editorAttr"] == "empty", st0["editorAttr"])
    rec("E2", "hero 档编辑区 68px", st0["heroH"] is not None and abs(st0["heroH"] - 68) < 2, st0["heroH"])
    rec("E3", "空态稿线在（repeating-linear-gradient）", bool(st0["ruleLines"]) and "repeating-linear-gradient" in (st0["ruleLines"] or ""), st0["ruleLines"])
    pg.screenshot(path=OUT + "/m9-hero-empty.png")

    # 打字 → filled + 月台联动
    ed = pg.query_selector('[contenteditable="true"]')
    ed.click(); pg.keyboard.type("你好", delay=40)
    pg.wait_for_timeout(600)
    st1 = pg.evaluate("""() => {
      const card = %s;
      const send = card ? [...card.querySelectorAll('button[class*=primary]')].pop() : null;
      const deepy = document.querySelector('#dsh-theme-deepy');
      return { editorAttr: card ? card.getAttribute('data-dsh-editor') : null,
               sendBg: send ? getComputedStyle(send).backgroundColor : null,
               deepyEditing: deepy ? deepy.getAttribute('data-dsh-editing') : 'NO-DEEPY' };
    }""" % CARD)
    rec("F1", "filled 翻转", st1["editorAttr"] == "filled", st1["editorAttr"])
    rec("F2", "发送键变朱砂实心", st1["sendBg"] == "rgb(210, 62, 12)", st1["sendBg"])
    rec("F3", "月台联动 data-dsh-editing", st1["deepyEditing"] not in (None, "NO-DEEPY"), st1["deepyEditing"])
    pg.screenshot(path=OUT + "/m9-hero-filled.png")

    # 贴长文 → hero 卡纹丝不动
    pg.keyboard.insert_text("长文测试。" * 200)
    pg.wait_for_timeout(600)
    st2 = pg.evaluate("""() => {
      const scroll = document.querySelector('[class*=composerHero] [data-input-scroll]') || document.querySelector('[data-input-scroll]');
      const card = %s;
      return { h: scroll ? scroll.getBoundingClientRect().height : null,
               canScroll: scroll ? scroll.scrollHeight > scroll.clientHeight : null,
               cardH: card ? card.getBoundingClientRect().height : null };
    }""" % CARD)
    rec("G1", "hero 档长文锁 68px + 内滚", st2["h"] is not None and abs(st2["h"] - 68) < 2 and st2["canScroll"], st2)
    rec("G2", "整卡高度未变（%s → %s）" % (st0["cardH"], st2["cardH"]), st0["cardH"] is not None and abs(st2["cardH"] - st0["cardH"]) < 1, {"before": st0["cardH"], "after": st2["cardH"]})
    pg.screenshot(path=OUT + "/m9-hero-longtext.png")

    # po06 共存：找「优化选项」按钮点开面板
    po = pg.evaluate("""() => {
      const btn = [...document.querySelectorAll('button, [role=button], div, span')].find(x => (x.textContent||'').trim() === '优化选项');
      if (!btn) return { found: false };
      btn.click(); return { found: true };
    }""")
    pg.wait_for_timeout(1200)
    panel = pg.evaluate("""() => {
      const els = [...document.querySelectorAll('body > div, body * [style*="position: fixed"], body * [style*="position:fixed"]')];
      const vw = window.innerWidth;
      const panels = [];
      document.querySelectorAll('*').forEach(el => {
        const cs = getComputedStyle(el);
        if (cs.position === 'fixed' && el.getBoundingClientRect().width > 200 && el.textContent.includes('档位')) {
          const r = el.getBoundingClientRect();
          panels.push({ left: r.left, right: r.right, width: r.width, inViewport: r.right <= vw && r.left >= 0 });
        }
      });
      return { vw, panels };
    }""")
    pg.screenshot(path=OUT + "/m9-po06-panel.png")
    found_panel = len(panel["panels"]) > 0
    rec("P1", "po06 优化选项面板出现", found_panel, {"btn": po, "panels": panel["panels"]})
    rec("P2", "面板完整在视口内（断位修复验证）", found_panel and all(p2["inViewport"] for p2 in panel["panels"]), panel)
    # 关面板
    pg.keyboard.press("Escape"); pg.wait_for_timeout(500)

    # 发送 → 主卡 36→52px 档 + 清空回落 empty
    pg.evaluate("""() => { const e = document.querySelector('[contenteditable=true]'); e.focus(); }""")
    pg.keyboard.press("Control+a"); pg.keyboard.press("Backspace"); pg.wait_for_timeout(400)
    pg.keyboard.type("ping", delay=30); pg.keyboard.press("Enter")
    pg.wait_for_timeout(3000)
    st3 = pg.evaluate("""() => {
      const card = %s;
      const scroll = document.querySelector('[data-input-scroll]');
      return { editorAttr: card ? card.getAttribute('data-dsh-editor') : null,
               mainH: scroll ? scroll.getBoundingClientRect().height : null,
               heroGone: !document.querySelector('#dsh-theme-deepy-hero'),
               mainBack: !!document.querySelector('#dsh-theme-deepy') };
    }""" % CARD)
    rec("H1", "发送后回落 empty（MutationObserver 兜底路径）", st3["editorAttr"] == "empty", st3["editorAttr"])
    rec("H2", "主卡 52px 档（两行）", st3["mainH"] is not None and abs(st3["mainH"] - 52) < 2, st3["mainH"])
    rec("H3", "单鲸：hero 退/主位回", st3["heroGone"] and st3["mainBack"], {"heroGone": st3["heroGone"], "main": st3["mainBack"]})
    pg.screenshot(path=OUT + "/m9-active.png")

    # 模型名完整
    mn = pg.evaluate("""() => {
      const t = document.querySelector('[data-composer-card] [class*=triggerLabel]');
      if (!t) return { found: false };
      const cs = getComputedStyle(t);
      return { found: true, text: t.textContent, ellipsis: cs.textOverflow, display: cs.display, w: t.getBoundingClientRect().width };
    }""")
    rec("M1", "模型名完整（无省略号截断机制）", mn.get("found") and mn.get("display") == "block", mn)

    rec("Z1", "console 零错", len(errs) == 0, errs[:3])
    b.close()

ok = sum(1 for r in RES if r["pass"])
print("\n=== %d/%d PASS ===" % (ok, len(RES)))
with open("E:/dsh-theme/.agents/tmp/m9-t9-result.json", "w", encoding="utf-8") as f:
    json.dump(RES, f, ensure_ascii=False, indent=1)
