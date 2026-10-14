import fs from 'node:fs'
const o = JSON.parse(fs.readFileSync('E:/dsh-theme/.agents/tmp/m6-probe/probe-result.json', 'utf8'))
const ap = o.phases.active.probe
const evs = ap.eventsAll || []
console.log('consoleErrors:', JSON.stringify(o.consoleErrors))
console.log('total events:', ap.eventCount, 'captured:', evs.length)
const interesting = evs.filter(e => {
  const t = (e.change.entries || []).map(x => x.eventType).join(',')
  return !/assistant\/live-chunk/.test(t) || /reasoning-delta/.test(JSON.stringify(e.change))
})
console.log('\n=== non-text-delta events (state-machine relevant) ===')
for (const e of interesting) {
  const list = (e.change.entries || []).map(x => {
    const bits = [x.eventType || x.wrapperType]
    if (x.reasonKind) bits.push('reason.kind=' + x.reasonKind)
    if (x.callId) bits.push('callId=' + x.callId)
    if (x.toolName) bits.push('name=' + x.toolName)
    if (x.hasDataError) bits.push('data.error=YES')
    if (x.messageIsError !== undefined && x.messageIsError !== null) bits.push('message.isError=' + x.messageIsError)
    if (x.chunkType) bits.push('chunk=' + x.chunkType)
    return bits.join('|')
  }).join(' ;; ')
  console.log('rev=' + e.windowRevision, 'kind=' + e.change.kind, '->', list)
}
const types = {}
for (const e of evs) for (const x of (e.change.entries || [])) types[x.eventType || ('wrapper:' + x.wrapperType)] = (types[x.eventType || ('wrapper:' + x.wrapperType)] || 0) + 1
console.log('\n=== event type histogram ===')
console.log(JSON.stringify(types, null, 1))
console.log('\n=== change.kind histogram ===')
const ck = {}
for (const e of evs) ck[e.change.kind] = (ck[e.change.kind] || 0) + 1
console.log(JSON.stringify(ck, null, 1))
