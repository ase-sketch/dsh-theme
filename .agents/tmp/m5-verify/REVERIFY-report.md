# M5 复验报告（返工后 · 第 2 轮）

复验方：未参与产出的独立子代理 ｜ 日期 2026-10-10 ｜ 环境：隔离 web profile `C:\Users\pass\.dsh\profiles\web\`，端口 19488
桌面 GUI 19387 全程未触碰。证据目录 `04-reverify/`（按父代理提示从 `03-dark/` 复制脚本再跑，避免互相覆盖）。

## 总判定：**全绿** ✅

深色缺陷已修复且**机制层可证**；浅色无回归；负控制成立；还原干净。

---

## 1. 从零重装 ✅

profile 起点干净（deps={} / patch=[] / 无 node_modules/dsh-theme / 19488 无监听）。
写 file: 依赖 + cordis.patch.yml insert → `pnpm install` exit 0，`Packages: +1`，566ms。

**file: 复制语义 + 版本一致性**（安装副本 vs 源 `plugins/dsh-theme`，5/5 逐字节一致）：

| 文件 | 源 md5 | 安装副本 md5 | 一致 |
|---|---|---|---|
| package.json | AB6C4930C73CF78A26607F6DC1424E1B | 同 | ✅ |
| cordis.patch.yml | 22004600178771908D36E71FC0C80C92 | 同 | ✅ |
| host/index.js | B4CE2A071EC1D4A2A0519CDDB2A4D011 | 同 | ✅ |
| lib/client.js | 1F342EDA3EF133C5E6118FBB7BF4575F | 同 | ✅ |
| **assets/theme.css** | **0978542C3DB55ED4C97E8E2CC0128EB5** | **同** | ✅ |

证据：`04-reverify/install-hashes.txt`

### 关于报告字节数的更正（非缺陷，仅口径）
父代理报「theme.css 0978542c…，25259B」。我实测：**文件 26412 字节 / JS 字符长 25259**。
差额 1153 = 581 个非 ASCII 字符的多字节编码（26412 − 25259 = 1153）。
两个数都对，只是口径不同——**25259 是字符数（也是浏览器里 styleLen 的值），26412 是字节数**。
证据：`04-reverify/alias-derivation-check.json` 的 `fileBytes/jsCharLen/nonAsciiChars`

---

## 2. 浅色回归 ✅

| 脚本 | 我跑出来的值 | 与首轮/生产者比对 |
|---|---|---|
| verify_m5.py 七条 | 全绿；console errs 0 / pageerrors 0 / 4xx 0；**styleLen 25259**（= 新 theme.css 字符长，正确）；token 8 项全中；sidebar rgb(243,247,254) + 1px rgb(226,232,242) | 与首轮逐字段一致，仅 styleLen 24745→25259（预期，因新增深色块） |
| verify_m5.py OFF | attr F / style F / len 0 / checked F / sidebar rgb(249,250,251) | 与首轮一致 |
| verify_m5.py 持久化 | ON→attr T style T；OFF→attr F style F | 一致 |
| verify_m5.py 截图 md5 | on da4c7875… / off 537d2541… / on-restored da4c7875… / on-after-reload da4c7875… / off-after-reload 537d2541… / settings-panel 416ce0db… | **与首轮 6 张全等** → 浅色像素零回归 |
| parity_m3.py | **17/17 OK，FAILS: []**；四个 found 全 True | 一致 |
| pixel_acceptance.py | 4 点全 differ；diffPct 22.92；brandBlue 2316/0；sidebarTint 56949/57584 | **逐位相同** |

证据：`04-reverify/{verify_m5,parity_m3,pixel_acceptance}.stdout.log`

---

## 3. 深色模式 ✅ **修复确认**

### 3.1 计算值层
- body 背景 **rgb(19,22,29)** ✅ 命中基线
- **91 个 --dsw-alias-* token 全绿**（tokenFails: []）
- 卡片 bg **rgb(29,34,44)** ✅ / 侧栏 bg **rgb(23,27,36)** ✅（修复前分别是 rgb(255,255,255) / rgb(243,247,254)）
- 卡片描边 1px rgb(40,46,59) ✅、侧栏描边 1px rgb(40,46,59) ✅、主按钮 rgb(123,144,255) ✅
- consoleErrors [] / pageerrors []

### 3.2 像素层（同视口 1440×900、同坐标 vs 纯皮肤期基线，容差 ±2）

| 采样点 | 修复前 | **修复后** | 基线 | Δmax（后） | 判定 |
|---|---|---|---|---|---|
| sidebar_fill | rgb(243,247,254) | **rgb(23,27,36)** | rgb(23,27,36) | **0** | ✅ |
| sidebar_fill_2 | rgb(243,247,254) | **rgb(23,27,36)** | rgb(23,27,36) | **0** | ✅ |
| composer_card_center | rgb(255,255,255) | **rgb(29,34,44)** | rgb(29,34,44) | **0** | ✅ |
| composer_card_2 | rgb(255,255,255) | **rgb(29,34,44)** | rgb(29,34,44) | **0** | ✅ |
| canvas | rgb(29,34,44) | rgb(29,34,44) | rgb(29,34,44) | 0 | ✅ |
| new_session_btn | rgb(247,255,255) | rgb(247,255,255) | rgb(247,255,255) | 0 | ✅ |
| selected_row | rgb(44,51,65) | rgb(44,51,65) | rgb(44,51,65) | 0 | ✅ |

**7/7 采样点 Δ=0**（修复前 2 个点 Δ=220/226）。

暗区像素占比：修复前 **74.19%** → 修复后 **98.21%**，基线 98.15%（官方深色 97.93%）。
修复后与基线的 0.06pp 差属动效/抗锯齿噪声，**方向正确且量级远小于修复前的 24pp 缺口**。

目视确认 `04-reverify/dark-on.png`：左栏浅色带与白卡**均已消失**，与 `m3-dark-home.png` 视觉一致。

### 3.3 机制层（修复为什么成立）
`04-reverify/dark-rootcause.json`：`body` 上
`--dsh-sidebar-bg=#171B24` ✅（修复前 #F3F7FE）、`--dsh-card-bg=#1D222C` ✅（修复前 #FFFFFF）、
`--dsw-specific-sidebar-fill=#171B24` ✅、`--dsw-specific-input-major=#1D222C` ✅。
即 var() 别名现在在 **body 作用域重新求值**，深色原语能正确传导。

### 3.4 修复完备性（我补的独立检查，生产者未自证）
不满足于「9 条够用」，我枚举了**全集**：
- 深色 body 块重定义的原语 = 22 条
- 浅色 :root 中「引用这些原语的别名」 = **恰好 9 条**
- 深色克隆块实际克隆 = **恰好同样 9 条**
- `missingClone: []`、`extraCloned: []` → **needClone == cloned，修复是完备的，不是凑数**

且 9 条别名的 var() 指向与 `preview :root` **逐条一致**（`allMatchPreview: true`），
印证生产者「从 preview 现算不手抄」的声明——不是硬编码数值。
证据：`04-reverify/alias-completeness.json`、`alias-derivation-check.json`

---

## 4. 负控制 ✅

固定视口 + reduced_motion + 动画禁用 CSS：

| 对照 | 值 | 判定 |
|---|---|---|
| 全页 md5 ON | da4c787578f58a80dfd1565b773acc8a | — |
| 全页 md5 OFF | 537d25412fecc36c6e2a0b4405ebee89 | **不同** ✅ |
| 裁剪区 md5 ON (0,60,900,700) | 95cf74179e1dc9ac8733169dbe0cd9c5 | — |
| 裁剪区 md5 OFF | a6dc15aa322f8b46cb815d032e5a34dc | **不同** ✅ |
| DOM 负控制 | ON: styleEl T / attr T；OFF: styleEl F / attr F | **pass** ✅ |

### 4b. loader 禁用态（check_disabled.py）
bootIds [] / htmlHasAttr false / styleElExists false / sidebarBg rgb(249,250,251) / **hostRouteStatus 404** / consoleErrors 1（404 本身）。
截图 md5 537d2541… 与 ON 态 da4c7875… 不同。证据：`04-reverify/check_disabled.stdout.log`

---

## 5. 还原 ✅

| 步 | 内容 | 结果 |
|---|---|---|
| 1 | 配置比对 pre-backup | package.json / cordis.patch.yml / pnpm-lock.yaml **三份 IDENTICAL** |
| 2 | 残留 | `node_modules/dsh-theme` absent；`.pnpm/lock.yaml` absent；`.pnpm dsh-theme*` = 0 |
| 3 | `pnpm install` | `Already up to date`，402ms |
| 4 | 端口/配置 | 19488 LISTENING = **0**；dump-config 中 dsh-theme 命中 = **0**；node_modules 10 项 = pre-state |

证据：`05-restore/restore-verify-round2.txt`

---

## 6. 本轮新发现（均非红）

1. **【口径】字节数 vs 字符数**：报告「25259B」实为字符数；文件真实字节 26412。两数都对，建议报告里写清口径，避免下游误判。
2. **【已修正】06-dark-fix/ 不存在**：父代理说「缺陷态量化 JSON 在 06-dark-fix/ 有备份」，实测该目录**不存在**。
   但原始 `03-dark/dark-defect-quant.json`（4416B）**完好未被覆盖**，缺陷态基线并未丢失。
   被覆盖的是 `dark-on.png`/`dark-off.png`/`dark-on-restored.png`/`dark-verify.json`（现为修复后内容）。
   我本轮已按提示先复制到 `04-reverify/` 再跑，未再发生覆盖。
3. **【提示】DSH 会往 cordis.patch.yml 追加托管行**：禁用测试后文件多出
   `- id: ui-settings-general ... welcomeNoticeVersion` 与 `- id: ui-theme ... preference: light`。
   这是 DSH 自身写的设置持久化，**不是插件行为**；还原时已用 pre-backup 覆盖回干净态（现为 `[]`）。
   提示后续验收注意：**还原必须用备份覆盖，不能只删插件那两行**，否则会留下托管行残留。

---

## 结论
深色缺陷修复**成立且完备**，浅色零回归，负控制与还原均通过。
我这一轮的判定：**全绿，可交付**。上一轮的红已闭合。
