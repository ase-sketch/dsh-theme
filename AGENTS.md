# AGENTS.md（项目规矩）

> 全局约定见 ~/.dsh/AGENTS.md，本文件只写项目特有内容。

## Quick Commands

**快层（秒级，改完随时跑）**

- 构建 + 守卫校验：`node scripts/build-skin.mjs`（从 dsh-ui/preview/index.html :root 生成 skin.css：91 契约 token + 99 个 --dsh-* 变量；校验 patches.css 的 var() 引用与 shell 保留变量重名）

**全量层（收口用）**

- 同步上架：`node scripts/sync-skin.mjs`（skins/dsh-ui/ → C:\Users\pass\.dsh\skins\dsh-ui\，含 preview/ 子目录）
- 验收：隔离 web profile 实例 + Playwright 跑 `.agents/shots/_m2_verify.py` / `_m3_verify.py` / `_m3_compare.py`（完整起停与还原流程见 HANDOFF.md §5；桌面 GUI 有 token 认证，勿硬闯）

## 项目红线

- 皮肤是**纯资产目录**：不写插件、不接 cordis 接线、不写 hooks.mjs（本地皮肤无执行权）。
- 视觉数值唯一来源 = dsh-ui/preview/index.html :root；skin.css 一律构建生成，**禁止手抄 hex/尺寸**。手工维护物两个：`mapping.json`（L1 契约 token 映射）与 `skins/dsh-ui/patches.css`（L2/L3 组件规则 + 非 alias 命名空间重绑定），两者都只准用 `var(--dsh-*)` / `var(--dsw-*)` 引用数值，构建期会校验 `--dsh-*` 引用存在。
- 不改 DSH 本体、不改 dsh-ui（发现规范缺口回 dsh-ui 提）、不 fork dsh-claude-style。
- 使用本皮肤时 dsh-claude-style 必须关闭（README 写明）；skin-center 保持启用。

## 结构速览

- 文档边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 决策史

- 改既有决策前先读 .agents/notes/implemented/ 归属笔记。
- .agents/retired/2026-10-03-m1-bundle/ = 已废弃的自建插件路线遗物，勿复活。