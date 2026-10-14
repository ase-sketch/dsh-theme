import fs from 'node:fs'
const roots = [
  'C:/Users/pass/.dsh/profiles/web/node_modules',
  'C:/Users/pass/.dsh/profiles/web',
  'C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources',
  'C:/Users/pass/.dsh',
]
for (const r of roots) {
  try {
    const e = fs.readdirSync(r)
    console.log(r, '->', e.slice(0, 60).join(', '))
  } catch (err) { console.log(r, 'ERR', err.code) }
}
