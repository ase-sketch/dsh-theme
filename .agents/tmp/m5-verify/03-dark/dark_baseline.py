# -*- coding: utf-8 -*-
"""深色基线抽取：与 .agents/shots/_m2_verify.py 完全同口径（正则解析 preview :root / [data-theme=dark]），
   用 mapping.json 把 --dsh-* 基线解析成 --dsw-alias-* 期望值。只读，不改任何东西。"""
import json, re, sys
html = open(r"E:/dsh-ui/preview/index.html", encoding="utf-8").read()
def block(rex):
    return re.search(rex, html).group(1)
def parse(css):
    return {k: v.strip() for k, v in re.findall(r"(--dsh-[\w-]+)\s*:\s*([^;]+);", css)}
light = parse(block(r":root\s*\{([\s\S]*?)\n    \}"))
dark  = parse(block(r"\[data-theme=\"dark\"\]\s*\{([\s\S]*?)\n    \}"))
mapping = json.load(open(r"E:/dsh-theme/mapping.json", encoding="utf-8"))
def norm(v):
    v = v.strip().lower().rstrip(";")
    return re.sub(r"\s+", " ", v)
def to_rgb(v):
    v = norm(v)
    if v.startswith("#"):
        h = v.lstrip("#")
        if len(h) == 3: h = "".join(c*2 for c in h)
        return "rgb(%d, %d, %d)" % (int(h[0:2],16), int(h[2:4],16), int(h[4:6],16))
    return v
expect = {"light": {}, "dark": {}}
for dsw, ref in mapping["tokens"].items():
    for theme in ("light","dark"):
        expect[theme][dsw] = norm((light if theme=="light" else dark)[ref[theme]])
root = {}
for prop, ref in mapping["root"].items():
    for theme in ("light","dark"):
        root.setdefault(theme, {})[prop] = to_rgb((light if theme=="light" else dark)[ref[theme]])
res = {
  "source": {"preview": r"E:/dsh-ui/preview/index.html", "mapping": r"E:/dsh-theme/mapping.json"},
  "dark_dsh_palette": {k: dark[k] for k in sorted(dark) if k in ("--dsh-bg-base","--dsh-bg-subtle","--dsh-bg-surface","--dsh-bg-hover","--dsh-bg-active","--dsh-border-subtle","--dsh-border-strong","--dsh-text-primary","--dsh-text-secondary","--dsh-text-tertiary","--dsh-accent","--dsh-accent-hover")},
  "dark_root": root["dark"],
  "light_root": root["light"],
  "dark_tokens": expect["dark"],
  "light_tokens": expect["light"],
  "key_dark": {k: expect["dark"].get(k) for k in ("--dsw-alias-bg-base","--dsw-alias-bg-layer-1","--dsw-alias-bg-layer-2","--dsw-alias-bg-layer-3","--dsw-alias-border-l1","--dsw-alias-brand-primary","--dsw-alias-label-primary","--dsw-alias-label-secondary","--dsw-alias-label-tertiary")},
}
print(json.dumps(res, ensure_ascii=False, indent=1))
