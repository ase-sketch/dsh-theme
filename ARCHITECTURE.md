# dsh-theme 架构

> 这份文档是「改动该落在哪」的地图。

## 用途

把 dsh-ui 设计规范做成 skin-center 皮肤（纯资产目录），在 DSH Web GUI 上一键应用/切回。

## 结构

```mermaid
flowchart LR
    ROOT["dsh-ui/preview/index.html :root<br/>token 机器可读源"] --> MAP["mapping.json<br/>dsh-ui→官方--dsw-* 映射表（人工策展）"]
    MAP --> GEN["scripts/build-skin.mjs<br/>生成 skin.css：L1 token + --dsh-* 变量全集<br/>含两条守卫"]
    PATCH["skins/dsh-ui/patches.css<br/>L2/L3 层（人工维护）"] -.->|构建期校验 var(--dsh-*) 引用| GEN
    GEN --> SYNC["scripts/sync-skin.mjs<br/>→ $DSH_HOME/skins/dsh-ui/"]
    PATCH --> SYNC
    SYNC --> SC["skin-center（已装）<br/>唯一加载器/渲染器"]
    SC --> GUI["DSH Web GUI<br/>html[data-dsh-skin=dsh-ui]"]
```

## 组件

- **skins/dsh-ui/**：皮肤源目录（skin.json v2 清单 + 生成的 skin.css + 人工维护的 patches.css + preview/ 预览图）。纯资产，无任何可执行接线。
- **mapping.json**：手工维护物之一——dsh-ui token 到官方 --dsw-* alias 的语义映射（明暗双套，面向 299 官方契约）。
- **skins/dsh-ui/patches.css**：手工维护物之二——L2 语义属性规则（data-dsh-surface/part）、L3 最小兜底（class* / 全局）、以及**非 alias 命名空间**（shell 实际消费的 --dsw-specific-* / --dsw-radius-*）的重绑定。规则一律引用 var(--dsh-*) 或 var(--dsw-*)，不写死数值。
- **scripts/build-skin.mjs**：preview :root + mapping.json → skin.css，并额外发射 --dsh-* 变量全集（明暗双套）供 patches.css 引用。两条守卫：patches.css 引用 preview :root 里不存在的变量 → 报错；preview :root 与 shell 自有变量重名 → 报错。
- **scripts/sync-skin.mjs**：皮肤源 → $DSH_HOME/skins/dsh-ui/（含子目录，目录册收录点）。
- **docs/spec.md / docs/milestones.md**：范围与验收的唯一权威。

## 数据流

视觉数值只在 dsh-ui 改 → 重跑 build + sync → 皮肤中心里重新应用。反向不允许：发现视觉缺口时，色板类改 mapping.json、组件类改 patches.css，绝不改生成物。

## 维护规则

- skin.css 是生成物，严禁手改（改 mapping.json 重跑）。
- patches.css 是手写的，但它**不许出现裸 hex/尺寸**：一律 var(--dsh-*)（preview :root 的值由构建发射）或 var(--dsw-*)（官方契约 token）。
- 皮肤中心会把 --dsw-alias-* 派生到非 alias 命名空间；shell 组件实际消费的是非 alias 名。改组件观感优先查「shell 消费哪个 token」，能用 token 表达就不写选择器。
- 非平凡决策记 .agents/notes/（规范同 dsh-ui）。
