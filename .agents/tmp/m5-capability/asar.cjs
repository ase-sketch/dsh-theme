const fs = require('fs');
const ASAR = 'C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';
const buf = fs.readFileSync(ASAR);
const jsonLen = buf.readUInt32LE(12);
const headerStart = 16;
const header = JSON.parse(buf.toString('utf8', headerStart, headerStart + jsonLen));
const dataStart = 8 + buf.readUInt32LE(4); // header pickle size (8) + size pickle
const baseOffset = headerStart + jsonLen;
const cmd = process.argv[2];

function node(p) {
  const parts = p.split('/').filter(Boolean);
  let cur = header;
  for (const part of parts) {
    if (!cur.files || !cur.files[part]) return null;
    cur = cur.files[part];
  }
  return cur;
}
function readEntry(n) {
  if (!n.offset) return null;
  const off = baseOffset + Number(n.offset);
  return buf.subarray(off, off + n.size);
}
if (cmd === 'ls') {
  const re = new RegExp(process.argv[3], 'i');
  const out = [];
  (function walk(n, prefix) {
    for (const [k, v] of Object.entries(n.files || {})) {
      const p = prefix + '/' + k;
      if (v.files) walk(v, p); else out.push('F ' + p + '\t' + v.size);
    }
  })(header, '');
  console.log(out.filter(l => re.test(l)).join('\n'));
} else if (cmd === 'read') {
  const n = node(process.argv[3]);
  if (!n) { console.error('NOT FOUND'); process.exit(2); }
  if (n.files) { console.error('IS DIR'); process.exit(2); }
  const b = readEntry(n);
  process.stdout.write(b.toString('utf8'));
}
