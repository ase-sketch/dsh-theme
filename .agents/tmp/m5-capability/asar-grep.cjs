const fs = require('fs');
const ASAR = 'C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';
const buf = fs.readFileSync(ASAR);
const jsonLen = buf.readUInt32LE(12);
const headerStart = 16;
const header = JSON.parse(buf.toString('utf8', headerStart, headerStart + jsonLen));
const baseOffset = headerStart + jsonLen;
const pat = new RegExp(process.argv[2]);
const pathRe = new RegExp(process.argv[3] || '.');
const extRe = new RegExp(process.argv[4] || '\\.(js|ts|md|json|yml|yaml)$');
const maxHits = Number(process.argv[5] || 200);
let hits = 0;
const entries = [];
(function walk(n, prefix) {
  for (const [k, v] of Object.entries(n.files || {})) {
    const p = prefix + '/' + k;
    if (v.files) walk(v, p); else entries.push([p, v]);
  }
})(header, '');
for (const [p, n] of entries) {
  if (hits >= maxHits) break;
  if (!pathRe.test(p) || !extRe.test(p)) continue;
  if (!n.offset) continue;
  const off = baseOffset + Number(n.offset);
  const text = buf.subarray(off, off + n.size).toString('utf8');
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (pat.test(lines[i])) {
      console.log(p + ':' + (i + 1) + ': ' + lines[i].trim().slice(0, 240));
      if (++hits >= maxHits) break;
    }
  }
}
console.error('hits=' + hits);
