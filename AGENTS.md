# AGENTS.md（项目规矩）

> 全局约定见 ~/.dsh/AGENTS.md，本文件只写项目特有内容。

## Quick Commands

- 构建皮肤：`node scripts/build-skin.mjs`（从 dsh-ui/preview/index.html :root 按映射表生成 skins/dsh-ui/skin.css）
- 同步上架：`node scripts/sync-skin.mjs`（skins/dsh-ui/ → C:\Users\pass\.dsh\skins\dsh-ui\）
- 验证：设置 → 皮肤中心应用皮肤，截图对照 dsh-ui preview（M2 起有自动化脚本）

## 项目红线

- 皮肤是**纯资产目录**：不写插件、不接 cordis 接线、不写 hooks.mjs（本地皮肤无执行权）。
- 视觉数值唯一来源 = dsh-ui/preview/index.html :root；skin.css 一律构建生成，**禁止手抄 hex/尺寸**；唯一手工维护物 = 映射表（dsh-ui token → 官方 --dsw-* alias）。
- 不改 DSH 本体、不改 dsh-ui（发现规范缺口回 dsh-ui 提）、不 fork dsh-claude-style。
- 使用本皮肤时 dsh-claude-style 必须关闭（README 写明）；skin-center 保持启用。

## 结构速览

- 文档边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 决策史

- 改既有决策前先读 .agents/notes/implemented/ 归属笔记。
- .agents/retired/2026-10-03-m1-bundle/ = 已废弃的自建插件路线遗物，勿复活。
