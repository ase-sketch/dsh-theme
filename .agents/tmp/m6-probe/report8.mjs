import fs from 'node:fs'
const o = JSON.parse(fs.readFileSync('E:/dsh-theme/.agents/tmp/m6-probe/probe-result.json', 'utf8'))
const ap = o.phases.active.probe
const evs = ap.eventsAll || []
console.log('consoleErrors:', JSON.stringify(o.consoleErrors))
console.log('=== tool/call and tool/result pairing ===')
for (const e of evs) {
  for (const x of (e.change.entries || [])) {
    if (x.eventType === 'tool/call' || x.eventType === 'tool/result') {
      console.log(JSON.stringify(x))
    }
  }
}
console.log('\n=== live-chunk tool-call-delta (has chunk.id?) ===')
let n = 0
for (const e of evs) for (const x of (e.change.entries || [])) {
  if (x.eventType === 'assistant/live-chunk' && x.chunkType === 'tool-call-delta' && n < 3) { console.log(JSON.stringify(x)); n++ }
}
console.log('\n=== firstScreen facts (re-confirm) ===')
const f1 = o.phases.firstScreen
console.log(JSON.stringify({ slotCount: f1.slotCount, sessionAttr: f1.conversationSessionAttr, contentPhase: f1.contentPhaseAttr, rootPhase: f1.rootPhaseAttr, slotRect: f1.slotRect, composerCard: f1.composerCardPresent, brandMarkCandidates: f1.brandMarkCandidates }, null, 1))
console.log('\n=== active facts ===')
const f2 = o.phases.active
console.log(JSON.stringify({ slotCount: f2.slotCount, sessionAttr: f2.conversationSessionAttr, contentPhase: f2.contentPhaseAttr, rootPhase: f2.rootPhaseAttr, slotRect: f2.slotRect, composerCard: f2.composerCardPresent, brandMarkCandidates: f2.brandMarkCandidates }, null, 1))
console.log('\n=== status snapshot running-true counts over time ===')
for (const s of ap.statusSnapshotsAll || []) {
  const t = (s.entries || []).filter(x => x.running === true).length
  console.log('size=' + s.size + ' runningTrue=' + t)
}
