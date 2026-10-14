# -*- coding: utf-8 -*-
"""M6/T3 probe driver: answers a) service injection  b) eventSource.subscribe shape  c) slot render.

Re-runnable: takes the instance URL as argv[1]. Writes probe-result.json + PNGs next to this file.

Method (inherited from the M5 decisive run): every claim is read back from the SAME page
instance that produces the screenshot, so DOM fact and image are provably the same moment.
The machine-decidable fact for "does the first screen have a sessionId" is the
[data-conversation-session] attribute the shell stamps at lib/client.js:16333.
"""
import json
import os
import sys

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
URL = sys.argv[1]

# Facts that must be read from the live page, in one round trip.
FACTS = r"""() => {
  const q = (sel) => document.querySelectorAll(sel).length;
  const attr = (sel, name) => {
    const el = document.querySelector(sel);
    return el ? el.getAttribute(name) : null;
  };
  const probe = window.__M6_PROBE__ || null;
  return {
    // ── c) slot render evidence ──────────────────────────────────────────
    slotCount: q('[data-m6-probe-slot]'),
    slotOuterHTML: (() => {
      const el = document.querySelector('[data-m6-probe-slot]');
      return el ? el.outerHTML.slice(0, 300) : null;
    })(),
    slotRect: (() => {
      const el = document.querySelector('[data-m6-probe-slot]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    })(),
    // ── phase / sessionId facts ──────────────────────────────────────────
    conversationSessionAttr: attr('[data-conversation-session]', 'data-conversation-session'),
    conversationSessionElCount: q('[data-conversation-session]'),
    contentPhaseAttr: attr('[data-content-phase]', 'data-content-phase'),
    rootPhaseAttr: attr('[data-phase]', 'data-phase'),
    heroShellPresent: q('[class*="heroShell" i]') + q('[class*="HeroShell"]'),
    composerSeatPresent: q('[data-composer-seat]'),
    composerCardPresent: q('[data-composer-card]'),
    brandMarkCandidates: q('[class*="fish" i]'),
    inputLeftContainerHTML: (() => {
      const el = document.querySelector('[data-m6-probe-slot]');
      if (!el) return null;
      const p = el.parentElement;
      return p ? p.outerHTML.slice(0, 400) : null;
    })(),
    // ── a/b) probe record ────────────────────────────────────────────────
    probePresent: probe !== null,
    probe: probe ? {
      factoryAt: probe.factoryAt,
      applyAt: probe.applyAt,
      services: probe.services,
      errors: probe.errors,
      slotMounts: probe.slotMounts,
      slotInjectResult: probe.slotInjectResult,
      unsubShapes: probe.unsubShapes,
      bindings: probe.bindings,
      statusSnapshotCount: probe.statusSnapshots.length,
      statusSnapshotFirst: probe.statusSnapshots[0] || null,
      statusSnapshotLast: probe.statusSnapshots[probe.statusSnapshots.length - 1] || null,
      listSnapshotCount: probe.listSnapshots.length,
      listSnapshotFirst: probe.listSnapshots[0] || null,
      listSnapshotLast: probe.listSnapshots[probe.listSnapshots.length - 1] || null,
      eventCount: probe.events.length,
      eventSample: probe.events.slice(0, 8),
      eventsAll: probe.events,
      statusSnapshotsAll: probe.statusSnapshots,
    } : null,
  };
}"""


def collect(pg, label, out, shots=True):
    facts = pg.evaluate(FACTS)
    if shots:
        path = os.path.join(HERE, "m6-probe-%s.png" % label)
        pg.screenshot(path=path)
        facts["screenshot"] = os.path.basename(path)
    out["phases"][label] = facts
    return facts


def main():
    console_errors = []
    console_all = []
    out = {"url": URL, "phases": {}, "consoleErrors": console_errors, "consoleAll": console_all}

    with sync_playwright() as p:
        b = p.chromium.launch(channel="msedge", headless=True)
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        pg = ctx.new_page()
        pg.on("console", lambda m: (
            console_all.append({"type": m.type, "text": m.text[:400]}),
            console_errors.append(m.text[:400]) if m.type == "error" else None,
        ))
        pg.on("pageerror", lambda e: console_errors.append("pageerror: " + str(e)[:400]))

        pg.goto(URL, wait_until="domcontentloaded", timeout=45000)
        pg.wait_for_timeout(9000)
        # dismiss the "preview" notice dialog if present (M5 methodology)
        try:
            pg.mouse.click(933, 577)
        except Exception:
            pass
        pg.wait_for_timeout(2000)

        # ── PHASE 1: first screen (hero / blank) ─────────────────────────
        f1 = collect(pg, "firstScreen", out)

        # ── drive a real turn so events flow ─────────────────────────────
        out["drive"] = {}
        try:
            editor = pg.query_selector('[contenteditable="true"]')
            out["drive"]["editorFound"] = editor is not None
            if editor is not None:
                editor.click()
                pg.wait_for_timeout(400)
                pg.keyboard.type("Use the bash tool to run echo m6probe. You MUST call the tool. Then reply OK.", delay=5)
                pg.wait_for_timeout(400)
                pg.keyboard.press("Enter")
                out["drive"]["submitted"] = True
            else:
                out["drive"]["submitted"] = False
        except Exception as exc:  # noqa: BLE001
            out["drive"]["error"] = str(exc)[:400]

        # sample the record while the turn runs
        timeline = []
        for i in range(24):
            pg.wait_for_timeout(1000)
            snap = pg.evaluate(r"""() => {
              const p = window.__M6_PROBE__;
              if (!p) return null;
              return {
                events: p.events.length,
                mounts: p.slotMounts,
                lastEvent: p.events.length ? p.events[p.events.length - 1] : null,
                statusCount: p.statusSnapshots.length,
                statusLast: p.statusSnapshots.length ? p.statusSnapshots[p.statusSnapshots.length - 1] : null,
              };
            }""")
            timeline.append({"t": i + 1, **({"snap": snap} if snap else {})})
            if snap and snap["events"] > 0 and i > 6:
                # keep sampling a bit past first event, then stop early
                if i > 12:
                    break
        out["timeline"] = timeline

        # ── PHASE 2: active conversation ─────────────────────────────────
        f2 = collect(pg, "active", out)

        # ── PHASE 3: back to a fresh/blank session if possible ───────────
        try:
            pg.mouse.click(933, 577)
        except Exception:
            pass
        pg.wait_for_timeout(500)

        b.close()

    with open(os.path.join(HERE, "probe-result.json"), "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, indent=1)

    # concise stdout for the report
    brief = {
        "firstScreen": {k: v for k, v in out["phases"]["firstScreen"].items() if k != "probe"},
        "firstScreenProbe": {
            "present": out["phases"]["firstScreen"]["probePresent"],
            "services": (out["phases"]["firstScreen"]["probe"] or {}).get("services"),
            "errors": (out["phases"]["firstScreen"]["probe"] or {}).get("errors"),
        },
        "active": {k: v for k, v in out["phases"]["active"].items() if k != "probe"},
        "activeProbe": {
            "services": (out["phases"]["active"]["probe"] or {}).get("services"),
            "bindings": (out["phases"]["active"]["probe"] or {}).get("bindings"),
            "unsubShapes": (out["phases"]["active"]["probe"] or {}).get("unsubShapes"),
            "statusFirst": (out["phases"]["active"]["probe"] or {}).get("statusSnapshotFirst"),
            "statusLast": (out["phases"]["active"]["probe"] or {}).get("statusSnapshotLast"),
            "listFirst": (out["phases"]["active"]["probe"] or {}).get("listSnapshotFirst"),
            "eventCount": (out["phases"]["active"]["probe"] or {}).get("eventCount"),
            "eventSample": (out["phases"]["active"]["probe"] or {}).get("eventSample"),
            "listLast": (out["phases"]["active"]["probe"] or {}).get("listSnapshotLast"),
            "slotMounts": (out["phases"]["active"]["probe"] or {}).get("slotMounts"),
        },
        "consoleErrors": out["consoleErrors"][:20],
        "drive": out["drive"],
    }
    print(json.dumps(brief, ensure_ascii=False, indent=1))


if __name__ == "__main__":
    main()
