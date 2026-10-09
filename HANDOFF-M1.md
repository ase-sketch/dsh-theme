> ⚠️ **SUPERSEDED（2026-10-03）**：自建 bundle 插件路线已废弃，新路线 = skin-center 皮肤目录（见 docs/spec.md 与本文件 §9 之后的调查）。本文件仅作失败证据留存，勿按此施工。

# M1 交接文档（2026-10-03）

> 给下一个接手 M1「GUI 变橙」的 AI。
> **当前状态：M1 未达成验收点。** 装配层已全部查实通过，剩余问题在**运行时最后一跳**（client 半被服务了，但没有在页面里执行生效）。
> 用户已知：两个主题插件（dsh-claude-style / dsh-client-ui-skin-center）**都没有开启**，排查不得以「主题冲突」为前提。

---

## 1. 一句话现状

bundle 声明、profile 装配、包安装、client 脚本被服务端投递——**这四层全部已验证为绿**；
但页面里看不到橙色，说明 **client 半拿到了代码却没跑起来，或跑了但样式没生效**。

---

## 2. 已确认为真的事实（不要重查）

### 2.1 代码形态（照抄这两个已装的主题包即可，它们在本机跑得通）

参考物（**本机已装、已验证可用**）：

- `C:\Users\pass\.dsh\profiles\desktop\node_modules\dsh-claude-style`
- `C:\Users\pass\.dsh\profiles\desktop\node_modules\@linxin666\dsh-client-ui-skin-center`

两者的共同契约：

| 项 | 值 |
|---|---|
| `exports["."]` | host 半入口（**必须有**，哪怕是空的） |
| `exports["./client"]` | 浏览器半入口 |
| `dsh.bundle.patch` | 指向 `cordis.patch.yml` |
| `dsh.client` | `{ platform: "web", inject: [] }` |
| `cordis.patch.yml` | `- insert: [{ id, name: "<包名>" }]` |
| client 形态 | `window.__ModuleLoader__.load({ id, factory })`，factory 接 `require`、`return module.exports` |
| 卸载还原 | `ctx.effect(() => teardown, label)`——逆操作**必须登记给宿主** |

**踩过的坑（已修）**：纯 client 包不写 host 半 → 加载器 `import('dsh-theme')` 抛 `ERR_PACKAGE_PATH_NOT_EXPORTED` → 整条 roster 行 `failed to import`。host 半现在是 `host/index.js`（空壳，只 export name/inject/apply）。

### 2.2 装配状态（desktop profile，全部已核实）

```
C:\Users\pass\.dsh\profiles\desktop\
├─ package.json          dependencies["dsh-theme"] = "file:E:/dsh-theme"  ✅
│                        dsh.profile.bundles 含 "dsh-theme"                 ✅
├─ cordis.patch.yml      - id: ui-skin-dsh-theme
│                          name: dsh-theme        ← 手工补的，GUI 不写这个
│                          disabled: false                                  ✅
├─ pnpm-lock.yaml        已含 dsh-theme 条目                                  ✅
└─ node_modules/dsh-theme/  host/index.js · lib/client.js · cordis.patch.yml · package.json  ✅
```

> 备份：`package.json.bak-m1-20261003-184840`、`cordis.patch.yml.bak-m1-20261003-184840`（同目录）。

### 2.3 客户端逻辑（已单测覆盖，3/3 绿）

`E:\dsh-theme\lib\client.js`：建 `<style id="dsh-theme-style">` → 设 `html[data-dsh-theme] body { background-color: rgb(255 138 0) !important; }` → `ctx.effect` 登记拆除。
```
node --test test/client.test.mjs   # 3 passed
```

---

## 3. 已排除的假设（省得再走一遍）

| 假设 | 排除依据 |
|---|---|
| 没重启 | DSH 进程启动时间 19:25:00，用户在这之后确认过仍无变化 |
| 没装进 profile | node_modules 四件套齐全，lockfile 有条目 |
| patch 行没被加载器接受 | `dsh --profile web --dump-config` 里有 `# == dsh-theme` 段和该行 |
| client 脚本报 import 错误 | 修复后启动日志**无** `failed to import`（之前明确出现过，已消失） |
| 主题互相冲突 | 用户明确说两个主题都没开 |
| desktop profile 归 CLI 管所以没生效 | desktop 由 Electron 独占，但**文件改动对 Electron 同样生效**，这不是原因 |

---

## 4. 未查明的部分（真正的战场）

**唯一没被证实/否掉的环节：client 半在浏览器里的执行。**

已做到的最后一步（web profile 实跑，非静态配置）：

1. 启动 `dsh --profile web --port 19488 --no-open`，无启动错误；
2. 首页 HTML 的 plugin 预加载批次里**出现了** `dsh-theme/client.js`；
3. 按该批次 URL 取回的合批脚本（`plugins/??a,b,c&rev=...`，约 10.4MB）**含** `__ModuleLoader__`、探针色、`ctx.effect`。

⚠️ **注意第 3 点的陷阱**：那是**整个批次合并后的巨型脚本**，里面同时含几十个别的插件的代码。**在它里面 grep 到自己那几行，不等于自己的 factory 真的被调用了。** 我上一轮就是在这里下了过早的结论。

所以真正要查的是这几条，**建议按顺序**：

1. **roster 里这行到底有没有被 web 层激活**
   在浏览器控制台（或用 node + playwright，但本机 python 无 playwright，需先装）看：
   ```js
   // 页面加载后执行
   document.documentElement.hasAttribute('data-dsh-theme')   // 期望 true
   document.getElementById('dsh-theme-style')                   // 期望非 null
   getComputedStyle(document.body).backgroundColor              // 期望 rgb(255, 138, 0)
   ```
   三条全 false/未变 = client 半**没执行**；属性有了但颜色没变 = 样式被宿主 `!important` 压过或选择器不匹配。

2. **对照实验：把探针改成最不可能被压过的形式**
   例如 `html[data-dsh-theme] * { outline: 3px solid rgb(255 138 0) !important; }`，
   或直接 `document.title = 'dsh-theme-alive'`。先证明「代码执行了」，再谈样式。

3. **确认 host 半真的 mount 成功**（而不只是能 import）
   启动日志里搜 `ui-skin-dsh-theme`；若 host 半 apply 抛错，client 半可能一并被跳过。

4. **desktop 与 web 的差异**
   上述全部在 **web profile** 验证过，desktop 尚未单独验证过。desktop 走 Electron，可能有额外的 client 装配条件（如 `dsh.client.platform`、窗口类型、preload 时机）。

---

## 5. 复现命令（可直接跑）

```powershell
# 装配断言（静态配置层）
$env:PATH='C:\Users\pass\AppData\Local\Programs\DeepSeek Harness\resources\cli\bin;'+$env:PATH
dsh --profile web --dump-config | Select-String dsh-theme

# 端到端：起隔离的 web profile（**不要动 desktop**，Electron 独占它）
$env:PATH='C:\Users\pass\AppData\Local\Programs\DeepSeek Harness\resources\runtime\pnpm;'+$env:PATH
cd C:\Users\pass\.dsh\profiles\web
pnpm install
# 先往 web profile 的 package.json 加 dep + bundles，并往 cordis.patch.yml 写带 name 的行
dsh --profile web --port 19488 --no-open
# 启动后它会打印 http://127.0.0.1:19488/?token=XXXX ，先访问一次该 URL 换 cookie，
# 再取页面里那个 plugins/??...&rev=... 批次 URL（注意 &amp; 需解码成 &）
```

> web profile 用完记得还原：`dependencies` 删 `dsh-theme`、`bundles` 删 `dsh-theme`、`cordis.patch.yml` 写回 `[]`、删 `node_modules/dsh-theme`、释放 19488 端口。
> （上一轮已还原干净，可直接用。）

---

## 6. 项目约束（别踩红线）

- **视觉数值唯一来源 = `E:\dsh-ui\preview\index.html` 的 `:root` 块**；插件里禁止手抄 hex/px。
  当前 `lib/client.js` 里的 `rgb(255 138 0)` 是 **M1 探针，故意违规**，M2 必须换成构建脚本生成。
- 不改 DSH 本体、不改 dsh-ui、不 fork dsh-claude-style。
- 装了任一主题后 README 要写明与 dsh-claude-style 互斥。
- 决策笔记在 `.agents/notes/implemented/feature/`，改动前先读**归属笔记**。

---

## 7. 文件清单

```
E:\dsh-theme\
├─ package.json            bundle 声明（含 exports["."] 与 exports["./client"]）
├─ cordis.patch.yml        bundle patch（插一行 {id, name}）
├─ host/index.js           host 半空壳（必须有）
├─ lib/client.js           浏览器半：注入橙色探针 + ctx.effect 拆除
├─ test/client.test.mjs    3 用例，覆盖注入与还原
├─ AGENTS.md               Quick Commands（已更新为实际命令）
├─ ARCHITECTURE.md         结构地图
├─ docs/spec.md            范围权威
├─ docs/milestones.md      M1–M4 里程碑与验收
└─ .agents/notes/archived/feature/2026-10-03-m1-bundle-wiring.md（2026-10-04 随路线废弃归档）
```

---

## 8. 我的失误（交接人请注意）

前一轮我把「合批脚本里 grep 到自己的代码」当成了「client 半已生效」的证据，属于**用弱证据下了强结论**，导致让用户白重启了两次。

接手时请坚持：**每一步的证据必须能排除其他解释**，尤其不要把「文件里有我的代码」等同于「我的代码被执行了」。


---

## 9. 追加线索（2026-10-03 主会话调研，下轮主代理用）

### 9.1 已排除：包装形态不对
逐字符对比本机能跑通的 dsh-claude-style v0.10.3 的 lib/client.js 包装——`window.__ModuleLoader__.load({ id: '<包名>', factory: (require) => { ...; exports.apply = apply; return module.exports } })`，与 dsh-theme 的写法**完全一致**。「wrapper 不对」这条假设排除。

### 9.2 新发现：动态 client 半的执行模型（读 asar 内 dsh-cordis-client-runner 源码）
client-runner 自己的 browser 半（asar 内 @deepseek-ai/dsh-cordis-client-runner/lib/client.js）揭示：动态 client 包的源码被当作 async 函数体执行，**闭包陷阱遮蔽了 setTimeout/setInterval/fetch/require**——命中即抛教学式报错（如 "require is not available in a dynamic client half"）。dsh-theme 当前探针不用这些 API，不受影响；但 **M2+ 写真实皮肤时严禁在 client 半用 timer/fetch/require**（timer 要声明 inject: ['timer']，网络走 host 半 harness.handle + host.call）。

### 9.3 重要纠错：「本机 python 无 playwright」是误判
系统 Python 3.14.1 自带 playwright 且 Edge 无头可用（dsh-ui 的 .agents/shots/verify.py 一直在用）。§4 第 1 步的浏览器三行检查**不需要装任何东西**，直接：
```python
from playwright.sync_api import sync_playwright
# 打开 http://127.0.0.1:19387 （desktop GUI，注意可能带 token 参数）
```
desktop GUI 也能用 webapp-testing / browser-skill / computer-use-browser 技能驱动。

### 9.4 剩余假设排序（按可能性）
1. **roster 行在 web 层没被激活**（配置层有行 ≠ 前端加载）：合批脚本里有代码 ≠ factory 被调用（§8 的教训）。用 9.3 的方法在活页面上跑 §4.1 三行检查，一步定位。
2. host 半 mount 失败（启动日志搜 ui-skin-dsh-theme / failed）。
3. desktop(Electron) 与 web profile 的 client 装配差异——至今只在 web profile 验过，desktop 未验。

### 9.5 源码阅读入口（asar 在 run_code 的 Node fs 里可当目录读，rg/glob 工具读不了）
- 客户端加载契约：asar/dsh/node_modules/@deepseek-ai/dsh-cordis-client-runner/lib/client.js
- 活样本：C:\Users\pass\.dsh\profiles\desktop\node_modules\dsh-claude-style\（package.json / cordis.patch.yml / lib/client.js 头尾）