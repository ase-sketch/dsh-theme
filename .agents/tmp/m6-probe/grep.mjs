import fs from 'node:fs'
import path from 'node:path'
const ROOT = 'C:/Users/pass/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai'

function walk(dir, out = []) {
  let e
  try { e = fs.readdirSync(dir, { withFileTypes: true }) } catch { return out }
  for (const d of e) {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) { if (d.name !== 'node_modules' && d.name !== '.git') walk(p, out) }
    else if (/\.(js|mjs|cjs|ts|json)$/.test(d.name)) out.push(p)
  }
  return out
}

const targets = process.argv.slice(2)
for (const t of targets) {
  const files = walk(path.join(ROOT, t))
  console.log('### ' + t + ' (' + files.length + ' files)')
  for (const f of files) console.log('  ' + path.relative(ROOT, f) + '  ' + fs.statSync(f).size)
}
