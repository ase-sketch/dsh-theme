# M6 Deepy 独立验收 · 第二轮终报（HEAD bda3c5a）

验收方：**未参与 M6 实现的独立子代理** ｜ 日期：2026-10-11
**最终 HEAD = bda3c5a00740b183950d8cb41a27436ae7b2ceb9**（修复提交）；旧 66b9bfa 结论已按标注作废。
环境：隔离 web profile C:\Users\pass\.dsh\profiles\web，端口 19488，DSH 0.2.0-rc.2。桌面 GUI 19387 全程未触碰。

**一句话结论：修复前发现的「切会话后精灵永久消失」缺陷已确证修复；12 条端到端在新结构下 12/12 PASS；四态补验中 building / music 三合一 PASS，error 判定为 FAIL（真缺陷），notification 判定为未验证（本实例无法触发）。**

---

## 0. 结论有效性标注（哪些已作废、哪些有效）

| 结论 | 来源 HEAD | 有效性 |
|---|---|---|
| 12 条端到端 12/12 PASS（DOM/渲染相关条目） | 66b9bfa | **已作废**——DOM 结构已被 Route A 重写 |
| 12 条端到端 12/12 PASS（重新实跑） | bda3c5a | **有效**（见 §1） |
| 切会话后精灵永久消失（缺陷） | 66b9bfa | **有效**——缺陷真实存在，已由 bda3c5a 修复 |
| 缺陷回归测试 repro_sprite_loss.py 红→绿 | 两者对照 | **有效**（见 §2） |
| music / building 状态机正确（PNG 被拉取） | 66b9bfa | 部分有效——本轮在 bda3c5a 上以三合一重验通过 |
| error 态 | bda3c5a | **FAIL**（见 §4） |
| notification 态 | bda3c5a | **未验证**（见 §5） |
| console 分类口径（§J） | 两轮通用 | **有效** |

---

## 1. 12 条端到端（bda3c5a 重新实跑）：12 PASS / 0 FAIL

| # | 条目 | 判定 | 关键原始值 |
|---|---|---|---|
| 1 | slot 注入 | PASS | rootParentTag=DIV|conversation.input.left, rootDshPart=deepy, rect={656,502,64,64} |
| 2 | 帧在推进 | PASS | 869ms/28 采样，distinctPosition=17 |
| 3 | 帧窗口宽=帧宽 | PASS | computedWidth=64px, manifestDisplayPx=64, bgSize=512px 384px |
| 4 | 素材按需加载 | PASS | 首屏 PNG=[idle.png]（1/8），全部 200 |
| 5 | 事件→状态 | PASS | music→happy→typing |
| 6 | OFF 全撤 | PASS | root/style/htmlAttr 全 false；+2.5s 未复活；rAF 增量 0 |
| 7 | ON 恢复 | PASS | toggle after=true, distinctPositions=14 |
| 8 | console 零错 | PASS | realErrors=0, pageerror=0 |
| 9 | 像素可见 | PASS | nonBg=776/4096, 匹配饱和色=559 |
| 10 | 深色模式 | PASS | bodyBg=rgb(19,22,29), nonBg=797 |
| 11 | 负控制 | PASS | warn=1, realErrors=0, 恢复复绿 |
| 附 | 变异负控制 | PASS | 注入 96px → 断言变红 |

### 结构变化（父代理要求如实报实际值，不迁就旧断言）

| 观察点 | 修复前 (66b9bfa) | 修复后 (bda3c5a) | 说明 |
|---|---|---|---|
| 正常态 rootChildCount | 1 | **1** | 与实现方预期一致；未见 React 插入注释节点 |
| 正常态 rootChildClasses | ['dsh-theme-deepy-sprite'] | ['dsh-theme-deepy-sprite'] | 一致 |
| **负控制（素材失败）时 root** | **true**（容器留在 DOM，只是画不出来） | **false** | 结构变化：Route A 下 DeepyView 在素材未就绪时 return null，React 直接不挂容器 |

负控制那条的语义**没有变差**（仍是「容器隐藏、不报错、只 warn 一次」），但断言口径从「容器在但空」变成「容器不在」。我的脚本断言的是 spritePainted=false + warn=1 + realErrors=0，**两种结构下都成立**，故 PASS 有效；但如果实现方文档里写的是「容器保留、仅隐藏」，**描述与实跑不符，需要对齐措辞**。

---

## 2. 缺陷回归：repro_sprite_loss.py 红 → 绿

同一脚本、同一场景、只换代码版本：

| 步骤 | 修复前 (66b9bfa) | 修复后 (bda3c5a) |
|---|---|---|
| v0 首屏 | child=1, sprite=true, state=idle | child=1, sprite=true, state=idle |
| vA 空→空新建 | child=1, sprite=true | child=1, sprite=true |
| vB 活跃(typing)→新建会话 | **child=0, sprite=false, state=null** ❌ | **child=1, sprite=true, state=typing** ✅ |
| vB +6s | **child=0, sprite=false, state=null** ❌ | **child=1, sprite=true, state=typing** ✅ |
| vC 切回原会话 | **child=0, sprite=false, state=null** ❌ | **child=1, sprite=true, state=typing** ✅ |
| vD 刷新 | child=1, sprite=true（靠刷新自愈） | child=1, sprite=true |

另有场景内验证（states6 的 A-session-switch）：活跃会话 typing → 新建会话后 **state=typing、alive=true、childCount=1、w=64px**，精灵继续渲染。

**根因复核（读 bda3c5a 代码确认修法成立）**：手动 DOM 操作（ensureContainer / removeContainer / reparentIfNeeded / slotHost）全部删除；改为 DeepyView（容器组件）+ DeepySprite（ref 交回真实节点），paint() 读 spriteEl 并校验 isConnected（client.js:656-671）。节点存在性交还 React，自愈成为结构性保证——**与我报告的根因一致**。

---

## 3. 四态补验（三合一：状态切了 + PNG 拉过 + 像素可见）

### 3.1 building —— **PASS**
```
sequence: building@0.27s   (3 会话并发)
building.png requested: true
pixels: nonBgCount=1148 / 4096   dominant=[255,255,255,255]
rect: {x:656, y:799, w:64, h:64}
renderingDefectBypassed: false   ← 未绕过，Route A 后切会话不再丢精灵
```

### 3.2 music —— **PASS**（3→2 回落路径）
```
sequence: building@0.26 -> happy@29.31 -> building@34.59 -> music@57.01
music.png requested: true
pixels: nonBgCount=1006 / 4096
renderingDefectBypassed: false
```
这条同时验证了 R3 修正的档位回落语义：并发数从 3 降到 2 时**经 music 而非直接跳 thinking**。

### 3.3 error —— **FAIL（真缺陷，见 §4）**

### 3.4 notification —— **未验证（SKIPPED，见 §5）**

---

## 4. 【FAIL】error 态：瞬时态在约 100–270ms 内被覆盖，用户看不到

### 哪一步
回合被中断（点「停止生成」）后，精灵应从 typing 切到 error 并保持 4800ms。

### 期望 vs 实际

| | 期望 | 实际 |
|---|---|---|
| 状态序列 | typing → **error**（保持 4800ms）→ 按档位回落 | typing → **idle**（约 100–270ms 内） |
| error.png | 拉取并绘制 | 3 次中 1 次被拉取，**但从未被绘制** |
| 像素可见 | 精灵显示 error 帧 | 采样器从未观测到 error 态 |

### 原始证据（3 次独立尝试，40ms 采样）
```
attempt 1: idle@41 -> thinking@3486 -> typing@5444 -> idle@5713   (typing 持续 269ms)
           error.png requested: true      error 可见: false
attempt 2: idle@41 -> thinking@3303 -> typing@5006 -> idle@5147   (typing 持续 141ms)
           error.png requested: false     error 可见: false
attempt 3: idle@41 -> thinking@3286 -> typing@4486 -> idle@4611   (typing 持续 125ms)
           error.png requested: false     error 可见: false
errorPngRequestedAnyAttempt: true   |   errorVisibleInSamplerAnyAttempt: false
```
另一次更早的尝试（round-7，250ms 采样）同样出现「error.png 被拉取、但状态显示 idle」。

**判据分层（不混为一谈）**：
- **状态机层**：error.png 至少被拉取过 1 次 → 状态机**确实进入了 error 态**（deepyLoadState('error') 只在 display === 'error' 时调用）。
- **渲染/时序层**：**FAIL**。error 瞬时态在约 100–270ms 内被后续事件覆盖为 idle，用户几乎不可能看到；4800ms 保持窗口与「R3 按档位回落」在活体上**完全没有生效**。

### 最小复现
```
1. 起隔离实例，装 bda3c5a，开一个会话
2. 发：Use the pwsh tool to run this exact command: Start-Sleep -Seconds 150 . You MUST call the tool exactly once. Then reply DONE.
3. 等精灵切到 typing（工具运行中）
4. 点「停止生成」按钮
5. 以 40ms 间隔采样 #dsh-theme-deepy .dsh-theme-deepy-sprite 的 computed background-image
→ 观测到 typing -> idle，未观测到 error；error.png 请求时有时无
脚本：.agents/tmp/m6-e2e/verify_m6_states9.py（可复跑）
```

### 我的假设（标注为假设，未验证）
中断很可能产生**两个** turn/end 事件（或 turn/end 后紧跟一个持久态事件），第二个事件把 transient='error' 覆盖掉。按 deepyProject 的语义：turn/end 里非 completed/error/max-tokens/interrupted/blocked 的 reason 会走 persistent('idle')，而 persistent() 会**清掉瞬时态**。若第二个事件即为此类，则 error 被立即抹掉——与观测吻合。**我未在事件层取证，故这只是假设。**

### 另注（不是本轮新增缺陷）
工具「失败」在本 harness 里**不会**产生 error：rounds 3–6 用 exit 7 / Get-Item 不存在 / 未知工具名 / 危险 Remove-Item，**全部落到 happy**（turn 正常结束）。说明 tool/result 的 message.isError=true 路径在本实例**无法用工具非零退出触发**。这解释了为何 error.png 只在中断路径下出现过。

---

## 5. 【未验证】notification 态

**尝试了什么**：

| 尝试 | 结果 |
|---|---|
| DOM 审批面探测（[data-approval] / [class*=pproval] / 正文含「批准/允许」） | approvalNodes=**0**，bodyHasApprovalText=**false** |
| boot 图里的审批相关插件 | **存在**：@deepseek-ai/dsh-client-ui-approval、@deepseek-ai/dsh-client-ui-permission-presets |
| 危险命令：Remove-Item -Recurse -Force C:\Windows\System32\__m6e2e_nope__ | 序列 thinking→typing→**happy**，未触发审批 |
| 危险命令：Remove-Item ... node_modules\dsh-theme\__never_exists__ | 未触发审批 |
| 切换访问模式到「仅可查看」后再试写操作 | 下拉里**有**「仅可查看 / 工作区内修改 / 完全权限」选项，点击后 aria 仍显示「当前：工作区内修改」——**模式未切换成功**；随后的写操作仍落到 happy |

**为什么触发不了**：本隔离实例的访问模式停在「工作区内修改」，而我的探测命令都落在工作区**内**（或未实际产生写）。审批插件在 boot 图里存在，但**没有任何一次操作被拦截成审批请求**。

**结论**：notification 态在本实例**未验证**。按父代理口径，这可以是「未验证」，但**不能是「假装验证了」**——故明确标 SKIPPED。若要补齐，建议改在**工作区外写入 + 访问模式确实切到「仅可查看」**的条件下重试（需要先解决模式切换未生效的问题，我没有继续深挖，因为那属于实例配置而非 M6 代码）。

---

## 6. 单测与静态检查（bda3c5a，只读复跑）

| 检查 | 结果 |
|---|---|
| test/state-machine.test.mjs | **passed 109 / failed 0 / RESULT: PASS** |
| test/render-layer.test.mjs（新增） | **passed 36 / failed 0 / RESULT: PASS** |
| 安装副本 vs 源逐字节 | lib/client.js 3ECF0F03…、host/index.js FC444B4E…、deepy.json 44EA34D8…、package.json 6AA6F118… 全部 **IDENTICAL** |
| 构建守卫（milestones ①） | 上一轮已在沙箱副本复跑：守卫 1–4 全绿，9/9 产出与入库逐字节一致（资产未变，本轮未重跑） |

注：test/ 目录不在 package.json 的 files 白名单里，故安装副本无 test/——这是预期行为，不是缺陷。

---

## 7. 还原证据

| 步 | 内容 | 结果 |
|---|---|---|
| 0 | 备份三份 | package.json 31D0444B… / cordis.patch.yml 35D0E0B8… / pnpm-lock.yaml AAE518EE… |
| 1 | 整体覆盖 | **IDENTICAL ×3** |
| 2 | 删隐藏副本 | .pnpm/lock.yaml 不存在；node_modules/dsh-theme 不存在 |
| 3 | pnpm install | Already up to date，exit 0；**装完三份仍 IDENTICAL** |
| 4a | 端口 | 19488 **0 listeners**（按 PID 64940 Stop-Process） |
| 4b | --dump-config | dsh-theme **hitCount: 0** |
| 4c | node_modules | 10 条（同前） |

**仓库零污染**：HEAD = bda3c5a00740b183950d8cb41a27436ae7b2ceb9；git diff --name-only **空**；git status --short 仅 ?? .agents/tmp/ 与 ?? .idea/。**plugins/ 与任何 .md 全程未改。**
19387 桌面 GUI：1 listener，全程未触碰。

### 边界外残留（仅报告）
C:\Users\pass\.dsh\dsh-theme\state.json 保留未动（父代理裁决），内容 enabled:true，与验收前语义等价。

---

## 8. 复跑命令

```powershell
& "$env:APPDATA\npm\dsh.cmd" --profile web --port 19488 --no-open
$env:PYTHONUTF8='1'
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6.py           '<URL>'   # 12 条端到端
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_supplement.py  '<URL>'   # rAF / 按需 / 变异负控制
python E:\dsh-theme\.agents\tmp\m6-e2e\repro_sprite_loss.py    '<URL>'   # 缺陷回归（应绿）
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_states6.py    '<URL>'   # 四态三合一
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_states9.py    '<URL>'   # error 瞬时态特征化
Get-NetTCPConnection -LocalPort 19488 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 9. 我没验到的 / 不确定的

1. **notification 态未验证**（§5）——尝试与失败原因已列，不假装验证过。
2. **error 的事件层根因未取证**（§4）——我只观测到现象与时间窗，「双 turn/end 覆盖瞬时态」是**假设**，需实现方在事件层确认。
3. **动画手感（里程碑⑤）未验**——感官类，属用户真机走查。
4. **music / building 的跨会话并发依赖真实多会话**——本轮用「开 3 个长任务会话」构造，uiSession.sessionStatus 的并发计数语义（milestones L46 待复核）仍未定；我只断言「到达了该状态且该 PNG 被拉取且像素可见」，**不断言档位映射口径**。
5. **Route A 的 React 生命周期边界只覆盖了切会话**——未测：热重载、会话被删除、极窄窗口、slots 槽重新声明。
6. **负控制下 root 从「在」变「不在」**（§1）——语义未变差，但与「容器隐藏」的常见措辞不一致，建议实现方对齐文档。
7. **构建守卫本轮未重跑**——资产文件 md5 与上一轮完全一致（44EA34D8… 等），故沿用上轮结论。
