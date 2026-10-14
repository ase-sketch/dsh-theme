import fs from 'node:fs'
const o = JSON.parse(fs.readFileSync('E:/dsh-theme/.agents/tmp/m6-probe/probe-result.json', 'utf8'))
const ap = o.phases.active.probe
const evs = ap.eventsAll || []
console.log('consoleErrors:', JSON.stringify(o.consoleErrors))
console.log('drive:', JSON.stringify(o.drive))
console.log('events:', ap.eventCount)
const types = {}
for (const e of evs) for (const x of (e.change.entries || [])) {
  const k = x.eventType || ('wrapper:' + x.wrapperType)
  types[k] = (types[k] || 0) + 1
}
console.log('\n=== event type histogram (all) ===')
console.log(JSON.stringify(types, null, 1))
const ck = {}
for (const e of evs) ck[e.change.kind] = (ck[e.change.kind] || 0) + 1
console.log('\n=== change.kind histogram ===')
console.log(JSON.stringify(ck, null, 1))
console.log('\n=== the state-machine-relevant events (deduped by type) ===')
const seen = new Set()
for (const e of evs) {
  for (const x of (e.change.entries || [])) {
    const k = x.eventType || ('wrapper:' + x.wrapperType)
    if (k === 'assistant/live-chunk') continue
    if (seen.has(k + '|' + (x.reasonKind || '') + '|' + (x.messageIsError ?? ''))) continue
    seen.add(k + '|' + (x.reasonKind || '') + '|' + (x.messageIsError ?? ''))
    console.log(JSON.stringify({ type: k, dataKeys: x.dataKeys, envelopeKeys: x.envelopeKeys, reasonKind: x.reasonKind, callId: x.callId, name: x.toolName, hasDataError: x.hasDataError, messageIsError: x.messageIsError }))
  }
}
console.log('\n=== live-chunk kinds seen ===')
const lc = new Set()
for (const e of evs) for (const x of (e.change.entries || [])) if (x.eventType === 'assistant/live-chunk') lc.add(x.chunkType)
console.log([...lc].join(', '))
console.log('\n=== turn/end reason kinds seen ===')
const re = new Set()
for (const e of evs) for (const x of (e.change.entries || [])) if (x.eventType === 'turn/end') re.add(x.reasonKind)
console.log([...re].join(', '))
console.log('\n=== callback args (should be 0 for every call) ===')
const argSet = new Set(evs.map(e => e.callbackArgCount + '/' + e.callbackArg0Type))
console.log([...argSet].join(' | '))
