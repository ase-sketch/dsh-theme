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
      function ensureContainer() {
        if (container && container.isConnected) return container
        var host = document.getElementById(DEEPY_ROOT_ID)
        if (!host) {
          host = document.createElement('span')
          host.id = DEEPY_ROOT_ID
          host.setAttribute('data-dsh-part', 'deepy')
          // 挂在 slot 的渲染容器上；slot 未就绪时退回 body 末尾（下一帧再试）。
          var slot = document.querySelector('[data-slot="' + DEEPY_SLOT + '"]')
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