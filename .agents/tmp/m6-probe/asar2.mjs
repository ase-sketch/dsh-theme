import fs from 'node:fs'
const ASAR = 'C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/app.asar'
const fd = fs.openSync(ASAR, 'r')
const head = Buffer.alloc(32)
fs.readSync(fd, head, 0, 32, null)
console.log('first 32 bytes hex:', head.toString('hex'))
console.log('u32le x8:', Array.from({ length: 8 }, (_, i) => head.readUInt32LE(i * 4)).join(','))
fs.closeSync(fd)
