
const fs=require('node:fs'), path=require('node:path');
const SRC='E:/dsh-theme/.agents/tmp/m7-icons/package/icons';
const OUT='E:/dsh-theme/plugins/dsh-theme/assets/icons/lucide.json';
const raw=fs.readFileSync(OUT), d=JSON.parse(raw.toString('utf8'));

console.log('== meta ==');
console.log('  generated   :', d.meta.generated, '| doNotEdit 长度:', d.meta.doNotEdit.length);
console.log('  license     :', d.meta.license, '| copyright:', d.meta.copyright);
console.log('  source      :', d.meta.source, '| version:', d.meta.version);
console.log('  generatedAt :', d.meta.generatedAt);
console.log('  count       :', d.meta.count, '| 实际键数:', Object.keys(d.icons).length, '| 一致:', d.meta.count===Object.keys(d.icons).length);
console.log('  licenseText :', d.meta.licenseText.length, '字符, 首行:', d.meta.licenseText.split(/\r?\n/)[0]);

console.log('\n== 体积 ==');
console.log('  bytes:', raw.length, '| MiB:', (raw.length/1048576).toFixed(3), '| 紧凑 JSON');

console.log('\n== 契约 ==');
const names=Object.keys(d.icons);
console.log('  默认 sort() 键序:', JSON.stringify(names)===JSON.stringify([...names].sort()));
console.log('  含 width/height 字段的图标:', names.filter(n=>'width' in d.icons[n]||'height' in d.icons[n]).length);
console.log('  含 class/xmlns 的 attrs  :', names.filter(n=>'class' in d.icons[n].attrs||'xmlns' in d.icons[n].attrs).length);
console.log('  elements 为空            :', names.filter(n=>!d.icons[n].elements.length).length);
console.log('  缺 viewBox               :', names.filter(n=>!d.icons[n].viewBox).length);
console.log('  记录字段集合             :', JSON.stringify([...new Set(names.flatMap(n=>Object.keys(d.icons[n])))]));
const childOverride=names.filter(n=>d.icons[n].elements.some(e=>e.attrs['stroke-width']||e.attrs.fill));
console.log('  子元素覆盖 stroke-width/fill 的图标数:', childOverride.length, '(样例:', childOverride.slice(0,3).join(','), ')');

console.log('\n== 全量 round-trip 几何等价（JSON vs 源 SVG） ==');
const ATTR_RE=/([A-Za-z_:][\w:.-]*)\s*=\s*"([^"]*)"/g;
let bad=0;
for(const name of names){
  const body=fs.readFileSync(path.join(SRC,name+'.svg'),'utf8').replace(/<!--[\s\S]*?-->/g,'');
  const inner=body.slice(body.indexOf('>',body.indexOf('<svg'))+1, body.lastIndexOf('</svg>'));
  const src=[]; const RE=/<([a-z][a-z0-9]*)\b([^>]*?)\/?>/g; let m;
  while((m=RE.exec(inner))!==null){ const a={}; ATTR_RE.lastIndex=0; let x;
    while((x=ATTR_RE.exec(m[2]))!==null) a[x[1]]=x[2]; src.push({tag:m[1],attrs:a}); }
  if(JSON.stringify(src)!==JSON.stringify(d.icons[name].elements)){ if(bad<3) console.log('  MISMATCH',name); bad++; }
}
console.log('  比对', names.length, '个图标, 不一致 =', bad);

console.log('\n== 记录样本 (send) ==');
console.log(JSON.stringify(d.icons.send,null,2));

console.log('\n== LICENSE 副本 ==');
const lic=fs.readFileSync('E:/dsh-theme/plugins/dsh-theme/assets/icons/LICENSE','utf8');
console.log('  字节数:', Buffer.byteLength(lic), '| 含 ISC:', lic.includes('ISC License'), '| 含 copyright:', /copyright/i.test(lic));
console.log('  头两行:\n   ', lic.split(/\r?\n/).slice(0,2).join('\n    '));

console.log('\n== BOM 检查 ==');
console.log('  lucide.json 前 3 字节:', [...raw.subarray(0,3)], '(0xEF 0xBB 0xBF 即 BOM，应不含)');
