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

---

## M11 今日工作台（2026-10-31）

- Problem：用户要求重绘新会话，并明确不必保留原迎宾封面。时间、天气、月历可以进入主界面，但不能做成彼此孤立的桌面卡片；余额已在侧栏和输入卡出现，不再重复。
- Decision：新会话改为「今日工作台」——左栏依次是分钟时钟、任务标题、工作区与输入卡，右栏是天气和 42 格月历；天气是唯一大视觉，Deepy 撤下中央迎宾位、只留输入卡主位。原生 hero 槽不变，两栏网格落在 hero 与输入卡共同的 `composerStack` 外层；窄窗口依次下移天气/月历并折叠月历。
- 天气契约：城市默认沿用用户参考图的东莞，host 通过 Open-Meteo 获取城市级天气，8s 超时、10min 缓存，client 每 30min 刷新且仅在空会话挂载时运行；旧数据可标 stale，无真实数据则显示不可用，禁止 mock 冒充实况。月历仅使用本地日期，不接日程或账户数据。
- Alternatives considered：把三张参考卡原样放进主界面会造成重复层级与余额冗余，未采用；只在 HeroShell 内限制输入卡宽度被实测否决，因为输入卡不是 HeroShell 后代，必须把网格提升到共同外层；继续保留中央 Deepy 会与天气争夺主角，用户批准撤下。
- Consequences：原生工作区、输入卡、模型与插件弹层继续归 shell 所有；新会话增加一个城市级外部天气依赖，离线时其余工作台仍可用。旧 `deepyMainVisible` 单鲸防御保留，避免 legacy hero 与主位并存。
- Confirmation：七套 Node 测试共 641 条断言通过，build-skin 守卫通过；`.agents/shots/_today_verify.py` 在隔离 Web profile 实测 18/18，包括真实 Open-Meteo 响应、手动刷新、月历翻页/返回今天、两栏不重叠、深色计算色、900/720px 折叠与 console 零错。主代理逐张走查浅色、深色和窄窗口截图并修正过宽与输入卡撑高；桌面 profile 尚未重装或重启。

---

## M11.1 双主题场景质感（2026-10-31）

- Problem：用户指出浅色与深色都有贴图感，不能只给深色做雾光。实际画面包含规则网格、封闭天气卡和跟随正文色反相的扁平云朵，单纯调整阴影无法消除。
- Decision：新增 12 个 `--dsh-scene-*` token（总数 175），明暗共享空间结构但使用独立材质：浅色雾白瓷感、深色暗室雾光。新会话以低频光影、微粒和边缘收束取代网格，并关闭消息排版标尺；消息流保留旧网格。天气取消完整描边与悬浮阴影，改成与背景同源的开放环境，云朵使用独立高光/中间色/暗部三档渐变和边缘蒙版，不再跟随正文色。
- Alternatives considered：深色方案简单反相到浅色会产生暖纸黑云，否决；继续增强噪点、玻璃拟态或阴影只会让贴图更明显，否决；首轮不引入外部云层图片，先用本地渐变验证构图和材质。
- Consequences：双主题观感分别成立，布局、天气数据与交互不变；新增场景变量仍由 design/preview.html manifest 机械生成到 tokens.css，patches.css 只引用变量。
- Confirmation：七套 641 条断言与 build-skin 守卫通过；`_today_verify.py` 扩展到 **20/20**，新增无网格/排版标尺与开放天气环境断言。主代理实际走查浅色、深色和 900px 截图，并清除走查发现的残留竖线；桌面 profile 尚未重装或重启。

---

## M11.2 可选天气地点（2026-10-31）

- Problem：天气地点最初按参考图固定为东莞，用户明确要求点击更换地点，不能把参考地当永久配置。
- Decision：城市名改为可点击入口，支持搜索、最多 6 个候选、选择后刷新与刷新页面保留。host 新增地理编码搜索和地点读写路由；地点含城市级名称、行政区、国家与经纬度，原子写入 `$DSH_HOME/dsh-theme/weather-location.json`，首次才默认东莞。天气 URL 按地点生成、时区随地点、缓存按地点隔离，选择时清除旧天气并启用新请求代际。
- Alternatives considered：自由输入后直接采用首个地理编码结果无法处理同名城市，未采用；client 直接访问地理编码服务会把外部依赖散到界面层，未采用；不保存选择会让重启体验倒退，未采用。
- Consequences：天气新增地点搜索依赖，选择持久化且与其他 profile 共用同一偏好文件；搜索或保存失败保留当前天气并显示原因，不伪造地点或天气。全界面聊天流的艺术重构是后续独立范围，不在本轮完成功能内。
- Confirmation：七套 **645** 条断言与 build-skin 守卫通过；`_today_verify.py` **24/24**，实际点击城市、搜索上海、返回 6 个候选、选择后更新天气、刷新页面仍保留上海，最后自动恢复东莞。主代理已走查窄窗口地点选择器。

---

## M12 活字剧场全界面重构（2026-10-31）

- Problem：前期只完成新会话与天气，聊天区仍沿用旧样式，未达到用户提出的 Awwwards / FWA / CSS Design Awards 方向与沉浸式要求。独立验收也明确指出天气功能不能替代全界面重构。
- Decision：以「活字剧场」统一聊天消息、工具状态、侧栏、输入区和背景。活跃会话与新会话共享场景材质；助手正文按真实 `assistant*` 类型做章节阅读，user/steering 为缩进导演批注；工具行使用真实 `data-state` 状态轨；场景大字只在 `applyStream` 的真实生成态出现；侧栏为时间线，输入聚焦只改场景边缘。
- 动效与兼容：滚动观察器随 `data-conversation-scroll` 根重建，避免切会话后观察失效；容器只淡入，位移只给 p/h1–h3/blockquote 文字叶子，不创建插件弹层包含块；reduced-motion 关闭状态轨和文字动效。构建不接受嵌套 at-rule，因此响应式采用流式 clamp，而不是绕过守卫。
- Alternatives considered：只给旧消息卡加阴影或玻璃效果被否决，无法解决阅读层级与贴纸感；只匹配 `turn-process` 被真实 DOM 否决，因为它只是回合摘要，正文实际使用 `assistant-step` 等类型；调用模型制造测试消息被否决，改用两个真实会话快照，避免费用与数据副作用。
- Consequences：聊天区、工具状态与导航首次共享同一艺术方向，天气与今日工作台功能保持不变。真实快照中的变更摘要服务有两次 404 `Change summary unavailable`，作为环境限制单列，主题相关 console 与资源错误仍为零。
- Confirmation：七套 **647** 条断言与 build-skin 守卫通过；`_living_verify.py` **11/11**，覆盖真实消息、用户批注、工具轨、滚动叶子动效、输入聚焦、深色和响应式。主代理实际走查明暗聊天截图，桌面安装副本已刷新，需用户重启。

---

## M13 增补（2026-11-01，压印层 IMPRINT：把 UI 排版成刊物）

**触发**：用户判定 M12 审美不达标，要求按 Awwwards/FWA 每日最佳水准重绘。做法是先出两个方向的真实渲染稿（`.dsh-tmp/redraw/studies/`：imprint 压印 / caliper 卡尺），再由编排方裁定——选 imprint，理由是它有一套**可复现的语法**（10 档字体层级 + 一条发丝线 + 固定间距节奏 + 目录/页码/书脊三母题），而 caliper 的 wow 依赖刻度表盘等装饰密度，去掉装饰骨架就散。

**决定**：
1. **改用两族对打**：中文全走思源宋体（NotoSerifSC-VF，本机已装，用 300/350/400 三档撑层级，不靠颜色深浅），拉丁与数字走 Georgia（0.18–0.24em 拉开字距），等宽只留给代码与工具日志。原方案是 Palatino + Segoe UI + 等宽三层，中文主力其实是微软雅黑。
2. **形归零**：`--dsh-radius-*` 全 0、四个 shadow token 全 `none`。层次只由发丝线与留白表达（"发丝线是唯一分隔手段"）。
3. **母题落点**：侧栏改目录（CSS counter 生成 01–04，不改 DOM）；用户消息改「页边注 + 正文栏」两列（86px 注栏 + 620px 版心，序号用 `counter(dsh-turn)`，标签"你/助手"用 `::before`）；输入卡改横格稿纸（顶部双墨线 + 21px 格距 + 右端 mask 淡出）；新会话页改报头（`今日記事 · THE DAILY SHEET` 小标 + 96px Georgia 时刻 + 72px 衬线主标题 + 右栏页边注）。
4. **覆盖手段**：今日工作台的样式由 client 半在 theme.css 之后注入，同特异性它会赢；M13 的每条覆盖选择器都借构建期加的 `html[data-dsh-theme]` 前缀多一层特异性（+1），因此不需要 `!important` 也不依赖书写顺序。行高这类 M12 也写过的属性，额外带上 `[data-chat-flow-kind]` 一层，保证严格高于旧规则。
5. **朱砂只用四处**（Awwwards 式克制）：当前目录项的方点、日历"今天"的墨块、发送键、引用竖线。

**被否**：
- 卡尺方向（仪器/刻度/荧光信号色）——落地风险：7.5–8.5px 微标在真机发糊、信号色 8 处偏高饱和。
- 在 M12 渐变玻璃上继续微调——用户已判定该语言不行，微调只是延后失败。
- 为报头改 DOM 打期号——本轮先用 CSS 静态刊名，真实期号留 client 半后续接会话元信息。

**后果**：M12 的视觉断言（`_living_verify.py`）不再有效，已由 `_imprint_verify.py`（15 项）取代；M12 规则仍留在 patches.css 里作历史层，M13 段整体压在它上面（未删旧段，便于对照回退）。已知欠账：窄窗口响应式、会话页真实期号/页码。

