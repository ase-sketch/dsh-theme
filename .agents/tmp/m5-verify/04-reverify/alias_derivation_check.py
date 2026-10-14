# -*- coding: utf-8 -*-
"""独立核对：深色 body 块里克隆的 9 条 --dsh-* 别名，其 var() 指向是否与 preview :root 的定义一致
   （即验证生产者"从 preview :root 现算不手抄"的声明），并检查文件字节/字符计数。"""
import re, json, os
css = open(r"E:/dsh-theme/plugins/dsh-theme/assets/theme.css", encoding="utf-8").read()
html = open(r"E:/dsh-ui/preview/index.html", encoding="utf-8").read()

def block(rex, s): return re.search(rex, s).group(1)
root = block(r":root\s*\{([\s\S]*?)\n    \}", html)
rootdefs = {k: v.strip() for k, v in re.findall(r"(--dsh-[\w-]+)\s*:\s*([^;]+);", root)}

# 取 theme.css 里深色 body 块的 9 条别名
m = re.search(r"html\[data-dsh-theme\] body\[data-ds-dark-theme\] \{([^}]*--dsh-sidebar-bg[^}]*)\}", css)
block_css = m.group(1)
aliases = {k: v.strip() for k, v in re.findall(r"(--dsh-[\w-]+)\s*:\s*([^;]+);", block_css)}

# 浅色 :root 块里的同批别名
light = block(r"html\[data-dsh-theme\] \{([\s\S]*?)\n\}", css)
lightdefs = {k: v.strip() for k, v in re.findall(r"(--dsh-[\w-]+)\s*:\s*([^;]+);", light)}

res = {"aliasCount": len(aliases), "aliases": {}, "allMatchPreview": True, "identicalToLight": True}
for k, v in aliases.items():
    want = rootdefs.get(k)
    ok = (want is not None and re.sub(r"\s+"," ",v) == re.sub(r"\s+"," ",want))
    same_as_light = (lightdefs.get(k) == v)
    res["aliases"][k] = {"plugin_dark": v, "preview_root": want, "matches_preview": ok,
                         "same_as_light_block": same_as_light}
    if not ok: res["allMatchPreview"] = False
    if not same_as_light: res["identicalToLight"] = False

b = open(r"E:/dsh-theme/plugins/dsh-theme/assets/theme.css","rb").read()
res["fileBytes"] = len(b)
res["jsCharLen"] = len(css)
res["nonAsciiChars"] = sum(1 for c in css if ord(c) > 127)
res["bytesVsChars_delta"] = len(b) - len(css)
with open(os.path.join(r"E:/dsh-theme/.agents/tmp/m5-verify/04-reverify", "alias-derivation-check.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
