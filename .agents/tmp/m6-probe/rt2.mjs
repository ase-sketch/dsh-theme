import fs from 'node:fs'
const p1 = fs.readFileSync('E:/dsh-theme/plugins/dsh-theme/test/render-layer.test.mjs', 'utf8')
const p2 = `
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
  globalThis.Image = function () { this.onload = null; this.onerror = null; this.src = '' }
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
  loaded.__test = { doc, rafQueue, refCallbacks, functionComponents }
  return loaded
}
const client = loadClient()
const D = client.__deepy
const T = client.__test

function pumpRaf(times, ts0 = 0) {
  for (let i = 0; i < times; i += 1) {
    const fns = T.rafQueue.splice(0, T.rafQueue.length)
    for (const fn of fns) fn(ts0 + i * 100)
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
const ctx = {
  effect(fn) { return fn() },
  slots: { inject(name, cb) { cb(); return () => {} }, register() { return () => {} } },
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

// 触发一次真实渲染，让 ref 注册进桩
const view = player.debug.getContainer
// DeepyView 是闭包私有的，但 viewReady 置位时我们会 bumpView → React 重渲染 →
// 桩记录 ref。直接调用最新 ref 即可模拟 React 挂载。
const ref1 = latestRef()
check('React 桩已记录 sprite 的 ref 回调', typeof ref1 === 'function')

if (typeof ref1 === 'function') {
  const node1 = mountSprite()
  ref1(node1)                                  // React 挂载：把节点交给播放器
  eq('挂载后播放器持有该节点', player.debug.getSprite(), node1)

  pumpRaf(2)
  const painted1 = node1.style.backgroundImage
  check('已把帧画到节点上（backgroundImage 有值）', typeof painted1 === 'string' && painted1.indexOf('deepy/') !== -1, 'bg=' + painted1)
  eq('元素宽度 = displayPx', node1.style.width, MANIFEST.displayPx + 'px')

  // ── 模拟切会话：React 销毁旧节点 ──
  node1.remove()                               // React 把旧节点从 DOM 摘掉
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
eq('dispose 后内联 style 已移除', T.doc.getElementById('dsh-theme-deepy-style'), null)
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
`
fs.writeFileSync('E:/dsh-theme/plugins/dsh-theme/test/render-layer.test.mjs', p1 + p2)
console.log('written, lines:', (p1 + p2).split('\n').length)
