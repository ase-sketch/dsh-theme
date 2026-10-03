# dsh-theme 交接文档（2026-10-03 · M1 完成后）

> 给下一个会话：本项目当前状态、继续施工所需的一切。读完这份直接开 M2，不需要重调研。
> 权威文档：docs/spec.md（范围）· docs/milestones.md（M1 ✅ / M2–M4 待做）· ARCHITECTURE.md（结构）· AGENTS.md（红线与命令）。

## 1. 一句话现状

**M1 已完成并自动化验收通过**：dsh-ui 皮肤 v0.1.0（23 个官方 token 映射 × 明暗双套）已上架 $DSH_HOME/skins/dsh-ui/，激活态已写入，皮肤在 GUI 实页验证可应用/可还原/深色正常。git 基线 7a09034。**下一步 = M2 全量 L1 token 映射。**

## 2. 路线（为什么是这个形态）

皮肤 = 纯资产目录（skin.json v2 + skin.css），由 skin-center（@linxin666/dsh-client-ui-skin-center，desktop profile 已装已启用）加载渲染。不写插件、不接 cordis 接线。旧「自建 bundle 插件」路线已废弃（client 半激活链路不通 + 皮肤中心已覆盖需求），证据：HANDOFF-M1.md（SUPERSEDED）+ .agents/retired/2026-10-03-m1-bundle/ + 归属笔记修订段（.agents/notes/implemented/feature/2026-10-03-project-scope-and-tech-route.md）。

## 3. 构建链（改动视觉的唯一合法路径）

```bash
# ① 改 E:\dsh-theme\mapping.json（dsh-ui token → 官方 --dsw-* alias，唯一手工维护物）
# ② 构建（从 E:\dsh-ui\preview\index.html :root 取值，生成 skin.css）
node scripts/build-skin.mjs
# ③ 同步上架（→ C:\Users\pass\.dsh\skins\dsh-ui\）
node scripts/sync-skin.mjs
```

红线：skin.css 是生成物**禁止手改**；视觉数值只准来自 dsh-ui preview :root；映射表指向不存在的 dsh token 时构建会报错（这是特性）。

## 4. 关键事实（已验证为真，勿重查）

- 官方 token 契约：skin-center 包内 contracts/official-tokens-v1.json（299 个 --dsw-*）；映射范例 = 包内 skins/blue-fantasy/skin.css。包路径：C:\Users\pass\.dsh\profiles\desktop\node_modules\@linxin666\dsh-client-ui-skin-center\
- 激活态：$DSH_HOME/skin-center-active.json，结构 { active, initialized, background? }；写入用**合并语义**（别整文件覆盖，background 段是用户的背景偏好）。
- 深色：选择器 body[data-ds-dark-theme]。
- 切换：skin-center 原子切换引擎，**不刷新页面不重启**；API = POST /api/skin-center/v2/active，body { "active": "<id>" 或 null }。
- 本地皮肤 hooks.mjs 不会被执行（信任模型），Deepy 状态机别指望它（二期另议）。
- 桌面 GUI（127.0.0.1:19387）要 token cookie，外部拿不到 token——**不要尝试硬闯桌面端**，用 §5 的隔离实例验收。

## 5. 验收方法论（M1 实测跑通的完整流程）

桌面端 GUI 有认证，验收用**隔离 web profile 实例**：

```powershell
# ① web profile 加 dep + bundle（参考 git 历史或直接复制本节）：
#    package.json dependencies 加 "@linxin666/dsh-client-ui-skin-center": "file:C:/Users/pass/.dsh/profiles/desktop/node_modules/@linxin666/dsh-client-ui-skin-center"
#    dsh.profile.bundles 加 "@linxin666/dsh-client-ui-skin-center"
$env:PATH='C:\Users\pass\AppData\Local\Programs\DeepSeek Harness\resources\runtime\pnpm;'+$env:PATH
cd C:\Users\pass\.dsh\profiles\web; pnpm install
# ② 起实例（后台），从输出抓 token URL
$env:PATH='...\resources\cli\bin;'+$env:PATH
dsh --profile web --port 19488 --no-open
```

Playwright 要点（脚本参考 .agents/shots/_e2e*.py，M1 实证可用）：
- **必须 $env:PYTHONUTF8='1'**（中文字面量选择器）。
- 系统 Python 3.14 自带 playwright + Edge 无头可用，不用装任何东西。
- 首屏弹窗「预览版说明」：pg.mouse.click(933, 577) 坐标关闭（text 选择器点了不掉）。
- 进设置：pg.mouse.click(56, 869)；进皮肤面板：(373, 308)。
- 卡片操作：DOM evaluate 找 textContent === 'dsh-ui Design Spec' 的叶元素 → scrollIntoView → 向上找含 button 的卡片容器 → 点「应用」（官方默认卡无按钮，用 API POST active:null 还原）。
- 验证断言：html[data-dsh-skin]、getComputedStyle(document.body).backgroundColor（light 期望 rgb(247,250,255)、dark 期望 rgb(19,22,29)——dark 可手动 setAttribute 试）。
- **验收后必须还原 web profile**：恢复 package.json / cordis.patch.yml 备份 → pnpm install → 停实例（job_kill）。

## 6. M2 施工要点（下一个里程碑）

1. 扩 mapping.json：对照 contracts/official-tokens-v1.json 的 299 个 token 与 blue-fantasy/skin.css 的映射模式，把 dsh-ui 色板语义覆盖到可映射的全部 alias（bg/border/brand/button/label/interactive 各组）。
2. 注意 blue-fantasy 的 --dsw-skin-scrim 模式（半透明面板）我们**不用**——dsh-ui 是纯色层次（蓝调画布 + 纯白卡片）。
3. 构建 + 同步 + §5 验收（重点：与 dsh-ui preview/index.html 截图逐项对照）。
4. M3 才碰 L2/L3（patches.css、预览图）；M2 只做 L1。

## 7. 架构边界：纯皮肤 vs 功能插件（二期选型）

当前交付是**纯皮肤**（纯资产目录，零可执行代码）：不出现在插件管理页、无自有开关、hooks.mjs 本地不执行。这是有意的取舍（视觉先行、一键还原）。二期要加功能（Deepy 状态机/设置开关）时二选一：
- **A. 皮肤上架官方市场**：官方市场字节校验的皮肤可执行 hooks.mjs，皮肤自包含可执行逻辑，保留皮肤中心一键管理。
- **B. 配套小插件**：皮肤纯管视觉，另写轻量 bundle 插件管功能；需解决旧 client 半激活失败问题，但可用 skin-center（能跑通的活样本，其 client inject 声明模式）对照调试。
决策未定，届时按需求选。纯皮肤能力边界对照表见会话记录或 spec。

## 8. 环境状态快照

- desktop profile：旧 dsh-theme bundle 已摘净（备份 .bak-20261004-cleanup-dsh-theme 在 profile 根）；skin-center 启用中；claude-style 行仍在（用户自行开关，与本皮肤互斥）。
- web profile：已还原干净（M1 验收后）。
- $DSH_HOME/skin-center-active.json：active=dsh-ui（用户的桌面 GUI 刷新即生效）。
- E:\dsh-theme：git master，基线 7a09034，工作区干净。.agents/shots/ 里是 M1 验收截图与脚本。
