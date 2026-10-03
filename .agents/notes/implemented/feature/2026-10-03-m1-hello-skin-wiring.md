# Agent Note: M1 注入链路契约（bundle → client → 页面）

Status: implemented — M1 落地，desktop 装机待用户重启确认

## Problem

立项笔记定了「借 dsh-claude-style 的形态」，但没定形态的**具体契约**：client 半到底怎么被加载、宿主怎么调用它、卸载还原靠什么保证。这三点没实测过就写 client.js，M1 会在三种写法之间瞎猜——而 M1 的全部价值就是把这个链路证伪或证实。

## Decision

client 半是 CommonJS 工厂，不是 ES 模块：`window.__ModuleLoader__.load({ id, factory })`，factory 接 `require` 并 `return module.exports`（其值即导出面 `{ apply }`，loader 不再包装）。宿主 client roster 主动调用 `apply(ctx)`，插件不自触发。**可逆性由 `ctx.effect(() => teardown, label)` 承担**——逆操作必须注册给宿主，插件自己存一份 teardown 不算数，因为 dispose 时只有宿主跑。

bundle 侧：`exports['./client']` 指浏览器入口，`dsh.bundle.patch` 指向 patch 文件，`cordis.patch.yml` 只插一行 `{ id, name: '<包名>' }`；`name` 按包名解析。

**修正（2026-10-03 首轮实测打脸）**：纯 client 包仍**必须有 host 半**——`exports['.']` 指向一个空的 host 入口。没有它，加载器 `import('dsh-theme')` 抛 `ERR_PACKAGE_PATH_NOT_EXPORTED`，整条 roster 行报 `failed to import`，client 半根本不会进页面。另有一条独立陷阱：GUI 插件管理器把 bundles 条目物化成 patch 行时**只写 `id` 不写 `name`**，该行必须手工补 `name`，否则同样静默不生效。

M1 注入一条 `!important` 的橙色背景作为探针，配 `data-dsh-theme` 根属性；样式表和属性一起交给 ctx.effect 拆除。

## Alternatives considered

- **写成 ES module（`import`/`export`）**：被 loader 形态直接否掉——client 半不走 ESM 解析器。
- **只声明 `exports['./client']`、不提供 host 半**（首轮实际这么写并失败）：以为纯视觉包无需 host 入口。加载器的挂载是 `import('<包名>')` 打头，`.` 未导出即整条行 import 失败——**client 能否上页取决于 host 半能否导入**，两半缺一不可，哪怕 host 半是空的。
- **工厂内自执行注入、不导出 apply**：省掉导出面，但插件将无法被宿主按 roster 生命周期管理，dispose 时没人调用还原。
- **自存 teardown 引用 + 导出 dispose**：逆操作脱离 ctx.effect 后，宿主卸载插件时不会调用它，「卸载后完全还原」这条硬约束就没有保证。
- **用 `document.getElementById` 复用已有样式表以防重复注入**：M1 无重复来源（roster 单次调用），这个分支是无证据的复杂度，YAGNI；真出现重复注入时 `ctx.effect` 的拆除会先移除旧节点。

## Consequences

- M2 只需把 `PROBE_CSS` 换成构建产物，`apply` 的骨架（建元素 → 打属性 → ctx.effect 登记拆除）保持不变。
- 探针色是**故意违规**的临时值（此时构建器还不存在），M2 必须删掉它——它是唯一允许手写色值的地方，且只活一个里程碑。
- profile 装配走「备份 → 加 dependencies 与 bundles → pnpm install」；desktop profile 被 Electron 独占，CLI 不能代跑，**验证改用 web profile 隔离做**。

## Confirmation

- `test/client.test.mjs`（node:test，3 用例全绿）覆盖：导出面形状、注入一个样式表 + 打属性、ctx.effect 的逆操作把页面还原。
- 装配断言：`dsh --profile web --dump-config` 输出含 `# == dsh-theme` 与 `ui-skin-dsh-theme` 行，即 patch 被加载器接受且 client 行进入 roster。
- **端到端（web profile 实跑，非静态配置）**：启动日志无 `failed to import`；首页 HTML 的 plugin 预加载批次里出现 `dsh-theme/client.js`；按该 URL 取回的合批脚本（10.4MB）含 `__ModuleLoader__`、探针色与 `ctx.effect`。
- 未验证：GUI 实页变色与卸载还原需用户在 desktop 重启后肉眼确认（Electron 独占 profile，代理不代重启）。
