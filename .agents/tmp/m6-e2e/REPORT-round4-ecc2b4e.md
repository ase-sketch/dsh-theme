# M6 第四轮验收报告（HEAD ecc2b4e）

验收方：**未参与 M6 实现的独立子代理** ｜ 日期：2026-10-11/12
HEAD = `ecc2b4eec6498e91f91d776bab1d89fb13dda371`（全程未变）｜ 隔离 web profile :19488 ｜ 桌面 19387 未触碰

**一句话结论：A 块 4/4 PASS（含会话删除、窄视口、隐藏恢复、切工作区）；B 块功能层 PASS、视觉层无重叠（518px 间距）；C 块事件层归因 PASS——error 触发率差异已闭环为「设计」，非缺陷，可停查。**

---

## 0. 重要前提修正（先说，因为它影响你怎么读 B 块）

**任务书说「dsh-pet 已装在 web profile（disabled: true）」——事实不符。**

| 检查 | 结果 |
|---|---|
| web profile package.json | `dependencies: {}`，无 dsh-pet |
| web profile node_modules | 无 `@linxin666/dsh-pet` |
| **desktop** profile | **有**（`@linxin666/dsh-web-all@^0.4.6` 带出，`disabled: true`） |

所以我**自己把 dsh-pet 装进了隔离 web profile**（`@linxin666/dsh-pet@^0.4.6`，pnpm 从 registry 取，7 包，2.9s，exit 0），并在还原时一并移除。B 块验的是**真共存**，不是纸面推断。

---

## A. Route A 生命周期边界 —— 4/4 PASS

| # | 场景 | 判定 | 原始证据 |
|---|---|---|---|
| A1 | **会话删除/归档** | **PASS** | 归档后 `alive=true, state=typing, rootInDom=true`，rect 仍 64×64；console 零错 |
| A2 | **极窄视口 420 / 320px** | **PASS** | 420px：rect={169,699,64,64} **完全在视口内**；320px：rect={169,653,64,64} **完全在视口内**；两档均 `deepyVisible=true` |
| A3 | **页面隐藏/恢复** | **PASS** | 隐藏期间 background-position 两次采样**完全相同**（`-384px -192px` → `-384px -192px`，frozen=true）；恢复后两次采样不同（`-64px -64px` → `0px -192px`，resumed=true） |
| A4 | **切换工作区 / slot 重渲染** | **PASS** | 切到 ds-cs 工作区后 `alive=true, state=typing`，rect 64×64 |

### A3 方法说明（诚实标注）
`Emulation.setPageVisibilityOverride` 在本机 Chromium **不存在**（`wasn't found`），第二页 `bring_to_front()` 在 headless 下也不改变 `document.hidden`（实测恒 false）。最终用**override `document.hidden` getter + dispatch `visibilitychange`** —— 这直接驱动插件监听的那个处理器，**等价于真实切页签**，但严格说不是浏览器原生路径。若要原生证据，需真实切标签或非 headless。

### A2 窄视口补充观察（信息性，非缺陷）
320px 下精灵 rect.x=169、宽 64，右侧到 233，仍在视口内；**未被挤出、未被裁切、未消失**。

---

## B. 与 @linxin666/dsh-pet 共存

### B1 功能性 —— PASS

| 断言 | 判定 | 原始证据 |
|---|---|---|
| 两个角色都在 | **PASS** | pet：`button.v78Lda_summon`（文案「召唤鲸鱼娘（原版）」）；Deepy：`#dsh-theme-deepy` alive=true |
| pet 可正常召唤 | **PASS** | 点击 summon 后 `dockCount=1`、`summonCount=0`，渲染出 `v78Lda_spriteWrap` / `v78Lda_sprite`（148×160） |
| Deepy 仍能切状态 | **PASS** | `thinking@0.27 → typing@1.62 → thinking@27.77 → typing@28.3 → happy@29.09`，PNG 按需拉取 |
| pet 未被 Deepy 破坏 | **PASS** | 共存全程 pet 元素存在且可召唤 |
| console 零错 | **PASS** | realErrors=0，pageerrors=0 |

**关于 pet 的初始形态**：pet 首次加载时渲染的是**隐藏态**的 summon 按钮，不是精灵本体——这是 pet 自身 `display.visible` 的语义（源码 `DEFAULT_DISPLAY.visible = true`，但 snapshot 未就绪时渲染 summon），**不是共存导致的缺失**。我第一轮用 `/pet/i` 匹配 class 没命中，是因为 pet 的 class 前缀是 `v78Lda_`（CSS module hash），不含 "pet" 字样——**是我的选择器错了，不是 pet 没渲染**。

### B2 视觉重叠 —— 无重叠

| 元素 | rect | 与 Deepy 重叠面积 |
|---|---|---|
| Deepy 精灵 | {x:656, y:502, w:64, h:64} | — |
| pet `v78Lda_spriteWrap` | {x:1238, y:568, w:148, h:160} | **0** |
| pet `v78Lda_sprite` | {x:1238, y:568, w:148, h:160} | **0** |

**`anyOverlap = false`，最小间距 `minGapPx = 518`**。

给用户的信息：Deepy 在输入卡左下（x≈656），pet 默认停在右下（x≈1238，`right:54/bottom:172`），**两者相距 518px，不遮挡**。但注意 pet 是**可拖拽**的（源码有 `createDragStream`），用户把它拖到左侧就会与 Deepy 重叠——这是用户行为，不是默认冲突。

---

## C. error 触发率的事件层归因 —— PASS，**结论：设计而非缺陷，可停查**

### C0 探针与 dsh-theme 共存 —— PASS
自建临时 bundle 包 `dsh-theme-evtprobe`（放 `.agents/tmp/`，**未碰 plugins/**），`inject: ['sessions','uiSession']`，订阅同一 `eventSource`。探针与 dsh-theme **同时正常工作**。

### C1 归因 —— PASS，且**非空洞通过**

6 次中断，逐次记录完整事件流：

| 尝试 | error 可见 | hold | tool/call | tool/result | isError | turn/end reason | 可解释 |
|---|---|---|---|---|---|---|---|
| 1 | ✗ | — | 无 | 无 | — | aborted | ✓ |
| 2 | ✗ | — | 无 | 无 | — | aborted | ✓ |
| 3 | **✓** | **4717ms** | 有 | 有 | **true** | aborted | ✓ |
| 4 | **✓** | **4758ms** | 有 | 有 | **true** | aborted | ✓ |
| 5 | ✗ | — | 无 | 无 | — | aborted | ✓ |
| 6 | ✗ | — | 无 | 无 | — | aborted | ✓ |

**1:1 完美相关**：`tool/result(isError=true)` 存在 ⟺ error 可见。

**防空洞验证**（关键）：我专门检查了「`toolResults` 为空导致断言恒真」的可能——不是。第 3/4 次**确实各有 1 条 tool/result**，第 1/2/5/6 次**确实 0 条**。且我进一步 dump 了条目键名确认类型：

```
trial 1 (error 可见):  tool/call -> tool/result(evKeys含 sourceEventSeqs,surfaceOp) -> step/end -> settle-assistant -> turn/end
trial 2 (error 不可见): step/end -> settle-assistant -> turn/end        ← 完全没有 tool/call 与 tool/result
trial 3 (error 不可见): 同上
trial 4 (error 不可见): 同上
```

（先前序列化出的 `{type: null}` 经查是 `settle-assistant` 包装条目，与 error 无关——**探针输出格式本身被验证过**，这正是父代理提醒的「探针输出也要被验证」。）

### 结论
**error 是否出现，取决于中断时是否有 in-flight 工具调用**：
- 工具在跑时中断 → 产生失败的 `tool/result` → error 瞬时态 → 随后的 `turn/end(aborted)` 走 `persistent('idle')`，**在新契约下不再清瞬时态** → error 活满 ~4800ms
- 工具未跑/已结束时中断 → 无 `tool/result` → 直接回落 idle

**两条路径都符合语义，属设计，不是缺陷。** 建议按父代理口径**停查**。

**顺带：这组数据是 ecc2b4e 修复的独立事件层证据** —— 像素层能证明「error 可见了」，事件层能证明「为什么这次没被清掉」（`turn/end(aborted)` 走了 persistent 而未清瞬时态）。

### C2 多订阅者 —— PASS（跨插件协作通用结论）

探针在同一 `eventSource` 上装 **2 个**监听器，dsh-theme 自己还有 1 个：

| session | hitsA | hitsB | stop 类型 |
|---|---|---|---|
| session-7d405b41… | 49 | 49 | function / function |
| session-b31a1f04… | 29 | 29 | function / function |
| session-3640b524… | 215 | 215 | function / function |
| session-0e492e78… | 165 | 165 | function / function |
| session-301e39a0… | 59 | 59 | function / function |
| session-43ecb479… | 47 | 47 | function / function |

**6/6 session 上 hitsA === hitsB 且均 >0** → `eventSource.subscribe` **支持多订阅者，无单订阅限制**。`subscribe()` 返回的 stop 均为 function。

**通用结论：多插件可安全共享同一 eventSource 订阅**，不存在「后订阅者挤掉先订阅者」。

---

## 修正记录：我上轮的判据错了

| 项 | 上轮（错） | 本轮（对） |
|---|---|---|
| error 的触发条件 | `turn/end reason === 'interrupted'` | **`tool/result` with `message.isError === true`** |
| 我报的「6/10 触发率」 | 疑为事件丢失 | **中断时机差异，属设计** |
| 我给的假设 | 「双 turn/end 覆盖瞬时态」 | **被本轮数据推翻**：只有 1 个 turn/end |

父代理同期给出的「reason 必须是 interrupted」判据同样来自静态推测，已被事件流推翻——**以事件流为准**。

---

## 还原证据

| 步 | 内容 | 结果 |
|---|---|---|
| 0 | 备份三份 | 31D0444B… / 35D0E0B8… / AAE518EE… |
| 1 | 整体覆盖 | **IDENTICAL ×3** |
| 2 | 删隐藏副本 + 三个插件副本 | `.pnpm/lock.yaml` 无；`dsh-theme` / `@linxin666/dsh-pet` / `dsh-theme-evtprobe` 全无；`.pnpm` 下无匹配目录；`.modules.yaml` 零命中 |
| 3 | pnpm install | `Already up to date`，exit 0；**装完三份仍 IDENTICAL** |
| 4a | 端口 | 19488 **0 listeners**（按 PID 52940） |
| 4b | --dump-config | dsh-theme **0** / dsh-pet **0** / evtprobe **0** |
| 4c | node_modules | 11 条（多出的是 pnpm 自己的 `.package-map.json`，对三个插件**零引用**） |

**仓库**：HEAD=`ecc2b4e`，`git diff --name-only` **空**。`git status` 多出一条 `?? .agents/notes/implemented/feature/2026-10-11-m6-deepy-state-machine.md`（7677B，23:55 写入）——**不是我的产物**（我全程只写 `.agents/tmp/m6-e2e/`），看起来是实现方在写归属笔记。**归因权归父代理**，我只报告它存在。

19387 桌面 GUI 未触碰。

---

## 本轮新增脚本

```powershell
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_round4_final.py '<URL>'  # A1/A2/A4 + B1
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_round4b.py       '<URL>'  # 重叠测量 + A1 重试
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_round4d.py       '<URL>'  # C1 归因 + C2 多订阅 + A3
python E:\dsh-theme\.agents\tmp\m6-e2e\verify_m6_round4e.py       '<URL>'  # 条目键名确认
```
探针包：`.agents/tmp/m6-e2e/pkg/dsh-theme-evtprobe/`（临时，未入 plugins/）

---

## 我没验到的 / 不确定的

1. **A3 非浏览器原生路径** —— 用 override `document.hidden` 驱动，非真实切标签（CDP API 本机不存在、headless 下 bring_to_front 无效）。
2. **pet 的完整功能未验** —— 我只验证了「在、能召唤、不被 Deepy 破坏」。pet 自身的 petting/feeding/affinity 不在 M6 范围，未验。
3. **pet 拖拽后是否与 Deepy 重叠未验** —— 只测了默认位置（518px 间距）。
4. **会话删除用「归档」路径** —— DSH 的会话行菜单里是「归档会话」，没有字面「删除」。语义上等价于移出列表，但若存在另一种硬删除路径，我未覆盖。
5. **窄视口只测了 420/320 两档**，且 slot 容器本身在窄视口下 `getBoundingClientRect` 返回 0×0（shell 行为），精灵 rect 却正常——这个差异我未深究。
6. **探针不影响 dsh-theme 的结论基于「两者都正常工作」**，未做「移除探针后 Deepy 行为完全一致」的对照。
