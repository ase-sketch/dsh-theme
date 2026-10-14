const fs = require('fs');
const ASAR = 'C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';
const buf = fs.readFileSync(ASAR);
const jsonLen = buf.readUInt32LE(12);
const headerStart = 16;
const header = JSON.parse(buf.toString('utf8', headerStart, headerStart + jsonLen));
const baseOffset = headerStart + jsonLen;
const pathRe = new RegExp(process.argv[2] || 'dsh-client');
const entries = [];
(function walk(n, prefix) {
  for (const [k, v] of Object.entries(n.files || {})) {
    const p = prefix + '/' + k;
    if (v.files) walk(v, p); else entries.push([p, v]);
  }
})(header, '');
const inject = new Map(), register = new Map(), render = new Map(), exts = new Map();
for (const [p, n] of entries) {
  if (!pathRe.test(p)) continue;
  const ext = p.slice(p.lastIndexOf('.'));
  exts.set(ext, (exts.get(ext) || 0) + 1);
  if (!/\.(js|mjs|cjs)$/.test(p) || !n.offset) continue;
  const off = baseOffset + Number(n.offset);
  const text = buf.subarray(off, off + n.size).toString('utf8');
  const pkg = p.replace('/lib/', '|').split('|')[0].split('/').pop();
  let m;
  const reInj = /slots\.inject\(\s*"([^"]+)"/g;
  while ((m = reInj.exec(text))) inject.set(m[1], (inject.get(m[1]) || []).concat(pkg));
  const reReg = /slots\.register\(\s*\{[^}]*?name:\s*"([^"]+)"/gs;
  while ((m = reReg.exec(text))) register.set(m[1], (register.get(m[1]) || []).concat(pkg));
  const reRen = /renderSlot\(\s*"([^"]+)"/g;
  while ((m = reRen.exec(text))) render.set(m[1], (render.get(m[1]) || []).concat(pkg));
}
const uniq = (arr) => [...new Set(arr)].join(',');
console.log('=== EXTENSIONS ===');
console.log([...exts.entries()].sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+' '+v).join('\n'));
console.log('\n=== SLOT IDS injected into (id -> count, sample packages) ===');
for (const [k, v] of [...inject.entries()].sort()) console.log(k + '  [n=' + v.length + '] ' + uniq(v));
console.log('\n=== registered names ===');
for (const [k, v] of [...register.entries()].sort()) console.log(k + '  [n=' + v.length + '] ' + uniq(v));
console.log('\n=== renderSlot names ===');
for (const [k, v] of [...render.entries()].sort()) console.log(k + '  [n=' + v.length + '] ' + uniq(v));
