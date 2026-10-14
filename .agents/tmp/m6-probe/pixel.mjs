import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const PY = 'C:/Users/pass/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe'
const code = `
from PIL import Image
import json, sys
out = {}
for label in ['firstScreen','active']:
    p = 'E:/dsh-theme/.agents/tmp/m6-probe/m6-probe-%s.png' % label
    im = Image.open(p).convert('RGB')
    w,h = im.size
    cols = im.getcolors(maxcolors=1<<24) or []
    # probe orange = rgb(255,138,0)
    orange = sum(c for c,px in cols if px[0] > 240 and 120 < px[1] < 160 and px[2] < 40)
    out[label] = {'size':[w,h], 'orangePx': orange, 'totalPx': w*h}
print(json.dumps(out))
`
fs.writeFileSync('E:/dsh-theme/.agents/tmp/m6-probe/_px.py', code)
const r = execFileSync(PY, ['E:/dsh-theme/.agents/tmp/m6-probe/_px.py'], { encoding: 'utf8' })
console.log(r)
