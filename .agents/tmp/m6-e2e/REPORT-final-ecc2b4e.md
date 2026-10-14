# M6 Deepy 独立验收 · 三轮合并终报（HEAD ecc2b4e）

验收方：**未参与 M6 实现的独立子代理** ｜ 日期：2026-10-11
**最终 HEAD = ecc2b4eec6498e91f91d776bab1d89fb13dda371**
环境：隔离 web profile，端口 19488，DSH 0.2.0-rc.2。桌面 GUI 19387 全程未触碰。

**一句话结论：三轮发现的 2 个缺陷（切会话丢精灵 / error 瞬时态被覆盖）均已确证修复；12 条端到端 12/12 PASS；四态 building/music/error 三合一 PASS，notification 未验证（实例配置限制，父代理已确认不必再试）。新发现一条「error 触发率约 6/10」的观测事实。**

---

## 0. 版本有效性标注（哪轮结论已失效）

| HEAD | 状态 | 该轮结论 |
|---|---|---|
| 66b9bfa | **已失效** | 12/12 PASS（DOM/渲染条目**作废**，结构已被重写）；**缺陷①「切会话丢精灵」首次发现**（有效） |
| bda3c5a | **已失效** | 缺陷① 回归转绿（有效）；12/12 PASS（重跑）；四态 building/music PASS；**缺陷②「error 被覆盖」首次发现**（有效） |
| **ecc2b4e** | **当前** | 本报告 §1–§5 全部结论 |

**跨轮有效**：缺陷①、缺陷② 的事实认定与根因；console 分类口径（§J）；四态方法论（三合一）。

---

## 1. 两个缺陷的修复对照

### 缺陷① 切会话后精灵永久消失（66b9bfa → bda3c5a 修复）

`repro_sprite_loss.py` 同一脚本、同一场景、只换版本：

| 步骤 | 66b9bfa | bda3c5a / ecc2b4e |
|---|---|---|
| v0 首屏 | child=1, sprite=true, idle | child=1, sprite=true, idle |
| vB 活跃(typing)→新建会话 | **child=0, sprite=false, null** ❌ | **child=1, sprite=true, typing** ✅ |
| vB +6s | **child=0, sprite=false, null** ❌ | **child=1, sprite=true, typing** ✅ |
| vC 切回原会话 | **child=0, sprite=false, null** ❌ | **child=1, sprite=true, typing** ✅ |

修法（Route A）：删掉全部手动 DOM 操作，改为 `DeepyView` + `DeepySprite(ref)`，`paint()` 校验 `isConnected`。**与我报告的根因一致。**

### 缺陷② error 瞬时态被持久态覆盖（bda3c5a → ecc2b4e 修复）—— 本轮核心

**修复前（bda3c5a，3 次尝试，40ms 采样）**：error **0/3 可见**
```
a1: idle@41 -> thinking@3486 -> typing@5444 -> idle@5713   (typing 仅 269ms)
a2: idle@41 -> thinking@3303 -> typing@5006 -> idle@5147   (typing 仅 141ms)
a3: idle@41 -> thinking@3286 -> typing@4486 -> idle@4611   (typing 仅 125ms)
errorVisibleInSamplerAnyAttempt: false
```

**修复后（ecc2b4e，10 次尝试，40ms 采样）**：error **6/10 可见，且每次 hold ≈ 4800ms**
```
a1: idle@44   -> thinking@3563 -> typing@5097 -> idle@5273                    (未触发)
a2: idle@44   -> thinking@3281 -> typing@5289 -> error@5522 -> idle@10246     hold=4724ms  ✅
a3: idle@41   -> thinking@3310 -> typing@4721 -> error@4814 -> idle@9600      hold=4786ms  ✅
a4: idle@42   -> thinking@3283 -> typing@4526 -> idle@4586                    (未触发)
a5: idle@41   -> thinking@3284 -> typing@5263 -> error@5455 -> idle@10241     hold=4786ms  ✅
a6: idle@42   -> thinking@3283 -> typing@5322 -> idle@5426                    (未触发)
a7: idle@41   -> thinking@3262 -> typing@5125 -> error@5292 -> idle@10082     hold=4790ms  ✅
(+ states11 的 2 次命中: hold=4762ms / 4770ms)

errorHoldMsValues (全部命中): 4724, 4762, 4770, 4786, 4786, 4790   （规范值 4800）
```

**结论**：修复**确证有效**。只要 error 被触发，可见时长恒为 4724–4790ms，与规范 4800ms 相差 ≤76ms（40ms 采样粒度内）——**4800ms hold 契约已在活体上成立**。

**像素证据**：error 显示期间截图裁剪，`nonBgCount=851/4096`，rect={656,799,64,64}，state=`error` → **确实画在屏幕上，不只是内部状态**。

---

## 2. 【新观测】error 触发率约 6/10，不是 10/10

10 次「点停止生成」中断里，4 次**完全没有触发 error**——序列直接 `typing -> idle`（如 a1：typing@5097 → idle@5273，仅 176ms）。

**这是本轮的诚实标注，不是修复失败**：
- 触发成功的 6 次，hold 全部 ≈4800ms（契约成立）
- 未触发的 4 次，是「中断路径本身没有产生 error 事件」，**不是 error 被覆盖**（修复前是「产生但被覆盖」，现在连事件都没产生）

**我不下结论说这是缺陷**，因为无法区分两种可能：
1. 中断的 turn/end reason 有时是 `interrupted`（→ error），有时是 `aborted`（→ idle，按 `deepyProject` 语义）；这是**实现正确**，取决于中断时机
2. 确有事件丢失

**判据在事件层，我没取证**（本次未注入事件探针）。若要定性，建议实现方在 `eventSource` 上记录中断时的 `turn/end reason.kind` 序列——这属于事件层取证，不是我能从像素面判定的。

---

## 3. 12 条端到端（ecc2b4e 重跑）：12 PASS / 0 FAIL

| # | 条目 | 判定 | 关键原始值 |
|---|---|---|---|
| 1 | slot 注入 | PASS | rootParentTag=DIV|conversation.input.left, data-dsh-part=deepy, rect={656,502,64,64} |
| 2 | 帧在推进 | PASS | 865ms/28 采样，distinctPosition=17 |
| 3 | 帧窗口宽=帧宽 | PASS | computedWidth=64px, bgSize=512px 384px |
| 4 | 素材按需加载 | PASS | 首屏 PNG=[idle.png]（1/8），全部 200 |
| 5 | 事件→状态 | PASS | **thinking→typing→thinking→typing→happy**（本轮实跑，非沿用上轮） |
| 6 | OFF 全撤 | PASS | root/style/htmlAttr 全 false；+2.5s 未复活；rAF 增量 0 |
| 7 | ON 恢复 | PASS | distinctPositions=14 |
| 8 | console 零错 | PASS | realErrors=0, pageerror=0 |
| 9 | 像素可见 | PASS | nonBg=767/4096, 匹配饱和色=560 |
| 10 | 深色模式 | PASS | bodyBg=rgb(19,22,29), nonBg=790 |
| 11 | 负控制 | PASS | warn=1, realErrors=0, 恢复复绿 |
| 附 | 变异负控制 | PASS | 注入 96px → 断言变红 |

第 5 条序列与上轮不同（上轮为 music→happy→typing），**已按父代理要求以实跑为准**，未拿上轮当期望值。

---

## 4. 四态补验（三合一：状态切 + PNG 拉取 + 像素可见）

| 态 | 判定 | 证据 |
|---|---|---|
| **building** | **PASS** | sequence=building@0.27s；building.png 拉取=true；pixels nonBg=**1098**/4096；rect 64×64 |
| **music** | **PASS** | building@0.26 → happy@29.57 → building@34.59 → **music@57.02**；music.png=true；nonBg=**963**/4096 |
| **error** | **PASS** | 见 §1；hold 4724–4790ms；像素 nonBg=**851**；**触发率 6/10 见 §2** |
| **notification** | **未验证** | 父代理已确认实例配置限制，不必再试 |

building/music 均为 `renderingDefectBypassed: false` —— Route A 之后切会话不再丢精灵，**无需绕过缺陷即可验**。

---

## 5. 单测与静态检查（ecc2b4e，只读复跑）

| 检查 | 结果 |
|---|---|
| test/state-machine.test.mjs | **passed 130 / failed 0 / PASS**（上轮 109，本轮 +21 条瞬时态契约测试） |
| test/render-layer.test.mjs | **passed 36 / failed 0 / PASS** |
| 安装副本 vs 源 | client.js CA5A7006…、host/index.js FC444B4E…、deepy.json 44EA34D8… 全部 **IDENTICAL** |
| 构建守卫 | 资产 md5 未变（44EA34D8… 等），沿用前轮结论（守卫 1–4 全绿，9/9 逐字节一致） |

本轮 diff（bda3c5a..ecc2b4e）只动 2 个文件：`lib/client.js`（+28/-6）、`test/state-machine.test.mjs`（+71/-6）。核心是 `persistent()` 不再清瞬时态，新增 `beginRound()` 仅由 `turn/start` 调用。

---

## 6. 还原证据

| 步 | 内容 | 结果 |
|---|---|---|
| 0 | 备份三份 | package.json 31D0444B… / cordis.patch.yml 35D0E0B8… / pnpm-lock.yaml AAE518EE… |
| 1 | 整体覆盖 | **IDENTICAL ×3** |
| 2 | 删隐藏副本 | .pnpm/lock.yaml 与 node_modules/dsh-theme 均不存在 |
| 3 | pnpm install | Already up to date，exit 0；**装完三份仍 IDENTICAL** |
| 4a | 端口 | 19488 **0 listeners**（按 PID 60556 Stop-Process） |
| 4b | --dump-config | dsh-theme **hitCount: 0** |
| 4c | node_modules | 10 条 |

**仓库零污染**：HEAD=ecc2b4eec6498e91f91d776bab1d89fb13dda371；`git diff --name-only` **空**；status 仅 `?? .agents/tmp/` 与 `?? .idea/`。**plugins/ 与任何 .md 全程未改。** 19387 未碰。

---

## 7. 复跑命令

```powershell
& "$env:APPDATA\npm\dsh.cmd" --profile web --port 19488 --no-open
$env:PYTHONUTF8='1'
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6.py            '<URL>'   # 12 条端到端
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_supplement.py   '<URL>'   # rAF / 按需 / 变异负控制
python E:\dsh-theme\.agents\tmp\m6-e2e\repro_sprite_loss.py     '<URL>'   # 缺陷① 回归（应绿）
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_states6.py     '<URL>'   # 四态三合一
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_states12.py    '<URL>' 6 # 缺陷② error hold + 触发率
Get-NetTCPConnection -LocalPort 19488 -State Listen | % { Stop-Process -Id $_.OwningProcess -Force }
```

---

## 8. 我没验到的 / 不确定的

1. **error 触发率 6/10 的归因未取证**（§2）——无法区分「reason 依时机不同」与「事件丢失」，需事件层探针。
2. **notification 态未验证**——父代理已确认实例配置限制，本轮未再尝试。
3. **动画手感（里程碑⑤）未验**——感官类，属用户真机走查。
4. **并发档位口径（milestones L46）仍未定**——四态只断言「到达该状态 + PNG 拉取 + 像素可见」，不断言档位映射。
5. **Route A 的其他生命周期边界未测**——热重载、会话删除、极窄窗口、slots 槽重新声明。
6. **负控制下 root 由 true 变 false**（Route A 结构性变化）——语义未变差，但与「容器保留、仅隐藏」的措辞不符，建议实现方对齐文档。
7. **构建守卫本轮未重跑**——资产 md5 未变，沿用前轮。
