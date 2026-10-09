# dsh-theme 交接文档（2026-10-04 · M4 收口）

> 给下一个会话：本项目当前状态、继续施工所需的一切。M1–M3 已完成并自动化验收；M4 只剩用户真机验收（清单见 §9）。后续候选见 milestones.md 的 M5。
> 权威文档：docs/spec.md（范围）· docs/milestones.md（M1 ✅ / M2–M4 待做）· ARCHITECTURE.md（结构）· AGENTS.md（红线与命令）。

## 1. 一句话现状

**M1–M3 已完成并自动化验收通过；M4 收口自动化部分已完成**：README.md 落地、三件套补齐、M1 bundle 笔记归档、仓库清理（token 文件移除 + .gitignore）；隔离实例重跑三套验收脚本全绿（91 token × 明暗 / 组件层 24 断言 / 与 preview 基准逐项对照仅 1 项可接受偏差）。**剩余 = 用户真机验收（§9 清单）。**

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
- **验收后必须还原 web profile**：恢复 package.json / cordis.patch.yml 备份 → **删 node_modules/.pnpm/lock.yaml（pnpm 藏在这的 lockfile 副本会「复活」已移除的依赖，M2 实测被复活 3 次）** → 删 pnpm-lock.yaml → pnpm install → 停实例（job_kill 后还要确认端口真的空了，后台进程可能残留）。

## 6. M3 施工要点（下一个里程碑）

1. 先裁定 M2 留下的口子：font 全家 181 个（排版非色板，且 --dsw-font-* shorthand 会覆盖分项，映射需扩构建脚本合成 shorthand 或只映分项实测优先级）；elevation/shadow/corner-shape 值类型确认后可映 --dsh-shadow-*/--dsh-radius-*。
2. L2 语义选择器（data-dsh-surface/part）+ 必要 patches.css（L3）。
3. preview/light.jpg + dark.jpg 皮肤卡预览图。
4. 验收：与 dsh-ui preview/index.html 基准截图逐项对照（自动化 diff + 人工核看）；皮肤中心卡片显示预览图。

## 7. 架构边界：纯皮肤 vs 功能插件（二期选型）

当前交付是**纯皮肤**（纯资产目录，零可执行代码）：不出现在插件管理页、无自有开关、hooks.mjs 本地不执行。**定位 = 过渡路线**（用户 2026-10-03 明确）：终局是自研皮肤插件（M5，见 milestones.md），纯皮肤期的映射表/构建链/验收方法全部复用。插件期开工前置 = 根因自制 bundle client 半未激活问题（对照本机 skin-center 活样本）。分发期备选 = 官方市场上架（皮肤 hooks 路线）。

## 8. 环境状态快照

- desktop profile：旧 dsh-theme bundle 已摘净（备份 .bak-20261004-cleanup-dsh-theme 在 profile 根）；skin-center 启用中；claude-style 行仍在（用户自行开关，与本皮肤互斥）。
- web profile：已还原干净（M2 验收后，含 .pnpm/lock.yaml 隐藏副本已清）。
- $DSH_HOME/skin-center-active.json：active=dsh-ui（用户的桌面 GUI 刷新即生效）。
- E:\dsh-theme：git master。.agents/shots/ 里是 M1+M2 验收截图与脚本（M2 脚本 _m2_verify.py 可直接复跑做回归）。

## 9. M4 真机验收清单（唯一需要用户在场的步骤）

桌面 GUI 有 token 认证，代理无法自动验收；以下是逐项可勾的清单（3 分钟）：

1. **刷新桌面 GUI**（皮肤文件已同步、激活态未变，刷新即生效）。
2. **看整体观感**：蓝调画布 + 纯白卡片；左侧栏淡蓝衬底、右侧一条细分隔线；输入卡是 20px 大圆角白卡、聚焦时描边变品牌蓝并有阴影。
3. **主按钮**：侧栏「新会话」是实心品牌蓝（不是描边样式）。
4. **选中态**：当前会话条目底色为浅蓝 + 左缘 2px 品牌蓝竖条。
5. **深色切换**：设置 → 通用设置 → 外观 → 深色；确认背景变蓝黑、卡片变深灰蓝、无发白残留。
6. **设置页**：面板 20px 圆角、卡片白底细描边、控件正常可点。
7. **切回官方默认**：设置 → 皮肤 → 官方默认卡「恢复默认」→ 当场还原；再点 dsh-ui 的「应用」→ 当场变回。
8. **日常使用一轮**：开新会话发一条消息，看气泡/代码块/工具行观感是否可接受（这是唯一自动化覆盖不到的区域，若有不顺眼处记下来回传）。

**发现问题怎么回传**：说明「哪一步 + 期望 vs 实际」，附截图更好；代理可据此补断言、写进验收脚本再修。
