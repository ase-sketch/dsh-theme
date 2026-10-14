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
