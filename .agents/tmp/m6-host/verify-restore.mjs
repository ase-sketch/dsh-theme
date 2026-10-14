import fs from 'node:fs'
import { createHash } from 'node:crypto'
const a = fs.readFileSync('E:/dsh-theme/plugins/dsh-theme/host/index.js')
const b = fs.readFileSync('E:/dsh-theme/.agents/tmp/m6-host/index.js.orig')
const md5 = (x) => createHash('md5').update(x).digest('hex')
console.log('当前 md5:', md5(a))
console.log('备份 md5:', md5(b))
console.log('与负控制前备份逐字节一致:', a.equals(b))
const text = a.toString('utf8')
console.log('残留临时突变 (ok:true, file:path.join):', text.includes('ok: true, file: path.join') ? '是 —— 危险' : '无')
console.log('残留双解码:', /decodeURIComponent\(decodeURIComponent/.test(text) ? '是 —— 危险' : '无')
console.log('纯函数调用已恢复:', text.includes('resolveDeepyAsset(pathname.slice(') ? '是' : '否')
console.log('行数:', text.split('\n').length)