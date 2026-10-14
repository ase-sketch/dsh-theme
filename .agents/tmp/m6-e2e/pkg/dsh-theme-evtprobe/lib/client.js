window.__ModuleLoader__.load({
  id: 'dsh-theme-evtprobe',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports

    // Round-4b event probe v2: record EVERY entry type so we can see exactly which event
    // produces the 'error' transient. Also expose per-source listener hit counts as plain
    // numbers (v1 closed over them and they serialized as null).
    function apply(ctx) {
      ctx.effect(function () {
        var records = []
        var sources = []
        var subscribed = {}

        function subscribeSession(id) {
          if (subscribed[id]) return
          var binding = null
          try { binding = ctx.sessions.binding(id) } catch (e) { binding = null }
          if (!binding || !binding.eventSource || typeof binding.eventSource.subscribe !== 'function') return
          var source = binding.eventSource
          var counter = { a: 0, b: 0 }
          var stopA = source.subscribe(function () { counter.a += 1; drain(id, source) })
          var stopB = source.subscribe(function () { counter.b += 1 })
          sources.push({ id: id, counter: counter, stopA: typeof stopA, stopB: typeof stopB })
          subscribed[id] = { stopA: stopA, stopB: stopB }
        }

        function drain(id, source) {
          var snap = null
          try { snap = source.getSnapshot() } catch (e) { return }
          if (!snap || !snap.change) return
          var ch = snap.change
          if (ch.kind === 'settle-assistant') { records.push({ t: Date.now(), id: id, kind: 'settle-assistant' }); return }
          var entries = ch.entries
          if (!entries || !entries.length) return
          for (var i = 0; i < entries.length; i += 1) {
            var e = entries[i]
            var ev = e && e.event ? e.event : null
            if (!ev) continue
            var d = ev.data || {}
            var rec = { t: Date.now(), id: id, type: ev.type, seq: ev.seq,
                        entryKeys: Object.keys(e).join(','), evKeys: Object.keys(ev).join(',') }
            if (ev.type === 'turn/end') {
              rec.reasonKind = d.reason && typeof d.reason === 'object' ? d.reason.kind : d.reason
            }
            if (ev.type === 'tool/result') {
              rec.isError = Boolean(d.error) || (d.message && d.message.isError === true)
              rec.toolCallId = d.message && d.message.toolCallId ? String(d.message.toolCallId).slice(0, 12) : null
            }
            if (ev.type === 'tool/call') {
              rec.callId = d.callId === undefined || d.callId === null ? null : String(d.callId).slice(0, 12)
            }
            records.push(rec)
          }
        }

        function refresh() {
          var map = null
          try { map = ctx.uiSession.sessionStatus.getSnapshot() } catch (e) { map = null }
          if (map && typeof map.forEach === 'function') {
            map.forEach(function (v, k) { if (v && v.running === true) subscribeSession(k) })
          }
        }

        try {
          if (ctx.uiSession && ctx.uiSession.sessionStatus && typeof ctx.uiSession.sessionStatus.subscribe === 'function') {
            ctx.uiSession.sessionStatus.subscribe(refresh)
          }
        } catch (e) {}
        try {
          if (ctx.sessions && ctx.sessions.list && typeof ctx.sessions.list.subscribe === 'function') {
            ctx.sessions.list.subscribe(refresh)
          }
        } catch (e) {}
        refresh()

        window.__M6_EVTPROBE__ = {
          get: function () {
            return {
              records: records.slice(),
              sources: sources.map(function (s) {
                return { id: s.id, hitsA: s.counter.a, hitsB: s.counter.b, stopA: s.stopA, stopB: s.stopB }
              }),
            }
          },
          clear: function () { records.length = 0 },
        }

        return function () {
          Object.keys(subscribed).forEach(function (k) {
            try { if (typeof subscribed[k].stopA === 'function') subscribed[k].stopA() } catch (e) {}
            try { if (typeof subscribed[k].stopB === 'function') subscribed[k].stopB() } catch (e) {}
          })
          try { delete window.__M6_EVTPROBE__ } catch (e) {}
        }
      }, 'm6-evtprobe: full entry recorder')
    }

    exports.apply = apply
    exports.inject = ['sessions', 'uiSession']
    return module.exports
  },
})