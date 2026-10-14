# M5 插件独立验收 · 证据索引

验收方：未参与产出的独立子代理 ｜ 日期 2026-10-10 ｜ 环境：隔离 web profile `C:\Users\pass\.dsh\profiles\web\`，端口 19488
桌面 GUI 19387 全程未触碰。项目文件只读（git status 显示 plugins/ 为未跟踪新增，由生产者产出，非本次验收所改）。

**结论一句话：浅色全绿、复现与生产者报告一致；深色模式真红（侧栏与输入卡未随深色切换）。**

---

## 01-install · 从零安装

安装前 profile 无任何 dsh-theme 痕迹（deps={} / patch=[] / node_modules 10 项无 dsh-theme）。

| 步骤 | 命令 | 结果 |
|---|---|---|
| 备份 pre-state | Copy-Item package.json/cordis.patch.yml/pnpm-lock.yaml | pre-state.json（md5 见下） |
| 写依赖 | package.json → `"dsh-theme": "file:E:/dsh-theme/plugins/dsh-theme"` | 见 pre-state.json 对照 |
| 写挂载 | cordis.patch.yml → `- insert: [{id: ui-skin-dsh-theme, name: 'dsh-theme', disabled: false}]` | 同上 |
| 安装 | `pnpm install`（workdir=profile） | exit 0，`Packages: +1`，553ms |
| 校验 | `dsh --profile web --dump-config` | dump-config.txt:1261-1263 出现 `- id: ui-skin-dsh-theme / name: dsh-theme / disabled: false` |

**file: 复制语义验证（关键）**——安装副本 5 个文件 md5 与源 `plugins/dsh-theme` **逐字节一致**：

| 文件 | 源 md5 | 安装副本 md5 | 一致 |
|---|---|---|---|
| package.json | AB6C4930C73CF78A26607F6DC1424E1B | 同 | ✅ |
| cordis.patch.yml | 22004600178771908D36E71FC0C80C92 | 同 | ✅ |
| host/index.js | B4CE2A071EC1D4A2A0519CDDB2A4D011 | 同 | ✅ |
| lib/client.js | 1F342EDA3EF133C5E6118FBB7BF4575F | 同 | ✅ |
| assets/theme.css | 4677C8FD06A5EB6917A95DAFA4579E90 | 同 | ✅ |

→ 证明装的是当前源码版本；也印证"装包后改源码不生效，必须重装"。
证据：`source-plugin-hashes.txt`、`installed-copy-hashes.txt`、`pre-state.json`、`dump-config.txt`

---

## 02-rerun · 复跑生产者脚本（全部逐字节复制，零修改）

脚本 md5 与源一致（verify_m5 3C37EE1E…、parity_m3 042BFE83…、pixel_acceptance 0FE31A6C…、check_disabled 30C10DCD…）。
**对生产者原脚本的偏离 = 0 行**，无需 diff。

### verify_m5.py（七条）
| # | 项 | 我跑出来的值 | 生产者报告值 | 一致 |
|---|---|---|---|---|
| 1 | GUI 加载 console 干净 | errors 0 / pageerrors 0 / 4xx+ 0 | 同 | ✅ |
| 2 | 设置面板存在 | navOpened T / title T / toggle T / checked T | 同 | ✅ |
| 3 | ON 注入 + token 命中 | attr T / style T / len 24745 / derivation T | 同 | ✅ |
| 4 | OFF 干净卸载 | attr F / style F / len 0 / checked F / sidebar rgb(249,250,251) | 同 | ✅ |
| 5 | 重载持久化 | ON→attr T style T；OFF→attr F style F | 同 | ✅ |
| 6 | loader 禁用可逆 | disabled: bootIds [] / attr F / style F / route 404 / errs 1；reverted: bootIds ['dsh-theme'] / attr T / style T / route 200 / errs 0 | 同 | ✅ |
| 7 | 像素采样 | allDiffer T / diffPct 22.92 / brandBlue 2316 vs 0 / sidebarTint 56949 vs 57584 | 同 | ✅ |

acceptance.json 与生产者 acceptance.json **逐字段 diff：唯一差异 1 处**——
`/c7_paint_on/sidebar/cls`：生产者 `_2H3hWW_root _2H3hWW_quietBars`，我 `_2H3hWW_root`。
这是 shell 的滚动条动效类（截图时是否处于静止态），**不属于任何断言项**，判定为非红。
其余全部键值相同，含 6 张截图 md5 全等。

### parity_m3.py（M3 对照）
**17/17 OK，FAILS: []**。四个 found 全 True（nsFound/rowFound/cardFound/sbFound）。
证据：`parity_m3.stdout.log`

### pixel_acceptance.py
4 个采样点全部 differ，数值与生产者**逐位相同**；verdict「皮肤色确实画在 shell 绘制层上」。

### check_disabled.py（disabled 态）
bootIds [] / htmlHasAttr false / styleElExists false / sidebarBg rgb(249,250,251) / hostRouteStatus **404** / consoleErrors 1（即 404 本身）。
与生产者 disabledTrue 分支一致。证据：`check_disabled.stdout.log`

---

## 03-dark · 深色模式（生产者零覆盖，本项为独立补做）→ ❌ 真红

方法与容差：切 设置→通用设置→外观→深色；同视口 1440×900、同坐标；每通道 ±2 容差；
基线口径 = `.agents/shots/_m2_verify.py`（正则解析 `E:/dsh-ui/preview/index.html` 的 `[data-theme="dark"]` + mapping.json）。

### 计算值层
- `body` 背景 = **rgb(19,22,29)** ✅ 与基线期望完全一致
- **91 个 --dsw-alias-* token 全绿**（tokenFails: []）
- 卡片描边 = 1px rgb(40,46,59) ✅、侧栏描边 = 1px rgb(40,46,59) ✅、主按钮 rgb(123,144,255) ✅

### 像素层（同坐标对照纯皮肤期基线 m3-dark-home.png）
| 采样点 | 插件期深色 | 纯皮肤期基线 | Δmax | 判定 |
|---|---|---|---|---|
| canvas | rgb(29,34,44) | rgb(29,34,44) | 0 | ✅ |
| selected_row | rgb(44,51,65) | rgb(44,51,65) | 0 | ✅ |
| new_session_btn | rgb(247,255,255) | rgb(247,255,255) | 0 | ✅ |
| **sidebar_fill** | **rgb(243,247,254)** | rgb(23,27,36) | **220** | ❌ |
| **composer_card_center** | **rgb(255,255,255)** | rgb(29,34,44) | **226** | ❌ |

暗区像素占比：插件期 **74.19%** vs 基线 **98.15%**（官方深色 97.93%）。
证据：`dark-on.png`（肉眼可见左侧栏浅色带 + 输入卡白卡）、`dark-off.png`、`dark-defect-quant.json`

### 根因（分层计算值实证）
`body` 上：`--dsh-bg-subtle=#171B24` ✅ / `--dsh-bg-surface=#1D222C` ✅（原语深色覆盖生效）
但 `--dsh-sidebar-bg=#F3F7FE` ❌ / `--dsh-card-bg=#FFFFFF` ❌ → `--dsw-specific-sidebar-fill=#F3F7FE` ❌ / `--dsw-specific-input-major=#FFFFFF` ❌

链路：`skin.css:70-72` 把 `--dsh-sidebar-bg: var(--dsh-bg-subtle)` 定义在 **:root(html)**；
深色块 `skin.css:108` 是 **body[data-ds-dark-theme]**，只重定义 `--dsh-bg-subtle`，**未重定义 --dsh-sidebar-bg**；
插件的 `--dsw-specific-sidebar-fill: var(--dsh-sidebar-bg)` 落在 **body**（`theme.css:562`），
在 html 层解析 var() 时取到的是浅色原语 → body 上该别名恒为浅色。
证据：`dark-rootcause.json`

**归因边界（诚实标注）**：我未在纯皮肤期深色下复跑同一探针（需另起装 skin-center 的实例），
故**不下"插件引入 vs 既有皮肤缺陷"的定论**；只报告「插件期深色 ≠ 纯皮肤期基线，Δ220/226，远超容差，
且差异发生在插件自注入的 theme.css 作用域内」。归属由父代理在干净环境判定。

---

## 04-negative · 负控制（独立补强，不止 md5）

固定视口 1440×900、`reduced_motion=reduce`、注入动画禁用 CSS、等首屏稳定后截图。

| 对照 | 值 | 判定 |
|---|---|---|
| 全页 md5 ON | da4c787578f58a80dfd1565b773acc8a | — |
| 全页 md5 OFF | 537d25412fecc36c6e2a0b4405ebee89 | **不同** ✅ |
| 裁剪区 md5 ON（0,60,900,700） | 95cf74179e1dc9ac8733169dbe0cd9c5 | — |
| 裁剪区 md5 OFF | a6dc15aa322f8b46cb815d032e5a34dc | **不同** ✅ |
| DOM 负控制 | ON: styleEl T / attr T；OFF: styleEl F / attr F | **pass** ✅ |

→ 既排除了"像素差异由弹窗/动效造成"的假通过，也用 DOM 断言证明卸载是真的。
证据：`neg-control.json`、`neg-on.png`、`neg-off.png`

---

## 05-restore · profile 还原（四步）

| 步 | 内容 | 结果 |
|---|---|---|
| 1 | 配置比对 pre-backup | package.json / cordis.patch.yml / pnpm-lock.yaml **三份 IDENTICAL** |
| 2 | 删隐藏 lockfile + 插件副本 | `node_modules/dsh-theme` absent；`.pnpm/lock.yaml` absent；`.pnpm dsh-theme*` = 0 |
| 3 | `pnpm install` 对账 | `Already up to date`，438ms |
| 4 | 端口 | 19488 LISTENING = **0**；`dump-config` 中 dsh-theme 命中数 = **0** |

证据：`restore-verify.txt`、`static-checks.txt`

### 生产者静态声明的独立复核
| 声明 | 我复核 | 判定 |
|---|---|---|
| skin.css 未变 md5 5453C2BF…/11850B | 5453C2BF6718C4371D569E03FAE8896B / 11850 | ✅ |
| theme.css 25850B / 作用域 html[data-dsh-theme] | 25850B，20 处作用域头 | ✅ |
| theme.css 派生 11 条 | color-mix 派生 **11** | ✅ |
| 5 个插件文件 md5 | 与报告逐项相同 | ✅ |

---

## 独立发现（生产者未报告）

1. **【红】深色模式缺陷**——见 03-dark。生产者七条验收全部只覆盖浅色，深色零覆盖。
2. **【提示】acceptance.json 的非确定性字段**：`c7_paint_on/sidebar/cls` 含 shell 滚动条动效类
   （`quietBars` 有无取决于截图瞬间），跨次运行会变。当前不影响断言，但若将来把整份 JSON 纳入
   回归比对会引入 flaky。建议比对时排除该字段。
3. **【提示】verify_m5.py 的 5b 分支把状态还原走的是 `fetch POST`**（脚本末段），
   绕过了 client 半 store；该分支只用于收尾复位、不参与断言，故不构成假绿，但脚本头部
   注释「v2 一律走真实 UI」与末段实现不完全一致，留作可读性提示。
---

## 收工最终巡检（FINAL SWEEP）

```
  19488 LISTENING      : 0
  19387 LISTENING      : 1   (桌面 GUI，全程未触碰)
  IDENTICAL  package.json
  IDENTICAL  cordis.patch.yml
  IDENTICAL  pnpm-lock.yaml
  dsh-theme dir        : absent
  .pnpm/lock.yaml      : absent
  node_modules entries : 10   (pre-state = 10)
  state.json           : 存在
```

### 边界外残留（我无权处置，仅报告）
`C:\Users\pass\.dsh\dsh-theme\state.json` 存在——这是 host 半按设计写的状态文件，
落在 **$DSH_HOME 全局目录**，不在隔离 web profile 内，因此**不在我的可写边界内**，
我没有删除它（它与 desktop profile 共享 $DSH_HOME，删除属越界且可能影响桌面端）。
内容为 `{"enabled": <bool>, "updatedAt": ...}`（默认 true）。是否清理请父代理裁决。

### 后台任务
pwsh-135 / pwsh-148 / pwsh-156 三个隔离实例任务均已 completed（随端口释放而退出），无存活写者。
