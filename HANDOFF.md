# dsh-theme 交接文档（2026-10-14 · M1–M10 全部完成并验收）

> 给下一个会话：本项目当前状态、继续施工所需的一切。
> 权威文档：docs/spec.md（范围）· docs/milestones.md（里程碑）· ARCHITECTURE.md（结构）· AGENTS.md（红线与命令）。
> 本版取代 2026-10-10 午间的「M4 收口 + M5 开工前置」版与 2026-10-11「M5 收口口径」版——M1–M10 全部完成并验收（M7–M10 的桌面真机由用户 2026-10-14 确认通过），桌面 profile 已装当前构建且插件处于启用态。
> **本期范围已收口，交付项已全部完成**；下面的「未验证 / 残留风险」是限制记录，不在已交付范围内。

## 1. 一句话现状

M1–M10 全部完成并验收。当前形态 = **M10 输入框 V3「书写纸」**（轻框三行正文 + 单行工具带 + 96px 主位鲸鱼右上缘无底座 + 字号适配/模型 compact/聚焦线回归）；视觉基座 = **M7「深空编辑室」**（视觉与 dsh-ui 规范脱钩，design/tokens.css 为唯一数值来源；Lucide 图标层 111/139；Deepy 主位/hero 双位 + 单鲸规则），M8 → M8.5 → M9 是输入卡的连续改版。桌面 profile 已装当前构建且插件已启用（`cordis.patch.yml` 的 `ui-skin-dsh-theme` = `disabled: false`，安装副本与仓库构建的 `lib/client.js` / `assets/theme.css` 两文件 md5 实测一致），**桌面真机已确认通过**（2026-10-14）。范围与验收见 docs/milestones.md；M7 设计决策与被否方案见 .agents/notes/implemented/feature/2026-10-12-m7-deep-space-editorial-redesign.md。已知限制与后续候选见 milestones 文末「已知限制与后续候选（不阻塞交付）」。

## 2. M5 交付物（plugins/dsh-theme/）

| 文件 | 职责 |
|---|---|
| package.json | bundle 声明三要素（exports["."]/["./client"]/dsh.bundle.patch/dsh.client），peerDeps react ^18.2.0 |
| host/index.js | 开关持久化：自建路由 /api/dsh-theme/state（GET/POST）+ /theme.css；原子写 $DSH_HOME/dsh-theme/state.json，默认 ON |
| lib/client.js | 样式注入 + 设置面板（settings.section，React）+ 语义锚点适配器 + skin-center 互斥调用；顶层零声明 |
| assets/theme.css | **构建生成物**（禁手改）：build-skin.mjs §M5 段产出的插件版自包含 CSS |
| cordis.patch.yml | insert 行，disabled 只用静态 true/false |

构建链不变：`node scripts/build-skin.mjs` 同时产出 skin.css（皮肤卡用）与 theme.css（插件用）；**构建必须经 pwsh 或 run_code 跑**——bash 工具（MSYS2）的 /e/ 是沙箱投影，看不到 E:\dsh-ui。

## 3. 验收证据（分级标注）

- **已验证（web profile 隔离实例，双轮制）**：① D4 探针门（三行断言 + 负控制 + console 零错，.agents/tmp/m5-probe/）；② 生产者七条自检（.agents/tmp/m5-plugin/acceptance-report.json）；③ 独立验收方从零重装复跑全绿 + 深色专项 + 负控制（.agents/tmp/m5-verify/REVERIFY-report.md）。
- **返工记录**：独立验收首轮抓红深色模式（var() 别名在 html 层求值锁死浅色，侧栏/输入卡仍亮）；修复 = 把 9 条 var() 别名在深色 body 作用域重声明（从 preview :root 现算）；复验 7 采样点 Δ=0、暗区占比 98.21%（基线 98.15%）、浅色截图 md5 零回归、克隆完备性 needClone==cloned。
- **已验证**：desktop profile 运行生效（2026-10-10 用户真机确认；2026-10-14 复核插件处于启用态、安装副本与仓库构建的 `lib/client.js` / `assets/theme.css` 两文件 md5 一致）。desktop 侧 `$DSH_HOME/dsh-theme/state.json` **已落盘**（2026-10-14 实测存在，65 字节）——「未落盘」那条旧记录已过时；跨重启保持需下次重启再复核，本轮未单独取证。
- **未验证（不阻塞）**：① skin-center 共存下的互斥 API 路径（client → skin-center v2 API）代码已写、未在真实共存下实测；**但**插件启用时自动把皮肤卡切回官方默认这一行为已实测（M8.5/M9/M10 隔离实例 po06 共存与桌面真机均未出现双注入）——该路径若失效，手动把皮肤卡切官方默认即可，不影响插件本身。② 隔离夹具的 token 数为假估（M10 的 main-report 只模拟外部模型 HTTP），不得当作真实模型能力证据。③ notification 态活体、隐藏/恢复的原生 visibility override、鲸鱼抬头的隔离实例端到端等受隔离环境限制的项仍未实测（见 milestones M6/M9 段）。

## 4. 三条施工红线（已进 AGENTS.md，这里留索引）

① ctx.effect：body 里安装、return 卸载函数（M1 根因）；② client 半顶层零声明（合批共享作用域）；③ host 半可空但必须存在。详见 AGENTS.md「M5 插件期」。

## 5. 教训沉淀（本轮新增）

- **「计算绿 ≠ 可见」**：shell 自带不透明白层（#root/.BynINW_frame）盖住 body，body 背景永不入像素。视觉验收必须有像素采样 + ON/OFF 截图 md5 对照。M1 的 falsify-fixedonly.png 因此不能作视觉证据（归属笔记已更正）。
- **var() 在声明所在元素求值**：:root 上的别名会锁死浅色，深色块只重定义原语传不进去——别名必须与深色原语同作用域重声明。
- **file: 依赖是复制语义**：改插件源码后必须重装（各 profile 各自一份副本）。
- **DSH 会往 cordis.patch.yml 追加托管行**（ui-settings-general 等设置持久化）：还原必须用备份整体覆盖，只删插件行会留残留。
- **theme.css 口径**：25259 = 字符数（浏览器 styleLen），26412 = 文件字节数（581 个非 ASCII 字符），比对时别混。

## 6. desktop 装配现状

- desktop profile：package.json 加 `"dsh-theme": "file:E:/dsh-theme/plugins/dsh-theme"` + bundles 追加；cordis.patch.yml 有 `ui-skin-dsh-theme` 覆盖行，**当前 `disabled: false`（启用态）**。安装副本与源一致（**M10 版**，2026-10-14 核实 `lib/client.js`、`assets/theme.css` 两文件 md5；含 `assets/deepy/` 8 张图与 `assets/icons/`）。
- **改源码后必须重装**（file: 依赖是复制语义）：`cd C:\Users\pass\.dsh\profiles\desktop && pnpm remove dsh-theme && pnpm add "file:E:/dsh-theme/plugins/dsh-theme"`。
  ⚠️ **只跑 `pnpm install` 不够**（2026-10-12 实测）：pnpm 会依据 `node_modules/.modules.yaml` 判定「已是最新」而跳过复制；删目录、删 `.modules.yaml`、`--force` 都无效，**只有 remove + add 能真正刷新副本**。
- 备份：`.agents/tmp/m5-desktop-install/backup-*/`（M5 期）、`.agents/tmp/m6-desktop-install/backup-*/`（M6 期，三份配置）。
- **启用方法**：设置 → Plugins 启用 dsh-theme（已启用）→ 设置页「dsh-theme 主题」面板拨开关（状态落 `$DSH_HOME/dsh-theme/state.json`）。
- 插件激活时会经 skin-center v2 API 把皮肤卡切回官方默认（防双注入）；皮肤卡保留作回退。
- 桌面 GUI（19387）有 token 认证，代理**不要硬闯**；重启由用户本人执行。

## 7. 残留风险（不阻塞交付）

> 条目全部保留；状态为 2026-10-14 复核结果，核实不了的写「未核实」。

1. **互斥路径**（client → skin-center v2 API）——**未验证（不阻塞）**：代码已写、未在真实共存下直接实测；已实测的是「插件启用会把皮肤卡切回官方默认」，故失效影响面仅限手动切回一步，不影响插件本身。
2. **持久化走 host 自建路由**——现状未变：`GET/POST /api/dsh-theme/state` + `$DSH_HOME/dsh-theme/state.json`；迁移官方 settings 服务仍留后续（未做）。
3. **状态文件跨 profile 共享**（$DSH_HOME/dsh-theme/，自用可接受）——现状未变；已核实 desktop 侧该文件存在。
4. **语义适配器选择器与 skin-center 同源同险**（shell 升级需回归）——**未核实**：期间无 shell 升级事件；回归清单见 §9。
5. **.agents/tmp/ 下的实验证据**——**未核实其跟踪状态**（本轮未执行 git 命令）；已核实 .gitignore 只忽略 `.dsh-tmp/`、`_agents-shots-tmp`、`.agents/shots/_instance_url.txt`。核心结论已沉淀进归属笔记修订三 + M5 决策笔记（.agents/notes/implemented/feature/2026-10-10-m5-bundle-plugin.md），原始产物可按需归档或清理。
6. **验收脚本纳管**——部分推进：M2/M3/M7/M8/M9/M10 的验收脚本已进 `.agents/shots/`（现役清单见 README「验证」段），M5/M6 的一批 `verify_*.py` 仍在 `.agents/tmp/` 未纳管。

## 8. 隔离实例起停与还原方法论（沿用上版，实测有效）

- 起实例：`dsh.cmd --profile web --port 19488 --no-open`（后台任务）；Playwright 设 `PYTHONUTF8=1`；首屏「预览版说明」弹窗用坐标 `pg.mouse.click(933,577)` 关闭。
- 还原四步：恢复 package.json / cordis.patch.yml / pnpm-lock.yaml 备份（**整体覆盖**）→ 删 node_modules/.pnpm/lock.yaml 隐藏副本 → pnpm install → 确认 19488 端口释放 + dump-config 零命中。
- 重型验证互斥：同一时刻只跑一份隔离实例。
- **插件进隔离实例的三件套**：pnpm add file: + cordis.patch.yml 加 insert 行 + package.json 的 dsh.profile.bundles 加包名——缺 bundles 行插件静默不加载（M7 T6 首轮 16 项红 8 项的根因，console 无报错）。
- **停实例要按 PID 杀**（2026-10-11 M6 探针实测）：`job_kill` **不会**终止 dsh 的子进程树，端口仍被占用、重启撞 EADDRINUSE。必须 `Get-NetTCPConnection -LocalPort 19488 -State Listen` 找 PID → `Stop-Process`，再确认端口为空。

## 9. 真机验收清单（M4 皮肤卡 + M5 插件）—— ✅ 2026-10-10 用户确认通过（保留作回归清单）

> 2026-10-14 补充：M8/M8.5/M9/M10 的桌面真机由用户一并确认通过；本清单原样保留作回归用。

**A. 皮肤卡（M4，如已验可跳）**：刷新 GUI → 蓝调画布/白卡/实心主按钮/选中态竖条 → 深色切换无发白残留 → 切回官方默认当场还原。

**B. 插件（M5，新）**：
1. 重启 DSH（装配重启后才生效）。
2. 设置 → Plugins：列表出现 dsh-theme，启用它。
3. 设置页出现「dsh-theme 主题」面板，开关默认 ON；页面当场变 dsh-ui 视觉（皮肤卡应已被自动切回官方默认）。
4. 拨 OFF：当场还原官方外观；拨回 ON：当场恢复。
5. 重启 DSH 再进：开关状态保持（持久化）。
6. 深色切换：侧栏变深（无浅色带）、输入卡变深色卡。
7. 回退演练：设置 → Plugins 禁用 dsh-theme → 重启后完全官方；皮肤卡可重新启用。

**发现问题怎么回传**：说明「哪一步 + 期望 vs 实际」，附截图更好；代理可据此补断言、写进验收脚本再修。

## 10. M6 前置调查证据索引（2026-10-11）

两项只读调查（DSH 侧落地能力 / Deepy 素材与状态机）+ 调度方独立复核。本节结论**全部为源码层静态存在**；其中运行时行为已在 2026-10-11 的隔离实例探针中实测（F 项），逐条证据见下。

**A. design-spec §7.2 的事件表在 DSH 侧不存在**
- 7 个字面同名事件只出现在 Claude Code hooks 兼容桥：`app.asar/dsh/node_modules/@deepseek-ai/dsh-hooks-claude-code/lib/index.js:13`（`CLAUDE_EVENTS`）
- DSH 真实持久会话事件（`SessionEventMap`）：`dsh-tool-cordis/lib/types/api-catalog.js:6443-6444` = turn/start、turn/end、step/start、step/end、user/message、assistant/message、assistant/attempt、tool/call、tool/result、request/header、request/context
- 兼容桥的内部映射恰好是最强对应证据：SessionStart→`agent/created`、UserPromptSubmit→`agent/pre-step`、PreToolUse→`tools/pre-execute`、Stop→`agent/turn-stopping`、PermissionRequest→`approval/request`、SubagentStart→`subagent/start`（api-catalog.js:3716 / 3764 / 4236 / 3796 / 3852 / 4188）
- `WorktreeCreate` 全 asar 无对应；`PreCompact` 只有**事后**的 `compaction/start|end`（dsh-compaction/lib/types/invariant.js:77,80）

**B. client 侧事件通道（无需 host 转发）**
- `sessions` 服务：dsh-api-session-controller/lib/client.js:3192 `rootCtx.reflect.provide("sessions", this)`；`binding(id)` → `{sessionId, session, eventSource, ctx}`；`eventSource.subscribe` 返回 unsubscribe
- `uiSession` 服务：dsh-client-ui-session/lib/client.js:148 `sessionStatus`，数据源 :180 `ctx.remote.$on("api-session/status")`（覆盖全部会话）
- client 的 cordis `ctx.on` **只有 4 个事件**（connection/reset、locale/change、slots/changed、theme/change）——拿不到会话事件，必须走上面的服务

**C. 注入点**
- `conversation.hero.brand.mark`（root/single）：渲染条件 dsh-client-ui-conversation/lib/client.js:16016 `sessionId === void 0 || shellPhase === "blank" && (...)` → **只在空会话渲染**
- `conversation.input.left` / `.right`（session/list）：:17524 / :17532，**空会话与活跃态都渲染** → M6 选它
- `shell.overlay`（root/list）：dsh-client-ui-layout/lib/client.js:312，全局浮动层

**D. 素材核对（20/20）**
- 逐张内存解码：帧数与 §7.1 表 **20/20 一致**；统一 2080px 宽（8 列 × 260px/帧）、50ms/帧
- 三张有行尾 padding：happy 56格/52帧、idle-look 72/68、waking 32/30（逐格验证尾部全透明）
- 全部 20 态帧**底对齐 y=249** → 容器 bottom 对齐即可
- typing / conducting **48/48 帧触格边** → 切帧窗口宽必须 = 帧宽
- 源总体积 801.6 KB；降采样到 64px/帧约 159 KB（全 20 态）

**E. 现成先例（本机已装）**
- `@linxin666/dsh-pet` v0.4.6（Apache-2.0，源码随包分发）：host 侧 `ctx.on('session/event')` 投影 + client 轮询；纯函数投影 + clock-injected 状态机；挂 `document.body`（dock 是会话作用域，挂那里在新会话页会消失）。**M6 只借鉴设计，不引依赖。**
- `dsh-claude-style` 的 mascot（feature chunk 实测存在）：状态源与 M6 同路（uiSession + sessions），并发计数 `>=3 building / ===2 music`；WAAPI steps 播放；构建期每格四周留 gutter

**F. 探针活体验证（2026-10-11，隔离 web profile :19488，T3 执行 + 调度方复核）**

- **落点成立**：hero 态 `[data-conversation-session]` **有值**（走「有 id 但会话 blank」路径，不是无会话路径），`conversation.input.left` 在空会话与活跃态**都渲染**；像素采样 `rgb(255,138,0)` 两态各命中 170px。
- **注入**：`exports.inject = ['slots','sessions','uiSession']` 生效（服务名）；package.json 的 `dsh.client.inject` 是包名、仅信息性。
- **`eventSource.subscribe` 是失效通知（回调 0 参数）**，不是带 payload 的推送——必须自己 `getSnapshot()`。`change.kind` 实测 `append` / `settle-assistant`（**后者无 entries**）；transient 事件的 `seq` 是**小数**。
- **`tool/result` 的 `data` 上没有 `callId`**——配对必须走 `data.message.toolCallId`（实测与 `tool/call.callId` 逐字符相同）。`data.error` 只在失败时出现，`message.isError` 恒存在。
- **流事件真实词汇**：`assistant/live-chunk`（client-only transient），`data.chunk.type` ∈ block-start / reasoning-delta / text-delta / tool-call-delta / block-end / usage / finish。
- **`uiSession.sessionStatus` 是真 `Map`**，value = `{running, pendingInteraction, completionUnread}`；`running` 只有 true/false；**初始 size=0**（首帧无数据）。
- `sessions.list.byId[id].origin` 路径可读，但**无活体 subagent 行可验证过滤行为**（列为未验证，实现用防御性写法）。
- 证据：`.agents/tmp/m6-probe/probe-result.json` + `m6-probe-firstScreen.png` / `-active.png` + `probe_m6.py`（可复跑）+ `toplevel-scan.mjs`（顶层零声明扫描器，对现有 `lib/client.js` 基线 0 违规）。

**取证方法备忘**：DSH 安装体有**两份且版本一致**（`0.2.0-rc.2`）——桌面壳在 `app.asar`（`@deepseek-ai/dsh-desktop-runtime`），CLI 在全局 npm `C:\Users\pass\AppData\Roaming\npm\node_modules\@deepseek-ai\dsh`（隔离实例跑的是这份）。两份都可用 run_code 内的 node fs 直读：asar 那份要 asar-aware 的 fs（`fs.readFileSync(ASAR + '/dsh/...')`），npm 那份是普通目录。
