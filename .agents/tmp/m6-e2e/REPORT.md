# M6 Deepy 独立端到端验收报告

验收方：**未参与 M6 实现的独立子代理**（无任何实现上下文复用）
日期：2026-10-11 ｜ HEAD：66b9bfa8cead4486fa08b508b7bff1cd32c1d662（全程未变）
环境：隔离 web profile C:\Users\pass\.dsh\profiles\web，端口 19488，DSH 0.2.0-rc.2
桌面 GUI 19387 全程未触碰。

**结论一句话：12/12 PASS，零 FAIL。未发现产品缺陷。**

---

## 0. 与 milestones 验收标准的映射（防漏项）

| milestones L45 条目 | 本报告条目 | 结论 |
|---|---|---|
| ① 快层构建通过（deepy 资产流水线守卫） | §E 补跑 | PASS（守卫 1–4 全绿，产出与入库逐字节一致） |
| ② slot 注入成功 | 第 1 条 | PASS |
| ② 连续帧 md5 不同（在动） | 第 2 条 | PASS |
| ② 帧窗口 = 帧宽 | 第 3 条 | PASS（+ 变异负控制证明有区分力） |
| ② 事件→状态断言 | 第 5 条 | PASS |
| ② 开关 OFF 时 Deepy 一并卸载 | 第 6 条 | PASS |
| ② console 零错 | 第 8 条 | PASS |
| ③ 像素采样证明真实可见 | 第 9 条 | PASS |
| ④ 独立复验方从零重装复跑 | 本报告整体（从零安装） | PASS |
| ⑤ 动画手感（感官类） | **未验** | 属用户真机走查，见 §G |

---

## 1. 逐条 PASS/FAIL（原始断言值）

| # | 条目 | 判定 | 关键原始值 |
|---|---|---|---|
| 1 | slot 注入 | **PASS** | rootExists=true, slotExists=true, rootParentIsSlot=true, rootParentTag=DIV|conversation.input.left, rootDshPart=deepy, rect={656,502,64,64} |
| 2 | 帧在推进 | **PASS** | 875ms 窗口 28 采样，distinctPositionCount=**17**，首 '-64px 0px' → 末 '-64px -128px' |
| 3 | 帧窗口宽=帧宽 | **PASS** | computedWidth=64px computedHeight=64px rectW=64 manifestDisplayPx=64 bgSize='512px 384px' |
| 4 | 素材按需加载 | **PASS** | 首屏 PNG 集合 = **['idle.png']**（1/8 张），statusByFile={deepy.json:200, idle.png:200} |
| 5 | 事件→状态 | **PASS** | 序列见 §2 |
| 6 | OFF 全撤 | **PASS** | rootExists=false, styleElExists=false, htmlAttr=false, themeStyleEl=false；**+2.5s 后 rootExists 仍 false，rAF 回调增量=0** |
| 7 | ON 恢复 | **PASS** | toggle after=true, rootExists=true, distinctPositions=14 |
| 8 | console 零错 | **PASS** | consoleErrorTotal=1（**全部来自负控制故意 abort**），realConsoleErrors=**0**，pageerrorCount=**0** |
| 9 | 像素可见 | **PASS** | nonBgPixelCount=**776**/4096（18.95%），匹配素材饱和色像素=**559**，dominantBg=[255,255,255,255] |
| 10 | 深色模式 | **PASS** | bodyBg=rgb(19,22,29)（与 M5 基线一致），nonBgPixelCount=**790**，dominantBg=[29,34,44,255]，宽高仍 64px |
| 11 | 负控制 | **PASS** | 见 §4 |
| 附 | 构建守卫（milestones ①） | **PASS** | 见 §E |
| 附 | 变异负控制（断言有区分力） | **PASS** | 见 §4C |

---

## 2. 第 5 条：事件→状态 原始证据

观察点 = #dsh-theme-deepy .dsh-theme-deepy-sprite 的 computed background-image（**最终可观察量**：用户看到哪张图）。
采样节奏 500ms / 1000ms 两轮。

**运行 A（verify_m6.py，1000ms 节奏）**
```
t=1.01s thinking -> t=2.02s typing -> t=3.04s thinking -> t=4.05s typing -> t=5.06s happy
```
**运行 B（supplement，500ms 节奏）**
```
t=0.51s thinking -> t=1.53s typing -> t=2.56s thinking -> t=3.07s typing -> t=4.10s happy
```
distinctStates = [happy, thinking, typing]

**口径假设（必须显式声明，不当作既定事实）**：milestones L46 把「并发档位口径」列为待复核（uiSession.running 文字写「会话」、注释写「跑工具」）。本验收**只断言「状态随回合推进发生变化且序列可复现」**，**不**断言具体档位映射。若按实现代码的契约（deepyToolState：0→thinking / 1→typing / 2→music / ≥3→building），实测的 thinking↔typing 交替与「回合内单个 bash 工具调用进出」一致——但这是**事后解释，不作为判定依据**。

**按需加载与状态序列的交叉验证（强证据）**：本次回合实际拉取的 PNG 只有
```
thinking.png @0.08s -> typing.png @1.49s -> happy.png @3.81s   （全部 200）
```
**请求集合 === 到达过的状态集合**，且**没有**拉取 music/building/error/notification——证明「按需加载」不是靠首屏一次性预取伪装的。

---

## 3. 第 6 条：rAF 泄漏专项（父代理补充要求 ①）

在页面内 instrument window.requestAnimationFrame 计数（不改仓库文件）：

| 量 | 值 |
|---|---|
| OFF 时刻计数 | 856 |
| OFF 后 2.5s 计数 | **856** |
| **窗口内回调增量** | **0** |
| 2.5s 后 rootExists / spriteExists | false / false |
| OFF 前后 deepy 素材请求数 | 2 → **2**（无新增） |

→ 元素消失**且**动画真的停了，不是「看着撤了其实没撤」。

---

## 4. 第 11 条：负控制

### 4A 主负控制 —— Playwright page.route abort 素材路由
手段：pg.route('**/api/dsh-theme/deepy/**', route.abort()) -> reload。**不改 plugins/ 任何文件**。

| 量 | 值 | 判定 |
|---|---|---|
| 被 abort 的请求数 | 1 | 故障确实注入 |
| 精灵是否绘制 | **false**（bgImage=none，rect w/h = 0） | 降级生效 |
| 容器是否还在 DOM | true（rootExists=true） | 只降级绘制，不炸结构 |
| console.warn 次数 | **恰好 1**（[dsh-theme] deepy sprite unavailable: idle Failed to fetch） | 符合「只 warn 一次」 |
| console error（真实） | **0** | 不报错 |
| console error（资源加载） | 1（Failed to load resource: net::ERR_FAILED） | **单列，不计入第 8 条** |

**红在哪**：本负控制**没有让产品变红**——它验证的是降级路径正确。它红的是我自己的**判定口径**：第一版脚本把 Failed to load resource 算进 console error，会与「素材失败只允许一次 warn」直接冲突造成假红。修法 = 把 error 分成三类（pageerror / console(type=error) / 资源加载非 200），负控制期间资源加载类单列。**这一条修正记录在此，供父代理复核口径是否可接受。**

### 4B 恢复复绿
pg.unroute -> reload：
- state=idle，widthPx=64px，rect={656,799,64,64}
- distinctPositions=**13**（帧在动）
- 素材请求 = [deepy.json, idle.png]（恢复为正常首屏集合）

### 4C 变异负控制 —— 证明我的断言真的会红
在页面注入 CSS 把精灵拉到 96px（**不改仓库文件**）：
- 变异后 computedWidth=96px（断言期望 64px）
- assertionWouldGoRed = **true**
- reload 后恢复 64px

→ 「帧窗口宽=displayPx」断言**有区分力**，不是恒真。

---

## 5. 第 9 条：可见性方法说明（含一处方法修正）

**elementFromPoint 不可用**：精灵 CSS 为 pointer-events:none（装饰性元素，设计如此），document.elementsFromPoint 命中的是下层 shell 元素（DIV.uV2eYG_tools → _row → _card → _hero）。**这不是缺陷**，是 M6 有意让精灵不吃鼠标事件。

改用**截图像素证明**（M5 口径）：
- 精灵 rect 裁剪截图 → 非背景像素 **776**/4096（18.95%）
- 其中与**素材饱和色**（idle.png 中 max>100 且 max−min>60 的像素，301 色）匹配的像素 = **559**
- 精灵 opacity=1、visibility=visible、宽高 64px

→ 灰色/白色 shell 层**不可能**匹配素材的饱和色，故 559 个同源像素证明：**精灵真的画在屏幕上了，没有被 shell 的不透明白层盖住**。

---

## E. 快层构建守卫（milestones ① 补跑）

在**沙箱副本**里跑 build-deepy.mjs（源目录 E:/dsh-ui 只读，产出落 .agents/tmp/m6-e2e/build-check/，**未触碰 plugins/**）：

```
state         src         srcCells  frames  out         bytes    md5
idle          2080x1560   48        48      512x384     18688    ff78f5f580eba1a7a55b01976b629305
thinking      2080x1560   48        48      512x384     48069    90fcb32c09bef8b446fa63b21c1fcd24
typing        2080x1560   48        48      512x384     47750    d485e4820c6a462deea0fb16b338c668
happy         2080x1820   56        52      512x448     64306    4a4ce7c603b2144cccda2f22646272ca
error         2080x1560   48        48      512x384     76944    020907e815ef9b10d3c0959a6c504c43
notification  2080x1040   32        32      512x256     39059    c753cdf2b0f84d87a9c0eee3d7eea19a
music         2080x1040   32        32      512x256     52729   22c60c280449736e73b9c7b54c80a61d
building      2080x1560   48        48      512x384     53793    6de21ab9d9a934d14aab5c39b099c541
deepy.json    -           -         -       -           776      44ea34d87ebca05e749bbe95aaee560d
build-deepy: OK — 8 态 + 1 manifest 全部产出，守卫 1-4 全绿
```
**9/9 产出与入库文件逐字节 IDENTICAL** → manifest 与素材一致，流水线可复现。

补充静态检查（只读）：
- 单元测试 plugins/dsh-theme/test/state-machine.test.mjs：**passed 109 / failed 0 / RESULT: PASS**
- 顶层零声明扫描（client.js）：**topLevelViolations: []**
- host 路由自检 selftest.mjs：**PASS 99 / FAIL 0**（含路径穿越、405、卸载后 0 残留、真实 state.json 零改动）

---

## F. 复跑命令

```powershell
# 起实例（后台）
& "$env:APPDATA\npm\dsh.cmd" --profile web --port 19488 --no-open
# 主验收
$env:PYTHONUTF8='1'; python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6.py '<URL from instance log>'
# 补充验收（rAF 泄漏 / 按需加载 / 变异负控制）
$env:PYTHONUTF8='1'; python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_supplement.py '<URL>'
# 停实例（必须按 PID，job_kill 杀不掉子进程树）
Get-NetTCPConnection -LocalPort 19488 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
```

脚本：[verify_m6.py](.agents/tmp/m6-e2e/verify_m6.py)（12 条断言）、[verify_m6_supplement.py](.agents/tmp/m6-e2e/verify_m6_supplement.py)
原始 JSON：[verify-result.json](.agents/tmp/m6-e2e/verify-result.json)、[supplement-result.json](.agents/tmp/m6-e2e/supplement-result.json)

---

## G. 我没验到的 / 结论不确定的（不粉饰）

1. **动画手感（里程碑⑤）未验** —— 感官类，属用户真机走查。我只能证明帧在推进、尺寸正确、像素可见；**帧率是否流畅、动作是否自然，我没有资格下结论**。
2. **状态机的错误分支活体未触发** —— turn/end 的 error/max-tokens/interrupted/blocked、tool/result 失败、notification/error 态在真实 GUI 里无法按需触发。这些只有纯函数单测覆盖（109 条），**单测不能替代活体**。我实测到的只有 completed→happy 这一条路径。
3. **music / building 两态活体未触发** —— 需要 ≥2/≥3 并发工具或会话，本次回合只有 1 个工具。**按需加载的「进入新状态才拉」对这两态无活体证据**，只有代码层与单测证据。
4. **并发档位口径未定** —— 见 §2 口径假设；milestones L46 明确列为待复核，**我不替用户拍板**。
5. **跨会话并发档（uiSession.sessionStatus）在真实多会话下未验** —— 本次全程单会话。
6. **第 4 条按需加载未在「全新 context + 禁缓存」下复跑** —— 我复用了同一 browser context，靠 page.on('request') 计数。深色/恢复各次 reload 后请求集合均正常（[deepy.json, idle.png]），未见缓存导致的假象，但**严格意义上没做 cold-cache 变体**。
7. **任务书给的 test/state-machine.test.mjs 路径与实际不符** —— 实际在 plugins/dsh-theme/test/state-machine.test.mjs。属任务书笔误，不影响验收，记录备查。
8. **hero 态与活跃态布局差异** —— 空会话态精灵 rect y=502（hero 布局），活跃态 y=799（底部输入卡）；两态都渲染且都可见，但我**未对 hero 态的布局美观性做判断**。

---

## H. 还原证据

| 步 | 内容 | 结果 |
|---|---|---|
| 0 | 备份三份（整体拷贝） | md5: package.json 31D0444BB5A99B3FBD1023528E8AB89C / cordis.patch.yml 35D0E0B801444BB1F4C2115720F8E4F6 / pnpm-lock.yaml AAE518EEA46B2F145F9EA86FD326E314 |
| 1 | 整体覆盖三份备份 | **IDENTICAL ×3**（覆盖后与备份 md5 逐项相等） |
| 2 | 删隐藏副本 | node_modules/.pnpm/lock.yaml 不存在；node_modules/dsh-theme 不存在 |
| 3 | pnpm install | Already up to date，exit 0，363ms；**装完三份仍 IDENTICAL** |
| 4a | 端口 | 19488 **0 listeners** |
| 4b | --dump-config 零命中 | dsh-theme hitCount: **0** |
| 4c | node_modules 条目 | 10（与验收前一致） |

**仓库零污染**：git rev-parse HEAD = 66b9bfa8cead4486fa08b508b7bff1cd32c1d662（与开工一致）；git diff --name-only = **空**；git status --short 仅 '?? .agents/tmp/' 与 '?? .idea/'（后者非本次产生）。**plugins/ 与任何 .md 全程未改。**

### 边界外残留（我无权处置，仅报告）
C:\Users\pass\.dsh\dsh-theme\state.json 存在（host 半按设计写，落 $DSH_HOME 全局目录，与 desktop profile 共享）。内容 {"enabled": true, ...} —— **与验收前的语义等价**（文件不存在时 DEFAULT_ENABLED = true），故无行为变化。删除属越界，请父代理裁决。

### 后台任务
pwsh-32（隔离实例）已 completed（随 PID 62276 被杀而退出）。其余 node 进程 startTime 为 10/9–10/11 12:43，**早于本次验收**，非本会话产生。

---

## I. 安装核验（证明验的是 HEAD 的代码）

file: 复制语义，安装副本 vs 源 **逐字节 IDENTICAL**：
package.json 6AA6F118… / cordis.patch.yml 22004600… / host/index.js FC444B4E… / lib/client.js 190D18DA… / assets/theme.css 0978542C… / deepy.json 44EA34D8… / idle.png FF78F5F5…

--dump-config 命中 2 行（- id: ui-skin-dsh-theme / name: dsh-theme），插件确实加载。

---

## J. console 分类口径（父代理 2026-10-11 裁决 ①，批准并归档）

后来者复跑时**必须**按此三类归因，否则会重现本轮的假红。

| 类别 | 捕获方式 | 计入「console 零错」？ | 说明 |
|---|---|---|---|
| pageerror | `page.on('pageerror')` | **计入** | 未捕获异常，任何一条都是红 |
| 真实 console error | `page.on('console')` type=error，**且文本不含资源加载标记** | **计入** | 代码主动 `console.error` 或框架报错 |
| 资源加载错误 | `page.on('console')` type=error，文本含 `net::ERR_FAILED` / `net::ERR_ABORTED` / `Failed to load resource` | **不计入**（单列） | 由负控制的 `page.route(...).abort()` **故意制造** |

**为什么必须分开**：第 11 条负控制要求「素材失败只允许一次 `console.warn`」。浏览器在图片请求被 abort 时**必然**额外产生一条 `Failed to load resource: net::ERR_FAILED`。若把它算进 error 计数，「零错」与「只允许一次 warn」两条断言会互相矛盾——那是**口径错误造成的假红，不是产品缺陷**。

**负控制期间的归类规则**：
- 断言「真实 error == 0」——只数前两类
- 断言「warn == 1」——`console.warn` 不参与 error 计数，单独计数
- 资源加载错误**必须原样记录在报告里**（数量 + 原始文本），不得静默丢弃；它本身是「故障确实注入」的证据

**本轮实测值**：consoleErrorTotal=1，resourceLoadErrors=1，realConsoleErrors=**0**，pageErrorCount=**0**。

