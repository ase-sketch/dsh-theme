import fs from 'node:fs'
const o = JSON.parse(fs.readFileSync('E:/dsh-theme/.agents/tmp/m6-probe/probe-result.json', 'utf8'))
const ap = o.phases.active.probe
console.log('total events recorded:', ap.eventCount)
console.log('\n=== ALL event types in order ===')
for (const e of ap.events || []) {
  const c = e.change
  const t = c && c.entries && c.entries.length ? c.entries.map(x => x.eventType || x.wrapperType).join(',') : c.kind
  console.log(String(e.at).slice(-6), 'rev=' + e.windowRevision, 'win=' + e.windowEntryCount, 'change=' + c.kind, '=>', t)
}
