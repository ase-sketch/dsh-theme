# Agent Note: M5 bundle 插件落地（plugins/dsh-theme）

Status: implemented — 2026-10-10 web profile 自动化验收通过（生产者自检 + 独立复验双轮）+ 用户 desktop 真机验收确认通过

## Problem

纯皮肤路线（skin-center 皮肤卡）无法承载「自有设置开关 + 二期事件钩子」，终局必须是自研 bundle 插件。但 M1 的 bundle 尝试静默失败过（根因：ctx.effect 误用，见归属笔记 2026-10-03-project-scope-and-tech-route 修订三），且纯皮肤期的视觉有两层对 skin-center loader 的隐式依赖，插件自注入时这两层都不存在。

## Decision

plugins/dsh-theme/ = host/client 双半 bundle（本地自用，desktop profile 待机安装）。
- **client 半**：ctx.effect body 内安装、return 卸载（红线）；顶层零声明；`ctx.slots.inject("settings.section")` 注册 React 开关面板；自带**最小语义锚点适配器**（MutationObserver 打 3 个 theme.css 实需锚点）。
- **host 半**：自建 HTTP 路由（/api/dsh-theme/state + /theme.css），状态原子写 $DSH_HOME/dsh-theme/state.json，默认 ON。
- **build-skin.mjs** 额外产出 assets/theme.css（自包含）：复刻 skin-center loader 的 transform——选择器作用域重写 + 裸 :root token 重置/克隆 + 未声明 token 的 color-mix 派生 + **var() 别名在深色 body 作用域重声明**（从 preview :root 现算 9 条，不手抄，空集即构建报错）。
- **互斥**：插件激活时经 skin-center v2 API 置 active=null（启动图判存在性，无竞态）。
- 开关三层语义分离：loader 级 disabled（静态值）/ host 级落盘 / client 级只发请求。

## Alternatives considered

- **官方 settings 服务做持久化**（能力调查 Q4 的第一顺位）：client 侧要经 configForms + remote.settings.mutate 走 RPC，链路长、注入多；自用形态下可测性优先，选自建路由。迁移官方 settings 留作待复核项。
- **原样注入 skin.css**（不复刻 loader 变换）：实测视觉与纯皮肤期不一致（L2 规则前提缺失 + 深色别名锁死浅色），被验收抓红后否决。
- **照搬 skin-center 全量语义适配器（24 条规则）**：超出本主题实需，只复刻 3 个实需锚点。
- **插件激活时直接写 skin-center-active.json**：越权写别的插件的状态文件；改用其既有 v2 API（但该路径尚未在 skin-center 共存下实测，待复核）。

## Consequences

- M5 验收门禁从此含**深色必备项**与**像素采样**（防「计算绿但不可见」假绿——shell 不透明白层盖 body，截图必须 ON/OFF md5 不同才有效）。
- 皮肤卡保留作回退；两条注入链并存、同一时刻只许一条生效。
- file: 依赖是复制语义：改插件源码必须在各 profile 重装才生效。
- 已知遗留：互斥 API 路径未实测；状态文件在 $DSH_HOME 全局目录（跨 profile 共享，自用可接受）；desktop 侧运行留痕缺失（插件回到 disabled:true 待机、`$DSH_HOME/dsh-theme/state.json` 未落盘，跨重启持久化目前仅有 web 侧直证）；官方市场上架留后续。

## Confirmation

自动化验收双轮制：生产者跑 .agents/tmp/m5-plugin/（verify_m5 七条 + parity_m3 17 项 + pixel_acceptance）；独立验收方从零重装复跑 + 深色专项 + 负控制（.agents/tmp/m5-verify/REVERIFY-report.md 全绿）。复跑入口与起停流程见 HANDOFF.md §8。desktop 侧由用户按 §9 清单真机验收，2026-10-10 确认通过。
