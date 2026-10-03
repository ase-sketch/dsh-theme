# 里程碑（简版 · 2026-10-03 重写）

> 每期可独立验收；收口门禁：验收通过 + 边界核对 + 决策笔记 + 两分钟复盘。

## M1 皮肤上架可见（链路打通）—— ✅ 已完成（2026-10-03 自动化验收）
- 产出：skins/dsh-ui/（skin.json v2 + skin.css 首批 L1 映射：23 token × 明暗双套 + 根底色），已同步 $DSH_HOME/skins/dsh-ui/。
- 验收证据（隔离 web profile + Playwright 实跑）：① 设置 → 皮肤面板出现「dsh-ui Design Spec」卡（试穿/应用/卸载按钮齐全）；② 激活后 html[data-dsh-skin="dsh-ui"]、body 背景 = rgb(247,250,255)（#F7FAFF 规范画布）、主按钮 = #4D6BFE 品牌蓝；③ 切官方默认 → 当场回 rgb(255,255,255) 纯白；④ 再切回 dsh-ui → 当场回蓝调；⑤ 深色 body bg = rgb(19,22,29)（#13161D）。截图在 .agents/shots/e2e-*.png。
- 桌面端生效方式：激活态已写入 $DSH_HOME/skin-center-active.json（共享文件），用户刷新 GUI 即盖上皮肤，无需重启。

## M2 全量 L1 token 映射
- 产出：映射表（dsh-ui token → 官方 --dsw-* alias，人工策展的语义对应）+ 构建脚本从 preview :root 生成完整 skin.css（明暗双套）。
- 依赖：M1。
- 验收：应用后 GUI 主色板/表面层次/文本三级/按钮各态与 dsh-ui preview 观感一致（截图对照）；明暗切换正常。

## M3 组件级打磨与预览图
- 产出：L2 语义选择器覆盖 + 必要 patches.css（L3）；preview/light.jpg + dark.jpg 皮肤卡预览图。
- 依赖：M2。
- 验收：GUI 与 dsh-ui preview/index.html 基准截图逐项对照（自动化 diff + 人工核看）；皮肤中心卡片显示预览图。

## M4 收口
- 产出：README（启用条件/应用方法/与 claude-style 互斥说明）、三件套补齐、决策笔记归档、用户真机验收。
- 验收：应用 → 日常使用 → 切回官方默认，全链路用户确认。

## 下一期（不在本期）
Deepy 状态机（本地皮肤无 hooks 执行权，需评估官方市场渠道或二期技术方案）。
