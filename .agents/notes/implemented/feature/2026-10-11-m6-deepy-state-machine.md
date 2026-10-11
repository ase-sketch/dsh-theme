# Agent Note: M6 Deepy 状态机动画（插件期第一个功能特性）

Status: implemented — 2026-10-11 web 自动化验收四轮 + 顾问复核补验；2026-10-12 用户 desktop 真机验收通过

## Problem

M5 把 dsh-ui 视觉做成了自研 bundle 插件，但插件此前只承载「皮肤」一件事。M6 要给它加第一个**功能特性**：把 dsh-ui 规范的 Deepy 角色（20 态精灵动画）接进 GUI，按会话事件实时切状态。

开工前必须解决三个前置问题：

1. **规范给的事件表在 DSH 侧不存在**。design-spec §7.2 的 9 个事件（SessionStart / UserPromptSubmit / PreToolUse / PostToolUseFailure / Stop / PermissionRequest / PreCompact / WorktreeCreate / SubagentStart）是 **Claude Code 的钩子名**——7 个字面同名事件只出现在 DSH 的 `dsh-hooks-claude-code` 兼容桥里（那是用来兼容别人的 hooks 配置的适配层）。照抄会写出永不触发的死代码。
2. **落点不能照抄规范字面**。规范说 Deepy 在欢迎页品牌区（`conversation.hero.brand.mark`），但该 slot 的渲染条件是「空会话」；而驱动状态的事件只在会话**活跃**时发生。**两者互斥**——只挂 hero 会得到「需要切状态的时刻角色恰好不可见」。
3. **素材是 260px/帧的 5× 导出**（52 逻辑像素 × 5），而规范的显示尺寸 token 是 64px——**非整数比 4.0625**。

## Decision

1. **事件映射以 DSH 真实词汇为准**，不照抄 §7.2。持久会话事件 = `turn/start`、`step/start`、`assistant/message`、`tool/call`、`tool/result`、`turn/end`（+ `compaction/start|end`）；流式分片 = client-only 的 `assistant/live-chunk`（读 `data.chunk.type`：`reasoning-delta`→thinking、`text-delta`→typing）。`tool/result` 的配对必须走 `data.message.toolCallId`——**`data` 上没有 `callId`**。规范缺口回 dsh-ui 提，不擅自改上游。
2. **落点 = slot `conversation.input.left`**——活体实测确认空会话与活跃态都渲染（hero 态下 `[data-conversation-session]` 有值，走的是「有 id 但会话 blank」路径）。
3. **状态源走 client 侧服务**（`sessions.binding(id).eventSource` + `uiSession.sessionStatus`），不引入 host 转发与轮询。
4. **素材构建期降采样到 64px/帧**（与显示 1:1），面积加权 + **预乘 alpha**；只做首版 8 态所需的 8 张，产物入库。
5. **状态机 = 纯函数投影 + 无 IO 状态机**；终端态用**时间窗衰减**（记时刻、渲染时比较），不用 `setTimeout`；瞬时态可见时长恒为规范值（4800/5200/3200ms）。
6. **瞬时态契约（对作者规则的修正）**：`persistent()` 只换 base、不动瞬时态；只有 `turn/start`（`beginRound`）清瞬时态。
7. **渲染走 slot 的 React 渲染注入**（`DeepyView` 容器 + `DeepySprite` 用 ref 交回真实节点，`paint()` 校验 `isConnected`），不手动 `appendChild`。

## Alternatives considered

- **落点**：`hero.brand.mark`（只在空会话渲染，与会话事件互斥，否决）；`shell.overlay` 全局浮动（离规范「品牌区」最远，且与已装的 dsh-pet 视觉重叠面更大，否决）；input.left + hero 双落点（观感最完整，但工作量最大，本期不做）。
- **状态源**：host 侧 `ctx.on('session/event')` 投影 + client 轮询（dsh-pet 的做法，已验证可行；但多一层 HTTP 往返 + 2s 轮询延迟，否决）；client 侧服务（采用，dsh-claude-style 的 mascot 同路）。
- **素材尺寸**：源 260px 不降采样（801KB，否决）；52px（260÷5 整数比、像素完美，但小于规范显示尺寸）；**64px（采用，与 token 一致、1:1 显示、8 态约 392KB）**；65px（260÷4 整数比、像素完美，但需改 dsh-ui 的 token，收益仅「美观」——实测 64px 降采样无色晕无像素不均）。
- **瞬时态规则**：照搬作者 HTML 的 P3「持久态清瞬时态」（实测让规范给的 hold 值形同虚设——error 只活 10–270ms，否决）；改为 `persistent` 不动瞬时态 + `beginRound` 仅由 `turn/start` 调用（采用）。
- **渲染注入**：手动 `appendChild` 进 slot（React 重渲染会清掉它不认识的子节点，实测导致「切会话后精灵永久消失」，否决）；挂 `document.body` + 自行定位跟随（dsh-pet 的做法，但要自己算位置且脱离输入卡布局，否决）；**slot 的 React 渲染注入（采用）**。
- **单测能否替代活体验收**：不能。109 条纯函数单测全绿时，缺陷①（切会话丢精灵）与缺陷②（瞬时态被覆盖）都毫无察觉——两者都只在真实事件流 + 真实 React 渲染下暴露。

## Consequences

- **收益**：插件从「只有皮肤」变成「有功能特性」，且这条链（素材流水线 → host 路由 → client 状态机 → React 渲染）可复用于二期其余 12 态。
- **成本**：8 态素材 392KB（按需加载，首屏只拉 idle 约 19KB）；client.js 从 381 行增至约 1018 行；新增两个测试文件（状态机 130 条 + 渲染层 36 条）。
- **新增纪律**：`scripts/build-deepy.mjs` 与 `build-skin.mjs` 并列进 Quick Commands 快层；素材是构建生成物、**禁止手改**（同 skin.css / theme.css）。
- **已知取舍**：并发档位按 `uiSession.running`（会话活跃）计数，而 §7.2 注释写的是「跑工具」——按规范**文字**实现，偏差留档。
- **已验证（真机）**：动画手感（用户 2026-10-12 desktop 确认通过）。**未验证**：notification 态活体（隔离实例切不到「仅可查看」访问模式，触发不了审批请求）；error 触发率 6/10 的归因（静态查证 `interrupted` 来自 `dsh-session` 的 `openTurnClosers` 兜底、`aborted` 来自 `dsh-agent-loop` 的 abort 路径，两条路径都真实存在，倾向语义差异而非事件丢失）。
- **待复核**：素材许可（作者经 QQ 提供，随插件分发需确认）；模型档位 pill 无稳定语义属性、需 dsh-ui 补 `data-dsh-part`（与本特性无关，仅记录）。

## Confirmation

**四轮隔离 web profile 端到端验收**（每轮从零重装、按 PID 停实例、四步还原）：

- 端到端 12/12：slot 注入、帧在推进（875ms 内 17 个不同帧位置）、帧窗口宽=帧宽（64px）、素材按需加载（首屏仅 idle.png）、事件→状态链、开关 OFF 全撤（含 rAF 增量 0）、ON 恢复、console 零错、**像素可见**（非背景像素 776/4096，其中 559 与素材饱和色同源——防「计算绿≠可见」）、深色模式、负控制。
- 四态三合一（状态切 + 对应 PNG 被拉取 + 像素可见）：building / music / error PASS；notification 未验证。
- **两个真缺陷由独立验收方发现并修复，各有回归测试**：
  ① 切会话后精灵永久消失（`repro_sprite_loss.py` 红→绿对照）；
  ② 瞬时态被持久态覆盖（修复前 error 0/3 可见，修复后 6/10 可见且 hold 4724–4790ms）。
- **变异负控制 7 条**：m1/m2/m3（状态机语义）、r1/r2（缺陷①的两个成因）、h1/h2（缺陷②的契约），全部「变红 → 还原 → 复绿」。
- **顾问复核**（独立于实现方与验收方）判定覆盖缺口后补验：构建守卫对当前 HEAD 重跑（产出与入库逐字节一致）、Route A 生命周期边界、dsh-pet 共存、error 事件层归因。

**独立复验未采纳生产者自述**：编排方重跑了单测（130/0、36/0）、顶层零声明扫描器（0 违规）、全量变异负控制（7 条）、构建守卫（逐字节一致），并亲自查看首屏/深色/像素对比截图。
