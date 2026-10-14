// 变异负控制（完整输出版）：不截断，保留 passed/failed 计数与全部失败断言名。
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const TARGET = 'E:/dsh-theme/plugins/dsh-theme/lib/client.js'
const BACKUP = 'E:/dsh-theme/.agents/tmp/m6-probe/client.js.pristine'
const id = process.argv[2]

const MUTATIONS = {
  m1: {
    desc: 'callId 配对改回错字段 data.callId',
    from: 'var doneId = data.message && data.message.toolCallId !== undefined && data.message.toolCallId !== null\n          ? String(data.message.toolCallId)\n          : null',
    to: 'var doneId = data.callId === undefined || data.callId === null ? null : String(data.callId)',
  },
  m2: {
    desc: '时间窗衰减失效（瞬时态永不过期）',
    from: 'if (state.transient !== null && now < state.until) return state.transient',
    to: 'if (state.transient !== null) return state.transient',
  },
  m3: {
    desc: 'R3 回退（tool/result 成功固定 typing/thinking）',
    from: 'persistent(remainingState)',
    to: "persistent(next.activeTools.length > 0 ? 'typing' : 'thinking')",
  },
}
const m = MUTATIONS[id]
const pristine = fs.readFileSync(BACKUP, 'utf8')
function run() {
  try { return { code: 0, out: execFileSync(process.execPath, ['E:/dsh-theme/plugins/dsh-theme/test/state-machine.test.mjs'], { encoding: 'utf8' }) } }
  catch (e) { return { code: e.status ?? 1, out: (e.stdout || '') + (e.stderr || '') } }
}
console.log('### ' + id + ': ' + m.desc)
fs.writeFileSync(TARGET, pristine.replace(m.from, m.to))
const red = run()
const redCounts = red.out.split('\n').filter(l => /^passed:|^failed:/.test(l))
const redFails = red.out.split('\n').filter(l => /^\s+- /.test(l))
console.log('RED   exit=' + red.code + '  ' + redCounts.join('  '))
for (const f of redFails) console.log('      ' + f.trim())
fs.writeFileSync(TARGET, pristine)
const green = run()
const greenCounts = green.out.split('\n').filter(l => /^passed:|^failed:/.test(l))
console.log('GREEN exit=' + green.code + '  ' + greenCounts.join('  '))
console.log(red.code !== 0 && green.code === 0 ? '=> NEGATIVE CONTROL OK' : '=> NEGATIVE CONTROL FAILED')
