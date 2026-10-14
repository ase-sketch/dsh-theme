# AGENTS.md（项目规矩）

> 全局约定见 ~/.dsh/AGENTS.md，本文件只写项目特有内容。

## Quick Commands

**快层（秒级，改完随时跑）**

- 构建 + 守卫校验：`node scripts/build-skin.mjs`（从 design/tokens.css 生成 skin.css + 插件版 theme.css：91 契约 token + 163 个 --dsh-* 变量；校验 patches.css 的 var() 引用、shell 保留变量重名、noise-uri 合法性）。改设计稿后才需 `node scripts/build-skin.mjs --regen-tokens` 重新生成 tokens.css
- 图标数据构建：`node scripts/build-icons.mjs`（lucide-static → plugins/dsh-theme/assets/icons/lucide.json，2141 图标）+ `node scripts/build-icon-map.mjs`（shell 指纹 × lucide → icon-map.json，含 5 守卫 + 覆盖率棘轮 111/139 只许收紧）
- Deepy 素材构建：`node scripts/build-deepy.mjs`（从 E:\dsh-ui 精灵图降采样到 64px/帧 → `plugins/dsh-theme/assets/deepy/`；四条守卫：源图尺寸、产出尺寸、非空格数=帧数、manifest 原子落盘。产物入库，改素材源后才需重跑）

- Deepy/样式行为回归：`node plugins/dsh-theme/test/state-machine.test.mjs` + `node plugins/dsh-theme/test/render-layer.test.mjs` + `node plugins/dsh-theme/test/hooks-layer.test.mjs` + `node plugins/dsh-theme/test/icon-layer.test.mjs` + `node plugins/dsh-theme/test/composer-deepy.test.mjs`。

**全量层（收口用）**

- 同步上架：`node scripts/sync-skin.mjs`（skins/dsh-ui/ → C:\Users\pass\.dsh\skins\dsh-ui\，含 preview/ 子目录）
- 验收：隔离 web profile 实例 + Playwright 跑 `.agents/shots/` 现役脚本——`_m2_verify.py` / `_m3_verify.py` / `_m3_compare.py`（皮肤卡期）、`_m7_t6_verify.py` / `_m8_t8_verify.py` / `_m9_t9_verify.py` / `_m10_verify.py`（插件期，M10 为当前主脚本；完整起停与还原流程见 HANDOFF.md §8；桌面 GUI 有 token 认证，勿硬闯）

## 项目红线

- **M1–M4 纯皮肤期**：皮肤是**纯资产目录**——不写插件、不接 cordis 接线、不写 hooks.mjs（本地皮肤无执行权）。
- **M5 插件期**（自研 bundle 插件，已落地验收；形态与红线见 HANDOFF.md §5/§6）：
  - 插件目录 `plugins/dsh-theme/`：host 半负责开关持久化（官方 settings 服务优先），client 半负责样式注入与设置面板。
  - **client 半文件顶层零声明**：所有 `const`/`let`/`function` 必须进 factory 函数体或包 IIFE——client 脚本被合批拼进同一个 `<script>`、顶层作用域共享，跨包同名标识符会触发 `Identifier 'X' has already been declared` 并**整批解析失败**（见 HANDOFF.md §3.6）。
  - 插件版 CSS 由 `scripts/build-skin.mjs` **额外产出**，仍是构建生成物、**禁止手抄**。必须做成**自包含**文件，自包含有两层：① 复刻 loader 的 token 变换（作用域重写 + `--dsw-alias-*` → `--dsw-specific-*` 派生 + **var() 别名在深色 body 作用域重求值**——var() 在声明所在元素求值，:root 上的别名会锁死浅色，漏克隆深色即失效）；② client 半自带**语义锚点适配器**（patches.css 的 3 条 L2 规则靠 `data-dsh-part`/`data-dsh-surface` 属性，纯皮肤期由 skin-center 代打）。缺任一层都会撞上 M5 验收「与纯皮肤期一致」。
  - `ctx.effect` 红线：effect body 里做安装、**`return` 卸载函数**；卸载函数绝不能直接当 body 传（execute 会立即执行，装上即被同毫秒撤掉，且平台不报错）。
  - 插件启用/禁用只用 `disabled: true/false` 静态值，不依赖 `!!js` 表达式求值。
  - 插件激活时须确保 skin-center 皮肤退到**官方默认**，避免与插件双注入。
  - **Deepy 渲染必须走 slot 的 React 渲染注入**（`ctx.slots.inject` + `ctx.slots.register` 注册组件、用 ref 拿节点）。**不要手动 `appendChild` 进 slot 容器**——那是 React 拥有的节点，重渲染会清掉它不认识的子节点，导致「切会话后精灵永久消失」（M6 缺陷①，已修；回归脚本 `.agents/tmp/m6-e2e/repro_sprite_loss.py`）。
  - **瞬时态契约**：`persistent()` 只换 base、**不动瞬时态**；只有 `turn/start` 清瞬时态。照搬作者 HTML 的「持久态清瞬时态」会让规范给的 hold 值（4800/5200/3200ms）形同虚设（M6 缺陷②，实测 error 只活 10–270ms）。
  - **Deepy 素材是构建生成物**（`plugins/dsh-theme/assets/deepy/` 由 `scripts/build-deepy.mjs` 产出），**禁止手改**；改素材源后重跑该脚本。
  - **图标数据是构建生成物**：`assets/icons/lucide.json`（build-icons.mjs 产出，ISC 许可见同目录 LICENSE）与 `assets/icons/icon-map.json`（build-icon-map.mjs 产出）均禁止手改；改映射只改 `scripts/icon-map-overrides.json` 策展表后重跑。
  - **图标层指纹核心单一来源**：client.js 的 `@dsh-theme-icon-core` 标记段是唯一实现，构建脚本从它抽取执行；改了该段必须重跑 build-icon-map.mjs（coreHash 守卫会拦）。
  - **包含块红线（插件兼容）**：patches.css 不得对可能含插件注入内容的容器施加 transform/translate/rotate/scale/filter/perspective/will-change/contain/container-type——它们会把后代的 position:fixed 重新锚定到该容器（M8 的聚焦上浮曾把 po06 面板顶出窗口）。例外：伪元素、叶子元素（svg/按钮）、:active 瞬时态。
  - **Deepy 单鲸规则**：hero 迎宾位在场时输入卡主位不渲染（deepyMainVisible 纯函数），不要改成并存。
  - **M7 起视觉唯一来源 = design/tokens.css**（不再是 dsh-ui/preview/index.html）；design/preview.html 是设计源：token 增补走 #token-manifest 与 :root/深色变量块同步追加（守卫校验三者一致）；视觉方向重构才需要重新定调。
- 视觉数值唯一来源 = design/tokens.css（M7 起；由 design/preview.html 的 #token-manifest 经 `--regen-tokens` 机械生成）；skin.css 一律构建生成，**禁止手抄 hex/尺寸**。tokens.css 本身也是生成物，禁手改。手工维护物两个：`mapping.json`（L1 契约 token 映射）与 `skins/dsh-ui/patches.css`（L2/L3 组件规则 + 非 alias 命名空间重绑定），两者都只准用 `var(--dsh-*)` / `var(--dsw-*)` 引用数值，构建期会校验 `--dsh-*` 引用存在。
- 不改 DSH 本体、不改 dsh-ui（发现规范缺口回 dsh-ui 提）、不 fork dsh-claude-style。
- 使用本皮肤时 dsh-claude-style 必须关闭（README 写明）；skin-center 保持启用。

## 结构速览

- 文档边界见 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 决策史

- 改既有决策前先读 .agents/notes/implemented/ 归属笔记。
- .agents/retired/2026-10-03-m1-bundle/ = M1 的 bundle 遗物，**勿复活旧写法**（其 `ctx.effect` 用法正是 M1 静默失效的根因，见 HANDOFF.md §3.4）。被否的是写法不是形态：bundle 形态已于 2026-10-10 复活为 M5 正式形态，新代码见上方「M5 插件期」。