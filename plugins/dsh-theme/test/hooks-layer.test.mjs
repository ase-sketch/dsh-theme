/**
 * dsh-theme · M8 深空编辑室钩子层测试。
 *
 * 覆盖四块，全部驱动**真实实现**（不是复制品）：
 *   A. 流态投影 / 裁决（纯函数：事件 → streaming on/off）
 *   B. 熄灯仪式（wipePlan 纯函数：该不该放 + 防叠层）
 *   C. 月台光晕档位（glowTier 纯函数）
 *   D. DOM 级：用最小 DOM 桩真实跑 installHooks（流态属性、overlay 生命周期、
 *      滚动浮现 class、dispose 全撤）
 *
 * 运行：node plugins/dsh-theme/test/hooks-layer.test.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = path.resolve(HERE, '..', 'lib', 'client.js')

let passed = 0
let failed = 0
const failures = []
function check(name, condition, detail) {
  if (condition) passed += 1
  else { failed += 1; failures.push(name + (detail ? ' :: ' + detail : '')) }
}
// DOM 桩节点带循环引用（parentNode ↔ children），不能直接 JSON.stringify
function describe(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v !== 'object') return JSON.stringify(v)
  if (v.tagName) return '<' + String(v.tagName).toLowerCase() + (v._id ? '#' + v._id : '') + '>'
  try { return JSON.stringify(v) } catch (e) { return '[object]' }
}
function eq(name, actual, expected) {
  check(name, actual === expected, 'expected ' + describe(expected) + ', got ' + describe(actual))
}
function ne(name, a, b) { check(name, a !== b, '两者都是 ' + describe(a)) }
function deepEq(name, actual, expected) {
  eq(name, JSON.stringify(actual), JSON.stringify(expected))
}

// ── 最小 DOM 桩（够跑 installHooks：属性 / classList / query / getElementById） ──
function makeClassList(node) {
  const set = new Set()
  return {
    add(c) { set.add(c); node._classes = [...set] },
    remove(c) { set.delete(c); node._classes = [...set] },
    contains(c) { return set.has(c) },
    _set: set,
  }
}
function makeNode(tag) {
  const node = {
    nodeType: 1,
    tagName: String(tag).toUpperCase(),
    parentNode: null,
    isConnected: false,
    children: [],
    _attrs: {},
    _classes: [],
    _id: '',
    style: {},
    setAttribute(k, v) { this._attrs[k] = String(v); if (k === 'id') { this._id = String(v); doc._byId.set(String(v), this) } },
    getAttribute(k) { return this._attrs[k] === undefined ? null : this._attrs[k] },
    removeAttribute(k) { delete this._attrs[k] },
    hasAttribute(k) { return this._attrs[k] !== undefined },
    appendChild(c) { c.parentNode = this; this.children.push(c); markConnected(c, this.isConnected); return c },
    removeChild(c) { const i = this.children.indexOf(c); if (i !== -1) this.children.splice(i, 1); c.parentNode = null; markConnected(c, false); unregisterIds(c); return c },
    remove() { if (this.parentNode) this.parentNode.removeChild(this) },
    querySelector() { return null },
    querySelectorAll() { return [] },
    _listeners: {},
    addEventListener(type, fn) { (this._listeners[type] = this._listeners[type] || []).push(fn) },
    removeEventListener(type, fn) {
      const list = this._listeners[type]
      if (!list) return
      const i = list.indexOf(fn)
      if (i !== -1) list.splice(i, 1)
    },
    dispatch(type) { for (const fn of (this._listeners[type] || []).slice()) fn({ type }) },
    _query: {},
    _queryAll: {},
  }
  Object.defineProperty(node, 'id', {
    get() { return node._id },
    set(v) { node._id = String(v); doc._byId.set(String(v), node) },
  })
  node.classList = makeClassList(node)
  Object.defineProperty(node, 'className', { get() { return node._classes.join(' ') }, set(v) { node._classes = String(v).split(/\s+/).filter(Boolean) } })
  node.querySelector = (sel) => (node._query[sel] === undefined ? null : node._query[sel])
  node.querySelectorAll = (sel) => (node._queryAll[sel] || [])
  return node
}
function markConnected(node, value) {
  node.isConnected = value
  for (const c of node.children) markConnected(c, value)
}

/** 脱离文档的节点 getElementById 不该再查到——真实 DOM 的语义，桩必须照做。 */
function unregisterIds(node) {
  if (node._id && doc._byId.get(node._id) === node) doc._byId.delete(node._id)
  for (const c of node.children) unregisterIds(c)
}

let doc = null
function makeDocument() {
  const d = {
    _byId: new Map(),
    head: makeNode('head'),
    body: makeNode('body'),
    _docQuery: {},
    _docQueryAll: {},
    createElement: (tag) => makeNode(tag),
    getElementById(id) { return d._byId.get(id) || null },
    querySelector(sel) { return d._docQuery[sel] === undefined ? null : d._docQuery[sel] },
    querySelectorAll(sel) { return d._docQueryAll[sel] || [] },
    addEventListener() {}, removeEventListener() {},
  }
  d.body.isConnected = true
  d.head.isConnected = true
  return d
}

// ── 观察器 / rAF / matchMedia 桩 ──────────────────────────────────────
const ioInstances = []
class IOStub {
  constructor(cb, options) { this.cb = cb; this.options = options; this.targets = new Set(); ioInstances.push(this) }
  observe(n) { this.targets.add(n) }
  unobserve(n) { this.targets.delete(n) }
  disconnect() { this.targets.clear() }
  fire(entries) { this.cb(entries, this) }
}
const moInstances = []
class MOStub {
  constructor(cb) { this.cb = cb; this.targets = []; moInstances.push(this) }
  observe(t, o) { this.targets.push({ t, o }) }
  disconnect() { this.targets.length = 0; this.disconnected = true }
  fire(records) { this.cb(records, this) }
}
let rafQueue = []
let rafClock = 0
let reduceMotionFlag = false

function installGlobals() {
  const win = {
    document: doc,
    matchMedia: () => ({ matches: reduceMotionFlag, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    requestAnimationFrame(fn) { rafQueue.push(fn); return rafQueue.length },
    cancelAnimationFrame(id) { rafQueue = rafQueue.filter((_, i) => i !== id) },
  }
  globalThis.window = win
  globalThis.document = doc
  globalThis.IntersectionObserver = IOStub
  globalThis.MutationObserver = MOStub
  globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}), text: () => Promise.resolve('') })
  globalThis.Image = function () { this.onload = null; this.onerror = null; this.src = '' }
}
function pumpRaf(times) {
  for (let i = 0; i < (times || 1); i += 1) {
    rafClock += 16
    const fns = rafQueue.splice(0, rafQueue.length)
    for (const fn of fns) fn(rafClock)
  }
}

// ── 加载真实 client.js ────────────────────────────────────────────────
doc = makeDocument()
installGlobals()
let loaded = null
window.__ModuleLoader__ = { load(spec) { loaded = spec.factory(() => ({})) } }
;(0, eval)(fs.readFileSync(CLIENT_PATH, 'utf8'))
const H = loaded.__hooks
const D = loaded.__deepy

// ── 假 ctx：真实形状的事件源 ──────────────────────────────────────────
let eventListeners = []
let eventSnapshot = { change: { kind: 'append', entries: [] } }
let statusListeners = []
let statusMap = new Map()
let listSnapshot = { byId: {}, ids: [], phase: 'ready' }
const ctx = {
  sessions: {
    binding() {
      return {
        eventSource: {
          subscribe(cb) { eventListeners.push(cb); return () => { eventListeners = eventListeners.filter((x) => x !== cb) } },
          getSnapshot() { return eventSnapshot },
        },
        session: {}, sessionId: 's1', ctx: {},
      }
    },
    list: {
      subscribe(cb) { statusListeners.push(cb); return () => { statusListeners = statusListeners.filter((x) => x !== cb) } },
      getSnapshot() { return listSnapshot },
    },
  },
  uiSession: {
    sessionStatus: {
      subscribe(cb) { statusListeners.push(cb); return () => { statusListeners = statusListeners.filter((x) => x !== cb) } },
      getSnapshot() { return statusMap },
    },
  },
}
function emit(entries) {
  eventSnapshot = { change: { kind: 'append', entries } }
  for (const cb of eventListeners.slice()) cb()
}
function setStatus(map) {
  statusMap = map
  for (const cb of statusListeners.slice()) cb()
}

// ══ A. 流态投影 / 裁决（纯函数） ═══════════════════════════════════════
{
  const s0 = H.streamInitial()
  deepEq('A1 初始态：未在生成', s0, { active: false, sawTurn: false, sessionId: null })

  const s1 = H.streamProject(s0, { type: 'event', event: { type: 'turn/start' } })
  eq('A2 turn/start → 流态开', s1.active, true)
  eq('A2b turn/start 记下「本轮见过事件」', s1.sawTurn, true)

  const s2 = H.streamProject(s1, { type: 'event', event: { type: 'assistant/live-chunk', data: { chunk: { type: 'text-delta' } } } })
  eq('A3 live-chunk 不改变流态（不是回合边界）', s2, s1)
  const s3 = H.streamProject(s1, { type: 'event', event: { type: 'step/start' } })
  eq('A4 step/start 不改变流态（同一轮内会有多次）', s3, s1)
  const s4 = H.streamProject(s1, { type: 'event', event: { type: 'tool/call', data: {} } })
  eq('A5 tool/call 不改变流态', s4, s1)

  const s5 = H.streamProject(s1, { type: 'event', event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } })
  eq('A6 turn/end → 流态关', s5.active, false)
  eq('A6b turn/end 清掉「本轮见过事件」', s5.sawTurn, false)

  eq('A7 空 entry 原样返回（不炸）', H.streamProject(s1, null), s1)
  eq('A8 无 event 字段原样返回', H.streamProject(s1, { type: 'transient' }), s1)

  // 状态快照推导
  eq('A9 空 Map → 没有会话在跑', H.streamFromStatus(new Map(), null), false)
  eq('A10 非 Map → false', H.streamFromStatus(null, null), false)
  const m1 = new Map([['a', { running: true }]])
  eq('A11 有会话 running → true', H.streamFromStatus(m1, { byId: {} }), true)
  const m2 = new Map([['a', { running: true }]])
  eq('A12 只有 subagent 在跑 → false', H.streamFromStatus(m2, { byId: { a: { origin: 'subagent' } } }), false)
  const m3 = new Map([['a', { running: false }], ['b', { running: true }]])
  eq('A13 混合时看真会话', H.streamFromStatus(m3, { byId: { b: { origin: 'session' } } }), true)
  eq('A14 running 缺失（pendingInteraction 之类）不算在跑', H.streamFromStatus(new Map([['a', { pendingInteraction: true }]]), null), false)

  // 裁决：冷启动播种 + 权威关闸
  const cold = H.streamResolve(H.streamInitial(), true)
  eq('A15 冷启动播种：有会话在跑但没见过本轮事件 → 判为流态', cold.active, true)
  const keep = H.streamResolve({ active: true, sawTurn: true, sessionId: null }, true)
  eq('A16 事件已表态为开 → 保持', keep.active, true)
  const gate = H.streamResolve({ active: true, sawTurn: true, sessionId: null }, false)
  eq('A17 权威关闸：没有任何会话在跑 → 强制关（兜住 turn/end 未达）', gate.active, false)
  eq('A17b 关闸同时清 sawTurn', gate.sawTurn, false)
  const idle = H.streamResolve(H.streamInitial(), false)
  eq('A18 本来就没跑 → 原样返回（不制造新对象）', idle.active, false)
}

// ══ B. 熄灯仪式决策（纯函数） ═════════════════════════════════════════
{
  const plan = (o) => H.wipePlan(Object.assign({ dark: false, prevDark: false, reduceMotion: false, hasOverlay: false }, o))
  eq('B1 变暗 + 无旧层 → 放', plan({ dark: true }).play, true)
  eq('B1b 理由 = lights-out', plan({ dark: true }).reason, 'lights-out')
  eq('B1c 无旧层则不需要先撤', plan({ dark: true }).removeExisting, false)

  eq('B2 没有翻转 → 不放', plan({ dark: true, prevDark: true }).play, false)
  eq('B2b 理由 = no-flip', plan({ dark: true, prevDark: true }).reason, 'no-flip')
  eq('B3 从暗变亮 → 也放（开灯，双向对称）', plan({ dark: false, prevDark: true }).play, true)
  eq('B3b 方向 = lights-on', plan({ dark: false, prevDark: true }).reason, 'lights-on')
  eq('B3c 双向都带方向标记', [plan({ dark: true }).reason, plan({ dark: false, prevDark: true }).reason].join(','), 'lights-out,lights-on')
  eq('B4 减速偏好 → 不放', plan({ dark: true, reduceMotion: true }).play, false)
  eq('B4b 理由 = reduced-motion', plan({ dark: true, reduceMotion: true }).reason, 'reduced-motion')

  // 防叠层：连翻时第二次判定拿到 hasOverlay=true，结论是「先撤旧层再放」
  const second = plan({ dark: true, hasOverlay: true })
  eq('B5 已有旧层时仍要放（新一次翻转是新的仪式）', second.play, true)
  eq('B5b 但必须先撤旧层 → 不叠层', second.removeExisting, true)
  const skipped = plan({ dark: true, prevDark: true, hasOverlay: true })
  eq('B6 不翻转时不放', skipped.play, false)
  eq('B6b 也不碰正在播的那一层（免得把正常动画掐断）', skipped.removeExisting, false)
  eq('B6c 减速偏好下若已有层则撤掉（偏好刚打开的情形）', plan({ dark: true, reduceMotion: true, hasOverlay: true }).removeExisting, true)
}

// ══ C. 月台光晕档位（纯函数） ═════════════════════════════════════════
{
  eq('C1 idle → idle 档', H.glowTier('idle'), 'idle')
  eq('C2 error → error 档', H.glowTier('error'), 'error')
  eq('C3 happy → happy 档', H.glowTier('happy'), 'happy')
  for (const s of ['thinking', 'typing', 'building', 'music', 'notification']) {
    eq('C4 ' + s + ' → active 档', H.glowTier(s), 'active')
  }
  eq('C5 未知态兜底到 active 档（不会退化成无光）', H.glowTier('nonsense'), 'active')
  eq('C6 档位只有 4 种取值', new Set(['idle', 'error', 'happy', 'thinking', 'typing', 'building', 'music', 'notification', 'x'].map(H.glowTier)).size, 4)
  eq('C7 单鲸规则纯函数仍在（不回归）', D.mainVisible(true, true), false)
  eq('C7b 单鲸规则：无 hero 时主位可见', D.mainVisible(true, false), true)
}

// ══ F. 编辑台空判据（纯函数，M8.5） ═══════════════════════════════════
{
  eq('F1 空串 → empty', H.editorStateOf(''), 'empty')
  eq('F2 纯空白 → empty', H.editorStateOf('   \n\t  '), 'empty')
  eq('F3 <br> 占位的 textContent 就是空串 → empty', H.editorStateOf(''), 'empty')
  eq('F4 零宽字符（编辑器常见残留）→ empty', H.editorStateOf('\u200b\ufeff'), 'empty')
  eq('F5 软连字符 → empty', H.editorStateOf('\u00ad'), 'empty')
  eq('F6 &nbsp; → empty', H.editorStateOf('\u00a0 \u00a0'), 'empty')
  eq('F7 有正文 → filled', H.editorStateOf('写点什么'), 'filled')
  eq('F8 只有标点也算有内容 → filled', H.editorStateOf('.'), 'filled')
  eq('F9 首尾空白不改变判定', H.editorStateOf('  x  '), 'filled')
  eq('F10 空白 + 正文 + 零宽 → filled', H.editorStateOf('\u200b 正文 \u200b'), 'filled')
  eq('F11 null/undefined 兜底为 empty', [H.editorStateOf(null), H.editorStateOf(undefined)].join(','), 'empty,empty')
  eq('F12 editorTextOf 归一后是正文本身', H.editorTextOf('\u200b 正文 \u200b'), '正文')
}

// ══ D. DOM 级：真实跑 installHooks ════════════════════════════════════
{
  // 造会话体 / 滚动口 / 消息项
  const container = makeNode('div')
  container.setAttribute('data-conversation-content', '')
  const scroll = makeNode('div')
  scroll.setAttribute('data-conversation-scroll', '')
  container.appendChild(scroll)
  container._query['[data-conversation-scroll]'] = scroll
  doc.body.appendChild(container)
  doc._docQuery['[data-conversation-content]'] = container

  const flowA = makeNode('div'); flowA.setAttribute('data-chat-flow-key', 'a')
  const flowB = makeNode('div'); flowB.setAttribute('data-chat-flow-key', 'b')
  scroll.appendChild(flowA); scroll.appendChild(flowB)
  scroll._queryAll['[data-chat-flow-key]'] = [flowA, flowB]
  doc._docQueryAll['.dsh-flow-in'] = []

  const hooks = H.install(ctx)
  check('D1 installHooks 返回 dispose', typeof hooks.dispose === 'function')
  check('D1b 注入了钩子样式表', doc.getElementById('dsh-theme-hooks-style') !== null)
  eq('D1c 首轮没有流态（statusMap 为空）', hooks.debug.isStreaming(), false)

  // —— 流态开（真实顺序：发消息 → status 变 running → 订阅建立 → turn/start） ——
  setStatus(new Map([['s1', { running: true }]]))
  eq('D2 会话进入 running → 冷启动播种为流态', hooks.debug.isStreaming(), true)
  eq('D2b 属性值（存在即可，CSS 只认存在）', container.getAttribute(H.STREAM_ATTR), '')
  eq('D2c 状态翻转时建立了事件订阅', eventListeners.length > 0, true)

  // —— 流态关 ——
  emit([{ type: 'event', event: { type: 'turn/end', data: { reason: { kind: 'completed' } } } }])
  eq('D3 turn/end → 属性摘除', hooks.debug.isStreaming(), false)
  eq('D3b 属性真的没了（不是空串）', container.getAttribute(H.STREAM_ATTR), null)

  // —— 事件驱动的再次开 ——
  emit([{ type: 'event', event: { type: 'turn/start' } }])
  eq('D4 turn/start → 再次开', hooks.debug.isStreaming(), true)

  // —— 权威关闸 ——
  setStatus(new Map())            // 没有任何会话在跑
  eq('D5 状态快照说没人在跑 → 强制关（兜住 turn/end 未达）', hooks.debug.isStreaming(), false)

  // —— 冷启动播种（独立再验一次） ——
  setStatus(new Map([['s1', { running: true }]]))
  eq('D6 有会话在跑且没见过本轮事件 → 播种为流态', hooks.debug.isStreaming(), true)
  setStatus(new Map())

  // —— 熄灯 / 开灯仪式（双向） ——
  eq('D7 一开始没有 overlay', hooks.debug.getWipe(), null)
  doc.body.setAttribute('data-ds-dark-theme', '')
  // 属性观察器是桩，手动触发（真实实现走 MutationObserver）
  const darkObserver = moInstances.find((m) => m.targets.some((t) => t.o && t.o.attributeFilter && t.o.attributeFilter.indexOf('data-ds-dark-theme') !== -1))
  check('D8 装了 body 属性观察器（attributeFilter 含 data-ds-dark-theme）', Boolean(darkObserver))
  darkObserver.fire([{ type: 'attributes' }])
  const overlay = hooks.debug.getWipe()
  check('D9 变暗 → 注入全屏 overlay', overlay !== null)
  eq('D9b overlay id 正确', overlay && overlay.id, H.WIPE_ID)
  eq('D9c overlay 挂在 body 上', overlay && overlay.parentNode === doc.body, true)
  eq('D9d overlay 对辅助技术隐藏', overlay && overlay.getAttribute('aria-hidden'), 'true')
  eq('D9e 方向标记 = lights-out', overlay && overlay.getAttribute('data-dsh-wipe'), 'lights-out')

  // 变亮：同样放（开灯），且旧层先撤 → 任何时刻 body 下最多一层
  doc.body.removeAttribute('data-ds-dark-theme')
  darkObserver.fire([{ type: 'attributes' }])
  const overlayB = hooks.debug.getWipe()
  check('D10 变亮 → 也放一次（开灯，双向对称）', overlayB !== null)
  ne('D10b 是新的一层（旧层已被撤掉，不是叠加）', overlayB, overlay)
  eq('D10c 方向标记 = lights-on', overlayB && overlayB.getAttribute('data-dsh-wipe'), 'lights-on')
  eq('D10d 不叠层：body 下只有 1 个 overlay', doc.body.children.filter((c) => c.id === H.WIPE_ID).length, 1)
  // 兜底定时器保证 overlay 绝不留在屏幕上
  await new Promise((resolve) => setTimeout(resolve, 700))
  eq('D10e 动画时长后 overlay 自动移除（兜底定时器）', hooks.debug.getWipe(), null)

  // 连翻防叠：暗→亮→暗
  doc.body.setAttribute('data-ds-dark-theme', '')
  darkObserver.fire([{ type: 'attributes' }])
  check('D11 再次变暗又放一次', hooks.debug.getWipe() !== null)
  // 快速连翻：不翻转的重复通知不应该叠层
  darkObserver.fire([{ type: 'attributes' }])
  eq('D12 同一次翻转重复通知 → 不叠层（body 下只有 1 个 overlay）', doc.body.children.filter((c) => c.id === H.WIPE_ID).length, 1)

  // —— 滚动浮现 ——
  const io = ioInstances[ioInstances.length - 1]
  check('D13 装了 IntersectionObserver', Boolean(io))
  eq('D13b 两条消息项都被 observe 了', io.targets.size, 2)
  eq('D13c IO root 是滚动口', io.options && io.options.root, scroll)
  io.fire([{ target: flowA, isIntersecting: true }, { target: flowB, isIntersecting: false }])
  eq('D14 rAF 之前不写 class（回调保持轻量）', flowA.classList.contains(H.FLOW_IN_CLASS), false)
  pumpRaf(1)
  eq('D15 rAF 后：进入视口的那条加上浮现 class', flowA.classList.contains(H.FLOW_IN_CLASS), true)
  eq('D15b 没进入视口的不加', flowB.classList.contains(H.FLOW_IN_CLASS), false)
  eq('D15c 已处理的被 unobserve（不重复观察）', io.targets.has(flowA), false)
  doc._docQueryAll['.dsh-flow-in'] = [flowA]

  // —— 编辑台状态钩子（M8.5）——
  const deepyHost = makeNode('span')
  deepyHost.id = 'dsh-theme-deepy'
  doc.body.appendChild(deepyHost)

  const inputEl = makeNode('div')
  inputEl.setAttribute('data-composer-input', '')
  inputEl.textContent = ''
  const card = makeNode('div')
  card.setAttribute('data-composer-card', '')
  card._query['[data-composer-input]'] = inputEl
  card.appendChild(inputEl)
  doc.body.appendChild(card)
  doc._docQueryAll['[data-composer-card]'] = [card]

  // 走真实路径：DOM 观察器发现新卡 → rAF 后 scanEditors
  const domObserverStub = moInstances.find((m) => m.targets.some((x) => x.o && x.o.childList && x.o.subtree))
  check('G0 装了 body 子树观察器', Boolean(domObserverStub))
  domObserverStub.fire([{ addedNodes: [card], removedNodes: [] }])
  pumpRaf(1)
  eq('G1 空输入框 → data-dsh-editor="empty"', card.getAttribute(H.EDITOR_ATTR), 'empty')
  eq('G1b 空态月台无联动标记', hooks.debug.isEditing(), false)

  inputEl.textContent = '写点什么'
  inputEl.dispatch('input')
  eq('G2 input 事件路径 → filled', card.getAttribute(H.EDITOR_ATTR), 'filled')
  eq('G2b filled → 月台打上 data-dsh-editing', hooks.debug.isEditing(), true)
  eq('G2c 属性就写在月台容器上', deepyHost.getAttribute(H.EDITING_ATTR), '')

  inputEl.textContent = ''
  inputEl.dispatch('input')
  eq('G3 清空 → 回落 empty', card.getAttribute(H.EDITOR_ATTR), 'empty')
  eq('G3b 月台联动标记摘除', hooks.debug.isEditing(), false)

  // MutationObserver 兜底路径：发送后 shell 直接清空输入框，不一定派发 input
  inputEl.textContent = 'abc'
  inputEl.dispatch('input')
  eq('G4 先置为 filled', card.getAttribute(H.EDITOR_ATTR), 'filled')
  const editorObserver = moInstances.find((m) => m.targets.some((x) => x.t === inputEl))
  check('G5 给可编辑根装了 MutationObserver 兜底', Boolean(editorObserver))
  // 观察器缺失时不要直接崩（否则「去掉兜底」这类回归会变成崩溃而不是一条红断言）
  const fireEditor = (type) => { if (editorObserver) editorObserver.fire([{ type }]) }
  inputEl.textContent = ''                       // 直接改 DOM，**不**派发 input
  fireEditor('childList')
  eq('G6 发送后清空（无 input 事件）→ 兜底把状态回落', card.getAttribute(H.EDITOR_ATTR), 'empty')
  eq('G6b 月台联动同步回落', hooks.debug.isEditing(), false)

  inputEl.textContent = '   \u200b \n '
  fireEditor('characterData')
  eq('G7 纯空白 + 零宽 → 仍判 empty', card.getAttribute(H.EDITOR_ATTR), 'empty')
  inputEl.textContent = 'x'
  fireEditor('characterData')
  eq('G8 一个字符 → filled', card.getAttribute(H.EDITOR_ATTR), 'filled')

  // 双档：hero 态的输入卡用同一套选择器接上
  const heroInput = makeNode('div')
  heroInput.setAttribute('data-composer-input', '')
  heroInput.textContent = ''
  const heroCard = makeNode('div')
  heroCard.setAttribute('data-composer-card', '')
  heroCard._query['[data-composer-input]'] = heroInput
  heroCard.appendChild(heroInput)
  doc.body.appendChild(heroCard)
  doc._docQueryAll['[data-composer-card]'] = [card, heroCard]
  inputEl.textContent = ''
  if (editorObserver) editorObserver.fire([{ type: 'characterData' }])
  domObserverStub.fire([{ addedNodes: [heroCard], removedNodes: [] }])
  pumpRaf(1)
  eq('G9 hero 态输入卡也接上（初始 empty）', heroCard.getAttribute(H.EDITOR_ATTR), 'empty')
  heroInput.textContent = 'hero 里也在写'
  heroInput.dispatch('input')
  eq('G10 hero 卡 filled → 月台同样联动', heroCard.getAttribute(H.EDITOR_ATTR), 'filled')
  eq('G10b 月台联动为真', hooks.debug.isEditing(), true)

  // —— dispose 全撤 ——
  hooks.dispose()
  eq('D16 dispose 后流态属性摘除', container.getAttribute(H.STREAM_ATTR), null)
  eq('D17 dispose 后 overlay 移除', doc.getElementById(H.WIPE_ID), null)
  eq('D18 dispose 后钩子样式表移除', doc.getElementById('dsh-theme-hooks-style'), null)
  eq('D19 dispose 后浮现 class 清掉', flowA.classList.contains(H.FLOW_IN_CLASS), false)
  eq('D20 dispose 后 IO 断开', io.targets.size, 0)
  eq('D21 dispose 后 body 属性观察器断开', darkObserver.disconnected === true, true)

  // —— 可重复安装 ——
  const hooks2 = H.install(ctx)
  check('D22 可重新 install（可逆）', typeof hooks2.dispose === 'function')
  hooks2.dispose()
  eq('D23 二次卸载后依然干净', doc.getElementById('dsh-theme-hooks-style'), null)
  eq('G11 dispose 后主输入卡属性摘净', card.getAttribute(H.EDITOR_ATTR), null)
  eq('G11b dispose 后 hero 卡属性也摘净', heroCard.getAttribute(H.EDITOR_ATTR), null)
  eq('G12 dispose 后月台联动标记摘除', deepyHost.getAttribute(H.EDITING_ATTR), null)
  eq('G13 dispose 后 input 监听断开', (inputEl._listeners.input || []).length, 0)
  eq('G13b dispose 后 hero input 监听也断开', (heroInput._listeners.input || []).length, 0)
  check('G14 dispose 后编辑器观察器断开（若装了）', !editorObserver || editorObserver.disconnected === true)

  // —— 减速偏好：熄灯仪式整个不放（走真实安装路径，不只测纯函数） ——
  const findDarkObserver = () => moInstances.find((m) => m.targets.some((x) => x.o && x.o.attributeFilter && x.o.attributeFilter.indexOf('data-ds-dark-theme') !== -1))
  doc.body.removeAttribute('data-ds-dark-theme')
  reduceMotionFlag = true
  const hooks3 = H.install(ctx)
  eq('D24 减速偏好下 isReducedMotion 为真', hooks3.debug.isReducedMotion(), true)
  doc.body.setAttribute('data-ds-dark-theme', '')
  findDarkObserver().fire([{ type: 'attributes' }])
  eq('D25 减速偏好 → 熄灯仪式整个不放', hooks3.debug.getWipe(), null)
  hooks3.dispose()
  reduceMotionFlag = false
  doc.body.removeAttribute('data-ds-dark-theme')
}

// ══ E. 注入 CSS 的静态守卫 ═══════════════════════════════════════════
// 「新 CSS 数值一律 var(--dsh-*)」这条纪律做成机械检查：client.js 里出现的每个
// --dsh-* 引用都必须真的由 theme.css 发射，拼错一个名字就是一条静默失效的规则。
{
  const THEME_CSS = path.resolve(HERE, '..', 'assets', 'theme.css')
  const clientSrc = fs.readFileSync(CLIENT_PATH, 'utf8')
  const themeSrc = fs.readFileSync(THEME_CSS, 'utf8')
  const defined = new Set((themeSrc.match(/--dsh-[a-z0-9-]+(?=\s*:)/g) || []))
  const referenced = [...new Set((clientSrc.match(/var\(\s*(--dsh-[a-z0-9-]+)/g) || []).map((x) => x.replace(/var\(\s*/, '')))]
  check('E1 theme.css 里能读到 --dsh-* 定义', defined.size > 50, 'defined=' + defined.size)
  check('E2 client.js 里引用了 --dsh-*', referenced.length > 5, 'referenced=' + referenced.length)
  const unknown = referenced.filter((n) => !defined.has(n))
  eq('E3 client.js 引用的每个 --dsh-* 都由 theme.css 发射（无拼写漂移）', unknown.length, 0, unknown.join(', '))

  // 注入 CSS 的结构自检：花括号配平、没有空规则体。
  // D 段末尾 dispose 已经把样式表撤了，这里重新装一次取文本（顺带再验一次可重复安装）。
  const hooksCss = H.install(ctx)
  const styleEl = doc.getElementById('dsh-theme-hooks-style')
  const cssText = styleEl ? styleEl.textContent : ''
  hooksCss.dispose()
  check('E4 拿到了钩子样式表文本', cssText.length > 200, 'len=' + cssText.length)
  const open = (cssText.match(/{/g) || []).length
  const close = (cssText.match(/}/g) || []).length
  eq('E5 注入 CSS 花括号配平', open, close)
  eq('E6 注入 CSS 没有空规则体', (cssText.match(/{\s*}/g) || []).length, 0)
  const varsInCss = [...new Set((cssText.match(/var\(\s*(--dsh-[a-z0-9-]+)/g) || []).map((x) => x.replace(/var\(\s*/, '')))]
  eq('E7 注入 CSS 里的 --dsh-* 全部有定义', varsInCss.filter((n) => !defined.has(n)).length, 0, varsInCss.filter((n) => !defined.has(n)).join(', '))
  check('E8 注入 CSS 覆盖了三个交付点（hero 封面的结构规则在 Deepy 样式表里，见 render-layer M8-14~21）', ['data-dsh-streaming', 'dsh-flow-in', H.WIPE_ID].every((k) => cssText.indexOf(k) !== -1))
  check('E8b 朱砂光标 keyframes 在', cssText.indexOf('dsh-theme-caret') !== -1)
  eq('E8c 钩子样式里不再残留 hero 浮层规则（已改纵向块级，规则挪去 Deepy 样式表）', cssText.indexOf('dsh-hero-') === -1, true)
}

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
