/**
 * dsh-theme — client half (M1 hello-skin).
 *
 * The shell's module loader hands this factory a `require` and expects
 * CommonJS-shaped `module.exports` back; the client roster then calls the
 * exported `apply(ctx)` itself, so nothing here is self-triggered.
 *
 * M1 exists to prove the bundle -> client -> page chain end to end, so the
 * injected rule is a deliberately loud test colour instead of a real token.
 * M2 replaces PROBE_CSS with CSS generated from dsh-ui's preview :root block;
 * see docs/milestones.md.
 */

const STYLE_ELEMENT_ID = 'dsh-theme-style'

/** Marks the document while this plugin owns the page's styling. */
const ROOT_ATTRIBUTE = 'data-dsh-theme'

/**
 * M1 probe stylesheet.
 *
 * A near-opaque wash over the app root: if the GUI turns orange, the chain
 * works. Deliberately NOT a design value — dsh-ui/preview/index.html :root is
 * the only legal source of colour in this plugin, and M1 ships before that
 * generator exists. M2 deletes this constant.
 */
const PROBE_CSS = `
html[${ROOT_ATTRIBUTE}] body {
  background-color: rgb(255 138 0) !important;
}
`

window.__ModuleLoader__.load({
  id: 'dsh-theme',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    function apply(ctx) {
      // The stylesheet is the plugin's whole effect, so it is built and handed
      // over as one reversible unit. Re-running apply (hot reload, a second
      // roster pass) replaces the element by id instead of stacking a second
      // copy of the same rules.
      const style = document.createElement('style')
      style.id = STYLE_ELEMENT_ID
      style.textContent = PROBE_CSS
      document.head.appendChild(style)
      document.documentElement.setAttribute(ROOT_ATTRIBUTE, '')

      /**
       * The inverse the host runs on dispose. Registered before it can fail,
       * and returning it from ctx.effect is what makes "卸载后完全还原" a
       * guarantee rather than a hope: dropping the element and the attribute
       * returns the page to exactly the state it had before apply ran.
       */
      ctx.effect(() => {
        const element = document.getElementById(STYLE_ELEMENT_ID)
        if (element) element.remove()
        document.documentElement.removeAttribute(ROOT_ATTRIBUTE)
      }, 'dsh-theme: probe skin')
    }

    exports.apply = apply
    return module.exports
  },
})
