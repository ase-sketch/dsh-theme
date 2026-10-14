
const fs = require('node:fs');
const crypto = require('node:crypto');
const OUT = 'E:/dsh-theme/plugins/dsh-theme/assets/icons/lucide.json';
const raw = fs.readFileSync(OUT);
const data = JSON.parse(raw.toString('utf8'));

console.log('== 1. 加载与 count 一致性 ==');
console.log('  JSON.parse            : OK');
console.log('  meta.count            :', data.meta.count);
console.log('  Object.keys(icons).len:', Object.keys(data.icons).length);
console.log('  count 一致            :', data.meta.count === Object.keys(data.icons).length);
console.log('  meta.source           :', data.meta.source);
console.log('  meta.license          :', data.meta.license);
console.log('  meta.copyright        :', data.meta.copyright);
console.log('  meta.generatedAt      :', data.meta.generatedAt);

console.log('\n== 2. 抽查 12 个常见图标 ==');
const spot = ['send','plus','settings','paperclip','mic','x','check','chevron-down','chevron-right','user','bot','search','trash-2'];
let allOk = true;
for (const n of spot) {
  const ic = data.icons[n];
  const ok = !!ic && Array.isArray(ic.elements) && ic.elements.length > 0;
  if (!ok) allOk = false;
  console.log('  ' + n.padEnd(15) + (ok ? 'elements=' + ic.elements.length + '  viewBox=' + ic.viewBox + '  tags=' + ic.elements.map(e=>e.tag).join(',') : '❌ MISSING'));
}
console.log('  全部存在且 elements 非空:', allOk);

console.log('\n== 3. 体积 ==');
console.log('  字节数:', raw.length);
console.log('  MiB   :', (raw.length/1024/1024).toFixed(3));
console.log('  sha256:', crypto.createHash('sha256').update(raw).digest('hex'));

console.log('\n== 4. 结构抽样 (send) ==');
console.log(JSON.stringify(data.icons.send, null, 2));

console.log('\n== 5. 全量健康检查 ==');
const names = Object.keys(data.icons);
const bad = names.filter(n => !Array.isArray(data.icons[n].elements) || data.icons[n].elements.length === 0);
const noVB = names.filter(n => !data.icons[n].viewBox);
const vbSet = [...new Set(names.map(n => data.icons[n].viewBox))];
const wh = new Set(names.map(n => data.icons[n].width + 'x' + data.icons[n].height));
const tagCount = {};
let el = 0, maxEl = 0, maxElName = '';
for (const n of names) { const e = data.icons[n].elements.length; el += e; if (e > maxEl) { maxEl = e; maxElName = n; } for (const x of data.icons[n].elements) tagCount[x.tag] = (tagCount[x.tag]||0)+1; }
console.log('  elements 为空的图标 :', bad.length, bad.slice(0,5).join(','));
console.log('  缺 viewBox 的图标   :', noVB.length);
console.log('  viewBox 取值集合    :', JSON.stringify(vbSet));
console.log('  width x height 集合 :', JSON.stringify([...wh]));
console.log('  元素总数            :', el, '| 单图标最多:', maxEl, '(' + maxElName + ')');
console.log('  标签分布            :', JSON.stringify(tagCount));
console.log('  键已排序(确定性)    :', JSON.stringify(names) === JSON.stringify([...names].sort()));
