/**
 * dsh-theme · M6 Deepy 渲染层回归测试。
 *
 * 覆盖验收方抓到的真缺陷：**切换会话后精灵永久消失**。
 * 根因：旧写法手动 appendChild 进 React 拥有的 slot 容器；React 切会话重渲染时
 * 清掉它不认识的子节点（sprite），host 元素留下；旧守卫
 * （container.isConnected / if (!sprite)）让播放器无法自愈 —— 状态机照跑但不画。
 *
 * 本测试驱动**真实的 installDeepy**（非复制品），用最小 DOM/React 桩真实模拟：
 *   1) React 挂载 sprite 节点（调用 ref 回调把节点交给播放器）
 *   2) React 销毁旧节点、重建新节点（= 切会话）
 *   3) 断言播放器仍能画到**新**节点上 —— 自愈是结构性保证
 *
 * 运行：node plugins/dsh-theme/test/render-layer.test.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = path.resolve(HERE, '..', 'lib', 'client.js')
const MANIFEST_PATH = path.resolve(HERE, '..', 'assets', 'deepy', 'deepy.json')

let passed = 0
let failed = 0
const failures = []
function check(name, condition, detail) {
  if (condition) passed += 1
  else { failed += 1; failures.push(name + (detail ? ' :: ' + detail : '')) }
}
// 安全描述：DOM 桩节点带循环引用（parentNode ↔ children），不能直接 JSON.stringify
function describe(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v !== 'object') return JSON.stringify(v)
  if (v.tagName) return '<' + v.tagName.toLowerCase() + (v.className ? '.' + v.className : '') + '>'
  try { return JSON.stringify(v) } catch (e) { return '[object]' }
}
function eq(name, actual, expected) {
  check(name, actual === expected, 'expected ' + describe(expected) + ', got ' + describe(actual))
}

// ── 最小 DOM 桩 ────────────────────────────────────────────────────────
function markConnected(node, value) {
  node.isConnected = value
  for (const c of node.children) markConnected(c, value)
}
function makeNode(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    className: '', id: '', style: {}, attributes: {}, children: [], parentNode: null, isConnected: false,
    setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') this.id = v },
    getAttribute(k) { return this.attributes[k] === undefined ? null : this.attributes[k] },
    appendChild(child) {
      child.parentNode = this
      this.children.push(child)
      markConnected(child, this.isConnected)
      return child
    },
    removeChild(child) {
      const i = this.children.indexOf(child)
      if (i !== -1) this.children.splice(i, 1)
      child.parentNode = null
      markConnected(child, false)
      return child
    },
    querySelector() { return null },
    remove() { if (this.parentNode) this.parentNode.removeChild(this) },
  }
}
function makeDocument() {
  const doc = {
    head: makeNode('head'), body: makeNode('body'), hidden: false,
    _byId: new Map(), _listeners: {},
    createElement: (tag) => makeNode(tag),
    // 只返回仍挂在文档里的节点：React 卸载后旧节点必须查不到，
    // 否则 removeStyle()/installStyle() 的幂等性判断会失真。
    getElementById(id) {
      const node = doc._byId.get(id)
      if (!node) return null
      if (!node.parentNode && node !== doc.body && node !== doc.head) { doc._byId.delete(id); return null }
      return node
    },
    querySelector() { return null },
    addEventListener(t, fn) { (doc._listeners[t] = doc._listeners[t] || []).push(fn) },
    removeEventListener(t, fn) {
      const a = doc._listeners[t]; if (!a) return
      const i = a.indexOf(fn); if (i !== -1) a.splice(i, 1)
    },
  }
  doc.body.isConnected = true
  doc.head.isConnected = true
  const orig = doc.head.appendChild.bind(doc.head)
  doc.head.appendChild = (child) => {
    const r = orig(child)
    if (child.id) doc._byId.set(child.id, child)
    return r
  }
  const origRemove = doc.head.removeChild.bind(doc.head)
  doc.head.removeChild = (child) => {
    const r = origRemove(child)
    if (child.id && doc._byId.get(child.id) === child) doc._byId.delete(child.id)
    return r
  }
  return doc
}

// ── React 桩：记录函数组件与 ref 回调，供测试真实驱动挂载/卸载 ────────
// 这是本测试的关键：ref 是播放器拿到节点的唯一途径，
// 桩必须真的调用它，否则「自愈」根本没被验证。
const refCallbacks = []
const functionComponents = []
let currentComponent = null   // 正在渲染的函数组件（模拟 React 的渲染栈）
let currentProps = null
function makeReact() {
  return {
    // 关键：遇到函数组件就**真的调用它**（模拟 React 渲染），
    // 这样 DeepyView → DeepySprite 的 ref 回调才会被注册到桩里。
    // 不这么做的话，「ref 把新节点交回播放器」这条路径根本没被验证。
    createElement(type, props, ...children) {
      if (typeof type === 'function') {
        functionComponents.push(type)
        const prev = currentComponent
        const prevProps = currentProps
        currentComponent = type
        currentProps = props || {}
        let rendered
        try { rendered = type(props || {}, ...children) } finally {
          currentComponent = prev
          currentProps = prevProps
        }
        return rendered
      }
      const vnode = { type, props: props || {}, children }
      if (typeof props?.ref === 'function') refCallbacks.push({ type, ref: props.ref, vnode })
      return vnode
    },
    // setState 必须**真的触发一次重渲染**（重新调用当前组件），
    // 否则 bumpView → rerender 之后 DeepySprite 不会被再次渲染、ref 永不注册，
    // 「React 重建节点后 ref 重新赋值」这条自愈路径就没被验证。
    useState(init) {
      let value = typeof init === 'function' ? init() : init
      const owner = currentComponent
      const ownerProps = currentProps
      return [value, (next) => {
        value = typeof next === 'function' ? next(value) : next
        if (typeof owner === 'function') owner(ownerProps || {})
      }]
    },
    useEffect(fn) { return fn() },
  }
}

// ── 加载真实 client.js ────────────────────────────────────────────────
const MANIFEST = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
let loaded = null
function loadClient() {
  if (loaded) return loaded
  const doc = makeDocument()
  const reactStub = makeReact()
  const rafQueue = []
  const win = {
    document: doc,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length },
    cancelAnimationFrame() {},
  }
  globalThis.window = win
  globalThis.document = doc
  // Image 桩：设置 src 后异步触发 onload（否则素材永远不就绪，viewReady 永不置位）
  globalThis.Image = function () {
    this.onload = null
    this.onerror = null
    let _src = ''
    Object.defineProperty(this, 'src', {
      get: () => _src,
      set: (v) => { _src = v; setTimeout(() => { if (this.onload) this.onload() }, 0) },
    })
  }
  globalThis.fetch = () => Promise.resolve({
    ok: true,
    json: () => Promise.resolve(MANIFEST),
    text: () => Promise.resolve(''),
  })
  win.__ModuleLoader__ = {
    load(spec) {
      loaded = spec.factory((name) => {
        if (name === 'react') return reactStub
        throw new Error('unexpected require: ' + name)
      })
    },
  }
  ;(0, eval)(fs.readFileSync(CLIENT_PATH, 'utf8'))
  loaded.__test = { doc, rafQueue, refCallbacks, functionComponents, react: reactStub }
  return loaded
}
const client = loadClient()
const D = client.__deepy
const T = client.__test

let rafClock = 0
function pumpRaf(times) {
  for (let i = 0; i < times; i += 1) {
    rafClock += 100          // 单调递增，保证 timestamp - lastFrameAt >= frameMs
    const fns = T.rafQueue.splice(0, T.rafQueue.length)
    for (const fn of fns) fn(rafClock)
  }
}
const settle = () => new Promise((r) => setTimeout(r, 20))

// ── 测试 1：帧几何纯函数（两条红线） ──────────────────────────────────
{
  const m = MANIFEST
  const g0 = D.frameGeometry(0, m.states.idle, m)
  eq('帧 0 col=0', g0.col, 0)
  eq('帧 0 row=0', g0.row, 0)
  eq('元素宽度 = displayPx（防相邻帧泄入）', g0.width, m.displayPx + 'px')
  eq('元素高度 = displayPx', g0.height, m.displayPx + 'px')
  eq('background-size 宽 = cols*displayPx', g0.backgroundSize.split(' ')[0], (m.cols * m.displayPx) + 'px')
  eq('background-size 高 = rows*displayPx', g0.backgroundSize.split(' ')[1], (m.states.idle.rows * m.displayPx) + 'px')
  eq('帧 0 位置', g0.backgroundPosition, '0px 0px')

  const g9 = D.frameGeometry(9, m.states.idle, m)
  eq('帧 9 col = 9%8 = 1', g9.col, 1)
  eq('帧 9 row = 1', g9.row, 1)
  eq('帧 9 位置', g9.backgroundPosition, (-1 * m.displayPx) + 'px ' + (-1 * m.displayPx) + 'px')

  const happy = m.states.happy
  eq('happy 帧数 52（有行尾 padding）', happy.frames, 52)
  eq('happy 帧 52 回绕到 0', D.frameGeometry(52, happy, m).index, 0)
  eq('happy 最后一帧 index=51', D.frameGeometry(51, happy, m).index, 51)
  const last = D.frameGeometry(51, happy, m)
  check('happy 最后一帧未越到 padding 行', last.row < happy.rows, 'row=' + last.row + ' rows=' + happy.rows)
  eq('负帧序号回绕到 51', D.frameGeometry(-1, happy, m).index, 51)

  let overflow = null
  for (const [name, meta] of Object.entries(m.states)) {
    for (let f = 0; f < meta.frames * 2 + 5; f += 1) {
      const g = D.frameGeometry(f, meta, m)
      if (g.row >= meta.rows || g.col >= m.cols) { overflow = name + '@' + f; break }
    }
    if (overflow) break
  }
  eq('8 态任意帧号都不越出网格', overflow, null)
}

// ── 测试 2：渲染层自愈（本次缺陷的回归） ──────────────────────────────
// slot 桩：register 必须**真的渲染注册的组件**（模拟 shell 的 renderSlot），
// 否则 DeepyView 永远不会被调用，ref 路径也就无从验证。
let registeredComponent = null
const ctx = {
  effect(fn) { return fn() },
  slots: {
    inject(name, cb) { cb(); return () => {} },
    register(options, component) {
      registeredComponent = component
      // 模拟 shell：注册即渲染一次（真实 shell 会在 slot 位置 renderSlot）
      const reactStub = { createElement: T.react.createElement }
      reactStub.createElement(component, {})
      return () => { registeredComponent = null }
    },
  },
  sessions: {
    list: { subscribe() { return () => {} }, getSnapshot() { return { byId: {}, ids: [], phase: 'ready' } } },
    binding() { return { eventSource: { subscribe: () => () => {}, getSnapshot: () => ({ entries: [], change: { kind: 'append', entries: [] } }) }, session: {}, sessionId: 's1', ctx: {} } },
  },
  uiSession: { sessionStatus: { subscribe() { return () => {} }, getSnapshot() { return new Map() } } },
}

const player = D.install(ctx)
check('installDeepy 返回 dispose', typeof player.dispose === 'function')
eq('初始 spriteEl 为 null（React 还没挂）', player.debug.getSprite(), null)
eq('初始 viewReady=false', player.debug.isViewReady(), false)

// 让 manifest + idle 素材就绪
await settle(); pumpRaf(4); await settle(); pumpRaf(4)
check('素材就绪后 viewReady 置位（该让 React 挂容器了）', player.debug.isViewReady() === true, 'viewReady=' + player.debug.isViewReady())

// ── 关键回归：模拟 React 挂载 → 销毁 → 重建（= 切会话） ──
// 播放器的 ref 回调是通过 React 渲染 DeepySprite 时注册的；
// 这里从桩里取出「最近的 ref 回调」，用它模拟 React 的挂载/卸载语义。
function mountSprite() {
  const node = makeNode('span')
  node.className = 'dsh-theme-deepy-sprite'
  T.doc.body.appendChild(node)
  return node
}
function latestRef() {
  const last = T.refCallbacks[T.refCallbacks.length - 1]
  return last ? last.ref : null
}

// viewReady 置位时播放器调用 bumpView()；真实 React 会重渲染 DeepyView，
// 从而执行到 DeepySprite 并注册 ref。我们的桩通过 subscribeView 的回调模拟这一步。
// 断言：桩里确实记录到了 sprite 的 ref 回调（证明「节点交给播放器」这条路径存在）。
// viewReady 置位后，真实 React 会因 bumpView 重渲染 DeepyView 并执行到 DeepySprite。
// 我们的桩在 setState 里重渲染；这里再显式渲染一次，确保 ref 已注册。
if (typeof registeredComponent === 'function') T.react.createElement(registeredComponent, {})
const ref1 = latestRef()
check('React 桩已记录 sprite 的 ref 回调', typeof ref1 === 'function', 'refs=' + T.refCallbacks.length + ' components=' + T.functionComponents.map(f => f.name).join(','))

if (typeof ref1 === 'function') {
  const node1 = mountSprite()
  ref1(node1)                                  // React 挂载：把节点交给播放器
  eq('挂载后播放器持有该节点', player.debug.getSprite(), node1)

  pumpRaf(2)
  const painted1 = node1.style.backgroundImage
  check('已把帧画到节点上（backgroundImage 有值）', typeof painted1 === 'string' && painted1.indexOf('deepy/') !== -1, 'bg=' + painted1)
  eq('元素宽度 = displayPx', node1.style.width, MANIFEST.displayPx + 'px')

  // ── 直接验证 isConnected 守卫 ──
  // 真实风险：React 协调过程中节点可能已从 DOM 摘掉、但 ref 清理尚未跑到，
  // 此时若仍往旧节点写 style，就是「写成功但看不见」——正是 M5 的「计算绿 ≠ 可见」。
  const posBefore = node1.style.backgroundPosition
  node1.remove()                               // 从 DOM 摘掉，但**不**调 ref(null)
  eq('节点已被摘掉（isConnected=false）', node1.isConnected, false)
  pumpRaf(6)
  eq('守卫生效：不再往已摘掉的节点写帧', node1.style.backgroundPosition, posBefore)
  check('已摘掉节点上没有任何新写入（宽度仍是首次值）', node1.style.width === MANIFEST.displayPx + 'px')

  // ── 模拟切会话：React 销毁旧节点 ──
  ref1(null)                                   // React 的 ref 清理语义
  eq('节点销毁后播放器不再持有它', player.debug.getSprite(), null)

  // ── React 重建新节点 ──
  const node2 = mountSprite()
  ref1(node2)                                  // React 重新挂载
  eq('重建后播放器持有**新**节点', player.debug.getSprite(), node2)

  pumpRaf(2)
  const painted2 = node2.style.backgroundImage
  check('重建后仍能把帧画到新节点上（自愈）', typeof painted2 === 'string' && painted2.indexOf('deepy/') !== -1, 'bg=' + painted2)
  eq('新节点宽度仍 = displayPx', node2.style.width, MANIFEST.displayPx + 'px')
  check('新节点确实被画过（不是空白）', painted2 !== '' && painted2 !== 'none', 'bg=' + painted2)
}

// ── 测试 3：卸载可逆 ──────────────────────────────────────────────────
player.dispose()
eq('dispose 后 spriteEl 清空', player.debug.getSprite(), null)
eq('dispose 后 viewReady 复位', player.debug.isViewReady(), false)
check('dispose 后内联 style 已移除', T.doc.getElementById('dsh-theme-deepy-style') === null)
const player2 = D.install(ctx)
check('可重新 install（可逆）', typeof player2.dispose === 'function')
player2.dispose()

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
