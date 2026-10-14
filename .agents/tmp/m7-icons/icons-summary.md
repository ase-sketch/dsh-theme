# DSH 客户端内联 SVG 图标清单

> 本文件由 extract.mjs 从 DSH 已安装客户端编译产物**机械生成**，禁止手改。
> 重新生成：设置 DSH_SCAN_ROOT / DSH_OUT_DIR 后执行 node extract.mjs。

## 怎么用这份清单

- inventory.json 每条是一次**唯一图标**（按 viewBox + 形状几何 + 描边/填充属性去重）；
  occurrenceSites[] 给出它在编译产物中的全部实例化位置（package / file / line / 外层组件名）。
- guessName 是**规则推断**的 kebab-case 语义名，nameSource 标明依据：
  region-filename / component-name / jsdoc / classname / geometry / unknown。
- 做图标替换时先把 guessName 当 lucide 检索键（字段 lucideStyleName：**仅命名风格对齐 lucide，未与 lucide 包核对**）；
  nameCandidates[] 是备选；unknown 条目需人工读 contextHint 再定。
- 换之前必须核对 strokeInfo：多数图标把 stroke 写在每个 shape 上而不是根 svg；DSH 图标多为 stroke-based 自绘 path，
  与 lucide 的 24x24 网格未必一一对应，width/height 常见 14/16/20 而非 24。

## 统计

| 指标 | 值 |
| --- | --- |
| 扫描包数 | 53 |
| 扫描文件数 | 110 |
| svg 元素调用总数 totalSvgCalls | 150 |
| 唯一图标数（几何+呈现属性去重） | 139 |
| 仅按几何去重的唯一图形数 | 139 |
| 可识别（guessName != unknown） | 139 / 139（100%）|
| data:image/svg+xml 资产（另记，非元素调用） | 10 |
| 计数口径 | svg element call = any element factory called as ("svg", {object}) with factory in {jsx, jsxs, jsx<n>, createElement}; a bare "svg" string literal (data: URI, SVG_NS constant, MIME type) and createElementNS(SVG_NS, "svg") are NOT element calls |

### 各包 svg 调用数（求和 = 150，应等于 totalSvgCalls = 150）

| 包 | 调用数 | 唯一图标 |
| --- | ---: | ---: |
| dsh-client-ui-primitives | 114 | 111 |
| dsh-client-ui-sidebar-documentpreview | 8 | 3 |
| dsh-client-ui-trajectory | 7 | 6 |
| dsh-client-ui-conversation | 5 | 4 |
| dsh-client-ui-sidebar-right | 4 | 4 |
| dsh-client-ui-sidebar-terminal | 2 | 2 |
| dsh-client-ui-shortcuts | 2 | 2 |
| dsh-client-ui-settings-account | 2 | 2 |
| dsh-client-ui-attachment | 2 | 2 |
| dsh-client-ui-subagent | 1 | 1 |
| dsh-client-ui-sidebar-browser | 1 | 1 |
| dsh-client-ui-schedule | 1 | 1 |
| dsh-client-ui-chat | 1 | 1 |

## 高频图标（实例化次数 ≥ 3，共 1 个）

| id | guessName | 类别 | 次数 | viewBox | stroke | 主来源包 |
| --- | --- | --- | ---: | --- | --- | --- |
| ico-d5f69065 | user | identity | 6 | - | - | dsh-client-ui-sidebar-documentpreview |

## 导航（22）

| id | guessName | 依据 | 次数 | viewBox | 形状数 | package |
| --- | --- | --- | ---: | --- | ---: | --- |
| ico-0139d5e1 | sidebar | region-filename | 1 | 0 0 16 16 | 1 | dsh-client-ui-sidebar-right |
| ico-0e6313e5 | list | jsdoc | 1 | 0 0 16 16 | 2 | dsh-client-ui-trajectory |
| ico-148027f6 | list-checks | component-name | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-26b40205 | panel-left | jsdoc | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-35dcf823 | arrow-right | jsdoc | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-4672af70 | list | component-name | 1 | 0 0 16 16 | 5 | dsh-client-ui-primitives |
| ico-54712b11 | compass | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-sidebar-right |
| ico-649635d4 | external-link | jsdoc | 1 | -2 -2 28 28 | 1 | dsh-client-ui-primitives |
| ico-6817c64b | fullscreen | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-6d81a8ed | arrow-right | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-7a892bc5 | chevron-up | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-96e0b189 | link | region-filename | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-9a970a29 | menu | classname | 1 | 0 0 16 16 | 1 | dsh-client-ui-sidebar-documentpreview |
| ico-a80b3cb1 | link | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-af27787e | link | region-filename | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-b9e2f978 | chevron-left | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-c2332cbf | chevron-right | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-d19348ee | sidebar | region-filename | 1 | 0 0 16 16 | 2 | dsh-client-ui-sidebar-right |
| ico-db44d0d8 | link | region-filename | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-e4c2f79a | list | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-e9ac75ba | chevron-down | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-fe60e9b1 | panel-left | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |

## 操作（29）

| id | guessName | 依据 | 次数 | viewBox | 形状数 | package |
| --- | --- | --- | ---: | --- | ---: | --- |
| ico-3c298809 | thumbs-down | component-name | 2 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-6bdc376c | pin | component-name | 2 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-ce334864 | code | component-name | 2 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-e7923ec7 | thumbs-up | component-name | 2 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-04c10482 | plus | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-06a715cd | x | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-0bec2993 | code | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-1336404b | share | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-2548e208 | code | jsdoc | 1 | 0 0 16 16 | 6 | dsh-client-ui-primitives |
| ico-2907e829 | brain | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-2f9151b3 | target | component-name | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-534b0f6d | refresh | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-5900bc90 | trash | component-name | 1 | 0 0 16 16 | 5 | dsh-client-ui-primitives |
| ico-5cac5e51 | edit | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-6c392ba9 | thumbs-up | jsdoc | 1 | 0 0 1024 1024 | 0 | dsh-client-ui-sidebar-documentpreview |
| ico-73988bb5 | code | component-name | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-7a4ac576 | compare | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-7fed728a | code | region-filename | 1 | 0 0 20 20 | 0 | dsh-client-ui-primitives |
| ico-80eee64d | sparkles | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-8dbf3c15 | search | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-9606f65d | git-branch | component-name | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-9f23d0bd | copy | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-a5222428 | send | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-a57ca938 | plus | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-bcb40a36 | refresh | component-name | 1 | 0 0 14 14 | 2 | dsh-client-ui-shortcuts |
| ico-cca43da7 | x | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-d66fb044 | terminal | region-filename | 1 | 0 0 28 28 | 2 | dsh-client-ui-sidebar-terminal |
| ico-e0ef2b83 | settings | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-f5767994 | x | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |

## 文件与附件（16）

| id | guessName | 依据 | 次数 | viewBox | 形状数 | package |
| --- | --- | --- | ---: | --- | ---: | --- |
| ico-04f4b6e3 | database | component-name | 1 | 0 0 16 16 | 5 | dsh-client-ui-primitives |
| ico-06c7f201 | folder-open | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-099a0188 | file | component-name | 1 | 0 0 16 16 | 5 | dsh-client-ui-primitives |
| ico-1fae88e1 | file | region-filename | 1 | 0 0 28 28 | 3 | dsh-client-ui-primitives |
| ico-21cb1575 | database | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-46eb6f3b | folder-open | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-4817bf91 | folder | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-55105da4 | file | region-filename | 1 | 0 0 28 28 | 4 | dsh-client-ui-primitives |
| ico-8971fab4 | download | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-ac617bf8 | folder | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-b2e11f17 | upload | component-name | 1 | 0 0 115 84 | 13 | dsh-client-ui-attachment |
| ico-b753f4d2 | upload | component-name | 1 | 0 0 115 84 | 9 | dsh-client-ui-attachment |
| ico-d594acdd | paperclip | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-e74d1f18 | package | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-sidebar-right |
| ico-f099c0f5 | clipboard | jsdoc | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-fa34df50 | file | jsdoc | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |

## 媒体（7）

| id | guessName | 依据 | 次数 | viewBox | 形状数 | package |
| --- | --- | --- | ---: | --- | ---: | --- |
| ico-0b04701c | sun | component-name | 1 | 0 0 16 16 | 9 | dsh-client-ui-primitives |
| ico-54250888 | microphone | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-729d0d91 | play | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-de830a45 | moon | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-e23063d3 | stop | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-f23cc087 | pause | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-f2bf9e65 | moon | jsdoc | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |

## 用户与身份（14）

| id | guessName | 依据 | 次数 | viewBox | 形状数 | package |
| --- | --- | --- | ---: | --- | ---: | --- |
| ico-d5f69065 | user | component-name | 6 | - | 0 | dsh-client-ui-sidebar-documentpreview |
| ico-051dff15 | shield | region-filename | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-06cc3426 | agent | component-name | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-15b4e10b | bot | region-filename | 1 | 0 0 20 20 | 2 | dsh-client-ui-subagent |
| ico-2fdf38b9 | brand | region-filename | 1 | includeMark ? "0 0 182 24" : "26 0 156 24" | 25 | dsh-client-ui-primitives |
| ico-5802076f | shield | region-filename | 1 | 0 0 16 16 | 5 | dsh-client-ui-primitives |
| ico-83aea0c3 | at-sign | jsdoc | 1 | 0 0 ${size} ${size} | 0 | dsh-client-ui-shortcuts |
| ico-9133d593 | log-out | region-filename | 1 | 0 0 14 14 | 2 | dsh-client-ui-settings-account |
| ico-96be9324 | fish | region-filename | 1 | 0 0 ${FISH_LOGO_VIEWBOX.width} ${FISH_LOGO_VIEWBOX.height} | 1 | dsh-client-ui-primitives |
| ico-9c70a78d | user | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-acab8087 | fish | jsdoc | 1 | 0 0 ${_deepseek_ai_dsh_client_ui_primitives.FISH_LOGO_VIEWBOX.width} ${_deepseek_ai_dsh_client_ui_primitives.FISH_LOGO_VIEWBOX.height} | 2 | dsh-client-ui-conversation |
| ico-bbeb7456 | account | region-filename | 1 | 0 0 14 14 | 2 | dsh-client-ui-settings-account |
| ico-cc145826 | shield | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-dd057232 | shield | region-filename | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |

## 状态（15）

| id | guessName | 依据 | 次数 | viewBox | 形状数 | package |
| --- | --- | --- | ---: | --- | ---: | --- |
| ico-11b530aa | check | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-168ff08b | check-circle | jsdoc | 1 | 0 0 20 20 | 2 | dsh-client-ui-primitives |
| ico-251cd8b0 | help | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-2920d7bb | info | component-name | 1 | 0 0 14 14 | 3 | dsh-client-ui-primitives |
| ico-3bfa3f24 | clock | jsdoc | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-40f3d17d | warning | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-460c33f1 | check | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-5d0a245d | check-circle | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-79d15eda | clock | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-7caf0469 | check | jsdoc | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-e13c929f | check-circle | component-name | 1 | 0 0 36 36 | 2 | dsh-client-ui-primitives |
| ico-eb1f4cc4 | loader | region-filename | 1 | 0 0 16 16 | 1 | dsh-client-ui-chat |
| ico-ed467b87 | loader | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-f931255c | warning | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-fa2f2c66 | clock | component-name | 1 | 0 0 17 17 | 6 | dsh-client-ui-primitives |

## 其它（已命名，类别待定）（36）

| id | guessName | 依据 | 次数 | viewBox | 形状数 | package |
| --- | --- | --- | ---: | --- | ---: | --- |
| ico-2db10614 | table | region-filename | 2 | 0 0 24 24 | 1 | dsh-client-ui-trajectory |
| ico-d5c5a6e4 | cursor | region-filename | 2 | 0 0 16 16 | 1 | dsh-client-ui-conversation |
| ico-0195eb53 | type | component-name | 1 | 0 0 36 36 | 2 | dsh-client-ui-primitives |
| ico-05d7d30f | chevrons-up-down | jsdoc | 1 | 0 0 16 16 | 7 | dsh-client-ui-primitives |
| ico-09167cda | plugin | region-filename | 1 | 0 0 36 36 | 8 | dsh-client-ui-primitives |
| ico-0d0698dc | users | component-name | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-0d5d5399 | plugin | region-filename | 1 | 0 0 36 36 | 2 | dsh-client-ui-primitives |
| ico-284f9228 | layers | component-name | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-315f16bb | circle-dot | region-filename | 1 | 0 0 24 24 | 3 | dsh-client-ui-primitives |
| ico-3565d61d | table | region-filename | 1 | 0 0 16 16 | 4 | dsh-client-ui-trajectory |
| ico-40d1cf72 | table | region-filename | 1 | 0 0 16 16 | 2 | dsh-client-ui-trajectory |
| ico-45371de8 | browser | region-filename | 1 | 0 0 16 16 | 3 | dsh-client-ui-sidebar-browser |
| ico-4f29f3c7 | calendar | region-filename | 1 | 0 0 14 14 | 3 | dsh-client-ui-schedule |
| ico-51891812 | network | component-name | 1 | 0 0 9 11 | 1 | dsh-client-ui-primitives |
| ico-539c086e | gauge | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-58a43f8a | wrap-text | component-name | 1 | 0 0 16 16 | 5 | dsh-client-ui-primitives |
| ico-58d4dabd | cursor | region-filename | 1 | 0 0 16 16 | 1 | dsh-client-ui-conversation |
| ico-69b792ea | globe | component-name | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-70d665b0 | table | region-filename | 1 | 0 0 16 16 | 3 | dsh-client-ui-trajectory |
| ico-74f7d7bf | users | jsdoc | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-7c48cc5e | plugin | region-filename | 1 | 0 0 36 36 | 5 | dsh-client-ui-primitives |
| ico-7cd99673 | plugin | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-7dea1ca2 | layers | region-filename | 1 | 0 0 14 14 | 2 | dsh-client-ui-conversation |
| ico-94eb9fb1 | chat | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-af052a15 | wrap-text | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-b763cee2 | browser | component-name | 1 | 0 0 36 36 | 4 | dsh-client-ui-primitives |
| ico-ba56c139 | chevrons-up-down | component-name | 1 | 0 0 16 16 | 2 | dsh-client-ui-primitives |
| ico-c3f7a8c9 | plugin | region-filename | 1 | 0 0 36 36 | 9 | dsh-client-ui-primitives |
| ico-c9065bed | network | region-filename | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-ccbb7d21 | plugin | component-name | 1 | 0 0 16 16 | 4 | dsh-client-ui-primitives |
| ico-da1ba33d | triangle | component-name | 1 | 0 0 16 16 | 1 | dsh-client-ui-primitives |
| ico-daebd291 | skill | component-name | 1 | 0 0 17 17 | 4 | dsh-client-ui-primitives |
| ico-df4d3071 | table | region-filename | 1 | 0 0 16 16 | 1 | dsh-client-ui-trajectory |
| ico-e1b0f66c | message | jsdoc | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-ed98b536 | wrap-text | component-name | 1 | 0 0 16 16 | 3 | dsh-client-ui-primitives |
| ico-ef84ee62 | plugin | region-filename | 1 | 0 0 36 36 | 6 | dsh-client-ui-primitives |

## unknown 明细（0 个，需人工定名）

| id | 次数 | viewBox | package:file:line | 外层组件 | 上下文摘录（≤200 字符）|
| --- | ---: | --- | --- | --- | --- |

## 已知局限

- 只覆盖**内联 SVG 元素调用**与 data-URI 资产；外部 .svg 文件、sprite sheet、CSS background-image 引用的图标不在本次范围。
- 编译产物随版本变化；本清单对应 dsh-client-ui-primitives@0.2.0-rc.2。
- flags.hasSpread / flags.hasConditional 为 true 的条目形状列表可能不完整（产物里有 {...props} 展开与三元表达式）。
- guessName 是**推断**不是事实；nameSource 为 geometry 或 unknown 的条目在替换前必须人工复核。
- shapes[] 为扁平化结果：嵌套在 g/defs 内的形状也会平铺列出，不保留层级。