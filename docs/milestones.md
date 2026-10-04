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

## M3 组件级打磨与预览图
- 产出：L2 语义选择器覆盖 + 必要 patches.css（L3）；preview/light.jpg + dark.jpg 皮肤卡预览图。
- 依赖：M2。
- 验收：GUI 与 dsh-ui preview/index.html 基准截图逐项对照（自动化 diff + 人工核看）；皮肤中心卡片显示预览图。

## M4 收口
- 产出：README（启用条件/应用方法/与 claude-style 互斥说明）、三件套补齐、决策笔记归档、用户真机验收。
- 验收：应用 → 日常使用 → 切回官方默认，全链路用户确认。
## M5 插件化（终局，用户 2026-10-03 明确方向）
- 前置：先根因 2026-10-03 自制 bundle client 半未激活问题（对照 skin-center 的 client inject 声明与装配源码，活样本在本机）。
- 产出：自研皮肤插件（bundle 形态参照 dsh-claude-style）：样式层复用 mapping.json 与构建链注入全量视觉；功能层 = Deepy 状态机（design-spec §7.2 事件映射）+ 设置面板开关。
- 验收：插件页可管理开关；Deepy 按事件动；皮肤层视觉与纯皮肤期一致（同基准截图对照）。
- 分发备选：官方市场上架（若走市场，皮肤 hooks 路线可作为轻量备选形态）。


## 下一期（不在本期）
Deepy 状态机（本地皮肤无 hooks 执行权，需评估官方市场渠道或二期技术方案）。
