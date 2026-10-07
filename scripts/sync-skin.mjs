// sync-skin.mjs — skins/dsh-ui/ → $DSH_HOME/skins/dsh-ui/（含子目录，如 preview/）
import fs from 'node:fs'
const SRC = new URL('../skins/dsh-ui/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const DST = 'C:/Users/pass/.dsh/skins/dsh-ui'
fs.mkdirSync(DST, { recursive: true })
for (const f of fs.readdirSync(SRC)) {
  fs.cpSync(SRC + '/' + f, DST + '/' + f, { recursive: true })
  console.log('sync:', f)
}
console.log('→', DST)
