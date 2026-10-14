# DSH 插件能力边界调查报告（M5 形态选型输入）

- 调查日期：2026-10-27
- 调查方式：**纯静态**。未启动任何 dsh 实例，未访问 127.0.0.1:19387，未触碰 `profiles/web`。
- 工作目录：`E:\dsh-theme`；写范围仅 `.agents/tmp/m5-capability/`。
- 本机版本口径：asar 内 `@deepseek-ai/dsh-client-modules` 0.2.0-rc.2 系列；desktop profile 内 skin-center `0.4.5`、dsh-claude-style `0.12.2`。

## 证据强度标记约定

| 标记 | 含义 |
|---|---|
| **[活样本]** | 本机已安装并实际启用的插件源码/配置原文 |
| **[源码]** | asar 内 DSH 官方包源码或 README 原文 |
| **[配置]** | 本机 profile 配置文件原文 |
| **[推断]** | 由上述证据推导，未经直接观测 |

复核用脚本（本目录内，asar 读取必需——rg/glob 工具读不进 asar）：

- `asar.cjs` —— `node asar.cjs read <包内相对路径>` / `node asar.cjs ls <正则>`
- `asar-grep.cjs` —— `node asar-grep.cjs <正则> <路径正则> <扩展名正则> <上限>`
- `asar-slots.cjs` —— 全量 slot id 聚合（产出 `slot-catalogue.txt`）
- `asar-list.cjs` —— 目录树枚举

asar 绝对路径：`C:\Users\pass\AppData\Local\Programs\DeepSeek Harness\resources\app.asar\`（包内前缀 `dsh/node_modules/`）。

---

# 一、结论表（问题 → 答案 → 证据）

| # | 问题 | 答案（一句话） | 关键证据 | 强度 |
|---|---|---|---|---|
| Q1 | 客户端 UI 扩展点 / 注册 API / package.json 声明 | `ctx.slots.inject(slotId, () => ctx.slots.register(spec, Component))`；slot id 为字符串（如 `"settings.section"`）；package.json 需 `exports["./client"]` + `dsh.bundle.patch` + `dsh.client{platform:"web",inject:[]}` | skin-center `lib/client.js:5109-5122`；官方 `dsh-client-ui-settings-plugins/lib/client.js:201-202`；`dsh-client-modules/lib/index.js:713-727` | [活样本]+[源码] |
| Q1b | 设置面板开关能否用通用扩展点承载 | 能。`settings.section` 是公开的 root list slot，官方 5 个包 + 第三方 skin-center 都注册进同一位置 | `slot-catalogue.txt` 中 `settings.section` 的官方注册者为 **n=5**；**6 = 5 + skin-center**（后者是 profile 第三方包，不在 asar 聚合范围内，见 §Q1.2 计数口径脚注）；`dsh-client-ui-slots/README.md` slot 四型（single/list/keyed/chain） | [活样本]+[源码] |
| Q2a | 样式注入手段 | `document.createElement("style")` + `document.head.appendChild`。**全树零 `adoptedStyleSheets`**（唯一出现处是内置 pdf.js 的私有文档） | 官方 `dsh-client-ui-theme/lib/client.js:29,33,1016,1020,1184,1188`；skin-center `lib/client.js:118-125`；`dsh-client-ui-approval/lib/client.js:13-19` | [源码]+[活样本] |
| Q2b | 与官方主题的层叠关系 / 可逆性 | 同一 origin、同在 `<head>` 的 `<style>`，胜负由**特异性 + 文档顺序**决定；官方 token 声明在 `body{--dsw-*}`，插件用 `html[attr] body` 即稳定胜出。卸载靠「删元素 + 摘 documentElement 属性」 | `dsh-client-ui-theme/lib/index.js:55`（`data-ds-dark-theme`）；skin-center `lib/client.js:3815-3816, 3677, 3835, 4518-4519`；模块系统自身回收 `<style>`：`dsh-client-modules/lib/client.js:487-498` | [源码]+[活样本] |
| Q3 | 客户端能订阅哪些事件 / 够不够撑状态机 | 够。① Cordis 事件 `ctx.on(name, fn)`（`theme/change`、`locale/change`、`connection/reset`…）；② 会话流 `SessionEventStream`，**57 种**会话事件含 `turn/start|end`、`step/start|end`、`tool/call`、`tool/result`、`assistant/message`、`assistant/live-chunk`（流式增量）；③ `Session.getSnapshot().running` | `dsh-api-session-controller/lib/client.js:137-197, 398, 1413, 2278, 3192`；skin-center `lib/client.js:5076` | [源码]+[活样本] |
| Q4a | 开关状态放哪 | 三条路都通，推荐顺序：**官方 `settings` 服务（host 半 Config + `settings.configure`）> host 半自有路由写 $DSH_HOME > localStorage（仅非持久偏好）** | `dsh-claude-style/lib/host/settings.js:60-73`；skin-center `lib/client.js:4933`（`ctx.configForms`）、`3787-3791`（POST /api/skin-center/v2/active）；`dsh-client-ui-theme/README.md`「persists in `$DSH_HOME/cordis.patch.yml`」 | [活样本]+[源码] |
| Q4b | 切换时对样式做什么 | **删/建 `<style>` 或 `<link>` 元素 + 切 documentElement 上的 data 属性**，两者同进同退，不靠 `disabled` 属性 | skin-center `lib/client.js:3677`（`() => link?.remove()`）、`3815-3816`、`4518-4519`、`4524-4525` | [活样本] |
| Q4c | 状态由谁持久化 | **host 半**。client 半只发请求/写表单，落盘由 host 的 `settings` 服务或自有路由完成 | `dsh-claude-style/lib/host/settings.js:65-72`；skin-center host 半导出 `defaultActiveStatePath / readActiveSelection / writeActiveSelection`（`lib/index.js:3710`） | [活样本] |
| Q5a | bundle 是否出现在 GUI 插件管理页 | 是。侧边栏 **Plugins** 页（`@deepseek-ai/dsh-client-ui-plugin-manager`）列出 profile 持有的 bundles 与插件行；Settings → Built-in plugins 是只读清单 | `dsh-client-ui-plugin-manager/README.md`（Summary / Use this package 段） | [源码] |
| Q5b | enable/disable 由什么驱动 | Loader entry 的 `disabled` 选项（**字面量 true/false**），运行时切换写 `fiber.entry.options.disabled`；GUI 侧对应 `pluginManager_setBundleEnabled / setPluginEnabled` | `cordis-plugin-loader/lib/index.js:333-348, 361, 371, 637-638`；`dsh-api-remotes/lib/client.js`（`pluginManager_*` 方法名） | [源码] |
| Q5c | 本机实际生效证据 | desktop `cordis.patch.yml:305-310` 的 `- id: web-ui-skin-center … disabled: false` **覆盖** 同文件 `:83-85` 的 `disabled: true`；`:319-323` 的 `- id: ui-skin-claude-style / name: dsh-claude-style` 无 disabled 字段 = 启用 | `C:\Users\pass\.dsh\profiles\desktop\cordis.patch.yml`；`package.json` 的 `dsh.profile.bundles` 含 `dsh-claude-style` | [配置] |

---

# 二、候选形态对比表 + 推荐

| 维度 | A. 本地 bundle 插件（host 空半 + client 半） | B. 纯皮肤目录（现状 M1–M4） | C. 动态包（cordis-client-runner） | D. 纯 CSS 挂载（无插件） |
|---|---|---|---|---|
| 形态 | profile 依赖 + `dsh.bundle.patch` + `exports["./client"]` | `$DSH_HOME/skins/<id>/` 资产目录，skin-center 当唯一加载器 | 模型/用户在运行时写入并加载的 plain JS | profile 里挂一段样式 |
| 能注入样式 | 可以，`<style>`/`<link>` | 可以，由 skin-center 代注入 | 可以但受限 | 可以 |
| 能有设置面板开关 | 可以，`settings.section` 或 `settings.general.item` | 不行，只能借 skin-center 的面板 | 面板要有宿主 UI（`ui-cordis`），刷新即失 | 不行 |
| 能有自有 host 逻辑（二期 Deepy 事件钩子） | 可以，host 半 + client 半双面 | 不行，本地皮肤无执行权（项目红线） | 受 guard 白名单约束 | 不行 |
| 卸载/禁用是否干净 | 是，模块系统按 `data-plugin` 回收 `<style>`（`dsh-client-modules/lib/client.js:487-498`） | 是，skin-center 的 effect ledger | 是，但「刷新不恢复」是设计 | 是 |
| 本机活样本 | skin-center、dsh-claude-style | skin-center + `$DSH_HOME/skins/dsh-ui` | 无（未见已装载的动态包） | 无 |
| 主要风险 | M1 的 client 半激活链路（见 §四） | 能力天花板，用户已裁定为过渡 | 无 JSX/TS/imports、无 `fetch`/`setTimeout`、需用户手势/批准、刷新不恢复 | 没有开关 |

**推荐：A（本地 bundle 插件）**，理由：

1. 用户已裁定 M5 范围 = 样式注入 + 设置面板开关，只有 A 同时满足两项（B 无自有开关，D 无开关）。
2. A 是本机有**两个活样本**的形态，且二者的 package.json 声明形状、client 半包装形式完全一致（§三 Q1 证据），可复制性有实证。
3. 二期 Deepy 状态机需要事件钩子——只有 A 的 host/client 双面能拿到（B 的红线明确「本地皮肤无执行权」）。
4. 可逆性由平台兜底：模块系统自己 inventory 并回收插件注入的 `<style>` 标签，插件再叠一层 `ctx.effect` 逆操作即可。

**Plan B（若 A 的 client 半激活再次不通）**：退化为「host 半提供 HTTP 路由 + 皮肤目录里的 `patches.css`」，把开关做成 skin-center 皮肤目录的既有能力，而不是插件能力。代价 = 放弃自有设置面板与二期事件钩子，收益 = 绕开唯一未验证的那一跳。

**排除理由**：

- **C 动态包**：`dsh-cordis-client-runner/README.md` 原文——"A browser half is written in plain JavaScript — no JSX, no TypeScript, no module imports — and runs as an async function… browser globals like `fetch` and `setTimeout` are unavailable"，且 "Page refresh does not restore definitions"。常驻皮肤需要 `fetch`（拉皮肤清单）与常驻状态，C 两条都违背。
- **D 纯 CSS**：拿不到设置面板，不满足已裁定的 M5 范围。
- **B 现状**：用户已裁定为过渡路线（归属笔记 2026-10-03-project-scope-and-tech-route.md 修订二："纯皮肤降级为过渡路线…终局 = 自研皮肤插件"）。

---
# 三、五问证据章节

## Q1 · 客户端 UI 扩展点

### Q1.1 注册 API 名与调用形态

**活样本（skin-center）** —— `C:\Users\pass\.dsh\profiles\desktop\node_modules\@linxin666\dsh-client-ui-skin-center\lib\client.js`

```js
// :5109-5122
ctx.slots.inject("settings.section", () => {
  try {
    return ctx.slots.register({
      name: "settings.section",
      id: "skin-center",
      order: 120,
      label: () => ctx.locale.bind("skinCenter")("title"),
      locale: "skinCenter",
      inject: injected
    }, SkinCenterSection);
  } catch {
    return () => {};
  }
});
```

模块级服务声明（同文件 `:4914-4919`）：

```js
const inject = ["slots", "locale", "theme", "configForms"];
```

**官方等价写法**：`dsh-client-ui-settings-plugins/lib/client.js:201-202`、`dsh-client-ui-settings-general/lib/client.js:1171-1172`、`dsh-client-ui-agent-preset/lib/client.js:1685-1686`、`dsh-client-ui-settings-account/lib/client.js:4501-4505`、`dsh-client-ui-settings-models/lib/client.js:4059-4060` 全部是同一句 `ctx.slots.inject("settings.section", () => ctx.slots.register({ name: "settings.section", … }))`。

> **注意两层 inject 不是一回事**（M5 容易踩）：
>
> - **package.json 的 `dsh.client.inject`** = 客户端**模块依赖**（包名列表）。`dsh-client-modules/lib/client.js:656-659`：`for (const packageName of row.inject) { … await this.arriveDependency(…) }` —— 保证这些包的 client bundle 先到达。
> - **client 半模块级导出的 `inject`** = Cordis **服务名**列表（`slots` / `locale` / `theme` / `configForms`）。

### Q1.2 注册位置（slot id）清单

`dsh-client-ui-slots` 的 `SlotMap` 在本包内声明为空、由各消费方 `declare module` 合并（`dsh-client-ui-slots/README.md`："`SlotMap` is declared empty here and merged by consumers via `declare module` augmentation"）。因此 slot id 的权威清单只能从消费方代码里聚合。

聚合结果见 `slot-catalogue.txt`（由 `asar-slots.cjs` 生成，扫描 asar 内全部 `@deepseek-ai/dsh-client*` 的 `lib/*.js`）。与 M5 相关的关键条目：

| slot id | 用途 | 注册者数（仅统计 asar 内官方包） |
|---|---|---|
| `settings.section` | **设置面板的一级 section**（M5 开关首选落点） | 6（官方 5 + skin-center） |
| `settings.general.item` | General 设置页内的行 | 12 |
| `settings.plugins.tab` | Settings → Built-in plugins 的 tab | 1 |
| `plugins.item` | 插件配置页的行 | 4 |
| `shell.overlay` | 全屏浮层 | 10 |
| `sidebar.footer.action` | 侧边栏底部动作 | 1 |
| `main` | 主区 | 3 |
| `tool.call.toolview` | 工具调用视图 | 54（注册名段）/ 14（inject 目标段） |
| `conversation.chat.node` | 会话消息节点 | 19 |
| `conversation.input.overlay` | 输入框浮层 | 3 |

> **计数口径**：本表数字来自 `slot-catalogue.txt`，只覆盖 asar 内的 `@deepseek-ai/dsh-client*` 官方包；**skin-center 不在其中**（它是 profile 里的第三方包，不在 asar 内）。因此 `settings.section` 的官方注册者是 5 个，加 skin-center 后共 6 个。
> 另注：同一个 slot id 在聚合产物里会分别出现在「inject 目标段」（谁往这里注册/注入）与「注册名段」（谁声明了这个 slot），两段计数含义不同，`tool.call.toolview` 因此有两个数字。

slot 四型（`dsh-client-ui-slots/README.md` Use this package 段）：`single`（单占位）、`list`（有序多项）、`keyed`（按键分派）、`chain`（自荐选举）。`settings.section` 是 root list slot。

### Q1.3 package.json 需声明的字段（三要素之三）

**活样本对照**（两包声明形状一致）：

| 字段 | skin-center | dsh-claude-style | 作用 / 源码依据 |
|---|---|---|---|
| `"type": "module"` | 有 | 有 | ESM |
| `exports["."]` | `./lib/index.js` | `./lib/host/index.js` | host 半入口 |
| `exports["./client"]` | `./lib/client.js` | `./lib/client.js` | **必需**；缺失即抛错——`dsh-client-modules/lib/index.js:718-719` |
| `dsh.bundle.patch` | `./cordis.patch.yml` | `./cordis.patch.yml` | bundle 补丁层 |
| `dsh.client.platform` | `"web"` | `"web"` | **必需且必须是字符串**——`lib/index.js:65-66`；非 `"web"` 时该包在客户端扫描中被整体忽略（`:714-717`） |
| `dsh.client.inject` | 5 个包名 | `[]` | 客户端模块依赖，可选（`:66`） |
| `dsh.client.external` | 无 | 无 | 非基线模块请求，可选（`:67`） |
| `dsh.client.immediately` | 无 | 无 | 布尔，可选（`:68`） |
| `dsh.engines.dsh` | `>=0.1.7-rc.1` | `>=0.1.7` | 版本闸 |
| `icon` | `icon.svg` | `lib/claude-mark.svg` | 插件管理页卡片图标 |

关键源码原文（`dsh-client-modules/lib/index.js:713-719`）：

```js
const decl = parseDshClient(packageName, dsh !== null && typeof dsh === "object" ? dsh.client : void 0);
if (decl === void 0 || decl.platform !== "web") { this.pkgMeta.set(sourceKey, null); return null; }
const clientRel = clientExportOf(packageName, pkg.exports);
if (clientRel === void 0) throw new Error(`client-modules: ${packageName} declares dsh.client but exports no "./client" bundle`);
```

**cordis.patch.yml 必须插一行**（两样本一致）：

```yaml
# skin-center cordis.patch.yml（全文 6 行）
- insert:
    - id: ui-skin-center
      name: '@linxin666/dsh-client-ui-skin-center'
```

```yaml
# dsh-claude-style cordis.patch.yml（全文 4 行）
- insert:
    - id: ui-skin-claude-style
      name: 'dsh-claude-style'
```

**host 半必须存在，即使什么都不做** —— `dsh-client-ui-settings-plugins/README.md` 实现细节段原文：

> The Host half is an empty `apply`, present only so the package holds a Loader row the client module system serves the browser half for.

M1 的退役 bundle 自己也写明了这一点（`.agents/retired/2026-10-03-m1-bundle/host/index.js:5-8`）："without it `import('dsh-theme')` fails with ERR_PACKAGE_PATH_NOT_EXPORTED and the whole entry is reported as 'failed to import'"。

### Q1.4 client bundle 的包装形式（实际生效链路）

两样本与全部官方包的 client bundle 首行完全一致：

```js
window.__ModuleLoader__.load({
  id: "@linxin666/dsh-client-ui-skin-center",
  factory: (require) => { … exports.apply = apply; … return module.exports },
})
```

- skin-center `lib/client.js:1-3`（`:5125-5129` 收尾导出 `NS / apply / bootSkinRuntime / inject`）
- 官方 `dsh-client-ui-approval/lib/client.js:1-6`

加载侧由 `@deepseek-ai/dsh-client-modules` 承担（README）：host 半扫描已启用的 Loader entries 组合 boot graph，经 `/plugins` 服务；浏览器半惰性加载。**bundle 执行只注册 factory，模块体副作用（含 CSS 注入）在 factory 闭包里，materialize 时才跑。**

### Q1.5 「实际生效」证据（声明存在 ≠ 生效）

- **[配置]** desktop `cordis.patch.yml:305-310` 有 `- id: web-ui-skin-center / name: "@linxin666/dsh-client-ui-skin-center" / config: {skin-custom-theme: {applied: false}} / disabled: false`。
- **[配置]** desktop `package.json` 的 `dsh.profile.bundles` 数组含 `dsh-claude-style`；同文件 `dependencies` 含 `@linxin666/dsh-web-all` 与 `dsh-claude-style`（skin-center 经由 `@linxin666/dsh-web-all` 聚合 bundle 进入）。
- **[活样本]** skin-center 的 host 半导出了完整的运行态符号：`defaultActiveStatePath, loadSkinCatalog, readActiveSelection, writeActiveSelection, makeSkinCenterV2Routes, userSkinsDir, builtinSkinsDir`（`lib/index.js:3710`），且 `$DSH_HOME/skins/dsh-ui` 目录存在（本项目 M1–M4 产物已被它收录）。
- **[推断]** desktop `cordis.patch.yml:307-309` 里存着 `skin-custom-theme: {applied: false}`。**该键位于 skin-center 自己声明的配置命名空间下**，与它的 `Config`/`configForms` 命名空间一致，**因此推断**它曾由该插件的 settings 链路写入过。**注意**：静态配置文件本身不能证明写入者、写入时刻或写入路径——手工编辑同样能产生这一行。故此项只作为「该 entry 存在于 profile 且被赋予过自有命名空间配置」的证据，不单独作为「运行生效」的证据。

> **未取得的证据**：插件管理页列表的 DOM 或截图（本任务禁起实例）。Q5a 因此只有源码/README 级证据，见 §五剩余风险 R2。

---

## Q2 · 样式注入

### Q2.1 手段：`<style>` 元素，不是 `adoptedStyleSheets`

官方编译产物里 CSS Modules 的标准注入模板（`dsh-client-ui-approval/lib/client.js:11-19`）：

```js
const css = "…";
const tagId = "@deepseek-ai/dsh-client-ui-approval/ApprovalPanel.module.css";
if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
  const tag = document.createElement("style");
  tag.dataset.plugin = "@deepseek-ai/dsh-client-ui-approval";
  tag.dataset.pluginCss = tagId;
  tag.textContent = css;
  document.head.appendChild(tag);
}
```

skin-center 是**逐字相同**的模板（`lib/client.js:118-125`，`tag.dataset.plugin = "@linxin666/dsh-client-ui-skin-center"`）。

**`adoptedStyleSheets` 在整棵 DSH 树里只出现 1 处**，且是内置 pdf.js 渲染自己的私有文档（`dsh-client-ui-sidebar-documentpreview/lib/client.pdf.js:7757-7760`），与插件系统无关。

> **结论：本机 DSH 的标准做法就是 `<style>` 元素，没有 adoptedStyleSheets 通道。**

官方主题包自身也是 `<style>` 注入：`dsh-client-ui-theme/lib/client.js:29/33`、`:1016/1020`、`:1184/1188` 全是 `document.createElement("style")` + `document.head.appendChild(tag)`。

### Q2.2 skin-center 具体怎么做（三种注入并存）

skin-center 的样式不是一份，而是**三条独立通道**：

**(a) 自己的 UI 样式**：编译期 CSS Modules，注入 `<style data-plugin data-plugin-css>`（`:118-125`），全局生效、以 `body[data-dsh-skin-center]` 作用域限定。

**(b) 皮肤载荷**：`<link rel="stylesheet">`（`:3612-3626`）

```js
const loadStylesheet = deps.loadStylesheet ?? ((href) => new Promise((resolveLink, rejectLink) => {
  const link = doc.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  const timer = setTimeout(() => rejectLink(new Error(`stylesheet load timeout: ${href}`)), 15e3);
  link.onload = () => { clearTimeout(timer); resolveLink(); };
  link.onerror = () => { clearTimeout(timer); rejectLink(new Error(`stylesheet load failed: ${href}`)); };
  doc.head.appendChild(link);
}));
```

挂载点 `${apiBase}/skins/${id}/stylesheet`（`:3802`）与可选 `…/patches`（`:3803, 3807`）。

**(c) 自定义主题**：一个常驻 `<style data-dsh-custom-theme-style>`（`:4403-4405`），内容由 `syncDom()` 重写（`:4522`）。

### Q2.3 可逆性（M5 选型硬指标）

skin-center 用「effect ledger + 元素引用」实现原子切换与干净卸载，四处证据：

1. **登记逆操作**（`:3677`）：`ledger.record(activation, "style:" + label, () => link?.remove());`
2. **切换时销毁上一代**（`:3835`）：`if (previous !== null) ledger.disposeActivation(previous);`
3. **根属性同进同退**（`:3815-3816`）：
   `if (id === null || withheld) doc.documentElement.removeAttribute("data-dsh-skin");`
   `else doc.documentElement.setAttribute("data-dsh-skin", id);`
4. **dispose 全清**（自定义主题，`:4518-4519`）：
   `this.style.remove();`
   `this.doc.documentElement.removeAttribute("data-dsh-custom-theme");`

**平台还兜了一层**：`dsh-client-modules/lib/client.js:487-498` 的 `claimStyles(id)` 在 materialize 时把工厂注入的 `<style>` 打上 `data-plugin` 标记并登记，插件卸载/HMR 时按标记回收。

> **注意**：皮肤开关**没有用 `disabled` 属性**，也没有用 `<link disabled>` —— 是**建/删元素**。这直接影响 M5 的实现选型（见 Q4b）。

### Q2.4 与官方主题机制的层叠关系

官方主题的两件事：

1. **token 表**：`dsh-client-ui-theme` 把 8 张表（`base.css / corner-shape.css / design-platform.css / focus.css / onboarding.css / scrollbar.css / gradient-shadow-text.css / shiki.css`）以 `<style>` 注入 `<head>`（`lib/client.js:1016-1020, 1184-1188`）。这些表把 `--dsw-*` 声明在 **`body`** 选择器上——例：`design_platform_css_default` 以 `body{--dsw-static-amber-100:#fef5e7;…}` 开头（`lib/client.js:1148`）；`onboarding_css_default` 同为 `body{…}`（`:1154`）。
2. **明暗开关**：`dsh-client-ui-theme/lib/index.js:55`（在 boot body script 里）
   `document.body.toggleAttribute('data-ds-dark-theme', dark)`
   同文件 `:39-45` 的 `bootThemeStyle()` 还在 head CSS 里先写 `:root{color-scheme:…}body{background-color:…}` 抢首屏。

**层叠结论（[推断]，由选择器特异性推出）**：

- 双方同 origin、同在 `<head>` 的 `<style>` 里，**文档顺序只在特异性相同时才起作用**。
- 官方 token 的宿主是 `body`（特异性 0,0,0,1）。
- 插件只要用 `html[data-dsh-xxx] body`（0,0,1,2）或 `body[data-dsh-xxx]`（0,0,1,1）就**稳定胜出，与注入顺序无关**。
- skin-center 正是这么做的：自己的作用域选择器 `body[data-dsh-skin-center] .TJMolG_*`（`lib/client.js:117`）；皮肤作用域 `html[data-dsh-skin]`（`:3229`）；自定义主题作用域 `html[data-dsh-custom-theme]:not([data-dsh-skin]) body`（`:4380`）——注意它还专门用 `:not([data-dsh-skin])` 做了**与皮肤互斥**的优先级处理，这正是 M5 若与 skin-center 并存需要参考的写法。
- `body[data-ds-dark-theme]` 只影响**官方 token 的取值**（暗色表），不影响插件规则本身的命中；插件若想跟随明暗，需要自己写 `body[data-ds-dark-theme]` 变体——skin-center 的自定义主题就是双份 `block("…body", light)` / `block("…body[data-ds-dark-theme]", dark)`（`:4380`）。

---

## Q3 · 事件订阅（二期 Deepy）

**结论：够。** 客户端有两条独立的事件通道，都可用。

### Q3.1 通道一：Cordis 事件总线 `ctx.on(name, handler)`

| 事件名 | 证据 |
|---|---|
| `theme/change` | skin-center `lib/client.js:5076`；`dsh-client-ui-theme/lib/client.js:1595`；`dsh-client-ui-layout/lib/client.js:677`；`dsh-client-ui-sidebar-terminal/lib/client.js:461` |
| `locale/change` | `dsh-client-locale/lib/client.js:1528`；`dsh-client-ui-input-trigger/lib/client.js:893` |
| `connection/reset` | 10+ 个包（`dsh-client-ui-goal/lib/client.js:580`、`dsh-client-ui-tool/lib/client.js:4551`、`dsh-client-ui-workspace/lib/client.js:4160` …） |
| `slash/input-begin-command` 等 | `dsh-client-ui-conversation/lib/client.js:14263-14266`（waterfall 式，返回值参与裁决） |

返回 `off()`，可直接塞进 `ctx.effect` 做逆操作（skin-center 的 `subscribe` 就是这么暴露给面板的）。

### Q3.2 通道二：会话事件流（流式输出 / 工具调用）

**服务提供方**：`@deepseek-ai/dsh-api-session-controller` —— `lib/client.js:3192`：`rootCtx.reflect.provide("sessions", this, void 0)`

**取用方式**（`dsh-api-session-controller/README.md` "Client references" 段原文）：

> `sessions.retain(target, { source, signal? })` immediately acquires one exact Client generation and starts its shared initial history opening… The returned reference supports idempotent `release()` and `Symbol.dispose`; its `ready` Promise follows the shared `Session.open()` result… `sessions.using(target, options, operation)` waits for that settlement, holds its reference until the callback settles.

**流对象**：`SessionEventStream extends RemoteJournalStream`（`:398`），"publishes only contiguous `replace`, `prepend`, `append`, and `settle-assistant` changes"（README）。分页有两个动词：`loadOlder()` 与 `loadThrough(seq)`。

**事件类型全表**（`lib/client.js:137-197`，`KNOWN_SESSION_EVENT_TYPES`，共 57 项）。与 Deepy 状态机直接相关的：

```text
turn/start          turn/end
step/start          step/end
tool/call           tool/result
tool/ptc-dispatch   tool/ptc-dispatch-start
assistant/attempt   assistant/message
user/message        system/message   developer/message
approval/asked      approval/decided  approval/policy
plan/mode           todo/write
subagent/catalog    subagent/descriptor
goal/change         schedule/change
compaction/start    compaction/end    compaction/summary
request/header      request/context
llm/retry           llm/retry-started
model/selection     permission/preset   sandbox/mode
hook/invoked        hook/result
workspace/changes   session/title     session/end-seed
team/task           team/member       team/message/queued  team/message/delivered
tool-workflow/run-start  tool-workflow/run-end
tool-workflow/agent-start  tool-workflow/agent-end
deliverables/presented   feedback/record
```

**流式增量**（Deepy 最需要的那一条）：`assistant/live-chunk` —— `lib/client.js:1413, 1476` 构造该类型；README 原文：

> The Web adapter explicitly opts into cursorless Assistant frames… every stream member becomes a Client-only `assistant/live-chunk` entry ordered between durable cursors.

**运行态**：`Session.getSnapshot().running`（`lib/client.js:1137 / 1957` 的 `getSnapshot()`，`:2278, 2694, 2707, 2737, 2865, 3530` 的 `running` 字段）。

**够不够撑状态机**：够。Deepy 需要的三类输入齐备——① 状态变化（`turn/start|end`、`step/start|end`、`running` 快照）；② 工具调用（`tool/call` → `tool/result`，含 PTC 分派）；③ 流式文本（`assistant/live-chunk`）。且通道是**订阅式 + 可释放**（`release()` / `Symbol.dispose` / `off()`），符合 Cordis 可逆效应纪律。

> **未验证**：`sessions.retain` 在第三方 client 半里的**实际调用样本**本机没有（skin-center 不订阅会话流）。上表全部来自 asar 官方源码与 README 原文，未经活样本运行验证。列为剩余风险 R3。

### Q3.3 下一步可查位置（若二期 Deepy 要续查）

| 目标 | 位置 |
|---|---|
| 会话事件流的类型定义与 wire 校验 | `dsh-api-session-controller/lib/client.js`（`SessionEventStream` `:398`、`assertSessionWireEvent`、`toSessionJournalChange`） |
| 事件名到载荷结构 | 同上 `:137-197`（类型表）+ `:200-300`（surface 判定与载荷分支） |
| 客户端 sessions 服务全貌 | `dsh-api-session-controller/lib/client.js` 内 `provide("sessions", this)` 的类定义（`:3192` 附近） |
| 渲染侧事件桥 | `dsh-client-ui-renderer/lib/invariant.js:16`（`ctx.on("internal/dispatch", …)`） |
| 动态包可用的事件探针 | `dsh-cordis-client-runner/lib/client.js` 的 providers（first-party client Inspect Providers: slots / theme / events） |
| 客户端服务的完整注册表 | 在 asar 内 grep `ctx.provide(` 与 `reflect.provide(` |

---

## Q4 · 设置持久化

按任务要求拆成三个可执行子问。

### Q4a 开关状态放哪

三条路本机都有证据，按推荐度排序：

**(1) 官方 `settings` 服务（推荐）** —— `dsh-claude-style/lib/host/settings.js`

```js
// :60-62 用 Schemastery 声明本插件自己的配置命名空间
var Config = SchemaFactory === null ? void 0 : SchemaFactory.object(Object.fromEntries(
  Object.keys(PREFS_DEFAULT).map((key) => [key, volatileField(prefsField(SchemaFactory, key))])
));

// :63-73 注册进官方 settings 服务
function registerSettings(ctx) {
  if (typeof ctx.inject !== "function") return;
  ctx.inject(["settings"], (scope) => {
    const settings = scope.settings;
    if (typeof settings?.configure !== "function") return;
    scope.effect(
      () => settings.configure({ auto: false }, ctx.fiber),
      "dsh-claude-style: settings presentation"
    );
  });
}
```

落盘位置（`dsh-client-ui-theme/README.md` Summary 段原文）：

> A loopback client stores both values in the `ui-theme` settings namespace, which the local provider persists in `$DSH_HOME/cordis.patch.yml` by default.

**[配置] 实际落盘证据**：desktop `cordis.patch.yml:305-310`

```yaml
- id: web-ui-skin-center
  name: "@linxin666/dsh-client-ui-skin-center"
  config:
    skin-custom-theme:
      applied: false
  disabled: false
```

—— 插件自己命名空间下的状态（`skin-custom-theme.applied`）就写在 profile 的 patch 文件里，和 `disabled` 同级。

**(2) client 半的 configForms 绑定** —— 当插件想在自己 section 里渲染一个可编辑表单：

```js
// skin-center lib/client.js:4929-4934
function bindConfigForm(ctx) {
  const binder = ctx.get("webUiSettings");
  if (binder !== void 0 && typeof binder.bind === "function") return binder.bind({ namespace: SKIN_BACKGROUND_NS });
  return boundConfigForm(ctx.configForms);
}
```

即 `ctx.configForms`（服务名，见 `inject` 数组 `:4918`）把 profile 里那条 entry 的 config 暴露成表单。

**(3) host 半自有 HTTP 路由 + 自有文件** —— skin-center 的皮肤选择：

```js
// lib/client.js:3787-3791
await fetchImpl("${apiBase}/active", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ active: id })
});
```

host 半对应导出 `defaultActiveStatePath / readActiveSelection / writeActiveSelection`（`lib/index.js:3710`），即一个写在 `$DSH_HOME` 下的自有状态文件。这条适合**不属于 settings schema 的运行时状态**。

**(4) localStorage —— 只用于非持久偏好**。skin-center 里 `localStorage` 的全部用法（`lib/client.js:4825, 4828, 4837-4839, 4853, 4875`）只服务于一个**每日心跳去重戳**（`DAY_KEY_PREFIX + today`），不是配置。

### Q4b 切换时对样式做什么

skin-center 的模式 = **元素增删 + documentElement 属性切换**，二者必须同进同退：

| 动作 | 代码 |
|---|---|
| 开：建 `<link>` 并登记逆操作 | `lib/client.js:3804-3805` → `:3677` |
| 开：打根标记 | `:3816` `doc.documentElement.setAttribute("data-dsh-skin", id)` |
| 关：销毁上一代 | `:3835` `if (previous !== null) ledger.disposeActivation(previous);` |
| 关：摘根标记 | `:3815` `doc.documentElement.removeAttribute("data-dsh-skin")` |
| 自定义主题同构 | `:4522` `this.style.textContent = buildCustomThemeCss(this.config)` + `:4524-4525` 切 `data-dsh-custom-theme` |

**没有用 `disabled` 属性**。M5 的开关照抄这个模式即可，平台还会再兜一层回收（`dsh-client-modules/lib/client.js:487-498` 的 `claimStyles`）。

### Q4c 状态由谁持久化

**host 半**。client 半只负责发请求 / 渲染表单，落盘由 host 侧完成：

- 走官方 settings：host 半的 `settings.configure(...)` + `Config` schema（`dsh-claude-style/lib/host/settings.js:65-72`），由 local provider 落到 `$DSH_HOME/cordis.patch.yml`。
- 走自有路由：host 半 `makeSkinCenterV2Routes(...)` + `writeActiveSelection(...)`（`lib/index.js:3710` 导出）。

---

## Q5 · 插件管理页

### Q5a 装进 profile 的 bundle 是否出现在 GUI 插件管理页

**是**，但分两个不同界面：

| 界面 | 包 | 内容 |
|---|---|---|
| 侧边栏 **Plugins** 页 | `@deepseek-ai/dsh-client-ui-plugin-manager` | 管理 profile 的 bundles 与插件行：开关、安装、卸载、配置。README Summary 原文："Use the **Plugins** entry in the Web sidebar to manage the profile's installed bundles and the official bundles the installation ships switched off. Switch bundles and their rows on and off…"；"**Installed** lists the bundles the profile holds." |
| Settings → **Built-in plugins** | `@deepseek-ai/dsh-client-ui-settings-plugins`（+ `-plugin-inventory` 供 tab） | **只读**清单与运行时状态 |

数据来源：插件管理页 "reads the inventory and the bundles through `api-remotes`"（README）。host 侧 Remote 方法清单（`dsh-api-remotes/lib/client.js` 内 `pluginManager_*` 符号去重）：

```text
pluginManager_listBundles           pluginManager_listPlugins
pluginManager_setBundleEnabled     pluginManager_setPluginEnabled
pluginManager_installBundle        pluginManager_removeBundle
pluginManager_inspect              pluginManager_cancelInstall
pluginManager_waitForInstall       pluginManager_registries
pluginManager_listVersionExemptions pluginManager_setVersionExemption
```

→ **`setBundleEnabled` / `setPluginEnabled` 就是 GUI 开关的后端**。

> **强度边界（必须连同结论一起引用）**：本问的全部证据是**官方包的 README 原文 + Remote 方法清单源码**，**没有** GUI 层实证（本任务禁起实例，无 DOM、无截图）。因此准确表述是「**按官方契约，装进 profile 的 bundle 会出现在 Plugins 页；本调查未在运行中的界面上确认这一点**」，**不是**「已验证会出现在插件管理页」。见剩余风险 R2。

### Q5b enable/disable 由什么驱动

**Loader entry 的 `disabled` 选项**，源码原文（`@deepseek-ai/cordis-plugin-loader/lib/index.js`）：

```js
// :333-348
/** True when this entry or any owning parent entry is disabled. */
get disabled() {
  …
  if (this.disabledOf(entry.options)) return true;
  …
}
/**
 * Effective disabled state: a !!js expression evaluates against the loader …
 */
disabledOf(options) {
  return isJsExpr(options.disabled) ? Boolean(this.evaluate(options.disabled.__jsExpr)) : Boolean(options.disabled);
}

// :361 / :371
if (this.disabled) return;          // 不激活

// :637-638 运行时切换
if (fiber.entry.disabled) return;
fiber.entry.options.disabled = true;
```

### Q5c 本机实际生效证据（`disabled` 字段所在文件原文行）

`C:\Users\pass\.dsh\profiles\desktop\cordis.patch.yml`：

```yaml
# :83-85（前层）
- id: web-ui-skin-center
  name: "@linxin666/dsh-client-ui-skin-center"
  disabled: true

# :305-310（后层，覆盖前层）
- id: web-ui-skin-center
  name: "@linxin666/dsh-client-ui-skin-center"
  config:
    skin-custom-theme:
      applied: false
  disabled: false

# :319-323（无 disabled 字段 = 启用）
- id: ui-skin-claude-style
  name: dsh-claude-style
  config:
    brand: claude
    mascot: brand
```

- 同文件共 **26 处 `disabled:`**（`:42,46,49,52,55,58,61,64,67,70,73,76,79,82,85,88,91,304,310,312,318,325,331`），全部是**字面量 true/false**。
- 与归属笔记 2026-10-03-project-scope-and-tech-route.md 修订段的记载一致：「desktop profile 中它本就已启用（cordis 后层 `disabled:false` 覆盖前层 `true`）」。
- desktop `package.json` 的 `dsh.profile.bundles` 含 `dsh-claude-style`；skin-center 经 `@linxin666/dsh-web-all` 聚合 bundle 进入（该包 `dsh.bundle.patch = ./cordis.patch.yml`）。

> **一处与技能记载的冲突（诚实标注）**：`dsh-plugin-dev` 技能记载官方 postmortem 0002——「`disabled` 上写 !!js 表达式永远为真」。但**本机 loader 源码 `lib/index.js:348` 明确对 `disabled` 做了 `isJsExpr` 求值**。二者口径不一致，本调查不裁决，也不依赖该路径（本机 profile 全部用字面量）。列为待复核决策点 D3。

---
# 四、M1 复盘对照：M5 是否会重踩同一个坑

对照材料：`HANDOFF-M1.md`（SUPERSEDED）、`.agents/retired/2026-10-03-m1-bundle/`、归属笔记 `.agents/notes/implemented/feature/2026-10-03-project-scope-and-tech-route.md`。

## 4.1 M1 的已知事实

- 装配四层全绿（bundle 声明、profile 装配、包安装、client 脚本被服务端投递），**最后一跳未证实**：`HANDOFF-M1.md:13-14`「这四层全部已验证为绿；但页面里看不到橙色，说明 client 半拿到了代码却没跑起来，或跑了但样式没生效」。
- 归属笔记修订二（`:42`）把根因定为 M5 的**开工前置条件**：「插件期开工前置条件 = 根因自制 bundle client 半未激活问题（本机有 skin-center 活样本对照）」。

## 4.2 逐条对照

| M1 的结论/假设 | M5 是否重踩 | 证据 |
|---|---|---|
| **§9.1** 包装形态不对已排除 | **不重踩**（该结论成立） | skin-center `lib/client.js:1-3` 与官方 `dsh-client-ui-approval/lib/client.js:1-6` 用的是**逐字相同**的 `window.__ModuleLoader__.load({id, factory})` 包装，且本机可用 |
| **§9.2** 「动态 client 半执行模型…闭包陷阱遮蔽 `setTimeout`/`setInterval`/`fetch`/`require`…M2+ 严禁在 client 半用 timer/fetch/require」 | **不重踩，且这条约束本身是误判** | `@deepseek-ai/dsh-cordis-client-runner` 是**动态包**运行器，不是静态 bundle 加载器。其 README 原文："runs the browser half of **process-local dynamic packages**"；"A browser half is written in plain JavaScript — no JSX, no TypeScript, no module imports — and runs as an async function… browser globals like `fetch` and `setTimeout` are unavailable"；"Page refresh does not restore definitions"。而 M1 的 bundle 是**静态 profile bundle**，由 `@deepseek-ai/dsh-client-modules` 经 `/plugins` 组合 URL 服务。**反证**：skin-center 是静态 bundle（`window.__ModuleLoader__` 包装），它的 client 半 `lib/client.js:3996` 直接 `fetch.bind(doc.defaultView)`、`:3616` 用 `setTimeout`，`inject` 数组里**没有 `timer`**，而它在本机是可用状态。→ **M1 §9.2 的约束对静态路径不成立，M5 不必遵守。** |
| **§9.4 假设 1** roster 行在 web 层没被激活 | **未定论** | 本任务禁起实例，无法做活页面三行探针。静态证据无法区分「行没激活」与「factory 跑了但样式没生效」 |
| **§9.4 假设 2** host 半 mount 失败 | **未定论** | 静态证据无法判定 |
| **§9.4 假设 3** desktop 与 web 的 client 装配差异 | **仍未验**（M1 只在 web profile 验过） | `HANDOFF-M1.md:33`「至今只在 web profile 验过，desktop 未验」。M5 目标恰是 **desktop profile**，这条风险直接落在 M5 上 |
| M1 bundle 的声明形状是否有静态缺陷 | **未发现缺陷** | 退役 bundle `package.json`（`main: host/index.js`、`exports["."]`、`exports["./client"]`、`dsh.bundle.patch`、`dsh.client{platform:"web",inject:[]}`、`type: module`）与 skin-center / dsh-claude-style 的声明集**同构**；host 半 `export const name / inject` + `export function apply`（无 default export）也符合规范 |

### 4.2.1 §9.2 误判的证据链（补齐反证的关键一环）

顾问复核指出：§9.2 的反证原本只到「skin-center 是静态 bundle 且用了 fetch/setTimeout」，**缺「静态路径的执行机制本身不设闭包陷阱」这一环**。现补齐，两处源码核对已完成：

**(1) 静态 client 半是直接调用 factory，不是闭包求值** —— `dsh-client-modules/lib/client.js:670-695`（`materialize()`）：

```js
/** Materialize a registered factory (synchronous; memoized in loadCache). */
materialize(id, ownerId = id) {
  const existing = this.loadCache.get(id);
  if (existing !== void 0) return existing;
  const registered = this.factories.get(id);
  if (registered === void 0) throw new Error(`client-modules: no registered factory for "${id}"`);
  …
  const record = {
    id,
    exports: registered.factory(this.makeRequire(ownerId, edges)),   // :683 ← 直接调用
    styles: claimStyles(ownerId),
    edges
  };
  …
}
```

（**说明**：上面是 670-695 的**压缩节选**，省略了 throw 的完整文本与 try/catch/finally 收尾；**逐字全文**见 `m1-reversal-evidence.md` 的 E1 段，可一键复核。）

关键点：`:683` 是 `registered.factory(this.makeRequire(...))` —— **普通的同步函数调用**，参数是一个真的 `require` 函数（`:697-706` 构造）。对比动态路径：`dsh-cordis-client-runner/README.md` 原文 "The browser half's source is evaluated as an async function body with the symbol surface as parameters" —— 那才是闭包求值。

**(2) 静态加载器里没有闭包求值原语** —— 对 `dsh-client-modules/lib/client.js` 全文 grep `new Function` / `AsyncFunction`：**命中 0 次**。

**(3) 反证活样本（本次已逐行核对）** —— `skin-center/lib/client.js`：

| 行 | 内容 |
|---|---|
| `:3996` | `const fetchImpl = options.fetchImpl ?? fetch.bind(doc.defaultView);` |
| `:3616` | `const timer = setTimeout(() => rejectLink(new Error(…)), 15e3);` |
| `:4914` | `const inject = [ … ]`；全文 `"timer"` 出现 **0 次** |

即：一个静态 bundle 的 client 半**在 inject 未声明 timer 的情况下**直接用 `fetch` 与 `setTimeout`，且该插件在本机处于启用状态。

→ **§9.2 判为误判的证据链现为闭环**：动态路径的约束来自闭包求值（有 README 原文），静态路径走同步 factory 调用（有源码 `:683` + 无闭包原语），活样本在静态路径上突破了该约束（有逐行证据）。

## 4.3 本节结论

1. **M1 那条被写进 HANDOFF 的具体禁忌（client 半禁用 fetch/timer/require）是误判**，把动态包运行器的约束安到了静态 bundle 头上。M5 在静态 bundle 里用 `fetch`/`setTimeout` 有本机活样本背书。
2. **M1 的根因仍然未定**。本调查能排除的是「包装形态」与「package.json 声明形状」两类静态嫌疑，**不能**排除「roster 行未激活」「host 半 mount 失败」「desktop 装配差异」三类。→ 按验收标准记「**证据不足 + 卡在哪**」：卡在必须有一台运行中的实例做活页面探针，本任务边界明确禁止起实例。
3. **对 M5 的直接建议**：把「client 半激活」做成 M5 的**第一个独立验收门**——一个只改背景色的探针 + 三行 Playwright 检查（`document.querySelector('style[data-plugin="<pkg>"]')` 是否存在、`documentElement` 上探针属性是否存在、计算样式是否变化），过了这道门再投视觉工作量。这正是 M1 §9.4 自己给出的方法（`HANDOFF-M1.md:100`），只是当时没执行。

---

# 五、剩余风险

| ID | 风险 | 影响 | 现有证据强度 | 消除方式 |
|---|---|---|---|---|
| R1 | **desktop profile 的 client 装配从未被验证**（M1 只在 web profile 验过） | 直接决定 M5 形态 A 是否可行 | 无（未验） | 在 desktop profile 装一个探针 bundle，做活页面三行检查 |
| R2 | **Q5a 没有 GUI 层实证**（禁起实例 → 无 DOM/截图） | 插件管理页是否真的列出本地 bundle，只有 README 级证据 | [源码] 声明原文 | 起实例后截 Plugins 页与 Settings → Built-in plugins 页 |
| R3 | **Q3 的 `sessions.retain` 无第三方调用样本** | 二期 Deepy 接入时可能踩未知约束（source key 冲突、`connection/reset` 重连语义） | [源码]+README，无活样本 | 二期开工前写一个最小订阅探针 |
| R4 | **skin-center 与本插件的作用域互斥纪律** | 两者都用 `html[data-dsh-*]` + `body[data-dsh-*]` 作用域；同时注入时谁赢取决于选择器特异性，可能产生「两套皮肤叠加」 | skin-center 的 `:not([data-dsh-skin])` 写法可参考（`lib/client.js:4380`） | 需用户裁定并存/关闭策略（见 D2） |
| R5 | **`disabled` 与 !!js 的口径冲突** | 若 M5 想在 patch 里写条件表达式控制开关，行为不确定 | 源码说会求值，技能说恒真 | 不依赖该路径；若要依赖，先起实例实测 |
| R6 | **本报告全部为静态证据，无一条运行时验证** | 「声明/源码存在」不等于「运行生效」——这正是 M1 §8 的教训 | — | 按 §4.3 第 3 条设激活门 |

---

# 六、待复核决策点

> 按任务书要求「遇歧义选可逆性强的方案继续，并醒目标注」。以下决策点本轮**均未执行**，只记录。

**D1 · 复活 bundle 路线需回写项目文档（本轮禁改项目文件）**
M5 采纳形态 A 意味着归属笔记 `2026-10-03-project-scope-and-tech-route.md` 的「修订（2026-10-03 二轮调研）：技术路线推翻——改走 skin-center 皮肤目录」需要再修订一次，且 `docs/spec.md`、`docs/milestones.md`、`ARCHITECTURE.md`、`AGENTS.md`（红线「不写插件、不接 cordis 接线」）都要同轮回写。按全局 AGENTS.md「一事一处 / 归属笔记」纪律，这属于**必须由用户确认后执行**的动作。本轮写范围仅 `.agents/tmp/m5-capability/`，未动任何项目文件。

**D2 · M5 与 skin-center 的并存/替代策略需用户裁定**
现有红线（`AGENTS.md:21`）：「使用本皮肤时 dsh-claude-style 必须关闭；skin-center 保持启用」。M5 若注入样式，会撞上同一条冲突纪律：

- **方案甲（并存）**：M5 只做 skin-center 覆盖不到的注入能力，用 `html[data-dsh-m5]:not([data-dsh-skin])` 式互斥作用域（参考 skin-center `lib/client.js:4380` 的写法）。代价 = 两套作用域并存，需要严格的互斥纪律。
- **方案乙（替代）**：M5 最终取代 skin-center 的加载器角色。代价 = 要重做皮肤目录扫描、catalog、原子切换（skin-center `lib/client.js` 里 `bootSkinRuntime` / `createSkinController` / `effect-ledger` 那一整套），且会与现有 `$DSH_HOME/skins/dsh-ui` 上架流程冲突。

本调查不阻塞，两套取舍已列入 §二对比表。

**D3 · `disabled` 是否可用于条件开关（!!js 口径冲突）**
见 R5。本轮未裁决，也不建议 M5 依赖。

**D4 · 「client 半激活门」是否作为 M5 的第一个里程碑**
§4.3 第 3 条建议。这会改变 `docs/milestones.md` 的里程碑切分，需用户确认。

---

# 附录 A · 复核命令速查

```bash
cd E:/dsh-theme/.agents/tmp/m5-capability

# 读 asar 内任意文件
node asar.cjs read 'dsh/node_modules/@deepseek-ai/dsh-client-ui-slots/README.md'
node asar.cjs read 'dsh/node_modules/@deepseek-ai/dsh-api-session-controller/lib/client.js'

# 在 asar 内按正则搜索
node asar-grep.cjs 'ctx\.slots\.inject' 'dsh-client' '\.js$' 120

# 重新生成 slot id 全量清单
node asar-slots.cjs 'dsh-client' > slot-catalogue.txt
```

> 注意：MSYS2 bash 会把以 `/` 开头的参数当路径改写，asar 工具的参数**不要带前导斜杠**。

# 附录 B · 本次落盘的产物

| 文件 | 内容 |
|---|---|
| `capability-report.md` | 本报告 |
| `conclusion-table.md` | 可直接引用的结论表（问题 → 答案 → 证据） |
| `slot-catalogue.txt` | asar 内全部 slot id 聚合（inject 目标 / register 名 / renderSlot 名） |
| `asar.cjs` / `asar-grep.cjs` / `asar-slots.cjs` / `asar-list.cjs` | asar 读取与检索脚本 |
