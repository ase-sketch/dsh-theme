# Agent Note: M2 全量 L1 token 映射策展（91/299）

Status: implemented — 2026-10-04 自动化验收通过

## Problem

M1 只映射了 23 个官方 token（表面/边框/品牌/主按钮/文本三级），GUI 大量区域（markdown 代码块、滚动条、toast、sidebar 选中态、state 语义色、hovercard 等）仍掉回官方默认值，与 dsh-ui 设计规范观感断裂。M2 要把 dsh-ui 色板语义覆盖到「可映射的全部 alias」，但 299 个官方 token 里混着色值/阴影/排版/滤镜多种类型，dsh-ui 色板只有 20 个语义色 token，**哪些该映射、映射到谁、哪些必须放弃**需要一套可复用的裁决口径，否则每次扩表都重新吵一遍。

## Decision

裁决口径（优先级从高到低）：

1. **dsh-ui 设计语义优先于官方推导值**。官方推导表（skin-center lib/client.js declarations()）只用来理解 token 用途，不作为取值依据；取值永远来自 preview :root。
2. **无对应语义 token 就跳过，不发明**。禁止手抄 hex 的红线延伸：宁可留官方默认也不近似乱配。
3. **纯色色板不碰需要透明度的 token**（dsh-ui 是纯色层次，无 alpha 变体）。
4. **官方 invert 语义 = 背景色**：brand-primary-invert / label-primary-inverted 按官方推导表映到 --dsh-bg-base。

分组结论：映射 91 个（bg 10 / border 7 / brand 4 / button 15 / code 2 / file 2 / interactive 4 / label 11 / link 1 / markdown 8 / scrollbar 4 / state 10 / toast 1 / specific 11 / hovercard 1）。跳过清单与理由全部写进 mapping.json 的 \$comment（单一事实源），要点：mask 系（无 alpha）、diff bg/gutter（纯色刷整行背景会糊，官方默认即半透明）、tooltip-bg（fg 不在契约内保不住对比度）、font 全家 181 个（排版非色板且 shorthand 覆盖分项，留 M3 评估）、elevation/corner-shape/mask-blur/backdrop-filter（值类型非色或无对应）。

toast-bg 映 bg-active（官方推导 = 深层表面色，非品牌色——blue-fantasy 映品牌色是它的设计自由，不抄）。

## Alternatives considered

- **全量 299 硬映射**：font/elevation/shadow 等需要合成值或猜测值类型，违反「值只准来自 preview :root」；否决。
- **扩展构建脚本合成 alpha 变体**（如 accent 8% 做 hover）：等于让脚本发明色值，红线边界后移，M2 不需要；否决，若 M3 视觉对照证明缺口再议。
- **tooltip-bg 映 text-primary**（官方 = 前景主导深色）：tooltip-fg 不在 299 契约内，bg 改了 fg 不跟，对比度失控风险；否决。
- **照抄 blue-fantasy 的 scrim 半透明模式**：HANDOFF 已明确 dsh-ui 是纯色层次，不用 scrim；否决。

## Consequences

- skin.css 从 23 → 91 token × 明暗双套（200 行生成物），GUI 的 markdown/滚动条/toast/sidebar/state 等区域全部落入 dsh-ui 色板。
- 跳过项是**显式决策**而非遗漏：后续要补必须先回 dsh-ui 提色板缺口（如 subtle-success/subtle-danger），不在映射层发明。
- font 全家未映射 = GUI 排版仍是官方字体/字号，与 preview 的 Inter 13px 体系不一致——M3 验收「观感一致」时要显式裁定这块算不算缺口。

## Confirmation

- 自动化验收（.agents/shots/_m2_verify.py，隔离 web profile + Playwright）：91 token × 明暗双套 + 根底色/文字色全部命中 preview :root 期望值；API 切官方默认 bg 回 rgb(255,255,255)、skin 属性消失；再切回 dsh-ui bg 回 rgb(247,250,255)。截图 m2-light-home.png / m2-dark-home.png / m2-stock.png。
- 构建链自检：mapping.json 指向不存在的 dsh token 时 build-skin.mjs 抛错（特性保留）。
- **验收后还原的坑（新教训）**：web profile 还原时只恢复 package.json 不够——pnpm 会把当前 lockfile 副本藏在 node_modules/.pnpm/lock.yaml，删掉顶层 pnpm-lock.yaml 后 pnpm 会从该副本「复活」已移除的依赖（本次 skin-center 被复活 3 次才定位）。完整还原 = 恢复备份 → 删 node_modules/.pnpm/lock.yaml → 删 pnpm-lock.yaml → pnpm install。已回写 HANDOFF.md §5。
