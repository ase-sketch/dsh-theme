# 里程碑（简版 · 2026-10-03 重写）

> 每期可独立验收；收口门禁：验收通过 + 边界核对 + 决策笔记 + 两分钟复盘。

## M1 皮肤上架可见（链路打通）—— ✅ 已完成（2026-10-03 自动化验收）
- 产出：skins/dsh-ui/（skin.json v2 + skin.css 首批 L1 映射：23 token × 明暗双套 + 根底色），已同步 $DSH_HOME/skins/dsh-ui/。
- 验收证据（隔离 web profile + Playwright 实跑）：① 设置 → 皮肤面板出现「dsh-ui Design Spec」卡（试穿/应用/卸载按钮齐全）；② 激活后 html[data-dsh-skin="dsh-ui"]、body 背景 = rgb(247,250,255)（#F7FAFF 规范画布）、主按钮 = #4D6BFE 品牌蓝；③ 切官方默认 → 当场回 rgb(255,255,255) 纯白；④ 再切回 dsh-ui → 当场回蓝调；⑤ 深色 body bg = rgb(19,22,29)（#13161D）。截图在 .agents/shots/e2e-*.png。
- 桌面端生效方式：激活态已写入 $DSH_HOME/skin-center-active.json（共享文件），用户刷新 GUI 即盖上皮肤，无需重启。

## M2 全量 L1 token 映射 —— ✅ 已完成（2026-10-04 自动化验收）
- 产出：映射表扩到 91 token × 明暗双套（bg/border/brand/button/code/file/interactive/label/link/markdown/scrollbar/state/toast/specific/hovercard 15 组），跳过项与理由显式写在 mapping.json $comment；裁决口径与备选见归属笔记 .agents/notes/implemented/feature/2026-10-04-m2-full-l1-token-mapping.md。已同步 $DSH_HOME/skins/dsh-ui/。
- 验收证据（隔离 web profile + Playwright，脚本 .agents/shots/_m2_verify.py）：91 token × 明暗 + 根底色全部命中 preview :root 期望值；API 切官方默认 → bg 回 rgb(255,255,255)、skin 属性消失；再切回 → rgb(247,250,255)。截图 m2-light/dark/stock 在 .agents/shots/。
- 留 M3 裁定：font 全家 181 个未映射（排版非色板，shorthand 覆盖分项）；elevation/corner-shape 等非色 token 未碰。

## M3 组件级打磨与预览图 —— ✅ 已完成（2026-10-04 自动化验收）
- 产出：skins/dsh-ui/patches.css（L2 语义属性规则 + L3 最小 class* 兜底 + 非 alias 命名空间 token 重绑定）；构建脚本发射 99 个 --dsh-* 变量并加两条守卫；preview/light.jpg + dark.jpg（1440×900）。归属笔记：.agents/notes/implemented/feature/2026-10-04-m3-component-layer-and-nonalias-namespace.md。
- 验收证据：① _m3_verify.py 24 条断言全绿（输入卡 20px 白底 1px 描边、侧栏纯色 + subtle 分隔线、新建会话实心主按钮、会话选中 bg-active + 2px 品牌色指示条、设置面板 20px，明暗双套）；② _m3_compare.py 与 preview 基准逐项对照，5 组件 × bg/radius/border 仅剩 1 项可接受偏差（GUI「预览版」徽章多 1px 近同色描边）；③ 构建守卫负控制已证明会红；④ 皮肤卡加载 preview/light.jpg（natural 1440×900）。截图 m3-*.png。
- 关键发现：皮肤中心把 --dsw-alias-* 派生到 shell 实际消费的非 alias 命名空间（--dsw-specific-*），且 --dsw-radius-* 不在 299 契约内——这是 M2 只改色板、改不动组件几何的根因。
- 用户裁定：font 全家 181 个不纳入本期（官方 72 处 font: shorthand 消费使「只映分项」自相矛盾；全量接管会作废本期截图基线）。
- 已知缺口（**M5/二期候选**，不在 M4 范围）：模型档位 pill 无稳定语义属性（需向 dsh-ui 提 data-dsh-part）；font 排版层未接管；卡片预览图缩放后细节偏小；对 loader 派生区的隐式依赖需回归。

## M4 收口 —— ⏳ 自动化部分完成（2026-10-04），待用户真机验收
- 产出：README.md（先讲怎么用：启用条件 / 试穿·应用·切回 / 换机器安装 / 构建链 / 验证 / 已知缺口）；三件套补齐（AGENTS.md Quick Commands 分快慢两层、ARCHITECTURE.md 回写 M3 边界、.agents/notes/ 归档 M1 bundle 笔记至 archived/ 并更新 Status）；仓库清理（移除误跟踪的 _instance_url.txt——含实例 token，.gitignore 加规则防复发）。
- 验收证据（自动化部分，2026-10-04 重跑）：隔离实例跑 _m2_verify.py（91 token × 明暗 + 根底色全绿）、_m3_verify.py（组件层 24 断言全绿）、_m3_compare.py（与 preview 基准逐项对照，仅 1 项已知可接受偏差）；快层构建 + 守卫通过。
- 待用户完成：真机验收清单（HANDOFF.md §9）——应用 → 日常使用 → 切回官方默认，全链路确认。

## M5 插件化（终局；2026-10-03 定方向，2026-10-10 定形态与范围）—— ✅ 已完成（2026-10-10 web 自动化验收 + 用户 desktop 真机验收通过）
- 形态：自研 **bundle 插件**（形态 A，本地 desktop profile 自用先行）。骨架照抄本机活样本 skin-center 的 package.json 三要素，不 fork dsh-claude-style。
- 前置：**已完成**。2026-10-03「自制 bundle client 半未激活」的诊断已被推翻——真相是 `ctx.effect` 把卸载函数当 effect body 传，装上即被同毫秒撤掉（证据链见 HANDOFF.md §3.4；实验产物 .agents/tmp/m5-rootcause/REPORT.md，未跟踪）。
- 产出：plugins/dsh-theme/（host 半开关持久化 + client 半样式注入/设置面板/语义锚点适配器 + assets/theme.css 构建生成物）；build-skin.mjs 新增插件版自包含 CSS 产出（复刻 loader 变换：作用域重写 + 派生 + var() 别名深色重求值）。
- 验收证据（隔离 web profile，生产者自检 + 独立复验双轮）：① D4 探针门三行断言 + 负控制 + console 零错（.agents/tmp/m5-probe/）；② 功能七条全绿（面板出现、ON 注入/OFF 卸载/跨重载持久化/loader 级静态禁用可逆）；③ parity_m3 17/17 与纯皮肤期一致；④ 像素采样证明真实可见（品牌蓝 ON=2316/OFF=0）；⑤ 深色曾被独立验收抓红（var() 别名锁死浅色），修复后 7 采样点 Δ=0、暗区占比 98.21% vs 基线 98.15%，浅色截图 md5 零回归（.agents/tmp/m5-plugin/、.agents/tmp/m5-verify/REVERIFY-report.md）。验收**不含** Deepy——它已移出本期。
- 分发：已装 desktop profile（**disabled:true 待机**，重启后插件页可见、手动启用生效）；官方市场上架留后续里程碑。
- 待用户完成：desktop 真机验收（重启 DSH → 插件页启用 dsh-theme → 走 HANDOFF.md §9 清单 + 设置面板开关 + 深色切换）。


## 下一期（不在本期）
Deepy 状态机——M5 之后做，技术前提已变：走插件事件钩子能力（`ctx.on` + SessionEventStream，已查实 57 种会话事件），直接映射 design-spec §7.2 事件表，§7.1 帧表输入已备齐。不再是「本地皮肤无 hooks 执行权、需评估官方市场渠道」的老问题。二期待排期。