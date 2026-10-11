/**
 * dsh-theme — client 半（M5 正式形态）。
 *
 * 红线一（HANDOFF.md §3.6）：本文件顶层零声明。合批脚本把一批 client.js 直接拼进
 * 同一个 classic <script>，顶层 const/let 共享作用域，跨包同名标识符会触发
 * "Identifier 'X' has already been declared" 并**整批解析失败**。
 * 因此下面所有声明都在 factory 函数体内。
 *
 * 红线二（HANDOFF.md §3.4，M1 的根因）：ctx.effect(execute) 会**立即执行** execute，
 * 只有它的**返回值**被登记为 disposer。必须写成「body 里做安装、return 卸载函数」；
 * 把卸载函数直接当 body 传，会装上即被同毫秒撤掉，且平台不报任何错。
 *
 * 职责边界（M5 三层开关的 L3 层）：本文件**只发请求、只渲染**，从不决定也不落盘状态。
 * 状态所有权在 host 半（$DSH_HOME/dsh-theme/state.json）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-theme',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    var react = require('react')

    var STYLE_ELEMENT_ID = 'dsh-theme-style'
    var ROOT_ATTRIBUTE = 'data-dsh-theme'
    var STATE_URL = '/api/dsh-theme/state'
    var CSS_URL = '/api/dsh-theme/theme.css'
    var SKIN_CENTER_ACTIVE_URL = '/api/skin-center/v2/active'

    // ── 极简外部 store：面板订阅它，注入器也订阅它 ──────────────────────────
    var listeners = new Set()
    var state = { enabled: false, ready: false, error: null }
    function snapshot() {
      return { enabled: state.enabled, ready: state.ready, error: state.error }
    }
    function setState(patch) {
      state = {
        enabled: patch.enabled === undefined ? state.enabled : patch.enabled,
        ready: patch.ready === undefined ? state.ready : patch.ready,
        error: patch.error === undefined ? state.error : patch.error,
      }
      var current = snapshot()
      listeners.forEach(function (listener) {
        try {
          listener(current)
        } catch (error) {
          console.error('[dsh-theme] listener failed:', error)
        }
      })
    }
    function subscribe(listener) {
      listeners.add(listener)
      return function () {
        listeners.delete(listener)
      }
    }

    // ── 样式安装 / 卸载（可逆对，成对写在一起） ────────────────────────────
    var styleText = null
    var styleRequest = null

    /** 取一次 theme.css 文本并缓存；失败时返回 null（不抛，避免把 boot 带下去）。 */
    function loadStyleText() {
      if (styleText !== null) return Promise.resolve(styleText)
      if (styleRequest !== null) return styleRequest
      styleRequest = fetch(CSS_URL, { credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status)
          return response.text()
        })
        .then(function (text) {
          styleText = text
          return text
        })
        .catch(function (error) {
          styleRequest = null
          throw error
        })
      return styleRequest
    }

    function installStyle(text) {
      var existing = document.getElementById(STYLE_ELEMENT_ID)
      if (existing) {
        if (existing.textContent !== text) existing.textContent = text
      } else {
        var element = document.createElement('style')
        element.id = STYLE_ELEMENT_ID
        element.textContent = text
        document.head.appendChild(element)
      }
      document.documentElement.setAttribute(ROOT_ATTRIBUTE, '')
    }

    function uninstallStyle() {
      var element = document.getElementById(STYLE_ELEMENT_ID)
      if (element) element.remove()
      document.documentElement.removeAttribute(ROOT_ATTRIBUTE)
    }

// ── 语义锚点适配器 ──────────────────────────────────────────────────────
    // 为什么必须有这一段（M5 实测发现的第二层隐式依赖）：
    // theme.css 里的 L2 规则有三条用属性选择器锚定 shell 的 DOM ——
    //   [data-dsh-part="new-session"]（实心主按钮）
    //   [data-dsh-surface="sidebar"] …[class*="sessionRow"][class*="selected"]（选中态指示条）
    //   [data-dsh-surface="composer"] [class*="card"]（输入卡描边/圆角）
    // 纯皮肤期这些属性由 skin-center 的 semantic adapter 打上（lib/client.js:3104
    // createSemanticAdapter + SEMANTIC_RULES_V1:2941）。插件自注入时那层同样不存在，
    // 于是这三条规则静默失效——症状与 M3 笔记记录的一致（主按钮仍描边、输入卡不是白卡）。
    // 这里只复刻 theme.css 真正消费的 3 个锚点，不搬 skin-center 的全表 24 条。
    var SEMANTIC_RULES = [
      { selector: '[data-slot="sidebar"]', attrs: [['data-dsh-surface', 'sidebar']] },
      { selector: '[data-slot="conversation.composer"]', attrs: [['data-dsh-surface', 'composer']] },
      { selector: 'button[class*="newSession"]', attrs: [['data-dsh-part', 'new-session']] },
    ]

    function applySemanticRule(rule, element) {
      try {
        if (!element.matches(rule.selector)) return
      } catch (error) {
        return
      }
      for (var i = 0; i < rule.attrs.length; i += 1) {
        var name = rule.attrs[i][0]
        var value = rule.attrs[i][1]
        if (element.getAttribute(name) !== value) element.setAttribute(name, value)
      }
    }

    /** 打一轮全量锚点。 */
    function stampSemantics(root) {
      var base = root || document.documentElement
      if (!base) return
      for (var i = 0; i < SEMANTIC_RULES.length; i += 1) {
        var rule = SEMANTIC_RULES[i]
        applySemanticRule(rule, base)
        var matches
        try {
          matches = base.querySelectorAll(rule.selector)
        } catch (error) {
          continue
        }
        for (var j = 0; j < matches.length; j += 1) applySemanticRule(rule, matches[j])
      }
    }

    /**
     * 装上锚点观察器：初次全量 + 后续增量。
     * 返回 stop()；观察器与首轮打标同进同退，符合可逆效应纪律。
     */
    function startSemanticAdapter() {
      stampSemantics(document.documentElement)
      var observer = null
      try {
        observer = new MutationObserver(function (records) {
          try {
            for (var i = 0; i < records.length; i += 1) {
              var added = records[i].addedNodes
              for (var j = 0; j < added.length; j += 1) {
                if (added[j].nodeType === 1) stampSemantics(added[j])
              }
            }
          } catch (error) {
            /* 锚点失败不该影响主题 */
          }
        })
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true })
      } catch (error) {
        console.error('[dsh-theme] semantic observer failed:', error)
      }
      return function stop() {
        if (observer) observer.disconnect()
        observer = null
      }
    }

    /** skin-center 是否在本次启动图里（同步、无竞态）。 */
    function skinCenterPresent() {
      try {
        var boot = window.__DSH_BOOT__
        if (!boot || !Array.isArray(boot.entries)) return false
        return boot.entries.some(function (entry) {
          return entry && typeof entry.id === 'string' && entry.id.indexOf('skin-center') !== -1
        })
      } catch (error) {
        return false
      }
    }

    /**
     * 互斥（M5 Q4 裁定）：本插件激活时让 skin-center 的皮肤退到官方默认，防双注入。
     * 用 skin-center 既有的 v2 API 置 active=null（不直接写它的状态文件）。
     * 幂等且静默：skin-center 没装时该路由 404，属预期，不报错、不重试。
     */
    function ensureSkinCenterStock() {
      // 先判断 skin-center 到底在不在启动图里，不在就整段跳过。
      // 不能靠它的 body 标记（lib/client.js:4961 在 mount 时才设）：本插件与它的 mount 顺序
      // 没有保证，靠标记会变成竞态。启动图 window.__DSH_BOOT__.entries 在 client 半跑之前
      // 就已由 boot 注入，是同步可读且无竞态的判据。
      if (!skinCenterPresent()) return Promise.resolve(null)
      return fetch(SKIN_CENTER_ACTIVE_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ active: null }),
      }).then(function (response) {
        return response.ok ? response.json() : null
      }).then(function (body) {
        return body
      }).catch(function () {
        return null
      })
    }

    // ── 状态同步：读 host、写 host、订阅变化 ──────────────────────────────
    function readState() {
      return fetch(STATE_URL, { credentials: 'same-origin', headers: { accept: 'application/json' } })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status)
          return response.json()
        })
        .then(function (body) {
          if (!body || typeof body.enabled !== 'boolean') throw new Error('malformed state payload')
          setState({ enabled: body.enabled, ready: true, error: null })
          return body.enabled
        })
        .catch(function (error) {
          setState({ ready: true, error: 'state-unavailable' })
          console.error('[dsh-theme] state read failed:', error)
          return null
        })
    }

    /** 请求切换：只发请求，落盘由 host 半完成；以 host 的回执为准更新本地状态。 */
    function requestToggle(next) {
      setState({ enabled: next, error: null })
      return fetch(STATE_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status)
          return response.json()
        })
        .then(function (body) {
          if (!body || typeof body.enabled !== 'boolean') throw new Error('malformed state payload')
          setState({ enabled: body.enabled, ready: true, error: null })
          return body.enabled
        })
        .catch(function (error) {
          console.error('[dsh-theme] state write failed:', error)
          setState({ error: 'state-write-failed' })
          return null
        })
    }

    // ══════════════════════════════════════════════════════════════════════
    // M6 · Deepy 子系统
    // ──────────────────────────────────────────────────────────────────────
    // 纯函数投影 + 无 IO 状态机（可单测）+ 精灵播放器（slot conversation.input.left）。
    // 与样式链并列、互不消费；与样式注入同属一个 ctx.effect（开关 OFF 时一起撤）。
    //
    // 事件词汇以 DSH 0.2.0-rc.2 实测为准（.agents/tmp/m6-probe/probe-result.json）：
    //   · 任务书里的 agent/assistant-stream 在 DSH 不存在；真实词汇是 client-only 的
    //     assistant/live-chunk（transient 包装），流类型在 data.chunk.type。
    //   · tool/result 的 data 上没有 callId，配对必须走 data.message.toolCallId。
    //   · turn/end 的 reason 是对象，判别字段是 reason.kind。
    //   · change.kind === 'settle-assistant' 时没有 entries。
    // ══════════════════════════════════════════════════════════════════════

    /** 8 态（首版）。其余 12 态留二期。 */
    var DEEPY_STATES = ['idle', 'thinking', 'typing', 'happy', 'error', 'notification', 'music', 'building']
    /** 瞬时态时长（ms）。渲染时比较时刻，不用 setTimeout。 */
    var DEEPY_HOLD_MS = { happy: 5200, error: 4800, notification: 3200 }
    var DEEPY_MANIFEST_URL = '/api/dsh-theme/deepy/deepy.json'
    var DEEPY_ASSET_BASE = '/api/dsh-theme/deepy/'
    var DEEPY_ROOT_ID = 'dsh-theme-deepy'
    var DEEPY_STYLE_ID = 'dsh-theme-deepy-style'
    var DEEPY_SLOT = 'conversation.input.left'

    /** 初始机器状态。 */
    function deepyInitial() {
      return {
        /** 焦点会话基线态（无瞬时态时渲染它） */
        base: 'idle',
        /** 当前瞬时态，无则 null */
        transient: null,
        /** 瞬时态到期时刻（ms epoch） */
        until: 0,
        /** 活跃工具 callId 列表 */
        activeTools: [],
        /** 焦点会话 id */
        focus: null,
      }
    }

    function deepyIsTransient(name) {
      return name === 'happy' || name === 'error' || name === 'notification'
    }

    /**
     * 纯函数投影：把一个事件套用到机器状态上，返回新状态（不修改入参）。
     * 无 DOM、无服务、无时钟副作用——now 由调用方传入，便于单测。
     *
     * @param state - 当前机器状态（deepyInitial() 形状）
     * @param entry - {type:'event'|'transient', event} 包装
     * @param now - 当前时刻 ms
     * @returns 新的机器状态
     */
    function deepyProject(state, entry, now) {
      var next = {
        base: state.base,
        transient: state.transient,
        until: state.until,
        activeTools: state.activeTools.slice(),
        focus: state.focus,
      }
      if (!entry || !entry.event) return next
      var event = entry.event
      var type = event.type
      var data = event.data || {}

      /** 设定瞬时态：覆盖 base 的显示，到期回落（只续期，不夺 base）。 */
      function transient(name) {
        next.transient = name
        next.until = now + (DEEPY_HOLD_MS[name] || 0)
      }
      /** 设定持久态：换 base，并清掉正在覆盖的瞬时态。 */
      function persistent(name) {
        next.base = name
        next.transient = null
        next.until = 0
      }

      if (type === 'turn/start' || type === 'step/start') {
        persistent('thinking')
        return next
      }

      if (type === 'assistant/live-chunk') {
        var chunk = data.chunk
        var chunkType = chunk ? chunk.type : null
        if (chunkType === 'reasoning-delta') persistent('thinking')
        else if (chunkType === 'text-delta') persistent('typing')
        // 其余 chunk（block-start/block-end/usage/finish/tool-call-delta）不改变状态
        return next
      }

      if (type === 'tool/call') {
        var callId = data.callId === undefined || data.callId === null ? null : String(data.callId)
        if (callId !== null && next.activeTools.indexOf(callId) === -1) next.activeTools.push(callId)
        var n = next.activeTools.length
        if (n === 1) persistent('typing')
        else if (n === 2) persistent('music')
        else if (n >= 3) persistent('building')
        return next
      }

      if (type === 'tool/result') {
        // 失败判据：message.isError 为主（有活体证据），data.error 为补充
        //（类型定义保证它只在 isError 时出现，本轮探针未活体触发）。
        var failed = Boolean(data.error) || (data.message && data.message.isError === true)
        // 配对：data 上没有 callId，必须走 message.toolCallId（探针实测两者逐字符相同）。
        var doneId = data.message && data.message.toolCallId !== undefined && data.message.toolCallId !== null
          ? String(data.message.toolCallId)
          : null
        if (doneId !== null) {
          var at = next.activeTools.indexOf(doneId)
          if (at !== -1) next.activeTools.splice(at, 1)
        }
        if (failed) {
          transient('error')
          return next
        }
        persistent(next.activeTools.length > 0 ? 'typing' : 'thinking')
        return next
      }

      if (type === 'turn/end') {
        var kind = data.reason && typeof data.reason === 'object' ? data.reason.kind : data.reason
        if (kind === 'completed') transient('happy')
        else if (kind === 'error' || kind === 'max-tokens' || kind === 'interrupted') transient('error')
        else if (kind === 'blocked') transient('notification')
        else persistent('idle')
        // 回合结束，活跃工具清零（避免跨回合残留把 typing 锁死）
        next.activeTools = []
        return next
      }

      return next
    }

    /**
     * 从机器状态解析出「此刻该渲染哪个态」——时间窗衰减在这里发生。
     * 纯函数：只比较 now 与 state.until。
     */
    function deepyResolve(state, now) {
      if (state.transient !== null && now < state.until) return state.transient
      return state.base
    }

    /** 时间窗已过期时把瞬时态清掉，返回清理后的状态（纯函数）。 */
    function deepyDecay(state, now) {
      if (state.transient !== null && now >= state.until) {
        return {
          base: state.base,
          transient: null,
          until: 0,
          activeTools: state.activeTools,
          focus: state.focus,
        }
      }
      return state
    }

    /**
     * 跨会话档位：数 running===true 且非 subagent 的会话。
     * 防御性写法——SessionStatus 里没有 origin 字段（探针实测），
     * 所以 origin 取自 sessions.list.byId[id]；行缺失视为非 subagent。
     * @param statusMap - uiSession.sessionStatus 快照（可能是空 Map）
     * @param listSnapshot - sessions.list 快照（可能为 null）
     * @returns 并发档位对应的态，或 null（表示「由焦点会话决定」）
     */
    function deepyConcurrencyState(statusMap, listSnapshot) {
      if (!statusMap || typeof statusMap.forEach !== 'function') return null
      var byId = listSnapshot && listSnapshot.byId ? listSnapshot.byId : null
      var running = 0
      statusMap.forEach(function (value, key) {
        if (!value || value.running !== true) return
        var row = byId ? byId[key] : undefined
        // 缺行视为非 subagent（保守：不因元数据缺失而漏数）。
        if (row && row.origin === 'subagent') return
        running += 1
      })
      if (running >= 3) return 'building'
      if (running === 2) return 'music'
      return null
    }

    /**
     * 合并焦点会话态与跨会话档位（Q3 裁定：瞬时态优先）。
     * @param state - 机器状态
     * @param now - 当前时刻
     * @param concurrency - 跨会话档位态或 null
     * @returns 最终渲染态
     */
    function deepyDisplayState(state, now, concurrency) {
      var focusState = deepyResolve(state, now)
      if (deepyIsTransient(focusState)) return focusState
      if (concurrency !== null && concurrency !== undefined) return concurrency
      return focusState
    }

    // ── 素材加载（按需：进入某状态才 fetch 那张 PNG；失败可重试） ──────────
    var deepyManifest = null
    var deepyManifestRequest = null
    var deepyImages = {}        // state -> HTMLImageElement（已就绪）
    var deepyImageRequests = {} // state -> Promise
    var deepyWarned = {}        // state -> true（一次性诊断线索，不刷屏）

    function deepyLoadManifest() {
      if (deepyManifest !== null) return Promise.resolve(deepyManifest)
      if (deepyManifestRequest !== null) return deepyManifestRequest
      deepyManifestRequest = fetch(DEEPY_MANIFEST_URL, { credentials: 'same-origin' })
        .then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status)
          return response.json()
        })
        .then(function (body) {
          if (!body || !body.states || typeof body.states !== 'object') throw new Error('malformed deepy manifest')
          deepyManifest = body
          return body
        })
        .catch(function (error) {
          deepyManifestRequest = null   // 允许重试
          throw error
        })
      return deepyManifestRequest
    }

    /**
     * 按需加载某态精灵。失败不永久缓存（下次切到该态可重试），
     * 且只 warn 一次（M5 教训：完全静默会让同一个坑再踩一遍）。
     */
    function deepyLoadState(name) {
      if (deepyImages[name]) return Promise.resolve(deepyImages[name])
      if (deepyImageRequests[name]) return deepyImageRequests[name]
      var request = deepyLoadManifest()
        .then(function (manifest) {
          var meta = manifest.states[name]
          if (!meta || !meta.file) throw new Error('state not in manifest: ' + name)
          return new Promise(function (resolve, reject) {
            var image = new Image()
            image.onload = function () { resolve(image) }
            image.onerror = function () { reject(new Error('image decode failed: ' + meta.file)) }
            image.src = DEEPY_ASSET_BASE + meta.file
          })
        })
        .then(function (image) {
          deepyImages[name] = image
          return image
        })
        .catch(function (error) {
          delete deepyImageRequests[name]
          if (!deepyWarned[name]) {
            deepyWarned[name] = true
            console.warn('[dsh-theme] deepy sprite unavailable:', name, error && error.message ? error.message : error)
          }
          throw error
        })
      deepyImageRequests[name] = request
      return request
    }

    // ── 播放器：DOM + rAF 驱动 + 订阅（全部可逆） ─────────────────────────
    /**
     * 装上 Deepy 播放器。返回 { dispose, debug }；dispose 撤掉精灵元素、
     * 内联 CSS、全部订阅与监听。只被 apply 的 ctx.effect body 调用一次。
     */
    function installDeepy(ctx) {
      var disposers = []
      var machine = deepyInitial()
      var concurrency = null
      var frameIndex = 0
      var rafId = null
      var lastFrameAt = 0
      var container = null
      var sprite = null
      var currentState = null
      var currentDisplayPx = 0
      var subscribed = {}          // sessionId -> unsubscribe
      var hidden = document.hidden === true
      var reduceMotion = false
      try {
        var mq = window.matchMedia('(prefers-reduced-motion: reduce)')
        reduceMotion = mq.matches === true
        var onMq = function (event) { reduceMotion = event.matches === true }
        if (typeof mq.addEventListener === 'function') mq.addEventListener('change', onMq)
        else if (typeof mq.addListener === 'function') mq.addListener(onMq)
        disposers.push(function () {
          if (typeof mq.removeEventListener === 'function') mq.removeEventListener('change', onMq)
          else if (typeof mq.removeListener === 'function') mq.removeListener(onMq)
        })
      } catch (error) { /* matchMedia 不可用时按「不减速」处理 */ }

      // ── 内联 CSS（与状态机同层，不进食 theme.css） ────────────────────
      function installStyle() {
        if (document.getElementById(DEEPY_STYLE_ID)) return
        var style = document.createElement('style')
        style.id = DEEPY_STYLE_ID
        // 尺寸一律由 JS 用 manifest 的 displayPx 写成内联样式，这里只放不依赖尺寸的规则。
        style.textContent = [
          '#' + DEEPY_ROOT_ID + '{display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;pointer-events:none;user-select:none;}',
          '#' + DEEPY_ROOT_ID + ' .dsh-theme-deepy-sprite{background-repeat:no-repeat;background-position:0 0;}',
        ].join('')
        document.head.appendChild(style)
      }

      function removeStyle() {
        var style = document.getElementById(DEEPY_STYLE_ID)
        if (style) style.remove()
      }

      // ── DOM：容器 + 精灵 ───────────────────────────────────────────────
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
      }

      // ── 渲染循环（rAF；document.hidden 时停帧） ────────────────────────
      function tick(timestamp) {
        rafId = window.requestAnimationFrame(tick)
        if (hidden) return
        reparentIfNeeded()
        var manifest = deepyManifest
        if (!manifest) return
        var now = Date.now()
        var decayed = deepyDecay(machine, now)
        if (decayed !== machine) machine = decayed
        var display = deepyDisplayState(machine, now, concurrency)
        if (!display) display = 'idle'
        // 进入新状态 → 按需加载该态素材；未就绪时先不渲染（避免闪一帧空白框）
        if (display !== currentState) {
          currentState = display
          frameIndex = 0
          lastFrameAt = 0
          deepyLoadState(display).catch(function () { /* 已 warn 过一次 */ })
        }
        if (!deepyImages[display]) return    // 素材未就绪：不渲染
        var interval = manifest.frameMs
        if (reduceMotion) {
          // 减速偏好：停在代表帧（首帧），不推进
          frameIndex = 0
        } else if (lastFrameAt === 0 || timestamp - lastFrameAt >= interval) {
          if (lastFrameAt !== 0) {
            var steps = Math.max(1, Math.floor((timestamp - lastFrameAt) / interval))
            frameIndex += steps
          }
          lastFrameAt = timestamp
        }
        if (paint(display, frameIndex, manifest)) currentDisplayPx = manifest.displayPx
      }

      function onVisibility() {
        hidden = document.hidden === true
        if (hidden) {
          // 停帧：撤掉 rAF，恢复可见时重新起
          if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null }
        } else if (rafId === null) {
          lastFrameAt = 0
          rafId = window.requestAnimationFrame(tick)
        }
      }

      // ── 订阅：焦点会话事件 + 跨会话状态 ───────────────────────────────
      function subscribeSession(id) {
        if (subscribed[id]) return
        var binding = null
        try { binding = ctx.sessions.binding(id) } catch (error) { binding = null }
        if (!binding || !binding.eventSource || typeof binding.eventSource.subscribe !== 'function') return
        var source = binding.eventSource
        // 回调 0 参数（失效通知），必须自己 getSnapshot()；返回函数即退订。
        var stop = source.subscribe(function () {
          var snapshot = null
          try { snapshot = source.getSnapshot() } catch (error) { return }
          if (!snapshot || !snapshot.change) return
          var change = snapshot.change
          if (change.kind === 'settle-assistant') return   // 无 entries
          var entries = change.entries
          if (!entries || !entries.length) return
          for (var i = 0; i < entries.length; i += 1) {
            machine = deepyProject(machine, entries[i], Date.now())
          }
          machine.focus = id
        })
        if (typeof stop === 'function') subscribed[id] = stop
      }

      function refreshConcurrency() {
        var statusMap = null
        var listSnapshot = null
        try { statusMap = ctx.uiSession.sessionStatus.getSnapshot() } catch (error) { statusMap = null }
        try { listSnapshot = ctx.sessions.list.getSnapshot() } catch (error) { listSnapshot = null }
        concurrency = deepyConcurrencyState(statusMap, listSnapshot)
        // 焦点会话：优先「当前 running 的会话」，否则保持既有焦点
        if (statusMap && typeof statusMap.forEach === 'function') {
          statusMap.forEach(function (value, key) {
            if (value && value.running === true) {
              if (machine.focus === null) machine.focus = key
              subscribeSession(key)
            }
          })
        }
        if (machine.focus !== null) subscribeSession(machine.focus)
      }

      // ── 安装 ───────────────────────────────────────────────────────────
      installStyle()
      ensureContainer()
      document.addEventListener('visibilitychange', onVisibility)
      disposers.push(function () { document.removeEventListener('visibilitychange', onVisibility) })

      try {
        if (ctx.uiSession && ctx.uiSession.sessionStatus && typeof ctx.uiSession.sessionStatus.subscribe === 'function') {
          var stopStatus = ctx.uiSession.sessionStatus.subscribe(refreshConcurrency)
          if (typeof stopStatus === 'function') disposers.push(stopStatus)
        }
      } catch (error) { console.error('[dsh-theme] deepy status subscribe failed:', error) }
      try {
        if (ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.subscribe === 'function') {
          var stopList = ctx.sessions.list.subscribe(refreshConcurrency)
          if (typeof stopList === 'function') disposers.push(stopList)
        }
      } catch (error) { console.error('[dsh-theme] deepy list subscribe failed:', error) }

      refreshConcurrency()
      deepyLoadState('idle').catch(function () { /* 已 warn 过一次 */ })
      rafId = window.requestAnimationFrame(tick)

      // 暴露给单测/验收读取的只读快照（不污染 window）
      var debugHandle = {
        getState: function () {
          return {
            base: machine.base,
            transient: machine.transient,
            until: machine.until,
            activeTools: machine.activeTools.slice(),
            focus: machine.focus,
            concurrency: concurrency,
            display: deepyDisplayState(machine, Date.now(), concurrency),
            currentState: currentState,
            displayPx: currentDisplayPx,
          }
        },
        getSprite: function () { return sprite },
        getContainer: function () { return container },
      }

      return {
        dispose: function () {
          if (rafId !== null) { window.cancelAnimationFrame(rafId); rafId = null }
          for (var i = 0; i < disposers.length; i += 1) {
            try { disposers[i]() } catch (error) { console.error('[dsh-theme] deepy dispose failed:', error) }
          }
          disposers.length = 0
          Object.keys(subscribed).forEach(function (id) {
            try { subscribed[id]() } catch (error) { /* 退订失败不该影响卸载 */ }
          })
          subscribed = {}
          removeContainer()
          removeStyle()
        },
        debug: debugHandle,
      }
    }

    // ── 设置面板（React 组件） ────────────────────────────────────────────
    function ThemeSettingsSection() {
      var current = react.useState(snapshot())
      var view = current[0]
      var setView = current[1]
      react.useEffect(function () {
        var off = subscribe(setView)
        return off
      }, [])

      var busy = !view.ready
      var toggle = function () {
        requestToggle(!view.enabled)
      }

      return react.createElement(
        'div',
        { style: { maxWidth: '760px', display: 'flex', flexDirection: 'column', gap: '12px' } },
        react.createElement('h2', { style: { margin: 0, fontSize: '18px', fontWeight: 600, color: 'var(--dsw-alias-label-primary)' } }, 'dsh-theme 主题'),
        react.createElement(
          'p',
          { style: { margin: 0, fontSize: '13px', color: 'var(--dsw-alias-label-tertiary)' } },
          '按 dsh-ui 设计规范注入皮肤（蓝调画布 · 纯白卡片 · DeepSeek 品牌蓝）。关闭后立即还原官方外观，面板保留。'
        ),
        react.createElement(
          'label',
          {
            style: {
              display: 'flex', alignItems: 'center', gap: '10px', cursor: busy ? 'default' : 'pointer',
              border: '1px solid var(--dsw-alias-border-l1)', borderRadius: 'var(--dsw-radius-md, 10px)',
              padding: '12px 14px', background: 'var(--dsw-alias-bg-layer-1)',
            },
          },
          react.createElement('input', {
            type: 'checkbox',
            checked: view.enabled,
            disabled: busy,
            onChange: toggle,
            'data-dsh-part': 'theme-toggle',
          }),
          react.createElement(
            'span',
            { style: { fontSize: '14px', color: 'var(--dsw-alias-label-primary)' } },
            view.enabled ? '已启用' : '已关闭'
          )
        ),
        view.error === null
          ? null
          : react.createElement(
              'p',
              { style: { margin: 0, fontSize: '12px', color: 'var(--dsw-alias-state-error-primary, var(--dsw-alias-label-error))' } },
              view.error === 'state-write-failed' ? '写入失败：开关状态未保存。' : '无法读取开关状态：host 半路由不可用。'
            )
      )
    }

    /** 注册设置面板；返回 disposer。slots 服务缺失时返回空函数（不炸 boot）。 */
    function registerPanel(ctx) {
      var dispose = function () {}
      if (!ctx.slots || typeof ctx.slots.inject !== 'function') return dispose
      try {
        var off = ctx.slots.inject('settings.section', function () {
          return ctx.slots.register(
            {
              name: 'settings.section',
              id: 'dsh-theme',
              order: 130,
              label: function () { return 'dsh-theme 主题' },
              inject: function () { return {} },
            },
            ThemeSettingsSection
          )
        })
        if (typeof off === 'function') dispose = off
      } catch (error) {
        console.error('[dsh-theme] settings panel registration failed:', error)
      }
      return dispose
    }

    /**
     * @param ctx - client root context。
     */
    function apply(ctx) {
      // ⚠️ effect body 里做安装、return 卸载函数 —— 见文件头红线二。
      ctx.effect(function () {
        var disposePanel = registerPanel(ctx)
        var stopSemantics = startSemanticAdapter()
        // Deepy 播放器与样式注入同属一个可逆对：开关 OFF 时精灵元素、内联 CSS、
        // 全部订阅一起撤（ARCHITECTURE.md「卸载」行）。装/卸都由开关驱动，幂等。
        var deepy = null
        function syncDeepy(enabled) {
          if (enabled) {
            if (deepy === null) deepy = installDeepy(ctx)
          } else if (deepy !== null) {
            deepy.dispose()
            deepy = null
          }
        }
        var disposeSubscribe = subscribe(function (view) {
          if (!view.ready) return
          syncDeepy(view.enabled)
          if (!view.enabled) {
            uninstallStyle()
            return
          }
          loadStyleText()
            .then(function (text) {
              // 竞态守卫：await 期间开关可能已被关掉
              if (snapshot().enabled) installStyle(text)
            })
            .catch(function (error) {
              console.error('[dsh-theme] theme.css load failed:', error)
              setState({ error: 'style-unavailable' })
            })
          ensureSkinCenterStock()
        })

        readState()

        return function () {
          disposeSubscribe()
          disposePanel()
          stopSemantics()
          uninstallStyle()
          syncDeepy(false)
        }
      }, 'dsh-theme: skin injection + settings panel')
    }

    exports.apply = apply
    // 服务名（cordis fiber inject）——不是包名。真正生效的是这一份；
    // package.json 的 dsh.client.inject 是信息性的（加载/预取元数据，不做 apply 排序）。
    exports.inject = ['slots', 'sessions', 'uiSession']

    // 纯函数投影与状态机的只读导出，供单元测试直接调用（无 DOM、无服务依赖）。
    exports.__deepy = {
      STATES: DEEPY_STATES,
      HOLD_MS: DEEPY_HOLD_MS,
      initial: deepyInitial,
      project: deepyProject,
      resolve: deepyResolve,
      decay: deepyDecay,
      concurrencyState: deepyConcurrencyState,
      displayState: deepyDisplayState,
      isTransient: deepyIsTransient,
    }
    return module.exports
  },
})
