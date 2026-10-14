import fs from 'node:fs'
function list(p, n = 100) {
  try { return fs.readdirSync(p).slice(0, n) } catch (e) { return ['ERR ' + e.code] }
}
const g = 'C:/Users/pass/AppData/Roaming/npm/node_modules'
console.log('global npm:', list(g).join(', '))
const ds = g + '/@deepseek-ai'
console.log('@deepseek-ai global:', list(ds).join('\n'))
// 也看看 desktop app 的 runtime/cli
console.log('runtime/cli:', list('C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/runtime/cli').join(', '))
