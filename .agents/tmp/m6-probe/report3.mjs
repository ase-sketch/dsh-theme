import fs from 'node:fs'
const o = JSON.parse(fs.readFileSync('E:/dsh-theme/.agents/tmp/m6-probe/probe-result.json', 'utf8'))
const ap = o.phases.active.probe
console.log('probe keys:', Object.keys(ap))
const fs2 = o.phases.firstScreen.probe
console.log('firstScreen probe keys:', Object.keys(fs2))
console.log('firstScreen events:', fs2.eventCount, 'active events:', ap.eventCount)
console.log('\n=== firstScreen event sample ===')
console.log(JSON.stringify(fs2.eventSample, null, 1).slice(0, 3000))
