/**
 * dsh-theme-probe — M6/T3 client half. THROWAWAY probe (lives under .agents/tmp/).
 *
 * Answers three questions with live evidence:
 *   a) can the client half inject 'sessions' / 'uiSession', and what are their shapes
 *   b) what does sessions.binding(id).eventSource.subscribe actually deliver
 *   c) does slot 'conversation.input.left' really render, in both phases
 *
 * RED LINE (§3.6): top level declares NOTHING — every const/let/function lives in
 * the factory body, because client bundles are concatenated into one <script>.
 * RED LINE (§3.4): ctx.effect body installs, RETURN VALUE is the disposer.
 */

window.__ModuleLoader__.load({
  id: 'dsh-theme-probe',
  factory: (require) => {
    'use strict'
    var module = { exports: {} }
    var exports = module.exports

    var react = require('react')

    // Everything the Playwright driver reads back. One global, one shape.
    var record = {
      factoryAt: null,
      applyAt: null,
      services: {},
      sessionStatusSource: {},
      statusSnapshots: [],
      listSnapshots: [],
      bindings: [],
      events: [],
      slotMounts: 0,
      errors: [],
      unsubShapes: [],
    }
    window.__M6_PROBE__ = record

    function safe(fn, fallback) {
      try {
        return fn()
      } catch (error) {
        record.errors.push(String(error && error.message ? error.message : error))
        return fallback
      }
    }

    function keysOf(value) {
      return safe(function () {
        if (value === null || value === undefined) return null
        return Object.keys(value).slice(0, 40)
      }, null)
    }

    /** Describe a snapshot source without calling anything that could throw. */
    function describeSource(name, value) {
      return {
        name: name,
        present: value !== undefined && value !== null,
        type: typeof value,
        ctor: safe(function () {
          return value && value.constructor ? String(value.constructor.name) : null
        }, null),
        keys: keysOf(value),
        hasGetSnapshot: safe(function () {
          return typeof value.getSnapshot === 'function'
        }, false),
        hasSubscribe: safe(function () {
          return typeof value.subscribe === 'function'
        }, false),
      }
    }

    /** Plain-JSON view of the uiSession.sessionStatus snapshot. */
    function describeStatusSnapshot(snapshot) {
      var out = {
        isMap: safe(function () {
          return snapshot instanceof Map
        }, null),
        ctor: safe(function () {
          return snapshot && snapshot.constructor ? String(snapshot.constructor.name) : null
        }, null),
        type: typeof snapshot,
        size: null,
        entries: [],
      }
      safe(function () {
        if (snapshot instanceof Map) {
          out.size = snapshot.size
          snapshot.forEach(function (value, key) {
            out.entries.push({
              idType: typeof key,
              id: String(key),
              running: value ? value.running : undefined,
              runningType: value ? typeof value.running : 'no-value',
              valueKeys: value ? Object.keys(value) : null,
              pendingInteractionType: value ? typeof value.pendingInteraction : undefined,
              completionUnread: value ? value.completionUnread : undefined,
            })
          })
          return
        }
        if (snapshot && typeof snapshot === 'object') {
          out.size = Object.keys(snapshot).length
          Object.keys(snapshot).forEach(function (key) {
            var value = snapshot[key]
            out.entries.push({
              idType: 'string',
              id: String(key),
              running: value ? value.running : undefined,
              runningType: value ? typeof value.running : 'no-value',
              valueKeys: value ? Object.keys(value) : null,
              pendingInteractionType: value ? typeof value.pendingInteraction : undefined,
              completionUnread: value ? value.completionUnread : undefined,
            })
          })
        }
      })
      return out
    }

    /** Plain-JSON view of the sessions.list snapshot, including origin. */
    function describeListSnapshot(snapshot) {
      var out = { phase: null, ids: [], rows: [] }
      safe(function () {
        if (!snapshot || typeof snapshot !== 'object') return
        out.phase = snapshot.phase
        out.ids = Array.isArray(snapshot.ids) ? snapshot.ids.map(String) : []
        var byId = snapshot.byId || {}
        Object.keys(byId).forEach(function (key) {
          var row = byId[key] || {}
          out.rows.push({
            id: String(key),
            origin: row.origin === undefined ? null : row.origin,
            hasOriginKey: Object.prototype.hasOwnProperty.call(row, 'origin'),
            blank: row.blank,
            running: row.running,
            displayTitle: row.displayTitle,
            parentId: row.parentId === undefined ? null : String(row.parentId),
          })
        })
      })
      return out
    }

    /** Plain-JSON view of one event-window change. */
    function describeChange(change) {
      var out = { kind: null, entryCount: 0, entries: [] }
      safe(function () {
        if (!change || typeof change !== 'object') return
        out.kind = change.kind
        var entries = change.entries
        if (!Array.isArray(entries)) return
        out.entryCount = entries.length
        entries.slice(0, 12).forEach(function (entry) {
          var event = entry && entry.event ? entry.event : null
          if (!event) {
            out.entries.push({ wrapperType: entry ? entry.type : null, eventType: null })
            return
          }
          var data = event.data
          out.entries.push({
            wrapperType: entry.type,
            eventType: event.type,
            seq: event.seq,
            envelopeKeys: Object.keys(event),
            dataKeys: data && typeof data === 'object' ? Object.keys(data) : null,
            // targeted field paths the state machine needs
            reasonKind: data && data.reason && typeof data.reason === 'object' ? data.reason.kind : undefined,
            callId: data && data.callId !== undefined ? String(data.callId) : undefined,
            toolName: data && data.name !== undefined ? data.name : undefined,
            hasDataError: Boolean(data && Object.prototype.hasOwnProperty.call(data, 'error')),
            messageIsError: data && data.message ? data.message.isError : undefined,
            messageToolCallId: data && data.message && data.message.toolCallId !== undefined ? String(data.message.toolCallId) : undefined,
            messageRole: data && data.message ? data.message.role : undefined,
            messageSourceKind: data && data.message && data.message.source ? data.message.source.kind : undefined,
            chunkType: data && data.chunk ? data.chunk.type : undefined,
            chunkToolCallId: data && data.chunk && data.chunk.id !== undefined ? String(data.chunk.id) : undefined,
          })
        })
      })
      return out
    }

    function ProbeSlotDecoration() {
      react.useEffect(function () {
        record.slotMounts += 1
      }, [])
      return react.createElement(
        'div',
        {
          'data-m6-probe-slot': '',
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '16px',
            height: '16px',
            borderRadius: '4px',
            background: 'rgb(255 138 0)',
            color: '#fff',
            fontSize: '10px',
            lineHeight: '16px',
            pointerEvents: 'none',
          },
          title: 'M6 probe',
        },
        'M6'
      )
    }

    function apply(ctx) {
      record.applyAt = Date.now()

      // ctx.effect: install inside the body, RETURN the teardown.
      ctx.effect(function () {
        var disposers = []

        // ── (a) service injection ───────────────────────────────────────────
        record.services.sessions = describeSource('sessions', ctx.sessions)
        record.services.uiSession = describeSource('uiSession', ctx.uiSession)
        record.services.slots = describeSource('slots', ctx.slots)
        record.services.sessionsList = describeSource('sessions.list', safe(function () {
          return ctx.sessions.list
        }, null))
        record.services.sessionStatus = describeSource('uiSession.sessionStatus', safe(function () {
          return ctx.uiSession.sessionStatus
        }, null))

        // ── (c) slot injection ─────────────────────────────────────────────
        safe(function () {
          if (!ctx.slots || typeof ctx.slots.inject !== 'function') {
            record.errors.push('ctx.slots.inject missing')
            return
          }
          var off = ctx.slots.inject('conversation.input.left', function () {
            return ctx.slots.register(
              {
                name: 'conversation.input.left',
                id: 'm6-probe',
                order: 5,
                label: function () {
                  return 'M6 probe'
                },
              },
              ProbeSlotDecoration
            )
          })
          if (typeof off === 'function') disposers.push(off)
          record.slotInjectResult = typeof off
        })

        // ── (b) session event subscription ─────────────────────────────────
        var subscribed = {}

        function subscribeToSession(id) {
          if (subscribed[id]) return
          var binding = safe(function () {
            return ctx.sessions.binding(id)
          }, undefined)
          if (!binding) {
            record.bindings.push({ id: id, found: false })
            return
          }
          subscribed[id] = true
          record.bindings.push({
            id: id,
            found: true,
            bindingKeys: Object.keys(binding),
            hasEventSource: Boolean(binding.eventSource),
            hasSession: Boolean(binding.session),
            sessionIdMatch: String(binding.sessionId) === String(id),
          })
          var source = binding.eventSource
          if (!source || typeof source.subscribe !== 'function') return
          var window0 = safe(function () {
            return source.getSnapshot()
          }, null)
          record.bindings[record.bindings.length - 1].windowShape = {
            keys: window0 ? Object.keys(window0) : null,
            revision: window0 ? window0.revision : null,
            entryCount: window0 && Array.isArray(window0.entries) ? window0.entries.length : null,
            hasMore: window0 ? window0.hasMore : null,
            changeKind: window0 && window0.change ? window0.change.kind : null,
          }
          var stop = source.subscribe(function () {
            var snap = safe(function () {
              return source.getSnapshot()
            }, null)
            record.events.push({
              at: Date.now(),
              callbackArgCount: arguments.length,
              callbackArg0Type: typeof arguments[0],
              windowRevision: snap ? snap.revision : null,
              windowEntryCount: snap && Array.isArray(snap.entries) ? snap.entries.length : null,
              change: describeChange(snap ? snap.change : null),
            })
            if (record.events.length > 4000) record.events.splice(0, 2000)
          })
          record.unsubShapes.push({ id: id, type: typeof stop, ctor: safe(function () {
            return stop && stop.constructor ? String(stop.constructor.name) : null
          }, null) })
          if (typeof stop === 'function') disposers.push(stop)
        }

        var statusSource = safe(function () {
          return ctx.uiSession.sessionStatus
        }, null)
        if (statusSource && typeof statusSource.subscribe === 'function') {
          var statusStop = statusSource.subscribe(function () {
            var snap = safe(function () {
              return statusSource.getSnapshot()
            }, null)
            record.statusSnapshots.push(describeStatusSnapshot(snap))
            if (record.statusSnapshots.length > 40) record.statusSnapshots.splice(0, 20)
            safe(function () {
              if (snap instanceof Map) {
                snap.forEach(function (value, key) {
                  if (value && value.running === true) subscribeToSession(String(key))
                })
              }
            })
          })
          if (typeof statusStop === 'function') disposers.push(statusStop)
          // initial read
          var initialStatus = safe(function () {
            return statusSource.getSnapshot()
          }, null)
          record.statusSnapshots.push(describeStatusSnapshot(initialStatus))
          safe(function () {
            if (initialStatus instanceof Map) {
              initialStatus.forEach(function (value, key) {
                if (value && value.running === true) subscribeToSession(String(key))
              })
            }
          })
        }

        var listSource = safe(function () {
          return ctx.sessions.list
        }, null)
        if (listSource && typeof listSource.subscribe === 'function') {
          var listStop = listSource.subscribe(function () {
            var snap = safe(function () {
              return listSource.getSnapshot()
            }, null)
            record.listSnapshots.push(describeListSnapshot(snap))
            if (record.listSnapshots.length > 20) record.listSnapshots.splice(0, 10)
          })
          if (typeof listStop === 'function') disposers.push(listStop)
          record.listSnapshots.push(describeListSnapshot(safe(function () {
            return listSource.getSnapshot()
          }, null)))
        }

        // exposed for the driver: subscribe to a session id on demand
        record.subscribeToSession = function (id) {
          return safe(function () {
            subscribeToSession(String(id))
            return true
          }, false)
        }

        return function () {
          for (var i = 0; i < disposers.length; i += 1) {
            try {
              disposers[i]()
            } catch (error) {
              record.errors.push('dispose: ' + String(error))
            }
          }
          disposers.length = 0
        }
      }, 'dsh-theme-probe: M6/T3 probe')
    }

    exports.apply = apply
    // Service names (cordis fiber inject), NOT package names.
    exports.inject = ['slots', 'sessions', 'uiSession']
    return module.exports
  },
})
