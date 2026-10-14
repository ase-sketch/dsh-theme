import fs from 'node:fs'
const target = 'E:/dsh-theme/plugins/dsh-theme/lib/client.js'
const frag = fs.readFileSync('E:/dsh-theme/.agents/tmp/m6-probe/deepy-fragment.js', 'utf8')
const src = fs.readFileSync(target, 'utf8')
const anchor = '    // ── 设置面板（React 组件） ────────────────────────────────────────────'
const count = src.split(anchor).length - 1
if (count !== 1) { console.error('anchor count =', count, '(expected 1)'); process.exit(1) }
const out = src.replace(anchor, frag)
fs.writeFileSync(target, out)
console.log('spliced. before lines =', src.split('\n').length, 'after lines =', out.split('\n').length)
