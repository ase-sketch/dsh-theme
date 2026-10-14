// 渲染层变异负控制：把 Route A 的自愈语义改回「缓存节点引用、不检查 isConnected」，
// 确认 render-layer 测试变红（模拟旧缺陷：节点被 React 换掉后仍画到旧节点上）。
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const TARGET = 'E:/dsh-theme/plugins/dsh-theme/lib/client.js'
const BACKUP = 'E:/dsh-theme/.agents/tmp/m6-probe/client.js.render-pristine'
const id = process.argv[2]

const MUTATIONS = {
  r1: {
    desc: '旧缺陷复现：paint 不再校验节点 isConnected（画到已被 React 摘掉的旧节点上）',
    from: 'if (!target || !target.isConnected) return false',
    to: 'if (!target) return false',
  },
  r2: {
    desc: '旧缺陷复现：ref 回调不再接受 null（React 卸载后仍持有旧节点引用）',
    from: "ref: function (node) { spriteEl = node },",
    to: "ref: function (node) { if (node) spriteEl = node },",
  },
}
const m = MUTATIONS[id]
if (!fs.existsSync(BACKUP)) fs.copyFileSync(TARGET, BACKUP)
const pristine = fs.readFileSync(BACKUP, 'utf8')
function run(file) {
  try { return { code: 0, out: execFileSync(process.execPath, [file], { encoding: 'utf8' }) } }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') } }
}
console.log('### ' + id + ': ' + m.desc)
if (pristine.split(m.from).length - 1 !== 1) { console.error('anchor fail'); process.exit(2) }
fs.writeFileSync(TARGET, pristine.replace(m.from, m.to))
const red = run('E:/dsh-theme/plugins/dsh-theme/test/render-layer.test.mjs')
const redCounts = red.out.split('\n').filter(l => /^passed:|^failed:/.test(l))
console.log('RED   render-layer exit=' + red.code + '  ' + redCounts.join('  '))
for (const f of red.out.split('\n').filter(l => /^\s+- /.test(l))) console.log('      ' + f.trim())
fs.writeFileSync(TARGET, pristine)
const green = run('E:/dsh-theme/plugins/dsh-theme/test/render-layer.test.mjs')
const g2 = run('E:/dsh-theme/plugins/dsh-theme/test/state-machine.test.mjs')
console.log('GREEN render-layer exit=' + green.code + '  ' + green.out.split('\n').filter(l => /^passed:|^failed:/.test(l)).join('  '))
console.log('GREEN state-machine exit=' + g2.code + '  ' + g2.out.split('\n').filter(l => /^passed:|^failed:/.test(l)).join('  '))
console.log(red.code !== 0 && green.code === 0 && g2.code === 0 ? '=> NEGATIVE CONTROL OK' : '=> NEGATIVE CONTROL FAILED')
