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
        var disposeSubscribe = subscribe(function (view) {
          if (!view.ready) return
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
        }
      }, 'dsh-theme: skin injection + settings panel')
    }

    exports.apply = apply
    exports.inject = ['slots']
    return module.exports
  },
})
