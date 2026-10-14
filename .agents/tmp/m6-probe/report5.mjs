import fs from 'node:fs'
const o = JSON.parse(fs.readFileSync('E:/dsh-theme/.agents/tmp/m6-probe/probe-result.json', 'utf8'))
const ap = o.phases.active.probe
const evs = ap.eventsAll || []
console.log('total events:', ap.eventCount, 'captured:', evs.length)
console.log('\n=== event stream ===')
for (const e of evs) {
  const c = e.change
  const list = (c.entries || []).map(x => {
    const bits = [x.eventType || x.wrapperType]
    if (x.reasonKind !== undefined && x.reasonKind !== null) bits.push('reason.kind=' + x.reasonKind)
    if (x.callId) bits.push('callId=' + x.callId)
    if (x.toolName) bits.push('name=' + x.toolName)
    if (x.hasDataError) bits.push('data.error=YES')
    if (x.messageIsError !== undefined && x.messageIsError !== null) bits.push('message.isError=' + x.messageIsError)
    if (x.chunkType) bits.push('chunk=' + x.chunkType)
    return bits.join('|')
  }).join(' ;; ')
  console.log('rev=' + e.windowRevision, 'win=' + e.windowEntryCount, 'cbArgs=' + e.callbackArgCount, 'kind=' + c.kind, '->', list || '(none)')
}
