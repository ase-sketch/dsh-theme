import fs from 'node:fs'
import path from 'node:path'
function walk(p, depth = 2, prefix = '') {
  if (depth < 0) return
  let e
  try { e = fs.readdirSync(p, { withFileTypes: true }) } catch (err) { console.log(prefix + 'ERR ' + err.code); return }
  for (const d of e.slice(0, 40)) {
    console.log(prefix + (d.isDirectory() ? '[D] ' : '    ') + d.name)
    if (d.isDirectory() && depth > 0) walk(path.join(p, d.name), depth - 1, prefix + '  ')
  }
}
console.log('=== app.asar.unpacked/dsh ===')
walk('C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/app.asar.unpacked/dsh', 2)
console.log('=== dsh-runtimes/dsh-primary-runtime ===')
walk('C:/Users/pass/.dsh/dsh-runtimes/dsh-primary-runtime', 2)
