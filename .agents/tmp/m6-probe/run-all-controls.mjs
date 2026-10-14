// 跑全部变异负控制，并在每条之后校验 client.js 仍是最新版本（防陈旧备份回退）。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
const TARGET = 'E:/dsh-theme/plugins/dsh-theme/lib/client.js'
const MARKERS = ['beginRound', 'deepyToolState', 'deepyFrameGeometry', 'isConnected']
const scripts = [
  ['m1', '.agents/tmp/m6-probe/mutate-full.mjs'],
  ['m2', '.agents/tmp/m6-probe/mutate-full.mjs'],
  ['m3', '.agents/tmp/m6-probe/mutate-full.mjs'],
  ['r1', '.agents/tmp/m6-probe/mutate-render.mjs'],
  ['r2', '.agents/tmp/m6-probe/mutate-render.mjs'],
  ['h1', '.agents/tmp/m6-probe/mutate-hold.mjs'],
  ['h2', '.agents/tmp/m6-probe/mutate-hold.mjs'],
]
let allOk = true
for (const [id, script] of scripts) {
  const out = execFileSync(process.execPath, [script, id], { encoding: 'utf8', cwd: 'E:/dsh-theme' })
  const ok = out.includes('NEGATIVE CONTROL OK')
  const red = (out.match(/^RED.*$/m) || [''])[0].trim()
  const green = (out.match(/^GREEN.*$/m) || [''])[0].trim()
  // 完整性校验
  const t = fs.readFileSync(TARGET, 'utf8')
  const missing = MARKERS.filter((m) => !t.includes(m))
  if (missing.length) { allOk = false; console.log(id + '  *** INTEGRITY FAIL: missing ' + missing.join(',')) }
  if (!ok) allOk = false
  console.log(id.padEnd(3) + ' ' + (ok ? 'OK  ' : 'FAIL') + '  ' + red.replace(/^RED\s+/, ''))
}
const final = fs.readFileSync(TARGET, 'utf8')
console.log('')
console.log('client.js 行数 = ' + final.split('\n').length + '  标记齐全 = ' + (MARKERS.every((m) => final.includes(m))))
console.log(allOk ? 'ALL CONTROLS OK' : 'SOME CONTROLS FAILED')
process.exit(allOk ? 0 : 1)
