import fs from 'node:fs'
const o = JSON.parse(fs.readFileSync('E:/dsh-theme/.agents/tmp/m6-probe/probe-result.json', 'utf8'))
console.log('keys:', Object.keys(o))
console.log('\n=== consoleErrors ===')
console.log(JSON.stringify(o.consoleErrors, null, 1))
console.log('\n=== drive ===')
console.log(JSON.stringify(o.drive, null, 1))
const ap = o.phases.active.probe
console.log('\n=== eventCount ===', ap.eventCount)
console.log('=== unsubShapes ===', JSON.stringify(ap.unsubShapes))
console.log('\n=== eventSample ===')
console.log(JSON.stringify(ap.eventSample, null, 1))
console.log('\n=== timeline (compact) ===')
console.log(JSON.stringify(o.timeline.map(t => ({ t: t.t, ev: t.snap ? t.snap.events : null, m: t.snap ? t.snap.mounts : null })), null, 0))
