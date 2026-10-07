# Agent Note: M3 组件层（L2/L3）与非 alias 命名空间的发现

Status: implemented — 2026-10-04 自动化验收通过

## Problem

M2 交付后 GUI 的色板已对，但组件观感仍与 dsh-ui preview 基准不一致：输入卡圆角 28px（规范 20px）、新建会话按钮是描边样式（规范要求实心 primary）、侧栏与输入卡底色是半透明色块（规范要求纯色层次）、设置面板圆角 28px。M2 的 91 个 token 映射全部命中却改不动这些——说明**映射的表层选错了**：皮肤中心把 skin.css 里的 `--dsw-alias-*` 声明派生到 shell 真正消费的**非 alias 命名空间**（`--dsw-specific-*` 被派生为 `color-mix(in srgb, var(--dsw-alias-bg-layer-1) 60%, transparent)`），而 `--dsw-radius-panel/md/sm/lg` 这类 shell 内部 token 不在 299 官方契约内、从不被皮肤覆盖。不把这两件事搞清楚，M3 只会写出一堆碰运气的选择器。

## Decision

1. **新增 `skins/dsh-ui/patches.css` 作为 L2/L3 层**，由 skin.json `contributes.patches` 引用。它做三件事：① 非 alias 命名空间 token 重绑定（`--dsw-specific-*` 实心色、`--dsw-radius-*` 圆角语言）；② `data-dsh-part/surface` 语义属性规则（侧栏主按钮实心化、会话选中态指示条、输入卡描边与聚焦态）；③ 最小化的 `[class*="..."]` 兜底（侧栏分隔线档位、聚焦环）。
2. **构建脚本发射 `--dsh-*` 变量全集**（99 个，明暗各一套），patches.css 一律用 `var(--dsh-*)` 引用——「数值只来自 preview :root」这条红线因此对 L2/L3 同样成立，仍不手抄 hex/尺寸。
3. **构建期两条守卫**：patches.css 引用了 preview :root 里不存在的 `--dsh-*` 直接报错；preview :root 与 shell 自有变量（`--dsh-content-font-size` 等 7 个）重名直接报错。
4. **font 全家 181 个不纳入 M3**（用户 2026-10-04 裁定）。
5. **预览图**：`preview/light.jpg` + `preview/dark.jpg`，1440×900 JPEG（对齐 blue-fantasy 既有约定），由隔离实例实页截图产出。

## Alternatives considered

- **只映 font 分项（size/family/weight）不碰 shorthand**：被实测证伪——官方前端有 72 处 `font: var(--dsw-font-*)` 简写消费，composite token 的值本身就是 `16px/24px var(--dsw-font-family)`，简写会覆盖分项，结果自相矛盾。该选项在开工提问时即排除。
- **全量接管 font（构建脚本合成 shorthand + 分项）**：GUI 排版换成 Inter 13px 体系、与 preview 更一致，但 M3 的验收方法就是与 preview 基准逐项对照，把排版层整体换掉会让 diff 无法归因、且全部基线作废。用户选择推后独立做。
- **照 blue-fantasy 路线用 `[class*=...]` 重写组件**：可行但脆弱——哈希类名随 shell 版本变，契约也明确对 class* 依赖给警告。只在无语义属性可锚处（侧栏列、会话行）少量使用，其余优先走 token 与语义属性。
- **L2 规则走构建链产出（拼进 skin.css）**：最终没采用。L2/L3 内容小且性质是「覆盖 shell 自身组件样式」，与 L1 的「重映射官方 token」职责不同；分开后 mapping.json 保持契约 token 的单一职责，构建脚本不必理解选择器。代价是手工维护物从 1 个变 2 个（mapping.json + patches.css），已在本笔记与 README 记明。

## Consequences

- 侧栏底色/分隔线、输入卡（白底 + 1px 描边 + 20px 圆角 + 聚焦品牌色）、新建会话实心主按钮、会话选中态（bg-active + 2px 品牌色左缘指示条）、设置面板圆角全部与 preview 基准一致。
- **对 loader 的隐式依赖**：`--dsw-specific-*` 与 `--dsw-radius-*` 是 loader 的派生区/shell 内部区，不在官方契约里。loader 升级后若改变派生顺序或命名，patches.css 的这批重绑定需要回归（验收脚本 `_m3_verify.py` 可直接复跑）。
- **已知缺口（M4 候选）**：① 模型档位 pill（preview 里是 accent-subtle 胶囊）——shell 只给了哈希类名，无稳定语义属性，按契约纪律不硬上，需向 dsh-ui 提「补 `data-dsh-part`」；② font 排版层未接管；③ GUI 的「预览版」徽章比 preview 基准多 1px 近同色描边（shell 自有元素，肉眼不可见，接受）；④ 卡片预览图 1440×900 缩到 227×128 后细节偏小，M4 可评估是否换更聚焦的构图。

## Confirmation

- `_m3_verify.py`（隔离 web profile + Playwright）：24 条断言全绿——非 alias token 实心值、输入卡/侧栏/主按钮/选中态/设置面板的圆角·底色·描边·阴影、明暗两套。
- `_m3_compare.py`：GUI 实页与 preview/index.html 基准**逐项对照**（bg/radius/border × 5 个组件），仅剩 1 项可接受偏差（上述缺口③）。
- **构建守卫负控制**：临时给 patches.css 加一条引用不存在变量的规则 → `node scripts/build-skin.mjs` 退出码 1 并报 `patches.css 引用了 preview :root 里不存在的变量：--dsh-not-a-real-token`，随后还原重建。
- 皮肤卡预览图：`/api/skin-center/v2/skins/dsh-ui/preview/light.jpg` 加载成功（natural 1440×900，卡片内 227×128），截图 `.agents/shots/m3-skin-card-view.png`。
