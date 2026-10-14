import fs from 'node:fs'
const base = 'C:/Users/pass/AppData/Roaming/npm/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai'
const e = fs.readdirSync(base)
console.log('count', e.length)
console.log(e.filter(n => /client|ui|session|web|conversation/i.test(n)).join('\n'))
console.log('--- all ---')
console.log(e.join('\n'))
