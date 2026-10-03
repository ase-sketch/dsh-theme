// sync-skin.mjs — skins/dsh-ui/ → $DSH_HOME/skins/dsh-ui/
import fs from 'node:fs'
const SRC = new URL('../skins/dsh-ui/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const DST = 'C:/Users/pass/.dsh/skins/dsh-ui'
fs.mkdirSync(DST, { recursive: true })
for (const f of fs.readdirSync(SRC)) {
  fs.copyFileSync(SRC + '/' + f, DST + '/' + f)
  console.log('sync:', f)
}
console.log('→', DST)
