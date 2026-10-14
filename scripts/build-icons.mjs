#!/usr/bin/env node
/**
 * build-icons.mjs — 把 lucide-static 的 SVG 图标烘焙成单文件 JSON。
 *
 * 用途：dsh-theme 插件的「图标层」在浏览器端把 shell 手绘 SVG 换成 Lucide 同语义图标。
 * 运行环境是本地应用内嵌浏览器，**严禁运行时 CDN / 网络依赖**，所以图标数据必须随插件分发，
 * 由本脚本从 lucide-static 源 SVG 构建产出。
 *
 * 用法：
 *   node scripts/build-icons.mjs                        # 默认源/输出路径，直接构建
 *   node scripts/build-icons.mjs --src <icons 目录>      # 换一个已解压的 lucide-static 源目录
 *   node scripts/build-icons.mjs --out <输出 json>        # 换输出路径
 *   node scripts/build-icons.mjs --version <版本号>       # 源目录无 package.json 时显式指定
 *   node scripts/build-icons.mjs --generated-at <ISO>    # 固定 generatedAt（可重现构建）
 *   node scripts/build-icons.mjs --pretty 2              # 缩进输出（仅调试用，体积约翻倍）
 *   node scripts/build-icons.mjs --help
 *
 *   可重现构建：设置环境变量 SOURCE_DATE_EPOCH（Unix 秒）或传 --generated-at，
 *   同一 lucide-static 版本 + 同一源目录即可产出逐字节一致的文件。
 *
 * 产物：
 *   plugins/dsh-theme/assets/icons/lucide.json    —— 构建生成物，**禁止手改**
 *   plugins/dsh-theme/assets/icons/LICENSE        —— lucide-static 的 ISC 许可原文副本（构建时拷贝）
 *
 * 许可：Lucide 图标数据以 ISC 许可分发，版权归 Lucide Icons and Contributors 所有。
 *   copyright 与许可全文均在**构建时**从源包的 LICENSE / package.json 读取，不在此脚本内硬编码。
 *
 * 零依赖：只用 node 内置 fs / path / url，不引 XML 解析库——一旦需要 node_modules，
 *         可重现性就无从谈起。对 lucide 已知的规整 SVG 结构做最小解析即可。
 *
 * 确定性：
 *   - 图标键名用默认 .sort()（**不用 localeCompare**，避免区域设置影响顺序），排序键是去后缀的图标名。
 *   - 属性顺序 = 源 SVG 里的出现顺序，逐字保留，不重排。
 *   - 产物为紧凑 JSON（JSON.stringify 不带缩进）、UTF-8 无 BOM、一次 writeFile 落盘。
 *
 * 解析契约（消费方须知）：
 *   - 只保留 根 <svg> 上的 viewBox 与 fill/stroke/stroke-width/stroke-linecap/stroke-linejoin。
 *     **不保留 width/height/class**——尺寸交给下游 CSS/宿主决定；class 是实现细节。
 *   - 属性名原样保留 SVG 源里的写法（如 "stroke-width"，不是 camelCase），
 *     这样消费端 setAttribute(name, value) 直接可用，无需任何命名映射。
 *   - elements 保留源文件中的元素顺序与 d/points 等几何数据，**不简化、不做数值归一化**；
 *     子元素上覆盖 stroke-width / fill 之类的属性也原样带在 elements[].attrs 里。
 *   - 解析器是「零残留」模式：抽完所有子元素后剩余文本必须只剩空白；出现未知标签、
 *     未知残留、缺根标签或空 elements 一律构建失败——宁可构建红，也不静默丢几何数据。
 */

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULTS = {
  src: path.join(ROOT, '.agents/tmp/m7-icons/package/icons'),
  out: path.join(ROOT, 'plugins/dsh-theme/assets/icons/lucide.json'),
  generatedAt: null,
  pretty: null,
}

/** lucide 的几何元素全集。新增标签时改这里 + 同时确认解析逻辑能处理。 */
const GEOMETRY_TAGS = new Set(['path', 'circle', 'rect', 'line', 'polyline', 'polygon', 'ellipse'])
/** 根 <svg> 上不进入产物 attrs 的属性：结构性属性 + 交给下游的尺寸。 */
const ROOT_ATTR_SKIP = new Set(['class', 'xmlns', 'viewBox', 'width', 'height'])

const ATTR_RE = /([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g
const ELEM_RE = /<([a-z][a-z0-9]*)\b([^>]*?)\/?>/g

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
      case '--src': opts.src = path.resolve(next()); break
      case '--out': opts.out = path.resolve(next()); break
      case '--version': opts.version = next(); break
      case '--generated-at': opts.generatedAt = next(); break
      case '--pretty': opts.pretty = Number(next()); break
      case '--help': case '-h':
        console.log(
          '用法: node scripts/build-icons.mjs [--src <icons 目录>] [--out <输出 json>]\n' +
          '                          [--version <版本号>] [--generated-at <ISO 时间>] [--pretty <缩进>]',
        )
        process.exit(0)
        break
      default: throw new Error('未知参数: ' + a)
    }
  }
  if (!opts.generatedAt && process.env.BUILD_TIME) opts.generatedAt = process.env.BUILD_TIME
  if (!opts.generatedAt && process.env.SOURCE_DATE_EPOCH) {
    opts.generatedAt = new Date(Number(process.env.SOURCE_DATE_EPOCH) * 1000).toISOString()
  }
  opts.generatedAt = opts.generatedAt || new Date().toISOString()
  return opts
}

function parseAttrs(str) {
  const attrs = {}
  ATTR_RE.lastIndex = 0
  let m
  while ((m = ATTR_RE.exec(str)) !== null) attrs[m[1]] = m[2]
  return attrs
}

/**
 * 从一个 lucide SVG 源文件抽出 { viewBox, attrs, elements }。
 * 未知标签 / 残留内容 / 缺根标签 / 空 elements 全部抛错，不静默吞。
 */
function parseIconSvg(name, source, survey) {
  // 去掉头部 license 注释 <!-- @license lucide-static v1.55.0 - ISC -->
  const body = source.replace(/<!--[\s\S]*?-->/g, '')
  const open = body.match(/<svg\b([^>]*)>/)
  if (!open) throw new Error(name + '.svg: 找不到根 <svg> 元素')
  const rootAttrs = parseAttrs(open[1])
  const inner = body.slice(open.index + open[0].length, body.lastIndexOf('</svg>'))
  if (body.lastIndexOf('</svg>') < 0) throw new Error(name + '.svg: 找不到 </svg> 收尾标签')

  const elements = []
  ELEM_RE.lastIndex = 0
  let m
  while ((m = ELEM_RE.exec(inner)) !== null) {
    const tag = m[1]
    if (!GEOMETRY_TAGS.has(tag)) {
      throw new Error(
        name + '.svg: 出现未支持元素 <' + tag + '>——解析器只认 ' + [...GEOMETRY_TAGS].join('/') +
        '，请先扩展脚本再构建',
      )
    }
    survey.tags.add(tag)
    const attrs = parseAttrs(m[2])
    for (const k of Object.keys(attrs)) survey.attrs.add(k)
    elements.push({ tag, attrs })
  }
  // 零残留：把已匹配的元素挖掉后，剩下的必须全是空白，否则说明有没被解析到的内容
  const residual = inner.replace(ELEM_RE, '').trim()
  if (residual !== '') {
    throw new Error(name + '.svg: 解析后有未识别残留内容，疑似丢数据: ' + JSON.stringify(residual.slice(0, 120)))
  }

  const attrs = {}
  for (const [k, v] of Object.entries(rootAttrs)) {
    if (!ROOT_ATTR_SKIP.has(k)) {
      attrs[k] = v
      survey.attrs.add(k)
    } else {
      survey.skippedRootAttrs.add(k)
    }
  }
  return { viewBox: rootAttrs.viewBox ?? null, attrs, elements }
}

async function readVersion(src, override) {
  if (override) return override
  const pkgPath = path.join(path.dirname(src), 'package.json')
  try {
    return JSON.parse(await readFile(pkgPath, 'utf8')).version
  } catch {
    throw new Error(
      '读不到版本号：' + pkgPath + ' 不存在或不是合法 JSON。\n' +
      'lucide-static 解包后 icons/ 的同级应有 package.json；若源目录布局不同，用 --version <版本号> 显式指定。',
    )
  }
}

async function readLicense(src) {
  const licensePath = path.join(path.dirname(src), 'LICENSE')
  let text
  try {
    text = (await readFile(licensePath, 'utf8')).trim()
  } catch {
    throw new Error('读不到许可文件：' + licensePath + '（ISC 要求分发副本保留版权与许可声明，不可跳过）')
  }
  const line = text.split(/\r?\n/).find((l) => /copyright/i.test(l))
  return { text, copyright: line ? line.trim() : 'Lucide Icons and Contributors' }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2))
  const version = await readVersion(opts.src, opts.version)
  const license = await readLicense(opts.src)

  // 默认 sort()，排序键是去后缀的图标名（不用 localeCompare，避免区域设置影响顺序）
  const names = (await readdir(opts.src))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => f.slice(0, -'.svg'.length))
    .sort()
  if (names.length === 0) throw new Error('源目录没有任何 .svg: ' + opts.src)

  const survey = { tags: new Set(), attrs: new Set(), skippedRootAttrs: new Set() }
  const icons = {}
  let totalElements = 0
  for (const name of names) {
    const parsed = parseIconSvg(name, await readFile(path.join(opts.src, name + '.svg'), 'utf8'), survey)
    if (parsed.elements.length === 0) throw new Error(name + '.svg: elements 为空，构建中止')
    icons[name] = parsed
    totalElements += parsed.elements.length
  }

  const count = Object.keys(icons).length
  const data = {
    meta: {
      generated: true,
      doNotEdit:
        '本文件是 scripts/build-icons.mjs 从 lucide-static@' + version + ' 构建生成的产物，禁止手改；' +
        '要改图标数据请改源 SVG 后重跑构建脚本。',
      license: 'ISC',
      copyright: license.copyright,
      licenseText: license.text,
      source: 'lucide-static@' + version,
      version,
      generatedAt: opts.generatedAt,
      count,
    },
    icons,
  }

  await mkdir(path.dirname(opts.out), { recursive: true })
  const json = opts.pretty ? JSON.stringify(data, null, opts.pretty) : JSON.stringify(data)
  await writeFile(opts.out, json, 'utf8')

  // ISC 要求「所有副本」保留版权与许可声明：把上游 LICENSE 原文一并落到产物目录
  const licenseOut = path.join(path.dirname(opts.out), 'LICENSE')
  await writeFile(
    licenseOut,
    [
      '# 本文件由 scripts/build-icons.mjs 从 lucide-static@' + version + ' 的 LICENSE 原样拷贝，勿手改。',
      '# 图标数据（lucide.json）的版权归 Lucide Icons and Contributors 所有，以 ISC 许可分发。',
      '',
      license.text,
      '',
    ].join('\n'),
    'utf8',
  )

  const bytes = Buffer.byteLength(json, 'utf8')
  console.log('✓ ' + opts.out)
  console.log('  source      : lucide-static@' + version)
  console.log('  icons       : ' + count)
  console.log('  elements    : ' + totalElements)
  console.log('  generatedAt : ' + opts.generatedAt)
  console.log('  size        : ' + bytes + ' bytes (' + (bytes / 1024 / 1024).toFixed(3) + ' MiB, 紧凑 JSON)')
  console.log('  license     : ' + licenseOut)
  // 不静默吞错：把实际见到的标签/属性清点出来，便于复核「没有任何东西被悄悄丢掉」
  console.log('  标签清点     : ' + [...survey.tags].sort().join(', '))
  console.log('  属性清点     : ' + [...survey.attrs].sort().join(', '))
  console.log('  根上刻意丢弃 : ' + [...survey.skippedRootAttrs].sort().join(', '))
}

main().catch((err) => {
  console.error('✗ build-icons 失败: ' + err.message)
  process.exit(1)
})
