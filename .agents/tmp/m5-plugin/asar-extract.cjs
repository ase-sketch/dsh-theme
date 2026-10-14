// Extract a file (or a line range) out of the DSH app.asar for read-only inspection.
const fs = require('fs');
const ASAR = 'C:/Users/pass/AppData/Local/Programs/DeepSeek Harness/resources/app.asar';
const buf = fs.readFileSync(ASAR);
const jsonLen = buf.readUInt32LE(12);
const headerStart = 16;
const header = JSON.parse(buf.toString('utf8', headerStart, headerStart + jsonLen));
const baseOffset = headerStart + jsonLen;
const target = process.argv[2];
const from = Number(process.argv[3] || 1);
const to = Number(process.argv[4] || 0);
function find(node, prefix) {
  for (const [k, v] of Object.entries(node.files || {})) {
    const p = prefix + '/' + k;
    if (v.files) { const r = find(v, p); if (r) return r; }
    else if (p === target) return v;
  }
  return null;
}
const n = find(header, '');
if (!n) { console.error('not found: ' + target); process.exit(1); }
const off = baseOffset + Number(n.offset);
const lines = buf.subarray(off, off + n.size).toString('utf8').split('\n');
const end = to > 0 ? to : lines.length;
for (let i = from - 1; i < Math.min(end, lines.length); i++) console.log((i + 1) + '\t' + lines[i]);
