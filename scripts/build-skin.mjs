// build-skin.mjs — 从 design/tokens.css（深空编辑室 token 机器可读源）按 mapping.json 生成 skins/dsh-ui/skin.css
// 红线：skin.css / theme.css 是生成物，禁止手改；视觉数值只准来自 design/tokens.css。
// design/tokens.css 本身也是生成物：node scripts/build-skin.mjs --regen-tokens 从
// design/preview.html 的 #token-manifest 机械重生成（默认构建只读它、不重生成）。
// M3 起额外发射 --dsh-* 变量全集，供 patches.css（L2/L3）以 var() 引用，避免手抄数值。
// M5 起额外产出 plugins/dsh-theme/assets/theme.css —— 插件版自包含样式（见文件末 §M5 段）。
import fs from 'node:fs'

// 唯一数值来源：design/tokens.css（机器可读设计源，由 --regen-tokens 从设计稿生成）
const PREVIEW = new URL('../design/tokens.css', import.meta.url)
// --regen-tokens 的重生成源：设计稿本体（默认构建不读它）
const PREVIEW_HTML = new URL('../design/preview.html', import.meta.url)
const MAPPING = new URL('../mapping.json', import.meta.url)
const OUT = new URL('../skins/dsh-ui/skin.css', import.meta.url)
const PATCHES = new URL('../skins/dsh-ui/patches.css', import.meta.url)
// M5：插件版自包含样式的产出位置
const PLUGIN_THEME = new URL('../plugins/dsh-theme/assets/theme.css', import.meta.url)
// 插件版的作用域头：html[data-dsh-theme] body 的特异性是 (0,0,1,2)，稳定胜出官方 body{--dsw-*} 的 (0,0,0,1)
const PLUGIN_SCOPE = 'html[data-dsh-theme]'

// shell 自己声明并消费的 --dsh-* 变量：皮肤发射同名变量会打架，构建期直接拒绝。
// 2026-10-12 补强：原名单只有 7 条且已过期。现按实测补齐——从 app.asar 里抽取
// dsh-web-frontend/dist/assets/*.css 与各 @deepseek-ai/dsh-client-ui-* 包的 lib/client.js
// 内联 CSS，收集其中所有「被声明」的 --dsh-* 名字（共 42 个），全部纳入。
// 判据是「shell 自己会声明」，不是「碰巧同名」：皮肤往 :root 发射同名变量，
// 会在 html 层盖掉 shell 在 body 上的声明语义（详见 --dsh-scrollbar-thumb 案例）。
const SHELL_RESERVED = new Set([
  '--dsh-content-font-size', '--dsh-content-font-size-secondary', '--dsh-content-font-delta',
  '--dsh-content-font-delta-secondary', '--dsh-composer-height', '--dsh-segment-count',
  '--dsh-dockkit-float-top', '--dsh-dockkit-dock-layer', '--dsh-dockkit-float-layer',
  '--dsh-dockkit-strip-inline-start',
  '--dsh-skin-scrim', '--dsh-skin-bubble-alpha', '--dsh-skin-bubble-blur',
  '--dsh-scrollbar-thumb', '--dsh-scrollbar-thumb-hover', '--dsh-scrollbar-thumb-border',
  '--dsh-scrollbar-track-margin', '--dsh-scrollbar-width',
  '--dsh-file-type-violet', '--dsh-file-type-default-color',
  '--dsh-boot-label-primary', '--dsh-boot-label-secondary', '--dsh-boot-label-tertiary',
  '--dsh-boot-border', '--dsh-boot-brand',
  '--dsh-compaction-header-height', '--dsh-chat-flow-gap', '--dsh-chat-content-width',
  '--dsh-composer-stack-gap', '--dsh-composer-text-max-height', '--dsh-composer-card-max-width',
  '--dsh-composer-side-clearance', '--dsh-composer-dock-inset',
  '--dsh-composer-model-text-display', '--dsh-composer-model-icon-display',
  '--dsh-table-spare', '--dsh-table-lead',
  '--dsh-windows-content-radius', '--dsh-windows-menu-start',
  '--dsh-frame-top-clearance', '--dsh-frame-chrome-top', '--dsh-frame-overlay-top',
  '--dsh-frame-leading-clearance',
  '--dsh-sidebar-inline-padding', '--dsh-session-list-edge-inset', '--dsh-session-list-scrollbar-width',
])

// ── 源读取 ────────────────────────────────────────────────────────────────
// 源的格式契约（由本脚本 --regen-tokens 保证）：两条顶层规则 —— 浅色根块与
// 深色主题块，各若干条自定义属性声明，无嵌套、无 @media。
// 块提取走花括号配对（字符串/注释感知），**不依赖缩进**：旧版用
// /:root\s*\{([\s\S]*?)\n    \}/ 把「4 空格缩进 + 行首 }」当成了格式契约，
// 换源时格式一动就失配，且失配信息会误导成「找不到块」。

/** 找一个规则头之后的第一个顶层 '{'（跳过括号/中括号/字符串）。 */
function findOpenBrace(source, start) {
  let parens = 0, brackets = 0, quote = null
  for (let i = start; i < source.length; i += 1) {
    const ch = source[i]
    if (quote !== null) {
      if (ch === '\\') i += 1
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; continue }
    if (ch === '(') parens += 1
    else if (ch === ')') parens -= 1
    else if (ch === '[') brackets += 1
    else if (ch === ']') brackets -= 1
    else if (ch === '{' && parens === 0 && brackets === 0) return i
    else if (ch === ';' && parens === 0 && brackets === 0) return -1
  }
  return -1
}

/** 找与 openBrace 配对的 '}'（计花括号，跳过字符串与注释）。 */
function findCloseBrace(source, openBrace) {
  let depth = 0, i = openBrace, inString = null, inComment = false
  for (; i < source.length; i += 1) {
    const ch = source[i], next = source[i + 1]
    if (inComment) {
      if (ch === '*' && next === '/') { inComment = false; i += 1 }
      continue
    }
    if (inString !== null) {
      if (ch === '\\') i += 1
      else if (ch === inString) inString = null
      continue
    }
    if (ch === '/' && next === '*') { inComment = true; i += 1; continue }
    if (ch === '"' || ch === "'") { inString = ch; continue }
    if (ch === '{') depth += 1
    else if (ch === '}') { depth -= 1; if (depth === 0) return i }
  }
  return -1
}

/** 按顶层 ';' 切声明（字符串/括号感知）。
 *  旧版 /(--dsh-[\w-]+)\s*:\s*([^;]+);/ 会在值里第一个 ';' 处静默截断——
 *  url("data:image/svg+xml;base64,...") 这类值会被切坏且不报错。 */
function splitDeclarations(css) {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out = []
  let buf = '', quote = null, depth = 0
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i]
    if (quote !== null) {
      buf += ch
      if (ch === '\\') { buf += src[i + 1] ?? ''; i += 1 }
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue }
    if (ch === '(') depth += 1
    else if (ch === ')') depth -= 1
    if (ch === ';' && depth === 0) { out.push(buf); buf = ''; continue }
    buf += ch
  }
  out.push(buf)
  return out
}

/** 从 CSS 文本里按选择器取规则体（花括号配对）。 */
function extractBlock(css, selectorRe, label) {
  const re = new RegExp(selectorRe.source, selectorRe.flags.replace('g', '') + 'g')
  const m = re.exec(css)
  if (m === null) throw new Error('源里找不到 ' + label + '（选择器 ' + selectorRe + '）')
  const open = findOpenBrace(css, m.index + m[0].length - 1)
  if (open === -1) throw new Error('源里 ' + label + ' 的选择器后没有 {')
  const close = findCloseBrace(css, open)
  if (close === -1) throw new Error('源里 ' + label + ' 的花括号没有闭合')
  return css.slice(open + 1, close)
}

function parseVars(css) {
  const out = {}
  for (const decl of splitDeclarations(css)) {
    const m = decl.match(/^\s*(--dsh-[\w-]+)\s*:\s*([\s\S]+?)\s*$/)
    if (m !== null) out[m[1]] = m[2]
  }
  return out
}

// ── --regen-tokens：从设计稿重生成 design/tokens.css ───────────────────────
//
// 值有两个来源，缺一不可：
//   · #token-manifest.tokens[] —— token 清单与顺序的唯一来源（153 条）。
//   · 设计稿自身的浅色根块 / 深色主题块 —— 值的实际声明。
// 为什么不是只取 manifest（2026-10-12 实测）：manifest 的 --dsh-noise-uri 是占位串
// "data:image/svg+xml;feTurbulence"（31 字符），不是合法 CSS 值；设计稿根块里才是真值
// url("data:image/svg+xml,%3Csvg ... %3E")。占位串落盘会让氛围层静默失效。
// 因此：manifest 定清单，值以设计稿 CSS 声明为准；不一致项必须落在白名单里，
// 白名单外不一致直接报错（防止未来设计稿与 manifest 悄悄漂移）。
// manifest 的 dark 写 "same" 或与 light 相等 = 明暗同值，两块都要显式写出来
// （skin.css 的 resolve() 明暗两套都要能取到）。
const MANIFEST_REPAIR = new Set(['--dsh-noise-uri'])

// 与 shell 自有 --dsh-* 撞名的 token，落盘时改名（设计稿 design/preview.html 冻结不改）。
// 当前唯一一条：--dsh-scrollbar-thumb —— 我们是宽度（4px），shell 的 scrollbar.css 在 body 上
// 把同名变量声明成**颜色** var(--dsw-alias-scrollbar-bg-l1) 并用于 scrollbar-color。
// 直接发射同名变量会污染 shell 的滚动条颜色，故改名 --dsh-scrollbar-thumb-w。
// 这条 drift（设计稿名 ≠ tokens.css 名）已记录在回报里，设计稿侧改名需另开票。
const TOKEN_RENAME = new Map([['--dsh-scrollbar-thumb', '--dsh-scrollbar-thumb-w']])

function regenerateTokens() {
  const html = fs.readFileSync(PREVIEW_HTML, 'utf8')
  const manifestMatch = html.match(/<script type="application\/json" id="token-manifest">([\s\S]*?)<\/script>/)
  if (manifestMatch === null) throw new Error('设计稿里找不到 #token-manifest')
  const manifest = JSON.parse(manifestMatch[1])
  const tokens = manifest.tokens
  if (!Array.isArray(tokens) || tokens.length === 0) throw new Error('manifest.tokens 不是非空数组')
  if (typeof manifest.tokenTotal === 'number' && manifest.tokenTotal !== tokens.length) {
    throw new Error('manifest 自报 tokenTotal=' + manifest.tokenTotal + ' 与实际 ' + tokens.length + ' 不符')
  }
  const badName = tokens.filter((t) => !/^--dsh-[\w-]+$/.test(t.name ?? '')).map((t) => String(t.name))
  if (badName.length) throw new Error('manifest 里有非 --dsh-* 名字：' + badName.join(', '))
  const seen = new Set()
  const dup = []
  for (const t of tokens) { if (seen.has(t.name)) dup.push(t.name); seen.add(t.name) }
  if (dup.length) throw new Error('manifest token 重名：' + dup.join(', '))

  const cssLightVars = parseVars(extractBlock(html, /:root\s*\{/, '设计稿浅色根块'))
  const cssDarkVars = parseVars(extractBlock(html, /\[data-theme="dark"\]\s*\{/, '设计稿深色主题块'))
  const missing = tokens.filter((t) => !(t.name in cssLightVars)).map((t) => t.name)
  if (missing.length) throw new Error('设计稿浅色根块缺这些 manifest token：' + missing.join(', '))
  const extra = Object.keys(cssLightVars).filter((n) => !seen.has(n))
  if (extra.length) throw new Error('设计稿浅色根块有 manifest 未收录的 --dsh-*：' + extra.join(', '))

  const repaired = []
  const lightLines = []
  const darkLines = []
  for (const t of tokens) {
    const declaredLight = cssLightVars[t.name]
    let lightValue = t.light
    if (lightValue !== declaredLight) {
      if (!MANIFEST_REPAIR.has(t.name)) {
        throw new Error('manifest 与设计稿根块值不一致且不在白名单：' + t.name +
          ' manifest=' + JSON.stringify(lightValue) + ' 设计稿=' + JSON.stringify(declaredLight))
      }
      repaired.push(t.name)
      lightValue = declaredLight
    }
    let darkValue = (t.dark === 'same' || t.dark === t.light) ? lightValue : t.dark
    const declaredDark = cssDarkVars[t.name]
    if (declaredDark !== undefined) {
      if (declaredDark !== darkValue) {
        if (!MANIFEST_REPAIR.has(t.name)) {
          throw new Error('manifest 与设计稿深色块值不一致且不在白名单：' + t.name +
            ' manifest=' + JSON.stringify(darkValue) + ' 设计稿=' + JSON.stringify(declaredDark))
        }
        if (!repaired.includes(t.name)) repaired.push(t.name)
        darkValue = declaredDark
      }
    } else if (darkValue !== lightValue) {
      throw new Error('manifest 说 ' + t.name + ' 明暗不同，但设计稿深色块没有声明它')
    }
    if (typeof lightValue !== 'string' || lightValue.trim() === '') throw new Error('浅色值为空：' + t.name)
    if (typeof darkValue !== 'string' || darkValue.trim() === '') throw new Error('深色值为空：' + t.name)
    const outName = TOKEN_RENAME.get(t.name) ?? t.name
    lightLines.push('  ' + outName + ': ' + lightValue + ';')
    darkLines.push('  ' + outName + ': ' + darkValue + ';')
  }

  // 静态断言（父代理要求）：uri 类 token 必须是浏览器可解析的 url("data:...")，不能是占位串
  const uriToken = tokens.find((t) => t.name === '--dsh-noise-uri')
  if (uriToken !== undefined) {
    const v = cssLightVars['--dsh-noise-uri']
    if (!/^url\("data:/.test(v)) {
      throw new Error('--dsh-noise-uri 不是合法的 url("data:...") 值：' + JSON.stringify(v))
    }
  }

  const out = []
  out.push('/* GENERATED by scripts/build-skin.mjs --regen-tokens —— 机器可读设计源，禁止手改。')
  out.push('   来源: design/preview.html 的 #token-manifest（token 清单与顺序）')
  out.push('         + 该文件自身的浅色根块 / 深色主题块（每条 token 的实际声明值）。')
  out.push('   重生成: node scripts/build-skin.mjs --regen-tokens（改设计稿后重跑）。')
  out.push('   格式契约: 两条顶层规则 —— 浅色根块 + 深色主题块，各 ' + tokens.length + ' 条；')
  out.push('            明暗同值的 token 也显式写两份，保证 skin.css 的 resolve() 两套都取得到。')
  out.push('   已知修正: ' + (repaired.length ? repaired.join(', ') + ' —— manifest 里是占位串，取设计稿 CSS 真值' : '无'))
  out.push('   已改名: ' + (TOKEN_RENAME.size ? [...TOKEN_RENAME].map(([a, b]) => a + ' -> ' + b).join(', ') + '（与 shell 自有 --dsh-* 撞名）' : '无'))
  out.push('*/')
  out.push('')
  out.push(':root {')
  out.push(...lightLines)
  out.push('}')
  out.push('')
  out.push('[data-theme="dark"] {')
  out.push(...darkLines)
  out.push('}')
  out.push('')
  fs.writeFileSync(PREVIEW, out.join('\n'))
  console.log('tokens.css 重生成：' + tokens.length + ' 条 × 明暗双套' +
    (repaired.length ? '，修正 ' + repaired.length + ' 条（' + repaired.join(', ') + '）' : '，无修正'))
}

if (process.argv.includes('--regen-tokens')) regenerateTokens()

const cssSource = fs.readFileSync(PREVIEW, 'utf8')
const light = parseVars(extractBlock(cssSource, /:root\s*\{/, 'tokens.css 浅色根块'))
const dark = parseVars(extractBlock(cssSource, /\[data-theme="dark"\]\s*\{/, 'tokens.css 深色主题块'))

// 源自检：manifest 声明的 153 条必须全在，且明暗两套都非空
{
  const emptyLight = Object.entries(light).filter(([, v]) => v.trim() === '').map(([k]) => k)
  const emptyDark = Object.entries(dark).filter(([, v]) => v.trim() === '').map(([k]) => k)
  if (emptyLight.length || emptyDark.length) {
    throw new Error('design/tokens.css 有空值声明：浅色 ' + emptyLight.join(', ') + ' / 深色 ' + emptyDark.join(', '))
  }
  const onlyLight = Object.keys(light).filter((k) => !(k in dark))
  if (onlyLight.length) throw new Error('design/tokens.css 深色主题块缺这些变量：' + onlyLight.join(', '))
  const noise = light['--dsh-noise-uri']
  if (noise !== undefined && !/^url\("data:/.test(noise)) {
    throw new Error('design/tokens.css 的 --dsh-noise-uri 不是合法的 url("data:...")：' + JSON.stringify(noise))
  }
}

const mapping = JSON.parse(fs.readFileSync(MAPPING, 'utf8'))
const themes = { light, dark }
function resolve(ref, theme) {
  const v = themes[theme][ref]
  if (!v) throw new Error('design/tokens.css 无 ' + ref + '（' + theme + '）——mapping.json 指向了不存在的 token')
  return v
}

// patches.css 只准引用 design/tokens.css 里存在的 --dsh-*：拼错或引用了不存在的变量，构建期就红
let patchesGuard = ''
if (fs.existsSync(PATCHES)) {
  // 只在**去注释后**的正文里找 var() 引用：注释里写 var(--dsh-xxx) 是文档说明，
  // 不该让构建红。M8 实测踩到——解释「为什么不重绑 shell 的输入卡高度变量」时
  // 在注释里写了那个名字，被守卫误判成「引用了不存在的变量」。
  // 去注释只会让守卫更准：注释外的 var() 才是真会参与求值的。
  const src = fs.readFileSync(PATCHES, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  const refs = new Set([...src.matchAll(/var\(\s*(--dsh-[\w-]+)/g)].map((m) => m[1]))
  const missing = [...refs].filter((r) => !(r in light))
  if (missing.length) throw new Error('patches.css 引用了 design/tokens.css 里不存在的变量：' + missing.join(', '))
  patchesGuard = '（patches.css 引用校验通过：' + refs.size + ' 个 --dsh-* 变量）'
}

const collisions = Object.keys(light).filter((k) => SHELL_RESERVED.has(k))
if (collisions.length) throw new Error('design/tokens.css 与 shell 自有变量重名：' + collisions.join(', '))

let css = '/* GENERATED by scripts/build-skin.mjs — 禁止手改，改 mapping.json 重跑。\n'
css += '   源: design/tokens.css（深空编辑室 token 机器可读源，由 design/preview.html 机械生成） */\n\n'

// 根底色/文字色（明暗）+ --dsh-* 变量全集（供 patches.css 的 L2/L3 规则引用）
css += ':root {\n'
for (const [prop, ref] of Object.entries(mapping.root)) css += '  ' + prop + ': ' + resolve(ref.light, 'light') + ';\n'
for (const [name, value] of Object.entries(light)) css += '  ' + name + ': ' + value + ';\n'
css += '}\n\nbody[data-ds-dark-theme] {\n'
for (const [prop, ref] of Object.entries(mapping.root)) css += '  ' + prop + ': ' + resolve(ref.dark, 'dark') + ';\n'
for (const [name, value] of Object.entries(dark)) css += '  ' + name + ': ' + value + ';\n'
css += '}\n\n'

// L1 token 重映射（明暗）
css += ':root {\n'
for (const [dsw, ref] of Object.entries(mapping.tokens)) css += '  ' + dsw + ': ' + resolve(ref.light, 'light') + ';\n'
css += '}\n\nbody[data-ds-dark-theme] {\n'
for (const [dsw, ref] of Object.entries(mapping.tokens)) css += '  ' + dsw + ': ' + resolve(ref.dark, 'dark') + ';\n'
css += '}\n'

fs.writeFileSync(OUT, css)
console.log('skin.css 生成：源 design/tokens.css；' + Object.keys(mapping.tokens).length + ' 个 L1 token × 明暗双套 + 根底色 + ' + Object.keys(light).length + ' 个 --dsh-* 变量 ' + patchesGuard)


// ── M5 §A：loader 变换的显式复刻（作用域化 + token 派生） ─────────────────────
//
// 为什么需要（HANDOFF.md §6.2）：纯皮肤期皮肤由 skin-center loader 代注入，loader
// 在服务端对每份样式做了一次 transform —— 作用域重写 + 裸 :root 的 token 重置 +
// token 克隆到 body + 对"皮肤未声明的官方 token"的 color-mix 派生
// （skin-center lib/index.js:2245 transformSkinCss / :1979 deriveFallbackTokens）。
// 插件自注入时这一层不存在，原样塞 skin.css 会让 patches.css 约一半规则失去前提。
// 本段把这层变换复刻成构建期产物，使 theme.css 自包含、不依赖 skin-center 行为。
//
// 复刻条目（与 loader 逐条对齐）：
//   ① 选择器按 scope 重写：:root/html 并入 scope；body 与裸 [data-ds-*] 头降为后代；
//      其余一律降为后代。
//   ② 裸 :root 块里的 --dsw-alias-* / --dsw-specific-* 在 scope 上重置为 initial
//      （!important）—— 防止 html 上的亮色 token 被暗色 body 继承（loader 注释 #646）。
//   ③ 同一批 token + background-color/background-image 克隆到 "<scope> body"，
//      让官方 body{--dsw-*}（0,0,0,1）被 <scope> body（0,0,1,2）稳定压过。
//   ④ deriveFallbacks 打开时，对官方 token 表中 skin.css 未声明的 token 按组派生
//      color-mix(in srgb, var(<anchor>) <alpha>%, transparent)。

/** 官方 shell 的 --dsw-* 自定义属性全集（299 条，静态色板除外）。
 *  来源：skin-center lib/index.js:1605 OFFICIAL_TOKENS（其自身由官方 asar 快照生成）。
 *  只用于判定"皮肤没声明哪些 token"，不引入任何数值。 */
const OFFICIAL_TOKENS = [
  '--dsw-alias-bg-base', '--dsw-alias-bg-document-preview', '--dsw-alias-bg-layer-1', '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-layer-3', '--dsw-alias-bg-layer-4', '--dsw-alias-bg-mask-1', '--dsw-alias-bg-mask-2',
  '--dsw-alias-bg-mask-3', '--dsw-alias-bg-mask-drop', '--dsw-alias-bg-mask-photo', '--dsw-alias-bg-module-platform',
  '--dsw-alias-bg-multi-select', '--dsw-alias-bg-overlay', '--dsw-alias-bg-skeleton', '--dsw-alias-border-inverted',
  '--dsw-alias-border-inverted2', '--dsw-alias-border-l1', '--dsw-alias-border-l2', '--dsw-alias-border-l2-darkmode-thin',
  '--dsw-alias-border-l3', '--dsw-alias-border-l4', '--dsw-alias-brand-primary', '--dsw-alias-brand-primary-invert',
  '--dsw-alias-brand-primary-new-colorprimary-new-color', '--dsw-alias-brand-text', '--dsw-alias-button-contrast-fill', '--dsw-alias-button-elevated-fill',
  '--dsw-alias-button-floating-fill', '--dsw-alias-button-floating-hover', '--dsw-alias-button-ghost-active-border', '--dsw-alias-button-ghost-active-fill',
  '--dsw-alias-button-ghost-active-hover', '--dsw-alias-button-info-fill', '--dsw-alias-button-info-hover', '--dsw-alias-button-primary-dimmed',
  '--dsw-alias-button-primary-fill', '--dsw-alias-button-primary-hover', '--dsw-alias-button-tool-bar-fill', '--dsw-alias-button-tool-bar-fill-invisible',
  '--dsw-alias-button-tool-bar-hover', '--dsw-alias-code-diff-added', '--dsw-alias-code-diff-deleted', '--dsw-alias-file-diff-added-bg',
  '--dsw-alias-file-diff-added-gutter', '--dsw-alias-file-diff-added-marker', '--dsw-alias-file-diff-deleted-bg', '--dsw-alias-file-diff-deleted-gutter',
  '--dsw-alias-file-diff-deleted-marker', '--dsw-alias-interactive-bg-active', '--dsw-alias-interactive-bg-hover', '--dsw-alias-interactive-bg-hover-accent',
  '--dsw-alias-interactive-bg-hover-danger', '--dsw-alias-interactive-bg-hover-solid', '--dsw-alias-label-caption', '--dsw-alias-label-dimmed',
  '--dsw-alias-label-document-preview', '--dsw-alias-label-error', '--dsw-alias-label-primary', '--dsw-alias-label-primary-bluish',
  '--dsw-alias-label-primary-dimmed', '--dsw-alias-label-primary-foreground', '--dsw-alias-label-primary-inverted', '--dsw-alias-label-secondary',
  '--dsw-alias-label-tertiary', '--dsw-alias-link', '--dsw-alias-markdown-citation', '--dsw-alias-markdown-code-block',
  '--dsw-alias-markdown-code-block-banner', '--dsw-alias-markdown-code-segment-selected', '--dsw-alias-markdown-code-segment-unselected', '--dsw-alias-markdown-inline-code',
  '--dsw-alias-markdown-placeholder', '--dsw-alias-markdown-tag', '--dsw-alias-scrollbar-bg-l1', '--dsw-alias-scrollbar-bg-l2',
  '--dsw-alias-scrollbar-hover-l1', '--dsw-alias-scrollbar-hover-l2', '--dsw-alias-state-business-primary', '--dsw-alias-state-business-tertiary',
  '--dsw-alias-state-error-primary', '--dsw-alias-state-error-secondary', '--dsw-alias-state-idle-primary', '--dsw-alias-state-success-primary',
  '--dsw-alias-state-success-secondary', '--dsw-alias-state-success-tertiary', '--dsw-alias-state-warn-label', '--dsw-alias-state-warn-primary',
  '--dsw-alias-state-warn-secondary', '--dsw-alias-state-warn-tertiary', '--dsw-alias-toast-bg', '--dsw-alias-tooltip-bg',
  '--dsw-corner-shape', '--dsw-elevation-panel', '--dsw-elevation-prominent', '--dsw-elevation-soft',
  '--dsw-elevation-stroke', '--dsw-elevation-stroke-color', '--dsw-font-base-16', '--dsw-font-base-16-font-family',
  '--dsw-font-base-16-font-size', '--dsw-font-base-16-font-style', '--dsw-font-base-16-font-weight', '--dsw-font-base-16-line-height',
  '--dsw-font-base-strong-16', '--dsw-font-base-strong-16-font-family', '--dsw-font-base-strong-16-font-size', '--dsw-font-base-strong-16-font-style',
  '--dsw-font-base-strong-16-font-weight', '--dsw-font-base-strong-16-line-height', '--dsw-font-family', '--dsw-font-l-20',
  '--dsw-font-l-20-font-family', '--dsw-font-l-20-font-size', '--dsw-font-l-20-font-style', '--dsw-font-l-20-font-weight',
  '--dsw-font-l-20-line-height', '--dsw-font-m-18', '--dsw-font-m-18-font-family', '--dsw-font-m-18-font-size',
  '--dsw-font-m-18-font-style', '--dsw-font-m-18-font-weight', '--dsw-font-m-18-line-height', '--dsw-font-markdown-base',
  '--dsw-font-markdown-base-font-family', '--dsw-font-markdown-base-font-size', '--dsw-font-markdown-base-font-style', '--dsw-font-markdown-base-font-weight',
  '--dsw-font-markdown-base-italic', '--dsw-font-markdown-base-italic-font-family', '--dsw-font-markdown-base-italic-font-size', '--dsw-font-markdown-base-italic-font-style',
  '--dsw-font-markdown-base-italic-font-weight', '--dsw-font-markdown-base-italic-line-height', '--dsw-font-markdown-base-line-height', '--dsw-font-markdown-base-strong',
  '--dsw-font-markdown-base-strong-font-family', '--dsw-font-markdown-base-strong-font-size', '--dsw-font-markdown-base-strong-font-style', '--dsw-font-markdown-base-strong-font-weight',
  '--dsw-font-markdown-base-strong-italic', '--dsw-font-markdown-base-strong-italic-font-family', '--dsw-font-markdown-base-strong-italic-font-size', '--dsw-font-markdown-base-strong-italic-font-style',
  '--dsw-font-markdown-base-strong-italic-font-weight', '--dsw-font-markdown-base-strong-italic-line-height', '--dsw-font-markdown-base-strong-line-height', '--dsw-font-markdown-code',
  '--dsw-font-markdown-code-block', '--dsw-font-markdown-code-block-font-family', '--dsw-font-markdown-code-block-font-size', '--dsw-font-markdown-code-block-font-style',
  '--dsw-font-markdown-code-block-font-weight', '--dsw-font-markdown-code-block-line-height', '--dsw-font-markdown-code-block-small', '--dsw-font-markdown-code-block-small-font-family',
  '--dsw-font-markdown-code-block-small-font-size', '--dsw-font-markdown-code-block-small-font-style', '--dsw-font-markdown-code-block-small-font-weight', '--dsw-font-markdown-code-block-small-line-height',
  '--dsw-font-markdown-code-font-family', '--dsw-font-markdown-code-font-size', '--dsw-font-markdown-code-font-style', '--dsw-font-markdown-code-font-weight',
  '--dsw-font-markdown-code-line-height', '--dsw-font-markdown-h1', '--dsw-font-markdown-h1-font-family', '--dsw-font-markdown-h1-font-size',
  '--dsw-font-markdown-h1-font-style', '--dsw-font-markdown-h1-font-weight', '--dsw-font-markdown-h1-line-height', '--dsw-font-markdown-h2',
  '--dsw-font-markdown-h2-font-family', '--dsw-font-markdown-h2-font-size', '--dsw-font-markdown-h2-font-style', '--dsw-font-markdown-h2-font-weight',
  '--dsw-font-markdown-h2-line-height', '--dsw-font-markdown-h3', '--dsw-font-markdown-h3-font-family', '--dsw-font-markdown-h3-font-size',
  '--dsw-font-markdown-h3-font-style', '--dsw-font-markdown-h3-font-weight', '--dsw-font-markdown-h3-line-height', '--dsw-font-markdown-h4',
  '--dsw-font-markdown-h4-font-family', '--dsw-font-markdown-h4-font-size', '--dsw-font-markdown-h4-font-style', '--dsw-font-markdown-h4-font-weight',
  '--dsw-font-markdown-h4-line-height', '--dsw-font-markdown-small', '--dsw-font-markdown-small-font-family', '--dsw-font-markdown-small-font-size',
  '--dsw-font-markdown-small-font-style', '--dsw-font-markdown-small-font-weight', '--dsw-font-markdown-small-italic', '--dsw-font-markdown-small-italic-font-family',
  '--dsw-font-markdown-small-italic-font-size', '--dsw-font-markdown-small-italic-font-style', '--dsw-font-markdown-small-italic-font-weight', '--dsw-font-markdown-small-italic-line-height',
  '--dsw-font-markdown-small-line-height', '--dsw-font-markdown-small-strong', '--dsw-font-markdown-small-strong-font-family', '--dsw-font-markdown-small-strong-font-size',
  '--dsw-font-markdown-small-strong-font-style', '--dsw-font-markdown-small-strong-font-weight', '--dsw-font-markdown-small-strong-italic', '--dsw-font-markdown-small-strong-italic-font-family',
  '--dsw-font-markdown-small-strong-italic-font-size', '--dsw-font-markdown-small-strong-italic-font-style', '--dsw-font-markdown-small-strong-italic-font-weight', '--dsw-font-markdown-small-strong-italic-line-height',
  '--dsw-font-markdown-small-strong-line-height', '--dsw-font-markdown-table', '--dsw-font-markdown-table-font-family', '--dsw-font-markdown-table-font-size',
  '--dsw-font-markdown-table-font-style', '--dsw-font-markdown-table-font-weight', '--dsw-font-markdown-table-head', '--dsw-font-markdown-table-head-font-family',
  '--dsw-font-markdown-table-head-font-size', '--dsw-font-markdown-table-head-font-style', '--dsw-font-markdown-table-head-font-weight', '--dsw-font-markdown-table-head-line-height',
  '--dsw-font-markdown-table-line-height', '--dsw-font-s-14', '--dsw-font-s-14-font-family', '--dsw-font-s-14-font-size',
  '--dsw-font-s-14-font-style', '--dsw-font-s-14-font-weight', '--dsw-font-s-14-line-height', '--dsw-font-s-strong-14',
  '--dsw-font-s-strong-14-font-family', '--dsw-font-s-strong-14-font-size', '--dsw-font-s-strong-14-font-style', '--dsw-font-s-strong-14-font-weight',
  '--dsw-font-s-strong-14-line-height', '--dsw-font-xl-24', '--dsw-font-xl-24-font-family', '--dsw-font-xl-24-font-size',
  '--dsw-font-xl-24-font-style', '--dsw-font-xl-24-font-weight', '--dsw-font-xl-24-line-height', '--dsw-font-xs-13',
  '--dsw-font-xs-13-font-family', '--dsw-font-xs-13-font-size', '--dsw-font-xs-13-font-style', '--dsw-font-xs-13-font-weight',
  '--dsw-font-xs-13-line-height', '--dsw-font-xs-strong-13', '--dsw-font-xs-strong-13-font-family', '--dsw-font-xs-strong-13-font-size',
  '--dsw-font-xs-strong-13-font-style', '--dsw-font-xs-strong-13-font-weight', '--dsw-font-xs-strong-13-line-height', '--dsw-font-xxs-12',
  '--dsw-font-xxs-12-font-family', '--dsw-font-xxs-12-font-size', '--dsw-font-xxs-12-font-style', '--dsw-font-xxs-12-font-weight',
  '--dsw-font-xxs-12-line-height', '--dsw-font-xxs-strong-12', '--dsw-font-xxs-strong-12-font-family', '--dsw-font-xxs-strong-12-font-size',
  '--dsw-font-xxs-strong-12-font-style', '--dsw-font-xxs-strong-12-font-weight', '--dsw-font-xxs-strong-12-line-height', '--dsw-font-xxxs-11',
  '--dsw-font-xxxs-11-font-family', '--dsw-font-xxxs-11-font-size', '--dsw-font-xxxs-11-font-style', '--dsw-font-xxxs-11-font-weight',
  '--dsw-font-xxxs-11-line-height', '--dsw-font-xxxs-strong-11', '--dsw-font-xxxs-strong-11-font-family', '--dsw-font-xxxs-strong-11-font-size',
  '--dsw-font-xxxs-strong-11-font-style', '--dsw-font-xxxs-strong-11-font-weight', '--dsw-font-xxxs-strong-11-line-height', '--dsw-hovercard-bg',
  '--dsw-linear-gradient-think', '--dsw-linear-think-select', '--dsw-mask-blur', '--dsw-menu-backdrop-filter',
  '--dsw-shadow-lv1', '--dsw-shadow-lv1-blur', '--dsw-shadow-lv2', '--dsw-shadow-lv3',
  '--dsw-specific-bubble', '--dsw-specific-bubble-highlight', '--dsw-specific-input-major', '--dsw-specific-login-input',
  '--dsw-specific-menu', '--dsw-specific-selector', '--dsw-specific-sidebar-fill', '--dsw-specific-sidebar-nav-item-active',
  '--dsw-specific-sidebar-nav-item-active-accent', '--dsw-specific-sidebar-nav-item-hover', '--dsw-specific-tip',
];

const ROOT_BODY_TOKEN = /^(?:--dsw-alias-|--dsw-specific-)/
const HEAD_DATA_DS = /^\[data-ds-[a-z0-9-]+/

/** 顶层逗号切分（括号/中括号/字符串感知）。 */
function splitSelectors(selectorText) {
  const parts = []
  let parens = 0, brackets = 0, quote = null, current = ''
  for (let i = 0; i < selectorText.length; i += 1) {
    const ch = selectorText[i]
    if (quote !== null) {
      current += ch
      if (ch === '\\') { current += selectorText[i + 1] ?? ''; i += 1 }
      else if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") { quote = ch; current += ch; continue }
    if (ch === '(') parens += 1
    else if (ch === ')') parens -= 1
    else if (ch === '[') brackets += 1
    else if (ch === ']') brackets -= 1
    if (ch === ',' && parens === 0 && brackets === 0) { parts.push(current); current = ''; continue }
    current += ch
  }
  parts.push(current)
  return parts
}

/** 从 pos 起跳过空白与块注释，返回真正的规则头起点。
 *  必须做这一步：源文件开头的注释若被当成选择器文本，就会产出
 *  "html[data-dsh-theme] <注释> :root {...}" 这种把 :root 留在作用域外的垃圾规则。
 *  loader 走 lightningcss 的 rule 位置，天然不含前导注释；这里是文本级复刻，需自己跳。 */
function skipSpaceAndComments(source, pos) {
  let i = pos
  for (;;) {
    while (i < source.length && /\s/.test(source[i])) i += 1
    if (source[i] === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) return source.length
      i = end + 2
      continue
    }
    return i
  }
}

/** 把单个选择器重写到 scope 下（与 loader scopeSelectorText 逐条等价）。 */
function scopeSelectorText(selector, scope) {
  const trimmed = selector.trim()
  const leading = selector.slice(0, selector.length - selector.trimStart().length)
  const trailing = selector.slice(leading.length + trimmed.length)
  if (trimmed === ':root' || trimmed.startsWith(':root ') || trimmed.startsWith(':root,')) return leading + scope + trimmed.slice(5) + trailing
  if (/^html\[data-ds-/.test(trimmed)) return leading + scope + ' body' + trimmed.slice(4) + trailing
  if (trimmed === 'html' || trimmed.startsWith('html ')) return leading + scope + trimmed.slice(4) + trailing
  if (trimmed === 'body' || trimmed.startsWith('body ') || trimmed.startsWith('body[') || trimmed.startsWith('body:')) return leading + scope + ' ' + trimmed + trailing
  if (HEAD_DATA_DS.test(trimmed)) return leading + scope + ' body' + trimmed + trailing
  return leading + scope + ' ' + trimmed + trailing
}

function scopeSelectorList(selectorText, scope) {
  return splitSelectors(selectorText).map((sel) => scopeSelectorText(sel, scope)).join(',')
}

function hasBareRootSelector(selectorText) {
  return splitSelectors(selectorText).some((s) => {
    const t = s.trim()
    return t === ':root' || t === 'html'
  })
}
function withoutCssComments(value) {
  return value.replace(/\/\*[\s\S]*?\*\//g, '')
}
/** 裸 :root 里需要在 scope 上重置为 initial 的 token（附 !important 标记）。 */
function rootBodyTokens(blockText) {
  const tokens = new Map()
  for (const match of withoutCssComments(blockText).matchAll(/(?:^|[;{])\s*(--[\w-]+)\s*:\s*([^;}]*)/gm)) {
    const name = match[1]
    if (name !== undefined && ROOT_BODY_TOKEN.test(name)) tokens.set(name, /!\s*important\s*$/i.test(match[2] ?? ''))
  }
  return [...tokens].map(([name, important]) => ({ name, important }))
}
/** 克隆到 body 时保留哪些声明：ROOT_BODY_TOKEN 的自定义属性，或 background-*。 */
function bodyCloneProperty(line) {
  const custom = line.match(/^(--[\w-]+)\s*:/)
  if (custom !== null) {
    const name = custom[1] ?? ''
    return ROOT_BODY_TOKEN.test(name) ? line.replace(/\s*!important(?=\s*;?\s*$)/i, '') : null
  }
  return /^background-(color|image)\s*:/.test(line) ? line : null
}

const EXCLUDED = /(^|-)(mask|shadow|button|state|error|warning|success|danger|info|caution|brand|scrollbar|foreground|inverted|dimmed)(-|$)|-font-|linear-|ease|duration|transition/
const GROUPS = [
  { skip: /-bg-/, anchors: ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-base'], alpha: 65 },
  { skip: /-label-/, anchors: ['--dsw-alias-label-primary'], alpha: 70 },
  { skip: /-border-/, anchors: ['--dsw-alias-border-l2', '--dsw-alias-border-l1'], alpha: 55 },
  { skip: /-interactive-/, anchors: ['--dsw-alias-bg-layer-1'], alpha: 50 },
  { skip: /-specific-/, anchors: ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-base'], alpha: 60 },
]
function groupFor(token) {
  if (EXCLUDED.test(token)) return null
  for (const group of GROUPS) if (group.skip.test(token)) return group
  return null
}
/** 对官方 token 表中"皮肤未声明"的 token 派生半透明色（loader deriveFallbackTokens）。 */
function deriveFallbackTokens(defined) {
  const out = []
  for (const token of OFFICIAL_TOKENS) {
    if (defined.has(token)) continue
    const group = groupFor(token)
    if (group === null) continue
    const anchor = group.anchors.find((candidate) => defined.has(candidate))
    if (anchor === undefined) continue
    out.push(token + ': color-mix(in srgb, var(' + anchor + ') ' + group.alpha + '%, transparent);')
  }
  return out
}

const PRIMARY_ACTION_FILL = '--dsw-alias-button-primary-fill'
const PRIMARY_ACTION_HOVER = '--dsw-alias-button-primary-hover'
const PRIMARY_ACTION_DIMMED = '--dsw-alias-button-primary-dimmed'
const PRIMARY_ACTION_FOREGROUND = '--dsw-alias-label-primary-foreground'
const PRIMARY_ACTION_BRAND = '--dsw-alias-brand-primary'
const PRIMARY_ACTION_BRAND_INVERT = '--dsw-alias-brand-primary-invert'
/** 主按钮 token 家族的补全（loader derivePrimaryActionFallbacks）。 */
function derivePrimaryActionFallbacks(defined) {
  const out = []
  const hasBrand = defined.has(PRIMARY_ACTION_BRAND)
  const branded = hasBrand || defined.has(PRIMARY_ACTION_FILL)
  if (!hasBrand && !defined.has(PRIMARY_ACTION_FILL)) return out
  if (!defined.has(PRIMARY_ACTION_FILL) && hasBrand) out.push(PRIMARY_ACTION_FILL + ': var(' + PRIMARY_ACTION_BRAND + ');')
  if (branded && !defined.has(PRIMARY_ACTION_HOVER)) out.push(PRIMARY_ACTION_HOVER + ': color-mix(in srgb, var(' + PRIMARY_ACTION_FILL + ') 82%, var(--dsw-alias-bg-layer-1));')
  if (branded && !defined.has(PRIMARY_ACTION_DIMMED)) out.push(PRIMARY_ACTION_DIMMED + ': color-mix(in srgb, var(' + PRIMARY_ACTION_FILL + ') 60%, var(--dsw-alias-bg-layer-1));')
  if (!defined.has(PRIMARY_ACTION_FOREGROUND) && hasBrand && defined.has(PRIMARY_ACTION_BRAND_INVERT)) out.push(PRIMARY_ACTION_FOREGROUND + ': var(' + PRIMARY_ACTION_BRAND_INVERT + ');')
  return out
}

/** 收集一份样式里声明的全部自定义属性名（等价 loader 的 Declaration.custom 访问）。 */
function collectDefined(cssText) {
  const defined = new Set()
  for (const match of cssText.matchAll(/(?:^|[;{])\s*(--[\w-]+)\s*:/gm)) defined.add(match[1])
  return defined
}

/**
 * 作用域化一份样式。scope 形如 html[data-dsh-theme]。
 * @param cssText 源样式文本
 * @param options.scope 作用域选择器头
 * @param options.deriveFallbacks 是否追加 loader 的 token 派生段（只对 skin.css 开）
 * @param options.defined 派生用的"已声明"集合；缺省从本文件收集
 */
function scopeSkinCss(cssText, options) {
  const scope = options.scope
  if (/(^|\n)\s*@(media|supports|layer|container)\b/.test(cssText)) {
    throw new Error('skin-scope：源样式含 @media/@supports 等嵌套 at-rule，本复刻未覆盖——请先扩展 scopeSkinCss 再产出')
  }
  // 收集规则 span。游标必须按规则边界推进：若从 '{' 之后继续扫，块内的 ';' 会被
  // findOpenBrace 当成顶层分号而提前终止整轮扫描（这正是第一版只收到 1 条 span 的原因）。
  const spans = []
  let scan = 0
  while (scan < cssText.length) {
    const headStart = skipSpaceAndComments(cssText, scan)
    if (headStart >= cssText.length) break
    const openBrace = findOpenBrace(cssText, headStart)
    if (openBrace === -1) break
    const close = findCloseBrace(cssText, openBrace)
    const head = cssText.slice(headStart, openBrace)
    // 顶层 ';' 意味着这不是一条规则（如 @import）；@ 开头的是 at-rule，本复刻不处理
    if (head.trim() !== '' && !head.includes(';') && !head.trimStart().startsWith('@')) {
      spans.push({ start: headStart, openBrace, close })
    }
    scan = close === -1 ? cssText.length : close + 1
  }
  let out = ''
  let cursor = 0
  for (const span of spans) {
    const selectorText = cssText.slice(span.start, span.openBrace)
    const close = span.close
    out += cssText.slice(cursor, span.start)
    out += scopeSelectorList(selectorText, scope) + (close === -1 ? cssText.slice(span.openBrace) : cssText.slice(span.openBrace, close + 1))
    if (close !== -1 && hasBareRootSelector(selectorText)) {
      const body = cssText.slice(span.openBrace, close + 1)
      const tokens = rootBodyTokens(body)
      if (tokens.length > 0) {
        out += '\n' + scope + ' {\n  ' + tokens.map((t) => t.name + ': initial' + (t.important ? ' !important' : '') + ';').join('\n  ') + '\n}\n'
      }
      const props = withoutCssComments(cssText.slice(span.openBrace + 1, close))
        .split('\n').map((line) => bodyCloneProperty(line.trim())).filter((line) => line !== null)
      if (props.length > 0) out += '\n' + scope + ' body {\n  ' + props.join('\n  ') + '\n}\n'
    }
    cursor = close === -1 ? span.openBrace : close + 1
  }
  out += cssText.slice(cursor)
  if (options.deriveFallbacks === true) {
    const set = options.defined ?? collectDefined(cssText)
    const fallbacks = [...deriveFallbackTokens(set), ...derivePrimaryActionFallbacks(set)]
    if (fallbacks.length > 0) out += '\n' + scope + ' body {\n  ' + fallbacks.join('\n  ') + '\n}\n'
  }
  return out
}

// ── M5 §B：插件版自包含样式（assets/theme.css） ────────────────────────────
//
// 为什么是构建产物而不是手写（AGENTS.md 红线）：数值唯一来源仍是 design/tokens.css。
// 自包含的含义：把纯皮肤期由 skin-center loader 承担的那层变换（§A）显式复刻进来，
// 使这份 CSS 单独注入时也能得到与纯皮肤期一致的视觉——即
//   theme.css = scope(skin.css, 派生) + scope(patches.css)
// 顺序与纯皮肤期的 loader 加载顺序一致（skin.css 先、patches.css 后），
// 因此 patches.css 的 L2/L3 规则仍然压在同名 token 之上。
//
// 与纯皮肤期的一处**有意**差异：纯皮肤期 loader 会把选择器包成 html[data-dsh-skin="dsh-ui"]，
// 插件期包成 html[data-dsh-theme]；两者都要求根元素上有对应属性，互不干扰。

const patchSrc = fs.existsSync(PATCHES) ? fs.readFileSync(PATCHES, 'utf8') : ''
if (patchSrc === '') throw new Error('patches.css 不存在——插件版自包含样式需要它，拒绝产出半成品')

// ── 深色别名层重声明（S4 独立验收抓到的真红点） ──────────────────────────────
//
// 现象：插件期切深色后侧栏仍是 rgb(243,247,254)、输入卡仍是纯白，与纯皮肤期深色
// 基线（侧栏 #171B24）差 220+ 通道。
//
// 根因：preview 的 :root 里有 9 个 --dsh-* 是**别名**（值形如 var(--dsh-bg-subtle)），
// 例如 --dsh-sidebar-bg: var(--dsh-bg-subtle)、--dsh-card-bg: var(--dsh-bg-surface)。
// skin.css 把亮色 99 个变量发射在 :root（html 层），把暗色 22 个原语发射在
// body[data-ds-dark-theme]。var() 在**声明所在元素**上求值：
//   · html 层声明 --dsh-sidebar-bg: var(--dsh-bg-subtle) → 在 html 求值 = 亮色 #F3F7FE，锁死
//   · body 层只重定义了原语 --dsh-bg-subtle: #171B24，没有重定义别名本身
//   · body 上读 var(--dsh-sidebar-bg) 沿继承拿到 html 那个已求值的亮色
// patches.css 的 L2 规则正是引用这批别名（--dsw-specific-sidebar-fill: var(--dsh-sidebar-bg)），
// 于是深色下组件表面全被钉在亮色。
//
// 纯皮肤期为何是对的：skin-center 的 transform 会把裸 :root 的自定义属性**克隆到 body**
// （lib/index.js:2306-2308 bodyCloneProperty，规则见 :2205）。body 上同时有
//   --dsh-sidebar-bg: var(--dsh-bg-subtle)   ← 克隆来的别名声明（在 body 求值）
//   --dsh-bg-subtle: #171B24                 ← 暗色原语
// 于是别名在 body 层重新求值成深色。我们的复刻漏了"别名也要克隆到 body"这一半。
//
// 修法：把别名层原样克隆到深色作用域，让它在 body 上重新求值。
// 只克隆别名（值含 var() 的那 9 个），不克隆字面量——字面量没有求值时机问题，
// 且整块克隆会改变与 skin.css 的层叠关系。这里从 tokens.css 的浅色根块现算，不手抄。
const aliasEntries = Object.entries(light).filter(([, value]) => value.includes('var('))
if (aliasEntries.length === 0) throw new Error('深色别名克隆：design/tokens.css 浅色根块里没找到 var() 别名，规则前提不成立，拒绝产出')

let darkAliasBlock = '\n/* ── 深色别名层：让 var() 别名在 body 上重新求值（见 build-skin.mjs 注释） ── */\n'
darkAliasBlock += PLUGIN_SCOPE + ' body[data-ds-dark-theme] {\n'
for (const [name, value] of aliasEntries) darkAliasBlock += '  ' + name + ': ' + value + ';\n'
darkAliasBlock += '}\n'

const scopedSkin = scopeSkinCss(css, { scope: PLUGIN_SCOPE, deriveFallbacks: true, defined: collectDefined(css) })
const scopedPatches = scopeSkinCss(patchSrc, { scope: PLUGIN_SCOPE, deriveFallbacks: false })

let pluginCss = '/* GENERATED by scripts/build-skin.mjs — 禁止手改。\n'
pluginCss += '   dsh-theme 插件版自包含样式：skins/dsh-ui/skin.css + patches.css 的作用域化结果，\n'
pluginCss += '   并把纯皮肤期由 skin-center loader 承担的 token 派生层显式复刻进来。\n'
pluginCss += '   作用域头：' + PLUGIN_SCOPE + '（body 级特异性 0,0,1,2，胜出官方 body{--dsw-*} 的 0,0,0,1） */\n\n'
pluginCss += '/* ── 段 1/2：L1 token 重映射 + L2/L3 组件规则（源 skins/dsh-ui/skin.css） ── */\n'
pluginCss += scopedSkin
pluginCss += darkAliasBlock
pluginCss += '\n/* ── 段 2/2：L2/L3 组件规则（源 skins/dsh-ui/patches.css） ── */\n'
pluginCss += scopedPatches

fs.mkdirSync(new URL('../plugins/dsh-theme/assets/', import.meta.url), { recursive: true })
fs.writeFileSync(PLUGIN_THEME, pluginCss)

// 自包含守卫：派生段必须真的进了产物，否则 patches.css 的 specific 组规则会回落到官方值
const derivedCount = (pluginCss.match(/color-mix\(in srgb, var\(--dsw-alias-bg-layer-1\) 60%, transparent\)/g) || []).length
if (derivedCount === 0) throw new Error('插件版样式缺少 loader 派生段——patches.css 的前提不成立，拒绝产出')
const unscoped = /(^|\n)\s*(:root|body)\s*\{/.test(pluginCss)
if (unscoped) throw new Error('插件版样式里还有未作用域化的 :root/body 规则——作用域化没生效')
console.log('theme.css 生成：' + pluginCss.length + ' 字节，作用域头 ' + PLUGIN_SCOPE + '，派生段 ' + derivedCount + ' 条 color-mix，未作用域化规则 0 条')
