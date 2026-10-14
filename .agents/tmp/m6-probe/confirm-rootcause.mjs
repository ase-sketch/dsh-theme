// 用验收方的观测序列复现「error 只活 100-270ms」
import fs from 'node:fs'
const src = fs.readFileSync('E:/dsh-theme/plugins/dsh-theme/lib/client.js', 'utf8')
let loaded = null
globalThis.window = {}
globalThis.document = { head: { appendChild() {} }, getElementById: () => null }
globalThis.window.__ModuleLoader__ = {
  load(spec) {
    loaded = spec.factory((n) => {
      if (n === 'react') return { createElement: () => null, useState: () => [null, () => {}], useEffect: () => {} }
      throw new Error('unexpected ' + n)
    })
  },
}
;(0, eval)(src)
const D = loaded.__deepy

const T0 = 1_000_000
const ev = (type, data) => ({ type: 'event', event: { type, data: data || {} } })
const tr = (type, data) => ({ type: 'transient', event: { type, data: data || {} } })

console.log('=== 复现验收方观测序列（停止生成场景） ===')
let s = D.initial()
const steps = [
  ['turn/start', {}, 0],
  ['assistant/live-chunk', { chunk: { type: 'text-delta' } }, 100],   // typing
  ['tool/call', { callId: 'c1', name: 'pwsh' }, 200],                  // typing (1 个工具)
  // 用户点「停止生成」：工具失败 -> error，紧接着 turn/end aborted -> persistent(idle)
  ['tool/result', { message: { isError: true, toolCallId: 'c1' } }, 300],
  ['turn/end', { reason: { kind: 'aborted' } }, 310],
]
for (const [type, data, dt] of steps) {
  s = D.project(s, ev(type, data), T0 + dt)
  const shown = D.resolve(s, T0 + dt)
  console.log('t+' + String(dt).padStart(4) + '  ' + type.padEnd(22) + ' -> display=' + shown + '  (base=' + s.base + ', transient=' + s.transient + ', until=' + (s.until ? '+' + (s.until - T0) : 0) + ')')
}
// 结论按实测算，不写死（契约变更后旧结论会失真）
const atSwitch = D.resolve(s, T0 + 310)
const untilRel = s.until ? s.until - T0 : null
console.log('')
console.log('t+310（turn/end 之后）display =', atSwitch)
console.log('error 窗口截止 t+' + untilRel)
console.log('')
if (atSwitch === 'error' && untilRel === 5100) {
  console.log('结论：新契约下 turn/end(aborted) **不再清掉** error，')
  console.log('      error 从 t+300 一直可见到 t+5100（4800ms hold 生效），')
  console.log('      到期后回落到此刻 base = idle。')
} else {
  console.log('结论：error 在 t+310 被 turn/end(aborted) 清掉，实际只可见 10ms。')
  console.log('      —— 这是契约变更前的行为；若仍如此说明修复未生效。')
}
