const fs = require('fs');
const ASAR = process.argv[2];
const buf = fs.readFileSync(ASAR);
const jsonLen = buf.readUInt32LE(12);
const header = JSON.parse(buf.toString('utf8', 16, 16 + jsonLen));
const out = [];
function walk(node, prefix, depth) {
  if (depth > 4) return;
  for (const [k, v] of Object.entries(node.files || {})) {
    const p = prefix + '/' + k;
    if (v.files) { out.push('D ' + p); walk(v, p, depth + 1); }
    else out.push('F ' + p + '\t' + v.size);
  }
}
walk(header, '', 0);
const mode = process.argv[3] || 'list';
if (mode === 'list') {
  console.log('TOTAL:', out.length);
  console.log(out.filter(l => l.startsWith('D ')).join('\n'));
} else {
  const re = new RegExp(mode, 'i');
  console.log(out.filter(l => re.test(l)).join('\n'));
}
