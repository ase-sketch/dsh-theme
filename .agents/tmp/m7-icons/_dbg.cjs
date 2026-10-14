
const fs=require('node:fs');
const data=JSON.parse(fs.readFileSync('E:/dsh-theme/plugins/dsh-theme/assets/icons/lucide.json','utf8'));
const names=Object.keys(data.icons);
const sorted=[...names].sort();
let i=0; while(i<names.length && names[i]===sorted[i]) i++;
console.log('第一个分歧下标:', i);
console.log('  file:', JSON.stringify(names.slice(Math.max(0,i-2), i+4)));
console.log('  sort:', JSON.stringify(sorted.slice(Math.max(0,i-2), i+4)));
console.log('numeric-like 键:', names.filter(n=>/^(0|[1-9]\d*)$/.test(n)));
console.log('cmp:', JSON.stringify(names[i])+' vs '+JSON.stringify(sorted[i]));
