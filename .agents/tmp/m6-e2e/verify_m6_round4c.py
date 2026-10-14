# -*- coding: utf-8 -*-
"""M6 round 4c: (C) event-layer attribution of the error trigger rate, plus a proper
A3 visibility test via a document.hidden override.

C: the probe bundle (dsh-theme-evtprobe) records turn/start, turn/end(+reason.kind),
   step/start from the SAME eventSource dsh-theme subscribes to. It also installs TWO
   listeners on that source to test whether subscribe() is single- or multi-subscriber.

Usage: python verify_m6_round4c.py <url>
"""
import sys, os, json, time
from playwright.sync_api import sync_playwright

URL = sys.argv[1]
HERE = os.path.dirname(os.path.abspath(__file__))
RES = []
def rec(cid, name, ok, raw):
    RES.append({"id": cid, "name": name, "pass": ok, "raw": raw})
    print("[%s] %s" % ("PASS" if ok else ("SKIP" if ok is None else "FAIL"), name))
    print("      " + json.dumps(raw, ensure_ascii=False)[:1700])

FACTS = r"""() => {
  const root = document.getElementById('dsh-theme-deepy');
  const s = root ? root.querySelector('.dsh-theme-deepy-sprite') : null;
  const bg = s ? getComputedStyle(s).backgroundImage : null;
  let stt = null;
  if (bg && bg.includes('deepy/')) stt = bg.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png','');
  return {state: stt, alive: !!s};
}"""

def new_session(pg):
    pg.evaluate("""() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === '新建会话');
      if (b) b.click();
    }""")
    pg.wait_for_timeout(2500)

def send(pg, text):
    ed = pg.query_selector('[contenteditable="true"]')
    if ed is None: return False
    ed.click(); pg.wait_for_timeout(300)
    pg.keyboard.type(text, delay=3)
    pg.wait_for_timeout(300)
    pg.keyboard.press("Enter")
    return True

def settle(pg, ms=9000):
    pg.wait_for_timeout(ms)
    try: pg.mouse.click(933, 577)
    except Exception: pass
    pg.wait_for_timeout(2000)

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    pg = ctx.new_page()
    console, pageerrors = [], []
    pg.on("console", lambda m: console.append({"type": m.type, "text": m.text[:300]}))
    pg.on("pageerror", lambda e: pageerrors.append(str(e)[:300]))
    pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
    settle(pg)

    # probe present?
    probe0 = pg.evaluate("() => ({ present: !!window.__M6_EVTPROBE__ })")
    rec("C-probe-loaded", "C0 事件探针包已加载并与 dsh-theme 共存",
        probe0["present"], {"probe": probe0})

    # ══════════ C: N interrupts, record reason.kind + state outcome ══════════
    trials = []
    for i in range(6):
        new_session(pg); settle(pg, 6000)
        pg.evaluate("() => { if (window.__M6_EVTPROBE__) window.__M6_EVTPROBE__.clear() }")
        pg.evaluate(r"""() => {
          window.__r = []; window.__mark = Date.now();
          window.__t = setInterval(() => {
            const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
            let st = null;
            if (s) { const b = getComputedStyle(s).backgroundImage;
              if (b && b.includes('deepy/')) st = b.split('deepy/').pop().split('"')[0].split(')')[0].replace('.png',''); }
            window.__r.push({t: Date.now(), s: st});
          }, 40);
        }""")
        send(pg, "Use the pwsh tool to run this exact command: Start-Sleep -Seconds 150 . "
                 "You MUST call the tool exactly once. Do not use any other tool. After it returns, reply DONE.")
        t0 = time.time()
        while time.time() - t0 < 45:
            pg.wait_for_timeout(200)
            if pg.evaluate(FACTS)["state"] == "typing": break
        pg.evaluate("""() => {
          const s = [...document.querySelectorAll('button')].find(b => /停止|stop/i.test(b.getAttribute('aria-label')||''));
          if (s) s.click();
        }""")
        pg.wait_for_timeout(9000)
        ui = pg.evaluate(r"""() => {
          clearInterval(window.__t);
          const mark = window.__mark; const out = []; let last = null;
          for (const x of window.__r) { if (x.t < mark - 300) continue;
            if (x.s !== last) { out.push({dt: Math.round(x.t-mark), state: x.s}); last = x.s; } }
          return out;
        }""")
        ev = pg.evaluate("() => window.__M6_EVTPROBE__ ? window.__M6_EVTPROBE__.get() : null")
        idx = next((j for j, x in enumerate(ui) if x["state"] == "error"), None)
        hold = (ui[idx+1]["dt"] - ui[idx]["dt"]) if (idx is not None and idx+1 < len(ui)) else None
        reasons = [r.get("reasonKind") for r in (ev["records"] if ev else []) if r.get("type") == "turn/end"]
        trials.append({"trial": i+1, "ui": ui, "errorVisible": idx is not None, "errorHoldMs": hold,
                       "turnEndReasons": reasons,
                       "events": [{"type": r.get("type"), "reasonKind": r.get("reasonKind")} for r in (ev["records"] if ev else [])],
                       "sources": ev["sources"] if ev else None})

    # attribution
    attribution = []
    for t in trials:
        reasons = t["turnEndReasons"]
        if t["errorVisible"]:
            ok = "interrupted" in reasons
            attribution.append({"trial": t["trial"], "errorVisible": True,
                                "reasons": reasons, "explained": ok,
                                "verdict": "reason=interrupted -> error (语义正确)" if ok
                                           else "error 可见但 reason 非 interrupted（需查）"})
        else:
            ok = all(r in ("aborted", "completed", "forked", None) for r in reasons)
            attribution.append({"trial": t["trial"], "errorVisible": False,
                                "reasons": reasons, "explained": ok,
                                "verdict": "reason=%s -> idle (语义正确)" % (reasons or "无 turn/end 记录") if ok
                                           else "无 error 且 reason 为 interrupted（事件丢失！）"})
    all_explained = all(a["explained"] for a in attribution)
    rec("C-attribution", "C1 error 触发率的事件层归因：每次结果都能被 turn/end reason 解释",
        all_explained,
        {"trials": trials, "attribution": attribution,
         "summary": "可见 %d/6，hold=%s" % (sum(1 for t in trials if t["errorVisible"]),
                                            [t["errorHoldMs"] for t in trials if t["errorHoldMs"]]),
         "judgement": "若全部 explained=true → 6/10 属设计（reason 依中断时机不同），可停查"})

    # multi-subscriber check
    srcs = pg.evaluate("() => window.__M6_EVTPROBE__ ? window.__M6_EVTPROBE__.get().sources : null")
    multi = None
    if srcs:
        multi = all(s["hits"]["a"] > 0 and s["hits"]["b"] > 0 for s in srcs)
    rec("C-multisub", "C2 eventSource.subscribe 是否支持多订阅者（探针装 2 个监听器 + dsh-theme 自己 1 个）",
        None if not srcs else multi,
        {"sources": srcs,
         "note": "hits.a/hits.b 为探针在同一 source 上装的两个监听器各自的触发次数；两者都 >0 即多订阅成立"})

    # ══════════ A3: visibility via document.hidden override ══════════
    vis = pg.evaluate(r"""() => {
      // document.hidden is a getter on Document.prototype; override on the instance
      const proto = Object.getOwnPropertyDescriptor(Document.prototype, 'hidden');
      let forced = null;
      try {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => forced === null ? proto.get.call(document) : forced });
      } catch (e) { return { ok: false, err: String(e).slice(0,150) }; }
      window.__setHidden = (v) => { forced = v; document.dispatchEvent(new Event('visibilitychange')); };
      window.__restoreHidden = () => { delete document.hidden; };
      return { ok: true };
    }""")
    if vis.get("ok"):
        pg.wait_for_timeout(500)
        pg.evaluate("() => window.__setHidden(true)")
        pg.wait_for_timeout(1200)
        h1 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
          return s ? getComputedStyle(s).backgroundPosition : null; }""")
        pg.wait_for_timeout(1500)
        h2 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
          return s ? getComputedStyle(s).backgroundPosition : null; }""")
        pg.evaluate("() => window.__setHidden(false)")
        pg.wait_for_timeout(1500)
        v1 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
          return s ? getComputedStyle(s).backgroundPosition : null; }""")
        pg.wait_for_timeout(800)
        v2 = pg.evaluate(r"""() => { const s = document.querySelector('#dsh-theme-deepy .dsh-theme-deepy-sprite');
          return s ? getComputedStyle(s).backgroundPosition : null; }""")
        frozen = h1 == h2
        resumed = v1 != v2
        rec("A3-visibility", "A3 页面隐藏时停帧、恢复后继续推进（override document.hidden + visibilitychange）",
            frozen and resumed,
            {"overrideOk": True, "posHidden_a": h1, "posHidden_b": h2, "frozenWhileHidden": frozen,
             "posVisible_c": v1, "posVisible_d": v2, "resumed": resumed,
             "note": "直接驱动插件监听的 visibilitychange 处理器，等价于真实切页签"})
    else:
        rec("A3-visibility", "A3 页面隐藏/恢复", None, {"override": vis})

    b.close()

errs = [c for c in console if c["type"] == "error"]
out = {"head": "ecc2b4e", "results": RES, "consoleErrors": errs, "pageerrors": pageerrors}
with open(os.path.join(HERE, "round4c-result.json"), "w", encoding="utf-8") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("\n=== ROUND 4c ===")
for r in RES:
    print("%-5s %s" % ("PASS" if r["pass"] else ("SKIP" if r["pass"] is None else "FAIL"), r["name"]))
print("console errors=%d pageerrors=%d" % (len(errs), len(pageerrors)))
