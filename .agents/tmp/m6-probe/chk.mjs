import fs from 'node:fs'
function head(p, n = 60) {
  try { return fs.readFileSync(p, 'utf8').split('\n').slice(0, n).join('\n') } catch (e) { return 'ERR ' + e.code }
}
console.log('=== ~/.dsh/settings.yaml (first 60) ===')
console.log(head('C:/Users/pass/.dsh/settings.yaml'))
console.log('\n=== ~/.dsh exists files ===')
console.log(fs.readdirSync('C:/Users/pass/.dsh').filter(f => /settings|credential|model/i.test(f)).join(', '))
console.log('\n=== ~/.dsh/models ===')
try { console.log(fs.readdirSync('C:/Users/pass/.dsh/models').join(', ')) } catch (e) { console.log('ERR', e.code) }
console.log('\n=== web profile files ===')
console.log(fs.readdirSync('C:/Users/pass/.dsh/profiles/web').join(', '))
