# dsh-ui 皮肤（dsh-theme）

把先锋视觉「**深空编辑室**」做成 DSH Web GUI 的主题：暗色优先的近黑四层明度 + 暖纸亮室 + 单点朱砂 #FF6A3D，全界面 Lucide 图标，外加一只会看会话状态的小鲸鱼 Deepy。**一键应用，一键切回官方默认**，不刷新页面、不重启。

当前版本 **M10 输入框 V3「书写纸」**（视觉基座是 M7「深空编辑室」，M8–M10 是编辑室 / 输入卡的连续改版）。**M1–M10 全部完成并验收**，其中 M7–M10 的桌面真机由用户 2026-10-14 确认通过。

| 浅色 | 深色 |
|---|---|
| ![浅色](skins/dsh-ui/preview/light.jpg) | ![深色](skins/dsh-ui/preview/dark.jpg) |

---

## 怎么用

### 启用条件（两条，缺一不可）

1. **皮肤中心（skin-center）保持启用** —— 它是唯一的皮肤加载器/渲染器。
2. **dsh-claude-style 必须关闭** —— 两者都是整体改造型皮肤，同时开启会互相覆盖。

### 应用 / 试穿 / 切回

设置 → 皮肤 → 找到「**dsh-ui Design Spec**」卡片：

- **试穿**：即时预览，退出设置即还原，不动你的持久设置。
- **应用**：持久生效（当场生效，无需刷新或重启）。
- **切回**：点「官方默认」卡的「恢复默认」，同样当场还原。

### 换机器 / 首次安装

把整个 `skins/dsh-ui/` 目录拷到 `$DSH_HOME/skins/`（本机 = `C:\Users\pass\.dsh\skins\`），刷新 GUI 即出现在皮肤列表里。

### 插件期（M5 已完成 · 本地自用）

这套视觉已做成**自研插件** `dsh-theme`（bundle 形态），web profile 自动化验收与桌面真机验收均通过（明暗双套 + 设置面板开关 + 卸载还原）。用它而不是皮肤卡时：

- **启用**：插件已装进 desktop profile 且**已启用**（`cordis.patch.yml` 的 `ui-skin-dsh-theme` = `disabled: false`，2026-10-14 核实）——设置 → Plugins 里确认 `dsh-theme` 处于启用态，再到设置页的「dsh-theme 主题」面板拨开关（默认开）。
- **自带设置面板开关**——拨一下就生效/停用，状态由插件落盘、跨重启保持，不用再进皮肤中心切卡片。
- **皮肤卡仍然保留**，作为回退通道：不想用插件时，关掉插件开关（或禁用插件），装回皮肤卡照旧用。
- **别让两套同时生效**：插件启用时会自动把 skin-center 的皮肤切回官方默认；手动再开皮肤卡会双注入、互相打架。
- 与 **dsh-claude-style 的互斥不变**：用本主题时它必须关闭。
- 改了插件源码要**重装才生效**（file: 依赖是复制语义）：在 desktop profile 里 `pnpm remove dsh-theme && pnpm add "file:E:/dsh-theme/plugins/dsh-theme"`。⚠️ 只跑 `pnpm install` 不够（2026-10-12 实测：pnpm 会判定「已是最新」而跳过复制，只有 remove + add 能真正刷新副本）。

### Deepy 小鲸鱼（M6 已完成 · 本地自用）

插件还带一只**会动的 Deepy**：96px 大号，贴在输入卡**右上缘、没有底座**（M10 起的落位；M6–M9 期间它在输入卡片左下角，M9 一度坐在「月台」底座上），按你正在做的事自己换动作。

- **默认就开**，跟主题开关联动——把面板开关拨 OFF，Deepy 一并消失；拨回来就回来。
- 它认得 **8 种情况**：待机呼吸、思考、写回答/调工具、完成庆祝（空翻撒彩纸）、出错、等你确认、两个会话并行、三个以上会话施工。
- **素材按需加载**：首屏只拉"待机"那一张（约 19KB），其余用到才拉。
- **刻意的行为**：完成/出错这类提示会**停留约 5 秒**才淡出——即使你已经开始下一轮。这是为了让你看得见，不是卡住了；你**主动发新消息**时会立刻切走。
- 已知限制：**等你确认**（notification）这一态在本地自测环境里触发不了（要真遇到权限审批才会出现）；动画手感请以你的实际观感为准。

---

## 当前版本：M10「书写纸」输入卡（2026-10-14）

输入卡在 M7 之后连改四版——M8 质感层 → M8.5 编辑台 → M9 出格 → **M10 书写纸**是当前形态：

- **轻框三行正文**：编辑区完整显示三行，粘长文在内滚，输入卡整体高度纹丝不动（不随内容长高）。
- **单行工具带**：工具控件不再折行；长模型名、插件控件挤不动它，额度/模型标签不丢，附件功能不隐去；原「优化选项」与运行统计的弹层保留，打开时在视口内。
- **鲸鱼换位**：96px 主位鲸鱼贴在输入卡右上缘、无底座；hero 迎宾位与单鲸规则不变。
- **配套回归**：字号适配、模型名 compact 截断、聚焦线一并回归。
- M9 的堆叠 / 出界组织与「预览附件」保留行**不再作为正式布局**。

## 视觉基座：M7「深空编辑室」（2026-10-12）

视觉已与 dsh-ui 规范脱钩，全新先锋设计（方向经用户定调）：

- **深空（暗色）**：近黑四层明度阶梯 + 噪点/网格氛围层 + 单点朱砂 #FF6A3D 高饱和，辉光只给聚焦的输入卡、选中会话、主按钮。
- **亮室（浅色）**：暖纸 #F5F1E8 + 墨字 + 印刷式硬投影——不是深色的反相，是重新设计。
- **排版**：Palatino 衬线标题 + Segoe UI 正文 + Cascadia Mono 宽字距小标注（全系统自带字体，零外链）。
- **图标**：全界面 Lucide 化（shell 手绘图标按几何指纹替换为同语义 Lucide，覆盖 111/139，未命中的保持原样）；全程零 emoji。
- **Deepy 小鲸鱼**：主位 96px、贴输入卡右上缘、无底座（M10 口径；M7 的左缘「月台」底座已退役）；空会话时 hero 区有大号迎宾位——一屏一只鲸，会话激活时自动切换。

### 历史版本（M1–M6）

M1–M4 的皮肤卡是纯资产目录（CSS+图片）；M5 起插件化（样式注入+设置面板开关）；M6 接 Deepy 状态机动画。当时视觉数值取自 [dsh-ui 设计规范](E:/dsh-ui)（蓝调画布+白卡），M7 起脱钩。

## 已知限制（不阻塞交付）

> 完整清单与理由见 [docs/milestones.md](docs/milestones.md) 的「已知限制与后续候选（不阻塞交付）」；这里是面向使用者的通俗版。

| 已知限制 | 说明 |
|---|---|
| 模型档位 pill | 规范里档位选择器是浅蓝胶囊，GUI 里该控件只有哈希类名、无语义属性可锚——按契约纪律不硬上，待上游补 `data-dsh-part`。 |
| 排版层（font） | 181 个 font token 未接管，GUI 仍是官方字号体系（官方有 72 处 `font:` 简写消费，局部映射会自相矛盾）。 |
| loader 派生区依赖 | 组件层依赖皮肤中心把 `--dsw-alias-*` 派生到非 alias 命名空间的行为；loader 升级后需重跑验收脚本回归。插件期会把这层派生显式复刻进插件版 CSS，不再吃这层隐式行为。 |
| 卡片预览图 | 1440×900 缩到卡片尺寸后细节偏小，可考虑更聚焦的构图。 |

---

## 自己改 / 重新构建

视觉数值的唯一来源是 **design/tokens.css**（机器生成物，禁手改；改设计走 design/preview.html 的 #token-manifest → `node scripts/build-skin.mjs --regen-tokens`）。`skin.css` / `theme.css` / `lucide.json` / `icon-map.json` 都是生成物。

```bash
# ① 改视觉：色板类改 mapping.json，组件类改 skins/dsh-ui/patches.css
# ② 构建（从 preview :root 生成 skin.css，并校验 patches.css 的 var() 引用）
node scripts/build-skin.mjs
# ③ 同步上架（→ $DSH_HOME/skins/dsh-ui/，含 preview/ 子目录）
node scripts/sync-skin.mjs
```

两个手工维护物都**只准用 `var(--dsh-*)` / `var(--dsw-*)` 引用数值**，不写裸 hex/尺寸：`mapping.json` 管 L1 契约 token，`patches.css` 管 L2/L3 组件规则与非 alias 命名空间重绑定。

## 验证

- **快层（秒级，随时跑）**：三个构建脚本——`node scripts/build-skin.mjs`（生成 skin.css + 插件版 theme.css，顺带校验 `patches.css` 的 var() 引用存在、与 shell 自有变量不重名）、`node scripts/build-icons.mjs` 与 `build-icon-map.mjs`（Lucide 图标数据 + 指纹映射，含覆盖率棘轮）、`node scripts/build-deepy.mjs`（Deepy 素材降采样，四条守卫）。
- **单测（回归主力）**：`node plugins/dsh-theme/test/state-machine.test.mjs` + `render-layer.test.mjs` + `hooks-layer.test.mjs` + `icon-layer.test.mjs` + `composer-deepy.test.mjs`——五套共 **599 条断言**（M10 收口时全绿）。
- **全量层（隔离 web profile + Playwright）**：脚本都在 `.agents/shots/`——`_m2_verify.py`（91 token × 明暗全量断言）、`_m3_verify.py`（组件层断言）、`_m3_compare.py`（与 preview 基准逐项对照）、`_m7_t6_verify.py`（M7 视觉基座）、`_m8_t8_verify.py`（质感层）、`_m9_t9_verify.py`（编辑台 v2）、`_m10_verify.py`（M10 书写纸，当前主脚本）。完整起停流程见 [HANDOFF.md](HANDOFF.md) §8。

---

## 目录与文档

| 路径 | 是什么 |
|---|---|
| `skins/dsh-ui/` | 皮肤源目录（skin.json 清单 + 生成的 skin.css + 手写 patches.css + preview/ 预览图） |
| `design/tokens.css` | 视觉数值唯一来源（M7 起，生成物） |
| `design/preview.html` | 深空编辑室定调设计稿（冻结的历史件） |
| `mapping.json` | L1 映射表（91 个官方 `--dsw-*` → `--dsh-*`，人工策展） |
| `scripts/icon-map-overrides.json` | 图标策展表（rename/byId/skip） |
| `scripts/` | 构建与同步脚本 |
| `plugins/dsh-theme/` | 自研 bundle 插件：host 半 = 开关持久化 + 素材路由；client 半 = 样式注入 + 设置面板 + Deepy 播放器 + 图标层 + 钩子层 |
| [AGENTS.md](AGENTS.md) | 项目规矩与 Quick Commands |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 结构地图（改动该落在哪） |
| [.agents/notes/](.agents/notes/) | 决策史（目录树即索引） |
| [docs/spec.md](docs/spec.md) · [docs/milestones.md](docs/milestones.md) | 范围与里程碑（验收权威） |
| [HANDOFF.md](HANDOFF.md) | 交接文档（当前状态 + 施工要点 + 验收方法论） |
