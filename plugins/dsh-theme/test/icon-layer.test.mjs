/**
 * dsh-theme · M7 图标层回归测试。
 *
 * 覆盖三块（都用**真实实现**驱动，不是复制品）：
 *   A. 指纹归一化：属性顺序 / 命名风格 / 数值写法 / 显示尺寸 的稳定性
 *   B. 构建期与运行期一致性：client.js 的指纹核心 ↔ 构建脚本抽出来的那段 ↔ icon-map.json
 *   C. map 完整性：键集 ⊆ lucide.json、账要平、抽查已知指纹命中
 *   D. OFF 还原：iconRestorePlan 纯函数 + apply/restore 的真实往返
 *
 * 运行：node plugins/dsh-theme/test/icon-layer.test.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..', '..')
const CLIENT_PATH = path.resolve(HERE, '..', 'lib', 'client.js')
const MAP_PATH = path.resolve(HERE, '..', 'assets', 'icons', 'icon-map.json')
const LUCIDE_PATH = path.resolve(HERE, '..', 'assets', 'icons', 'lucide.json')
const INVENTORY_PATH = path.resolve(ROOT, '.agents', 'tmp', 'm7-icons', 'inventory.json')
const OVERRIDES_PATH = path.resolve(ROOT, 'scripts', 'icon-map-overrides.json')
const BUILDER_PATH = path.resolve(ROOT, 'scripts', 'build-icon-map.mjs')

let passed = 0
let failed = 0
const failures = []
function check(name, condition, detail) {
  if (condition) passed += 1
  else { failed += 1; failures.push(name + (detail ? ' :: ' + detail : '')) }
}
function eq(name, actual, expected) {
  check(name, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
}
function ne(name, a, b) { check(name, a !== b, '两者都是 ' + JSON.stringify(a)) }

// ── 最小 DOM 桩 ────────────────────────────────────────────────────────
function markConnected(node, value) {
  node.isConnected = value
  for (const child of node.children) markConnected(child, value)
}
function makeEl(tag) {
  const el = {
    nodeType: 1,
    tagName: String(tag),
    parentNode: null,
    isConnected: false,
    children: [],
    style: {},
    _attrs: [],
    setAttribute(name, value) {
      const found = this._attrs.find((a) => a.name === name)
      if (found) found.value = String(value)
      else this._attrs.push({ name, value: String(value) })
    },
    getAttribute(name) {
      const found = this._attrs.find((a) => a.name === name)
      return found ? found.value : null
    },
    removeAttribute(name) {
      const at = this._attrs.findIndex((a) => a.name === name)
      if (at !== -1) this._attrs.splice(at, 1)
    },
    appendChild(child) {
      child.parentNode = this
      this.children.push(child)
      markConnected(child, this.isConnected)
      return child
    },
    removeChild(child) {
      const at = this.children.indexOf(child)
      if (at !== -1) this.children.splice(at, 1)
      child.parentNode = null
      markConnected(child, false)
      return child
    },
    querySelector() { return null },
    querySelectorAll() { return [] },
  }
  Object.defineProperty(el, 'attributes', { get() { return this._attrs } })
  return el
}
function makeDocument() {
  const doc = {
    head: makeEl('head'),
    body: makeEl('body'),
    documentElement: makeEl('html'),
    hidden: false,
    _byId: new Map(),
    createElement: (tag) => makeEl(tag),
    createElementNS: (_ns, tag) => makeEl(tag),
    getElementById(id) { return doc._byId.get(id) || null },
    querySelectorAll() { return [] },
    addEventListener() {},
    removeEventListener() {},
  }
  doc.body.isConnected = true
  doc.head.isConnected = true
  return doc
}

// ── 加载真实 client.js ────────────────────────────────────────────────
let client = null
function loadClient() {
  if (client) return client
  const doc = makeDocument()
  globalThis.window = { document: doc, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) }
  globalThis.document = doc
  globalThis.Image = function () { this.onload = null; this.onerror = null; this.src = '' }
  // fetch 桩：只 mock 外部边界（HTTP），返回磁盘上的真产物——不 mock 被验证的对象本身。
  globalThis.fetch = (url) => {
    const file = String(url).endsWith('lucide.json') ? LUCIDE_PATH : MAP_PATH
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(JSON.parse(fs.readFileSync(file, 'utf8'))),
      text: () => Promise.resolve(fs.readFileSync(file, 'utf8')),
    })
  }
  let loaded = null
  window.__ModuleLoader__ = { load(spec) { loaded = spec.factory(() => ({})) } }
  ;(0, eval)(fs.readFileSync(CLIENT_PATH, 'utf8'))
  client = loaded
  return client
}
const C = loadClient()
const ICONS = C.__icons
const CORE = ICONS.core
const MAP = JSON.parse(fs.readFileSync(MAP_PATH, 'utf8'))
const LUCIDE = JSON.parse(fs.readFileSync(LUCIDE_PATH, 'utf8'))
const INVENTORY = JSON.parse(fs.readFileSync(INVENTORY_PATH, 'utf8'))
const OVERRIDES = JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf8'))

function shapesOf(list) { return list.map((s) => ({ tag: s.tag, attrs: s.attrs })) }
function el(tag, attrs) {
  const node = makeEl(tag)
  for (const [k, v] of Object.entries(attrs || {})) node.setAttribute(k, v)
  return node
}
function svgWith(viewBox, children, extra) {
  const svg = makeEl('svg')
  if (viewBox !== null && viewBox !== undefined) svg.setAttribute('viewBox', viewBox)
  for (const [k, v] of Object.entries(extra || {})) svg.setAttribute(k, v)
  for (const child of children) svg.appendChild(child)
  markConnected(svg, true)
  return svg
}

// ══ A. 指纹归一化 ═════════════════════════════════════════════════════
{
  const a = { tag: 'path', attrs: { d: 'M2 2 L 4 4', strokeWidth: '1.5', fill: 'none' } }
  const b = { tag: 'path', attrs: { fill: 'none', strokeWidth: '1.5', d: 'M2 2 L 4 4' } }
  eq('A1 属性书写顺序不影响指纹', CORE.fingerprint('0 0 16 16', [a]), CORE.fingerprint('0 0 16 16', [b]))

  // 显示尺寸（width/height/class/style）不是几何，不该进指纹——这就是「同形不同尺寸」的稳定性
  const small = svgWith('0 0 16 16', [el('path', { d: 'M2 2 L 4 4' })], { width: '16', height: '16', class: 'icon-a' })
  const large = svgWith('0 0 16 16', [el('path', { d: 'M2 2 L 4 4' })], { width: '48', height: '48', class: 'icon-b' })
  eq('A2 同形不同显示尺寸 → 同指纹', CORE.fingerprint(small.getAttribute('viewBox'), ICONS.shapesFromElement(small)), CORE.fingerprint(large.getAttribute('viewBox'), ICONS.shapesFromElement(large)))

  // 数值写法规范化
  const p1 = { tag: 'path', attrs: { d: 'M2.0 2.00L4 4' } }
  const p2 = { tag: 'path', attrs: { d: 'M2 2L4 4' } }
  eq('A3 数值尾零不影响指纹', CORE.fingerprint('0 0 16 16', [p1]), CORE.fingerprint('0 0 16 16', [p2]))

  const q1 = { tag: 'polyline', attrs: { points: '1,2 3,4' } }
  const q2 = { tag: 'polyline', attrs: { points: '1 2 3 4' } }
  eq('A4 points 逗号/空格等价', CORE.fingerprint('0 0 16 16', [q1]), CORE.fingerprint('0 0 16 16', [q2]))

  // viewBox 写法规范化
  eq('A5 viewBox 逗号分隔等价', CORE.fingerprint('0,0,16,16', [p2]), CORE.fingerprint('0 0 16 16', [p2]))
  eq('A6 viewBox 数值尾零等价', CORE.fingerprint('0 0 16.0 16', [p2]), CORE.fingerprint('0 0 16 16', [p2]))

  // 命名风格：JSX 侧写 fillRule，DOM 侧是 fill-rule
  const camel = { tag: 'path', attrs: { d: 'M2 2', fillRule: 'evenodd' } }
  const kebab = { tag: 'path', attrs: { d: 'M2 2', 'fill-rule': 'evenodd' } }
  eq('A7 camelCase 与 kebab 等价（JSX ↔ DOM）', CORE.fingerprint('0 0 16 16', [camel]), CORE.fingerprint('0 0 16 16', [kebab]))

  // viewBox 参与完整指纹；几何指纹则刻意不含 viewBox（回退索引用它兜尺寸漂移）
  ne('A8 不同 viewBox → 完整指纹不同', CORE.fingerprint('0 0 16 16', [p2]), CORE.fingerprint('0 0 24 24', [p2]))
  eq('A9 不同 viewBox → 几何指纹相同（回退索引的口径）', CORE.geometryFingerprint([p2]), CORE.geometryFingerprint([p2]))

  // 非几何标签不参与
  const withG = { tag: 'g', attrs: { transform: 'translate(1 1)', stroke: 'red' } }
  eq('A10 g/defs 等非几何形状不进指纹', CORE.fingerprint('0 0 16 16', [withG, p2]), CORE.fingerprint('0 0 16 16', [p2]))

  // 形状顺序仍然参与（几何签名按文档顺序拼接）
  const s1 = { tag: 'circle', attrs: { cx: '1', cy: '1', r: '1' } }
  const s2 = { tag: 'circle', attrs: { cx: '2', cy: '2', r: '2' } }
  ne('A11 形状顺序影响指纹（顺序是几何的一部分）', CORE.fingerprint('0 0 16 16', [s1, s2]), CORE.fingerprint('0 0 16 16', [s2, s1]))

  // 空形状 / 动态 viewBox
  eq('A12 没有几何形状 → null', CORE.fingerprint('0 0 16 16', []), null)
  eq('A13 viewBox 非字面量 → 完整指纹退化成 vb:?（几何指纹仍可用）', CORE.fingerprint('0 0 ${size} ${size}', [p2]), CORE.fingerprint(null, [p2]))
  eq('A14 没有几何 → 几何指纹 null', CORE.geometryFingerprint([]), null)

  // 已注入的 Lucide 节点必须被遍历跳过，否则已替换的 svg 会拿新几何去查表
  const host = svgWith('0 0 16 16', [el('path', { d: 'M2 2 L 4 4' })])
  const before = ICONS.shapesFromElement(host).length
  const injected = el('g', { [ICONS.ICON_LUCIDE_ATTR]: '' })
  injected.appendChild(el('path', { d: 'M12 2 L 2 22' }))
  host.appendChild(injected)
  eq('A15 遍历跳过本插件注入的节点', ICONS.shapesFromElement(host).length, before)
}

// ══ B. 构建期 ↔ 运行期一致性 ═════════════════════════════════════════
{
  const builder = await import(pathToFileURL(BUILDER_PATH).href)
  const clientText = fs.readFileSync(CLIENT_PATH, 'utf8')
  const start = clientText.indexOf('/* @dsh-theme-icon-core:start */')
  const end = clientText.indexOf('/* @dsh-theme-icon-core:end */', start)
  check('B1 client.js 里有指纹核心标记段', start !== -1 && end !== -1 && end > start)
  const coreSource = clientText.slice(start + '/* @dsh-theme-icon-core:start */'.length, end)
  const nodeCore = builder.loadCore(coreSource)
  const hash = builder.coreHashOf(coreSource)
  eq('B2 icon-map.json 记录的 coreHash 与当前 client.js 一致（防「改了核心没重跑构建」）', MAP.meta.fingerprint.coreHash, hash)

  const corpus = [
    ['0 0 16 16', [{ tag: 'path', attrs: { d: 'M2 2 L 4 4', strokeWidth: '1.5' } }]],
    ['0 0 24 24', [{ tag: 'circle', attrs: { cx: '12', cy: '12', r: '10' } }]],
    [null, [{ tag: 'rect', attrs: { x: '1', y: '2', width: '3', height: '4', rx: '1' } }]],
    ['0 0 36 36', [{ tag: 'polyline', attrs: { points: '1,2 3,4' } }, { tag: 'g', attrs: { fill: 'red' } }]],
    ['0 0 16 16', []],
  ]
  let mismatch = 0
  for (const [vb, shapes] of corpus) {
    if (nodeCore.fingerprint(vb, shapes) !== CORE.fingerprint(vb, shapes)) mismatch += 1
    if (nodeCore.geometryFingerprint(shapes) !== CORE.geometryFingerprint(shapes)) mismatch += 1
  }
  eq('B3 构建侧与运行侧同一实现（同输入同哈希，无漂移）', mismatch, 0)

  // 抽查 10 个已知指纹：从清单取已映射条目，用运行侧核心算指纹，必须命中 map 且名字对得上
  const lucideKeys = new Set(Object.keys(LUCIDE.icons))
  const rename = OVERRIDES.rename || {}
  const byId = OVERRIDES.byId || {}
  const skip = OVERRIDES.skip || {}
  const GEO = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'])
  const GEO_ATTRS = new Set(['d', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2'])
  const candidates = []
  for (const entry of INVENTORY.icons) {
    if (skip[entry.guessName] || entry.flags.zeroShapes) continue
    if ((entry.shapes || []).some((s) => (s.dynamic || []).some((a) => GEO_ATTRS.has(a)))) continue
    // 与构建脚本同一解析顺序：byId（精确） > rename（按名批量） > guessName 同名
    const name = byId[entry.id] || rename[entry.guessName] || (lucideKeys.has(entry.guessName) ? entry.guessName : null)
    if (!name) continue
    const shapes = shapesOf((entry.shapes || []).filter((s) => GEO.has(String(s.tag).toLowerCase())))
    const fp = CORE.fingerprint(entry.viewBox, shapes)
    if (fp === null) continue
    candidates.push({ entry, name, fp, shapes })
  }
  check('B4 抽查样本池够 10 条', candidates.length >= 10, 'pool=' + candidates.length)
  const sample = []
  const step = Math.max(1, Math.floor(candidates.length / 10))
  for (let i = 0; i < candidates.length && sample.length < 10; i += step) sample.push(candidates[i])
  let hit = 0
  const misses = []
  for (const item of sample) {
    const row = MAP.icons[item.fp]
    if (row && row.name === item.name) hit += 1
    else misses.push(item.entry.guessName + ' ' + item.fp + ' -> ' + (row ? row.name : 'MISSING'))
  }
  eq('B5 抽查 10 个已知指纹全部命中且名字正确', hit, sample.length, misses.join(' | '))
}

// ══ C. map 完整性 ════════════════════════════════════════════════════
{
  const lucideKeys = new Set(Object.keys(LUCIDE.icons))
  const badFull = Object.entries(MAP.icons).filter(([, v]) => !lucideKeys.has(v.name))
  const badGeo = Object.entries(MAP.byGeometry).filter(([, v]) => !lucideKeys.has(v.name))
  eq('C1 icons 索引里的每个 Lucide 名都存在于 lucide.json', badFull.length, 0, JSON.stringify(badFull.slice(0, 3)))
  eq('C2 byGeometry 索引里的每个 Lucide 名都存在于 lucide.json', badGeo.length, 0, JSON.stringify(badGeo.slice(0, 3)))

  const total = MAP.meta.coverage.total
  const mapped = MAP.meta.coverage.mapped
  const unmapped = MAP.meta.coverage.unmapped
  eq('C3 账要平：mapped + unmapped = total', mapped + unmapped, total)
  eq('C4 total 与清单条数一致', total, INVENTORY.icons.length)
  eq('C5 unmapped 数组长度与 meta 一致', MAP.unmapped.length, unmapped)

  const REASONS = new Set(['zero-shapes', 'dynamic-geometry', 'hardcoded-paint', 'curated-skip', 'no-lucide-match', 'fingerprint-conflict'])
  const badReason = MAP.unmapped.filter((u) => !REASONS.has(u.reason))
  eq('C6 未映射理由都在枚举内', badReason.length, 0, JSON.stringify(badReason.slice(0, 3)))

  const dupKeys = Object.keys(MAP.icons).filter((k) => MAP.icons[k].name === undefined)
  eq('C7 每个 icons 条目都带 name', dupKeys.length, 0)

  // 每个 Lucide 名对应的图标确实有几何元素（否则运行时换上的是空图标）
  let emptyIcons = 0
  const seen = new Set()
  for (const row of [...Object.values(MAP.icons), ...Object.values(MAP.byGeometry)]) {
    if (seen.has(row.name)) continue
    seen.add(row.name)
    const icon = LUCIDE.icons[row.name]
    if (!icon || !Array.isArray(icon.elements) || icon.elements.length === 0) emptyIcons += 1
  }
  eq('C8 map 用到的 Lucide 图标都有几何元素', emptyIcons, 0)

  // 覆盖率不低于已确认的基线（只许收紧不许放松：这是棘轮，不是目标）
  check('C9 覆盖率不低于 79.9%（111/139，策展棘轮，只许收紧不许放松）', mapped >= 111, 'mapped=' + mapped)

  // C10–C12：策展表的两条通道都真的生效
  const byId = OVERRIDES.byId || {}
  check('C10 策展表 byId 至少有一条（精确改）', Object.keys(byId).length >= 1)
  const geoTagSet = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'])
  const geoAttrSet = new Set(['d', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2'])
  const renameTbl = OVERRIDES.rename || {}
  const skipTbl = OVERRIDES.skip || {}
  const badById = []
  for (const [id, want] of Object.entries(byId)) {
    const entry = INVENTORY.icons.find((e) => e.id === id)
    if (!entry) { badById.push(id + ' 不在清单里'); continue }
    if (skipTbl[entry.guessName]) { badById.push(id + ' 落在 skip 里'); continue }
    const shapes = shapesOf((entry.shapes || []).filter((x) => geoTagSet.has(String(x.tag).toLowerCase())))
    if (shapes.some((x) => (x.attrs && Object.keys(x.attrs).some((k) => geoAttrSet.has(k))) === false)) { /* 允许 */ }
    const fp = CORE.fingerprint(entry.viewBox, shapes)
    if (fp === null) { badById.push(id + ' 指纹为 null'); continue }
    const row = MAP.icons[fp]
    if (!row || row.name !== want) badById.push(id + ' 期望 ' + want + ' 实得 ' + (row ? row.name : 'MISSING'))
  }
  eq('C11 byId 的每条精确改都落到了 map 上', badById.length, 0, badById.join(' | '))

  // C12：rename 里凡是被映射用到的 guessName，map 里该 guessName 的条目都用了改名后的 lucide 名
  const renameMismatch = []
  for (const [guess, want] of Object.entries(renameTbl)) {
    for (const row of Object.values(MAP.icons)) {
      if (row.guessName === guess && byId[row.dsh] === undefined && row.name !== want) {
        renameMismatch.push(guess + '/' + row.dsh + ' 期望 ' + want + ' 实得 ' + row.name)
      }
    }
  }
  eq('C12 rename 的每条批量改都落到了 map 上', renameMismatch.length, 0, renameMismatch.slice(0, 4).join(' | '))

  // C13：权限三态（只读 / 工作区内修改 / 完全访问）必须是三个**不同**的 Lucide 名。
  // 回归形态：三条都落在 guessName「shield」上 → 全变同一个盾牌，权限区分被抹掉（M7 裁决 1a 修的就是这个）。
  const SHIELD_IDS = ['ico-dd057232', 'ico-5802076f', 'ico-051dff15']
  const shieldNames = []
  for (const id of SHIELD_IDS) {
    const entry = INVENTORY.icons.find((e) => e.id === id)
    if (!entry) { shieldNames.push(id + ':MISSING'); continue }
    const shapes = shapesOf((entry.shapes || []).filter((x) => geoTagSet.has(String(x.tag).toLowerCase())))
    const fp = CORE.fingerprint(entry.viewBox, shapes)
    shieldNames.push(fp && MAP.icons[fp] ? MAP.icons[fp].name : 'UNMAPPED')
  }
  eq('C13 权限三态映射到三个不同的 Lucide 名', new Set(shieldNames).size, 3, JSON.stringify(shieldNames))

  // C14：curated-skip 的条目一个都不许出现在索引里（skip 是「保持原图标」的承诺）
  const skipLeak = []
  for (const entry of INVENTORY.icons) {
    if (!skipTbl[entry.guessName]) continue
    const shapes = shapesOf((entry.shapes || []).filter((x) => geoTagSet.has(String(x.tag).toLowerCase())))
    const fp = CORE.fingerprint(entry.viewBox, shapes)
    if (fp && MAP.icons[fp]) skipLeak.push(entry.guessName + '/' + entry.id)
    const gfp = CORE.geometryFingerprint(shapes)
    if (gfp && MAP.byGeometry[gfp]) skipLeak.push('byGeometry:' + entry.guessName + '/' + entry.id)
  }
  eq('C14 curated-skip 的条目没有漏进任何索引', skipLeak.length, 0, skipLeak.slice(0, 4).join(' | '))
}

// ══ D. OFF 还原 ══════════════════════════════════════════════════════
{
  // D1–D3：iconRestorePlan 纯函数
  eq('D1 没有快照 → noop', ICONS.restorePlan(null).action, 'noop')
  eq('D1b 没有快照的理由', ICONS.restorePlan(null).reason, 'no-record')

  const liveSvg = makeEl('svg')
  const injected = el('g', { [ICONS.ICON_LUCIDE_ATTR]: '' })
  liveSvg.appendChild(injected)
  const original = el('path', { d: 'M2 2 L 4 4' })
  liveSvg.appendChild(original)
  markConnected(liveSvg, true)
  const plan = ICONS.restorePlan({ svg: liveSvg, injected: [injected], originals: [original] })
  eq('D2 正常快照 → restore', plan.action, 'restore')
  eq('D2b 正常快照要撤 1 个注入节点', plan.detachInjected.length, 1)
  eq('D2c 正常快照要清 1 个原节点标记', plan.clearMarkers.length, 1)
  eq('D2d 正常快照要还原 viewBox', plan.restoreViewBox, true)

  const deadSvg = makeEl('svg')
  deadSvg.appendChild(injected)
  markConnected(deadSvg, false)
  const deadPlan = ICONS.restorePlan({ svg: deadSvg, injected: [injected], originals: [original] })
  eq('D3 svg 已脱离文档 → detach-only', deadPlan.action, 'detach-only')
  eq('D3b 脱离时仍要撤注入节点', deadPlan.detachInjected.length, 1)
  eq('D3c 脱离时**不**还原 viewBox（不碰已脱离的 DOM）', deadPlan.restoreViewBox, false)
  eq('D3d 脱离时仍清标记（标记是纯字符串，留着会让复用的原节点保持隐藏）', deadPlan.clearMarkers.length, 1)

  // D4：真实 apply → restore 往返
  await ICONS.load()
  const icon = LUCIDE.icons['user']
  check('D4 测试用的 lucide 图标存在', Boolean(icon && icon.elements.length))

  const host = makeEl('svg')
  host.setAttribute('viewBox', '0 0 16 16')
  host.setAttribute('width', '16')
  host.setAttribute('height', '16')
  host.setAttribute('class', 'dsh-icon')
  const p1 = el('path', { d: 'M8 2v4', stroke: 'currentColor', strokeWidth: '1.5' })
  const p2 = el('circle', { cx: '8', cy: '12', r: '3' })
  host.appendChild(p1)
  host.appendChild(p2)
  markConnected(host, true)

  const okApply = ICONS.apply(host, 'user')
  eq('D5 apply 成功', okApply, true)
  eq('D6 宿主 viewBox 归一到 24 网格', host.getAttribute('viewBox'), ICONS.ICON_VIEWBOX)
  eq('D7 宿主 width 不被改动', host.getAttribute('width'), '16')
  eq('D8 宿主 class 不被改动', host.getAttribute('class'), 'dsh-icon')
  eq('D9 宿主打上已替换标记', host.getAttribute(ICONS.ICON_ATTR), 'user')
  eq('D10 原节点被标记隐藏', p1.getAttribute(ICONS.ICON_HIDDEN_ATTR), 'user')
  eq('D11 原节点仍留在 DOM 里（React 的引用必须继续有效）', host.children.includes(p1) && host.children.includes(p2), true)
  const groups = host.children.filter((c) => c.getAttribute(ICONS.ICON_LUCIDE_ATTR) !== null)
  eq('D12 注入了一枚 Lucide <g>', groups.length, 1)
  eq('D13 <g> 的子元素数 = lucide.json 的元素数', groups[0].children.length, icon.elements.length)
  eq('D14 <g> 带上 lucide 根属性 fill', groups[0].getAttribute('fill'), 'none')
  eq('D15 <g> 带上 lucide 根属性 stroke', groups[0].getAttribute('stroke'), 'currentColor')
  eq('D16 <g> 带上 lucide 根属性 stroke-width', groups[0].getAttribute('stroke-width'), '2')
  eq('D17 子元素按 lucide.json 原样带 d', groups[0].children[0].getAttribute('d'), icon.elements[0].attrs.d)

  const okRestore = ICONS.restore(host)
  eq('D18 restore 成功', okRestore, true)
  eq('D19 viewBox 还原', host.getAttribute('viewBox'), '0 0 16 16')
  eq('D20 已替换标记清除', host.getAttribute(ICONS.ICON_ATTR), null)
  eq('D21 原节点隐藏标记清除', p1.getAttribute(ICONS.ICON_HIDDEN_ATTR), null)
  eq('D22 注入的 <g> 被摘掉', host.children.filter((c) => c.getAttribute(ICONS.ICON_LUCIDE_ATTR) !== null).length, 0)
  eq('D23 原节点仍在且顺序不变', host.children[0] === p1 && host.children[1] === p2, true)
  eq('D24 快照已清', ICONS.records().has(host), false)
  eq('D25 重复 restore 幂等（无快照时不抛）', ICONS.restore(host), false)

  // D26：宿主原本没有 viewBox → 还原要把它删掉，而不是留一个 0 0 24 24
  const noVb = makeEl('svg')
  noVb.appendChild(el('path', { d: 'M2 2 L 4 4' }))
  markConnected(noVb, true)
  ICONS.apply(noVb, 'user')
  eq('D26 apply 给无 viewBox 的宿主补了一个', noVb.getAttribute('viewBox'), ICONS.ICON_VIEWBOX)
  ICONS.restore(noVb)
  eq('D27 还原后 viewBox 属性被移除（不是留下 24 网格）', noVb.getAttribute('viewBox'), null)

  // D28：svh 已脱离文档时还原不抛、不造游离 DOM
  const dead = makeEl('svg')
  const deadChild = el('path', { d: 'M2 2' })
  dead.appendChild(deadChild)
  markConnected(dead, true)
  ICONS.apply(dead, 'user')
  const deadGroup = dead.children.filter((c) => c.getAttribute(ICONS.ICON_LUCIDE_ATTR) !== null)[0]
  markConnected(dead, false)
  let threw = null
  try { ICONS.restore(dead) } catch (error) { threw = error }
  eq('D28 脱离文档的宿主还原不抛异常', threw, null)
  eq('D29 脱离时注入节点被撤掉', deadGroup.parentNode, null)
  eq('D30 脱离时原节点标记仍被清（不硬插回、不造游离 DOM）', deadChild.getAttribute(ICONS.ICON_HIDDEN_ATTR), null)
  eq('D31 脱离时原节点仍在原位（我们没有动它）', dead.children.includes(deadChild), true)

  // D32：lookup 走完整指纹优先、几何指纹兜底。
  // 用清单里**真实**的一条已映射图标搭 DOM——指纹表是 DSH 自绘几何的字典，
  // 随便造一条 path 本来就不该命中（那正是 D34 的负控制）。
  const realEntry = INVENTORY.icons.find((e) => {
    if (e.flags.zeroShapes || e.viewBox === null) return false
    if ((e.shapes || []).some((x) => (x.dynamic || []).length)) return false
    return (e.shapes || []).length > 0
  })
  check('D32a 找到一条真实清单条目做正例', Boolean(realEntry))
  const vbHost = makeEl('svg')
  vbHost.setAttribute('viewBox', realEntry.viewBox)
  for (const shape of realEntry.shapes) {
    if (!['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'].includes(String(shape.tag).toLowerCase())) continue
    const node = makeEl(shape.tag)
    for (const [k, v] of Object.entries(shape.attrs || {})) {
      if (k === 'className' || k === 'style' || k === 'key' || k === 'ref') continue
      node.setAttribute(k, v)
    }
    vbHost.appendChild(node)
  }
  markConnected(vbHost, true)
  const lookupHit = ICONS.lookup(vbHost)
  eq('D32b 真实清单几何命中（完整或几何索引）', lookupHit.hit, true)
  eq('D33 命中的名字是 lucide 里存在的名字', Boolean(LUCIDE.icons[lookupHit.name]), true)
  eq('D33b 命中来源标注为 full 或 geometry', ['full', 'geometry'].includes(lookupHit.via), true)
  const unknown = makeEl('svg')
  unknown.setAttribute('viewBox', '0 0 16 16')
  unknown.appendChild(el('path', { d: 'M99 99 L 98 98' }))
  markConnected(unknown, true)
  eq('D34 未知几何不命中', ICONS.lookup(unknown).hit, false)
}

console.log('')
console.log('passed: ' + passed)
console.log('failed: ' + failed)
if (failures.length) {
  console.log('')
  console.log('FAILURES:')
  for (const f of failures) console.log('  - ' + f)
}
console.log('')
console.log(failed === 0 ? 'RESULT: PASS' : 'RESULT: FAIL')
process.exit(failed === 0 ? 0 : 1)
