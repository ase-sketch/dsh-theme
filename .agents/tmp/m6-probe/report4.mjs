import fs from 'node:fs'
const o = JSON.parse(fs.readFileSync('E:/dsh-theme/.agents/tmp/m6-probe/probe-result.json', 'utf8'))
const ap = o.phases.active.probe
console.log('consoleErrors:', JSON.stringify(o.consoleErrors))
console.log('drive:', JSON.stringify(o.drive))
console.log('total events:', ap.eventCount)
console.log('\n=== event stream (type / change.kind / targeted fields) ===')
for (const e of ap.events || []) {
  const c = e.change
  const list = (c.entries || []).map(x => {
    const bits = [x.eventType || x.wrapperType]
    if (x.reasonKind !== undefined && x.reasonKind !== null) bits.push('reason.kind=' + x.reasonKind)
    if (x.callId) bits.push('callId=' + x.callId)
    if (x.toolName) bits.push('name=' + x.toolName)
    if (x.hasDataError) bits.push('data.error=YES')
    if (x.messageIsError !== undefined && x.messageIsError !== null) bits.push('message.isError=' + x.messageIsError)
    if (x.chunkType) bits.push('chunk=' + x.chunkType)
    return bits.join(' | ')
  }).join(' ;; ')
  console.log('rev=' + e.windowRevision, 'win=' + e.windowEntryCount, 'kind=' + c.kind, '->', list || '(none)')
}
console.log('\n=== status snapshots (running counts over time) ===')
for (const s of ap.statusSnapshotsAll || []) {
  const runningTrue = (s.entries || []).filter(x => x.running === true).map(x => x.id)
  const runningFalse = (s.entries || []).filter(x => x.running === false).length
  const runningUndef = (s.entries || []).filter(x => x.running === undefined).length
  console.log('size=' + s.size, 'true=' + runningTrue.length, 'false=' + runningFalse, 'undef=' + runningUndef, 'ids=' + runningTrue.map(i => i.slice(-6)).join(','))
}
console.log('\n=== last status entries (full row shape) ===')
console.log(JSON.stringify((ap.statusSnapshotsAll || []).slice(-1)[0], null, 1))
console.log('\n=== list snapshot (origin field) ===')
console.log(JSON.stringify(ap.listSnapshotLast, null, 1))
