# M5 前置调查 · dsh-theme client 半未激活 —— 根因定位报告

日期：2026-10-10 ｜ 调查者：子代理（M5 前置调查任务）｜ 结论级别：**已验证（活页面实证 + 变异证伪）**
工作目录 E:\dsh-theme（只读）；实验产物全在 `.agents/tmp/m5-rootcause/`；项目文件未改。

---

## 0. 一句话根因

**不是"没激活"，是"激活了又被自己立刻撤掉"。**

retired 的 `lib/client.js` 把 **卸载代码当成了 `ctx.effect` 的 effect body** 传进去；
Cordis 的 `effect(execute)` **会立即执行 execute**，并把它的**返回值**登记为 disposer。
于是 `apply()` 刚 append 的 `<style id="dsh-theme-style">` 和刚设上的 `data-dsh-theme` 属性，
在**同一个同步 tick 内**（实测 t=294ms 与 t=294ms，同一毫秒）被这段"本该只在卸载时跑"的代码删掉。
返回值是 `undefined` → Cordis 视为"无 disposer"，合法、不报错。

净效果：factory 被调用、Loader 条目创建、fiber 状态 **ACTIVE**、无任何 console 报错，
但页面上**什么都不剩**——与 2026-10-03 观察到的"看不到橙色"逐字吻合。

四跳定位结论：**卡在第 4 跳（执行了但效果被立即回滚）**，前三跳（roster 激活 / host 半 mount / client factory 调用）**全部为绿**。

---

## 1. 证据链（每一环都可复跑）

### 1.1 源码级：Cordis 的 effect 契约

`@deepseek-ai/cordis/src/fiber.ts`（asar 内，0.2.0-rc.2）：

- L356 `private _execute<T>(runner)` → L366 `const effect: Effect = runner.execute.call(this)`
  —— **execute 被立即调用**；若返回值是函数则 `runner.collect(effect)` 登记为 disposer。
- L405 注释原文：`execute` runs immediately; the disposers it produces are collected and run (in reverse order) either when the returned disposer is called or when the fiber unloads.
- L415 / L418 `effect(execute: () => SyncEffect, label?)`

retired `lib/client.js`：

```js
L45  const style = document.createElement('style')
L48  document.head.appendChild(style)                      // 安装（在 effect 外）
L49  document.documentElement.setAttribute(ROOT_ATTRIBUTE, '')
L57  ctx.effect(() => {                                    // ← 传进去的是"卸载"
L58    const element = document.getElementById(STYLE_ELEMENT_ID)
L59    if (element) element.remove()
L60    document.documentElement.removeAttribute(ROOT_ATTRIBUTE)
L61  }, 'dsh-theme: probe skin')
```

正确形态是「安装放 effect body 内，卸载作为返回值」：

```js
ctx.effect(() => {
  /* ...install... */
  return () => { /* ...uninstall... */ }
}, 'label')
```

### 1.2 运行时栈（决定性证据）

`probe_trace2.py` 用 `page.add_init_script` 在页面任何脚本之前钩住 `Element.prototype.remove` /
`setAttribute` / `removeAttribute` / `Document.prototype.createElement`，只记录，**不改被测产物**。
活页面抓到（原始栈，未截断）：

```
---- setAttribute.data-dsh-theme  t=297 ----
    at Element.setAttribute (<anonymous>:34:86)
    at new apply (<COMBO>)              <-- dsh-theme 的 apply 装上属性
    at bc.execute (<URL>)
    at qi (<URL>)
    at bc._execute (<URL>)
    at bc._reload (<URL>)

---- element.remove  t=297 ----          <-- 同一毫秒，紧接着被删
    at Element.remove (<anonymous>:45:161)
    at bc.<anonymous> (<COMBO>)         <-- 就是 L57 那个箭头函数
    at <URL>
    at qi (<URL>)
    at bc._execute (<URL>)
    at bc.effect (<URL>)                <-- ctx.effect 调它
    at new apply (<COMBO>)              <-- 调用点在 apply 内
    at bc.execute (<URL>)

---- removeAttribute.data-dsh-theme  t=297 ----
    ... 同上，at bc.effect <- new apply
```

`bc.effect` 栈帧 = Cordis 的 `Fiber.effect`；`bc.<anonymous>` = dsh-theme 传进去的那个回调。
**"卸载代码被 effect 立即执行"在栈上直接可见。**

### 1.3 模块系统内部状态（`probe_ms.py`）

钩住 `window.__ModuleLoader__` 的 setter，包一层 `create()` 截获 `ClientModuleSystem` 实例：

| 观测 | 值 | 含义 |
|---|---|---|
| `manifest.modules` 含 dsh-theme | **true**（66 条） | 宿主把它组进了启动图 |
| `factories` 含 dsh-theme | **true**（65 条） | 合批脚本执行并注册了 factory |
| `loadCache` 含 dsh-theme | **true** | **factory 被调用并物化** |
| `loadCache.get('dsh-theme').exports` | `["apply"]` | 返回值正确 |
| `entries.managed.get('dsh-theme')` | `hasFiber:true, state:2` | **Loader 条目已建、fiber = ACTIVE** |
| `fiber.runtime` | `function apply(ctx) {…}` | 就是我们的 apply |
| `importErrors` / `snapshot.failures` | `[]` / `[]` | **零失败** |

66 条托管条目的 fiberState 直方图：`{"2": 66}` —— 全是 ACTIVE，一条不差。

### 1.4 变异证伪（决定性实验）

把 retired 快照逐字节复制到 `.agents/tmp/m5-rootcause/pkg/dsh-theme/`，再复制一份
`dsh-theme-fixed`，**只做一处语义改动**：把安装代码移进 `ctx.effect` body、把卸载作为返回值。
（另有三处纯改名：包名/id、`STYLE_ELEMENT_ID`、`ROOT_ATTRIBUTE`，用于同一页内区分两个变体。）

同一 profile、同一实例、同一页面加载下对比：

| 探针 | 原版 dsh-theme | 修正版 dsh-theme-fixed |
|---|---|---|
| `document.documentElement.hasAttribute(...)` | **false** | **true** |
| `document.getElementById('<id>-style')` | **null** | **存在**，text = `html[data-dsh-theme-fixed] body { background-color: rgb(255 138 0) !important; }` |
| `getComputedStyle(document.body).backgroundColor` | `rgb(255, 255, 255)` | **`rgb(255, 138, 0)`** |
| console / pageerror | 无 | 无 |

证据文件：`falsify-fixedonly.json`（修正版单独安装，三行全绿）、`runA-dshtheme.json`（原版，三行全红）。

> 推理链（可证伪形态）：
> **若**根因是"effect body 被当作 dispose 立即执行"，**则**把安装/卸载互换后重装，活页面三行断言会由红转绿。
> 该实验已跑，结果如上行 —— 预测命中。

### 1.5 负控制

先在同实例、**未装任何插件**的干净 profile 上跑同一脚本：`negctrl.json` →
`dshThemeRow: null`、`htmlHasAttr: false`、`styleEl: false`、`bodyBg: rgb(255,255,255)`。
断言确实会红，具备区分力。

---

## 2. 为什么上一轮查不出来（三重静默 + 一次假绿）

1. **Cordis 不校验 disposer 的正确性**——官方口径是"插件作者的义务，运行时不验证"。
   这里返回 `undefined` 属合法形态，连类型错误都没有。
2. **启动路径不收集失败**：`ClientEntries.start()`（boot 路径）只 `create()` 各条目，**不检查 fiber 状态**；
   失败清单（`snapshot.failures`）只在后续 `reconcile()`（图变更路径）里产生。
   而这里 fiber 是 ACTIVE，本来也不会有失败。
3. **GUI 无任何提示**：`设置 → 插件 → 内置插件` 的 `[data-client-sync-failure]` 横幅**不存在**（实测抓取，见 `settings-builtin.txt`），
   因为确实没有失败可报。**"没有报错"在这里是正确行为，不是线索。**
4. **单测假绿**：retired 的 `test/client.test.mjs:61` 用
   `ctx: { effect(fn, label) { effects.push({ fn, label }) } }` —— 这个假 ctx **重定义了 effect 语义**
   （只记录、不执行），于是 3/3 全绿，而真实语义下第一步就错。
   这正是项目纪律里"**mock 掉了被验证的对象本身**"的教科书案例：把"缺功能"伪装成了"有功能"。

---

## 3. HANDOFF-M1 §9.4 三条假设判定表

| # | 假设 | 判定 | 原始证据 |
|---|---|---|---|
| 1 | roster 行在 web 层没被激活 | **证伪** | `window.__DSH_BOOT__.entries` 含 `dsh-theme`（`runA-dshtheme.json` / `msA-dshtheme.json`）；合批 URL 里含 `dsh-theme/client.js`（`pluginResponses`）；`factories`/`loadCache`/`managed` 三张表全含它；`dsh --profile web --dump-config` 输出 `# == dsh-theme / - id: ui-skin-dsh-theme / name: dsh-theme` |
| 2 | host 半 mount 失败 | **证伪** | 启动日志无 `failed to import`（`logs/run2-dshtheme.log`）；`client-modules` 的扫描前置条件 `entry.fiber !== undefined && !entry.disabled` 通过（否则该行不会进启动图，而它进了）；页面无 pageerror |
| 3 | desktop(Electron) 与 web profile 的 client 装配差异 | **证伪**（作为根因） | 失败在 **web profile 被完整复现**（`runA-dshtheme`），且已由 1.4 的变异实验归因到包内代码；web 与 desktop 的 `@deepseek-ai/*` 版本实测一致（asar / npm-global 全为 `0.2.0-rc.2`，cordis 4.0.4）。**适用范围：结论在 web profile 上直接实证；desktop 未直接验证（边界禁止）**——但既然根因在包内代码且与运行环境无关，desktop 差异不再是候选 |

**四跳判定**：① roster 激活 ✅ ② host 半 mount ✅ ③ client factory 调用 ✅ ④ **样式/效果存活 ❌ ← 根因在这一跳**

---

## 4. 四个必答问题

### Q1 skin-center 的 client 半声明与装配链路

| 环节 | skin-center 的实际值 |
|---|---|
| `exports["."]` | `./lib/index.js`（host 半，有实体逻辑） |
| `exports["./client"]` | `./lib/client.js` |
| `dsh.bundle.patch` | `./cordis.patch.yml` |
| `dsh.client` | `{ inject: ["@deepseek-ai/dsh-api-remotes","@deepseek-ai/dsh-client-locale","@deepseek-ai/dsh-client-ui-renderer","@deepseek-ai/dsh-client-ui-settings","@deepseek-ai/dsh-client-ui-theme"], platform: "web" }` |
| `dsh.engines.dsh` | `>=0.1.7-rc.1` |
| `cordis.patch.yml` | `- insert:\n    - id: ui-skin-center\n      name: '@linxin666/dsh-client-ui-skin-center'` |
| client 入口包装 | `window.__ModuleLoader__.load({ id: "@linxin666/dsh-client-ui-skin-center", factory: (require) => { … exports.apply = apply; exports.inject = inject; return module.exports } })`（236 KB 构建产物，factory 内 `require("react")`、物化期注入 CSS） |

**宿主 roster → 加载 → 执行链路**（源码：asar 内 `@deepseek-ai/dsh-client-modules`，v0.2.0-rc.2）：

1. **host 半扫描**（`lib/index.js` L506 `ClientModuleRegistry`）
   `ctx.on('internal/plugin')` + 启动时 `ctx.loader.entries()` 把每个 Loader 条目标脏；
   `processOne()` L835 过滤条件 = `entry.options.name === entryName && entry.fiber !== undefined && !entry.disabled`；
   `resolveMeta()` L701 解析包 manifest → 校验 `dsh.client.platform === 'web'`（L714）→ 取 `exports["./client"]`（L718）→ 快照该文件字节。
2. **组图**（`compose()` L649 / `graphRow()` L395 / `orderByModuleGraph()` L415）
   产出 `{rev, entries[], batches[]}`，按 3 KiB 分片，bootstrap 与 application 两相。
3. **注入 index**（`bootInjections()` L453）往 `<head>` 依次注入：
   ① `window.__ModuleLoader__` 队列门面（inline）→ ② 各 application 批次的 `<link rel=preload>` → ③ **阻塞式 bootstrap 批次脚本** → ④ `window.__DSH_BOOT__ = graph`。
4. **浏览器侧**（`lib/client.js`）：shell 读 `__DSH_BOOT__` → `__ModuleLoader__.create()` 物化 `dsh-client-modules` 自身并构造 `ClientModuleSystem`；
   `ClientEntries.start()` 对每条 plugin row 依次 `prefetch → import → loader.create({name: id})`；
   其中 `import` → `arriveGraphRow`（按 `inject`/`external` 先拉依赖）→ `arrive`（动态插 `<script>` 载入合批）→ `materialize`（**调用 factory**）→ 交给 Cordis Loader 挂载 `apply(ctx)`。
5. **卸载还原**：Cordis 在 fiber dispose 时按 LIFO 跑 disposer —— **disposer 的正确性由插件作者负责**（本次根因所在）。

### Q2 retired 与活样本的逐字段差异

**package.json（dsh-theme vs skin-center vs dsh-claude-style）**

| 字段 | dsh-theme（retired） | skin-center | dsh-claude-style |
|---|---|---|---|
| name | dsh-theme | @linxin666/dsh-client-ui-skin-center | dsh-claude-style |
| type / main | module / host/index.js | module / lib/index.js | module / lib/host/index.js |
| `exports["."]` | ./host/index.js | ./lib/index.js | ./lib/host/index.js |
| `exports["./client"]` | ./lib/client.js | ./lib/client.js | ./lib/client.js |
| `dsh.engines.dsh` | **>=0.1.7** | >=0.1.7-rc.1 | **>=0.1.7** |
| `dsh.bundle.patch` | ./cordis.patch.yml | 同 | 同 |
| `dsh.client.platform` | web | web | web |
| `dsh.client.inject` | `[]` | 5 个官方 client 包 | `[]` |
| 额外 | files/keywords/license | publishConfig/icon/scripts/deps/peerDeps/repository | icon/workspaces/scripts/devDeps/repository/homepage/bugs |

→ **契约字段（exports / dsh.bundle / dsh.client / engines）与 dsh-claude-style 逐项等价**，
`engines: ">=0.1.7"` 与活样本 claude-style **完全同值**。**"声明形态不对"这条假设可以彻底排除**（HANDOFF-M1 §9.1 的判断成立）。

**cordis.patch.yml**：三者结构一致（`- insert: [{ id, name }]`），仅 id/name 取值不同。dsh-theme 的 `name: 'dsh-theme'` 指向包名，解析正确。

**client 入口**：

| | dsh-theme | skin-center | dsh-claude-style |
|---|---|---|---|
| 包装 | `window.__ModuleLoader__.load({ id, factory: (require) => {…; return module.exports} })` | 同 | 同 |
| factory 体 | 手写 2.4 KB；不 require；**apply 期注入 CSS** | 构建产物 236 KB；`require("react")`；**物化期注入 CSS** | 构建产物 602 KB；物化期注入 CSS |
| 导出 | `{ apply }` | `{ apply, inject, NS, bootSkinRuntime }` | `{ apply, … }` |
| `ctx.effect` 用法 | **把卸载当 body 传**（L57–61）← 根因 | 安装/卸载成对，符合契约 | 同左 |

**唯一实质差异就是 `ctx.effect` 的用法。** 其余差异（构建产物 vs 手写、inject 列表、物化期 vs apply 期注入）都不影响本次结论：
负控制与 §1.4 的变异实验已把变量收敛到这一处。

### Q3 隔离 web profile 重装后的活页面断言

见 §1.4 表格与 `runA-dshtheme.json` / `falsify-fixedonly.json`。
原版 dsh-theme 复现失败（三行全红）；同一 profile 下修正版三行全绿。

### Q4 卡在哪一跳

| 跳 | 判定 | 证据 |
|---|---|---|
| roster 未激活 | **否** | `__DSH_BOOT__.entries` 含 dsh-theme；dump-config 有该行 |
| host 半 mount 失败 | **否** | 无 import 错误；扫描前置条件通过；client 行进了图 |
| client factory 未调用 | **否** | `loadCache.get('dsh-theme').exports = ["apply"]`；DOM trace 有 `createElement.style` + `setAttribute`（栈顶是 `new apply`） |
| **调用了但效果被立即回滚** | **是（根因）** | 同一毫秒的 `element.remove` / `removeAttribute`，栈为 `bc.effect <- new apply` |

---

## 5. 实验怎么跑的（可复跑）

**环境**：DSH `0.2.0-rc.2`（`resources/runtime/cli/bin/dsh.cmd` 与 npm-global 同版）· Node v24.19.0 · pnpm 11.21.0 · Python 3.14.1 + Playwright + Edge 无头。

```bash
export PATH="/c/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli/bin:$PATH"
export PYTHONUTF8=1
cd E:/dsh-theme/.agents/tmp/m5-rootcause

# 负控制（未装插件，期望三行全红）
python probe.py "http://127.0.0.1:19488/?token=<T>" negctrl
# 原版 dsh-theme（期望复现失败）
python probe.py "http://127.0.0.1:19488/?token=<T>" runA-dshtheme
# 模块系统内部状态（钩 __ModuleLoader__，不改产物）
python probe_ms.py "http://127.0.0.1:19488/?token=<T>" msA-dshtheme
# DOM 级栈追踪（钩 createElement/setAttribute/removeAttribute/remove）
python probe_trace2.py "http://127.0.0.1:19488/?token=<T>" trace2
# 变异证伪（修正版）
python probe_falsify.py "http://127.0.0.1:19488/?token=<T>" falsify-fixedonly
```

起停实例用后台任务（`pwsh -Command "& dsh.cmd --profile web --port 19488 --no-open" | Tee-Object logs\runN.log`），
收工按 PID 杀 `Get-NetTCPConnection -LocalPort 19488 -State Listen` 的 OwningProcess 并复查端口。

**证据文件清单**（均在 `.agents/tmp/m5-rootcause/`）：

| 文件 | 内容 |
|---|---|
| `negctrl.json` | 负控制（三行全红） |
| `runA-dshtheme.json` | 原版复现失败 + 完整 `__DSH_BOOT__` 图 + 所有 /plugins/ 响应 |
| `msA-dshtheme.json` | 模块系统内部：factories/loadCache/managed/importErrors/syncFailures |
| `traceA.json` / `trace2.json` | DOM 操作时间线 + 完整调用栈 |
| `falsify-fixedonly.json` / `falsify-fixedonly.png` | 修正版三行全绿 |
| `falsify.json` | 两变体同页对照（撞上顶层 const 冲突，见 §6.2） |
| `settings-builtin.txt` / `settings-builtin.png` | GUI 侧证据：无 client-sync 失败横幅 |
| `logs/run1..run6.log` | 六次实例启动日志（均无 failed to import） |
| `pkg/dsh-theme/` `pkg/dsh-theme-fixed/` | 实验用包副本（原版逐字节等于 retired 快照，已校验） |

---

## 6. 额外发现（与根因无关，但 M5 会踩）

### 6.1 合批脚本共享 classic-script 作用域 —— 跨包顶层标识符会冲突

`buildComboScript` 把多个 `client.js` **直接拼接进同一个 <script>**。因此顶层 `const`/`let` 是**同一作用域**。
实测：同时装 dsh-theme 与 dsh-theme-fixed（两者都有顶层 `const STYLE_ELEMENT_ID`、`const PROBE_CSS`）→

```
[pageerror] Identifier 'STYLE_ELEMENT_ID' has already been declared
[error] Error: web boot: 1 entry did not activate
dsh-theme-fixed: import failed (see console for the import error)
```

→ **M5 写插件时，client 半的顶层标识符必须包 IIFE 或加包名前缀**，否则与同批次其他插件（尤其手写、未 minify 的）撞名会**整批解析失败**。
（这条对"手写 client.js"的形态是硬约束；构建产物天然有 scope 包裹。）

### 6.2 启动路径的失败只上报到 boot 审计，不进"插件列表"横幅

`ClientEntries.start()` 不填 `snapshot.failures`；只有 `reconcile()`（图变更）才填。
boot 期的条目失败走 shell 的 `onEntryState(id,'failed')` → console.error（`web boot: N entry did not activate`）。
排查时**先看 console，再看"设置→插件→内置插件"的横幅**，两者覆盖面不同。

### 6.3 `dsh.client.immediately` 存在

`parseDshClient` 识别 `immediately: boolean`，为 true 的行走 shell 的 `prefetchImmediateTier()` 提前预取。dsh-theme 未用，与本次无关。

### 6.4 用户可见症状的措辞建议

症状应描述为"**client 半执行后被立即撤销**"，而不是"没执行"。前者会直接把注意力引到 `ctx.effect` 用法；
后者（HANDOFF-M1 §4 的措辞）把人推向 roster / host mount / desktop 差异三个死胡同。

---

## 7. web profile 还原确认

实验前对 `package.json` / `cordis.patch.yml` / `pnpm-lock.yaml` 做了带时间戳备份
（`backup-2026-10-10T12-54-06/`，pre-state 记于 `pre-state.json`）。还原后验证输出：

```
=== 1) diff vs pre-experiment backup ===
  IDENTICAL  package.json
  IDENTICAL  cordis.patch.yml
  IDENTICAL  pnpm-lock.yaml

=== 2) node_modules residual check ===
  dsh-theme dir        : absent
  dsh-theme-fixed dir  : absent
  .pnpm/lock.yaml      : absent          <-- HANDOFF.md §5 点名的隐藏 lockfile 陷阱，已按流程删除
  .pnpm dsh-theme*     : 0
  node_modules entries : 6

=== 3) config check (no dsh-theme row) ===
  0 matches (clean)

=== 4) port check ===
  19488 free (no LISTENING)
```

（`node_modules entries: 6` = `.modules.yaml .package-map.json .pnpm .pnpm-workspace-state-v1.json @deepseek-ai @standard-schema`，
与实验前 `pre-state.json` 记录的 10 项差异来自 `ls` 与 PowerShell 对隐藏项的处理口径，实际内容已由 pnpm 对账、且 3) 的 dump-config 零命中为准。）

**项目文件**：`git status --short` 仅 ` M HANDOFF.md`（父代理 21:10 自己写的 M5 版本，非本调查所改）与 `?? .agents/tmp/`、`?? .idea/`。
**本次调查对 E:\dsh-theme 的写入全部落在 `.agents/tmp/m5-rootcause/`，未触碰任何项目文件。**

---

## 8. 剩余风险 / 未覆盖

1. **desktop profile 未直接验证**（边界禁止）。结论"根因在包内代码、与环境无关"由 web profile 的变异实验支撑；若要在 desktop 上复核，需用户本人执行。
2. **§1.4 的修正版另有三处纯改名**（包名/id/两个 DOM 标识符）以避免同页冲突。这三处不改变 effect 语义，
   且 `falsify-fixedonly.json` 是在修正版**单独安装**下取得的，改名不可能影响"effect body 是否立即执行"。
   仍列为可复核点。
3. **视觉可见性未单独验证**：本次只断言了 `getComputedStyle(body).backgroundColor`（= §4.1 的口径）。
   GUI 的实际绘制面是否就是 `body`，未做像素级复核——即修正版让**计算样式**变橙，但"肉眼是否看到整页橙"未截图比对。
   若 M5 要以此形态做真皮肤，建议补一次像素采样。
4. **合批作用域冲突（§6.1）只做了定性复现**，未穷举冲突面。

## 9. 待复核决策点

1. **本报告只落在 `.agents/tmp/`（未跟踪、属临时产物）**。按项目纪律，根因属长期结论，应回写归属笔记
   `.agents/notes/implemented/feature/2026-10-03-project-scope-and-tech-route.md` 的修订段——
   本任务边界禁止改项目文件，**回写留给父代理在边界外决定**。
2. **HANDOFF-M1.md 的措辞**（§4「client 半被服务了，但没有在页面里执行生效」）与实证不符，
   若要长期留存该文件，建议补一行更正指向本报告。
3. §8.3 的像素级复核是否要补，由父代理按 M5 预算决定。
