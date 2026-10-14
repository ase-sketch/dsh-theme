# Agent Note: M7「深空编辑室」重设计——脱钩 dsh-ui 规范、新设计源、Lucide 图标层、Deepy 双位

Status: implemented — 隔离实例验收全绿（编排方亲验），桌面端已重装待用户重启真机确认。

## Problem

原皮肤的视觉唯一来源是 dsh-ui 规范的 preview :root，上限被规范锁死。用户要求脱钩：不再参考 E:\dsh-ui\preview\index.html，对标 Awwwards 级先锋设计；图标统一 Lucide（shell 自带的是 137 处手绘内联 SVG，非 Lucide）；全程禁 emoji；明暗双套；Deepy 保留并融入。

## Decision

- 新视觉「深空编辑室」：暗色近黑四层明度阶梯（#07080D→#0B0D14→#0F121B→#141824）+ 单点高饱和朱砂 #FF6A3D（辉光只给聚焦输入卡/选中会话/主按钮）；浅色为暖纸 #F5F1E8 + 墨字 + 印刷硬投影（非反相）；三层字体（Palatino 衬线 display / Segoe UI 正文 / Cascadia Mono micro-label，全 Windows 自带）；物理回弹动效。
- 新设计源 = design/tokens.css（153 token 明暗双套，由 design/preview.html 的 #token-manifest 机械生成，build-skin.mjs --regen-tokens 显式重生成；默认构建只读它）。build-skin.mjs 换源，两条守卫保留且补强（SHELL_RESERVED 7→42 条，noise-uri 合法性断言）。
- mapping.json 的 91 个 --dsw-* 键冻结零改动（设计稿 18 个色槽恰好 1:1 覆盖全部 91 alias）。
- patches.css 重写为四段：非 alias 重绑定 / 组件层 / 排版层 / 氛围层。排版层走「变量重绑杠杆」：--dsw-font-family 与 --ds-font-family-code 两个变量穿透官方 97 处 font: 简写；display 衬线走 3 条定向选择器。氛围层（噪点+网格+光晕）落在侧栏与会话区根——body 被不透明表面盖住（静态层叠证据 + T6 像素实测）。
- Lucide 图标层（插件 client 半）：scripts/build-icon-map.mjs 把 shell 图标指纹（viewBox+几何签名，刻意排除宽高/class）映射到 lucide.json（2141 图标，lucide-static@1.55.0 本地化）。双索引（完整指纹 + 几何回退，歧义宁可不换）；策展表 scripts/icon-map-overrides.json（rename/byId/skip 三通道）。运行时 MutationObserver 60ms 去抖 + 非破坏式注入（原节点留 DOM，OFF 还原）；指纹核心段只有一份实现（构建脚本从 client.js 标记段抽取执行）。覆盖 111/139；未映射 28 条全部带理由（结构性 13 + 硬编码品牌色 11 + 策展跳过 4）。
- Deepy 双位 + 单鲸规则：主位输入卡左缘「月台」底座（墨色圆盘 + 朱砂 rim，随状态呼吸）；空会话 hero 迎宾位（大号 idle）。纯函数 deepyMainVisible + 每帧 DOM 探测：hero 在场主位不渲染，会话激活 hero 消失主位自愈回来。
- 权限三态图标拆分：ReadOnlyArtwork→shield-check / WorkspaceWriteArtwork→shield-half / FullAccessArtwork→shield-alert（byId 精确通道）。

## Alternatives considered

- manifest 占位值原样落 tokens.css：被否——--dsh-noise-uri 在 manifest 是占位串，取 preview CSS 声明真值 + 白名单 + 静态断言。
- 排版层与 97 处 font: 简写硬碰（逐条抬特异性）：被否——收益为负，变量重绑一个点穿透全部。
- 氛围层写 body：被否——静态层叠证据（body/sidebarCol/会话区根均不透明）+ T6 像素实证，写了也不可见。
- 图标替换用 innerHTML 破坏式重写：被否——React 重渲染 insertBefore 会抛 NotFoundError；选非破坏式注入（原节点留 DOM + data-* 隐藏 + append 我们的 <g>）。
- 图标数据运行时 CDN 拉取：被否——本地应用必须离线可用，lucide.json 随包分发（930KB）。
- 「hero 与主位两只鲸并存」：被用户授权裁决后否掉——一屏一只鲸。

## Consequences

- 收益：视觉完全自主（不再受 dsh-ui 规范上限约束）；图标体系统一 Lucide；排版层首次接管（M3 裁定的 181 font token 缺口以变量重绑方式部分补上）；Deepy 有了与设计语言融合的家。
- 代价/风险：图标层依赖指纹匹配，shell 升级换图标几何即回落原图标（不算故障但要补映射）；抽取器有 1 条覆盖缺口（设置页 tab strip 图标）；13 条结构性不可映射需抽取器升级；呼吸辉光没有 prefers-reduced-motion 降级（scopeSkinCss 拒绝 @media，本期无法加）；design/preview.html 与 tokens.css 存在一处改名 drift（--dsh-scrollbar-thumb→-w，守卫可拦截误引用）。
- dsh-ui 规范与本项目正式脱钩：preview/index.html 不再是来源；设计稿 design/preview.html 是定调历史件，tokens.css 是活的来源。

## Confirmation

- 快层：node scripts/build-skin.mjs（守卫×2+noise 断言）、node scripts/build-icons.mjs、node scripts/build-icon-map.mjs（守卫×5+棘轮 C9 只许收紧）。
- 测试：state-machine 130 + render-layer 55（含单鲸 12 条）+ icon-layer 77（含 C13/C14）全绿；负控制 NC1-NC4（T4）+ 3 条（T5）全部红过并还原。
- T6 编排方亲验（隔离 web profile :19488，Playwright）：浅色 #F5F1E8 / 深色 #0B0D14 / 朱砂 #D23E0C·#FF6A3D 命中；图标 applied=53；Deepy 双位 + 单鲸双向切换；真实设置面板 OFF/ON 往返还原；console 零错。脚本 .agents/shots/_m7_t6_*.py 可复跑。
- 待用户真机确认：桌面端已重装（file: 复制语义），重启后生效；动效手感（呼吸辉光/回弹/交错入场）只能人眼验收。

---

## M8 增补（2026-10-12，同决策的质感层续篇）

- 用户追加：编辑版面化/流态/微交互/滚动条/熄灯仪式/hero 封面/质感层 + 输入卡固定尺寸。⑤crossfade 被「熄灯仪式」圆形双向擦除取代（同目标上位形态，避免双重动画）。
- 关键裁决：preview.html「冻结」措辞过强，修为「token 增补走 manifest+变量块三处同步，方向重构才需重新定调」；--dsh-composer-height 是 shell 的**测量输出**（ResizeObserver 内联写入）不是阀门，输入卡固定尺寸走 CSS 锁定（主 36px / hero 52px 双档，均为官方单行 min-height，按定义成立）。
- 新缺陷与修法：hero 封面叠印（浮层与 shell 标题同线盒 → 改纵向 flex 块级容器，封面规则零 position:absolute，M8-16 断言守门）；classList typeof 误判（DOM 级测试抓获，纯静态审查看不出来）。
- 确认：T8 隔离实例编排方亲验（.agents/shots/_m8_*.py）；测试 130+76+77+100；桌面已重装待重启。

---

## M8.5 增补（2026-10-12，编辑台 + 插件兼容红线）

- 起因：用户真机抓到三连——输入卡仍长（工具条折行）、模型名消失（observeControlRow 的 data-model-compact + flex-shrink 双层机制）、po06 面板断位（我们的容器 translateY 建了包含块）。
- 决策：① 输入卡「编辑台」——整卡逐行锁定，编辑区恒定两行（主 52/hero 68px，按官方行高算式成立），高度只对附件状态敏感；② 作品层状态走 client 钩子契约（data-dsh-editor），CSS 不用 :empty/:has 猜 contenteditable；③ **包含块红线**：容器禁 transform 族（写进 AGENTS.md），聚焦上浮/整卡回弹因此回退，反馈移到叶子与瞬时态；④ 插件共存入验收（po06 进隔离实例实测，面板完整在视口内）。
- 确认：T9 隔离实例 15/15 + 月台联动专项；测试 130+76+77+135 全绿；桌面已重装。

---

## M9 增补（2026-10-12，不对称编辑台）

- 用户裁定「放开限制、不对称也是美」：卡片 grid 重构 + display:contents 拆行、右簇竖排、发送键出界、Deepy 趴桌沿（absolute 脱流，卡片自身是定位上下文，slot 容器 display:contents 不生成盒子）。
- 新机制：slot 注入物内联 flex-wrap 只能靠窄域 !important（兼容例外登记 #1）；position:relative 保留占位盒会撑高行（趴桌沿初版缺陷，absolute 修复）；observeControlRow 在 display:contents 下量到 0 宽 → compact 恒常，M8.5 的 display 压制式修复天然免疫。
- 确认：T10 隔离实例（po06 共存）编排方亲验；桌面已重装。

---

## 输入框 V3 · 书写纸（预览阶段记录，部署状态由下节取代）

- Problem：用户真机反馈输入框仍需重做；正文被横线分割，橙色全框过度强调，右侧额度/模型/发送散落，鲸鱼底座抢视觉。
- Decision（预览阶段）：当时用户仅批准预览；该限制已由正式接入批准取代。[可交互预览](<E:/dsh-theme/design/composer-v3.html>)独立复用既有配色、Lucide 数据和 Deepy 素材；无正文稿线，完整三行书写面；模型与发送回归单条工具带；运行摘要常驻并保留会话统计、Token、上下文各自弹层；额度保留；优化入口显示完整状态摘要，展开层保留用户截图可见设置项；鲸鱼去底座、留在右上缘，显示尺寸由 64px 增至 96px。现用 M9 不受影响。
- Alternatives：继续微调现用出界量不能解决层级与空间组织，未采用；直接安装正式主题会把设计试验与插件兼容风险混在一起，未采用。首版把统计合并为单个“运行详情”入口并简化优化设置，用户明确认为信息删减过度，已撤销；用户认可现有插件弹层，不将视觉重整变成插件功能重写。
- Consequences：固定附件薄行保证主要状态不撑高卡片，代价是空态保留少量附件空间；拥挤时辅助工具横滚，模型和发送保持可见。所有发送、权限和附件行为均为本地模拟，真实插件的接口与兼容尚未冻结或验证。
- Confirmation：[预览回归脚本](<E:/dsh-theme/design/composer-v3.test.py>)检查三行正文、主要状态高度、窄宽度工具带、菜单、发送/停止、中文输入法和新草稿保护；高度负控制只改渲染实例，恢复后复验。视觉通过与正式接入须分别确认；本轮独立顾问关闭，未取得外部视觉复核。修订版增加分项弹层信息覆盖、短窗口内部滚动、优化选项状态关联与放大后的精灵帧几何检查。

## V3 正式接入（2026-10-13）

- Problem：预览已获用户批准，正式组件仍有 M9 的堆叠与出界视觉，预览不能证明插件兼容。
- Decision：用户明确批准正式接入及本轮受控超限，只覆盖样式、Deepy 与验收，不新增功能。保留真实优化设置和会话、Token、上下文分项弹层；用单行工具带、框内发送键和右上无底座的主位鲸鱼替代 M9 的组织。主位使用 96px 同源帧几何，hero 仍为独立倍率 102px，素材与 manifest 保留 64px。默认右偏移 16px、上偏移 84px，可沿用既有自定义变量覆盖。
- Alternatives considered：复制预览的优化/统计模拟组件会重写功能与状态归属，拒绝；只取消模型省略号仍被原生 compact 隐去，改为行级变量反制及右簇可缩；固定 76px 在字号 15–22 时裁第三行，改为消费处 3lh + 4px（hero 另加 16px），默认仍 76/92px；正文的全局 focus-visible 环会被滚动框裁成橙色长线，只对编辑叶子取消 outline，保留卡片短标记和控件焦点环。
- Consequences：真实空态不预留附件薄行，附件依原组件条件出现；辅助工具拥挤时横滚，极窄时模型可按原生省略但不隐去文字、发送不出框。实测揭示终态仅闪 happy/error 而不结束工作基态的隐含假设：turn/end 先归 idle，再保持各瞬时态窗口；persistent 不清瞬时态、turn/start 才清的契约不变，持有窗结束后填写自然投影 idle-look。
- Confirmation：构建守卫与五套单测 599/599；父代理撤回终态 idle 归属时公开后果断言变红，恢复字节一致。隔离真实组件的 36 项 UI 检查通过，覆盖流式/完成/填写抬头、单鲸、96px 帧与避让、长文内滚、宽度和字号、明暗配色、原统计弹层；优化弹层保留原控件。只模拟外部 LLM HTTP，估算 usage 只检查统计渲染，不证明生产模型质量、时延或 tokenizer。终态投影与 CSS 聚焦缺陷有针对性回归；桌面只刷新同版本运行资源，不重启用户服务。
