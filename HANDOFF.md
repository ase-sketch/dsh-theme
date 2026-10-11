# dsh-theme 交接文档（2026-10-10 晚 · M5 落地 + desktop 待机装配）

> 给下一个会话：本项目当前状态、继续施工所需的一切。
> 权威文档：docs/spec.md（范围）· docs/milestones.md（里程碑）· ARCHITECTURE.md（结构）· AGENTS.md（红线与命令）。
> 本版取代 2026-10-10 午间的「M4 收口 + M5 开工前置」版——M5 已施工完毕并通过 web profile 双轮验收。
> 2026-10-11 修订：M5 收口口径全量同步（desktop 真机验收经用户确认通过），各文档「在建未验收 / 待真机验收」措辞已改齐。

## 1. 一句话现状

M1–M5 全部完成并验收（M5 = web 双轮自动化 + 用户 desktop 真机确认）。**M5 插件已装进 desktop profile（disabled:true 待机）**，重启 DSH 后在插件页启用即用。下一期 = M6 Deepy 状态机动画。

## 2. M5 交付物（plugins/dsh-theme/）

| 文件 | 职责 |
|---|---|
| package.json | bundle 声明三要素（exports["."]/["./client"]/dsh.bundle.patch/dsh.client），peerDeps react ^18.2.0 |
| host/index.js | 开关持久化：自建路由 /api/dsh-theme/state（GET/POST）+ /theme.css；原子写 $DSH_HOME/dsh-theme/state.json，默认 ON |
| lib/client.js | 样式注入 + 设置面板（settings.section，React）+ 语义锚点适配器 + skin-center 互斥调用；顶层零声明 |
| assets/theme.css | **构建生成物**（禁手改）：build-skin.mjs §M5 段产出的插件版自包含 CSS |
| cordis.patch.yml | insert 行，disabled 只用静态 true/false |

构建链不变：`node scripts/build-skin.mjs` 同时产出 skin.css（皮肤卡用）与 theme.css（插件用）；**构建必须经 pwsh 或 run_code 跑**——bash 工具（MSYS2）的 /e/ 是沙箱投影，看不到 E:\dsh-ui。

## 3. 验收证据（分级标注）

- **已验证（web profile 隔离实例，双轮制）**：① D4 探针门（三行断言 + 负控制 + console 零错，.agents/tmp/m5-probe/）；② 生产者七条自检（.agents/tmp/m5-plugin/acceptance-report.json）；③ 独立验收方从零重装复跑全绿 + 深色专项 + 负控制（.agents/tmp/m5-verify/REVERIFY-report.md）。
- **返工记录**：独立验收首轮抓红深色模式（var() 别名在 html 层求值锁死浅色，侧栏/输入卡仍亮）；修复 = 把 9 条 var() 别名在深色 body 作用域重声明（从 preview :root 现算）；复验 7 采样点 Δ=0、暗区占比 98.21%（基线 98.15%）、浅色截图 md5 零回归、克隆完备性 needClone==cloned。
- **已验证**：desktop profile 运行生效（2026-10-10 用户真机确认通过；安装副本与源逐字节一致为静态核验）。
- **未验证**：skin-center 共存下的互斥 API 路径（代码已写、未实测）；desktop 侧 state.json 未落盘（跨重启持久化目前仅有 web 侧直证）。

## 4. 三条施工红线（已进 AGENTS.md，这里留索引）

① ctx.effect：body 里安装、return 卸载函数（M1 根因）；② client 半顶层零声明（合批共享作用域）；③ host 半可空但必须存在。详见 AGENTS.md「M5 插件期」。

## 5. 教训沉淀（本轮新增）

- **「计算绿 ≠ 可见」**：shell 自带不透明白层（#root/.BynINW_frame）盖住 body，body 背景永不入像素。视觉验收必须有像素采样 + ON/OFF 截图 md5 对照。M1 的 falsify-fixedonly.png 因此不能作视觉证据（归属笔记已更正）。
- **var() 在声明所在元素求值**：:root 上的别名会锁死浅色，深色块只重定义原语传不进去——别名必须与深色原语同作用域重声明。
- **file: 依赖是复制语义**：改插件源码后必须重装（各 profile 各自一份副本）。
- **DSH 会往 cordis.patch.yml 追加托管行**（ui-settings-general 等设置持久化）：还原必须用备份整体覆盖，只删插件行会留残留。
- **theme.css 口径**：25259 = 字符数（浏览器 styleLen），26412 = 文件字节数（581 个非 ASCII 字符），比对时别混。

## 6. desktop 装配现状

- desktop profile：package.json 加 `"dsh-theme": "file:E:/dsh-theme/plugins/dsh-theme"` + bundles 追加；cordis.patch.yml 末尾追加 `ui-skin-dsh-theme / disabled: true` 覆盖行（待机）；pnpm install 已完成，安装副本与源逐字节一致。备份在 .agents/tmp/m5-desktop-install/backup-*/。
- **启用方法（用户手动）**：重启 DSH → 设置 → Plugins → 启用 dsh-theme → 设置页出现「dsh-theme 主题」面板（默认 ON）。
- 插件激活时会经 skin-center v2 API 把皮肤卡切回官方默认（防双注入）；皮肤卡保留作回退。
- 桌面 GUI（19387）有 token 认证，代理**不要硬闯**；重启由用户本人执行。

## 7. 残留风险与待复核决策点

1. 互斥路径（client → skin-center v2 API）未在真实共存下实测；若失效，手动把皮肤卡切官方默认即可，不影响插件本身。
2. 持久化走 host 自建路由；迁移官方 settings 服务留后续。
3. 状态文件在 $DSH_HOME/dsh-theme/（跨 profile 共享，自用可接受）。
4. 语义适配器选择器与 skin-center 同源同险（shell 升级需回归）。
5. .agents/tmp/ 下本轮全部实验证据**未跟踪**；核心结论已沉淀进归属笔记修订三 + M5 决策笔记（.agents/notes/implemented/feature/2026-10-10-m5-bundle-plugin.md），原始产物可按需归档或清理。
6. 验收脚本（verify_m5.py 等）现居 .agents/tmp/，若要长期复跑应迁到 .agents/shots/ 并跟踪。

## 8. 隔离实例起停与还原方法论（沿用上版，实测有效）

- 起实例：`dsh.cmd --profile web --port 19488 --no-open`（后台任务）；Playwright 设 `PYTHONUTF8=1`；首屏「预览版说明」弹窗用坐标 `pg.mouse.click(933,577)` 关闭。
- 还原四步：恢复 package.json / cordis.patch.yml / pnpm-lock.yaml 备份（**整体覆盖**）→ 删 node_modules/.pnpm/lock.yaml 隐藏副本 → pnpm install → 确认 19488 端口释放 + dump-config 零命中。
- 重型验证互斥：同一时刻只跑一份隔离实例。

## 9. 真机验收清单（M4 皮肤卡 + M5 插件）—— ✅ 2026-10-10 用户确认通过（保留作回归清单）

**A. 皮肤卡（M4，如已验可跳）**：刷新 GUI → 蓝调画布/白卡/实心主按钮/选中态竖条 → 深色切换无发白残留 → 切回官方默认当场还原。

**B. 插件（M5，新）**：
1. 重启 DSH（装配重启后才生效）。
2. 设置 → Plugins：列表出现 dsh-theme，启用它。
3. 设置页出现「dsh-theme 主题」面板，开关默认 ON；页面当场变 dsh-ui 视觉（皮肤卡应已被自动切回官方默认）。
4. 拨 OFF：当场还原官方外观；拨回 ON：当场恢复。
5. 重启 DSH 再进：开关状态保持（持久化）。
6. 深色切换：侧栏变深（无浅色带）、输入卡变深色卡。
7. 回退演练：设置 → Plugins 禁用 dsh-theme → 重启后完全官方；皮肤卡可重新启用。

**发现问题怎么回传**：说明「哪一步 + 期望 vs 实际」，附截图更好；代理可据此补断言、写进验收脚本再修。
