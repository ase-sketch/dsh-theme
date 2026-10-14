# DeepSpace Editorial Theme (dsh-theme)

> 为 **DeepSeek Harness Web GUI** 打造的先锋级质感主题与交互插件。  
> 融合 **深空暗色** 与 **暖纸印刷** 双重视觉哲学，内置全界面 Lucide 图标体系与会话事件驱动的动态小鲸鱼 **Deepy**。

| 亮室（暖纸墨印） | 深空（近黑朱砂） |
|---|---|
| ![浅色预览](skins/dsh-ui/preview/light.jpg) | ![深色预览](skins/dsh-ui/preview/dark.jpg) |

---

## 核心设计与特性

### 1. 先锋编辑室视觉基座
- **深空（Dark）**：近黑四层明度阶梯叠加微噪点质感，搭配高饱和**单点朱砂红（#FF6A3D）**重点聚焦，告别死黑与单调。
- **亮室（Light）**：以温暖的纸张本色（#F5F1E8）为底，墨色排版搭配经典印刷硬投影，兼具现代感与阅读舒适度。
- **排版系统**：精选衬线标题搭配现代系统无衬线正文，结合等宽字距小标注，全系统自带字体零外链依赖。

### 2. 「书写纸」三行恒高输入卡
- **拒绝界面抖动**：输入区域固定三行正文高度，粘贴超长文稿平滑内滚，整卡高度恒定，打字时不会上下跳动。
- **单行工具带**：工具栏、模式选择、模型徽章与操作按钮统一单行锁定并支持平滑横滚，无论窗口多窄、模型名字多长，均不折行、不遮挡。
- **第三方插件与弹窗兼容**：优化选项（如 po06）、Token 用量等原生定位弹层均在视口内规范呈现。

### 3. 动态小鲸鱼 Deepy
- **常驻状态伴侣**：96px 高精度像素精灵，常驻在输入卡右上角；在新建空会话时化身为居中迎宾徽章。
- **8 种会话状态感知**：实时监听底层会话事件，无需轮询——待机呼吸、思考中、调用工具、任务达成撒彩纸、异常报错、等待授权审批等自动切换动作。
- **轻量按需加载**：首屏仅加载首帧素材（约 19KB），高阶动作切片随用随拉。

### 4. 全界面 Lucide 图标化
- 全面替换 GUI 原生粗粝手绘风格图标，通过几何指纹算法智能映射为 100+ 精致统一的 **Lucide** 线性图标，保持专业、洗练的工业美感。

---

## 安装与使用

本主题提供 **自研 Bundle 插件**（推荐，全功能）与 **纯皮肤卡**（纯 CSS 零代码）两种安装途径。

### 方式 A：作为插件安装（推荐）

插件形态支持在设置页面中一键开关，并自动驱动 Deepy 状态机与图标动态注入。

1. **安装**：
   在当前 DSH 桌面或对应 profile 的配置文件中加载 `dsh-theme` 插件包。
2. **启用与控制**：
   - 打开 DSH，进入 **设置 → Plugins**，确认启用 **dsh-theme**。
   - 在设置导航中点击 **「dsh-theme 主题」** 专属面板，拨动开关即可当场应用或还原。
   - 支持跨重启记住状态。
3. **互斥保护**：
   插件激活时会自动将皮肤中心切回官方默认底色，避免样式叠加冲突。

> ⚠️ **重要提示**：本主题与 `dsh-claude-style` 存在全屏视觉冲突，使用本主题前请务必先禁用或关闭 `dsh-claude-style`。

---

### 方式 B：作为传统皮肤卡加载（轻量回退通道）

若只想使用纯样式而无需小鲸鱼动画和动态图标：

1. 确保 DSH 官方 **皮肤中心（skin-center）** 插件已启用。
2. 将本项目的 `skins/dsh-ui/` 文件夹复制至用户皮肤目录：
   ```bash
   # Windows 默认路径
   %USERPROFILE%\.dsh\skins\dsh-ui
   ```
3. 刷新 DSH 界面，进入 **设置 → 皮肤** 列表，找到 **dsh-ui Design Spec** 卡片，点击 **应用** 或 **试穿**。

---

## 本地开发与重新构建

视觉数值严格采用单一数据源体系，**禁止手工在 CSS 中硬编码 HEX 颜色或绝对尺寸**：

- **设计源**：`design/preview.html`（定调稿）→ 导出机器可读源 `design/tokens.css`
- **映射契约**：`mapping.json`（官方 `--dsw-*` 变量与自定义 token 绑定）
- **图标策展**：`scripts/icon-map-overrides.json`

### 常用命令

```bash
# 1. 编译主题样式（自动生成 skin.css 与插件版 theme.css，执行守卫检查）
node scripts/build-skin.mjs

# 2. 构建图标数据集与指纹映射
node scripts/build-icons.mjs
node scripts/build-icon-map.mjs

# 3. 构建 Deepy 精灵图素材
node scripts/build-deepy.mjs

# 4. 同步皮肤卡到本地 DSH 运行时目录
node scripts/sync-skin.mjs
```

### 单元测试与回归

本项目拥有完善的单元测试套件（覆盖状态机、渲染层、图标层、钩子层与布局计算）：

```bash
node plugins/dsh-theme/test/state-machine.test.mjs
node plugins/dsh-theme/test/render-layer.test.mjs
node plugins/dsh-theme/test/hooks-layer.test.mjs
node plugins/dsh-theme/test/icon-layer.test.mjs
node plugins/dsh-theme/test/composer-deepy.test.mjs
```

---

## 目录结构索引

| 路径 | 职能说明 |
|---|---|
| `design/` | 视觉规范定调稿与 `tokens.css` 机器生成源 |
| `plugins/dsh-theme/` | 自研 Bundle 插件源码（Host 进程持久化 / Client 样式与动效） |
| `skins/dsh-ui/` | 纯皮肤卡资源（供 skin-center 加载的 CSS 与预览图） |
| `scripts/` | 构建、图标抓取、素材降采样与校验脚本 |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 整体技术架构图与模块契约地图 |
| [docs/milestones.md](docs/milestones.md) | 里程碑交付记录与已验证边界 |
| [HANDOFF.md](HANDOFF.md) | 开发维护交接与隔离实例验收方法论 |

---

## 许可证与致谢

- 图标资源基于 [Lucide Icons](https://lucide.dev/) (ISC License)。
- 吉祥物 **Deepy** 像素素材版权归设计原作者所有。
