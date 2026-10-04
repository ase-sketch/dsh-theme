import sys, json, re
from playwright.sync_api import sync_playwright

url = sys.argv[1]

# 期望值：mapping.json × preview :root 色板
html = open(r"E:/dsh-ui/preview/index.html", encoding="utf-8").read()
def block(rex):
    m = re.search(rex, html)
    return m.group(1)
def parse(css):
    return {k: v.strip() for k, v in re.findall(r"(--dsh-[\w-]+)\s*:\s*([^;]+);", css)}
light = parse(block(r":root\s*\{([\s\S]*?)\n    \}"))
dark = parse(block(r"\[data-theme=\"dark\"\]\s*\{([\s\S]*?)\n    \}"))
mapping = json.load(open(r"E:/dsh-theme/mapping.json", encoding="utf-8"))

def norm(v):
    v = v.strip().lower().rstrip(";")
    return re.sub(r"\s+", " ", v)

def apply_skin(pg, active):
    return pg.evaluate("""async (a) => {
      const res = await fetch('/api/skin-center/v2/active', { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({active: a}) });
      return res.status;
    }""", active)

def read_tokens(pg, names, dark_mode):
    # 深色覆盖定义在 body[data-ds-dark-theme] 上，所以在 body 上读计算值
    return pg.evaluate("""([names, darkMode]) => {
      if (darkMode) document.body.setAttribute('data-ds-dark-theme','');
      else document.body.removeAttribute('data-ds-dark-theme');
      const cs = getComputedStyle(document.body);
      const out = {};
      for (const n of names) out[n] = cs.getPropertyValue(n).trim();
      out['__bg'] = cs.backgroundColor;
      out['__color'] = cs.color;
      return out;
    }""", [names, dark_mode])

names = list(mapping["tokens"].keys())
fails = []
def check(theme, got):
    for dsw, ref in mapping["tokens"].items():
        want = norm((light if theme=="light" else dark)[ref[theme]])
        g = norm(got[dsw])
        if g != want:
            fails.append(f"[{theme}] {dsw}: got {g!r} want {want!r} ({ref[theme]})")
    # 根底色/文字色
    for prop, css_prop in [("background-color","__bg"),("color","__color")]:
        want = norm((light if theme=="light" else dark)[mapping["root"][prop][theme]])
        g = norm(got[css_prop])
        # computed 返回 rgb()，把 hex 也转 rgb 再比
        if want.startswith("#"):
            h = want.lstrip("#")
            want = "rgb(%d, %d, %d)" % (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))
        if g != want:
            fails.append(f"[{theme}] root {prop}: got {g!r} want {want!r}")

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge", headless=True)
    pg = b.new_page(viewport={"width":1440,"height":900})
    pg.goto(url, wait_until="domcontentloaded", timeout=30000)
    pg.wait_for_timeout(5000)
    pg.mouse.click(933, 577); pg.wait_for_timeout(1200)

    print("== 应用 dsh-ui ==")
    print("POST:", apply_skin(pg, "dsh-ui"))
    pg.wait_for_timeout(2500)
    print("skin attr:", pg.evaluate("document.documentElement.getAttribute('data-dsh-skin')"))

    got_l = read_tokens(pg, names, False)
    check("light", got_l)
    pg.screenshot(path=".agents/shots/m2-light-home.png")

    got_d = read_tokens(pg, names, True)
    check("dark", got_d)
    pg.screenshot(path=".agents/shots/m2-dark-home.png")
    pg.evaluate("document.body.removeAttribute('data-ds-dark-theme')")

    print("== 切官方默认（API null）==")
    print("POST:", apply_skin(pg, None))
    pg.wait_for_timeout(2000)
    stock_bg = pg.evaluate("getComputedStyle(document.body).backgroundColor")
    stock_skin = pg.evaluate("document.documentElement.getAttribute('data-dsh-skin')")
    print("官方默认: skin=", stock_skin, "bg=", stock_bg)
    pg.screenshot(path=".agents/shots/m2-stock.png")

    print("== 再切回 dsh-ui ==")
    print("POST:", apply_skin(pg, "dsh-ui"))
    pg.wait_for_timeout(2000)
    print("bg=", pg.evaluate("getComputedStyle(document.body).backgroundColor"))
    b.close()

print()
if fails:
    print("FAIL", len(fails))
    for f in fails: print(" ", f)
    sys.exit(1)
print(f"PASS: {len(names)} tokens × 明暗 + 根底色全部命中；官方默认 bg={stock_bg} skin={stock_skin}")
