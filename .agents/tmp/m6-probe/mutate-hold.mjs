// 瞬时态 hold 契约变更的变异负控制：
// 把「瞬时态保持」改回「被持久态覆盖」，确认新增用例变红。
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const TARGET = 'E:/dsh-theme/plugins/dsh-theme/lib/client.js'
const BACKUP = 'E:/dsh-theme/.agents/tmp/m6-probe/client.js.hold-pristine'
const id = process.argv[2]

const OLD_PERSISTENT = [
  '      function persistent(name) {',
  '        next.base = name',
  '      }',
].join('\n')
const NEW_PERSISTENT = [
  '      function persistent(name) {',
  '        next.base = name',
  '        next.transient = null',
  '        next.until = 0',
  '      }',
].join('\n')
const OLD_STEP = [
  "      if (type === 'step/start') {",
  "        persistent('thinking')",
  '        return next',
  '      }',
].join('\n')
const NEW_STEP = [
  "      if (type === 'step/start') {",
  "        beginRound('thinking')",
  '        return next',
  '      }',
].join('\n')

const MUTATIONS = {
  h1: { desc: '持久态夺回显示（回退到旧 P3 规则）', from: OLD_PERSISTENT, to: NEW_PERSISTENT },
  h2: { desc: 'step/start 也清瞬时态（把同轮事件当成新一轮）', from: OLD_STEP, to: NEW_STEP },
}
const m = MUTATIONS[id]
if (!fs.existsSync(BACKUP)) fs.copyFileSync(TARGET, BACKUP)
const pristine = fs.readFileSync(BACKUP, 'utf8')
function run(file) {
  try { return { code: 0, out: execFileSync(process.execPath, [file], { encoding: 'utf8' }) } }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') } }
}
console.log('### ' + id + ': ' + m.desc)
const cnt = pristine.split(m.from).length - 1
if (cnt !== 1) { console.error('anchor fail count=' + cnt); process.exit(2) }
fs.writeFileSync(TARGET, pristine.replace(m.from, m.to))
const red = run('E:/dsh-theme/plugins/dsh-theme/test/state-machine.test.mjs')
console.log('RED   state-machine exit=' + red.code + '  ' + red.out.split('\n').filter(l => /^passed:|^failed:/.test(l)).join('  '))
for (const f of red.out.split('\n').filter(l => /^\s+- /.test(l))) console.log('      ' + f.trim())
fs.writeFileSync(TARGET, pristine)
const g1 = run('E:/dsh-theme/plugins/dsh-theme/test/state-machine.test.mjs')
const g2 = run('E:/dsh-theme/plugins/dsh-theme/test/render-layer.test.mjs')
console.log('GREEN state-machine exit=' + g1.code + '  ' + g1.out.split('\n').filter(l => /^passed:|^failed:/.test(l)).join('  '))
console.log('GREEN render-layer  exit=' + g2.code + '  ' + g2.out.split('\n').filter(l => /^passed:|^failed:/.test(l)).join('  '))
console.log(red.code !== 0 && g1.code === 0 && g2.code === 0 ? '=> NEGATIVE CONTROL OK' : '=> NEGATIVE CONTROL FAILED')