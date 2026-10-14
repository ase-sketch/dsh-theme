import fs from 'node:fs'
import path from 'node:path'
const D = 'C:/Users/pass/.dsh'
for (const f of ['settings.yaml.bak-uninstall-20260920', 'settings.yaml.imported', 'settings.headless.yaml']) {
  const p = path.join(D, f)
  try {
    const t = fs.readFileSync(p, 'utf8')
    console.log('### ' + f + ' (' + t.length + ' bytes)')
    console.log(t.slice(0, 1200))
    console.log('...')
  } catch (e) { console.log('### ' + f + ' ERR ' + e.code) }
}
// desktop profile dir listing (all files incl hidden)
console.log('\n=== desktop profile all ===')
try { console.log(fs.readdirSync(path.join(D, 'profiles/desktop')).join(', ')) } catch (e) { console.log('ERR', e.code) }
