import fs from 'node:fs'
const p = 'C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/app.asar'
const fd = fs.openSync(p, 'r')
const b = Buffer.alloc(16)
fs.readSync(fd, b, 0, 16, 0)
const hs = b.readUInt32LE(4)
const hb = Buffer.alloc(hs)
fs.readSync(fd, hb, 0, hs, 8)
const jsonLen = hb.readUInt32LE(4)
const h = JSON.parse(hb.toString('utf8', 8, 8 + jsonLen))
const base = 8 + hs
function readFile(entry) {
  const buf = Buffer.alloc(entry.size)
  fs.readSync(fd, buf, 0, entry.size, base + Number(entry.offset))
  return buf
}
function find(o, prefix, out) {
  for (const k of Object.keys(o.files || {})) {
    const v = o.files[k]
    const key = prefix + '/' + k
    if (v.files) find(v, key, out)
    else out.push([key, v])
  }
  return out
}
const all = find(h, '', [])
const hits = all.filter(([k]) => /host-webserver/.test(k))
console.log('total entries', all.length)
for (const [k, v] of hits) console.log(k, v.size)
if (process.argv[2]) {
  const hit = hits.find(([k]) => k.endsWith(process.argv[2]))
  if (!hit) { console.log('NOT FOUND'); process.exit(1) }
  const text = readFile(hit[1])
  fs.writeFileSync(process.argv[3] || 'out.txt', text)
  console.log('dumped', hit[0], text.length)
}
