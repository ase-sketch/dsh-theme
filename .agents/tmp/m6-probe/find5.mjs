import fs from 'node:fs'
import { readHeader } from './asar.mjs'
const ASAR = 'C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/app.asar'
const { header } = readHeader(ASAR)
console.log('top keys:', Object.keys(header.files || {}).join(', '))
const dsh = header.files.dsh
console.log('dsh keys:', Object.keys(dsh.files || {}).join(', '))
const nm = dsh.files && dsh.files.node_modules
if (nm) {
  const keys = Object.keys(nm.files || {})
  console.log('node_modules count:', keys.length)
  console.log(keys.slice(0, 80).join('\n'))
  const ds = nm.files['@deepseek-ai']
  if (ds) console.log('@deepseek-ai:', Object.keys(ds.files).join('\n'))
}
