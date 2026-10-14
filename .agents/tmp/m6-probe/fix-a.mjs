import fs from 'node:fs'
const T = 'E:/dsh-theme/plugins/dsh-theme/lib/client.js'
let src = fs.readFileSync(T, 'utf8')
function sub(from, to, label) {
  const n = src.split(from).length - 1
  if (n !== 1) { console.error('ANCHOR FAIL [' + label + '] count=' + n); process.exit(1) }
  src = src.replace(from, to)
  console.log('ok: ' + label)
}

// ── 1. 声明区：container/sprite 改为「React 通过 ref 交给我们」的节点引用 ──
sub(
`      var container = null
      var sprite = null
      var currentState = null`,
`      // Route A：DOM 由 slot 的 React 组件拥有。我们只在渲染时从 ref 拿到
      // sprite 节点往它身上写 style —— 不再手动 appendChild 进 React 容器
      //（切会话时 React 会清掉它不认识的子节点，旧写法因此永久失效）。
      var spriteEl = null
      var viewReady = false
      var viewListeners = new Set()
      function bumpView() {
        viewListeners.forEach(function (listener) {
          try { listener() } catch (error) { /* 订阅者异常不该影响渲染 */ }
        })
      }
      function subscribeView(listener) {
        viewListeners.add(listener)
        return function () { viewListeners.delete(listener) }
      }
      var currentState = null`,
  'declarations'
)

// ── 2. DOM 区块整段替换为 React 组件 + 只读的节点解析 ──
sub(
`      // ── DOM：容器 + 精灵 ───────────────────────────────────────────────
      /** slot 的渲染容器；未就绪时为 null（此时容器暂挂 body 末尾）。 */
      function slotHost() {
        return document.querySelector('[data-slot="' + DEEPY_SLOT + '"]')
      }

      /**
       * 若容器当初退回了 body 末尾（slot 还没挂上），一旦 slot 出现就搬回去。
       * 不这么做的话，早期 boot 窗口装上的精灵会永久留在 body 里、脱离输入卡布局。
       */
      function reparentIfNeeded() {
        if (!container || !container.isConnected) return
        var slot = slotHost()
        if (!slot) return
        if (container.parentNode === slot) return
        slot.appendChild(container)
      }

      function ensureContainer() {
        if (container && container.isConnected) return container
        var host = document.getElementById(DEEPY_ROOT_ID)
        if (!host) {
          host = document.createElement('span')
          host.id = DEEPY_ROOT_ID
          host.setAttribute('data-dsh-part', 'deepy')
          // 挂在 slot 的渲染容器上；slot 未就绪时退回 body 末尾（tick 里会搬回来）。
          var slot = slotHost()
          if (slot) slot.appendChild(host)
          else document.body.appendChild(host)
        }
        container = host
        if (!sprite) {
          sprite = document.createElement('span')
          sprite.className = 'dsh-theme-deepy-sprite'
          container.appendChild(sprite)
        }
        return container
      }

      function removeContainer() {
        if (container && container.parentNode) container.parentNode.removeChild(container)
        container = null
        sprite = null
      }

      /**
       * 按 manifest 把某态某帧画到精灵上。
       * 元素宽度必须 === displayPx，否则相邻帧会泄入（typing/building 有 48/48 帧触格边）。
       */
      function paint(name, frame, manifest) {
        var meta = manifest.states[name]
        if (!meta) return false
        var image = deepyImages[name]
        if (!image) return false
        var cols = manifest.cols
        var px = manifest.displayPx
        var total = meta.frames
        var index = total > 0 ? ((frame % total) + total) % total : 0
        var col = index % cols
        var row = Math.floor(index / cols)
        var el = ensureContainer()
        var target = el.firstChild
        if (!target) return false
        target.style.width = px + 'px'        // ← 必须 = displayPx
        target.style.height = px + 'px'
        target.style.backgroundImage = 'url("' + image.src + '")'
        target.style.backgroundSize = (cols * px) + 'px ' + (meta.rows * px) + 'px'
        target.style.backgroundPosition = (-col * px) + 'px ' + (-row * px) + 'px'
        return true
      }`,
`      // ── DOM：由 slot 的 React 组件拥有（Route A） ─────────────────────
      // 为什么不再手动 appendChild：conversation.input.left 是 React 拥有的容器，
      // 切会话重渲染时它会清掉不认识的子节点；手动挂进去的 host 会留下、sprite 被删，
      // 且旧守卫（container.isConnected / if (!sprite)）让播放器无法自愈 —— 永久黑屏。
      // 现在元素的存在性交给 React，我们只在每帧通过 ref 拿到的节点写 style；
      // React 重建节点后 ref 会重新赋值，下一帧自然画到新节点上（自愈是结构性保证）。

      /** 精灵组件：ref 把真实节点交回给渲染循环。 */
      function DeepySprite() {
        return react.createElement('span', {
          className: 'dsh-theme-deepy-sprite',
          ref: function (node) { spriteEl = node },
        })
      }

      /** 容器组件：素材未就绪时返回 null（避免闪一帧空白框）。 */
      function DeepyView() {
        var tick0 = react.useState(0)
        var rerender = tick0[1]
        react.useEffect(function () {
          return subscribeView(function () { rerender(function (n) { return n + 1 }) })
        }, [])
        if (!viewReady) return null
        return react.createElement(
          'span',
          { id: DEEPY_ROOT_ID, 'data-dsh-part': 'deepy' },
          react.createElement(DeepySprite)
        )
      }

      /**
       * 按 manifest 把某态某帧画到精灵上。
       * 元素宽度必须 === displayPx，否则相邻帧会泄入（typing/building 有 48/48 帧触格边）。
       * spriteEl 由 React ref 维护；节点被 React 换掉后这里读到的是新节点。
       */
      function paint(name, frame, manifest) {
        var meta = manifest.states[name]
        if (!meta) return false
        var image = deepyImages[name]
        if (!image) return false
        var target = spriteEl
        // 节点还没挂上（React 尚未渲染 / 刚被换掉）→ 本帧不画，下一帧重试。
        if (!target || !target.isConnected) return false
        var cols = manifest.cols
        var px = manifest.displayPx
        var total = meta.frames
        var index = total > 0 ? ((frame % total) + total) % total : 0
        var col = index % cols
        var row = Math.floor(index / cols)
        target.style.width = px + 'px'        // ← 必须 = displayPx
        target.style.height = px + 'px'
        target.style.backgroundImage = 'url("' + image.src + '")'
        target.style.backgroundSize = (cols * px) + 'px ' + (meta.rows * px) + 'px'
        target.style.backgroundPosition = (-col * px) + 'px ' + (-row * px) + 'px'
        return true
      }`,
  'dom-block'
)

// ── 3. tick 里去掉 reparentIfNeeded ──
sub(
`        reparentIfNeeded()
        var manifest = deepyManifest`,
`        var manifest = deepyManifest`,
  'tick-reparent'
)

// ── 4. 素材就绪后通知 React 渲染容器 ──
sub(
`        if (!deepyImages[display]) return    // 素材未就绪：不渲染`,
`        if (!deepyImages[display]) return    // 素材未就绪：不渲染
        // 首帧素材就绪 → 让 React 挂上容器（只通知一次，避免每帧 setState）
        if (!viewReady) {
          viewReady = true
          bumpView()
        }`,
  'view-ready'
)

// ── 5. 安装段：用 slot 注册替换 ensureContainer ──
sub(
`      // ── 安装 ───────────────────────────────────────────────────────────
      installStyle()
      ensureContainer()
      document.addEventListener('visibilitychange', onVisibility)`,
`      // ── 安装 ───────────────────────────────────────────────────────────
      installStyle()
      // 经 slot 注册 React 组件（与 M5 设置面板同一机制）。槽未声明时静默跳过，
      // 由 slots.inject 在槽出现时回调——不假设 apply 与槽声明的先后。
      try {
        if (ctx.slots && typeof ctx.slots.inject === 'function') {
          var offSlot = ctx.slots.inject(DEEPY_SLOT, function () {
            return ctx.slots.register(
              { name: DEEPY_SLOT, id: 'dsh-theme-deepy', order: 40, label: function () { return 'Deepy' } },
              DeepyView
            )
          })
          if (typeof offSlot === 'function') disposers.push(offSlot)
        }
      } catch (error) { console.error('[dsh-theme] deepy slot registration failed:', error) }
      document.addEventListener('visibilitychange', onVisibility)`,
  'install-slot'
)

// ── 6. debug handle ──
sub(
`        getSprite: function () { return sprite },
        getContainer: function () { return container },`,
`        getSprite: function () { return spriteEl },
        getContainer: function () { return document.getElementById(DEEPY_ROOT_ID) },
        isViewReady: function () { return viewReady },`,
  'debug-handle'
)

// ── 7. dispose 去掉 removeContainer（React 随 effect 卸载自动移除） ──
sub(
`          subscribed = {}
          removeContainer()
          removeStyle()`,
`          subscribed = {}
          // 容器 DOM 归 React 所有：slot 注册的 disposer 已在上面的循环里撤掉，
          // React 随之卸载节点；这里只需把 ref 引用与就绪标志清干净。
          spriteEl = null
          viewReady = false
          viewListeners.clear()
          removeStyle()`,
  'dispose'
)

fs.writeFileSync(T, src)
console.log('written. lines =', src.split('\n').length)
