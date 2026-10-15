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

    // ══════════════════════════════════════════════════════════════════════
    // M7 · Lucide 图标层
    // ──────────────────────────────────────────────────────────────────────
    // 主题 ON 时：拉 icon-map.json + lucide.json（各一次，内存缓存）→ 观察 body 子树
    // （防抖）→ 对每个 shell svg 算指纹 → 命中就给它追加一枚 Lucide <g>，并把**原有子节点
    // 留在 DOM 里**、只打一个隐藏标记；OFF 时逐条还原并断开观察器。
    //
    // 为什么原节点留在 DOM 里，而不是像「替换子节点」那样摘掉：
    // 这些 svg 是 React 拥有的。把 React 记着的子节点摘走之后，只要 React 下一次往同一
    // 父节点 insertBefore，参照节点就已经 parentNode === null → 抛 NotFoundError。
    // （M6 的「手动 appendChild 进 slot 容器」是同一类错误在另一处的表现。）
    // 所以我们只做两件 React 无感的事：① 给原节点加一个 React 不管理的 data-* 属性，
    // 靠样式表把它 display:none；② 往 svg 里**追加**我们的节点。React 手里的节点引用
    // 全部有效，DOM 结构对它仍然自洽。
    //
    // 宿主属性只动一个：viewBox 归一到 0 0 24 24（还原时按快照写回）。width/height/class
    // 一律不碰——它们决定显示尺寸，属于宿主。
    // ══════════════════════════════════════════════════════════════════════

    var ICON_MAP_URL = '/api/dsh-theme/icons/icon-map.json'
    var ICON_SET_URL = '/api/dsh-theme/icons/lucide.json'
    var ICON_STYLE_ID = 'dsh-theme-icon-style'
    var ICON_SVG_NS = 'http://www.w3.org/2000/svg'
    /** 已替换的 svg 上记「换成了哪个 Lucide 名」。React 不管理 data-*，重渲染抹不掉。 */
    var ICON_ATTR = 'data-dsh-icon'
    /** 原节点上的隐藏标记。 */
    var ICON_HIDDEN_ATTR = 'data-dsh-icon-hidden'
    /** 本插件注入的节点标记——指纹遍历必须跳过它们，否则已替换的 svg 会拿新几何去查表。 */
    var ICON_LUCIDE_ATTR = 'data-dsh-icon-lucide'
    var ICON_VIEWBOX = '0 0 24 24'
    /** 观察器去抖窗口（ms）。回调只收集候选，指纹计算与 DOM 改写都在去抖后的 flush 里。 */
    var ICON_FLUSH_MS = 60

    function iconHasOwn(object, key) {
      return Object.prototype.hasOwnProperty.call(object, key)
    }

    // ══════════════════════════════════════════════════════════════════════
    // 指纹核心 —— **唯一实现**。scripts/build-icon-map.mjs 会把标记之间的这段原文抽出来
    // 在 Node 侧执行，所以浏览器侧与构建侧不可能漂移。改动这里必须重跑构建脚本。
    // 本段必须自包含（只用全局内建），不许引用本文件其它变量。
    //
    // 口径：viewBox 规范化 + 全部几何形状的几何签名。
    //   · 属性名 camelCase → kebab（JSX 侧写 strokeWidth，DOM 侧是 stroke-width，两边归一到 kebab）
    //   · 数值与路径数据规范化（"16.0" ≡ "16"，".5" ≡ "0.5"，逗号 ≡ 空格）
    //   · 属性键排序（属性书写顺序不影响指纹）
    //   · **刻意排除** width/height/class/style/fill/stroke 等呈现属性：
    //     同一个图标在不同调用点用不同尺寸渲染时必须同指纹——这就是「同形不同尺寸的稳定性」。
    // ══════════════════════════════════════════════════════════════════════
    /* @dsh-theme-icon-core:start */
    var ICON_GEO_ATTRS = {
      path: ['d', 'fill-rule', 'clip-rule'],
      circle: ['cx', 'cy', 'r'],
      ellipse: ['cx', 'cy', 'rx', 'ry'],
      rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
      line: ['x1', 'y1', 'x2', 'y2'],
      polyline: ['points'],
      polygon: ['points'],
    }
    var ICON_NUM_ATTRS = {
      cx: 1, cy: 1, r: 1, rx: 1, ry: 1, x: 1, y: 1,
      width: 1, height: 1, x1: 1, y1: 1, x2: 1, y2: 1,
    }
    var ICON_NUM_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g

    function iconAttrName(name) {
      return String(name).replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
    }

    function iconCanonNumber(value) {
      var raw = String(value).trim()
      var n = Number(raw)
      return isFinite(n) ? String(n) : raw
    }

    function iconCanonPath(value) {
      return String(value)
        .replace(/,/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .replace(ICON_NUM_RE, function (token) {
          var n = Number(token)
          return isFinite(n) ? String(n) : token
        })
    }

    function iconCanonViewBox(viewBox) {
      if (typeof viewBox !== 'string') return null
      var parts = viewBox.trim().split(/[\s,]+/)
      if (parts.length !== 4) return null
      var out = []
      for (var i = 0; i < 4; i += 1) {
        var n = Number(parts[i])
        if (!isFinite(n)) return null
        out.push(String(n))
      }
      return out.join(' ')
    }

    function iconShapeSignature(tag, attrs) {
      var keys = ICON_GEO_ATTRS[tag]
      if (!keys) return null
      var normalized = {}
      for (var name in attrs) {
        if (!Object.prototype.hasOwnProperty.call(attrs, name)) continue
        var value = attrs[name]
        if (value === null || value === undefined || value === '') continue
        normalized[iconAttrName(name)] = String(value)
      }
      var parts = []
      for (var i = 0; i < keys.length; i += 1) {
        var key = keys[i]
        if (normalized[key] === undefined) continue
        var canonical
        if (key === 'd' || key === 'points') canonical = iconCanonPath(normalized[key])
        else if (ICON_NUM_ATTRS[key]) canonical = iconCanonNumber(normalized[key])
        else canonical = normalized[key]
        parts.push(key + '=' + canonical)
      }
      if (parts.length === 0) return null
      parts.sort()
      return tag + '(' + parts.join(',') + ')'
    }

    function iconSignatures(shapes) {
      var out = []
      if (!shapes) return out
      for (var i = 0; i < shapes.length; i += 1) {
        var shape = shapes[i]
        if (!shape) continue
        var signature = iconShapeSignature(String(shape.tag || '').toLowerCase(), shape.attrs || {})
        if (signature !== null) out.push(signature)
      }
      return out
    }

    function iconCanonical(viewBox, shapes) {
      var signatures = iconSignatures(shapes)
      if (signatures.length === 0) return null
      return 'vb:' + (iconCanonViewBox(viewBox) || '?') + '#' + signatures.join('|')
    }

    function iconGeometryCanonical(shapes) {
      var signatures = iconSignatures(shapes)
      if (signatures.length === 0) return null
      return signatures.join('|')
    }

    function iconHash32(text, seed) {
      var h = seed >>> 0
      for (var i = 0; i < text.length; i += 1) {
        h ^= text.charCodeAt(i)
        h = Math.imul(h, 16777619) >>> 0
      }
      return h >>> 0
    }

    function iconHash(text) {
      var seeds = [2166136261, 2654435761, 2246822507, 3266489909]
      var hex = ''
      for (var i = 0; i < seeds.length; i += 1) {
        hex += ('00000000' + iconHash32(text, seeds[i]).toString(16)).slice(-8)
      }
      return hex
    }

    function iconFingerprint(viewBox, shapes) {
      var canonical = iconCanonical(viewBox, shapes)
      return canonical === null ? null : iconHash(canonical)
    }

    function iconGeometryFingerprint(shapes) {
      var canonical = iconGeometryCanonical(shapes)
      return canonical === null ? null : iconHash(canonical)
    }

    var iconCore = {
      GEO_ATTRS: ICON_GEO_ATTRS,
      attrName: iconAttrName,
      canonNumber: iconCanonNumber,
      canonPath: iconCanonPath,
      canonViewBox: iconCanonViewBox,
      shapeSignature: iconShapeSignature,
      canonical: iconCanonical,
      geometryCanonical: iconGeometryCanonical,
      hash: iconHash,
      fingerprint: iconFingerprint,
      geometryFingerprint: iconGeometryFingerprint,
    }
    /* @dsh-theme-icon-core:end */

    // ── 数据加载：各一次，失败显式降级（不静默吞错） ──────────────────────
    var iconMap = null
    var iconSet = null
    var iconRequest = null
    var iconError = null

    /** 拉 icon-map.json + lucide.json 各一次并常驻内存。OFF→ON 不重拉。 */
    function loadIconData() {
      if (iconMap !== null && iconSet !== null) return Promise.resolve(true)
      if (iconRequest !== null) return iconRequest
      function getJson(url) {
        return fetch(url, { credentials: 'same-origin' }).then(function (response) {
          if (!response.ok) throw new Error('HTTP ' + response.status + ' ' + url)
          return response.json()
        })
      }
      iconRequest = Promise.all([getJson(ICON_MAP_URL), getJson(ICON_SET_URL)])
        .then(function (pair) {
          var map = pair[0]
          var set = pair[1]
          if (!map || !map.icons || !set || !set.icons) throw new Error('malformed icon payload')
          iconMap = map
          iconSet = set
          iconError = null
          return true
        })
        .catch(function (error) {
          iconRequest = null            // 允许下一次 ON 重试
          iconError = error && error.message ? error.message : String(error)
          console.error('[dsh-theme] icon data load failed:', error)
          setState({ error: 'icons-unavailable' })
          return false
        })
      return iconRequest
    }

    // ── 指纹遍历（DOM → 形状列表） ────────────────────────────────────────
    /** 几何可能藏在容器里（inventory 的形状列表也是扁平化结果），这些标签要下钻。 */
    var ICON_CONTAINER_TAGS = { g: 1, defs: 1, clippath: 1, mask: 1, symbol: 1, marker: 1, a: 1, switch: 1 }

    /**
     * 把一个 svg 的几何抽成 [{tag, attrs}]（与 inventory 的形状列表同形）。
     * 跳过本插件注入的 Lucide 节点——已替换的 svg 里它们和原节点并存。
     */
    function iconShapesFromElement(svg) {
      var out = []
      function visit(parent) {
        var kids = parent.children
        if (!kids) return
        for (var i = 0; i < kids.length; i += 1) {
          var child = kids[i]
          if (child.getAttribute && child.getAttribute(ICON_LUCIDE_ATTR) !== null) continue
          var tag = String(child.tagName || '').toLowerCase()
          if (ICON_GEO_ATTRS[tag]) {
            var attrs = {}
            var list = child.attributes || []
            for (var j = 0; j < list.length; j += 1) attrs[list[j].name] = list[j].value
            out.push({ tag: tag, attrs: attrs })
          } else if (ICON_CONTAINER_TAGS[tag]) {
            visit(child)
          }
        }
      }
      if (svg) visit(svg)
      return out
    }

    /**
     * 指纹查表。先查完整指纹（含 viewBox），未命中再退到几何指纹——
     * 后者兜住「源码里 viewBox 是表达式」与「运行时 viewBox 与抽取时不一致」两种情况；
     * 有歧义的几何指纹构建期就没收录，所以这里不会换错。
     */
    function iconLookup(svg) {
      if (iconMap === null || !svg) return { hit: false, name: null, key: null, via: null, shapes: [] }
      var shapes = iconShapesFromElement(svg)
      if (shapes.length === 0) return { hit: false, name: null, key: 'empty', via: null, shapes: shapes }
      var fp = iconFingerprint(svg.getAttribute('viewBox'), shapes)
      var full = fp === null ? null : (iconMap.icons || {})[fp]
      if (full) return { hit: true, name: full.name, key: fp, via: 'full', shapes: shapes }
      var geo = iconGeometryFingerprint(shapes)
      var relaxed = geo === null ? null : (iconMap.byGeometry || {})[geo]
      if (relaxed) return { hit: true, name: relaxed.name, key: geo, via: 'geometry', shapes: shapes }
      return { hit: false, name: null, key: fp === null ? geo : fp, via: null, shapes: shapes }
    }

    // ── 替换 / 还原（可逆对，成对写在一起） ───────────────────────────────
    /** svg → 还原快照。用 Map（不是 WeakMap）：卸载时要能遍历全部条目逐个还原。 */
    var iconRecords = new Map()
    var iconStats = { applied: 0, revisited: 0, seen: new Set(), missed: new Set(), missedSample: [] }

    /**
     * 把运行时可观测的计数挂到 documentElement 的 data-* 上（不污染 window）。
     * 未命中率是后续补映射的唯一依据——没有它，「图标没换」与「图标换了但看不出来」
     * 在验收时无法区分。属性名与既有的 data-dsh-theme 同一命名空间。
     */
    function publishIconStats() {
      try {
        var root = document.documentElement
        if (!root || typeof root.setAttribute !== 'function') return
        root.setAttribute(
          'data-dsh-icons',
          'applied=' + iconStats.applied + ';seen=' + iconStats.seen.size + ';missed=' + iconStats.missed.size,
        )
        // 未命中的指纹单独再挂一条（最多 3 个）：补映射时要用它去清单里反查是哪几个图标，
        // 只报「未命中率」而拿不到具体指纹，后续就没法把覆盖率往上推。
        if (iconStats.missedSample.length > 0) {
          root.setAttribute('data-dsh-icons-missed', iconStats.missedSample.slice(0, 3).join(','))
        } else if (typeof root.removeAttribute === 'function') {
          root.removeAttribute('data-dsh-icons-missed')
        }
      } catch (error) { /* 诊断属性写不上不影响功能 */ }
    }

    function installIconStyle() {
      if (document.getElementById(ICON_STYLE_ID)) return
      var style = document.createElement('style')
      style.id = ICON_STYLE_ID
      // 用属性选择器而不是内联 style：React 可能管理原节点的 style 属性，
      // 而 data-* 它从不管理，所以这个隐藏标记不会被重渲染抹掉。
      style.textContent = '[' + ICON_HIDDEN_ATTR + ']{display:none !important;}'
      document.head.appendChild(style)
    }

    function removeIconStyle() {
      var style = document.getElementById(ICON_STYLE_ID)
      if (style) style.remove()
    }

    /** 建一枚 Lucide <g>：根属性（fill/stroke/stroke-width…）放在 g 上，子元素按 lucide.json 原样。 */
    function buildLucideGroup(icon) {
      var group = document.createElementNS(ICON_SVG_NS, 'g')
      group.setAttribute(ICON_LUCIDE_ATTR, '')
      var rootAttrs = icon.attrs || {}
      for (var key in rootAttrs) {
        if (iconHasOwn(rootAttrs, key)) group.setAttribute(key, rootAttrs[key])
      }
      var elements = icon.elements || []
      for (var i = 0; i < elements.length; i += 1) {
        var spec = elements[i]
        var node = document.createElementNS(ICON_SVG_NS, spec.tag)
        var attrs = spec.attrs || {}
        for (var name in attrs) {
          if (iconHasOwn(attrs, name)) node.setAttribute(name, attrs[name])
        }
        group.appendChild(node)
      }
      return group
    }

    /** 把 Lucide 图标装进宿主 svg。返回是否装上。 */
    function applyIcon(svg, name) {
      if (!iconSet || !iconSet.icons || !iconSet.icons[name]) return false
      if (iconRecords.has(svg)) iconRestore(svg)
      var originals = []
      var kids = svg.children
      for (var i = 0; i < kids.length; i += 1) originals.push(kids[i])
      var previousViewBox = svg.getAttribute('viewBox')
      // 标记先打：本函数自己引发的 mutation 进观察器时，元素已带指纹，直接跳过。
      svg.setAttribute(ICON_ATTR, name)
      for (var j = 0; j < originals.length; j += 1) {
        if (originals[j].setAttribute) originals[j].setAttribute(ICON_HIDDEN_ATTR, name)
      }
      svg.setAttribute('viewBox', ICON_VIEWBOX)
      var group = buildLucideGroup(iconSet.icons[name])
      svg.appendChild(group)
      iconRecords.set(svg, {
        svg: svg,
        name: name,
        originals: originals,
        injected: [group],
        previousViewBox: previousViewBox,
        hadViewBox: previousViewBox !== null,
      })
      return true
    }

    /**
     * 还原决策。**纯函数**（只看快照，不碰 DOM），单测直接驱动它。
     * 关键点：svg 已被 React 卸载时只撤我们自己的注入，**绝不**把原节点插回去——
     * 那会造出游离 DOM（节点挂在已脱离文档的父上，谁都不会再清理它）。
     * 原节点上的隐藏标记仍然要清：标记是纯字符串，清了无害，留着反而可能让
     * 被 React 重新挂回的原节点保持隐藏。
     */
    function iconRestorePlan(record) {
      var empty = { action: 'noop', reason: 'no-record', detachInjected: [], clearMarkers: [], restoreViewBox: false }
      if (!record || !record.svg) return empty
      var svg = record.svg
      var injected = []
      var list = record.injected || []
      for (var i = 0; i < list.length; i += 1) {
        if (list[i] && list[i].parentNode === svg) injected.push(list[i])
      }
      var markers = []
      var originals = record.originals || []
      for (var j = 0; j < originals.length; j += 1) {
        if (originals[j] && typeof originals[j].removeAttribute === 'function') markers.push(originals[j])
      }
      if (svg.isConnected === false) {
        return { action: 'detach-only', reason: 'svg-detached', detachInjected: injected, clearMarkers: markers, restoreViewBox: false }
      }
      return { action: 'restore', reason: 'ok', detachInjected: injected, clearMarkers: markers, restoreViewBox: true }
    }

    /** 按快照把宿主 svg 还原成替换前的样子。幂等。 */
    function iconRestore(svg) {
      var record = iconRecords.get(svg)
      if (!record) {
        if (svg && typeof svg.removeAttribute === 'function') svg.removeAttribute(ICON_ATTR)
        return false
      }
      var plan = iconRestorePlan(record)
      for (var i = 0; i < plan.detachInjected.length; i += 1) {
        var node = plan.detachInjected[i]
        if (node.parentNode) node.parentNode.removeChild(node)
      }
      for (var j = 0; j < plan.clearMarkers.length; j += 1) {
        plan.clearMarkers[j].removeAttribute(ICON_HIDDEN_ATTR)
      }
      if (plan.restoreViewBox && record.svg && typeof record.svg.setAttribute === 'function') {
        if (record.hadViewBox) record.svg.setAttribute('viewBox', record.previousViewBox)
        else record.svg.removeAttribute('viewBox')
      }
      if (record.svg && typeof record.svg.removeAttribute === 'function') record.svg.removeAttribute(ICON_ATTR)
      iconRecords.delete(svg)
      return true
    }

    /** 快照是否仍然对应当前 DOM：注入的节点还在 svg 里就算有效。 */
    function iconRecordValid(record) {
      if (!record || !record.svg) return false
      var list = record.injected || []
      for (var i = 0; i < list.length; i += 1) {
        if (list[i].parentNode !== record.svg) return false
      }
      return true
    }

    /** 一个候选 svg 的完整处理流程（还原 → 查表 → 替换）。 */
    function processIconSvg(svg) {
      if (!svg || svg.nodeType !== 1) return
      if (String(svg.tagName || '').toLowerCase() !== 'svg') return
      if (typeof svg.getAttribute !== 'function') return
      if (svg.getAttribute(ICON_LUCIDE_ATTR) !== null) return
      var record = iconRecords.get(svg)
      if (record && !iconRecordValid(record)) {
        // 宿主重建过 DOM（React 换了子节点），旧快照作废：清掉残留标记再重来。
        iconRestore(svg)
        record = null
      }
      var lookup = iconLookup(svg)
      if (lookup.key !== null && lookup.key !== undefined) iconStats.seen.add(lookup.key)
      if (!lookup.hit) {
        if (record) iconRestore(svg)
        if (lookup.key !== null && lookup.key !== undefined) {
          iconStats.missed.add(lookup.key)
          if (iconStats.missedSample.length < 10) iconStats.missedSample.push(lookup.key)
        }
        return
      }
      if (record && record.name === lookup.name) { iconStats.revisited += 1; return }
      if (record) iconRestore(svg)
      if (applyIcon(svg, lookup.name)) iconStats.applied += 1
    }

    /** 记录清理：节点被移出文档时顺手把对应快照删掉，避免 iconRecords 无界增长。 */
    function dropIconRecordsIn(node) {
      if (!node || node.nodeType !== 1) return
      if (typeof node.tagName === 'string' && node.tagName.toLowerCase() === 'svg' && iconRecords.has(node)) {
        iconRecords.delete(node)
      }
      if (typeof node.querySelectorAll !== 'function') return
      var found = node.querySelectorAll('svg')
      for (var i = 0; i < found.length; i += 1) iconRecords.delete(found[i])
    }

    /**
     * 装上图标层。返回 { dispose }；dispose 还原全部已替换的 svg、断开观察器、撤掉样式。
     * 只在主题 ON 且数据已就绪时调用一次。
     */
    function installIcons() {
      installIconStyle()
      var pending = new Set()
      var timer = null
      var stopped = false

      function expand(node, into) {
        if (!node || node.nodeType !== 1) return
        if (typeof node.getAttribute === 'function' && node.getAttribute(ICON_LUCIDE_ATTR) !== null) return
        if (String(node.tagName || '').toLowerCase() === 'svg') { into.add(node); return }
        if (typeof node.querySelectorAll !== 'function') return
        var found = node.querySelectorAll('svg')
        for (var i = 0; i < found.length; i += 1) into.add(found[i])
      }

      function flush() {
        timer = null
        if (stopped) return
        var batch = []
        pending.forEach(function (node) { batch.push(node) })
        pending.clear()
        for (var i = 0; i < batch.length; i += 1) {
          try { processIconSvg(batch[i]) } catch (error) {
            // 单个图标失败不该连累其余，也不该刷屏
            if (!flush.warned) { flush.warned = true; console.error('[dsh-theme] icon swap failed:', error) }
          }
        }
        publishIconStats()
      }

      function schedule() {
        if (timer !== null || stopped) return
        timer = setTimeout(flush, ICON_FLUSH_MS)
      }

      var observer = null
      try {
        observer = new MutationObserver(function (mutations) {
          // 回调保持轻量：只收集候选节点 + 清理快照。指纹计算与 DOM 改写都推到去抖后的 flush。
          for (var i = 0; i < mutations.length; i += 1) {
            var added = mutations[i].addedNodes
            for (var j = 0; j < added.length; j += 1) {
              var node = added[j]
              if (node && node.nodeType === 1) pending.add(node)
            }
            var removed = mutations[i].removedNodes
            for (var k = 0; k < removed.length; k += 1) dropIconRecordsIn(removed[k])
          }
          if (pending.size) schedule()
        })
        observer.observe(document.body || document.documentElement, { childList: true, subtree: true })
      } catch (error) {
        console.error('[dsh-theme] icon observer failed:', error)
      }

      // 首轮全量：把已在文档里的 svg 一次性收进来
      try {
        var existing = document.querySelectorAll('svg')
        for (var i = 0; i < existing.length; i += 1) pending.add(existing[i])
      } catch (error) { /* 首轮扫不到就等观察器 */ }
      if (pending.size) schedule()

      return {
        dispose: function () {
          stopped = true
          if (timer !== null) { clearTimeout(timer); timer = null }
          if (observer) observer.disconnect()
          observer = null
          pending.clear()
          // 先快照再改：iconRestore 会删 Map 条目，不能边遍历边删。
          var targets = []
          iconRecords.forEach(function (record) { targets.push(record.svg) })
          for (var i = 0; i < targets.length; i += 1) {
            try { iconRestore(targets[i]) } catch (error) { console.error('[dsh-theme] icon restore failed:', error) }
          }
          iconRecords.clear()
          removeIconStyle()
          publishIconStats()
        },
        debug: {
          processNow: function (svg) { processIconSvg(svg) },
          pendingCount: function () { return pending.size },
          records: function () { return iconRecords },
        },
      }
    }

    // ══════════════════════════════════════════════════════════════════════
    // M8 · 深空编辑室钩子层
    // ──────────────────────────────────────────────────────────────────────
    // 四件事：活字生成（流态）、熄灯仪式（主题翻转擦除）、月台光晕联动、滚动浮现。
    // 全部只在主题 ON 时安装、OFF 时逐条撤净（与样式链 / Deepy / 图标层同属一个可逆对）。
    // 新 CSS 一律走 client 内联注入（同 Deepy 段惯例），数值全部 var(--dsh-*)，不手抄 hex/尺寸。
    //
    // 宿主锚点全部是**稳定的 data-* 属性**（实测自 dsh-client-ui-conversation / -chat 的源码）：
    //   [data-conversation-content]  = 会话体（消息流容器），data-content-phase = blank|active
    //   [data-conversation-scroll]   = 滚动口（IntersectionObserver 的 root）
    //   [data-chat-flow-key]         = 消息流里的一条（滚动浮现的观察单位）
    //   [data-streaming]             = 正在生成的助手 markdown 块（光标挂这里）
    // 刻意不碰 CSS-module 的哈希类名（wSkVaW_* / pXSMma_* 之类随构建变化）。
    // ══════════════════════════════════════════════════════════════════════

    var HOOK_STYLE_ID = 'dsh-theme-hooks-style'
    /** 消息流容器上的流态标记（回合结束摘除）。 */
    var STREAM_ATTR = 'data-dsh-streaming'
    /** 滚动浮现：进入视口后打上的 class。 */
    var FLOW_IN_CLASS = 'dsh-flow-in'
    /** 熄灯 overlay 的 id。CSS 与 JS 共用同一个时长常量。 */
    var WIPE_ID = 'dsh-theme-wipe'
    var WIPE_MS = 400
    /** 消息流容器 / 滚动口 / 消息项 / 流式文本块的宿主锚点。 */
    var STREAM_CONTAINER_SELECTOR = '[data-conversation-content]'
    var STREAM_SCROLL_SELECTOR = '[data-conversation-scroll]'
    var FLOW_ITEM_SELECTOR = '[data-chat-flow-key]'
    /** 编辑台状态（M8.5）：输入卡上的 data-dsh-editor="empty"|"filled"。 */
    var EDITOR_ATTR = 'data-dsh-editor'
    /** 月台联动：主位 Deepy 宿主上的 data-dsh-editing（filled 时存在）。 */
    var EDITING_ATTR = 'data-dsh-editing'
    var EDITOR_CARD_SELECTOR = '[data-composer-card]'
    /** shell 的 Lexical 可编辑根：div[contenteditable][role=textbox][data-composer-input]（读源码确认）。 */
    var EDITOR_INPUT_SELECTOR = '[data-composer-input]'
    /** hero 封面两行文案（T4 只管排版，文案在这里）。 */
    var HERO_KICKER = 'DEEP SPACE EDITING ROOM · VOL.01'
    var HERO_COLOPHON = '深空编辑室 · DSH-THEME · MMXXVI'

    // ── 纯函数（可单测；DOM 与时钟都在调用方） ────────────────────────────

    function streamInitial() {
      return { active: false, sawTurn: false, sessionId: null }
    }

    /**
     * 流态投影（纯函数）：会话事件 → 是否「正在生成」。
     * turn/start 开、turn/end 关；step/start 与 live-chunk **不改变**它
     *（同一轮内会有多次 step，拿它当回合边界会把流态切碎）。
     * sawTurn 记「本轮见过事件」，给冷启动播种用（见 streamResolve）。
     */
    function streamProject(state, entry) {
      if (!entry || !entry.event) return state
      var type = entry.event.type
      if (type === 'turn/start') return { active: true, sawTurn: true, sessionId: state.sessionId }
      if (type === 'turn/end') return { active: false, sawTurn: false, sessionId: state.sessionId }
      return state
    }

    /**
     * 从 uiSession.sessionStatus 快照推导「是否有会话在跑」（纯函数）。
     * subagent 会话不计（与 Deepy 的并发口径一致）。
     */
    function streamFromStatus(statusMap, listSnapshot) {
      if (!statusMap || typeof statusMap.forEach !== 'function') return false
      var byId = listSnapshot && listSnapshot.byId ? listSnapshot.byId : null
      var running = false
      statusMap.forEach(function (value, key) {
        if (!value || value.running !== true) return
        var row = byId ? byId[key] : undefined
        if (row && row.origin === 'subagent') return
        running = true
      })
      return running
    }

    /**
     * 流态裁决（纯函数）：事件投影是主来源，状态快照负责两个边界——
     *   ① 冷启动播种：有会话在跑、但本轮 turn/start 已经过去（插件在回合中途启用）→ 判为流态
     *   ② 权威关闸：没有任何会话在跑时不允许保持流态（兜住 turn/end 未达导致的粘死）
     */
    function streamResolve(state, running) {
      if (!running) {
        if (state.active === false && state.sawTurn === false) return state
        return { active: false, sawTurn: false, sessionId: state.sessionId }
      }
      if (state.active || state.sawTurn) return state
      return { active: true, sawTurn: false, sessionId: state.sessionId }
    }

    /**
     * 熄灯 / 开灯仪式决策（纯函数）：该不该放、往哪个方向、要不要先撤掉旧层。
     * **双向对称**（M8 裁决）：进深色 = lights-out，回浅色 = lights-on，都是「灯开关」这一个动作。
     * 防叠层不靠「记得先删」的时序，而是把「现在有没有旧层」做成入参一起裁决——
     * 主题快速连翻时，两次判定拿到的 hasOverlay 不同，结论自然不同，不会叠。
     * 方向只影响 overlay 上的 data-dsh-wipe 标记；颜色由 CSS 跟着**新**色板走
     *（--dsh-bg-base 在属性翻转后才求值，所以进深色是深幕、回浅色是浅幕，自动对称）。
     */
    function wipePlan(state) {
      var existing = state.hasOverlay === true
      if (state.dark === state.prevDark) return { play: false, reason: 'no-flip', removeExisting: false }
      // 减速偏好下不允许有任何 overlay 存在（可能是偏好刚被打开）
      if (state.reduceMotion === true) return { play: false, reason: 'reduced-motion', removeExisting: existing }
      // 真要放：先把可能在播的旧层撤掉，保证任何时刻 body 下最多一层
      return { play: true, reason: state.dark === true ? 'lights-out' : 'lights-on', removeExisting: existing }
    }

    /**
     * 编辑区文本归一（纯函数）：shell 的空输入框里可能只有 <br> 占位、零宽字符或 &nbsp;。
     * 这些都不算「有内容」。注意 <br> 的 textContent 本身就是空串，所以这里只需处理空白与零宽字符。
     */
    function editorTextOf(text) {
      return String(text === undefined || text === null ? '' : text)
        .replace(/[\u200b\u200c\u200d\ufeff\u00ad]/g, '')
        .replace(/\u00a0/g, ' ')
        .trim()
    }

    /** 编辑台状态（纯函数）：空 → 'empty'，有内容 → 'filled'。 */
    function editorStateOf(text) {
      return editorTextOf(text) === '' ? 'empty' : 'filled'
    }

    /**
     * 月台光晕档位（纯函数）：8 个显示态收敛成 4 档，CSS 只认档位。
     * idle=慢呼吸 / active=快呼吸 / error=rim 转红且不呼吸 / happy=呼吸 + 一次性涟漪。
     */
    function glowTier(state) {
      if (state === 'error') return 'error'
      if (state === 'happy') return 'happy'
      if (state === 'idle') return 'idle'
      return 'active'
    }

    // ── 安装 ──────────────────────────────────────────────────────────────

    /**
     * 装上钩子层。返回 { dispose, debug }；dispose 撤掉样式、流态标记、观察器与 overlay。
     * 只在主题 ON 时调用一次。
     */
    function installHooks(ctx) {
      var disposers = []
      var stopped = false
      var reduceMotion = false

      installHookStyle()

      // ── 1. 活字生成（流态） ─────────────────────────────────────────────
      var stream = streamInitial()
      var streamContainer = null
      var streamSubscribed = {}
      var streamRaf = null

      function streamContainerEl() {
        if (streamContainer !== null && streamContainer.isConnected) return streamContainer
        streamContainer = null
        try { streamContainer = document.querySelector(STREAM_CONTAINER_SELECTOR) } catch (error) { streamContainer = null }
        return streamContainer
      }

      /** 幂等写属性：只在值真的要变时才碰 DOM。 */
      function applyStream() {
        var el = streamContainerEl()
        if (el === null || typeof el.getAttribute !== 'function') return
        var has = el.getAttribute(STREAM_ATTR) !== null
        if (stream.active === true) {
          if (!has) el.setAttribute(STREAM_ATTR, '')
        } else if (has) {
          el.removeAttribute(STREAM_ATTR)
        }
      }

      function subscribeStreamSession(id) {
        if (streamSubscribed[id]) return
        var binding = null
        try { binding = ctx.sessions.binding(id) } catch (error) { binding = null }
        if (!binding || !binding.eventSource || typeof binding.eventSource.subscribe !== 'function') return
        var source = binding.eventSource
        var stop = source.subscribe(function () {
          var snapshot = null
          try { snapshot = source.getSnapshot() } catch (error) { return }
          if (!snapshot || !snapshot.change) return
          var change = snapshot.change
          if (change.kind === 'settle-assistant') return   // 无 entries
          var entries = change.entries
          if (!entries || !entries.length) return
          var before = stream.active
          for (var i = 0; i < entries.length; i += 1) stream = streamProject(stream, entries[i])
          if (stream.active !== before) applyStream()
        })
        if (typeof stop === 'function') streamSubscribed[id] = stop
      }

      function refreshStream() {
        var statusMap = null
        var listSnapshot = null
        try { statusMap = ctx.uiSession.sessionStatus.getSnapshot() } catch (error) { statusMap = null }
        try { listSnapshot = ctx.sessions.list.getSnapshot() } catch (error) { listSnapshot = null }
        if (statusMap && typeof statusMap.forEach === 'function') {
          statusMap.forEach(function (value, key) {
            if (value && value.running === true) subscribeStreamSession(key)
          })
        }
        var running = streamFromStatus(statusMap, listSnapshot)
        var next = streamResolve(stream, running)
        if (next !== stream) { stream = next; applyStream() }
      }

      // ── 2. 滚动浮现（IntersectionObserver） ─────────────────────────────
      var flowObserver = null
      var flowSeen = new WeakSet()
      var flowPending = []
      var flowRaf = null

      function flushFlow() {
        flowRaf = null
        var batch = flowPending
        flowPending = []
        for (var i = 0; i < batch.length; i += 1) {
          var entry = batch[i]
          if (entry.isIntersecting !== true) continue
          var node = entry.target
          // ⚠️ classList 是 DOMTokenList **对象**（typeof === 'object'），不是函数。
          // 用 typeof 判函数会把每一个真实元素都跳过——浮现 class 永远加不上（M8 实测抓到的缺陷）。
          if (!node || !node.classList || typeof node.classList.add !== 'function') continue
          node.classList.add(FLOW_IN_CLASS)
          if (flowObserver !== null) flowObserver.unobserve(node)
        }
      }

      function onFlowEntries(entries) {
        // 回调保持轻量：只入队 + 排一帧，class 写入集中在 rAF 里做（rAF 节流）
        for (var i = 0; i < entries.length; i += 1) flowPending.push(entries[i])
        if (flowRaf === null && typeof window.requestAnimationFrame === 'function') {
          flowRaf = window.requestAnimationFrame(flushFlow)
        }
      }

      function flowRoot() {
        var el = streamContainerEl()
        if (el === null) return null
        try { return el.querySelector(STREAM_SCROLL_SELECTOR) || el } catch (error) { return el }
      }

      /** 把新出现的消息项交给观察器；已观察过的不重复 observe。 */
      function observeFlows() {
        if (flowObserver === null) return
        var root = flowRoot()
        if (root === null || typeof root.querySelectorAll !== 'function') return
        var nodes
        try { nodes = root.querySelectorAll(FLOW_ITEM_SELECTOR) } catch (error) { return }
        for (var i = 0; i < nodes.length; i += 1) {
          if (flowSeen.has(nodes[i])) continue
          flowSeen.add(nodes[i])
          try { flowObserver.observe(nodes[i]) } catch (error) { /* 单个节点失败不连累其余 */ }
        }
      }

      try {
        if (typeof IntersectionObserver === 'function') {
          flowObserver = new IntersectionObserver(onFlowEntries, { root: flowRoot(), rootMargin: '0px 0px -6% 0px', threshold: 0.01 })
        }
      } catch (error) { flowObserver = null }

      // ── 3. 熄灯仪式 ─────────────────────────────────────────────────────
      var lastDark = false
      var wipeTimer = null
      var darkObserver = null

      function isDark() {
        return Boolean(document.body) && document.body.hasAttribute('data-ds-dark-theme')
      }

      function removeWipe() {
        if (wipeTimer !== null) { clearTimeout(wipeTimer); wipeTimer = null }
        var el = document.getElementById(WIPE_ID)
        if (el && el.parentNode) el.parentNode.removeChild(el)
      }

      function runWipe(direction) {
        var overlay = document.createElement('div')
        overlay.id = WIPE_ID
        overlay.setAttribute('aria-hidden', 'true')
        overlay.setAttribute('data-dsh-wipe', direction)
        document.body.appendChild(overlay)
        // 兜底移除：动画结束事件在后台标签页里可能不来，绝不让 overlay 留在屏幕上
        wipeTimer = setTimeout(function () { wipeTimer = null; removeWipe() }, WIPE_MS + 220)
      }

      function onDarkFlip() {
        var dark = isDark()
        var plan = wipePlan({
          dark: dark,
          prevDark: lastDark,
          reduceMotion: reduceMotion,
          hasOverlay: document.getElementById(WIPE_ID) !== null,
        })
        lastDark = dark
        if (plan.removeExisting) removeWipe()
        if (plan.play) runWipe(plan.reason)
      }

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

      try {
        if (document.body) {
          lastDark = isDark()          // 安装瞬间的状态是基线，不补放一次
          darkObserver = new MutationObserver(onDarkFlip)
          darkObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })
        }
      } catch (error) { console.error('[dsh-theme] dark observer failed:', error) }

      // ── 4. 编辑台状态（M8.5） ──────────────────────────────────────────
      // 在每张输入卡 [data-composer-card] 上维护 data-dsh-editor="empty"|"filled"。
      // 判定源是卡内 Lexical 可编辑根 [data-composer-input] 的文本内容；三条触发路径：
      //   ① input 事件（正常打字）② 初始读取（卡刚出现）③ MutationObserver 兜底
      //   ——shell 发送后清空输入框走的是编辑器自身的状态写回，不一定派发 input。
      var editorCards = new Set()
      var editorWired = new WeakMap()
      var editorState = 'empty'

      function editorElOf(card) {
        if (!card || typeof card.querySelector !== 'function') return null
        try { return card.querySelector(EDITOR_INPUT_SELECTOR) } catch (error) { return null }
      }

      /** 把编辑台状态同步到**月台容器**上（hero 迎宾鲸不联动——它有自己的迎宾职责）。 */
      function applyEditing() {
        var host = document.getElementById(DEEPY_ROOT_ID)
        if (!host || typeof host.getAttribute !== 'function') return
        var want = editorState === 'filled'
        var has = host.getAttribute(EDITING_ATTR) !== null
        if (want && !has) host.setAttribute(EDITING_ATTR, '')
        else if (!want && has) host.removeAttribute(EDITING_ATTR)
      }

      function recomputeEditing() {
        var filled = false
        editorCards.forEach(function (card) {
          if (card.getAttribute(EDITOR_ATTR) === 'filled') filled = true
        })
        var next = filled ? 'filled' : 'empty'
        if (next === editorState) { applyEditing(); return }
        editorState = next
        applyEditing()
      }

      function syncEditorCard(card) {
        var entry = editorWired.get(card)
        if (!entry) return
        var next = editorStateOf(entry.input ? entry.input.textContent : '')
        // 零冗余 DOM 写：值没变就不碰属性
        if (card.getAttribute(EDITOR_ATTR) !== next) card.setAttribute(EDITOR_ATTR, next)
        if (entry.state !== next) { entry.state = next; recomputeEditing() }
      }

      function wireEditorCard(card) {
        if (editorCards.has(card)) return
        var input = editorElOf(card)
        if (input === null) return      // 可编辑根还没渲染出来，等下一轮 DOM 观察重试
        var entry = { input: input, state: null, onInput: null, observer: null }
        entry.onInput = function () { syncEditorCard(card) }
        if (typeof input.addEventListener === 'function') input.addEventListener('input', entry.onInput)
        if (typeof MutationObserver === 'function') {
          try {
            entry.observer = new MutationObserver(function () { syncEditorCard(card) })
            entry.observer.observe(input, { childList: true, subtree: true, characterData: true })
          } catch (error) { entry.observer = null }
        }
        editorCards.add(card)
        editorWired.set(card, entry)
        syncEditorCard(card)
      }

      function unwireEditorCard(card) {
        var entry = editorWired.get(card)
        if (entry) {
          try { if (entry.input && entry.onInput && typeof entry.input.removeEventListener === 'function') entry.input.removeEventListener('input', entry.onInput) } catch (error) { /* 摘不掉也不阻塞 */ }
          try { if (entry.observer) entry.observer.disconnect() } catch (error) { /* 同上 */ }
          editorWired.delete(card)
        }
        editorCards.delete(card)
        if (card && typeof card.removeAttribute === 'function') card.removeAttribute(EDITOR_ATTR)
      }

      /** 扫一轮输入卡：新卡接上，被移除的卡摘干净。幂等。 */
      function scanEditors() {
        var cards = []
        try { cards = document.querySelectorAll(EDITOR_CARD_SELECTOR) } catch (error) { cards = [] }
        for (var i = 0; i < cards.length; i += 1) wireEditorCard(cards[i])
        if (editorCards.size > 0) {
          var stale = []
          editorCards.forEach(function (card) { if (card.isConnected === false) stale.push(card) })
          for (var k = 0; k < stale.length; k += 1) unwireEditorCard(stale[k])
        }
        recomputeEditing()
      }

      // ── 5. DOM 观察：会话体/消息项/输入卡出现时补挂 ──────────────────────
      var domObserver = null
      var domRaf = null

      function onDomFlush() {
        domRaf = null
        if (stopped) return
        applyStream()
        observeFlows()
        scanEditors()      // 输入卡（含 hero 态的卡）出现/消失时接上或摘掉
        applyEditing()     // 月台容器由 React 后挂，属性要在它出现后补写
      }

      try {
        if (document.body) {
          domObserver = new MutationObserver(function (records) {
            // 回调保持轻量：只判断「有没有元素被加进来」，查询与写入推到 rAF
            for (var i = 0; i < records.length; i += 1) {
              var added = records[i].addedNodes
              for (var j = 0; j < added.length; j += 1) {
                if (added[j] && added[j].nodeType === 1) {
                  if (domRaf === null && typeof window.requestAnimationFrame === 'function') {
                    domRaf = window.requestAnimationFrame(onDomFlush)
                  }
                  return
                }
              }
            }
          })
          domObserver.observe(document.body, { childList: true, subtree: true })
        }
      } catch (error) { console.error('[dsh-theme] hooks observer failed:', error) }

      // ── 订阅与首轮 ──────────────────────────────────────────────────────
      try {
        if (ctx.uiSession && ctx.uiSession.sessionStatus && typeof ctx.uiSession.sessionStatus.subscribe === 'function') {
          var stopStatus = ctx.uiSession.sessionStatus.subscribe(refreshStream)
          if (typeof stopStatus === 'function') disposers.push(stopStatus)
        }
      } catch (error) { console.error('[dsh-theme] hooks status subscribe failed:', error) }
      try {
        if (ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.subscribe === 'function') {
          var stopList = ctx.sessions.list.subscribe(refreshStream)
          if (typeof stopList === 'function') disposers.push(stopList)
        }
      } catch (error) { console.error('[dsh-theme] hooks list subscribe failed:', error) }

      refreshStream()
      applyStream()
      observeFlows()
      scanEditors()
      applyEditing()

      return {
        dispose: function () {
          stopped = true
          if (streamRaf !== null) { window.cancelAnimationFrame(streamRaf); streamRaf = null }
          if (flowRaf !== null) { window.cancelAnimationFrame(flowRaf); flowRaf = null }
          if (domRaf !== null) { window.cancelAnimationFrame(domRaf); domRaf = null }
          if (darkObserver) { darkObserver.disconnect(); darkObserver = null }
          if (domObserver) { domObserver.disconnect(); domObserver = null }
          if (flowObserver) { flowObserver.disconnect(); flowObserver = null }
          for (var i = 0; i < disposers.length; i += 1) {
            try { disposers[i]() } catch (error) { console.error('[dsh-theme] hooks dispose failed:', error) }
          }
          disposers.length = 0
          Object.keys(streamSubscribed).forEach(function (id) {
            try { streamSubscribed[id]() } catch (error) { /* 退订失败不影响卸载 */ }
          })
          streamSubscribed = {}
          removeWipe()
          // 流态标记与浮现 class 一起撤净（OFF 后不留任何本插件打上的痕迹）
          var container = streamContainer
          if (container && typeof container.removeAttribute === 'function') container.removeAttribute(STREAM_ATTR)
          try {
            var marked = document.querySelectorAll('.' + FLOW_IN_CLASS)
            for (var k = 0; k < marked.length; k += 1) marked[k].classList.remove(FLOW_IN_CLASS)
          } catch (error) { /* 清不掉也不该阻塞卸载 */ }
          streamContainer = null
          stream = streamInitial()
          // 编辑台：逐卡摘属性 + 断监听/观察器，再把月台上的联动标记清掉
          var editorTargets = []
          editorCards.forEach(function (card) { editorTargets.push(card) })
          for (var t = 0; t < editorTargets.length; t += 1) {
            try { unwireEditorCard(editorTargets[t]) } catch (error) { console.error('[dsh-theme] editor unwire failed:', error) }
          }
          editorCards.clear()
          editorState = 'empty'
          var deepyHost = document.getElementById(DEEPY_ROOT_ID)
          if (deepyHost && typeof deepyHost.removeAttribute === 'function') deepyHost.removeAttribute(EDITING_ATTR)
          removeHookStyle()
        },
        debug: {
          getStream: function () { return { active: stream.active, sawTurn: stream.sawTurn } },
          getContainer: function () { return streamContainerEl() },
          isStreaming: function () {
            var el = streamContainerEl()
            return el !== null && typeof el.getAttribute === 'function' && el.getAttribute(STREAM_ATTR) !== null
          },
          getWipe: function () { return document.getElementById(WIPE_ID) },
          isReducedMotion: function () { return reduceMotion },
          triggerDarkFlip: function () { onDarkFlip() },
          flushFlows: function () { flushFlow() },
          getEditorState: function () { return editorState },
          getCardState: function (card) { return card ? card.getAttribute(EDITOR_ATTR) : null },
          isEditing: function () {
            var host = document.getElementById(DEEPY_ROOT_ID)
            return Boolean(host) && typeof host.getAttribute === 'function' && host.getAttribute(EDITING_ATTR) !== null
          },
          scanEditors: function () { scanEditors() },
        },
      }
    }

    function installHookStyle() {
      if (document.getElementById(HOOK_STYLE_ID)) return
      var style = document.createElement('style')
      style.id = HOOK_STYLE_ID
      var stagger = 'var(--dsh-stagger,60ms)'
      var ease = 'var(--dsh-ease-out,cubic-bezier(.22,.61,.36,1))'
      var motion = 'var(--dsh-motion-base,260ms)'
      var rules = [
        // ── 活字生成：段落渐次浮现 ──
        '@keyframes dsh-theme-para-in{from{opacity:0;transform:translateY(var(--dsh-space-1,4px))}to{opacity:1;transform:none}}',
        '[data-dsh-streaming] [data-streaming]>*>*{animation:dsh-theme-para-in ' + motion + ' ' + ease + ' both}',
      ]
      for (var i = 1; i <= 6; i += 1) {
        rules.push('[data-dsh-streaming] [data-streaming]>*>*:nth-child(' + i + '){animation-delay:calc(' + stagger + ' * ' + (i - 1) + ')}')
      }
      rules.push('[data-dsh-streaming] [data-streaming]>*>*:nth-child(n+7){animation-delay:calc(' + stagger + ' * 6)}')
      rules.push(
        // ── 正在生成的最后一块末尾：朱砂方块光标呼吸 ──
        '@keyframes dsh-theme-caret{0%,100%{opacity:1}50%{opacity:.15}}',
        '[data-dsh-streaming] [data-streaming]>*>*:last-child:not(pre):not(table)::after{content:"";display:inline-block;width:.5em;height:.95em;margin-left:.18em;vertical-align:-.12em;background:var(--dsh-accent);animation:dsh-theme-caret 1.1s var(--dsh-ease-inout,ease-in-out) infinite}',
        // ── 滚动浮现 ──
        '@keyframes dsh-theme-flow-in{from{opacity:0;transform:translateY(var(--dsh-space-2,8px))}to{opacity:1;transform:none}}',
        '.' + FLOW_IN_CLASS + '{animation:dsh-theme-flow-in var(--dsh-motion-slow,420ms) ' + ease + ' both}',
        // ── 熄灯仪式：从视口中心扩散的圆形擦除 ──
        '@keyframes dsh-theme-wipe{0%{clip-path:circle(0% at 50% 50%);opacity:1}70%{clip-path:circle(142% at 50% 50%);opacity:1}100%{clip-path:circle(142% at 50% 50%);opacity:0}}',
        '#' + WIPE_ID + '{position:fixed;inset:0;z-index:2147483000;pointer-events:none;' +
          'background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--dsh-accent) 14%,var(--dsh-bg-base)) 0%,var(--dsh-bg-base) 62%);' +
          'animation:dsh-theme-wipe ' + WIPE_MS + 'ms var(--dsh-ease-inout,ease-in-out) both}',
        // hero 封面的结构规则在 Deepy 样式表里（它属于迎宾位子系统，且与精灵同生共死）。
        // ── 减速偏好：动效全关（擦除直接不放，由 wipePlan 决定；这里再兜一层） ──
        '@media (prefers-reduced-motion: reduce){[data-dsh-streaming] [data-streaming]>*>*,' + '.' + FLOW_IN_CLASS + '{animation:none !important}#' + WIPE_ID + '{display:none}}',
      )
      style.textContent = rules.join('')
      document.head.appendChild(style)
    }

    function removeHookStyle() {
      var style = document.getElementById(HOOK_STYLE_ID)
      if (style) style.remove()
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

    /** 8 个**事件驱动的 base 态**。其余 12 态留二期。 */
    var DEEPY_STATES = ['idle', 'thinking', 'typing', 'happy', 'error', 'notification', 'music', 'building']
    /**
     * 抬头态（M9）：编辑区有内容时 idle 抬到它（仰望/张望）。
     * 它是**投影出来的**显示态，不是事件驱动的 base 态，所以刻意不进 DEEPY_STATES
     *（那一份的语义是「状态机可以停在哪些档」，加进来会污染状态机契约）。
     * 素材由 build-deepy.mjs 从 E:/dsh-ui 的 idle-look.png 产出（72 格 / 68 帧，行尾 4 格 padding）。
     */
    var DEEPY_LOOK_STATE = 'idle-look'
    /** 瞬时态时长（ms）。渲染时比较时刻，不用 setTimeout。 */
    var DEEPY_HOLD_MS = { happy: 5200, error: 4800, notification: 3200 }
    var DEEPY_MANIFEST_URL = '/api/dsh-theme/deepy/deepy.json'
    var DEEPY_ASSET_BASE = '/api/dsh-theme/deepy/'
    var DEEPY_ROOT_ID = 'dsh-theme-deepy'
    var DEEPY_STYLE_ID = 'dsh-theme-deepy-style'
    var DEEPY_SLOT = 'conversation.input.left'
    /**
     * 空会话 hero 迎宾位（M7）。shell 侧只在空会话渲染这个 slot
     * （dsh-client-ui-conversation/lib/client.js:16016 的渲染条件），会话激活后自然消失，
     * 所以不需要额外的显隐逻辑——但卸载路径仍要覆盖（slot disposer + 引用清空）。
     */
    var DEEPY_HERO_SLOT = 'conversation.hero.brand.mark'
    var DEEPY_HERO_ID = 'dsh-theme-deepy-hero'
    /**
     * 排队停靠面板的查找口径（M10.1）：`[data-queue-dock]` 是 QueueDock 组件写死的属性
     *（不是 CSS module 的 hash 类名）。两条按顺序试——第二条吃下 SlotOutlet 的
     * `display:contents` 包裹层（读 shell 源码：槽位渲的是带 data-slot 的 div）。
     */
    var DEEPY_DOCK_SELECTORS = [
      ':scope > [data-queue-dock]',
      ':scope > * > [data-queue-dock]',
    ]
    /**
     * 主位（输入卡右上缘）显示倍率：素材帧 64px → 显示 96px（1.5×）。
     * 放大只发生在**渲染端**：manifest.displayPx 与源 PNG 仍是 64px（生成物不动），
     * 帧几何（width/height/background-size/background-position）由 deepyFrameGeometry
     * 用**同一个** px 一次算齐——只改宿主 CSS 尺寸会让偏移量与格子宽对不上，
     * 画面就切到雪碧图的错误区域（M7 hero 踩过这个坑）。
     */
    var DEEPY_MAIN_SCALE = 1.5
    /**
     * hero 迎宾位比主位大一号（空会话时它是视觉主角之一）。
     * **刻意不复用 DEEPY_MAIN_SCALE**：hero 走自己那条既有路径（displayPx × 1.6 = 102px），
     * 主位放大到 1.5× 不会把它连带推大——两个倍率分开，这件事就结构上不可能发生。
     */
    var DEEPY_HERO_SCALE = 1.6

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
     * 帧序号 → 精灵几何。纯函数，单测覆盖两条红线：
     *   ① 元素宽度必须 === displayPx（否则相邻帧泄入；typing/building 有 48/48 帧触格边）
     *   ② 取模必须用**该态真实帧数**（happy 52 帧有行尾 padding，按 8×rows 取模会显示 padding 帧）
     * @param frame - 当前帧序号（可为任意整数）
     * @param meta - manifest.states[<state>]，需 {frames, rows}
     * @param manifest - manifest 根，需 {cols, displayPx}
     * @param px - 本位的显示尺寸；省略则用 manifest.displayPx（主位）。
     *   hero 迎宾位是放大渲染，**取帧窗口必须整体按本位尺寸重算**——
     *   曾经这里只按 displayPx 算 backgroundPosition、调用方又按自己的 px 算 backgroundSize，
     *   结果 hero 拿到的偏移量小了一档，画面切到雪碧图的错误区域（M7 实测缺陷）。
     * @returns {index, col, row, width, height, backgroundSize, backgroundPosition}
     */
    function deepyFrameGeometry(frame, meta, manifest, px) {
      var cols = manifest.cols
      var size = px === undefined ? manifest.displayPx : px
      var total = meta.frames
      var index = total > 0 ? ((frame % total) + total) % total : 0
      var col = index % cols
      var row = Math.floor(index / cols)
      return {
        index: index,
        col: col,
        row: row,
        width: size + 'px',
        height: size + 'px',
        backgroundSize: (cols * size) + 'px ' + (meta.rows * size) + 'px',
        backgroundPosition: (-col * size) + 'px ' + (-row * size) + 'px',
      }
    }

    /**
     * 主位显示尺寸（纯函数）：素材帧宽 × 主位倍率 → 96px。
     * 96 是**派生出来的显示尺寸**，不是素材字段；manifest.displayPx 保持 64。
     * 抽成函数是为了让「宿主尺寸 / sheet 尺寸 / 帧偏移」三处只有一个来源。
     */
    function deepyMainPx(manifest) {
      return Math.round(manifest.displayPx * DEEPY_MAIN_SCALE)
    }

    /**
     * hero 迎宾位显示尺寸（纯函数）：素材帧宽 × 1.6 → 102px。
     * 与 deepyMainPx **没有任何共用来源**——主位改倍率不会动到 hero。
     */
    function deepyHeroPx(manifest) {
      return Math.round(manifest.displayPx * DEEPY_HERO_SCALE)
    }

    /**
     * 主位栖木的「整块顶缘」修正（M10.1）：输入块的**可视顶边并不永远是卡片自己的上缘**。
     *
     * 排队消息停靠（shell 的 QueueDock，`[data-queue-dock]`）出现时，它的面板贴在卡片
     * 上缘并与之融合——圆角只留上半、无下边框、负 margin 咬合，读起来就是同一块。
     * 鲸鱼仍按卡片锚定，就会**趴在这块停靠面板上**：2026-10-15 用户截图实证，它盖住了
     * 行右侧的删除 / 插话按钮（只剩编辑按钮露在外面）。
     *
     * 返回抬升量 = 卡片顶 − 停靠面板顶（面板不存在 / 量不到 → 0，退回原行为）。
     * 纯函数：只吃两个矩形顶边，便于单测。
     */
    function deepyPerchLift(cardTop, dockTop) {
      if (typeof cardTop !== 'number' || typeof dockTop !== 'number') return 0
      if (!isFinite(cardTop) || !isFinite(dockTop)) return 0
      var lift = cardTop - dockTop
      return lift > 0 ? lift : 0
    }

    /**
     * 找主位所在输入块里的排队停靠面板：`[data-queue-dock]` 是 shell 的**稳定锚点**
     *（QueueDock 组件写死的属性，不是 CSS module 的 hash 类名，不会随版本漂移）。
     *
     * 位置（读 shell 源码确认）：`composerStack` 的 children = [hero…, renderSlot(
     * "conversation.input.dock"), inputBar]，即面板与卡片同属一个栈、且在卡片**之前**。
     * 但槽位是 SlotOutlet 渲的 `display:contents` 包裹层，面板不一定是栈的直接子节点，
     * 所以逐级向上找 1–3 层、每层按 DEEPY_DOCK_SELECTORS 试两级——停在**最近的**一层，
     * 不会误取另一个会话 root 的停靠面板。
     * 环境缺 API（单测的 DOM 桩）或链路上没有带 querySelector 的父节点 → null。
     */
    function deepyDockFor(card) {
      var node = card
      for (var i = 0; i < 3 && node; i += 1) {
        var parent = node.parentElement
        if (!parent || typeof parent.querySelector !== 'function') return null
        for (var s = 0; s < DEEPY_DOCK_SELECTORS.length; s += 1) {
          var dock = null
          try { dock = parent.querySelector(DEEPY_DOCK_SELECTORS[s]) } catch (error) { dock = null }
          if (dock) return dock
        }
        node = parent
      }
      return null
    }

    /**
     * 活跃工具数 → 持久态。**唯一**的档位映射，tool/call 与 tool/result 共用，
     * 保证「档位始终反映当前活跃工具数」而不是某个事件的固定收敛值（R3 修正）。
     * 0→thinking / 1→typing / 2→music / ≥3→building
     */
    function deepyToolState(count) {
      if (count >= 3) return 'building'
      if (count === 2) return 'music'
      if (count === 1) return 'typing'
      return 'thinking'
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
      /**
       * 设定持久态：只换 base，**不动**正在显示的瞬时态。
       *
       * ⚠️ 契约变更（2026-10-11，见回报「新规则 vs 原规则」）：
       * 原规则（作者 HTML 的 P3）是「持久态夺回显示、清掉瞬时态」。那套状态机是
       * 单机演示，没有 DSH 这种「工具失败后紧接着 turn 结束」的事件流 —— 实测中
       * 用户点「停止生成」会连发 tool/result(isError) 与 turn/end(aborted)，error
       * 只活 10–270ms，规范给的 4800ms hold 完全失效。
       * 现在：瞬时态在自己的 hold 窗口内保持可见，只有 beginRound() 才清它；
       * 到期后 deepyResolve 回落到**此刻的 base**（也就是「当时真实的档位」）。
       */
      function persistent(name) {
        next.base = name
      }
      /**
       * 新一轮开始：换 base 且**清除**瞬时态。
       * 只有 turn/start 用这个 —— 它是「用户又发起了一轮」的明确信号，
       * 此时上一轮的 happy/error/notification 不该再压着新工作。
       */
      function beginRound(name) {
        next.base = name
        next.transient = null
        next.until = 0
      }

      if (type === 'turn/start') {
        beginRound('thinking')
        return next
      }
      // step/start 是同一轮内的下一次模型调用（可能紧随工具失败），
      // 按契约只换 base、不清瞬时态 —— error 让它在自己的窗口里显示完。
      if (type === 'step/start') {
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
        persistent(deepyToolState(next.activeTools.length))
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
        // R3 修正：档位始终反映**剩余**活跃工具数，不由本事件固定收敛。
        var remainingState = deepyToolState(next.activeTools.length)
        if (failed) {
          // 失败：显示 error 瞬时态；base 同步记下「此刻还剩几个工具」的档位，
          // 这样 4800ms 到期后回落到当时的真实档位，而不是固定回 thinking/idle。
          next.base = remainingState
          transient('error')
          return next
        }
        persistent(remainingState)
        return next
      }

      if (type === 'turn/end') {
        var kind = data.reason && typeof data.reason === 'object' ? data.reason.kind : data.reason
        /**
         * 回合结束 = 焦点会话**不再生成** → base 一律归 idle（这才是「此刻真实的档位」）。
         *
         * ⚠️ 契约补齐（2026-10-13，实机缺陷「填写态卡 typing、idle-look 不出」）：
         * 原来只有 else 分支（aborted / forked / 未知 kind）落 idle，completed / error /
         * max-tokens / interrupted / blocked 五类都**保留了上一档工作态**（typing / thinking /
         * building / music）。happy 窗口（5200ms）过期后 deepyResolve 回落到 base='typing'，
         * 而抬头投影只把 **idle** 抬成 idle-look —— 于是「一轮跑完、用户还在填写」时
         * 精灵永远停在 typing，idle-look 永不出。
         * 实机证据：.dsh-tmp/v3-integration/main-report.json「真实填写抬头」failed
         *（宿主 data-dsh-deepy-state="typing" 与 data-dsh-editing 同时存在，sprite=typing.png）。
         *
         * **不动瞬时态**：happy / error / notification 仍照旧赋值、仍在自己 hold 窗口内压着显示。
         * 这里连 persistent() 都没用（直接落 base），所以「persistent 只换 base、不清瞬时态」
         * 那条铁律不受影响 —— 回合结束时用户该看到的仍是 happy / error 终态。
         */
        next.base = 'idle'
        if (kind === 'completed') transient('happy')
        else if (kind === 'error' || kind === 'max-tokens' || kind === 'interrupted') transient('error')
        else if (kind === 'blocked') transient('notification')
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

    /**
     * 抬头投影（纯函数，M9「鲸鱼陪你写」）：编辑区有内容时，**空闲档**从 idle 抬到 idle-look。
     * 只动空闲档，理由：
     *   · thinking / typing / building / music 是工作档——正在干活时不该东张西望；
     *   · happy / error / notification 是瞬时态——更不该被「你在打字」顶掉。
     * 所以投影发生在显示态的最外层，且只认 idle 这一个输入。
     * @param display - deepyDisplayState 的结果（可能为 null）
     * @param editing - 编辑区是否 filled
     * @returns 最终要渲染的态
     */
    function deepyLookUp(display, editing) {
      if (editing !== true) return display
      return display === 'idle' ? DEEPY_LOOK_STATE : display
    }

    /**
     * 显示态的**唯一**组合入口（纯函数）：焦点会话态 → 跨会话档位 → 抬头投影。
     * 渲染循环只调它，单测也直接驱动它，避免「测的组合和跑的组合不是一条」。
     */
    function deepyDisplayWithLook(state, now, concurrency, editing) {
      var display = deepyDisplayState(state, now, concurrency)
      if (!display) display = 'idle'
      return deepyLookUp(display, editing)
    }

    /**
     * 单鲸规则（M7 裁决 3）：**一屏一只鲸**。
     * hero 迎宾位在场时空会话里已经有了一只大鲸，输入卡左侧的主位就静默（不渲染）；
     * hero 消失（会话激活，slot 不再渲染）后主位自动回来。
     * 抽成纯函数是为了能直接单测——这是「两个 Deepy 同时出现」这个可见问题的唯一开关。
     */
    function deepyMainVisible(ready, heroPresent) {
      return ready === true && heroPresent !== true
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
      // Route A：DOM 由 slot 的 React 组件拥有。我们只在渲染时从 ref 拿到
      // sprite 节点往它身上写 style —— 不再手动 appendChild 进 React 容器
      //（切会话时 React 会清掉它不认识的子节点，旧写法因此永久失效）。
      var spriteEl = null
      // hero 迎宾位：**不用 ref**，按 id 惰性查找。理由是可测性——测试桩里 slot 注册是
      // 全局单值的，多注册一个带 ref 的组件会顶掉主位那条 ref 路径（M6 回归测试正是靠
      // 「最后一个 ref 回调 = 主位精灵」来驱动挂载/卸载的）。节点仍由 React 渲染，
      // 我们只读它——没有任何 appendChild 进 slot 容器。
      var heroSpriteEl = null
      var heroFrameIndex = 0
      var heroLastFrameAt = 0
      // hero 迎宾位是否在场（由每帧的 DOM 探测得出，不依赖 React 生命周期回调——
      // 那些回调在测试桩里不会按真实时序触发，靠它们会让「单鲸」变成不可测的隐式状态）。
      var heroPresent = false
      // 底座状态：跟当前显示态走，状态变了才 bumpView（避免每帧 setState）。
      var baseState = 'idle'
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
        // 尺寸一律由 JS 用帧几何（deepyMainPx / deepyHeroPx）写成内联样式，这里只放不依赖尺寸的规则。
        // ── 两条互不相干的视觉路线（M10 拆分）───────────────────────────────
        // 主位（输入卡右上缘）：**一只裸鲸**。没有月台底座、没有 rim、没有辉光、没有涟漪——
        //   那一套是「飞碟」语言，贴在输入卡上读起来像装饰品而不是陪伴
        //（design/composer-v3.html 里主位就是一只裸鲸）。
        // hero 迎宾位：保留月台底座（墨色圆盘 + 极细朱砂 rim + 呼吸辉光）——它是空会话的视觉主角，
        //   底座让它读成「桌沿的一个平台」。
        // 两条路线的尺寸也各自独立：主位 96px（displayPx × 1.5）/ hero 102px（displayPx × 1.6）。
        // 数值全部走 var(--dsh-*)（theme.css 已发射全套 token）；每个 var() 仍带一个回退值——
        // 主题 OFF 或皮肤未注入时变量不存在，没有回退就会退化成一个「没有来处的黑圆」。
        style.textContent = [
          // ── 主位：贴输入卡右上角（M9，用户拍板的位置）──
          // 从「工具条里的零件」改成「贴卡片右上角、上半身探出卡缘」：DOM 不动（仍在
          // conversation.input.left slot 里），只动视觉定位。
          // 为什么是右上角而不是下缘：底缘会压到桌面端的状态栏统计条；右上角是天然空白区。
          //
          // **必须 position:absolute 脱流**（M9 实测缺陷）：relative 会**保留原占位盒**，
          // 64px 的鲸鱼把 tools 行撑到 78px，按钮上方留出一块空白。absolute 不参与布局，
          // 行高回到纯内容驱动。
          //
          // 锚点 = [data-composer-card]（读 shell 源码确认，不需要我们补任何规则）：
          //   · .uV2eYG_card{...display:flex;position:relative} —— 卡片自己就是定位上下文；
          //   · 中间的 slot 容器是 SlotOutlet 渲染的 <div data-slot=… style="display:contents">，
          //     display:contents **不生成盒子**，不可能成为包含块；
          //   · tools 行本身未定位（InputBar 模块里只有 card / overlayAnchor / grow / placeholder 是 positioned）。
          //   ⇒ 最近的定位祖先就是卡片，top/right 直接量到卡片的右上角。
          // absolute 不会把本元素变成 fixed 后代的包含块，AGENTS.md「包含块红线」不破
          //（这也是继续不用 transform 的原因，测试里有断言守着）。
          //
          // 三个局部变量供实机调留位：--deepy-perch（向上探出多少）、--deepy-perch-right（离右缘多少）、
          // --deepy-perch-lift（**由播放器写**：让栖木跟住整块的顶缘，默认 0px = 不抬）。
          // 默认起点 = design/composer-v3.html 那组再上移一个 space-1：
          //   top   calc(var(--dsh-space-7,40px) * -2 - var(--dsh-space-1,4px)) = -84px
          //         （原型是 -80px；实机量到像素 alpha union 的鲸鱼底缘比正文上缘侵入 1px，
          //           整体上移 4px 留出呼吸。96px 几何与 right 都不动。）
          //   right var(--dsh-space-4,16px)                                     =  16px
          // 前两个是**起点值不是冻结值**：实机看着调，覆盖这两个变量即可，不用改这里。
          // 第三个是行为口子：排队停靠面板（QueueDock）把整块的可视顶边抬高时，播放器按
          // 「卡片顶 − 面板顶」把整只鲸鱼一起抬上去——见 deepyPerchLift 的注释。
          // **卡片 overflow:visible 由 T4 的 grid 重构保证**——这是我俩的共同契约。
          '#' + DEEPY_ROOT_ID + '{position:absolute;top:calc(var(--deepy-perch,calc(var(--dsh-space-7,40px) * -2 - var(--dsh-space-1,4px))) - var(--deepy-perch-lift,0px));right:var(--deepy-perch-right,var(--dsh-space-4,16px));z-index:4;display:inline-flex;align-items:flex-end;justify-content:center;pointer-events:none;user-select:none;}',
          // ── hero 迎宾位：**垂直堆叠的独立块级容器**（刊号 / 鲸+月台 / 版记 三层）──
          // 为什么必须是纵向块级，而不是绝对定位的浮层：
          // 宿主在 span.HeroShell.fishHitbox 里，而 fishHitbox 与 shell 大标题同处
          // div.HeroShell.headline 这**一个 flex 行**。浮层方案会把刊号/版记压在标题上
          // （M8 实测缺陷，截图 .agents/shots/m8-cover-light.png）。
          // 变成占据自身垂直空间的列容器后，标题自然排到旁边或折到下一行，绝不同线盒重叠。
          '#' + DEEPY_HERO_ID + '{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;flex:0 0 auto;pointer-events:none;user-select:none;}',
          // 以下三条只给**结构**，排版归 T4；能包 :where() 的都包上（零特异度 → T4 无条件覆盖）。
          ':where(.dsh-hero-cover){display:flex;flex-direction:column;align-items:center;gap:var(--dsh-space-1,4px);}',
          // stage 是月台的定位上下文，**刻意不用 :where()**：它被覆盖掉，底座就会锚到别处。
          '.dsh-hero-stage{position:relative;display:inline-flex;align-items:flex-end;justify-content:center;}',
          ':where(.dsh-hero-kicker),:where(.dsh-hero-colophon){white-space:nowrap;pointer-events:none;}',
          '.dsh-theme-deepy-sprite{position:relative;background-repeat:no-repeat;background-position:0 0;}',
          // 主位像素鲸：96 / 64 = 1.5× 是**非整数**放大，必须显式选渲染模式。
          // 取 design/composer-v3.html 的做法（image-rendering:pixelated）——像素鲸的观感靠硬边，
          // 默认的平滑插值会把它糊成一团。**只作用于主位**：hero 那条既有路径一个字节都不动。
          '#' + DEEPY_ROOT_ID + ' .dsh-theme-deepy-sprite{image-rendering:pixelated;}',
          // 月台底座（**只归 hero 迎宾位**；主位已去底座）：更宽、更扁（scaleY 压扁成透视椭圆），
          // 一道朱砂高光当「桌沿反光」，让它读起来是**桌沿的一个平台**而不是贴片。
          // 反光方向跟位置走：鲸鱼贴在**上缘**、从上往下挂，所以受光面在**下侧**
          //（linear-gradient 用 to top，高光落在底缘；之前趴下缘时是 to bottom）。
          '.dsh-theme-deepy-base{position:absolute;left:50%;bottom:-8%;transform:translateX(-50%) scaleY(.82);width:128%;padding-bottom:26%;border-radius:50%;background:linear-gradient(to top,color-mix(in srgb,var(--dsh-accent) 16%,transparent) 0%,transparent 58%),radial-gradient(ellipse at 50% 56%,rgba(6,7,10,.96) 0%,rgba(6,7,10,.6) 60%,rgba(6,7,10,0) 100%);box-shadow:0 0 0 1px var(--dsh-rule-accent,var(--dsh-accent-glow,rgba(210,62,12,.55))),0 0 12px 0 var(--dsh-accent-glow,rgba(210,62,12,.22));opacity:.9;}',
          '.dsh-theme-deepy-base--hero{width:110%;padding-bottom:32%;}',
          '@keyframes dsh-theme-deepy-breathe{0%,100%{opacity:.74;box-shadow:0 0 0 1px var(--dsh-rule-accent,rgba(210,62,12,.55)),0 0 8px 0 var(--dsh-accent-glow,rgba(210,62,12,.18));}50%{opacity:1;box-shadow:0 0 0 1px var(--dsh-accent,rgba(210,62,12,.9)),0 0 18px 2px var(--dsh-accent-glow,rgba(210,62,12,.34));}}',
          // 主位不再有辉光档位规则（M10 去底座）：hero 只认它自己这一条 5.2s 呼吸。
          '.dsh-theme-deepy-base--hero{animation:dsh-theme-deepy-breathe 5200ms var(--dsh-ease-inout,ease-in-out) infinite;}',
          // 主位的「专注档」rim（::after）与 happy 一次性涟漪随底座一起去掉（M10）。
          // 编辑区 filled 的反馈改由**抬头态**（idle-look）承担——鲸鱼抬头看你写，
          // 比一圈无来处的光更符合「轻陪伴」，也不再需要跟呼吸动画抢 box-shadow。
          '@media (prefers-reduced-motion: reduce){.dsh-theme-deepy-base{animation:none !important;}}',
        ].join('')
        document.head.appendChild(style)
      }

      function removeStyle() {
        var style = document.getElementById(DEEPY_STYLE_ID)
        if (style) style.remove()
      }

      // ── DOM：由 slot 的 React 组件拥有（Route A） ─────────────────────
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
        // 单鲸规则：hero 迎宾位在场时主位静默（一屏一只鲸）
        if (!deepyMainVisible(viewReady, heroPresent)) return null
        // 主位是**一只裸鲸**（M10）：只有精灵节点，没有月台底座 / rim / 辉光 / 涟漪。
        // 连创建都不做 —— 卸载时自然也不会留下残留节点（比 display:none 假去除干净）。
        // data-dsh-deepy-state 保留：它是宿主的状态契约，主位样式与外部 CSS 都认它。
        return react.createElement(
          'span',
          { id: DEEPY_ROOT_ID, 'data-dsh-part': 'deepy', 'data-dsh-deepy-state': baseState },
          react.createElement(DeepySprite)
        )
      }

      /**
       * 空会话 hero 迎宾位：一枚略大的 idle 呼吸 Deepy。
       * 只经 slot 的 React 渲染注入（createElement），**不 appendChild 进 slot 容器**。
       * 会话激活后 shell 不再渲染这个 slot，节点随之卸载；我们不持有它的所有权，
       * 每帧按 id 惰性取节点、取不到就不画（与主位同一条「自愈」策略）。
       */
      function DeepyHero() {
        var tick0 = react.useState(0)
        var rerender = tick0[1]
        react.useEffect(function () {
          return subscribeView(function () { rerender(function (n) { return n + 1 }) })
        }, [])
        // 封面两行**不依赖素材就绪**：精灵还没解码出来时，刊号/版记照常渲染。
        // 反过来把封面塞进 viewReady 分支，会让「素材慢一拍」表现为「整个封面缺席」。
        return react.createElement(
          'span',
          { id: DEEPY_HERO_ID, 'data-dsh-part': 'deepy-hero', 'data-dsh-deepy-state': 'idle', 'data-dsh-glow': 'idle' },
          react.createElement(
            'span',
            { className: 'dsh-hero-cover' },
            react.createElement('span', { className: 'dsh-hero-kicker' }, HERO_KICKER),
            // 鲸 + 月台裹在一层 stage 里：底座 position:absolute 需要一个**只包住精灵**的
            // 定位上下文，否则会锚到整列容器底部、跑到版记下面去。
            react.createElement(
              'span',
              { className: 'dsh-hero-stage' },
              viewReady
                ? react.createElement('span', { className: 'dsh-theme-deepy-base dsh-theme-deepy-base--hero', 'aria-hidden': 'true' })
                : null,
              viewReady ? react.createElement('span', { className: 'dsh-theme-deepy-sprite' }) : null
            ),
            react.createElement('span', { className: 'dsh-hero-colophon' }, HERO_COLOPHON)
          )
        )
      }

      /**
       * 编辑区是否正在输入：读月台宿主上的 data-dsh-editing 标记（由 M8.5 钩子层写）。
       * 走 DOM 读而不是共享 store，是为了让「状态机」与「钩子层」互不依赖——
       * 两边唯一的契约就是这个属性名，谁先装谁后装都不影响。
       */
      function deepyEditingNow() {
        var host = document.getElementById(DEEPY_ROOT_ID)
        return Boolean(host) && typeof host.hasAttribute === 'function' && host.hasAttribute(EDITING_ATTR)
      }

      /** 惰性取 hero 精灵节点：React 卸载/重建后自动失效重取。 */
      function heroElement() {
        if (heroSpriteEl !== null && heroSpriteEl.isConnected) return heroSpriteEl
        heroSpriteEl = null
        try {
          var host = document.getElementById(DEEPY_HERO_ID)
          if (!host || typeof host.querySelector !== 'function') return null
          heroSpriteEl = host.querySelector('.dsh-theme-deepy-sprite')
        } catch (error) { /* 取不到就等下一帧 */ }
        return heroSpriteEl
      }

      /**
       * 按 manifest 把某态某帧画到精灵上。
       * 元素宽度必须 === displayPx，否则相邻帧会泄入（typing/building 有 48/48 帧触格边）。
       * spriteEl 由 React ref 维护；节点被 React 换掉后这里读到的是新节点。
       */
      function paintInto(target, name, frame, manifest, px) {
        var meta = manifest.states[name]
        if (!meta) return false
        var image = deepyImages[name]
        if (!image) return false
        // 节点还没挂上（React 尚未渲染 / 刚被换掉）→ 本帧不画，下一帧重试。
        if (!target || !target.isConnected) return false
        // 取帧窗口整体按本位的 px 算（width/height/background-size/background-position 同源）。
        var g = deepyFrameGeometry(frame, meta, manifest, px)
        target.style.width = g.width            // ← 必须 = 该位的显示尺寸（防相邻帧泄入）
        target.style.height = g.height
        target.style.backgroundImage = 'url("' + image.src + '")'
        target.style.backgroundSize = g.backgroundSize
        target.style.backgroundPosition = g.backgroundPosition
        return true
      }

      /**
       * 主位（输入卡右上缘）画：显示尺寸 = deepyMainPx(manifest)（96px）。
       * **不能**只改宿主 CSS 尺寸——帧偏移与 sheet 尺寸必须跟着同一个 px 走，
       * 否则会切到雪碧图的错误区域（M7 hero 踩过的同一个坑）。
       */
      function paint(name, frame, manifest) {
        return paintInto(spriteEl, name, frame, manifest, deepyMainPx(manifest))
      }

      // ── 栖木跟随（M10.1）：停靠面板的出现 / 高度变化都是低频事件，粗测（200ms）足够。
      // 每帧量两个矩形会强制同步布局，为一条低频几何白付每帧的代价，不值得。
      // 量到之后写进宿主的内联样式变量 --deepy-perch-lift（值不变就不写，避免无谓的样式失效）。
      var PERCH_MEASURE_MS = 200
      var perchLiftHost = null      // 上次写入的宿主节点（React 重建后是**新节点**，靠这条重写）
      var perchLiftValue = null     // 上次写入的值（px 字符串；null = 还没写过）
      var perchMeasuredAt = 0

      function applyPerchLift(now) {
        var host = document.getElementById(DEEPY_ROOT_ID)
        if (!host) { perchLiftHost = null; perchLiftValue = null; return }
        if (host === perchLiftHost && now - perchMeasuredAt < PERCH_MEASURE_MS) return
        perchMeasuredAt = now
        perchLiftHost = host
        var lift = 0
        try {
          var card = typeof host.closest === 'function' ? host.closest('[data-composer-card]') : null
          var dock = card ? deepyDockFor(card) : null
          if (card && dock && typeof card.getBoundingClientRect === 'function' && typeof dock.getBoundingClientRect === 'function') {
            lift = deepyPerchLift(card.getBoundingClientRect().top, dock.getBoundingClientRect().top)
          }
        } catch (error) { lift = 0 }   // 量不到就退回原栖木，绝不因为几何测量失败而停画
        var value = Math.round(lift) + 'px'
        if (value === perchLiftValue) return
        perchLiftValue = value
        if (host.style && typeof host.style.setProperty === 'function') host.style.setProperty('--deepy-perch-lift', value)
      }

      // ── 渲染循环（rAF；document.hidden 时停帧） ────────────────────────
      function tick(timestamp) {
        rafId = window.requestAnimationFrame(tick)
        if (hidden) return
        var manifest = deepyManifest
        if (!manifest) return
        var now = Date.now()
        // 栖木跟随先于素材就绪判断：停靠面板一出现就要抬，别等某一态素材解码完
        applyPerchLift(now)
        var decayed = deepyDecay(machine, now)
        if (decayed !== machine) machine = decayed
        var display = deepyDisplayWithLook(machine, now, concurrency, deepyEditingNow())
        // 进入新状态 → 按需加载该态素材；未就绪时先不渲染（避免闪一帧空白框）
        if (display !== currentState) {
          currentState = display
          frameIndex = 0
          lastFrameAt = 0
          deepyLoadState(display).catch(function () { /* 已 warn 过一次 */ })
        }
        if (!deepyImages[display]) return    // 素材未就绪：不渲染
        // 首帧素材就绪 → 让 React 挂上容器（只通知一次，避免每帧 setState）
        if (!viewReady) {
          viewReady = true
          bumpView()
        }
        // 底座辉光跟显示态走：状态变了才 bumpView（状态变化是低频事件，不会每帧 setState）
        if (display !== baseState) {
          baseState = display
          bumpView()
        }
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
        if (paint(display, frameIndex, manifest)) currentDisplayPx = deepyMainPx(manifest)
        // hero 迎宾位：固定 idle 呼吸，自带帧序（与主位档位解耦，免得主位换态时 hero 跳帧）
        var heroTarget = heroElement()
        // 单鲸规则的状态源：hero 节点在不在 DOM 里。翻转时 bumpView 让 React 重渲染主位。
        if ((heroTarget !== null) !== heroPresent) {
          heroPresent = heroTarget !== null
          bumpView()
        }
        if (heroTarget !== null && deepyImages.idle && manifest.states.idle) {
          if (reduceMotion) {
            heroFrameIndex = 0
          } else if (heroLastFrameAt === 0 || timestamp - heroLastFrameAt >= manifest.frameMs) {
            if (heroLastFrameAt !== 0) {
              var heroSteps = Math.max(1, Math.floor((timestamp - heroLastFrameAt) / manifest.frameMs))
              heroFrameIndex += heroSteps
            }
            heroLastFrameAt = timestamp
          }
          // hero 走自己的倍率（displayPx × 1.6 = 102px）——与主位的 96px 无关。
          paintInto(heroTarget, 'idle', heroFrameIndex, manifest, deepyHeroPx(manifest))
        }
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
      // 空会话 hero 迎宾位。与主位同一个可逆对：slot disposer 一起进 disposers，OFF 时撤。
      try {
        if (ctx.slots && typeof ctx.slots.inject === 'function') {
          var offHero = ctx.slots.inject(DEEPY_HERO_SLOT, function () {
            return ctx.slots.register(
              { name: DEEPY_HERO_SLOT, id: 'dsh-theme-deepy-hero', order: 40, label: function () { return 'Deepy 迎宾' } },
              DeepyHero
            )
          })
          if (typeof offHero === 'function') disposers.push(offHero)
        }
      } catch (error) { console.error('[dsh-theme] deepy hero slot registration failed:', error) }
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
        getSprite: function () { return spriteEl },
        getContainer: function () { return document.getElementById(DEEPY_ROOT_ID) },
        getHero: function () { return heroElement() },
        getHeroHost: function () { return document.getElementById(DEEPY_HERO_ID) },
        getBaseState: function () { return baseState },
        getGlowTier: function () { return glowTier(baseState) },
        isHeroPresent: function () { return heroPresent },
        isMainVisible: function () { return deepyMainVisible(viewReady, heroPresent) },
        isViewReady: function () { return viewReady },
        /** 栖木跟随：停靠面板在不在 / 抬了多少（验收与单测读它，不猜） */
        getDock: function () {
          var host = document.getElementById(DEEPY_ROOT_ID)
          if (!host || typeof host.closest !== 'function') return null
          var card = host.closest('[data-composer-card]')
          return card ? deepyDockFor(card) : null
        },
        getPerchLift: function () { return perchLiftValue },
        deepyPerchLift: deepyPerchLift,
        deepyDockFor: deepyDockFor,
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
          // 容器 DOM 归 React 所有：slot 注册的 disposer 已在上面的循环里撤掉，
          // React 随之卸载节点；这里只需把 ref 引用与就绪标志清干净。
          spriteEl = null
          // hero 节点归 React 所有：slot disposer 已在上面的循环里撤掉，React 随之卸载节点，
          // 这里只清我们的引用与帧序（取不到节点自然不画）。
          heroSpriteEl = null
          heroFrameIndex = 0
          heroLastFrameAt = 0
          heroPresent = false
          viewReady = false
          // 栖木跟随的两个缓存跟着走：重新装上时要重新量、重新写
          perchLiftHost = null
          perchLiftValue = null
          perchMeasuredAt = 0
          baseState = 'idle'
          viewListeners.clear()
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
        // 图标层与样式链、Deepy 同属一个可逆对：OFF 时逐个还原已替换的 svg 并断开观察器。
        var icons = null
        var iconInstallPending = false
        function syncIcons(enabled) {
          if (!enabled) {
            iconInstallPending = false
            if (icons !== null) { icons.dispose(); icons = null }
            return
          }
          if (icons !== null || iconInstallPending) return
          iconInstallPending = true
          // 数据只在 ON 时拉一次，OFF→ON 不重拉（loadIconData 内部缓存 + 失败可重试）。
          loadIconData().then(function (ok) {
            iconInstallPending = false
            // 竞态守卫：await 期间开关可能已被关掉
            if (!ok || !snapshot().enabled || icons !== null) return
            icons = installIcons()
          })
        }
        // 钩子层（M8）：流态活字、熄灯仪式、滚动浮现。与样式链、Deepy、图标层同一个可逆对。
        var hooks = null
        function syncHooks(enabled) {
          if (enabled) {
            if (hooks === null) hooks = installHooks(ctx)
          } else if (hooks !== null) {
            hooks.dispose()
            hooks = null
          }
        }
        var disposeSubscribe = subscribe(function (view) {
          if (!view.ready) return
          syncDeepy(view.enabled)
          syncIcons(view.enabled)
          syncHooks(view.enabled)
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
          syncIcons(false)
          syncHooks(false)
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
      frameGeometry: deepyFrameGeometry,
      mainPx: deepyMainPx,
      heroPx: deepyHeroPx,
      MAIN_SCALE: DEEPY_MAIN_SCALE,
      HERO_SCALE: DEEPY_HERO_SCALE,
      mainVisible: deepyMainVisible,
      glowTier: glowTier,
      LOOK_STATE: DEEPY_LOOK_STATE,
      lookUp: deepyLookUp,
      displayWithLook: deepyDisplayWithLook,
      // 渲染层回归测试用：驱动真实 installDeepy（需要调用方自备最小 DOM/React 桩）
      install: installDeepy,
    }

    // M8 钩子层的只读导出：纯函数（流态投影/裁决、熄灯决策、光晕档位）+ 真实安装入口。
    exports.__hooks = {
      STREAM_ATTR: STREAM_ATTR,
      FLOW_IN_CLASS: FLOW_IN_CLASS,
      WIPE_ID: WIPE_ID,
      WIPE_MS: WIPE_MS,
      HERO_KICKER: HERO_KICKER,
      HERO_COLOPHON: HERO_COLOPHON,
      STREAM_CONTAINER_SELECTOR: STREAM_CONTAINER_SELECTOR,
      EDITOR_ATTR: EDITOR_ATTR,
      EDITING_ATTR: EDITING_ATTR,
      EDITOR_CARD_SELECTOR: EDITOR_CARD_SELECTOR,
      EDITOR_INPUT_SELECTOR: EDITOR_INPUT_SELECTOR,
      editorTextOf: editorTextOf,
      editorStateOf: editorStateOf,
      streamInitial: streamInitial,
      streamProject: streamProject,
      streamFromStatus: streamFromStatus,
      streamResolve: streamResolve,
      wipePlan: wipePlan,
      glowTier: glowTier,
      install: installHooks,
    }

    // 图标层的只读导出，供单元测试直接驱动真实实现（纯函数 + 最小 DOM 桩）。
    exports.__icons = {
      /** 指纹核心（唯一实现，构建脚本抽的就是这段） */
      core: iconCore,
      ICON_ATTR: ICON_ATTR,
      ICON_HIDDEN_ATTR: ICON_HIDDEN_ATTR,
      ICON_LUCIDE_ATTR: ICON_LUCIDE_ATTR,
      ICON_VIEWBOX: ICON_VIEWBOX,
      MAP_URL: ICON_MAP_URL,
      SET_URL: ICON_SET_URL,
      shapesFromElement: iconShapesFromElement,
      lookup: iconLookup,
      restorePlan: iconRestorePlan,
      buildLucideGroup: buildLucideGroup,
      apply: applyIcon,
      restore: iconRestore,
      process: processIconSvg,
      records: function () { return iconRecords },
      load: loadIconData,
      install: installIcons,
      stats: function () {
        return {
          applied: iconStats.applied,
          revisited: iconStats.revisited,
          seen: iconStats.seen.size,
          missed: iconStats.missed.size,
          missedSample: iconStats.missedSample.slice(0, 10),
          error: iconError,
        }
      },
      resetStats: function () {
        iconStats.applied = 0
        iconStats.revisited = 0
        iconStats.seen.clear()
        iconStats.missed.clear()
        iconStats.missedSample.length = 0
      },
    }
    return module.exports
  },
})
