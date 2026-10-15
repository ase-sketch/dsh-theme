# Deepy 主位栖木跟住「整块」的顶缘（排队停靠面板在场时整体上抬）

## Problem

主位 Deepy 是 `position:absolute` 贴在输入卡（`[data-composer-card]`）右上缘的，
`top:-84px / right:16px` 这组几何只对**卡片自己的上缘**成立。

但输入块的可视顶边并不永远是卡片上缘：agent 忙时排队的消息由 shell 的 QueueDock
（`[data-queue-dock]`）渲染在卡片**上方**，且刻意与卡片融合——面板只留上半圆角、
`:after` 去掉下边框、`margin-bottom: calc(-1 * stack-gap - 3px)` 咬合进卡片。
用户 2026-10-15 截图实证：鲸鱼压在这块面板上，行右侧的「删除 / 插话」按钮被盖住
（只剩最左的编辑按钮露在外面），长文本预览也会被压在鲸身下面。

## Decision

把栖木锚点从「卡片上缘」改成「输入块的可视顶缘」：播放器每 200ms 粗测一次
「卡片顶 − 停靠面板顶」，把差值写成宿主的内联变量 `--deepy-perch-lift`，
CSS 里 `top:calc(var(--deepy-perch, …) - var(--deepy-perch-lift, 0px))`。

- 面板不在场 / 量不到（缺 API、异常几何）→ 抬升 0px，几何与 M9 完全一致；
- 面板在 ⟹ 整只鲸鱼上抬面板高度，继续趴在「整块」的顶缘，行内容与右侧按钮全部让开；
- 面板高度变化（多行 / 展开列表）被同一套粗测跟上；
- 锚点用 `[data-queue-dock]`：它是 QueueDock 组件写死的属性，不是 CSS module 的 hash 类名。
  读 shell 源码：栈的 children = [hero…, renderSlot("conversation.input.dock"), inputBar]，
  面板与卡片同栈且在卡片之前；槽位是 SlotOutlet 渲的 `display:contents` 包裹层，
  所以按「直接子节点 / 隔一层」两条口径试（`DEEPY_DOCK_SELECTORS`），停在最近的一层。

## Alternatives considered

1. **排队时隐藏主位鲸鱼**（照 `deepyMainVisible` 的单鲸规则加一条）。实现最小，但队列
   恰恰出现在「agent 忙碌」这一最需要陪伴的时段——忙碌档（thinking / typing / building）
   本来就是主位的语义高点，让它在这时消失等于把功能最有用的一段砍掉。
2. **只调 z-index，让面板盖住鲸鱼**。面板是不透明的停靠层，鲸鱼会被拦腰截断
   （头在上、鳍在下），读起来像渲染 bug，比现在的遮挡更糟。
3. **给停靠面板加 `--dsh-composer-dock-inset` 之类的让位留白**。那是在改 shell 的
   布局契约（`--dsh-composer-*` 是 shell 自己的量），本项目「不改 DSH 本体」的红线之外。
4. **把鲸鱼下移到卡片内**（卡片顶 + 一点）。会压到工具带（模型 / 附件 / 发送），
   那是真正可点击的一行，比压排队卡更不可接受。

## Consequences

- 收益：排队停靠面板出现时不再有遮挡（按钮、预览文本都能看见）；鲸鱼仍在视野里。
- 影响面：主位几何多一个变量、每 200ms 一次 `getBoundingClientRect`（低频节流，
  避免为一条低频几何白付每帧的强制同步布局）；宿主上多一个**自定义属性**，
  不产生盒子、不参与布局，M9/M10「不撑高 tools 行」的判据不变。
- 权衡：停靠面板很高（多行 / 展开）时鲸鱼会一起抬高到聊天区上沿附近；
  这是「跟着整块顶边走」的直接推论，接受。
- 留位照旧：`--deepy-perch` / `--deepy-perch-right` 仍是实机可覆盖的起点值，
  `--deepy-perch-lift` 由播放器写（默认 0px）。

## Confirmation

- `plugins/dsh-theme/test/composer-deepy.test.mjs`：M10.1-1…-9（纯函数边界 + 集成路径
  「接卡片/面板链 → 抬升 40px → 面板消失归零」）；宿主内联样式只允许出现
  `--deepy-perch-lift` 这一个自定义属性。
- `plugins/dsh-theme/test/render-layer.test.mjs`：发射出来的 `top` 必须是
  `calc(var(--deepy-perch, …) - var(--deepy-perch-lift, 0px))`，且默认仍是 -84px / 右侧 16px。
- 负控制（本轮实测三次都变红后还原）：① `deepyPerchLift` 恒返回 0 → 4 条红；
  ② CSS 漏掉抬升项 → 2 条红；③ `deepyDockFor` 找到面板也不返回 → 5 条红。
- 实机像素级确认（鲸鱼底缘与面板顶缘的距离）由用户刷新 GUI 后目验；单测只到几何契约层。
