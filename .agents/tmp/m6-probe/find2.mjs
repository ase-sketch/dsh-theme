import fs from 'node:fs'
const dir = 'C:/Users/pass/.dsh/profiles/web/node_modules/@deepseek-ai'
const e = fs.readdirSync(dir)
console.log('count', e.length)
console.log(e.join('\n'))
