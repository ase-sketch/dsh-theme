#!/usr/bin/env node
// 纸纹贴图生成器（M13.3）：把「纸齿 + 云斑」两张程序化 SVG 写进 design/preview.html 的
// --dsh-paper-tooth / --dsh-paper-mottle（明暗两套），再配合 --regen-tokens 落到 tokens.css。
//
// 做法照 rinDBeans/dsh-nocturne 的判读：纸 = 结构 + 光，不是一层均匀噪声。
//   · 纸齿：feTurbulence(fractalNoise) 当高度场，feDiffuseLighting 用一盏斜射的远处光打亮，
//           再压到窄区间——浅色取 0.85~1.0 让 multiply 轻轻压暗，夜版取 0~0.08 让 screen 轻轻提亮。
//   · 云斑：超低频 fractalNoise，做纸浆深浅不匀。
// 关键坑：filter 必须写 color-interpolation-filters='sRGB'，否则 feComponentTransfer 在
// linearRGB 里算，0.05 会被转成 ~0.24 的灰——上一版夜纸整片发灰就是这个原因。
//
// 用法：node scripts/build-paper.mjs [--write] [--dry]
import fs from 'node:fs'

const PREVIEW = 'design/preview.html'
const enc = (svg) => 'url("data:image/svg+xml,' + encodeURIComponent(svg) + '")'

function relief({ size = 256, fx = 0.22, octaves = 5, scale = 3.0, slope, intercept, az = 235, el = 52, seed = 1 }) {
  const f = [
    "<filter id='t' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>",
    "<feTurbulence type='fractalNoise' baseFrequency='" + fx + "' numOctaves='" + octaves + "' seed='" + seed + "' stitchTiles='stitch' result='n'/>",
    "<feDiffuseLighting in='n' surfaceScale='" + scale + "' diffuseConstant='1' lighting-color='white' result='l'><feDistantLight azimuth='" + az + "' elevation='" + el + "'/></feDiffuseLighting>",
    "<feComponentTransfer><feFuncR type='linear' slope='" + slope + "' intercept='" + intercept + "'/><feFuncG type='linear' slope='" + slope + "' intercept='" + intercept + "'/><feFuncB type='linear' slope='" + slope + "' intercept='" + intercept + "'/><feFuncA type='linear' slope='0' intercept='1'/></feComponentTransfer>",
    "</filter>"].join('')
  return enc("<svg xmlns='http://www.w3.org/2000/svg' width='" + size + "' height='" + size + "'>" + f + "<rect width='" + size + "' height='" + size + "' filter='url(#t)'/></svg>")
}

function grain({ size = 512, fx = 0.009, octaves = 3, slope, intercept, seed = 7 }) {
  const f = [
    "<filter id='m' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'>",
    "<feTurbulence type='fractalNoise' baseFrequency='" + fx + "' numOctaves='" + octaves + "' seed='" + seed + "' stitchTiles='stitch'/>",
    "<feColorMatrix type='saturate' values='0'/>",
    "<feComponentTransfer><feFuncR type='linear' slope='" + slope + "' intercept='" + intercept + "'/><feFuncG type='linear' slope='" + slope + "' intercept='" + intercept + "'/><feFuncB type='linear' slope='" + slope + "' intercept='" + intercept + "'/><feFuncA type='linear' slope='0' intercept='1'/></feComponentTransfer>",
    "</filter>"].join('')
  return enc("<svg xmlns='http://www.w3.org/2000/svg' width='" + size + "' height='" + size + "'>" + f + "<rect width='" + size + "' height='" + size + "' filter='url(#m)'/></svg>")
}

// 2026-11-03「纸质感再强一档」：实测 1:1 对照，浅色 0.032/s3 在真机几乎看不出来；
// 抬到 0.075/s5 才是冷压水彩纸的齿感（约 2.4 倍），再往上 0.10 就粗得抢字了。
// 夜纸走 screen，靠亮度抬升而不是压暗，所以数值单列（0.062 / 0.05），不然会糊成灰。
const PAPER = {
  '--dsh-paper-tooth': [relief({ scale: 5, slope: 0.075, intercept: 0.925 }), relief({ scale: 5, slope: 0.062, intercept: 0.0 })],
  '--dsh-paper-mottle': [grain({ slope: 0.065, intercept: 0.935 }), grain({ slope: 0.05, intercept: 0.0 })],
}

const html = fs.readFileSync(PREVIEW, 'utf8')
const mf = html.match(/<script type="application\/json" id="token-manifest">([\s\S]*?)<\/script>/)
if (mf === null) throw new Error('设计稿里找不到 #token-manifest')
const manifest = JSON.parse(mf[1])
const tokens = manifest.tokens
let changed = 0
for (const t of tokens) {
  const v = PAPER[t.name]
  if (!v) continue
  if (t.light !== v[0] || t.dark !== v[1]) changed++
  t.light = v[0]
  t.dark = v[1]
}
const noiseReal = (html.match(/^\s*--dsh-noise-uri:\s*(url\(.*\));$/m) || [])[1]
const line = (t, v) => '      ' + t.name + ': ' + (t.name === '--dsh-noise-uri' && noiseReal ? noiseReal + ';' : v + ';')
const lightLines = tokens.map((t) => line(t, t.light))
const darkLines = tokens.map((t) => line(t, (t.dark === 'same' || t.dark === t.light) ? t.light : t.dark))
let out = html
out = out.replace(/(:root\s*\{)([\s\S]*?)(\n    \})/, (_m, a, _b, c) => a + '\n' + lightLines.join('\n') + c)
out = out.replace(/(\[data-theme="dark"\]\s*\{)([\s\S]*?)(\n    \})/, (_m, a, _b, c) => a + '\n' + darkLines.join('\n') + c)
out = out.replace(/<script type="application\/json" id="token-manifest">[\s\S]*?<\/script>/, '<script type="application/json" id="token-manifest">' + JSON.stringify(manifest) + '</script>')

console.log('纸纹：' + Object.keys(PAPER).length + ' 个 token，更新 ' + changed + ' 条（齿 ' + PAPER['--dsh-paper-tooth'][0].length + ' 字符 / 云斑 ' + PAPER['--dsh-paper-mottle'][0].length + ' 字符）')
if (process.argv.includes('--write')) {
  fs.writeFileSync(PREVIEW, out)
  console.log('已写入 ' + PREVIEW + '（接着跑 node scripts/build-skin.mjs --regen-tokens）')
} else {
  console.log('（预览模式；加 --write 落盘）')
}
