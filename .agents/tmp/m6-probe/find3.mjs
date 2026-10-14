import fs from 'node:fs'
import path from 'node:path'
function list(p, n = 40) {
  try { return fs.readdirSync(p).slice(0, n).join(', ') } catch (e) { return 'ERR ' + e.code }
}
console.log('app.asar.unpacked ->', list('C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/app.asar.unpacked'))
console.log('dsh-runtimes ->', list('C:/Users/pass/.dsh/dsh-runtimes'))
console.log('web .pnpm ->', list('C:/Users/pass/.dsh/profiles/web/node_modules/.pnpm', 80))
console.log('web pkg ->', fs.readFileSync('C:/Users/pass/.dsh/profiles/web/package.json', 'utf8'))
// 试试 node 能否直接读 asar 内文件
try {
  const p = 'C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/app.asar/dsh/package.json'
  console.log('asar read ok?', fs.readFileSync(p, 'utf8').slice(0, 200))
} catch (e) { console.log('asar read ERR', e.code, e.message) }
