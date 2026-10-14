import fs from 'node:fs'
import path from 'node:path'
const dsh = 'C:/Users/pass/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh'
function walk(p, depth = 1, prefix = '') {
  let e
  try { e = fs.readdirSync(p, { withFileTypes: true }) } catch (err) { console.log(prefix + 'ERR ' + err.code); return }
  for (const d of e) {
    console.log(prefix + (d.isDirectory() ? '[D] ' : '    ') + d.name)
    if (d.isDirectory() && depth > 0) walk(path.join(p, d.name), depth - 1, prefix + '  ')
  }
}
walk(dsh, 1)
console.log('--- package.json ---')
console.log(fs.readFileSync(path.join(dsh, 'package.json'), 'utf8'))
