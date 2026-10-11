# 里程碑（简版 · 2026-10-03 重写）

> 每期可独立验收；收口门禁：验收通过 + 边界核对 + 决策笔记 + 两分钟复盘。

## M1 皮肤上架可见（链路打通）—— ✅ 已完成（2026-10-03 自动化验收）
- 产出：skins/dsh-ui/（skin.json v2 + skin.css 首批 L1 映射：23 token × 明暗双套 + 根底色），已同步 $DSH_HOME/skins/dsh-ui/。
- 验收证据（隔离 web profile + Playwright 实跑）：① 设置 → 皮肤面板出现「dsh-ui Design Spec」卡（试穿/应用/卸载按钮齐全）；② 激活后 html[data-dsh-skin="dsh-ui"]、body 背景 = rgb(247,250,255)（#F7FAFF 规范画布）、主按钮 = #4D6BFE 品牌蓝；③ 切官方默认 → 当场回 rgb(255,255,255) 纯白；④ 再切回 dsh-ui → 当场回蓝调；⑤ 深色 body bg = rgb(19,22,29)（#13161D）。截图在 .agents/shots/e2e-*.png。
- 桌面端生效方式：激活态已写入 $DSH_HOME/skin-center-active.json（共享文件），用户刷新 GUI 即盖上皮肤，无需重启。

## M2 全量 L1 token 映射 —— ✅ 已完成（2026-10-04 自动化验收）
- 产出：映射表扩到 91 token × 明暗双套（bg/border/brand/button/code/file/interactive/label/link/markdown/scrollbar/state/toast/specific/hovercard 15 组），跳过项与理由显式写在 mapping.json $comment；裁决口径与备选见归属笔记 .agents/notes/implemented/feature/2026-10-04-m2-full-l1-token-mapping.md。已同步 $DSH_HOME/skins/dsh-ui/。
- 验收证据（隔离 web profile + Playwright，脚本 .agents/shots/_m2_verify.py）：91 token × 明暗 + 根底色全部命中 preview :root 期望值；API 切官方默认 → bg 回 rgb(255,255,255)、skin 属性消失；再切回 → rgb(247,250,255)。截图 m2-light/dark/stock 在 .agents/shots/。
- 留 M3 裁定：font 全家 181 个未映射（排版非色板，shorthand 覆盖分项）；elevation/corner-shape 等非色 token 未碰。

## M3 组件级打磨与预览图 —— ✅ 已完成（2026-10-04 自动化验收）
- 产出：skins/dsh-ui/patches.css（L2 语义属性规则 + L3 最小 class* 兜底 + 非 alias 命名空间 token 重绑定）；构建脚本发射 99 个 --dsh-* 变量并加两条守卫；preview/light.jpg + dark.jpg（1440×900）。归属笔记：.agents/notes/implemented/feature/2026-10-04-m3-component-layer-and-nonalias-namespace.md。
- 验收证据：① _m3_verify.py 24 条断言全绿（输入卡 20px 白底 1px 描边、侧栏纯色 + subtle 分隔线、新建会话实心主按钮、会话选中 bg-active + 2px 品牌色指示条、设置面板 20px，明暗双套）；② _m3_compare.py 与 preview 基准逐项对照，5 组件 × bg/radius/border 仅剩 1 项可接受偏差（GUI「预览版」徽章多 1px 近同色描边）；③ 构建守卫负控制已证明会红；④ 皮肤卡加载 preview/light.jpg（natural 1440×900）。截图 m3-*.png。
- 关键发现：皮肤中心把 --dsw-alias-* 派生到 shell 实际消费的非 alias 命名空间（--dsw-specific-*），且 --dsw-radius-* 不在 299 契约内——这是 M2 只改色板、改不动组件几何的根因。
- 用户裁定：font 全家 181 个不纳入本期（官方 72 处 font: shorthand 消费使「只映分项」自相矛盾；全量接管会作废本期截图基线）。
- 已知缺口（**M5/二期候选**，不在 M4 范围）：模型档位 pill 无稳定语义属性（需向 dsh-ui 提 data-dsh-part）；font 排版层未接管；卡片预览图缩放后细节偏小；对 loader 派生区的隐式依赖需回归。

## M4 收口 —— ✅ 已完成（2026-10-04 自动化验收 + 用户真机验收）
- 产出：README.md（先讲怎么用：启用条件 / 试穿·应用·切回 / 换机器安装 / 构建链 / 验证 / 已知缺口）；三件套补齐（AGENTS.md Quick Commands 分快慢两层、ARCHITECTURE.md 回写 M3 边界、.agents/notes/ 归档 M1 bundle 笔记至 archived/ 并更新 Status）；仓库清理（移除误跟踪的 _instance_url.txt——含实例 token，.gitignore 加规则防复发）。
- 验收证据（自动化部分，2026-10-04 重跑）：隔离实例跑 _m2_verify.py（91 token × 明暗 + 根底色全绿）、_m3_verify.py（组件层 24 断言全绿）、_m3_compare.py（与 preview 基准逐项对照，仅 1 项已知可接受偏差）；快层构建 + 守卫通过。
- 真机验收：**用户确认通过**（皮肤卡应用 → 日常使用 → 切回官方默认，全链路）；2026-10-11 随 M5 口径一并回写。

## M5 插件化（终局；2026-10-03 定方向，2026-10-10 定形态与范围）—— ✅ 已完成（2026-10-10 web 自动化验收 + 用户 desktop 真机验收通过）
- 形态：自研 **bundle 插件**（形态 A，本地 desktop profile 自用先行）。骨架照抄本机活样本 skin-center 的 package.json 三要素，不 fork dsh-claude-style。
- 前置：**已完成**。2026-10-03「自制 bundle client 半未激活」的诊断已被推翻——真相是 `ctx.effect` 把卸载函数当 effect body 传，装上即被同毫秒撤掉（证据链见 HANDOFF.md §3.4；实验产物 .agents/tmp/m5-rootcause/REPORT.md，未跟踪）。
- 产出：plugins/dsh-theme/（host 半开关持久化 + client 半样式注入/设置面板/语义锚点适配器 + assets/theme.css 构建生成物）；build-skin.mjs 新增插件版自包含 CSS 产出（复刻 loader 变换：作用域重写 + 派生 + var() 别名深色重求值）。
- 验收证据（隔离 web profile，生产者自检 + 独立复验双轮）：① D4 探针门三行断言 + 负控制 + console 零错（.agents/tmp/m5-probe/）；② 功能七条全绿（面板出现、ON 注入/OFF 卸载/跨重载持久化/loader 级静态禁用可逆）；③ parity_m3 17/17 与纯皮肤期一致；④ 像素采样证明真实可见（品牌蓝 ON=2316/OFF=0）；⑤ 深色曾被独立验收抓红（var() 别名锁死浅色），修复后 7 采样点 Δ=0、暗区占比 98.21% vs 基线 98.15%，浅色截图 md5 零回归（.agents/tmp/m5-plugin/、.agents/tmp/m5-verify/REVERIFY-report.md）。验收**不含** Deepy——它已移出本期。
- 分发：已装 desktop profile（**disabled:true 待机**，重启后插件页可见、手动启用生效）；官方市场上架留后续里程碑。
- 真机验收：**用户 2026-10-10 确认通过**（重启 DSH → 插件页启用 dsh-theme → 走 HANDOFF.md §9 清单 + 设置面板开关 + 深色切换）。当前 desktop profile 内该插件为 `disabled: true` 待机态，按需在插件页启用。
- 复盘：本轮三条隐性假设（计算绿≠可见 / var() 在声明处求值 / file: 是复制语义）已沉淀进 HANDOFF.md §5 与归属笔记 Consequences，收口门禁四项齐。


## M6 Deepy 状态机动画（2026-10-11 定范围并完成）—— ✅ 已完成（四轮 web 自动化验收 + 用户 desktop 真机验收通过）
- 目标：把 dsh-ui 规范的 Deepy 角色接进 dsh-theme 插件，按 DSH **真实**会话事件实时切状态。
- 范围（用户 2026-10-11 拍板）：**核心 8 态** = idle / thinking / typing / happy / error / notification / music / building；**落点 = 常驻输入卡片**（slot `conversation.input.left`）；不做交互层（点击/连点/拖拽/游走——作者源 HTML 零实现）与空闲彩蛋/睡眠（留二期）；与 @linxin666/dsh-pet 互不相干、各自开关，不写互斥逻辑。
- 关键前置发现（两项只读调查 + 调度方独立复核，证据见 HANDOFF.md §10）：① **design-spec §7.2 的事件表是 Claude Code 钩子名，DSH 侧不存在**，按真实词汇（`turn/start`、`step/start`、`tool/call`、`tool/result`、`turn/end`、`assistant/live-chunk`）实现并回 dsh-ui 记缺口；② **品牌区 hero 只在空会话渲染**、与会话事件互斥，故落点选 input.left；③ 素材 20 张帧数与 §7.1 表 20/20 一致（三张有行尾 padding，切帧按每态真实帧数取模），**切帧窗口宽度必须 = 帧宽**；④ client 半可 inject `sessions`/`uiSession`，无需 host 转发。
- 产出：`scripts/build-deepy.mjs`（素材流水线，预乘 alpha 面积加权降采样 260px→64px，四条守卫）+ `plugins/dsh-theme/assets/deepy/`（8 态 PNG + manifest，**构建生成物禁手改**）+ host 素材路由（`kind:'prefix'` + 白名单 + 只解码一次）+ client.js Deepy 段（纯函数投影 + 无 IO 状态机 + slot 的 React 渲染注入）+ 两个测试文件（状态机 130 条 + 渲染层 36 条）。归属笔记：`.agents/notes/implemented/feature/2026-10-11-m6-deepy-state-machine.md`。
- 验收证据（四轮隔离 web profile，每轮从零重装、按 PID 停实例、四步还原；编排方重跑关键验证，不采纳自述）：
  - **端到端 12/12**：slot 注入、帧在推进（875ms 内 17 个不同帧位置）、帧窗口宽 = 帧宽（64px）、素材按需加载（首屏仅 idle.png）、事件→状态链、开关 OFF 全撤（含 rAF 增量 0）、ON 恢复、console 零错、**像素可见**（非背景像素 776/4096，其中 559 与素材饱和色同源）、深色模式、负控制。
  - **四态三合一**（状态切 + 对应 PNG 被拉取 + 像素可见）：building / music / error PASS；**notification 未验证**（隔离实例切不到「仅可查看」访问模式，触发不了审批请求）。
  - **生命周期边界 4/4**：会话归档、极窄视口（420px 与 320px 下精灵均在视口内）、隐藏/恢复（frozen→resumed）、切工作区。
  - **dsh-pet 共存**：功能 PASS（pet 可召唤、Deepy 正常切状态、console 零错）；视觉 overlap=0、间距 518px（pet 可拖拽，拖过去会重叠属用户行为）。
  - **事件层归因**：error 触发率 6/10 属**设计非缺陷**——有 in-flight 工具的失败 `tool/result` 才有 error，随后 `turn/end(aborted)` 在新契约下不再清它（6 次中断 1:1 相关）。
  - **多订阅**：同一 `eventSource` 支持多订阅、无单订阅限制，多插件可安全共享（探针 2 个 + 本插件 1 个，6/6 session 命中数一致）。
  - **变异负控制 7 条**全绿，其中 r1/r2 是缺陷①的两个成因、h1/h2 是缺陷②的契约。
  - **快层构建**：deepy 守卫 1–4 全绿，产出与入库**逐字节一致**。
- **两个真缺陷**（均由独立验收方发现 → 实现方修复 → 复验转绿，各有回归测试）：① **切会话后精灵永久消失**（手动 `appendChild` 进 React 拥有的 slot 容器，React 重渲染清掉它不认识的子节点；改为 React 渲染注入后修复，`repro_sprite_loss.py` 红→绿）；② **瞬时态被持久态覆盖**（照搬作者单机演示的抢占规则，使规范给的 4800/5200/3200ms hold 形同虚设，error 只活 10–270ms；改为 `persistent` 只换 base、仅 `turn/start` 清瞬时态后，实测 hold 4724–4790ms）。
- 真机验收：**用户 2026-10-12 确认通过**（动画手感、切会话后精灵仍在、开关联动）。
- 仍未验证：notification 活体（隔离实例触发不了审批请求）；隐藏/恢复用了 override `document.hidden` 的等价路径（本机 Chromium 无 `Emulation.setPageVisibilityOverride`）。
- 待复核：**素材许可**（作者经 QQ 提供，随插件分发需确认——本地自用不阻塞）；**并发档位口径**（`uiSession.running` 是「会话活跃」，§7.2 文字写「会话」、注释写「跑工具」——按规范文字实现，偏差留档）。
- 复盘（门禁④）：本轮三条隐性假设已沉淀进归属笔记——**单测不能替代活体验收**（109 条纯函数单测全绿时两个缺陷毫无察觉）、**规范与作者实现不能照搬**（§7.2 是 Claude Code 钩子名；作者的抢占规则在长会话事件流下失效）、**探针/测试的输出格式本身也要被验证**（`{type:null}` 实为 `settle-assistant` 包装条目，曾导致假设偏差）。

## 下一期（M7+，不在本期）
- Deepy 二期：交互层（点击/连点/拖拽/游走）、空闲彩蛋与 60s 睡眠、其余 12 态。
- 官方市场上架（M5 分发行）。
- 视觉缺口：font 排版层 181 token；模型档位 pill（需 dsh-ui 补 `data-dsh-part`）。
- M5 残留风险：互斥 API 路径实测、持久化迁官方 settings 服务、验收脚本从 `.agents/tmp` 迁 `.agents/shots` 并纳管。