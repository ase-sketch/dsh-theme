/**
 * dsh-theme · M10 输入卡主位 Deepy 契约测试（几何 / 裸鲸 / 清理）。
 *
 * 这一层守的是**渲染输出与几何后果**，不是源码写法：
 *   1) 主位显示尺寸 = 素材帧 64px × 1.5 = 96px，宿主 / sheet / 帧偏移**同一个来源**；
 *   2) 逐帧背景偏移正确且不越出格子——「元素宽度 ≠ 帧距」时相邻帧必然泄入；
 *   3) hero 迎宾位走**自己**的倍率（64 × 1.6 = 102px），不被主位 1.5× 连带放大；
 *   4) 主位是裸鲸：没有底座 / rim / 辉光 / 涟漪（连创建都不做），hero 仍保留月台；
 *   5) 填写态抬头（idle-look）照常工作，忙碌 / 终态不被填写态覆盖；
 *   6) 卸载不留残留：内联样式表、rAF、订阅全部撤净，之后不再有任何写入。
 *
 * 驱动的是**真实的 installDeepy**（不是复制品），用最小 DOM/React 桩模拟
 * slot 渲染 + ref 交接 + 会话事件投递。
 *
 * 运行：node plugins/dsh-theme/test/composer-deepy.test.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CLIENT_PATH = path.resolve(HERE, '..', 'lib', 'client.js')
const MANIFEST_PATH = path.resolve(HERE, '..', 'assets', 'deepy', 'deepy.json')
const MANIFEST = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))

let passed = 0
let failed = 0
const failures = []
function check(name, condition, detail) {
  if (condition) passed += 1
  else { failed += 1; failures.push(name + (detail ? ' :: ' + detail : '')) }
}
function describe(v) {
  if (v === null) return 'null'
  if (v === undefined) return 'undefined'
  if (typeof v !== 'object') return JSON.stringify(v)
  if (v.tagName) return '<' + String(v.tagName).toLowerCase() + (v.className ? '.' + v.className : '') + '>'
  try { return JSON.stringify(v) } catch (e) { return '[object]' }
}
function eq(name, actual, expected) {
  check(name, actual === expected, 'expected ' + describe(expected) + ', got ' + describe(actual))
}
function ne(name, a, b) { check(name, a !== b, '两者都是 ' + describe(a)) }

// ── 最小 DOM 桩 ────────────────────────────────────────────────────────
function markConnected(node, value) {
  node.isConnected = value
  for (const c of node.children) markConnected(c, value)
}
/**
 * 内联样式桩：**可枚举的**属性照旧直接挂在对象上（宽度/偏移等断言读它们）；
 * `setProperty` / `getPropertyValue` 挂成**不可枚举**方法，值存进隐藏的 _props ——
 * 自定义属性（--deepy-perch-lift）走的就是这条通道，不能污染现有快照断言。
 */
function makeStyle() {
  const bag = {}
  const props = {}
  Object.defineProperty(bag, 'setProperty', { value: (k, v) => { props[k] = String(v) }, enumerable: false })
  Object.defineProperty(bag, 'getPropertyValue', { value: (k) => (props[k] === undefined ? '' : props[k]), enumerable: false })
  Object.defineProperty(bag, '_props', { value: props, enumerable: false })
  return bag
}
function makeNode(tag) {
  return {
    tagName: String(tag).toUpperCase(),
    className: '', id: '', style: makeStyle(), attributes: {}, children: [], parentNode: null, isConnected: false,
    setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') this.id = v },
    getAttribute(k) { return this.attributes[k] === undefined ? null : this.attributes[k] },
    hasAttribute(k) { return this.attributes[k] !== undefined },
    removeAttribute(k) { delete this.attributes[k] },
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
  for (const parent of [doc.head, doc.body]) {
    const origAppend = parent.appendChild.bind(parent)
    parent.appendChild = (child) => {
      const r = origAppend(child)
      if (child.id) doc._byId.set(child.id, child)
      return r
    }
    const origRemove = parent.removeChild.bind(parent)
    parent.removeChild = (child) => {
      const r = origRemove(child)
      if (child.id && doc._byId.get(child.id) === child) doc._byId.delete(child.id)
      return r
    }
  }
  return doc
}

// ── React 桩：函数组件真的被调用，ref 回调真的被记录 ────────────────────
const refCallbacks = []
const functionComponents = []
let currentComponent = null
let currentProps = null
function makeReact() {
  return {
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
      if (props && typeof props.ref === 'function') refCallbacks.push({ type, ref: props.ref, vnode })
      return vnode
    },
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

// ── 可驱动的服务桩：会话状态 / 事件流都由测试推进 ──────────────────────
let statusMap = new Map()
let statusNotify = null
const sessionCallbacks = {}
let sessionSnapshot = { change: { kind: 'append', entries: [] } }
const registered = {}

const ctx = {
  effect(fn) { return fn() },
  slots: {
    inject(name, cb) { cb(); return () => {} },
    register(options, component) {
      registered[options.name] = component
      // 模拟 shell 在 slot 位置 renderSlot 一次
      T.react.createElement(component, {})
      return () => { delete registered[options.name] }
    },
  },
  sessions: {
    list: { subscribe() { return () => {} }, getSnapshot() { return { byId: {}, ids: [], phase: 'ready' } } },
    binding(id) {
      return {
        eventSource: {
          subscribe(fn) { sessionCallbacks[id] = fn; return () => { delete sessionCallbacks[id] } },
          getSnapshot() { return sessionSnapshot },
        },
      }
    },
  },
  uiSession: {
    sessionStatus: {
      subscribe(fn) { statusNotify = fn; return () => { statusNotify = null } },
      getSnapshot() { return statusMap },
    },
  },
}

/** 把焦点会话标记为 running 并唤醒订阅（播放器由此拿到事件流）。 */
function focusRunningSession() {
  statusMap = new Map([['s1', { running: true }]])
  if (statusNotify) statusNotify()
}
/** 向焦点会话投递事件（包装成播放器消费的 {type:'event', event} 形状）。 */
function emit(...events) {
  sessionSnapshot = { change: { kind: 'append', entries: events.map((event) => ({ type: 'event', event })) } }
  Object.keys(sessionCallbacks).forEach((id) => sessionCallbacks[id]())
}

// ── 加载真实 client.js ────────────────────────────────────────────────
let rafSeq = 0
const rafJobs = new Map()
function loadClient() {
  const doc = makeDocument()
  const reactStub = makeReact()
  const win = {
    document: doc,
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }),
    // 真会取消的 rAF：卸载后不该再有任何一帧被画出来（no-op 的桩会让这条断言失真）
    requestAnimationFrame(fn) { const id = (rafSeq += 1); rafJobs.set(id, fn); return id },
    cancelAnimationFrame(id) { rafJobs.delete(id) },
  }
  globalThis.window = win
  globalThis.document = doc
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
  let mod = null
  win.__ModuleLoader__ = {
    load(spec) {
      mod = spec.factory((name) => {
        if (name === 'react') return reactStub
        throw new Error('unexpected require: ' + name)
      })
    },
  }
  ;(0, eval)(fs.readFileSync(CLIENT_PATH, 'utf8'))
  mod.__test = { doc, react: reactStub }
  return mod
}
// ── 可控时钟 ──────────────────────────────────────────────────────────
// 播放器用 Date.now() 判瞬时态 hold 窗口、用 rAF 时间戳推进帧序。
// 让两者共用同一个变量：测试可以**瞬间推过 5.2s 的 happy 窗口**（不用真睡），
// 且 hold 窗口与帧序的时序关系保持自洽。必须在 install 之前装好。
let clock = Date.now()
Date.now = () => clock

const client = loadClient()
const D = client.__deepy
const T = client.__test
const MAIN_PX = D.mainPx(MANIFEST)
const HERO_PX = D.heroPx(MANIFEST)

/** 推进时钟；默认 50ms = 一帧（manifest.frameMs）。Date.now 与 rAF 时间戳同步前进。 */
function pumpRaf(delta = 50) {
  clock += delta
  const jobs = [...rafJobs.entries()]
  rafJobs.clear()
  for (const [, fn] of jobs) fn(clock)
}
const settle = () => new Promise((r) => setTimeout(r, 20))

/** 渲染主位组件一次，取最近的 sprite ref 并把一个真实节点交给播放器。 */
function renderMain() { return T.react.createElement(registered['conversation.input.left'], {}) }
function latestRef() {
  const last = refCallbacks[refCallbacks.length - 1]
  return last ? last.ref : null
}
function mountSprite() {
  renderMain()
  const ref = latestRef()
  const node = makeNode('span')
  node.className = 'dsh-theme-deepy-sprite'
  T.doc.body.appendChild(node)
  if (typeof ref === 'function') ref(node)
  return node
}
/** 元素宽度必须等于帧距，否则相邻帧会从格子边缘泄入。 */
function pitchOf(node) {
  const bg = String(node.style.backgroundSize || '')
  const sheetW = parseFloat(bg.split(' ')[0])
  const w = parseFloat(node.style.width)
  if (!isFinite(sheetW) || !isFinite(w)) return null
  return sheetW / MANIFEST.cols - w
}
function parseRules(cssText) {
  return [...String(cssText).matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))
}

// ── 1. 尺寸来源：主位派生 96，hero 走自己的 102 ─────────────────────────
{
  eq('主位显示尺寸 = 素材帧 64 × 1.5 = 96px（派生，不是素材字段）', MAIN_PX, 96)
  eq('素材/manifest 的 displayPx 仍是 64px（生成物不动）', MANIFEST.displayPx, 64)
  eq('hero 显示尺寸 = 64 × 1.6 = 102px（自己那条既有路径）', HERO_PX, 102)
  ne('hero 不是「主位 96 × 1.6 = 153」——两个倍率没有共用来源', HERO_PX, Math.round(MAIN_PX * 1.6))
  ne('hero 也不是主位尺寸 96', HERO_PX, MAIN_PX)
}

// ── 2. 装上播放器，拿到真实精灵节点 ────────────────────────────────────
const player = D.install(ctx)
focusRunningSession()
await settle()
pumpRaf()
await settle()
pumpRaf()
check('素材就绪后 viewReady 置位', player.debug.isViewReady() === true, 'viewReady=' + player.debug.isViewReady())

// 主位宿主节点：hooks 层写 data-dsh-editing 的地方，也是播放器读「正在输入」的地方
const mainHost = makeNode('span')
mainHost.id = 'dsh-theme-deepy'
T.doc.body.appendChild(mainHost)

const sprite = mountSprite()
eq('sprite ref 已把节点交给播放器', player.debug.getSprite(), sprite)
pumpRaf()
eq('主位精灵真实渲染宽度 = 96px', sprite.style.width, MAIN_PX + 'px')
eq('主位精灵真实渲染高度 = 96px', sprite.style.height, MAIN_PX + 'px')
check('主位已画出帧（backgroundImage 指向素材）', String(sprite.style.backgroundImage).indexOf('deepy/') !== -1, String(sprite.style.backgroundImage))

// ── 3. 填写态抬头：idle → idle-look，且 sheet / 偏移全部按 96 走 ────────
mainHost.setAttribute('data-dsh-editing', '')
pumpRaf()
await settle()
pumpRaf()
eq('填写时显示态抬到 idle-look', player.debug.getState().currentState, 'idle-look')
check('idle-look 素材已上屏', String(sprite.style.backgroundImage).indexOf('idle-look.png') !== -1, String(sprite.style.backgroundImage))
eq('idle-look sheet 尺寸 = 8 × 96 / 9 × 96（与 design/composer-v3.html 的 768px 864px 一致）', sprite.style.backgroundSize, (MANIFEST.cols * MAIN_PX) + 'px ' + (MANIFEST.states['idle-look'].rows * MAIN_PX) + 'px')
eq('元素宽度 = 帧距 96px（相邻帧不可能泄入）', pitchOf(sprite), 0)

{
  const frames = [sprite.style.backgroundPosition]
  for (let i = 1; i < MANIFEST.states['idle-look'].frames; i += 1) {
    pumpRaf()
    frames.push(sprite.style.backgroundPosition)
  }
  const bad = []
  for (let f = 0; f < frames.length; f += 1) {
    const want = (-(f % MANIFEST.cols) * MAIN_PX) + 'px ' + (-(Math.floor(f / MANIFEST.cols)) * MAIN_PX) + 'px'
    if (frames[f] !== want) bad.push('frame ' + f + ': got ' + frames[f] + ' want ' + want)
  }
  eq('逐帧背景偏移全部正确（idle-look 68 帧 / 9 行 × 8 列）', bad.length, 0, bad.slice(0, 4).join(' | '))
  ne('逐帧偏移确实在动（不是一直停在 0）', frames[1], frames[0])
}

// 全表（含 happy 的行尾 padding 态）：任意帧号的格子与偏移同源
{
  const bad = []
  for (const [name, meta] of Object.entries(MANIFEST.states)) {
    for (let f = 0; f < meta.frames * 2 + 3; f += 1) {
      const g = D.frameGeometry(f, meta, MANIFEST, MAIN_PX)
      const col = g.index % MANIFEST.cols
      const row = Math.floor(g.index / MANIFEST.cols)
      if (g.width !== MAIN_PX + 'px') bad.push(name + '@' + f + ' width=' + g.width)
      if (g.backgroundPosition !== (-col * MAIN_PX) + 'px ' + (-row * MAIN_PX) + 'px') bad.push(name + '@' + f + ' pos=' + g.backgroundPosition)
      if (parseFloat(g.backgroundSize.split(' ')[0]) / MANIFEST.cols !== parseFloat(g.width)) bad.push(name + '@' + f + ' pitch')
      if (row >= meta.rows || col >= MANIFEST.cols) bad.push(name + '@' + f + ' overflow')
    }
  }
  eq('全部 9 态任意帧号：宽度 / sheet / 偏移同源且不越格', bad.length, 0, bad.slice(0, 4).join(' | '))
}

// ── 4. 忙碌 / 终态不被填写态覆盖（渲染层实测，不是纯函数自证）──────────
{
  mainHost.setAttribute('data-dsh-editing', '')
  emit({ type: 'assistant/live-chunk', data: { chunk: { type: 'text-delta' } } })
  pumpRaf()
  await settle()
  pumpRaf()
  eq('填写 + 流式输出 → 显示态仍是 typing（不被 idle-look 顶掉）', player.debug.getState().currentState, 'typing')
  check('typing 素材上屏', String(sprite.style.backgroundImage).indexOf('typing.png') !== -1, String(sprite.style.backgroundImage))
  eq('typing 帧几何仍按 96px（sheet = 8 × 96 / 6 × 96）', sprite.style.backgroundSize, (MANIFEST.cols * MAIN_PX) + 'px ' + (MANIFEST.states.typing.rows * MAIN_PX) + 'px')
  eq('typing 元素宽度 = 帧距 96px', pitchOf(sprite), 0)

  emit({ type: 'turn/start', data: {} })
  pumpRaf()
  await settle()
  pumpRaf()
  eq('填写 + 新一轮开始 → thinking（工作档优先）', player.debug.getState().currentState, 'thinking')

  emit({ type: 'turn/end', data: { reason: { kind: 'error' } } })
  pumpRaf()
  await settle()
  pumpRaf()
  eq('填写 + 错误终态 → error（终态不被填写态覆盖）', player.debug.getState().currentState, 'error')
  check('error 素材上屏', String(sprite.style.backgroundImage).indexOf('error.png') !== -1, String(sprite.style.backgroundImage))

  emit({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
  pumpRaf()
  await settle()
  pumpRaf()
  eq('填写 + 成功终态 → happy（瞬时态压过填写态）', player.debug.getState().currentState, 'happy')

  mainHost.removeAttribute('data-dsh-editing')
}

// ── 4b. 真实轮次走完后，填写态必须抬头（实机缺陷回归）──────────────────
// 复现 .dsh-tmp/v3-integration/main-report.json「真实填写抬头」failed：
//   turn/start → text-delta(typing) → turn/end(completed) → happy 窗口过期 → 用户仍在填写。
// 旧行为下 turn/end 不落 base，base 停在 typing，抬头投影只认 idle → 精灵永远 typing。
// 这里用可控时钟把 5.2s 的 happy 窗口瞬间推过去，断言**最终画出来的素材**。
{
  mainHost.setAttribute('data-dsh-editing', '')
  emit({ type: 'turn/start', data: {} })
  pumpRaf(); await settle(); pumpRaf()
  eq('M10r-1 真实序列：新一轮开始 → thinking', player.debug.getState().currentState, 'thinking')
  eq('M10r-2 真实序列：忙态不被填写顶掉', player.debug.getState().currentState === 'thinking', true)

  emit({ type: 'assistant/live-chunk', data: { chunk: { type: 'text-delta' } } })
  pumpRaf(); await settle(); pumpRaf()
  eq('M10r-3 真实序列：流式输出 → typing', player.debug.getState().currentState, 'typing')
  check('M10r-4 真实序列：typing 素材上屏', String(sprite.style.backgroundImage).indexOf('typing.png') !== -1, String(sprite.style.backgroundImage))

  emit({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
  pumpRaf(); await settle(); pumpRaf()
  eq('M10r-5 真实序列：回合完成瞬间 → happy（终态优先）', player.debug.getState().currentState, 'happy')
  check('M10r-6 真实序列：happy 素材上屏', String(sprite.style.backgroundImage).indexOf('happy.png') !== -1, String(sprite.style.backgroundImage))

  for (let i = 0; i < 60; i += 1) pumpRaf()          // +3000ms，仍在 5200ms 窗口内
  eq('M10r-7 happy 窗口内 + 填写 → 仍 happy（终态不被夺）', player.debug.getState().currentState, 'happy')

  for (let i = 0; i < 60; i += 1) pumpRaf()          // 累计 +6000ms，越过 5200ms
  await settle()
  pumpRaf()
  eq('M10r-8 happy 过期 + 仍在填写 → idle-look（不再卡 typing）', player.debug.getState().currentState, 'idle-look')
  check('M10r-9 最终画的是 idle-look 素材（公开后果）', String(sprite.style.backgroundImage).indexOf('idle-look.png') !== -1, String(sprite.style.backgroundImage))
  eq('M10r-10 宿主状态契约属性同步为 idle-look', renderMain().props['data-dsh-deepy-state'], 'idle-look')
  eq('M10r-11 idle-look 几何仍按 96px（抬头不改尺寸）', sprite.style.backgroundSize, (MANIFEST.cols * MAIN_PX) + 'px ' + (MANIFEST.states['idle-look'].rows * MAIN_PX) + 'px')
  eq('M10r-12 抬头态元素宽度仍 = 帧距 96px', pitchOf(sprite), 0)

  emit({ type: 'turn/start', data: {} })
  pumpRaf(); await settle(); pumpRaf()
  eq('M10r-13 忙态优先不变：填写时新一轮 → thinking（不抬头）', player.debug.getState().currentState, 'thinking')
  mainHost.removeAttribute('data-dsh-editing')
  emit({ type: 'turn/end', data: { reason: { kind: 'completed' } } })
  pumpRaf(); await settle(); pumpRaf()
  eq('M10r-14 收尾：回合完成 → happy', player.debug.getState().currentState, 'happy')
}

// ── 5. 主位是裸鲸：vnode 里没有底座 / rim / 辉光 / 涟漪 ────────────────
{
  mainHost.removeAttribute('data-dsh-editing')
  emit({ type: 'turn/start', data: {} })
  pumpRaf()
  await settle()
  pumpRaf()
  const mainVNode = renderMain()
  check('主位根节点存在', Boolean(mainVNode) && mainVNode.type === 'span', describe(mainVNode && mainVNode.type))
  eq('主位根节点 id 是宿主', mainVNode && mainVNode.props.id, 'dsh-theme-deepy')
  eq('主位只有**一个**子节点（精灵本身，没有底座/涟漪）', (mainVNode && mainVNode.children.length), 1)
  eq('唯一子节点就是精灵', mainVNode && mainVNode.children[0].props.className, 'dsh-theme-deepy-sprite')
  check('主位根节点不再挂辉光档位属性', Boolean(mainVNode) && mainVNode.props['data-dsh-glow'] === undefined, String(mainVNode && mainVNode.props['data-dsh-glow']))
  eq('主位根节点保留状态契约属性', mainVNode && mainVNode.props['data-dsh-deepy-state'], player.debug.getBaseState())

  const cssText = (T.doc.getElementById('dsh-theme-deepy-style') || {}).textContent || ''
  const rules = parseRules(cssText)
  const mainScoped = rules.filter((r) => /^#dsh-theme-deepy(?:$|[\s.:[])/.test(r.sel) || r.sel === '#dsh-theme-deepy')
  check('读到发射的样式表', cssText.length > 200, 'len=' + cssText.length)
  eq('样式表里没有涟漪残留', cssText.indexOf('dsh-theme-deepy-ripple'), -1)
  eq('主位没有任何底座规则', mainScoped.filter((r) => r.sel.indexOf('deepy-base') !== -1).length, 0, mainScoped.map((r) => r.sel).join(' | '))
  eq('主位没有任何属性选择器规则（data-dsh-glow 辉光档已随底座移除）', rules.filter((r) => r.sel.indexOf('#dsh-theme-deepy[') !== -1).length, 0)
  eq('主位没有任何动画规则（辉光呼吸随底座移除）', mainScoped.filter((r) => r.body.indexOf('animation') !== -1).length, 0, mainScoped.map((r) => r.sel).join(' | '))
}

// ── 6. 宿主定位与脱流（不撑工具行、不建包含块）──────────────────────────
{
  const cssText = (T.doc.getElementById('dsh-theme-deepy-style') || {}).textContent || ''
  const rules = parseRules(cssText)
  const host = rules.find((r) => r.sel === '#dsh-theme-deepy')
  const spriteRule = rules.find((r) => r.sel === '.dsh-theme-deepy-sprite')
  const mainSpriteRule = rules.find((r) => r.sel === '#dsh-theme-deepy .dsh-theme-deepy-sprite')
  check('主位宿主规则存在', Boolean(host), rules.map((r) => r.sel).join(' | '))
  check('宿主 position:absolute 脱离文档流（不保留占位盒、不撑高 tools 行）', Boolean(host) && host.body.indexOf('position:absolute') !== -1, host && host.body)
  check('宿主不是 flex 项（absolute 后 flex 属性无意义）', Boolean(host) && host.body.indexOf('flex:') === -1, host && host.body)
  check('宿主没有显式宽高（尺寸只来自精灵，避免额外占位）', Boolean(host) && !/(^|;)width:/.test(host.body) && !/(^|;)height:/.test(host.body), host && host.body)
  check('宿主不用 transform（避开包含块红线）', Boolean(host) && host.body.indexOf('transform') === -1, host && host.body)
  check('宿主不拦挡输入与菜单点击', Boolean(host) && host.body.indexOf('pointer-events:none') !== -1, host && host.body)
  check('上缘探出量是局部变量 --deepy-perch（实机可覆盖）', Boolean(host) && host.body.indexOf('--deepy-perch') !== -1)
  check('离右缘是局部变量 --deepy-perch-right（实机可覆盖）', Boolean(host) && host.body.indexOf('--deepy-perch-right') !== -1)
  check('宿主贴右缘（right 定位，不用 left 居中）', Boolean(host) && /(^|;)right:/.test(host.body) && host.body.indexOf('left:') === -1, host && host.body)
  // 1.5× 非整数放大必须显式选渲染模式：像素鲸靠硬边，默认平滑会糊
  check('主位精灵走 image-rendering:pixelated（与 design/composer-v3.html 一致）', Boolean(mainSpriteRule) && mainSpriteRule.body.indexOf('image-rendering:pixelated') !== -1, mainSpriteRule && mainSpriteRule.body)
  check('hero 共用的 sprite 规则没有被加上渲染模式（hero 不动）', Boolean(spriteRule) && spriteRule.body.indexOf('image-rendering') === -1, spriteRule && spriteRule.body)

  // ── 后果型断言：字符串说 absolute 不等于行高真的没变 ──
  // 播放器只往**精灵**写内联样式，从不往宿主写任何尺寸/定位属性 ——
  // 宿主不产生自己的盒子，也就不可能把 tools 行撑高。
  //（真实行高不变仍需实机/浏览器量高，属父代理串行全量层，本层不谎称已验。）
  // M10.1 起宿主上多了一个**自定义属性**（--deepy-perch-lift，栖木跟随用），
  // 它不产生盒子、不参与布局，故上面那条后果型断言的判据不变：尺寸/定位属性一个都没有。
  eq('播放器不往宿主写任何尺寸/定位**属性**（宿主不产生占位盒 → 不可能撑高 tools 行）', Object.keys(mainHost.style).length, 0, JSON.stringify(mainHost.style))
  eq('宿主内联样式里只有栖木跟随这一个自定义属性', Object.keys(mainHost.style._props).join(','), '--deepy-perch-lift')
  check('宿主身上没有播放器写入的任何尺寸/定位属性', Object.keys(mainHost.attributes).filter((k) => k !== 'data-dsh-editing').length === 0, Object.keys(mainHost.attributes).join(','))
  eq('精灵的内联样式只含帧几何 5 项（尺寸/偏移全部落在脱流的那一个盒子上）',
    Object.keys(sprite.style).sort().join(','),
    'backgroundImage,backgroundPosition,backgroundSize,height,width')
}

// ── 6.5 栖木跟随（M10.1）：排队停靠面板把整块顶边抬高时，主位跟着抬 ──────────
// 背景：QueueDock（[data-queue-dock]）出现时贴在卡片上缘并与之融合，整块的可视顶边
// 因此上移；鲸鱼若仍按卡片锚定就会压在面板上（实测盖住行右侧的删除 / 插话按钮）。
{
  eq('M10.1-1 面板在卡片上方 → 抬升 = 卡片顶 − 面板顶', player.debug.deepyPerchLift(140, 100), 40)
  eq('M10.1-2 面板比卡片低（异常几何）→ 不抬', player.debug.deepyPerchLift(100, 140), 0)
  eq('M10.1-3 量不到（NaN）→ 不抬', player.debug.deepyPerchLift(NaN, 100), 0)
  eq('M10.1-4 面板缺席（undefined）→ 不抬', player.debug.deepyPerchLift(140, undefined), 0)

  // 真 DOM 路径：照 shell 的真实形状接线 ——
  //   composerStack > [ SlotOutlet(display:contents) > dock , inputBar > card ]
  const dock = makeNode('div')
  dock.getBoundingClientRect = () => ({ top: 100 })
  const slot = makeNode('div')
  slot.appendChild(dock)
  const bar = makeNode('div')
  const card = makeNode('div')
  card.getBoundingClientRect = () => ({ top: 140 })
  bar.appendChild(card)
  const stack = makeNode('div')
  stack.appendChild(slot)
  stack.appendChild(bar)
  stack.querySelector = (sel) => (sel === ':scope > * > [data-queue-dock]' ? dock : null)
  bar.parentElement = stack
  slot.parentElement = stack
  card.parentElement = bar
  mainHost.closest = (sel) => (sel === '[data-composer-card]' ? card : null)

  // 第二条口径：面板**直接**挂在栈上（没有槽位包裹层）时同样找得到
  const dock2 = makeNode('div')
  const stack2 = makeNode('div')
  stack2.querySelector = (sel) => (sel === ':scope > [data-queue-dock]' ? dock2 : null)
  const card2 = makeNode('div')
  card2.parentElement = stack2
  eq('M10.1-5b 面板直接挂在栈上（无槽位包裹层）时用第一条口径命中', player.debug.deepyDockFor(card2), dock2)

  eq('M10.1-5 从卡片向上能找到停靠面板（data-queue-dock 是稳定锚点）', player.debug.deepyDockFor(card), dock)
  pumpRaf(250)   // 越过 200ms 的粗测节流（不能用 sleep：本测试用的是可控时钟）
  eq('M10.1-6 抬升量写进宿主内联变量 --deepy-perch-lift', mainHost.style.getPropertyValue('--deepy-perch-lift'), '40px')
  eq('M10.1-7 debug 读到同一个值（验收不必猜）', player.debug.getPerchLift(), '40px')
  eq('M10.1-8 抬升量是整数像素（不做 0.5px 的假精度）', Number(mainHost.style.getPropertyValue('--deepy-perch-lift').replace('px', '')), 40)

  // 队列排空 → 面板消失 → 抬升归零，回到 M9 的原始栖木
  card.parentElement = makeNode('div')
  pumpRaf(250)
  eq('M10.1-9 停靠面板消失 → 抬升归零（几何退回 M9）', mainHost.style.getPropertyValue('--deepy-perch-lift'), '0px')
}
// ── 7. hero 迎宾位：保留月台底座，且不被主位倍率连带放大 ────────────────
{
  const heroSprite = makeNode('span')
  heroSprite.className = 'dsh-theme-deepy-sprite'
  const heroHost = makeNode('span')
  heroHost.id = 'dsh-theme-deepy-hero'
  heroHost.querySelector = (sel) => (sel === '.dsh-theme-deepy-sprite' ? heroSprite : null)
  heroHost.appendChild(heroSprite)
  T.doc.body.appendChild(heroHost)

  pumpRaf()
  eq('hero 精灵渲染宽度 = 102px（displayPx × 1.6，与主位 96 无关）', heroSprite.style.width, HERO_PX + 'px')
  ne('hero 没有被主位倍率连带放大（153px 不是它的尺寸）', heroSprite.style.width, Math.round(MAIN_PX * 1.6) + 'px')
  ne('hero 也没有退化成主位尺寸', heroSprite.style.width, MAIN_PX + 'px')
  eq('hero sheet 尺寸按 102 算（8 × 102 / 6 × 102）', heroSprite.style.backgroundSize, (MANIFEST.cols * HERO_PX) + 'px ' + (MANIFEST.states.idle.rows * HERO_PX) + 'px')
  eq('hero 元素宽度 = 帧距 102px（无相邻帧泄漏）', pitchOf(heroSprite), 0)
  {
    const pos = String(heroSprite.style.backgroundPosition)
    const x = Math.abs(parseFloat(pos.split(' ')[0]) || 0)
    const y = Math.abs(parseFloat(pos.split(' ')[1]) || 0)
    eq('hero 帧偏移是 102 的整数倍（偏移与尺寸同源）', (x % HERO_PX) + (y % HERO_PX), 0, pos)
  }
  eq('hero 在场 → 主位静默（单鲸规则不变）', player.debug.isMainVisible(), false)

  const heroVNode = T.react.createElement(registered['conversation.hero.brand.mark'], {})
  eq('hero 根节点 id 是迎宾位宿主', heroVNode && heroVNode.props.id, 'dsh-theme-deepy-hero')
  eq('hero 根节点仍挂光晕档位属性', heroVNode && heroVNode.props['data-dsh-glow'], 'idle')
  const cover = heroVNode && heroVNode.children && heroVNode.children[0]
  const stage = cover && cover.children && cover.children[1]
  eq('hero 舞台仍是两件：月台底座 + 精灵', stage && stage.children.length, 2)
  check('hero 月台底座仍在（主位去底座不影响 hero）', String(stage && stage.children[0] && stage.children[0].props.className).indexOf('dsh-theme-deepy-base') !== -1, String(stage && stage.children[0] && stage.children[0].props.className))

  T.doc.body.removeChild(heroHost)
  T.doc._byId.delete('dsh-theme-deepy-hero')
  pumpRaf()
  eq('hero 卸载后主位恢复可见（自愈）', player.debug.isMainVisible(), true)
}

// ── 8. 卸载不留残留：样式表 / rAF / 写入全部停住 ────────────────────────
{
  pumpRaf()
  const beforeBg = sprite.style.backgroundImage
  const beforePos = sprite.style.backgroundPosition
  player.dispose()
  eq('dispose 后播放器不再持有精灵', player.debug.getSprite(), null)
  eq('dispose 后 viewReady 复位', player.debug.isViewReady(), false)
  check('dispose 后内联样式表已移除（keyframes / 动画随之消失）', T.doc.getElementById('dsh-theme-deepy-style') === null)
  check('播放器从未往精灵上写内联 animation', sprite.style.animation === undefined, describe(sprite.style.animation))
  check('播放器从未往精灵上写内联 transform（避开包含块红线）', sprite.style.transform === undefined, describe(sprite.style.transform))
  for (let i = 0; i < 6; i += 1) pumpRaf()
  eq('dispose 后 rAF 已取消：不再有任何帧写入（背景图不变）', sprite.style.backgroundImage, beforeBg)
  eq('dispose 后不再有任何帧写入（偏移不变）', sprite.style.backgroundPosition, beforePos)

  const player2 = D.install(ctx)
  check('可重新 install（可逆）', typeof player2.dispose === 'function')
  player2.dispose()
  check('二次卸载后样式表仍未残留', T.doc.getElementById('dsh-theme-deepy-style') === null)
}


// ── 9. 红线：client 半顶层零声明 ──────────────────────────────────────
// 合批脚本把一批 client.js 拼进同一个 classic <script>，顶层 const/let 共享作用域，
// 跨包同名标识符会触发 "Identifier 'X' has already been declared" 并**整批解析失败**。
// 这里按「剥注释/字符串/正则后数花括号深度」扫描：depth 0 上不许出现任何声明关键字。
// 负控制：把 factory 里的一个 var 挪到文件顶层，这条立刻变红。
{
  function topLevelDeclarations(source) {
    const code = source
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1 ')
    const hits = []
    let depth = 0
    let i = 0
    let line = 1
    let quote = null
    let regex = false
    const prevSig = () => {
      for (let k = i - 1; k >= 0; k -= 1) if (!/\s/.test(code[k])) return code[k]
      return ''
    }
    while (i < code.length) {
      const ch = code[i]
      if (ch === '\n') { line += 1; i += 1; continue }
      if (quote) {
        if (ch === '\\') { i += 2; continue }
        if (ch === quote) quote = null
        i += 1; continue
      }
      if (regex) {
        if (ch === '\\') { i += 2; continue }
        if (ch === '/') regex = false
        i += 1; continue
      }
      if (ch === '"' || ch === "'" || ch === '`') { quote = ch; i += 1; continue }
      if (ch === '/') {
        const p = prevSig()
        if (p === '' || '(,=:[!&|?{};+-*%~^'.indexOf(p) !== -1) regex = true
        i += 1; continue
      }
      if (ch === '{') { depth += 1; i += 1; continue }
      if (ch === '}') { depth -= 1; i += 1; continue }
      if (depth === 0) {
        const m = /^(var|let|const|function|class)\b/.exec(code.slice(i, i + 10))
        if (m) {
          const p = code[i - 1]
          if (i === 0 || !/[\w$.]/.test(p)) hits.push('line ' + line + ': ' + m[1])
        }
      }
      i += 1
    }
    return hits
  }
  const source = fs.readFileSync(CLIENT_PATH, 'utf8')
  const topLevel = topLevelDeclarations(source)
  eq('client 半顶层零声明（合批后不会撞 Identifier already declared）', topLevel.length, 0, topLevel.join(' | '))
  check('扫描器确实覆盖了整个文件（行数 > 1000）', source.split('\n').length > 1000, 'lines=' + source.split('\n').length)
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
