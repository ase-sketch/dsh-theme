# 里程碑（简版 · 2026-10-03 重写 · 2026-10-31 M11 增量）

> 每期可独立验收；收口门禁：验收通过 + 边界核对 + 决策笔记 + 两分钟复盘。
> **本轮范围已收口**：M1–M10 全部完成并验收（M7–M10 的桌面真机由用户 2026-10-14 确认通过），本期交付项已全部完成。文末「已知限制与后续候选（不阻塞交付）」是**限制与候选记录**，不在已交付范围内。

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
- 分发：已装 desktop profile（M5 收口时该插件为禁用状态；2026-10-14 起已启用——cordis.patch.yml 的 `ui-skin-dsh-theme` = `disabled: false`）；官方市场上架留后续候选。
- 真机验收：**用户 2026-10-10 确认通过**（重启 DSH → 插件页启用 dsh-theme → 走 HANDOFF.md §9 清单 + 设置面板开关 + 深色切换）。M5 收口时该插件为禁用状态；现为启用态（`disabled: false`，2026-10-14 核实）。
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


## M7 深空编辑室重设计（2026-10-12 定范围并完成）—— ✅ 已完成（web 自动化验收 + 用户桌面真机验收通过）
- 目标：视觉与 dsh-ui 规范脱钩，用户拍板「深空编辑室·暗色优先」先锋方向；图标统一 Lucide；全程禁 emoji；明暗双套；Deepy 保留融入。
- 范围（用户访谈五问拍板）：新设计源落 design/tokens.css（保持构建链纪律）；插件 client 半做全界面图标层；Deepy 保留并融入（用户追加授权「吉祥物位置大胆发挥」→ 月台底座 + hero 迎宾位 + 单鲸规则）。
- 产出：design/preview.html（定调稿，冻结）→ design/tokens.css（153 token 双套，机器生成）；build-skin.mjs 换源 + 守卫补强（SHELL_RESERVED 7→42 + noise-uri 断言）；mapping.json 91 键零改动（18 色槽 1:1 覆盖）；patches.css 重写四段（组件/排版/氛围层，排版走 --dsw-font-family 变量重绑杠杆）；图标层（build-icons.mjs→lucide.json 2141 个、build-icon-map.mjs→icon-map.json 111/139、overrides 三通道策展、运行时非破坏式注入）；Deepy 月台+迎宾位（deepyMainVisible 纯函数单鲸规则）。
- 验收证据：① T4/T5 生产者自检（负控制 NC1–NC4 + 3 条全部红后还原，测试 130+55+77 全绿）；② 编排方独立重跑全部测试与构建 + 亲验 T6 隔离实例（浅色 #F5F1E8/深色 #0B0D14/朱砂命中、图标 applied=53、单鲸双向切换、真实设置面板 OFF/ON 往返、console 零错，脚本 .agents/shots/_m7_t6_*.py）；③ 顾问 S1 复核（K1/K4 satisfied；K2/K3 编排方仪器实测；K5 动效留真机）。归属笔记：.agents/notes/implemented/feature/2026-10-12-m7-deep-space-editorial-redesign.md。
- 真机验收：**用户已确认通过**（2026-10-14；桌面 profile 已装当前构建并启用，`ui-skin-dsh-theme` = `disabled: false`；安装副本与仓库构建的 `lib/client.js`、`assets/theme.css` 两文件 md5 实测一致）。
- 已知限制：图标映射覆盖 111/139（28 条带理由未映射：结构性 13 + 品牌色 11 + 策展跳过 4）；抽取器 1 条覆盖缺口（设置页 tab strip）；呼吸辉光无 reduced-motion 降级（scopeSkinCss 拒 @media）；preview.html 与 tokens.css 有一处改名 drift（--dsh-scrollbar-thumb→-w，守卫可拦）。

## M8 编辑室质感层（2026-10-12 用户追加并验收）—— ✅ 已完成（web 自动化验收 + 用户桌面真机验收通过）
- 范围（用户逐项确认 + 「大胆发挥」授权）：消息流编辑版面化（720px 版心/段落节奏/hairline/时间戳 micro-label）、活字流态（data-dsh-streaming + 段落渐显 + 朱砂方块光标）、微交互统一（180ms 长尾缓动/回弹/上浮/::selection）、滚动条接管（颜色已由 L1 覆盖，补 4px 细 thumb）、熄灯仪式（双向圆形擦除 lights-out/lights-on，替代普通 crossfade）、hero 封面（刊号行+版记+迎宾鲸三层纵向装配）、质感层（标签舌/排版标尺/网格 60s 漂移/DONE 章票据化工具卡/toast·pill mono 化）、输入卡双档固定尺寸（主 36px / hero 52px，用户追加：「不管输入什么内容都不变大」）。
- 产出：tokens 153→159；patches.css 464 行；client.js 钩子层（流态/熄灯/光晕四档/封面装配/滚动浮现）；新增 hooks-layer 测试套件。
- 验收（编排方 T8 隔离实例亲验）：封面无叠印、双档输入卡粘贴长文纹丝不动且内滚、单鲸切换、720px 版心、流态钩子、熄灯 8/8 帧 lights-out + lights-on、console 零错；测试 130+76+77+100 全绿；负控制含「封面绝对定位回归」「classList 缺陷」等。守卫补强：patches 引用校验改为去注释后扫描（注释引用变量名的假阳性）。
- 已知限制：输入区尺寸观感项（R1）——M8 期的 36px 主输入区形态已由 M8.5 → M9 → M10 的输入卡改版取代，当前版式（书写纸三行）用户已确认通过；DONE 章已改 hover 才显现（用户拍板，2026-10-12）；网格漂移无 reduced-motion 降级（scopeSkinCss 拒 @media）；钩子的 shell 锚点（data-conversation-content 等）随 shell 升级可能漂移（进回归清单）。

## M8.5 编辑台（2026-10-12 用户实测驱动）—— ✅ 已完成（web 自动化验收 + 用户桌面真机验收通过）
- 起因：用户真机实测抓到——输入卡仍会长（额度刷新/粘贴/附件）、模型名被挤没、po06「优化选项」面板断位出窗。
- 机制根因（读源码取证）：① 工具条 flex-wrap:wrap 折行使整卡 +34px；② standardControls flex-shrink:1 + observeControlRow 的 data-model-compact 双层截断模型名；③ 我们的聚焦 translateY 给容器建包含块，po06 的 fixed 面板被改锚（M8 引入的真缺陷，已回退）。
- 产出：整卡逐行锁定（工具条不折行/左簇横滚吸收挤压/右簇钉死/附件行定高 64px 横滚/模型名强制完整）；编辑区两行恒定（主 52px / hero 68px，=官方行高×2+padding，按定义成立）；作品层（空态稿线/台面线聚焦点亮/发送键空填双态/内滚渐隐带/pill 小标注化，全部消费 client 的 data-dsh-editor 契约）；月台联动（filled 时 rim 提亮，::after 专注光层避开呼吸动画覆盖）。
- 兼容纪律（新红线，用户「上」拍板）：容器禁 transform/filter/perspective 等包含块属性（伪元素/叶子/瞬时态除外）；几何改动标影响面；插件共存进验收（本轮起 po06 入隔离实例实测）。
- 验收（编排方 T9 隔离实例，po06 共存）：15/15——空填翻转/稿线/发送键双态/长文+锁定/整卡高度不变/po06 面板完整在视口/发送后回落/双档/单鲸/模型名/console 零错 + 月台联动专项（活跃会话实测 PASS）。测试 130+76+77+135 全绿。
- 已知限制：编辑区不跟随字号设置（固定 vs 跟随的固有冲突，注释里有兼得改法）；左簇横滚窄窗口可发现性（R2）；超长模型名+极窄窗无进一步降级（R3）。

## M9 编辑台 v2 · 出格（2026-10-12 用户定方向：放弃对称一致、允许出格）—— ✅ 已完成（web 自动化验收 + 用户桌面真机验收通过）
- 起因：用户真机评价 M8.5 输入卡「没想象中那么好」——稿线像没对齐的横格本、工具条拥挤掉行、鲸鱼像硬塞的零件。用户裁定：放开限制、不对称也是美。
- 产出：卡片 grid 重构（display:contents 拆工具条行，左簇低调 mono 单行横滚、右簇竖排两行小标注）；编辑区三行（76/92px）；稿线退役；空态 placeholder 衬线斜体；发送键 filled 态大圆出界（scale 1.18 + 负 margin）；Deepy 趴卡片下缘半身出格（absolute 脱流，锚定卡片自身）；打字时鲸鱼抬头（idle-look 素材入构建管线，状态机投影层与事件档语义分离）。
- 新机制发现：slot 注入物的内联 flex-wrap 只有窄域 !important 能压（已制度化登记为兼容例外 #1，patches.css 头部登记区）；grid auto 列 + 竖排让「折行」在机制上消失而非被压制。
- 验收（编排方 T10，po06 共存）：编辑区两档锁定/整卡高度不变/placeholder/右簇竖排/发送键双态/po06 面板视口内且排版正常/窄视口单行/单鲸/console 零错。测试 151+98+77+135 全绿。鲸鱼抬头端到端在隔离实例未能实测（环境内模型调用挂起）——钩子属性翻转实测过、投影有 21 条单测；桌面真机补验已随本轮确认完成。
- 已知限制：tools 行高被右轨拉伸属设计意图；placeholder 中文是合成伪斜体；display:contents 使官方 @container 窄容器规则失效（gap 恒 12px，影响小）。

## M10 输入框 V3 · 书写纸（2026-10-13）—— ✅ 已完成（隔离实例自动化验收 + 用户桌面真机验收通过）
- 产出（用户批准后接入）：输入卡改版为**轻框三行书写纸**——正文区完整显示三行、长文内滚；工具带收成**单行**，长模型名与插件控件挤不动它，额度/模型标签不丢、附件功能不隐去；原「优化选项」与运行统计弹层保留。**96px 主位鲸鱼贴输入卡右上缘、无底座**（M9 的月台底座退役）；字号适配、模型 compact 截断与聚焦线一并回归。**M9 的堆叠/出界组织及预览附件保留行不再作为正式布局。**
- 验收证据（隔离 web profile + Playwright，脚本 `.agents/shots/_m10_verify.py` 等，产物 m10-*.png）：① 真实隔离实例 UI 断言 **36/36 通过**（main-report.json，errors 为空）——正文 ≥3 完整行、长文内滚、单工具带不被撑开、quota/model 标签不丢、附件功能不隐去、菜单在视口内且不改原插件内部布局、鲸鱼帧尺寸与 offset 96px 且不碰正文与工具、保留实际会话/Token/上下文统计且分项弹层可达、空态/活跃/忙态/终态与单鲸不回归、浅色/深色/1440/1100/900 宽实测；② 插件五个测试套件 **190 + 110 + 135 + 77 + 87 = 599 条断言全绿**（state-machine / render-layer / hooks-layer / icon-layer / composer-deepy，`.dsh-tmp/v3-integration/unit-log.txt`）；③ fresh 独立终审通过（`.dsh-tmp/v3-integration/final-code-review.md`，三处冻结项全过：turn/end 先落 base=idle、contenteditable 叶子 outline:none、既有常量与单鲸规则未被触动）。
- 桌面装配与真机验收：插件已更新到桌面 profile 并启用（`ui-skin-dsh-theme` = `disabled: false`），安装副本与仓库构建的 `lib/client.js`（md5 2589504af54492ec247da45f3d3f60d7）、`assets/theme.css`（md5 00d789927088be9f64b342ad31fc06d2）实测一致；**用户 2026-10-14 确认 M1–M10 全部完成**，本轮无遗留项。
- 未验证（不阻塞）：隔离夹具只模拟外部模型 HTTP，main-report 的 token 数为假估，**不得**当作真实模型能力证据；桌面安装态由用户真机确认，代理不自行重启用户 DSH。
- 设计理由与验证边界见[归属笔记](<E:/dsh-theme/.agents/notes/implemented/feature/2026-10-12-m7-deep-space-editorial-redesign.md>)。

## M11 新会话 · 今日工作台（2026-10-31）—— ✅ 隔离实例验收完成，桌面待装配

- 产出：新会话由居中迎宾封面改为左右两栏——左栏本地时间、任务标题、工作区与输入卡，右栏真实天气与 42 格月历；Deepy 只留输入卡主位，余额不重复进入主界面。天气使用 host 的 Open-Meteo 只读代理（默认东莞、8s 超时、10min 缓存），失败不伪造数据；月历支持翻页与返回今天，900px 下移、720px 折叠。
- 场景增补：新增 12 个场景 token（总计 175），浅色雾白瓷感、深色暗室雾光；新会话移除网格与排版标尺，天气改为开放环境，云朵使用独立三档体积色与柔化边缘。
- 地点增补：城市名可点击，支持地理编码搜索、候选地点、选择后刷新与持久化；首次默认东莞，但不再写死地点。新增 `weather-location.json` 原子保存与按地点隔离的缓存。
- 验收：七套测试 **645 条断言全绿**，build-skin 守卫通过；隔离 Web profile + Playwright `_today_verify.py` **24/24**，覆盖真实天气、地点搜索/选择/刷新后保留、月历操作、两栏不重叠、无网格与排版标尺、开放天气环境、深色计算色、响应式与 console 零错。主代理已走查浅色/深色/窄窗口与地点选择器截图。
- 边界：桌面 profile 已重装最新实现，需用户重启生效；天气依赖城市级外部服务，离线时显示不可用，其余工作台功能不受影响。设计取舍与机制证据见 M7 归属笔记的 M11 增补。

## M12 全界面 · 活字剧场（2026-10-31）—— ✅ 真实聊天区验收完成

- 产出：聊天区与今日工作台共享明暗场景；助手正文按 `assistant*` 类型采用章节式阅读，用户消息改为缩进导演批注，工具行使用真实 `data-state` 状态轨。侧栏改为时间线式选中与 hover 位移，输入卡聚焦与场景边缘统一。场景大字只在真实生成态出现，滚动观察器随会话滚动根重建，位移动效仅落在文字叶子，支持 reduced-motion。
- 验收：七套测试 **647 条断言全绿**，build-skin 守卫通过；真实会话快照 + Playwright `_living_verify.py` **11/11**，覆盖消息排版、用户批注、工具状态轨、滚动动效、输入聚焦、深色、900/720px 与主题相关 console/资源零错。主代理已实际走查明暗聊天截图。
- 边界：快照环境的 `changes.summary` 两次返回 404 `Change summary unavailable`，已单列为环境限制，不计入主题资源错误；未改动真实会话数据。桌面 profile 已重装最新实现，需用户重启生效。设计证据见 M7 归属笔记的 M12 增补。


## M13 · 压印层 IMPRINT：书刊化重绘（2026-11-01）

> 用户判定 M12「活字剧场」审美不达标（"k31 重绘的 UI 审美不行"），要求对标 Awwwards / FWA 每日最佳水准重绘。本轮改的是**设计语法**，不是配色。

### 做了什么

- **方向**：把界面排成一本每天出的刊物——目录式侧栏（01–04 序号 + 发丝线）、报头（刊名小标 + 96px Georgia 时刻 + 72px 思源宋体主标题）、页边注（用户消息 `Nº 03 / 你`、助手 `— / 助手`）、横格稿纸输入卡（双墨线 + 21px 格距 + 右端淡出）、右栏气象与月历去卡片化。
- **token 层**：179 个 token × 明暗双套重写人（95 条换值 + 新增 4 条编辑版心 token：`--dsh-text-read`/`--dsh-lh-read`/`--dsh-measure-read`/`--dsh-gutter-note`）。纸 `#F6F3EC` / 墨 `#16130F` / 朱砂 `#B23A26`（浅）、`#121110` / `#EFE9DC` / `#D8563A`（夜版）。字体改两族对打：思源宋体承担全部中文，Georgia 承担拉丁与数字，等宽只留给代码。
- **形**：`--dsh-radius-*` 全部归零、阴影全部 `none`——层次只由线与留白表达。
- **动效**：唯一缓动 `cubic-bezier(.16,1,.3,1)`；报头墨从左刷过（clip-path）、页边注逐块上浮、发送键悬停上抬 1px。

### 验证

- 构建：`node scripts/build-skin.mjs`（守卫通过，104→121 个 `--dsh-*` 引用）。
- 单测：state-machine / render-layer / hooks-layer / icon-layer / composer-deepy / host / today 七套全绿。
- 真机（隔离 web profile :19488，Playwright）：`.agents/shots/_imprint_verify.py` **15/15 通过**（纸色、Georgia 96px 报头、72px 衬线主标题、目录序号、日历墨块、夜版纸色、页边注 counter、气泡底色清除、正文 15.5/31、工具行等宽、console 零错误）。证据与截图见 `.agents/shots/m13-*.png` 与 `m13-report.json`。

### 限制

- M12 的 `_living_verify.py` 断言是旧视觉（气泡/2px 导演批注/16px 正文），已被本里程碑取代；保留作 M12 历史证据，不再作为现役门禁。
- 会话页报头目前用 CSS `::before` 注入静态刊名（`会话刊 · THE SESSION JOURNAL`），不是真实期号；期号/页码若要真数据，需要在 client 半接会话元信息。
- 只覆盖浅/深两套主题与 1440/1280 两档宽度，未做更窄窗口的响应式收口。


### M13.1 · 账户抽屉（2026-11-01，用户追加）

- **需求**：侧栏底部的插件条目（Remote 入口、今日消费卡）视觉上收进账号菜单，点账号行弹出即可查看，且功能不变。
- **做法**：不搬 DOM（那些节点是别家插件渲染的 React 宿主，搬移会在对端重渲染时丢失、卸载无法还原）。client 半新增 installAccountDrawer()：把 footerActions 与 footArea 里那个无类名的消费卡包装节点改成 position: fixed，平时不可见不吃指针；账号行点击切换 body[data-dsh-account-drawer]，两个节点按 JS 量出的 --drawer-card-bottom / --drawer-actions-bottom 叠在原生菜单上方，点外部或 Esc 关闭。与样式链同一个 ctx.effect 可逆对。
- **同时修复**：① 纸纹噪点 0.30 → 0.055/0.06（0.30 是整页装饰稿的量，乘在小字上会吃字形，用户报"字体重叠"）；② Deepy 抬到输入卡双墨线之上（原来线从鲸鱼身上穿过）；③ M12 的整屏"生成中"描边大字在会话页关掉。
- **验收**：七套单测全绿（render-layer 曾因测试桩没有 window.addEventListener 报红，已改为逐个守卫）；_imprint_verify.py 15/15；真机窗口逐态截图核对：关闭态侧栏底部只剩一行账号，打开态抽屉排在原生菜单上方、消费卡与 Remote 均可点。
- **已知边界**：Remote 入口在抽屉里会折成"Remote / 有更新"两行（条目自身的 flex 布局，未强行改写）；抽屉条目来自别家插件，其内部弹层若用 position: fixed 会以视口为准。


### M13.2 · 选择器越界与墨线叠放（2026-11-01）

- **用户报障**：① 插件管理页每个插件名前面都被塞了一句「会刊 · THE SESSION JOURNAL」，且某行被挤成一列竖排字；② 会话页刊名后面的英文占地方；③ 鲸鱼仍被输入卡双墨线穿过。
- **根因**：① 报头 kicker 与页签用的是裸选择器 [class*=titleRow] / [class*=tabs] / [class*=sectionHeader] / [class*=panelRow]，命中了插件管理页的同名类；② 双墨线画在 [data-composer-card]::after 上，伪元素晚于子元素绘制，而 deepy 的 z-index 只在自己的层叠上下文里生效，压不过卡的伪元素。
- **修法**：① 全部收窄——报头用 [class*=titleRow]:has([class*=titleCluster])::before，页签用 [class*=viewTabs]，目录/分节标题/树行统一挂 [data-dsh-surface="sidebar"]，M8 的 meta/time 规则一并收窄；② 第二条墨线改画在卡自身的 background-image 上（背景先于子元素绘制），鲸鱼自然压住线；③ 刊名只留中文「会话刊」。
- **验收**：七套单测全绿；_imprint_verify.py 15/15（行高锁死规则随收窄被误删过，已补回）；真机窗口逐页核对——插件管理页无多余刊名、会话页报头只有「会话刊」、鲸鱼压在墨线之上。


### M13.3 · 纸面质感：结构 + 光（2026-11-01，参照 rinDBeans/dsh-nocturne）

- **参照结论**：该项目把「纸」拆成 albedo（云斑/纤维/纸齿/帘纹）× 一盏斜射灯的 irradiance，再用 multiply 合成；它明确否掉了「一层 feTurbulence 灰噪声」的做法——"没有光，所以不像纸"。我们上一版只有一层均匀噪点，且噪点压在字上，双重错误。
- **做法**：新增 6 个 token：`--dsh-paper-tooth`（feDiffuseLighting 斜光浮雕的纸齿）、`--dsh-paper-mottle`（超低频云斑）、`--dsh-paper-blend`（浅色 multiply / 夜版 screen）、`--dsh-paper-tile`、`--dsh-paper-sheen`（左上高光）、`--dsh-paper-shade`（右下暗角）。纹理与光全部画在**表面自身的背景层**上（文字之上没有任何叠加层），层序：纸齿 → 云斑 → 高光 → 暗角 → 纸色。
- **可复现**：贴图由 `scripts/build-paper.mjs` 生成（程序化 SVG，约 1KB/张），`--write` 写回设计稿 manifest 与两端变量块，再 `build-skin.mjs --regen-tokens`。
- **踩坑**：① `feComponentTransfer` 默认在 linearRGB 里算，0.05 会被 sRGB 转成 ~0.24 的灰——夜纸整片发灰即此因，filter 必须写 `color-interpolation-filters="sRGB"`；② 纹理规则一度输给 M13 早先那条 `body:not([data-ds-dark-theme]) …` 的光照规则（它多一个元素选择器），已并入纸面规则。
- **验收**：真机（1280×800）纸面像素标准差从 0 提到 ~2.5（细纸齿可见、字仍干净）；深浅两套各出一版 1:1 截图比对；单测不受影响。


- **M13.3 补（全站铺纸）**：第一版只给「聊天区 + 侧栏」铺纸，插件页/设置页仍是平色，读起来割裂。改为铺 shell 的两根柱子（`sidebarCol` + `centerCol`），聊天区让出底色让主列的纸透上来；输入卡、菜单、弹层、天气/月历卡、消费卡、toast 再各叠一层纸（纸叠纸）。踩坑：① 内部变量块写成 `html[data-dsh-theme] body`，被构建期再前缀一次变成 `html[...] html[...] body`，永不匹配——变量要么只写 `body`，要么直接把四层写进选择器；② 主列的纸会盖住聊天区自己的纸，所以必须把聊天区的底色置空，否则两层纸叠成一块脏色。


- **M13.3 补二（为什么"看着不像纸"）**：纸确实铺在 `sidebarCol` / `centerCol` 上了，但壳在这两根柱子内部各有一层**不透明包装**（侧栏 `wtg9ga_root`、会话 `an3WzG_root`，两者 background-color 是纸色实心），把纸整块盖住——所以肉眼看到的还是平色。修法：把这两层包装置透明（内容自己的底色不动），纸才透上来。同轮把纹理强度收到 slope 0.032（浅）/0.03（夜），避免"砂纸感"。

- **M13.3 补三（纸感：细齿 + 保亮度，2026-11-03）**：用户先说「纸质感再强一些」，上机后又反馈「不如之前好看，配色被吃掉」——两轮返工。
  - **第一轮错在哪**：只抬强度（slope 0.032→0.075、surfaceScale 3→5、云斑 .065）。同区域取样：整页平均 RGB 从 241.9 掉到 **232.9**（−9 级 ≈ 4%），暖色还在、亮度和干净感没了；再加上颗粒粗（fx .22 ≈ 4px 一团）与重云斑，观感是「旧纸/污渍」，不是「纸更厚」。**强度不是问题，频率和均值才是。**
  - **定稿参数**：频率 fx .22→**.38**（齿变细）、强度只到 **0.06**、云斑 **0.018**；斜光换暖白 `#FFF6E6`（齿的暗部带暖，不把奶油底往灰里拉）；截距取 **0.95 / 0.985**，把两层贴图的均值拉回 1.0 —— multiply 只做局部起伏、不整体压暗。
  - **判据**：1:1 三版对照（旧 / 粗 / 细）× 真实字色与真实纸色；改完复测 **243.5 / 242.9 / 241.1**，与旧版 242.3 / 241.9 / 240.6 齐平（纹理不算在平均亮度里了）。
  - 仍只调 `build-paper.mjs` 的生成参数，`patches.css` 一行未改。**暗色同轮同频**（screen 混合取 0.05 / 0.02 + 暖光），用真实暗色 token 拼版取样：旧 22.4 / 21.9 / 20.7 → 新 22.8 / 22.2 / 21.0，亮度基本不动，只是齿变细——暗纸不会被 screen 抬成灰。暗色随后由用户切到暗色实测确认「深色看着没有问题」，该维度闭环。

## 已知限制与后续候选（不阻塞交付）

> 以下条目是**限制与候选记录，不属于本期交付范围**：已知边界、尚未覆盖的方向、可选项，逐条带理由。

- 插件共存验收矩阵建制（把桌面已装插件逐个进隔离实例截图核对，本轮 po06 已先行）。
- Deepy 二期：交互层（点击/连点/拖拽/游走）、空闲彩蛋与 60s 睡眠、其余 12 态。
- 图标层二期：抽取器升级（表达式几何落地，收编 13 条结构性未映射 + 1 条覆盖缺口）；scopeSkinCss 支持嵌套 at-rule 后补 reduced-motion 降级。
- 官方市场上架（M5 分发行）。
- 视觉缺口：font 排版层 181 token；模型档位 pill（需 dsh-ui 补 `data-dsh-part`）。
- M5 残留风险：互斥 API 路径实测、持久化迁官方 settings 服务、验收脚本从 `.agents/tmp` 迁 `.agents/shots` 并纳管。


