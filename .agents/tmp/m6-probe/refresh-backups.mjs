// 变异脚本的备份必须与当前实现同版本，否则「还原」会把文件回退到旧版本。
// 本脚本把全部 pristine 备份刷新为当前 client.js，并断言它们包含最新契约标记。
import fs from 'node:fs'
const SRC = 'E:/dsh-theme/plugins/dsh-theme/lib/client.js'
const backups = [
  'E:/dsh-theme/.agents/tmp/m6-probe/client.js.pristine',
  'E:/dsh-theme/.agents/tmp/m6-probe/client.js.render-pristine',
  'E:/dsh-theme/.agents/tmp/m6-probe/client.js.hold-pristine',
]
const src = fs.readFileSync(SRC, 'utf8')
// 契约标记：每加一条新契约就在这里加一行，备份缺任一条即视为陈旧
const MARKERS = ['beginRound', 'deepyToolState', 'deepyFrameGeometry', 'isConnected']
for (const b of backups) {
  fs.writeFileSync(b, src)
  const t = fs.readFileSync(b, 'utf8')
  const missing = MARKERS.filter((m) => !t.includes(m))
  console.log((missing.length ? 'STALE ' : 'OK    ') + b + (missing.length ? '  missing=' + missing.join(',') : ''))
}
console.log('refreshed from ' + SRC + ' (' + src.split('\n').length + ' lines)')
