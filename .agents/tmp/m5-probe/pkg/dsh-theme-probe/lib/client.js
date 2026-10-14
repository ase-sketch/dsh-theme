/**
 * dsh-theme-probe — client half (M5 D4 client-activation gate).
 *
 * RED LINE (§3.6): this file must declare NOTHING at top level. The shell's
 * combo builder concatenates every client.js of a batch into ONE classic
 * <script>, so a top-level const/let/function here would collide with any
 * other package's identifier and break the whole batch with a syntax error.
 * Every declaration therefore lives inside the factory below.
 *
 * RED LINE (§3.4): ctx.effect(execute) runs `execute` IMMEDIATELY; only its
 * RETURN VALUE is registered as the disposer. Install inside the body, return
 * the teardown. Passing the teardown as the body is the M1 bug: the skin is
 * removed in the same millisecond it is added, silently.
 */

window.__ModuleLoader__.load({
  id: 'dsh-theme-probe',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    var STYLE_ELEMENT_ID = 'dsh-theme-probe-style'
    var ROOT_ATTRIBUTE = 'data-dsh-theme-probe'

    // Deliberately loud test colour, not a design value: the gate only needs
    // "is the client half alive in the page", so the whole effect is one
    // unmistakable orange wash over body.
    var PROBE_CSS = 'html[' + ROOT_ATTRIBUTE + '] body { background-color: rgb(255 138 0) !important; }'

    function apply(ctx) {
      ctx.effect(() => {
        var style = document.createElement('style')
        style.id = STYLE_ELEMENT_ID
        style.textContent = PROBE_CSS
        document.head.appendChild(style)
        document.documentElement.setAttribute(ROOT_ATTRIBUTE, '')

        return () => {
          var element = document.getElementById(STYLE_ELEMENT_ID)
          if (element) element.remove()
          document.documentElement.removeAttribute(ROOT_ATTRIBUTE)
        }
      }, 'dsh-theme-probe: activation gate')
    }

    exports.apply = apply
    return module.exports
  },
})
