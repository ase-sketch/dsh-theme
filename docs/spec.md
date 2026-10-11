# DSH Theme — dsh-ui 皮肤（spec · 2026-10-03 重写 · 2026-10-10 修订）

> 状态：待用户确认 · 轻量流程：spec → 简版里程碑 → 开发，每步确认
> 视觉权威：E:\dsh-ui\docs\design-spec.md（已验收）；机器可读源 = dsh-ui/preview/index.html 的 :root 块
> 本版取代 2026-10-03 初版；其中「自建 bundle 插件路线」的废弃**仅限 M1–M4 纯皮肤期**（当时的写法与失败证据见 .agents/retired/ 与 HANDOFF-M1.md）。bundle 形态本身未否定，已于 2026-10-10 复活为 M5 正式形态。
> **路线定位（2026-10-03 用户明确，2026-10-10 补充）**：纯皮肤是**过渡路线**（M1–M4：低成本完成 token 映射策展与视觉验收），**终局 = 自研皮肤插件**（M5 落地样式注入 + 设置面板开关，Deepy 状态机等二期再上；形态 = 本地 bundle 插件，骨架照抄 skin-center，不 fork dsh-claude-style）。M1–M3 的产出物（映射表/构建链/验收方法论）路线无关，插件期直接复用。

## 约束

| 条目 | 类型 | 说明 |
|---|---|---|
| 加载器 | 硬约束 | **M1–M4 纯皮肤期**：皮肤是纯资产目录，由 skin-center（@linxin666/dsh-client-ui-skin-center，desktop profile 已装已启用）加载渲染，不写插件、不接 cordis 接线。**M5 起**改走自研 bundle 插件（形态 A，已落地验收）：client 半自注入样式 + 注册设置面板；皮肤卡保留作回退，插件激活时须把皮肤切回官方默认，防双注入 |
| 皮肤格式 | 硬约束 | 遵循 skin-center contracts v2：skin.json（fail-closed 校验）+ skin.css（L1 token 重映射 + L2 语义选择器）+ 可选 patches.css（L3）；本地皮肤 hooks.mjs 不会被执行（信任模型），不依赖它 |
| 视觉来源 | 硬约束 | 全部色值取自 dsh-ui preview :root，由构建脚本按映射表生成 skin.css，**禁止手抄 hex/尺寸**；映射表是唯一手工维护物 |
| 放置 | 硬约束 | 成品同步到 $DSH_HOME/skins/dsh-ui/（= C:\Users\pass\.dsh\skins\dsh-ui\）；源文件在 E:\dsh-theme\skins\dsh-ui\ |
| 互斥 | 硬约束 | 使用时 dsh-claude-style 必须关闭；skin-center 必须启用（已是启用状态） |

## 目标用户

DSH 使用者（本人）：让 Web GUI 用上 dsh-ui 设计规范的皮肤，且能一键切回官方默认。

## 核心场景

1. 打开 设置 → 皮肤中心，卡片列表里出现「dsh-ui」皮肤卡。
2. 点应用 → 页面**当场**变成 dsh-ui 视觉（skin-center 原子切换，不刷新、不重启）。
3. 切回「官方默认」→ 当场还原。

## 功能清单

1. 皮肤目录：skin.json（v2 清单）+ skin.css + 后续 preview/ 预览图。
2. L1 token 重映射：dsh-ui 色板/品牌/按钮/文本/边框映射到官方 --dsw-* token（contracts/official-tokens-v1.json，299 个），明暗双套（dark 走 body[data-ds-dark-theme]）。
3. 组件级打磨：L2 语义选择器（data-dsh-surface/part）+ 必要时 patches.css（L3），对齐 dsh-ui preview 观感。
4. 构建与同步脚本：build（preview :root → skin.css）+ sync（→ $DSH_HOME/skins/）。
5. 验收：皮肤应用后的 GUI 截图与 dsh-ui preview 基准对照。

## 非目标

- **M1–M4**（纯皮肤期）不做自研插件——**M5 起做**，见路线定位。开工前置的 client 半激活根因已于 2026-10-10 查明并有变异证伪（`ctx.effect` 语义误用，见 .agents/notes/implemented/feature/2026-10-03-project-scope-and-tech-route.md 修订三 / HANDOFF.md §3.4）。
- **Deepy 状态机动画不在 M5**：M5 只做样式注入 + 设置面板开关；Deepy 归二期（走插件事件钩子能力，非「本地皮肤无 hooks 执行权」的老问题）。
- 交互改造、右侧边栏、改 DSH 本体、fork dsh-claude-style（M1–M4 与 M5 均有效）。

## 参考项目（调研结论 2026-10-03 二轮）

- **skin-center 是本机皮肤生态的正解**：皮肤 = 纯资产目录，它是唯一加载器/渲染器；用户皮肤放 $DSH_HOME/skins/<id>/ 即被目录册收录（同 id 遮蔽内置）；切换原子完成、无需重启。desktop profile 中它已启用（cordis 后层 disabled:false 覆盖前层 true）。
- **dsh-claude-style**：另一路线的整体改造插件（1.18MB 交互功能巨兽），与本皮肤互斥，使用时关闭。
- 旧路失败证据：E:\dsh-theme\HANDOFF-M1.md（已标 SUPERSEDED）+ .agents/retired/2026-10-03-m1-bundle/。
