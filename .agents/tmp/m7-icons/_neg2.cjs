
const fs=require('node:fs'), path=require('node:path');
const {execFileSync}=require('node:child_process');
const root='E:/dsh-theme/.agents/tmp/m7-icons/neg';
fs.rmSync(root,{recursive:true,force:true});
const cases={
 'ok-baseline'  :'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M0 0"/></svg>',
 'bad-tag'      :'<svg viewBox="0 0 24 24"><path d="M0 0"/><use href="#a"/></svg>',
 'bad-residual' :'<svg viewBox="0 0 24 24"><path d="M0 0"/>GARBAGE</svg>',
 'bad-noroot'   :'not an svg at all',
 'bad-empty'    :'<svg viewBox="0 0 24 24"></svg>',
};
for(const [name,content] of Object.entries(cases)){
  const d=path.join(root,name,'icons'); fs.mkdirSync(d,{recursive:true});
  fs.writeFileSync(path.join(d,name+'.svg'),content);
  fs.writeFileSync(path.join(root,name,'package.json'),JSON.stringify({name:'x',version:'9.9.9'}));
  fs.writeFileSync(path.join(root,name,'LICENSE'),'ISC License\n\nCopyright (c) 2026 Test\n');
  let code=0,msg='';
  try{
    execFileSync(process.execPath,['E:/dsh-theme/scripts/build-icons.mjs','--src',d,
      '--out',path.join(root,name,'out.json')],{stdio:'pipe',encoding:'utf8'});
  }catch(e){ code=e.status; msg=(e.stderr||'').trim(); }
  const last=msg.split(/\r?\n/).filter(l=>l.trim()).pop()||'(构建成功，无 stderr)';
  console.log('  '+name.padEnd(14)+' exit='+code+' | '+last.slice(0,140));
}
// 缺 LICENSE 必须报错（ISC 合规不得静默跳过）
const d=path.join(root,'no-license','icons'); fs.mkdirSync(d,{recursive:true});
fs.writeFileSync(path.join(d,'a.svg'),cases['ok-baseline']);
fs.writeFileSync(path.join(root,'no-license','package.json'),JSON.stringify({version:'9.9.9'}));
let code=0,msg='';
try{ execFileSync(process.execPath,['E:/dsh-theme/scripts/build-icons.mjs','--src',d,'--out',path.join(root,'nl.json')],{stdio:'pipe',encoding:'utf8'}); }
catch(e){ code=e.status; msg=(e.stderr||'').trim(); }
console.log('  '+'no-license'.padEnd(14)+' exit='+code+' | '+msg.split(/\r?\n/).filter(l=>l.trim()).pop().slice(0,140));
fs.rmSync(root,{recursive:true,force:true});
