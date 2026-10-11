/**
 * dsh-theme · M6 Deepy 状态机单元测试。
 *
 * 为什么存在：探针（.agents/tmp/m6-probe/probe-result.json）只能活体触发
 * turn/end=completed、tool/result 成功、running true/false 这几条路径。
 * 其余分支（error/max-tokens/interrupted/blocked/aborted/forked、失败判据、
 * 跨会话三档、时间窗衰减、抢占语义）无法在真实 GUI 里按需触发，
 * 因此用纯函数单测覆盖——不许只写「已按类型实现」。
 *
 * 加载方式：伪造 window.__ModuleLoader__ + 假 require，真实加载
 * plugins/dsh-theme/lib/client.js，从 factory 返回值取 exports.__deepy。
 * 这样测的是**真正要发运的那份代码**，不是复制品。
 *
 * 运行：node plugins/dsh-theme/test/state-machine.test.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = path.resolve(HERE, '..', 'lib', 'client.js')

let loaded = null
function loadClient() {
  if (loaded) return loaded
  const source = fs.readFileSync(CLIENT_PATH, 'utf8')
  const sandbox = {}
  globalThis.window = sandbox
  globalThis.document = { head: { appendChild() {} }, getElementById: () => null }
  sandbox.__ModuleLoader__ = {
    load(spec) {
      const factory = spec.factory
      // 假 require：client.js 只依赖 react
      const fakeRequire = (name) => {
        if (name === 'react') return { createElement: () => null, useState: () => [null, () => {}], useEffect: () => {} }
        throw new Error('unexpected require: ' + name)
      }
      loaded = factory(fakeRequire)
    },
  }
  // eslint-disable-next-line no-eval
  ;(0, eval)(source)
  return loaded
}


let passed = 0
let failed = 0
const failures = []
function check(name, condition, detail) {
  if (condition) { passed += 1 }
  else { failed += 1; failures.push(name + (detail ? ' :: ' + detail : '')) }
}
function eq(name, actual, expected) {
  check(name, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
}


const client = loadClient()
const D = client.__deepy
check('exports.__deepy 存在', !!D)
check('exports.inject 是服务名三件套', JSON.stringify(client.inject) === JSON.stringify(['slots','sessions','uiSession']), JSON.stringify(client.inject))
eq('8 态齐备', D.STATES.length, 8)

const T0 = 1_000_000
function ev(type, data) { return { type: 'event', event: { type, data: data || {} } } }
function tr(type, data) { return { type: 'transient', event: { type, data: data || {} } } }
function run(state, entry, now) { return D.project(state, entry, now === undefined ? T0 : now) }
function fresh() { return D.initial() }

// ── 分组 1：turn/end 的 7 种 reason ────────────────────────────────────
{
  const cases = [
    ['completed', 'happy', true],
    ['error', 'error', true],
    ['max-tokens', 'error', true],
    ['interrupted', 'error', true],
    ['blocked', 'notification', true],
    ['aborted', 'idle', false],
    ['forked', 'idle', false],
  ]
  for (const [kind, want, isTransient] of cases) {
    const s = run(fresh(), ev('turn/end', { reason: { kind } }))
    if (isTransient) eq('turn/end ' + kind + ' -> 瞬时态 ' + want, s.transient, want)
    else { eq('turn/end ' + kind + ' -> base ' + want, s.base, want); eq('turn/end ' + kind + ' 无瞬时态', s.transient, null) }
  }
  // 瞬时态时长
  eq('happy hold = 5200', D.HOLD_MS.happy, 5200)
  eq('error hold = 4800', D.HOLD_MS.error, 4800)
  eq('notification hold = 3200', D.HOLD_MS.notification, 3200)
  const h = run(fresh(), ev('turn/end', { reason: { kind: 'completed' } }), T0)
  eq('happy until = now + 5200', h.until, T0 + 5200)
  // reason 用字符串（非对象）也应容错
  const s2 = run(fresh(), ev('turn/end', { reason: 'completed' }))
  eq('reason 是裸字符串也能识别', s2.transient, 'happy')
  // 未知 reason -> idle（不崩）
  const s3 = run(fresh(), ev('turn/end', { reason: { kind: 'whatever' } }))
  eq('未知 reason 回落 idle', s3.base, 'idle')
}

// ── 分组 2：tool/result 失败判据 ──────────────────────────────────────
{
  const withTool = run(fresh(), ev('tool/call', { callId: 'c1', name: 'bash' }))
  eq('先有一个活跃工具', withTool.activeTools.length, 1)

  const byFlag = run(withTool, ev('tool/result', { message: { isError: true, toolCallId: 'c1' } }))
  eq('message.isError=true -> error', byFlag.transient, 'error')

  const byErrorField = run(withTool, ev('tool/result', { error: { name: 'X', code: 'Y' }, message: { toolCallId: 'c1' } }))
  eq('data.error 存在 -> error', byErrorField.transient, 'error')

  const okStillActive = run(
    run(fresh(), ev('tool/call', { callId: 'c1' })),
    ev('tool/result', { message: { isError: false, toolCallId: 'c9' } })   // 不匹配的 id，计数不下降
  )
  eq('成功且仍有活跃工具 -> typing', okStillActive.base, 'typing')

  const okNone = run(
    run(fresh(), ev('tool/call', { callId: 'c1' })),
    ev('tool/result', { message: { isError: false, toolCallId: 'c1' } })
  )
  eq('成功且无活跃工具 -> thinking', okNone.base, 'thinking')
  eq('成功后活跃工具清零', okNone.activeTools.length, 0)
}

// ── 分组 3：tool/call 计数（callId 配对是承重的） ──────────────────────
{
  let s = fresh()
  s = run(s, ev('tool/call', { callId: 'a' })); eq('1 个活跃工具 -> typing', s.base, 'typing')
  s = run(s, ev('tool/call', { callId: 'b' })); eq('2 个活跃工具 -> music', s.base, 'music')
  s = run(s, ev('tool/call', { callId: 'c' })); eq('3 个活跃工具 -> building', s.base, 'building')
  s = run(s, ev('tool/call', { callId: 'd' })); eq('4 个活跃工具 -> building', s.base, 'building')
  s = run(s, ev('tool/call', { callId: 'a' })); eq('重复 callId 不重复计数', s.activeTools.length, 4)

  // 正确配对：用 message.toolCallId
  const s2 = run(s, ev('tool/result', { message: { isError: false, toolCallId: 'a' } }))
  eq('用 toolCallId 配对 -> 计数下降到 3', s2.activeTools.length, 3)
  // 契约：成功的 tool/result 一律收敛到 typing（仍有活跃工具）/ thinking（没有了）；
  // 并发档位由 tool/call 决定，不由 tool/result 重算。
  eq('成功的 tool/result 收敛到 typing（仍有活跃工具）', s2.base, 'typing')

  // 故意用错字段（data.callId）——配对必须失败，计数不下降
  const wrong = run(s, ev('tool/result', { callId: 'a', message: { isError: false } }))
  eq('用错字段 data.callId -> 计数不下降（配对是承重的）', wrong.activeTools.length, 4)
  eq('计数未降到 3', wrong.activeTools.length === 3, false)

  // 继续降到 1 仍按契约是 typing
  const s3 = run(s2, ev('tool/result', { message: { isError: false, toolCallId: 'b' } }))
  eq('降到 2 仍 typing（契约）', s3.base, 'typing')
  const s4 = run(s3, ev('tool/result', { message: { isError: false, toolCallId: 'c' } }))
  eq('降到 1 仍 typing（契约）', s4.base, 'typing')
  // 全部收完后回到 thinking
  const s4b = run(s4, ev('tool/result', { message: { isError: false, toolCallId: 'd' } }))
  eq('全部收完 -> thinking', s4b.base, 'thinking')
  eq('全部收完计数为 0', s4b.activeTools.length, 0)

  // turn/end 清零
  const s5 = run(s4, ev('turn/end', { reason: { kind: 'aborted' } }))
  eq('turn/end 清零活跃工具', s5.activeTools.length, 0)
}

// ── 分组 4：live-chunk ────────────────────────────────────────────────
{
  eq('reasoning-delta -> thinking', run(fresh(), tr('assistant/live-chunk', { chunk: { type: 'reasoning-delta' } })).base, 'thinking')
  eq('text-delta -> typing', run(fresh(), tr('assistant/live-chunk', { chunk: { type: 'text-delta' } })).base, 'typing')
  const before = run(fresh(), ev('turn/start', {}))
  for (const t of ['block-start', 'block-end', 'usage', 'finish', 'tool-call-delta']) {
    const after = run(before, tr('assistant/live-chunk', { chunk: { type: t } }))
    eq('chunk ' + t + ' 不改变状态', after.base, before.base)
  }
  const noChunk = run(before, tr('assistant/live-chunk', {}))
  eq('live-chunk 无 chunk 字段不崩', noChunk.base, 'thinking')
}

// ── 分组 5：窗口形状（settle-assistant 无 entries / 小数 seq） ────────
{
  // 投影层不接收 change 对象；这里验证「settle-assistant 无 entries」时调用方不崩，
  // 即：把 undefined entry 传进来应返回等价状态而不是抛错。
  let threw = false
  let out = null
  try { out = D.project(fresh(), undefined, T0) } catch (e) { threw = true }
  check('project(undefined) 不抛错', !threw)
  eq('project(undefined) 返回等价状态', out && out.base, 'idle')
  const noEvent = D.project(fresh(), { type: 'transient' }, T0)
  eq('entry 无 event 字段也不崩', noEvent.base, 'idle')

  // 小数 seq（transient 事件实测 seq 形如 18.979166666666668）：不应被当整数索引。
  // 投影只读 event.data，不读 seq，因此这里断言「带小数 seq 的事件照常投影」。
  const fractional = { type: 'transient', event: { type: 'assistant/live-chunk', seq: 18.979166666666668, data: { chunk: { type: 'text-delta' } } } }
  eq('小数 seq 的事件照常投影', D.project(fresh(), fractional, T0).base, 'typing')
}

// ── 分组 6：跨会话档位 ────────────────────────────────────────────────
{
  eq('空 Map -> null（由焦点会话决定）', D.concurrencyState(new Map(), null), null)
  eq('null 状态源 -> null', D.concurrencyState(null, null), null)
  eq('非 Map 对象 -> null', D.concurrencyState({}, null), null)

  function mk(entries) { const m = new Map(); for (const [id, running] of entries) m.set(id, { running, pendingInteraction: undefined, completionUnread: false }); return m }
  const list = (rows) => ({ byId: rows })

  eq('1 个 running -> null', D.concurrencyState(mk([['s1', true]]), list({ s1: {} })), null)
  eq('2 个 running -> music', D.concurrencyState(mk([['s1', true], ['s2', true]]), list({ s1: {}, s2: {} })), 'music')
  eq('3 个 running -> building', D.concurrencyState(mk([['s1', true], ['s2', true], ['s3', true]]), list({ s1: {}, s2: {} })), 'building')
  eq('running=false 不计数', D.concurrencyState(mk([['s1', true], ['s2', false]]), list({})), null)
  eq('running=undefined 不计数', D.concurrencyState(mk([['s1', true], ['s2', undefined]]), list({})), null)

  // origin 过滤（防御性：SessionStatus 无 origin，取自 sessions.list.byId）
  eq('subagent 行被过滤（2 真 + 1 subagent）', D.concurrencyState(
    mk([['s1', true], ['s2', true], ['sub', true]]),
    list({ s1: {}, s2: {}, sub: { origin: 'subagent' } })
  ), 'music')
  eq('subagent 行被过滤（3 真 + 2 subagent 仍 building）', D.concurrencyState(
    mk([['s1', true], ['s2', true], ['s3', true], ['x', true], ['y', true]]),
    list({ s1: {}, s2: {}, s3: {}, x: { origin: 'subagent' }, y: { origin: 'subagent' } })
  ), 'building')
  eq('缺行视为非 subagent（计入）', D.concurrencyState(
    mk([['s1', true], ['s2', true]]), list({})
  ), 'music')
  eq('list 为 null 时全部计入', D.concurrencyState(mk([['s1', true], ['s2', true]]), null), 'music')
}

// ── 分组 7：时间窗衰减 ────────────────────────────────────────────────
{
  const base = fresh()
  for (const [state, hold] of [['happy', 5200], ['error', 4800], ['notification', 3200]]) {
    const entry = state === 'happy'
      ? ev('turn/end', { reason: { kind: 'completed' } })
      : state === 'notification'
        ? ev('turn/end', { reason: { kind: 'blocked' } })
        : ev('tool/result', { message: { isError: true, toolCallId: 'zz' } })
    const s = run(base, entry, T0)
    eq(state + ' 立刻可见', D.resolve(s, T0), state)
    eq(state + ' 到期前 1ms 仍可见', D.resolve(s, T0 + hold - 1), state)
    eq(state + ' 恰好到期时回落', D.resolve(s, T0 + hold), 'idle')
    eq(state + ' 到期后回落', D.resolve(s, T0 + hold + 1), 'idle')
    // decay 把瞬时态清掉
    eq(state + ' decay 后 transient=null', D.decay(s, T0 + hold).transient, null)
    eq(state + ' decay 前 transient 保留', D.decay(s, T0 + hold - 1).transient, state)
  }
  // error 由 tool/result 触发时 base 保持 idle
  const e = run(base, ev('tool/result', { message: { isError: true, toolCallId: 'zz' } }), T0)
  eq('瞬时 error 不夺 base（仍 idle）', e.base, 'idle')
  eq('error 到期回落 idle', D.resolve(e, T0 + 4800), 'idle')
}

// ── 分组 8：抢占语义 ──────────────────────────────────────────────────
{
  // 8a 瞬时态覆盖期间再来瞬时态：只续期，不夺 base
  let s = run(fresh(), ev('turn/end', { reason: { kind: 'completed' } }), T0)       // happy, until T0+5200
  eq('happy base 仍是 idle', s.base, 'idle')
  s = run(s, ev('tool/result', { message: { isError: true, toolCallId: 'x' } }), T0 + 1000)  // error 覆盖
  eq('error 覆盖 happy', D.resolve(s, T0 + 1000), 'error')
  eq('覆盖后 base 未变', s.base, 'idle')
  eq('error 重新计时（T0+1000+4800）', s.until, T0 + 1000 + 4800)
  eq('原 happy 到期时刻不再生效（T0+5200 时仍是 error）', D.resolve(s, T0 + 5200), 'error')
  eq('新窗口到期才回落', D.resolve(s, T0 + 1000 + 4800), 'idle')

  // 8b 瞬时态覆盖期间来持久态：base 换新，瞬时态被清
  let t = run(fresh(), ev('turn/end', { reason: { kind: 'completed' } }), T0)       // happy 覆盖中
  eq('覆盖中先确认瞬时态', D.resolve(t, T0 + 10), 'happy')
  t = run(t, ev('turn/start', {}), T0 + 20)
  eq('持久态夺回显示', D.resolve(t, T0 + 20), 'thinking')
  eq('持久态清掉瞬时态', t.transient, null)
  eq('持久态 base 换新', t.base, 'thinking')

  // 8c 显示优先级：瞬时态优先于跨会话档位（Q3 裁定）
  const instant = run(fresh(), ev('turn/end', { reason: { kind: 'completed' } }), T0)
  eq('瞬时态压过 building', D.displayState(instant, T0, 'building'), 'happy')
  eq('无瞬时态时 building 生效', D.displayState(fresh(), T0, 'building'), 'building')
  eq('无瞬时态无并发 -> base', D.displayState(fresh(), T0, null), 'idle')
  eq('瞬时态到期后 building 接管', D.displayState(instant, T0 + 5200, 'building'), 'building')
}

// ── 汇总 ──────────────────────────────────────────────────────────────
console.log('')
console.log('passed: ' + passed)
console.log('failed: ' + failed)
if (failures.length) {
  console.log('')
  console.log('FAILURES:')
  for (const f of failures) console.log('  - ' + f)
}
console.log('')
console.log(failed === 0 ? 'RESULT: PASS' : 'RESULT: FAIL')
process.exit(failed === 0 ? 0 : 1)
