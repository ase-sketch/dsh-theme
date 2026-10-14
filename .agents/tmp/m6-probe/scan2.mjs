import fs from 'node:fs'
import path from 'node:path'
const ROOTS = [
  'C:/Users/pass/.dsh/profiles/desktop/node_modules',
]
const needles = ['.retain(', 'eventSource', 'uiSession', 'sessionStatus']
function walk(dir, depth, out) {
  if (depth < 0) return
  let e; try { e = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const d of e) {
    if (d.name === 'node_modules' && depth < 2) continue
    const p = path.join(dir, d.name)
    if (d.isDirectory()) walk(p, depth - 1, out)
    else if (/\.(js|mjs|cjs)$/.test(d.name) && !d.name.endsWith('.map')) out.push(p)
  }
}
const files = []
for (const r of ROOTS) walk(r, 5, files)
console.log('files scanned', files.length)
for (const f of files) {
  let t; try { t = fs.readFileSync(f, 'utf8') } catch { continue }
  const hits = needles.filter(n => t.includes(n))
  if (hits.includes('.retain(') || (hits.includes('uiSession') && hits.includes('eventSource'))) {
    console.log(path.relative(ROOTS[0], f), '=>', hits.join(','), 'size', t.length)
  }
}
