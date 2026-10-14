#!/usr/bin/env node
/**
 * build-icon-map.mjs — 把 DSH shell 的图标清单（inventory.json）与 Lucide 数据（lucide.json）
 * 合成**指纹 → Lucide 图标名**的映射表 plugins/dsh-theme/assets/icons/icon-map.json。
 *
 * 用法：
 *   node scripts/build-icon-map.mjs                       # 默认路径，直接构建
 *   node scripts/build-icon-map.mjs --inventory <json>    # 换清单
 *   node scripts/build-icon-map.mjs --lucide <json>       # 换 Lucide 数据
 *   node scripts/build-icon-map.mjs --out <json>          # 换输出
 *   node scripts/build-icon-map.mjs --overrides <json>    # 换人工策展表
 *   node scripts/build-icon-map.mjs --client <js>         # 换 client 半（指纹核心的唯一来源）
 *   node scripts/build-icon-map.mjs --generated-at <ISO>  # 固定 generatedAt（可重现构建）
 *   node scripts/build-icon-map.mjs --report-only         # 只打覆盖率报告，不落盘
 *   node scripts/build-icon-map.mjs --help
 *
 * ── 设计要点 ──────────────────────────────────────────────────────────────
 * 1) **指纹核心只有一份实现**。归一化 + 哈希的代码写在 lib/client.js 里，
 *    夹在一对标记注释「@dsh-theme-icon-core:start」/「@dsh-theme-icon-core:end」之间。
 *    本脚本把那一段**原文抽出来**在 Node 侧执行。这样浏览器侧与构建侧不可能漂移
 *    （两份拷贝最典型的失败是：构建期覆盖率很好看、运行时一个都不命中）。
 *    代价是改动耦合——改指纹核心必须重跑本脚本；meta.coreHash 记录核心文本的 sha256，
 *    测试用同一段文本重算并比对，能当场发现「改了核心没重跑构建」的陈旧产物。
 *
 * 2) **指纹的口径**（见 client.js 核心段注释）：viewBox 规范化 + 全部几何形状的
 *    几何签名（按 tag 白名单取属性、属性名 camelCase→kebab、数值与路径数据规范化、
 *    属性键排序）。**刻意排除** width/height/class/style 等呈现属性——同一个图标在
 *    不同调用点用不同尺寸渲染时必须同指纹，这正是「同形不同尺寸稳定性」的含义。
 *
 * 3) **两个索引**：
 *    - icons[指纹]      ：完整指纹（含 viewBox），运行时首选。
 *    - byGeometry[指纹] ：**只含几何**的指纹，作为回退。用于 viewBox 在源码里是表达式
 *      （拿不到字面量）的条目，也兜住「运行时 viewBox 与抽取时不一致」的漂移。
 *      只有当该几何指纹在全部已映射条目里**唯一指向同一个 Lucide 名**时才收录，
 *      否则歧义匹配会换错图标——宁可不换。
 *
 * 4) **不映射要如实入清单**，不许静默丢弃。理由枚举：
 *      zero-shapes        抽取时就没拿到形状（形状经变量传入）
 *      dynamic-geometry   几何属性是表达式，运行时值未知，指纹算不出来
 *      hardcoded-paint    用硬编码 fill/stroke 表达语义（品牌色/插画式图形），
 *                         换成 Lucide 线性图标会丢语义，按策展不替换
 *      curated-skip       overrides.skip 里人工判定不替换
 *      no-lucide-match    guessName 与 overrides 都对不上 lucide 里的任何名字
 *      fingerprint-conflict  两条清单项归一化后撞同一指纹且指向不同 Lucide 名
 *
 * 5) **守卫（红了就中止，不写产物）**：
 *      - map 里出现的每个 Lucide 名必须真实存在于 lucide.json
 *      - overrides.rename 里的每个 Lucide 名必须真实存在（负控制就靠这条）
 *      - 指纹冲突必须为 0（有冲突即说明归一化太粗，宁可构建红）
 *      - 已映射数 + 未映射数 === 清单总数（不许有条目凭空消失）
 *      - 指纹核心段落必须能在 client.js 里找到
 *
 * 产物：plugins/dsh-theme/assets/icons/icon-map.json —— 构建生成物，**禁止手改**。
 * 零依赖：只用 node 内置模块。
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULTS = {
  inventory: path.join(ROOT, '.agents/tmp/m7-icons/inventory.json'),
  lucide: path.join(ROOT, 'plugins/dsh-theme/assets/icons/lucide.json'),
  out: path.join(ROOT, 'plugins/dsh-theme/assets/icons/icon-map.json'),
  overrides: path.join(ROOT, 'scripts/icon-map-overrides.json'),
  client: path.join(ROOT, 'plugins/dsh-theme/lib/client.js'),
  generatedAt: null,
  reportOnly: false,
}

/** 指纹核心段在 client.js 里的标记。改这里必须同步改 client.js。 */
const CORE_START = '/* @dsh-theme-icon-core:start */'
const CORE_END = '/* @dsh-theme-icon-core:end */'

/** 几何属性白名单：与 client.js 核心段的 GEO_ATTRS 同名同义（这里只用于构建侧预筛形状）。 */
const GEOMETRY_TAGS = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon'])
/** 会进指纹的几何属性（构建侧用；权威定义在 client.js 核心段）。 */
const GEOMETRY_ATTRS = new Set(['d', 'points', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2'])

function parseArgs(argv) {
  const opts = { ...DEFAULTS }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = () => {
      const v = argv[++i]
      if (v === undefined) throw new Error(a + ' 缺少参数值')
      return v
    }
    switch (a) {
      case '--inventory': opts.inventory = path.resolve(next()); break
      case '--lucide': opts.lucide = path.resolve(next()); break
      case '--out': opts.out = path.resolve(next()); break
      case '--overrides': opts.overrides = path.resolve(next()); break
      case '--client': opts.client = path.resolve(next()); break
      case '--generated-at': opts.generatedAt = next(); break
      case '--report-only': opts.reportOnly = true; break
      case '--help': case '-h':
        console.log(
          '用法: node scripts/build-icon-map.mjs [--inventory <json>] [--lucide <json>]\n' +
          '                                [--out <json>] [--overrides <json>] [--client <js>]\n' +
          '                                [--generated-at <ISO>] [--report-only]',
        )
        process.exit(0)
        break
      default: throw new Error('未知参数: ' + a)
    }
  }
  if (!opts.generatedAt && process.env.SOURCE_DATE_EPOCH) {
    opts.generatedAt = new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  }
  opts.generatedAt = opts.generatedAt || new Date().toISOString()
  return opts
}

/**
 * 从 client.js 抽出指纹核心段原文。
 * 抽不到 = 标记被删或改名，直接抛错（否则构建会拿一个空核心静默产出全错的 map）。
 */
function extractCoreSource(clientText) {
  const start = clientText.indexOf(CORE_START)
  if (start === -1) throw new Error('client.js 里找不到 ' + CORE_START + '，指纹核心段缺失')
  const end = clientText.indexOf(CORE_END, start)
  if (end === -1) throw new Error('client.js 里找不到 ' + CORE_END + '，指纹核心段未闭合')
  const body = clientText.slice(start + CORE_START.length, end)
  if (body.trim() === '') throw new Error('client.js 的指纹核心段是空的')
  return body
}

/** 核心段文本的稳定哈希：换行统一成 LF、首尾去空白，避免行尾风格影响。 */
export function coreHashOf(coreSource) {
  const normalized = coreSource.replace(/\r\n/g, '\n').trim()
  return createHash('sha256').update(normalized, 'utf8').digest('hex')
}

/** 在 Node 侧执行抽出来的核心段，拿回纯函数集。 */
export function loadCore(coreSource) {
  // eslint-disable-next-line no-new-func
  const factory = new Function(coreSource + '\nreturn iconCore;')
  const core = factory()
  if (!core || typeof core.fingerprint !== 'function') throw new Error('指纹核心段没有导出 iconCore')
  return core
}

/** inventory 的一条 icon 记录 → 核心函数要的 shapes 形态（只留几何形状）。 */
function inventoryShapes(entry) {
  const out = []
  for (const s of entry.shapes || []) {
    const tag = String(s.tag || '').toLowerCase()
    if (!GEOMETRY_TAGS.has(tag)) continue
    const attrs = {}
    for (const [k, v] of Object.entries(s.attrs || {})) {
      if (k === 'className' || k === 'style' || k === 'key' || k === 'ref') continue
      attrs[k] = v
    }
    out.push({ tag, attrs })
  }
  return out
}

/** 该条目的几何是否含「运行时才知道」的表达式属性——有就不该进 map。 */
function dynamicGeometry(entry) {
  const hits = []
  for (const s of entry.shapes || []) {
    for (const name of s.dynamic || []) {
      if (GEOMETRY_ATTRS.has(name)) hits.push(s.tag + '.' + name)
    }
  }
  return hits
}

/** 硬编码颜色（非 currentColor / none）—— 品牌色或插画式图形，按策展不替换。 */
function hardcodedPaint(entry) {
  const bad = new Set()
  const consider = (key, value) => {
    if (value === undefined || value === null) return
    if (key !== 'fill' && key !== 'stroke') return
    const v = String(value).trim()
    if (v === 'currentColor' || v === 'none' || v === '') return
    bad.add(key + '=' + v)
  }
  for (const [k, v] of Object.entries(entry.presentation || {})) consider(k, v)
  for (const s of entry.shapes || []) {
    for (const [k, v] of Object.entries(s.attrs || {})) consider(k, v)
  }
  return [...bad].sort()
}

async function readJson(file, what) {
  let text
  try {
    text = await readFile(file, 'utf8')
  } catch (error) {
    throw new Error('读不到' + what + '：' + file + '（' + error.code + '）')
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(what + '不是合法 JSON：' + file + ' :: ' + error.message)
  }
}

export async function buildIconMap(opts) {
  const clientText = await readFile(opts.client, 'utf8')
  const coreSource = extractCoreSource(clientText)
  const coreHash = coreHashOf(coreSource)
  const core = loadCore(coreSource)

  const inventory = await readJson(opts.inventory, '图标清单')
  const lucide = await readJson(opts.lucide, 'Lucide 数据')
  const overrides = await readJson(opts.overrides, '策展表')
  if (!Array.isArray(inventory.icons)) throw new Error('图标清单缺少 icons 数组：' + opts.inventory)
  const lucideKeys = new Set(Object.keys(lucide.icons || {}))
  if (lucideKeys.size === 0) throw new Error('Lucide 数据里没有任何图标：' + opts.lucide)

  const rename = overrides.rename || {}
  // byId：按清单条目 id 精确改，优先级高于 rename。用于同一个 guessName 底下混进语义不同图标的情况。
  const byId = overrides.byId || {}
  const skip = overrides.skip || {}

  // 守卫①：策展表里的 Lucide 名必须真实存在。负控制（把某个名字改成不存在的值）
  // 就是靠这条红的——守卫若被绕过，运行时那次替换会静默失败。
  const badOverrides = []
  for (const [guess, lucideName] of Object.entries(rename)) {
    if (!lucideKeys.has(lucideName)) badOverrides.push('rename.' + guess + ' -> ' + lucideName)
  }
  for (const [id, lucideName] of Object.entries(byId)) {
    if (!lucideKeys.has(lucideName)) badOverrides.push('byId.' + id + ' -> ' + lucideName)
    if (!inventory.icons.some((e) => e.id === id)) badOverrides.push('byId.' + id + ' -> 清单里没有这个 id')
  }
  if (badOverrides.length) {
    throw new Error(
      '策展表指向了 lucide.json 里不存在的图标名（或清单里不存在的 id）（' + badOverrides.length + ' 条）：\n  ' +
      badOverrides.join('\n  ') + '\n请核对 lucide-static 的 kebab 名，或从策展表里删掉该条。',
    )
  }

  const icons = {}
  const byGeometry = {}
  const unmapped = []
  const conflicts = []
  const mappedEntries = []

  for (const entry of inventory.icons) {
    const id = entry.id
    const guessName = entry.guessName
    const occurrences = entry.occurrences || 1
    const base = { dsh: id, guessName, occurrences, viewBox: entry.viewBox ?? null }

    if (skip[guessName]) {
      unmapped.push({ ...base, reason: 'curated-skip', detail: skip[guessName] })
      continue
    }
    if (entry.flags && entry.flags.zeroShapes) {
      unmapped.push({ ...base, reason: 'zero-shapes', detail: '形状经变量传入，抽取时未拿到几何' })
      continue
    }
    const dyn = dynamicGeometry(entry)
    if (dyn.length) {
      unmapped.push({ ...base, reason: 'dynamic-geometry', detail: '几何属性是表达式：' + [...new Set(dyn)].join(', ') })
      continue
    }
    const paint = hardcodedPaint(entry)
    if (paint.length) {
      unmapped.push({ ...base, reason: 'hardcoded-paint', detail: '硬编码着色：' + paint.join(', ') })
      continue
    }
    // 解析顺序：byId（精确） > rename（按名批量） > guessName 同名。
    const lucideName = byId[id] || rename[guessName] || (lucideKeys.has(guessName) ? guessName : null)
    if (lucideName === null) {
      unmapped.push({ ...base, reason: 'no-lucide-match', detail: 'guessName「' + guessName + '」在 lucide 无同名条目，且策展表未给映射' })
      continue
    }
    const shapes = inventoryShapes(entry)
    const fp = core.fingerprint(entry.viewBox ?? null, shapes)
    const geo = core.geometryFingerprint(shapes)
    if (fp === null || geo === null) {
      unmapped.push({ ...base, reason: 'zero-shapes', detail: '过滤掉非几何形状后没有任何几何' })
      continue
    }
    mappedEntries.push({ ...base, lucideName, fp, geo, hasLiteralViewBox: core.canonViewBox(entry.viewBox) !== null })
  }

  // 指纹冲突检测：两条清单项撞同一指纹。名字相同就合并，不同就判定冲突。
  const byFp = new Map()
  for (const m of mappedEntries) {
    const prev = byFp.get(m.fp)
    if (!prev) { byFp.set(m.fp, m); continue }
    if (prev.lucideName === m.lucideName) {
      prev.occurrences += m.occurrences
      prev.merged = (prev.merged || []).concat([m.dsh])
      continue
    }
    conflicts.push({ fp: m.fp, a: prev.dsh + '/' + prev.guessName + '->' + prev.lucideName, b: m.dsh + '/' + m.guessName + '->' + m.lucideName })
    byFp.delete(m.fp)
  }
  for (const c of conflicts) {
    unmapped.push({ dsh: c.a.split('/')[0], guessName: c.a.split('/')[1].split('->')[0], occurrences: 0, viewBox: null, reason: 'fingerprint-conflict', detail: c.a + ' 与 ' + c.b + ' 归一化后同指纹但指向不同 Lucide 名' })
    unmapped.push({ dsh: c.b.split('/')[0], guessName: c.b.split('/')[1].split('->')[0], occurrences: 0, viewBox: null, reason: 'fingerprint-conflict', detail: c.a + ' 与 ' + c.b + ' 归一化后同指纹但指向不同 Lucide 名' })
  }

  // 完整指纹索引：只收 viewBox 是字面量的（viewBox 是表达式时运行时算不出同一个完整指纹）。
  for (const [fp, m] of byFp) {
    if (!m.hasLiteralViewBox) continue
    icons[fp] = { name: m.lucideName, dsh: m.dsh, guessName: m.guessName, occurrences: m.occurrences }
  }

  // 几何指纹回退索引：仅当该几何指纹在全部条目里唯一指向同一个 Lucide 名时才收。
  const geoOwners = new Map()
  for (const m of byFp.values()) {
    const set = geoOwners.get(m.geo) || new Set()
    set.add(m.lucideName)
    geoOwners.set(m.geo, set)
  }
  for (const m of byFp.values()) {
    if (geoOwners.get(m.geo).size !== 1) continue
    const existing = byGeometry[m.geo]
    if (existing && existing.name !== m.lucideName) continue
    byGeometry[m.geo] = { name: m.lucideName, dsh: existing ? existing.dsh : m.dsh, guessName: m.guessName }
  }

  const sortedIcons = {}
  for (const k of Object.keys(icons).sort()) sortedIcons[k] = icons[k]
  const sortedByGeometry = {}
  for (const k of Object.keys(byGeometry).sort()) sortedByGeometry[k] = byGeometry[k]
  const unmappedSorted = unmapped.slice().sort((a, b) => (a.reason + a.guessName).localeCompare(b.reason + b.guessName))

  // 守卫②：map 里的每个 Lucide 名必须存在于 lucide.json。
  const badNames = []
  for (const [fp, v] of Object.entries(sortedIcons)) if (!lucideKeys.has(v.name)) badNames.push(fp + ' -> ' + v.name)
  for (const [fp, v] of Object.entries(sortedByGeometry)) if (!lucideKeys.has(v.name)) badNames.push('byGeometry:' + fp + ' -> ' + v.name)
  if (badNames.length) throw new Error('map 里有 lucide.json 不存在的图标名：\n  ' + badNames.join('\n  '))

  // 守卫③：冲突必须为 0。
  if (conflicts.length) {
    throw new Error('检测到 ' + conflicts.length + ' 组指纹冲突（同指纹不同 Lucide 名），归一化过粗，构建中止：\n  ' +
      conflicts.map((c) => c.a + '  ×  ' + c.b).join('\n  '))
  }

  const total = inventory.icons.length
  const mappedCount = byFp.size
  // 守卫④：账要平——不许有条目凭空消失。
  if (mappedCount + unmapped.length !== total) {
    throw new Error('账不平：已映射 ' + mappedCount + ' + 未映射 ' + unmapped.length + ' ≠ 清单总数 ' + total)
  }

  const reasonCounts = {}
  for (const u of unmapped) reasonCounts[u.reason] = (reasonCounts[u.reason] || 0) + 1

  const data = {
    meta: {
      generated: true,
      doNotEdit:
        '本文件是 scripts/build-icon-map.mjs 从 .agents/tmp/m7-icons/inventory.json × lucide.json 构建生成的产物，禁止手改；' +
        '要改映射请改 scripts/icon-map-overrides.json，要改指纹口径请改 lib/client.js 的 @dsh-theme-icon-core 段，然后重跑构建。',
      generator: 'scripts/build-icon-map.mjs',
      generatedAt: opts.generatedAt,
      fingerprint: {
        algorithm: 'fnv1a32x4-128bit over canonical string',
        coreHash,
        coreSource: 'plugins/dsh-theme/lib/client.js @dsh-theme-icon-core',
        canonicalForm: 'vb:<viewBox>#<tag>(<geo attrs sorted>)|…',
      },
      sources: {
        inventory: path.relative(ROOT, opts.inventory).split(path.sep).join('/'),
        inventoryGeneratedAt: inventory.meta ? inventory.meta.generatedAt : null,
        inventoryIcons: total,
        lucide: path.relative(ROOT, opts.lucide).split(path.sep).join('/'),
        lucideSource: lucide.meta ? lucide.meta.source : null,
        overrides: path.relative(ROOT, opts.overrides).split(path.sep).join('/'),
      },
      coverage: { total, mapped: mappedCount, unmapped: unmapped.length, byReason: reasonCounts },
      consumer: {
        fullIndex: 'icons[指纹] = 完整指纹（含 viewBox），运行时首选',
        geometryIndex: 'byGeometry[几何指纹] = 回退索引，仅在该几何唯一指向一个 Lucide 名时收录',
      },
    },
    icons: sortedIcons,
    byGeometry: sortedByGeometry,
    unmapped: unmappedSorted,
  }

  return { data, coreHash, total, mappedCount, unmapped: unmappedSorted, reasonCounts, conflicts }
}

function printReport(opts, result) {
  const { data, total, mappedCount, unmapped, reasonCounts } = result
  const meta = data.meta
  console.log('✓ icon-map 覆盖率报告')
  console.log('  清单        : ' + meta.sources.inventory + '（' + total + ' 条，抽取于 ' + meta.sources.inventoryGeneratedAt + '）')
  console.log('  Lucide 源   : ' + meta.sources.lucideSource)
  console.log('  指纹核心    : ' + meta.fingerprint.coreHash.slice(0, 16) + '…（sha256，来自 client.js 的 @dsh-theme-icon-core 段）')
  const pct = total === 0 ? 0 : Math.round((mappedCount / total) * 1000) / 10
  console.log('  覆盖率      : ' + mappedCount + ' / ' + total + '（' + pct + '%）')
  console.log('  完整指纹索引: ' + Object.keys(data.icons).length + ' 条')
  console.log('  几何回退索引: ' + Object.keys(data.byGeometry).length + ' 条')
  console.log('  未映射      : ' + unmapped.length + ' 条')
  for (const reason of Object.keys(reasonCounts).sort()) {
    console.log('      - ' + reason + ': ' + reasonCounts[reason])
  }
  console.log('')
  console.log('  未映射清单（' + unmapped.length + ' 条）:')
  for (const u of unmapped) {
    console.log('    ' + u.reason.padEnd(21) + ' ' + u.dsh + '  ' + String(u.guessName).padEnd(18) + ' ' + (u.detail || ''))
  }
  console.log('')
  console.log('  已映射（按 Lucide 名）:')
  const names = {}
  for (const v of Object.values(data.icons)) names[v.name] = (names[v.name] || 0) + 1
  for (const v of Object.values(data.byGeometry)) names[v.name + ' (几何回退)'] = (names[v.name + ' (几何回退)'] || 0) + 1
  console.log('    ' + Object.keys(names).sort().join(', '))
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const result = await buildIconMap(opts)
  printReport(opts, result)
  if (opts.reportOnly) {
    console.log('')
    console.log('  --report-only：未落盘')
    return
  }
  await mkdir(path.dirname(opts.out), { recursive: true })
  const json = JSON.stringify(result.data)
  await writeFile(opts.out, json, 'utf8')
  const bytes = Buffer.byteLength(json, 'utf8')
  console.log('')
  console.log('  → ' + opts.out + '  (' + bytes + ' bytes)')
}

// 只有被当作入口脚本执行时才构建；被 import（测试复用 loadCore/coreHashOf）时不产生副作用。
const isEntry = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntry) {
  main().catch((err) => {
    console.error('✗ build-icon-map 失败: ' + err.message)
    process.exit(1)
  })
}
