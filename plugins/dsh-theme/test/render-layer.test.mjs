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
function ne(name, a, b) { check(name, a !== b, '两者都是 ' + describe(a)) }

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
// 主位显示尺寸：素材帧 64px × 1.5 = 96px（manifest 与源 PNG 仍是 64px，放大只发生在渲染端）。
// 走 client 导出的纯函数取，保证「测试期望」与「实现口径」是同一个来源。
const MAIN_PX = D.mainPx(MANIFEST)
const HERO_PX = D.heroPx(MANIFEST)

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

  // ── M7 回归：放大渲染位的取帧窗口必须整体按本位尺寸算 ──
  // 缺陷形态（实测）：frameGeometry 只按 manifest.displayPx 算 backgroundPosition，
  // 而调用方按自己的 px 算 backgroundSize —— hero 迎宾位（1.6 倍）于是拿到小一档的偏移，
  // 画面切到雪碧图的错误区域。这条断言在旧写法下必红（-64px ≠ -128px）。
  const HERO_PX = 128
  const h0 = D.frameGeometry(0, m.states.idle, m, HERO_PX)
  eq('放大位 frame0 偏移为 0', h0.backgroundPosition, '0px 0px')
  eq('放大位元素宽度 = 本位尺寸', h0.width, HERO_PX + 'px')
  const h9 = D.frameGeometry(9, m.states.idle, m, HERO_PX)
  eq('放大位 frame9 col = 9%8 = 1', h9.col, 1)
  eq('放大位 frame9 偏移按本位尺寸缩放', h9.backgroundPosition, (-1 * HERO_PX) + 'px ' + (-1 * HERO_PX) + 'px')
  ne('放大位偏移不等于按 displayPx 算的值（负控制）', h9.backgroundPosition, (-1 * m.displayPx) + 'px ' + (-1 * m.displayPx) + 'px')
  eq('放大位 background-size 按本位尺寸', h9.backgroundSize, (m.cols * HERO_PX) + 'px ' + (m.states.idle.rows * HERO_PX) + 'px')
  eq('省略 px 时回落到 displayPx（frameGeometry 的默认口径；主位现在显式传 96）', D.frameGeometry(9, m.states.idle, m).backgroundPosition, (-1 * m.displayPx) + 'px ' + (-1 * m.displayPx) + 'px')
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
  eq('元素宽度 = 主位显示尺寸（96px，防相邻帧泄入）', node1.style.width, MAIN_PX + 'px')

  // ── 直接验证 isConnected 守卫 ──
  // 真实风险：React 协调过程中节点可能已从 DOM 摘掉、但 ref 清理尚未跑到，
  // 此时若仍往旧节点写 style，就是「写成功但看不见」——正是 M5 的「计算绿 ≠ 可见」。
  const posBefore = node1.style.backgroundPosition
  node1.remove()                               // 从 DOM 摘掉，但**不**调 ref(null)
  eq('节点已被摘掉（isConnected=false）', node1.isConnected, false)
  pumpRaf(6)
  eq('守卫生效：不再往已摘掉的节点写帧', node1.style.backgroundPosition, posBefore)
  check('已摘掉节点上没有任何新写入（宽度仍是首次值）', node1.style.width === MAIN_PX + 'px')

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
  eq('新节点宽度仍 = 主位显示尺寸（96px）', node2.style.width, MAIN_PX + 'px')
  check('新节点确实被画过（不是空白）', painted2 !== '' && painted2 !== 'none', 'bg=' + painted2)
}

// ── 测试 2.5：单鲸规则（M7 裁决 3） ───────────────────────────────────
// 空会话里 hero 迎宾位已经有一只大鲸，输入卡左侧的主位必须静默；hero 消失后主位回来。
// 这里用**真实探测路径**驱动：往桩文档里塞一个 hero 宿主节点，看播放器是否认出来。
{
  eq('纯函数：ready=false 时主位不可见', D.mainVisible(false, false), false)
  eq('纯函数：ready=true 且无 hero → 主位可见', D.mainVisible(true, false), true)
  eq('纯函数：ready=true 且有 hero → 主位静默', D.mainVisible(true, true), false)
  eq('纯函数：ready=false 且有 hero → 主位静默', D.mainVisible(false, true), false)

  eq('初始没有 hero 宿主 → isHeroPresent=false', player.debug.isHeroPresent(), false)

  // 造一个 hero 宿主：getElementById 能查到，且 querySelector('.dsh-theme-deepy-sprite') 返回精灵
  const heroSprite = makeNode('span')
  heroSprite.className = 'dsh-theme-deepy-sprite'
  const heroHost = makeNode('span')
  heroHost.id = 'dsh-theme-deepy-hero'
  heroHost.querySelector = (sel) => (sel === '.dsh-theme-deepy-sprite' ? heroSprite : null)
  // 精灵必须真的是宿主的子节点：桩的 removeChild 靠遍历子树把 isConnected 置 false，
  // 这正是真实 DOM 里 React 卸载 hero 时发生的事（播放器就靠这个判据重取节点）。
  heroHost.appendChild(heroSprite)
  T.doc.body.appendChild(heroHost)
  T.doc._byId.set('dsh-theme-deepy-hero', heroHost)

  pumpRaf(2)
  eq('塞入 hero 宿主后播放器认出来了（真实探测路径）', player.debug.isHeroPresent(), true)
  eq('hero 在场 → 主位静默', player.debug.isMainVisible(), false)
  check('hero 精灵被画上了 idle 帧', typeof heroSprite.style.backgroundImage === 'string' && heroSprite.style.backgroundImage.indexOf('deepy/') !== -1, 'bg=' + heroSprite.style.backgroundImage)
  // hero 走**自己**的倍率路径：displayPx × 1.6 = 102px，与主位的 96px 无关（M10 隔离）。
  eq('hero 元素宽度 = displayPx * 1.6（不继承主位 1.5×）', heroSprite.style.width, HERO_PX + 'px')
  ne('hero 没有被主位倍率连带放大（96 × 1.6 = 153 不是 hero 的尺寸）', heroSprite.style.width, Math.round(MAIN_PX * 1.6) + 'px')
  ne('hero 也没有退化成主位尺寸', heroSprite.style.width, MAIN_PX + 'px')
  ne('hero 的取帧偏移按放大后的尺寸算（不是 displayPx）', heroSprite.style.backgroundPosition, '0px 0px')

  // ── M8 交付 4：hero 封面装配（DOM 结构 + 类名，排版归 T4） ──
  // 走的是**槽位 React 渲染注入**这条路：conversation.hero.brand.mark 是唯一的
  // 「空会话渲染、且 kind:single 不抢占 shell 自有内容」的 hero 槽位（brand.mark 的 fallback
  // 就是那条鱼，被我们替换是本来的设计）。workspace / agentPreset 槽位都有 shell 自己的内容，
  // 注册进去会把工作区选择器 / 模式选择器顶掉，所以不能走。
  if (typeof registeredComponent === 'function') {
    const heroVNode = T.react.createElement(registeredComponent, {})
    const isEl = (n, tag) => n && n.type === tag && n.props
    check('M8-1 hero 组件渲染出根节点', isEl(heroVNode, 'span'))
    eq('M8-2 根节点 id 是迎宾位宿主', heroVNode && heroVNode.props.id, 'dsh-theme-deepy-hero')
    eq('M8-3 根节点带光晕档位属性', heroVNode && heroVNode.props['data-dsh-glow'], 'idle')
    const cover = heroVNode && heroVNode.children && heroVNode.children[0]
    eq('M8-4 第一子节点是封面容器', cover && cover.props && cover.props.className, 'dsh-hero-cover')
    const coverKids = (cover && cover.children) || []
    eq('M8-5 封面三层：刊号 / 鲸+月台 / 版记', coverKids.length, 3)
    eq('M8-6 第一层是刊号行', coverKids[0] && coverKids[0].props.className, 'dsh-hero-kicker')
    eq('M8-7 第二层是舞台（鲸 + 月台）', coverKids[1] && coverKids[1].props.className, 'dsh-hero-stage')
    eq('M8-8 第三层是版记行', coverKids[2] && coverKids[2].props.className, 'dsh-hero-colophon')
    check('M8-9 刊号行有文案', typeof coverKids[0].children[0] === 'string' && coverKids[0].children[0].length > 0, String(coverKids[0].children[0]))
    check('M8-10 版记行有文案', typeof coverKids[2].children[0] === 'string' && coverKids[2].children[0].length > 0, String(coverKids[2].children[0]))
    // 月台必须在 stage 内：底座是 position:absolute，定位上下文只能是「只包住精灵」的那一层，
    // 否则会锚到整列容器底部、跑到版记下面去。
    const stageKids = (coverKids[1] && coverKids[1].children) || []
    eq('M8-11 舞台里两件：月台底座 + 精灵', stageKids.length, 2)
    check('M8-12 月台底座在 stage 内', String(stageKids[0] && stageKids[0].props.className).indexOf('dsh-theme-deepy-base') !== -1, String(stageKids[0] && stageKids[0].props.className))
    eq('M8-13 精灵在 stage 内', stageKids[1] && stageKids[1].props.className, 'dsh-theme-deepy-sprite')

    // ── 布局断言（M8 实测缺陷回归）：封面**绝不能是浮层** ──
    // 缺陷形态：kicker/colophon 用 position:absolute 浮在迎宾位上，而宿主与 shell 大标题
    // 同处一个 flex 行 → 两行字压在大标题上（截图 .agents/shots/m8-cover-light.png）。
    // 这里直接对**真实注入的样式表文本**做结构断言：宿主必须是纵向 flex 块级容器，
    // 且封面相关的每一条规则里都不许出现 position:absolute。
    const deepyStyle = T.doc.getElementById('dsh-theme-deepy-style')
    const cssText = deepyStyle ? deepyStyle.textContent : ''
    check('M8-14 读到了 Deepy 样式表文本', cssText.length > 200, 'len=' + cssText.length)
    const heroRules = [...cssText.matchAll(/([^{}]*(?:dsh-hero-|deepy-hero)[^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1], body: m[2] }))
    check('M8-15 封面相关规则都被找到', heroRules.length >= 4, 'found=' + heroRules.length + ' :: ' + heroRules.map((r) => r.sel.trim()).join(' | '))
    const absRules = heroRules.filter((r) => r.body.indexOf('position:absolute') !== -1)
    eq('M8-16 封面规则里没有任何绝对定位（否则与 shell 标题同线盒叠印）', absRules.length, 0, absRules.map((r) => r.sel.trim()).join(' | '))
    const hostRule = heroRules.find((r) => r.sel.indexOf('#dsh-theme-deepy-hero') !== -1)
    check('M8-17 宿主规则存在', Boolean(hostRule), heroRules.map((r) => r.sel.trim()).join(' | '))
    check('M8-18 宿主是纵向 flex 块级容器（占据自己的垂直空间）', Boolean(hostRule) && /display:flex/.test(hostRule.body) && /flex-direction:column/.test(hostRule.body), hostRule && hostRule.body)
    const coverRule = heroRules.find((r) => r.sel.indexOf('.dsh-hero-cover') !== -1)
    check('M8-19 封面容器也是纵向列（不是行内盒）', Boolean(coverRule) && /flex-direction:column/.test(coverRule.body), coverRule && coverRule.body)
    const stageRule = heroRules.find((r) => r.sel.indexOf('.dsh-hero-stage') !== -1)
    check('M8-20 stage 是月台的定位上下文', Boolean(stageRule) && /position:relative/.test(stageRule.body), stageRule && stageRule.body)
    // 零特异度策略：T4 的排版能无条件覆盖
    check('M8-21 刊号/版记的结构规则用 :where() 包住（零特异度，T4 可覆盖）', cssText.indexOf(':where(.dsh-hero-kicker)') !== -1 && cssText.indexOf(':where(.dsh-hero-colophon)') !== -1)
  }

  // ── M9：趴在桌沿的定位断言 + 抬头态素材契约 ──────────────────────────
  {
    const cssText9 = (T.doc.getElementById('dsh-theme-deepy-style') || {}).textContent || ''
    const rules = [...cssText9.matchAll(/([^{}]*)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }))
    const host = rules.find((r) => r.sel === '#dsh-theme-deepy')
    const base = rules.find((r) => r.sel === '.dsh-theme-deepy-base')
    check('M9-1 主位宿主规则存在', Boolean(host), rules.map((r) => r.sel).join(' | '))
    // ── M10 契约：底座 / rim / 辉光 / 涟漪**只归 hero 迎宾位**，主位是一只裸鲸 ──
    // 规则本身还要在（hero 复用同一个类名），所以这里守的是「主位侧没有任何引用」。
    check('M9-2 月台底座规则仍存在（hero 迎宾位保留）', Boolean(base))
    const mainScoped = rules.filter((r) => /^#dsh-theme-deepy(?![\w-])/.test(r.sel))
    eq('M9-2b 主位宿主下没有任何底座规则（底座只归 hero）', mainScoped.filter((r) => r.sel.indexOf('deepy-base') !== -1).length, 0, mainScoped.map((r) => r.sel).join(' | '))
    eq('M9-2c 主位宿主不再有属性选择器规则（data-dsh-glow 辉光档随底座一起移除）', rules.filter((r) => r.sel.indexOf('#dsh-theme-deepy[') !== -1).length, 0)
    eq('M9-2d 发射的样式表里没有涟漪残留', cssText9.indexOf('dsh-theme-deepy-ripple'), -1)
    eq('M9-2e 主位宿主不再有 rim 专注光规则（::after 随底座移除）', cssText9.indexOf('#dsh-theme-deepy[data-dsh-editing]'), -1)

    // 贴卡片右上角：**必须 absolute 脱流**（DOM 不动，只动视觉）
    // 缺陷形态（M9 实测）：position:relative 会保留原占位盒，64px 的鲸鱼把 tools 行撑到 78px。
    check('M9-3 宿主 position:absolute 脱离文档流（不保留占位盒、不撑高 tools 行）', Boolean(host) && host.body.indexOf('position:absolute') !== -1, host && host.body)
    check('M9-3b 宿主不再是 position:relative（那正是撑高行高的根因）', Boolean(host) && host.body.indexOf('position:relative') === -1, host && host.body)
    check('M9-3c 宿主已不是 flex 项（absolute 后 flex 属性无意义，应移除）', Boolean(host) && host.body.indexOf('flex:0 0 auto') === -1, host && host.body)
    // ── 上缘定位：断言**发射出来的默认几何**（-84px / 16px），不是源码写法 ──
    // 起点 = design/composer-v3.html 的 top = space-7(40) × -2 再上移一个 space-1(4)：
    // 实机量到像素 alpha union 的鲸鱼底缘比正文上缘侵入 1px，整体上移 4px 留呼吸。
    // right = space-4(16) 与 96px 几何都不动。两个都是「起点值」——
    // 实机调留位时覆盖 --deepy-perch / --deepy-perch-right 即可，不用改代码。
    // 负控制：把任一默认值改成正向/其它数值，这几条会红（见回报里的负控制记录）。
    const TOKEN_DEFAULTS = { '--dsh-space-1': 4, '--dsh-space-3': 12, '--dsh-space-4': 16, '--dsh-space-7': 40 }
    /**
     * 解析**发射出来的**长度表达式 → 数值：裸 px / var(--tok, 回退) / calc(...) 都吃。
     * 先把每个 var() 换成真实数值（token 默认表优先），再对剩下的纯算术求值。
     */
    function resolveLength(expr) {
      if (!expr) return null
      let e = String(expr).trim()
      const px = e.match(/^(-?[\d.]+)px$/)
      if (px) return Number(px[1])
      if (e.indexOf('calc(') === 0 && e.slice(-1) === ')') e = e.slice(5, -1)
      e = e.replace(/var\((--[\w-]+),\s*(-?[\d.]+)px\)/g, (m, name, fb) => {
        const v = TOKEN_DEFAULTS[name] === undefined ? Number(fb) : TOKEN_DEFAULTS[name]
        return String(v)
      })
      if (!/^[-+*/().\d\s]+$/.test(e)) return null
      try {
        const v = Function('return (' + e + ')')()
        return typeof v === 'number' && isFinite(v) ? v : null
      } catch (err) { return null }
    }
    /**
     * 取某个属性里 `var(--名字, 回退值)` 的**回退值**（括号配平，不靠字符串切分）。
     * M10.1 起 top 是 `calc(var(--deepy-perch, …) - var(--deepy-perch-lift, 0px))`，
     * 回退表达式里还嵌着 var()，旧的「按 ; 切段再砍掉首尾」写法会切坏。
     */
    function varFallback(body, prop, varName) {
      const s = String(body)
      const at = s.indexOf(prop + ":")
      if (at === -1) return null
      const token = "var(" + varName + ","
      const start = s.indexOf(token, at)
      if (start === -1) return null
      let depth = 0
      for (let i = start + 3; i < s.length; i += 1) {
        if (s[i] === "(") depth += 1
        else if (s[i] === ")") {
          depth -= 1
          if (depth === 0) return s.slice(start + token.length, i)
        }
      }
      return null
    }
    const perchTop = resolveLength(varFallback(host && host.body, 'top', '--deepy-perch'))
    const perchRight = resolveLength(varFallback(host && host.body, 'right', '--deepy-perch-right'))
    const perchLift = resolveLength(varFallback(host && host.body, 'top', '--deepy-perch-lift'))
    eq('M9-4 上缘探出量默认解析为 -84px（原型 -80 再上移一个 space-1 = 4px）', perchTop, -84)
    check('M9-4a 仍是负向位移（上半身探出卡缘、下半身压在卡内）', perchTop !== null && perchTop < 0, 'top=' + perchTop)
    eq('M9-4b 上移量正好是 space-1（-84 = -80 - 4）', perchTop === null ? null : (-80 - perchTop), 4)
    eq('M9-4c 离右缘默认解析为 16px', perchRight, 16)
    // ── M10.1：栖木跟住**整块**的顶缘（排队停靠面板把顶边抬高时一起抬）──
    // 默认 0px ⇒ 没有停靠面板时几何与 M9 完全一致（上面三条已经守住这一点）。
    eq('M10.1-1 抬升变量 --deepy-perch-lift 默认解析为 0px（无停靠面板时不抬）', perchLift, 0)
    check('M10.1-2 top 是 calc(栖木 − 抬升) 的形状（不是漏掉抬升项的旧写法）',
      Boolean(host) && /top:calc\(var\(--deepy-perch,/.test(host.body) && host.body.indexOf('- var(--deepy-perch-lift,0px)') !== -1,
      host && host.body)
    check('M9-4b 不再用 bottom 定位（底缘会压到桌面端状态栏统计条）', Boolean(host) && host.body.indexOf('bottom:') === -1, host && host.body)
    check('M9-5 位移量是局部变量 --deepy-perch（T4 调留位时可直接覆盖）', Boolean(host) && host.body.indexOf('--deepy-perch') !== -1)
    check('M9-5b 水平位置是局部变量 --deepy-perch-right（离右缘多少，实机调）', Boolean(host) && host.body.indexOf('--deepy-perch-right') !== -1)
    check('M9-5d 宿主贴右缘（right 定位，不再 left 居中）', Boolean(host) && /(^|;)right:var\(--deepy-perch-right/.test(host.body) && host.body.indexOf('left:') === -1, host && host.body)
    check('M9-5c 水平锚定不靠 transform（translateX 会建包含块）', Boolean(host) && host.body.indexOf('translateX') === -1, host && host.body)
    const z = host && host.body.match(/z-index:\s*(\d+)/)
    check('M9-6 宿主有 z-index 压过卡片描边', Boolean(z) && Number(z[1]) > 0, host && host.body)
    // 刻意不用 transform：那会把本元素变成 fixed 后代的包含块（AGENTS.md 包含块红线）
    check('M9-7 宿主**不用** transform（避开包含块红线）', Boolean(host) && host.body.indexOf('transform') === -1, host && host.body)

    // 月台底座形态（**只归 hero 迎宾位**；主位已去底座，见 M9-2b/M9-2c）：
    // 跟着「探出桌沿」调形——更宽、更扁、带透视压扁与桌沿高光。
    const widthPct = base && base.body.match(/width:\s*(\d+)%/)
    const padPct = base && base.body.match(/padding-bottom:\s*(\d+)%/)
    check('M9-8 月台比原来更宽（≥120%）', Boolean(widthPct) && Number(widthPct[1]) >= 120, base && base.body)
    check('M9-9 月台比原来更扁（padding-bottom < 30%）', Boolean(padPct) && Number(padPct[1]) < 30, base && base.body)
    check('M9-10 月台有透视压扁（scaleY）', Boolean(base) && base.body.indexOf('scaleY(') !== -1)
    check('M9-11 月台有桌沿高光层（linear-gradient 叠在 radial 之上）', Boolean(base) && base.body.indexOf('linear-gradient') !== -1 && base.body.indexOf('radial-gradient') !== -1)
    // 反光方向跟着位置翻转：鲸鱼从上缘挂下来 → 受光面在**下侧**
    check('M9-11b 反光面朝下（to top；之前趴下缘时是 to bottom）', Boolean(base) && base.body.indexOf('linear-gradient(to top,') !== -1 && base.body.indexOf('linear-gradient(to bottom,') === -1, base && base.body)

    // 抬头态素材契约：状态机可能渲染的每个态都必须在 manifest 里，且 PNG 真的落盘
    const look = MANIFEST.states['idle-look']
    check('M9-12 manifest 含抬头态 idle-look', Boolean(look))
    eq('M9-13 idle-look frames = 68', look && look.frames, 68)
    eq('M9-14 idle-look rows = 9（72 格 / 8 列，行尾 4 格 padding）', look && look.rows, 9)
    const lookPng = look ? fs.readFileSync(path.join(path.dirname(MANIFEST_PATH), look.file)) : null
    eq('M9-15 idle-look PNG 宽 = 8 x displayPx', lookPng && lookPng.readUInt32BE(16), 8 * MANIFEST.displayPx)
    eq('M9-16 idle-look PNG 高 = 9 x displayPx', lookPng && lookPng.readUInt32BE(20), 9 * MANIFEST.displayPx)
    const renderable = D.STATES.concat([D.LOOK_STATE])
    const missing = renderable.filter((k) => !MANIFEST.states[k])
    eq('M9-17 状态机可渲染的每个态都有素材（含抬头态）', missing.length, 0, missing.join(', '))
    const missingFile = Object.keys(MANIFEST.states).filter((k) => !fs.existsSync(path.join(path.dirname(MANIFEST_PATH), MANIFEST.states[k].file)))
    eq('M9-18 manifest 里每个态都有对应 PNG', missingFile.length, 0, missingFile.join(', '))
  }

  // 会话激活 → hero slot 不再渲染 → 主位必须回来
  T.doc.body.removeChild(heroHost)
  T.doc._byId.delete('dsh-theme-deepy-hero')
  pumpRaf(2)
  eq('hero 卸载后 isHeroPresent 复位', player.debug.isHeroPresent(), false)
  eq('hero 卸载后主位恢复可见（自愈）', player.debug.isMainVisible(), true)
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
