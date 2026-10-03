# Agent Note: dsh-theme 立项范围与技术路线

Status: implemented — 用户 2026-10-03 拍板（工作区/范围/路线三选）后落盘

## Problem

dsh-ui 设计规范收口后，皮肤还只是文档与静态预览，DSH GUI 本体仍是原样。需要一个插件把规范真正注入 GUI。开工前必须锁定：插件放哪、第一期做什么、技术路线怎么走（尤其已存在功能庞大的 dsh-claude-style，路线选错会背上 1.18MB 的债）。

## Decision

用户拍板：① 新工作区 E:\dsh-theme；② 第一期静态皮肤先行（token 注入 + 组件覆盖 + 明暗切换），Deepy 状态机第二期；③「基于 dsh-claude-style 适配」。轻量立项流程（同 dsh-ui）。调研后③落地为**借形态不 fork**：bundle 声明 + cordis.patch.yml 插 client 行的形态参照它，功能代码零复用。调研实证：DSH 核心无皮肤注册表（全 @deepseek-ai 树无 skin.json/bodyAttr 消费方），skin.json 是 claude-style 私有约定；官方机制 = dsh.client 声明 + client 行进 roster，client JS 进页面自理。注入 CSS 的单一事实源 = dsh-ui/preview/index.html 的 :root 块（已过 token 闭合验证），构建期生成，禁止手抄。

## Alternatives considered

- **fork dsh-claude-style 换皮**：它是 1.18MB 生成 bundle + 几十个交互 feature（模型选择器/权限 UI/mascot 等），远超皮肤需求，且 npm 包不含 src/（需拉 GitHub 仓库），维护它的架构债远超重写一个小 client.js，否决。
- **写进 dsh-ui 工作区**：混淆「设计规范」与「插件实现」两条边界，违反新项目独立工作区约定，用户选新工作区。
- **第一期连 Deepy 状态机一起做**：事件钩子链路未验证过，叠加进第一期会让链路排障与视觉排障纠缠，用户选静态先行。

## Consequences

- M1（hello-skin）的首要价值是实测最小 bundle 在 0.1.7+ 的注入链路，再投视觉工作量。
- dsh-claude-style 与本插件互斥（同时只启用一个主题），写进 README。
- dsh-ui 的任何规范缺口回 dsh-ui 补，插件侧不绕（红线）。

## Confirmation

M1 验收（GUI 变色 + 卸载还原）直接验证路线可行性；M2 起注入 CSS 由构建脚本生成，红线「零手抄」由构建流程保证。

---

## 修订（2026-10-03 二轮调研）：技术路线推翻——改走 skin-center 皮肤目录

**原路线（自建 bundle 插件）已废弃。** M1 实践中装配四层全绿但 client 半始终未在页面执行（GUI 颜色从未变化，用户两次重启无效），且同轮深读发现决定性问题：**skin-center（@linxin666/dsh-client-ui-skin-center v0.4.4）才是本机皮肤生态的正解**——皮肤是纯资产目录（skin.json v2 + skin.css + 可选 patches.css），由它做唯一加载器/渲染器，用户皮肤放 $DSH_HOME/skins/<id>/ 即收录，应用/试穿原子切换、不刷新不重启；desktop profile 中它本就已启用（cordis 后层 disabled:false 覆盖前层 true）。官方 --dsw-* token 契约（299 个，contracts/official-tokens-v1.json）+ L2 语义属性 + L3 patches 覆盖能力完整。

**新路线**：皮肤目录（skins/dsh-ui/）+ 映射表（dsh-ui→--dsw-*，人工策展）+ 构建脚本生成 skin.css + 同步到 $DSH_HOME/skins/。原「借形态不 fork」与「静态先行」决策保留；原「bundle 骨架」决策被本条取代。旧 bundle 遗物退役至 .agents/retired/2026-10-03-m1-bundle/，profile 装配残留已清理（备份 .bak-20261004-cleanup-dsh-theme），HANDOFF-M1.md 标 SUPERSEDED 留证。

**落败路线教训**：① 调研期把 skin-center 误判为「另一个参考插件」而未读其 README/contracts，错过正解——「有现成就适配」的调研必须读完候选的文档而非只看 package.json；② 上一轮把「合批脚本里有自己的代码」当「已生效」的弱证据教训（HANDOFF-M1 §8）同样适用于路线选择。
