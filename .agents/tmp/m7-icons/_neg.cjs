
const fs=require('node:fs'), path=require('node:path');
const {execFileSync}=require('node:child_process');
const badDir='E:/dsh-theme/.agents/tmp/m7-icons/badsrc';
fs.mkdirSync(badDir,{recursive:true});
const cases={
 'ok-baseline.svg':'<svg viewBox="0 0 24 24"><path d="M0 0"/></svg>',
 'bad-tag.svg':'<svg viewBox="0 0 24 24"><path d="M0 0"/><use href="#a"/></svg>',
 'bad-residual.svg':'<svg viewBox="0 0 24 24"><path d="M0 0"/>GARBAGE</svg>',
 'bad-noroot.svg':'not an svg at all',
 'bad-empty.svg':'<svg viewBox="0 0 24 24"></svg>',
};
for(const [f,c] of Object.entries(cases)) fs.writeFileSync(path.join(badDir,f),c);
for(const f of Object.keys(cases)){
  let code=0,msg='';
  try{
    execFileSync(process.execPath,['E:/dsh-theme/scripts/build-icons.mjs','--src',badDir,'--version','9.9.9',
      '--out','E:/dsh-theme/.agents/tmp/m7-icons/bad.json'],{stdio:'pipe',encoding:'utf8'});
  }catch(e){ code=e.status; msg=(e.stderr||'').trim(); }
  const last=msg.split(/\r?\n/).filter(l=>l.trim()).pop()||'(构建成功，无 stderr)';
  console.log('  '+f.padEnd(20)+' exit='+code+' | '+last.slice(0,150));
}
fs.rmSync(badDir,{recursive:true,force:true});
fs.rmSync('E:/dsh-theme/.agents/tmp/m7-icons/bad.json',{force:true});
