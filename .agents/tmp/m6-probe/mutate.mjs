// 变异负控制：把实现改坏 -> 确认测试变红 -> 还原 -> 确认复绿。
// 用法：node mutate.mjs <mutationId>
//   m1 = callId 配对：tool/result 改回读 data.callId（错字段）
//   m2 = 时间窗衰减：deepyResolve 去掉 now < until 的比较（永不过期）
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const TARGET = 'E:/dsh-theme/plugins/dsh-theme/lib/client.js'
const BACKUP = 'E:/dsh-theme/.agents/tmp/m6-probe/client.js.pristine'
const id = process.argv[2]

const MUTATIONS = {
  m1: {
    desc: 'callId 配对改回错字段 data.callId（tool/result 不再用 message.toolCallId）',
    from: 'var doneId = data.message && data.message.toolCallId !== undefined && data.message.toolCallId !== null\n          ? String(data.message.toolCallId)\n          : null',
    to: 'var doneId = data.callId === undefined || data.callId === null ? null : String(data.callId)',
  },
  m2: {
    desc: '时间窗衰减失效（deepyResolve 不再比较 now < until，瞬时态永不过期）',
    from: 'if (state.transient !== null && now < state.until) return state.transient',
    to: 'if (state.transient !== null) return state.transient',
  },
  m3: {
    desc: 'R3 回退：tool/result 成功改回「固定 typing/thinking」，不按剩余活跃数重算',
    from: 'persistent(remainingState)',
    to: "persistent(next.activeTools.length > 0 ? 'typing' : 'thinking')",
  },
}

const m = MUTATIONS[id]
if (!m) { console.error('unknown mutation', id); process.exit(2) }

if (!fs.existsSync(BACKUP)) { fs.copyFileSync(TARGET, BACKUP); console.log('pristine backup created') }
const pristine = fs.readFileSync(BACKUP, 'utf8')

function run() {
  try {
    const out = execFileSync(process.execPath, ['E:/dsh-theme/plugins/dsh-theme/test/state-machine.test.mjs'], { encoding: 'utf8' })
    return { code: 0, out }
  } catch (e) {
    return { code: e.status === undefined ? 1 : e.status, out: (e.stdout || '') + (e.stderr || '') }
  }
}

console.log('=== mutation ' + id + ': ' + m.desc + ' ===')
const src = pristine
if (src.split(m.from).length - 1 !== 1) { console.error('mutation anchor not found exactly once'); process.exit(2) }
fs.writeFileSync(TARGET, src.replace(m.from, m.to))
const red = run()
console.log('--- with mutation (expect FAIL) ---')
console.log(red.out.trim().split('\n').slice(-12).join('\n'))
console.log('exit=' + red.code)

fs.writeFileSync(TARGET, pristine)
const green = run()
console.log('--- restored (expect PASS) ---')
console.log(green.out.trim().split('\n').slice(-6).join('\n'))
console.log('exit=' + green.code)

const ok = red.code !== 0 && green.code === 0
console.log('')
console.log(ok ? 'NEGATIVE CONTROL OK: 变红 -> 还原 -> 复绿' : 'NEGATIVE CONTROL FAILED')
process.exit(ok ? 0 : 1)
