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
  // R3 契约：档位始终反映**剩余**活跃工具数（0→thinking / 1→typing / 2→music / ≥3→building）。
  eq('剩 3 个仍 building', s2.base, 'building')

  // 故意用错字段（data.callId）——配对必须失败，计数不下降
  const wrong = run(s, ev('tool/result', { callId: 'a', message: { isError: false } }))
  eq('用错字段 data.callId -> 计数不下降（配对是承重的）', wrong.activeTools.length, 4)
  eq('计数未降到 3', wrong.activeTools.length === 3, false)

  // 逐级下降：3→music、2→typing、1→thinking（本次 R3 修正的回归测试）
  const s3 = run(s2, ev('tool/result', { message: { isError: false, toolCallId: 'b' } }))
  eq('降到 2 -> music', s3.base, 'music')
  eq('降到 2 时计数', s3.activeTools.length, 2)
  const s4 = run(s3, ev('tool/result', { message: { isError: false, toolCallId: 'c' } }))
  eq('降到 1 -> typing', s4.base, 'typing')
  eq('降到 1 时计数', s4.activeTools.length, 1)
  const s4b = run(s4, ev('tool/result', { message: { isError: false, toolCallId: 'd' } }))
  eq('全部收完 -> thinking', s4b.base, 'thinking')
  eq('全部收完计数为 0', s4b.activeTools.length, 0)

  // turn/end 清零
  const s5 = run(s4, ev('turn/end', { reason: { kind: 'aborted' } }))
  eq('turn/end 清零活跃工具', s5.activeTools.length, 0)
}

// ── 分组 3b：R3 回归——3 并发完成 1 个后应显示 music（不是固定 typing） ──
{
  let s = fresh()
  s = run(s, ev('tool/call', { callId: 'x1' }))
  s = run(s, ev('tool/call', { callId: 'x2' }))
  s = run(s, ev('tool/call', { callId: 'x3' }))
  eq('R3: 3 个并发 call -> building', s.base, 'building')

  s = run(s, ev('tool/result', { message: { isError: false, toolCallId: 'x1' } }))
  eq('R3: 完成 1 个后 -> music（旧契约会错误地给 typing）', s.base, 'music')

  s = run(s, ev('tool/result', { message: { isError: false, toolCallId: 'x2' } }))
  eq('R3: 再完成 1 个 -> typing', s.base, 'typing')

  s = run(s, ev('tool/result', { message: { isError: false, toolCallId: 'x3' } }))
  eq('R3: 全部完成 -> thinking', s.base, 'thinking')
  eq('R3: 计数归零', s.activeTools.length, 0)

  // 失败路径：error 瞬时态到期后应回落到「当时的剩余活跃数」档位，不是固定 base
  let f = fresh()
  f = run(f, ev('tool/call', { callId: 'y1' }), T0)
  f = run(f, ev('tool/call', { callId: 'y2' }), T0)
  f = run(f, ev('tool/result', { message: { isError: true, toolCallId: 'y1' } }), T0)
  eq('R3: 失败 -> error 瞬时态', D.resolve(f, T0), 'error')
  eq('R3: 失败时剩余 1 个工具，base 记 typing', f.base, 'typing')
  eq('R3: error 到期后回落 typing（非固定 base）', D.resolve(f, T0 + 4800), 'typing')
  eq('R3: 失败也把该 callId 从计数移除', f.activeTools.length, 1)
}

// ── 分组 3c：瞬时态 hold 窗口（契约变更 2026-10-11） ──────────────────
// 真实事件流：用户点「停止生成」→ tool/result(isError) 紧接着 turn/end(aborted)。
// 原规则下 turn/end 的 persistent 会立刻清掉 error，实测只可见 10–270ms。
// 新规则：瞬时态在 hold 窗口内保持可见，只有 turn/start 清除它。
{
  // 3c-1 复现验收方观测序列：error 必须活满 4800ms
  let s = fresh()
  s = run(s, ev('turn/start', {}), T0)                                  // thinking
  s = run(s, tr('assistant/live-chunk', { chunk: { type: 'text-delta' } }), T0 + 100)  // typing
  s = run(s, ev('tool/call', { callId: 'c1', name: 'pwsh' }), T0 + 200) // typing
  s = run(s, ev('tool/result', { message: { isError: true, toolCallId: 'c1' } }), T0 + 300)
  eq('停止生成：工具失败 -> error', D.resolve(s, T0 + 300), 'error')
  s = run(s, ev('turn/end', { reason: { kind: 'aborted' } }), T0 + 310)  // ← 原规则在这里清掉 error
  eq('turn/end(aborted) 不再清掉 error', D.resolve(s, T0 + 310), 'error')
  eq('error 仍在窗口内（+2000ms）', D.resolve(s, T0 + 2300), 'error')
  eq('error 仍在窗口内（+4799ms）', D.resolve(s, T0 + 300 + 4799), 'error')
  eq('aborted 把 base 设为 idle', s.base, 'idle')
  // 到期后回落到「此刻的 base」——turn/end(aborted) 已把 base 设为 idle。
  eq('error 到期后回落 idle（turn/end aborted 的 base）', D.resolve(s, T0 + 300 + 4800), 'idle')

  // 3c-2 瞬时态期间来 tool/result 成功 -> 仍是 error
  let t = fresh()
  t = run(t, ev('tool/call', { callId: 'a' }), T0)
  t = run(t, ev('tool/result', { message: { isError: true, toolCallId: 'a' } }), T0)
  eq('失败 -> error', D.resolve(t, T0), 'error')
  t = run(t, ev('tool/result', { message: { isError: false, toolCallId: 'b' } }), T0 + 500)
  eq('error 期间成功 result 不夺显示', D.resolve(t, T0 + 500), 'error')
  eq('但 base 已按剩余数更新为 thinking', t.base, 'thinking')

  // 3c-3 瞬时态期间来 turn/start -> 清除并进 thinking
  let u = run(fresh(), ev('turn/end', { reason: { kind: 'completed' } }), T0)
  eq('happy 覆盖中', D.resolve(u, T0 + 10), 'happy')
  u = run(u, ev('turn/start', {}), T0 + 20)
  eq('turn/start 清除瞬时态', u.transient, null)
  eq('turn/start 后显示 thinking', D.resolve(u, T0 + 20), 'thinking')

  // 3c-4 step/start 不清瞬时态（同轮内的下一次模型调用）
  let v = run(fresh(), ev('tool/result', { message: { isError: true, toolCallId: 'z' } }), T0)
  eq('error 覆盖中', D.resolve(v, T0 + 10), 'error')
  v = run(v, ev('step/start', { turn: 1, step: 2 }), T0 + 20)
  eq('step/start 不清瞬时态（仍是 error）', D.resolve(v, T0 + 20), 'error')
  eq('step/start 仍换 base 为 thinking', v.base, 'thinking')

  // 3c-5 瞬时态期间来 live-chunk 也不夺显示
  let w = run(fresh(), ev('turn/end', { reason: { kind: 'blocked' } }), T0)
  eq('notification 覆盖中', D.resolve(w, T0 + 10), 'notification')
  w = run(w, tr('assistant/live-chunk', { chunk: { type: 'text-delta' } }), T0 + 20)
  eq('notification 期间 live-chunk 不夺显示', D.resolve(w, T0 + 20), 'notification')
  eq('notification 到期后回落 typing', D.resolve(w, T0 + 3200), 'typing')

  // 3c-6 瞬时态期间来 tool/call 也不夺显示
  let x = run(fresh(), ev('turn/end', { reason: { kind: 'completed' } }), T0)
  x = run(x, ev('tool/call', { callId: 'k1' }), T0 + 20)
  eq('happy 期间 tool/call 不夺显示', D.resolve(x, T0 + 20), 'happy')
  eq('happy 到期后回落 typing（1 个活跃工具）', D.resolve(x, T0 + 5200), 'typing')
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
    // 三种瞬时态统一用 turn/end 触发：base 保持 idle，回落断言才可比。
    // tool/result 触发的 error 会按 R3 回落到工具档位，单独在下方测。
    const entry = state === 'happy'
      ? ev('turn/end', { reason: { kind: 'completed' } })
      : state === 'notification'
        ? ev('turn/end', { reason: { kind: 'blocked' } })
        : ev('turn/end', { reason: { kind: 'error' } })
    const s = run(base, entry, T0)
    eq(state + ' 立刻可见', D.resolve(s, T0), state)
    eq(state + ' 到期前 1ms 仍可见', D.resolve(s, T0 + hold - 1), state)
    eq(state + ' 恰好到期时回落', D.resolve(s, T0 + hold), 'idle')
    eq(state + ' 到期后回落', D.resolve(s, T0 + hold + 1), 'idle')
    // decay 把瞬时态清掉
    eq(state + ' decay 后 transient=null', D.decay(s, T0 + hold).transient, null)
    eq(state + ' decay 前 transient 保留', D.decay(s, T0 + hold - 1).transient, state)
  }
  // error 由 tool/result 触发：base 记下「此刻剩余活跃数」的档位（R3），
  // 无活跃工具时该档位就是 thinking，到期后回落到它。
  const e = run(base, ev('tool/result', { message: { isError: true, toolCallId: 'zz' } }), T0)
  eq('瞬时 error 不夺显示（base 记档位）', e.base, 'thinking')
  eq('error 到期回落 thinking（剩余 0 个工具）', D.resolve(e, T0 + 4800), 'thinking')
  // 对比：turn/end 触发的 error 不回落到工具档位，而是 idle
  const e2 = run(base, ev('turn/end', { reason: { kind: 'error' } }), T0)
  eq('turn/end error 的 base 保持 idle', e2.base, 'idle')
  eq('turn/end error 到期回落 idle', D.resolve(e2, T0 + 4800), 'idle')
}

// ── 分组 8：抢占语义 ──────────────────────────────────────────────────
{
  // 8a 瞬时态覆盖期间再来瞬时态：只续期，不夺 base
  let s = run(fresh(), ev('turn/end', { reason: { kind: 'completed' } }), T0)       // happy, until T0+5200
  eq('happy base 仍是 idle', s.base, 'idle')
  s = run(s, ev('tool/result', { message: { isError: true, toolCallId: 'x' } }), T0 + 1000)  // error 覆盖
  eq('error 覆盖 happy', D.resolve(s, T0 + 1000), 'error')
  eq('覆盖后 base 被记为工具档位（剩余 0 -> thinking）', s.base, 'thinking')
  eq('error 重新计时（T0+1000+4800）', s.until, T0 + 1000 + 4800)
  eq('原 happy 到期时刻不再生效（T0+5200 时仍是 error）', D.resolve(s, T0 + 5200), 'error')
  eq('新窗口到期才回落', D.resolve(s, T0 + 1000 + 4800), 'thinking')

  // 8b 契约变更后：**只有 turn/start**（新一轮）能清瞬时态。
  // 旧版这里写的是「持久态夺回显示」——那条已被 2026-10-11 的契约变更取代，
  // 见分组 3c。此处保留 turn/start 这一条，并明确它不是通用规则。
  let t = run(fresh(), ev('turn/end', { reason: { kind: 'completed' } }), T0)       // happy 覆盖中
  eq('覆盖中先确认瞬时态', D.resolve(t, T0 + 10), 'happy')
  t = run(t, ev('turn/start', {}), T0 + 20)
  eq('turn/start（新一轮）夺回显示', D.resolve(t, T0 + 20), 'thinking')
  eq('turn/start 清掉瞬时态', t.transient, null)
  eq('turn/start 换 base', t.base, 'thinking')
  // 反例：step/start 是同一轮内的事件，不得清瞬时态（分组 3c-4 已详测）
  const t2 = run(fresh(), ev('turn/end', { reason: { kind: 'completed' } }), T0)
  const t3 = run(t2, ev('step/start', { turn: 1, step: 2 }), T0 + 20)
  eq('反例：step/start 不清瞬时态', D.resolve(t3, T0 + 20), 'happy')

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
