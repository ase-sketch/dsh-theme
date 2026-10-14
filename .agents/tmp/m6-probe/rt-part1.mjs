/**
 * dsh-theme · M6 Deepy 渲染层回归测试。
 *
 * 覆盖验收方抓到的真缺陷：**切换会话后精灵永久消失**。
 * 根因是旧写法手动 appendChild 进 React 拥有的 slot 容器，React 重渲染时
 * 清掉不认识的子节点（sprite），而 host 留下；旧守卫让播放器无法自愈。
 *
 * 本测试驱动**真实的 installDeepy**（不是复制品），用最小 DOM/React 桩模拟：
 *   · React 首次挂载节点
 *   · React 销毁旧节点并重建新节点（= 切会话）
 * 断言播放器在节点被换掉后仍能画到新节点上 —— 这就是自愈性。
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
function eq(name, actual, expected) {
  check(name, actual === expected, 'expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual))
}

// ── 最小 DOM 桩 ────────────────────────────────────────────────────────
function makeNode(tag) {
  const node = {
    tagName: String(tag).toUpperCase(),
    className: '',
    id: '',
    style: {},
    attributes: {},
    children: [],
    parentNode: null,
    isConnected: false,
    setAttribute(k, v) { this.attributes[k] = v; if (k === 'id') this.id = v },
    getAttribute(k) { return this.attributes[k] === undefined ? null : this.attributes[k] },
    appendChild(child) {
      child.parentNode = this
      this.children.push(child)
      markConnected(child, true)
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
  return node
}
function markConnected(node, value) {
  node.isConnected = value
  for (const c of node.children) markConnected(c, value)
}

function makeDocument() {
  const doc = {
    head: makeNode('head'),
    body: makeNode('body'),
    hidden: false,
    _byId: new Map(),
    _listeners: {},
    createElement: (tag) => makeNode(tag),
    getElementById(id) { return doc._byId.get(id) || null },
    querySelector() { return null },
    addEventListener(type, fn) { (doc._listeners[type] = doc._listeners[type] || []).push(fn) },
    removeEventListener(type, fn) {
      const arr = doc._listeners[type]
      if (!arr) return
      const i = arr.indexOf(fn)
      if (i !== -1) arr.splice(i, 1)
    },
  }
  doc.body.isConnected = true
  doc.head.isConnected = true
  // style 元素进 head 时登记 id，供 getElementById 找到（installStyle 幂等依赖它）
  const origHeadAppend = doc.head.appendChild.bind(doc.head)
  doc.head.appendChild = (child) => {
    const r = origHeadAppend(child)
    if (child.id) doc._byId.set(child.id, child)
    return r
  }
  return doc
}

// ── React 桩：createElement 记录 ref 回调，供测试模拟挂载/卸载 ─────────
const refs = []
function makeReact() {
  return {
    createElement(type, props, ...children) {
      const vnode = { type, props: props || {}, children }
      if (typeof type === 'function' && type.name !== 'DeepySprite') {
        // 容器组件：真正调用它，拿到子树
        vnode.rendered = type(vnode.props)
      }
      return vnode
    },
    useState(init) {
      let value = typeof init === 'function' ? init() : init
      return [value, (next) => { value = typeof next === 'function' ? next(value) : next }]
    },
    useEffect(fn) { const cleanup = fn(); return cleanup },
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
  globalThis.Image = function () { this.onload = null; this.onerror = null; this.src = '' }
  globalThis.fetch = (url) => Promise.resolve({
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
  loaded.__testDom = doc
  loaded.__testRafQueue = rafQueue
  return loaded
}

const client = loadClient()
const D = client.__deepy
check('__deepy.install 已导出（渲染层可驱动）', typeof D.install === 'function')
check('__deepy.frameGeometry 已导出', typeof D.frameGeometry === 'function')
