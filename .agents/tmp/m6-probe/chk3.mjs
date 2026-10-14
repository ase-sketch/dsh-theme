import fs from 'node:fs'
import path from 'node:path'
const D = 'C:/Users/pass/.dsh'
const all = fs.readdirSync(D)
console.log('settings-ish:', all.filter(f => /settings/i.test(f)).join(', '))
console.log('session-ish:', all.filter(f => /session|history/i.test(f)).join(', '))
for (const cand of ['sessions', 'dsh-session-archive', 'history']) {
  const p = path.join(D, cand)
  try {
    const st = fs.statSync(p)
    if (st.isDirectory()) {
      const e = fs.readdirSync(p)
      console.log('DIR ' + cand + ' entries=' + e.length + ' sample=' + e.slice(0, 8).join(', '))
    }
  } catch (err) { console.log('MISS ' + cand) }
}
// where does session persistence put jsonl? look for *.jsonl
function findJsonl(dir, depth, out) {
  if (depth < 0 || out.length > 5) return
  let e; try { e = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const d of e) {
    const p = path.join(dir, d.name)
    if (d.isDirectory()) { if (!/node_modules|cache|logs/.test(d.name)) findJsonl(p, depth - 1, out) }
    else if (d.name.endsWith('.jsonl')) out.push(p)
  }
}
const found = []
findJsonl(D, 3, found)
console.log('jsonl sample:', found.slice(0, 5).join('\n'))
