# -*- coding: utf-8 -*-
"""完整性检查：找出所有"引用了会被深色重定义的原语"的 --dsh-* 别名，
   核对它们是否都被克隆进深色 body 块。漏克隆 = 仍会锁死浅色。
   这是对修复的完备性验证（生产者只克隆了 9 条，需确认 9 就是全集）。"""
import re, json, os
css = open(r"E:/dsh-theme/plugins/dsh-theme/assets/theme.css", encoding="utf-8").read()

# 1) 深色 body 块里被重定义的原语
dark_body = re.search(r"html\[data-dsh-theme\] body\[data-ds-dark-theme\] \{(.*?)\n\}", css, re.S).group(1)
dark_primitives = {k for k, _ in re.findall(r"(--dsh-[\w-]+)\s*:\s*([^;]+);", dark_body)}

# 2) 浅色 :root 块里的别名定义（值形如 var(--dsh-xxx)）
light_root = re.search(r"html\[data-dsh-theme\] \{(.*?)\n\}", css, re.S).group(1)
light_aliases = dict(re.findall(r"(--dsh-[\w-]+)\s*:\s*(var\([^)]+\));", light_root))

# 3) 深色克隆块
clone_block = re.search(r"html\[data-dsh-theme\] body\[data-ds-dark-theme\] \{([^}]*--dsh-sidebar-bg[^}]*)\}", css, re.S).group(1)
cloned = set(re.findall(r"(--dsh-[\w-]+)\s*:", clone_block))

# 4) 需要克隆 = 别名，且其引用原语在深色被重定义
need, missing, ok = [], [], []
for alias, expr in light_aliases.items():
    target = re.search(r"var\((--dsh-[\w-]+)\)", expr)
    if not target: continue
    if target.group(1) in dark_primitives:
        need.append(alias)
        (ok if alias in cloned else missing).append(alias)

res = {
  "darkPrimitiveCount": len(dark_primitives),
  "lightAliasCount": len(light_aliases),
  "needClone": sorted(need),
  "cloned": sorted(cloned),
  "missingClone": sorted(missing),
  "complete": len(missing) == 0,
  "extraCloned": sorted(cloned - set(need)),
  "note": "needClone 为空说明无别名引用被深色重定义的原语；missingClone 非空即修复不完备",
}
with open(os.path.join(r"E:/dsh-theme/.agents/tmp/m5-verify/04-reverify", "alias-completeness.json"), "w", encoding="utf-8") as f:
    json.dump(res, f, ensure_ascii=False, indent=1)
print(json.dumps(res, ensure_ascii=False, indent=1))
