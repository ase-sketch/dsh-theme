
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync, deflateSync } from 'node:zlib';

function decodePng(buf){
  let off=8,ihdr=null;const idat=[];
  while(off+8<=buf.length){const len=buf.readUInt32BE(off);const t=buf.toString('latin1',off+4,off+8);const d=buf.subarray(off+8,off+8+len);
    if(t==='IHDR')ihdr=d;else if(t==='IDAT')idat.push(d);else if(t==='IEND')break;off+=12+len;}
  const w=ihdr.readUInt32BE(0),h=ihdr.readUInt32BE(4);const raw=inflateSync(Buffer.concat(idat));
  const bpp=4,stride=w*bpp;const rgba=Buffer.alloc(w*h*bpp);let p=0;
  for(let y=0;y<h;y++){const ft=raw[p++];const line=raw.subarray(p,p+stride);p+=stride;
    const cur=rgba.subarray(y*stride,(y+1)*stride);const prev=y>0?rgba.subarray((y-1)*stride,y*stride):null;
    for(let i=0;i<stride;i++){const x=line[i];const a=i>=bpp?cur[i-bpp]:0;const b=prev?prev[i]:0;const c=prev&&i>=bpp?prev[i-bpp]:0;let v;
      switch(ft){case 0:v=x;break;case 1:v=x+a;break;case 2:v=x+b;break;case 3:v=x+((a+b)>>1);break;
        default:{const pp=a+b-c,pa=Math.abs(pp-a),pb=Math.abs(pp-b),pc=Math.abs(pp-c);v=x+(pa<=pb&&pa<=pc?a:pb<=pc?b:c);}}
      cur[i]=v&0xff;}}
  return {w,h,rgba};
}
const CRC=(()=>{const t=new Int32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c;}return t;})();
const crc32=b=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=CRC[(c^b[i])&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
function enc(w,h,rgba){const stride=w*4,raw=Buffer.alloc((stride+1)*h);
 for(let y=0;y<h;y++){raw[y*(stride+1)]=0;rgba.copy(raw,y*(stride+1)+1,y*stride,(y+1)*stride);}
 const ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
 const ch=(t,d)=>{const hd=Buffer.alloc(8);hd.writeUInt32BE(d.length,0);hd.write(t,4,'latin1');const c=Buffer.alloc(4);c.writeUInt32BE(crc32(Buffer.concat([hd.subarray(4),d])),0);return Buffer.concat([hd,d,c]);};
 return Buffer.concat([Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),ch('IHDR',ih),ch('IDAT',deflateSync(raw,{level:9})),ch('IEND',Buffer.alloc(0))]);}

const img=decodePng(readFileSync('E:/dsh-ui/preview/assets/deepy/typing.png'));
let zeroA=0,zeroANonZero=0,rs=0,gs=0,bs=0;
for(let i=0;i<img.w*img.h;i++){const p=i*4;if(img.rgba[p+3]===0){zeroA++;if(img.rgba[p]||img.rgba[p+1]||img.rgba[p+2])zeroANonZero++;rs+=img.rgba[p];gs+=img.rgba[p+1];bs+=img.rgba[p+2];}}
console.log('源图全透明像素 '+zeroA+' 个，其中 RGB 非零 '+zeroANonZero+' 个 ('+(zeroANonZero/zeroA*100).toFixed(2)+'%)');
console.log('全透明像素平均 RGB = ['+(rs/zeroA).toFixed(1)+', '+(gs/zeroA).toFixed(1)+', '+(bs/zeroA).toFixed(1)+']  <- 直接平均法把边缘往这个颜色拽');

function ds(src,srcW,ox0,oy0,S,O,mode){const out=Buffer.alloc(O*O*4);const total=S*S;
  for(let oy=0;oy<O;oy++){const y0=oy*S,y1=(oy+1)*S;
   for(let ox=0;ox<O;ox++){const x0=ox*S,x1=(ox+1)*S;let sA=0,sR=0,sG=0,sB=0,sW=0;
    for(let sy=Math.floor(y0/O);sy<Math.ceil(y1/O);sy++){const wy=Math.min((sy+1)*O,y1)-Math.max(sy*O,y0);if(wy<=0)continue;const rb=(oy0+sy)*srcW;
     for(let sx=Math.floor(x0/O);sx<Math.ceil(x1/O);sx++){const wx=Math.min((sx+1)*O,x1)-Math.max(sx*O,x0);if(wx<=0)continue;
      const p=(rb+ox0+sx)*4;const a=src[p+3];const w=wx*wy;
      if(mode==='premul'){if(a===0)continue;sA+=a*w;sR+=src[p]*a*w;sG+=src[p+1]*a*w;sB+=src[p+2]*a*w;}
      else{sA+=a*w;sR+=src[p]*w;sG+=src[p+1]*w;sB+=src[p+2]*w;sW+=w;}}}
    const o=(oy*O+ox)*4;
    if(mode==='premul'){if(sA===0){out[o+3]=0;}else{out[o]=Math.round(sR/sA);out[o+1]=Math.round(sG/sA);out[o+2]=Math.round(sB/sA);out[o+3]=Math.round(sA/total);}}
    else{if(sW===0){out[o+3]=0;}else{out[o]=Math.round(sR/sW);out[o+1]=Math.round(sG/sW);out[o+2]=Math.round(sB/sW);out[o+3]=Math.round(sA/total);}}}}}
  return out;}

const good=ds(img.rgba,img.w,0,0,260,64,'premul');
const bad=ds(img.rgba,img.w,0,0,260,64,'plain');
let bestD=-1,bestX=0,bestY=0;
for(let y=0;y<64;y++)for(let x=0;x<64;x++){const k=y*64+x;if(good[k*4+3]<8)continue;
  const d=Math.abs(good[k*4]-bad[k*4])+Math.abs(good[k*4+1]-bad[k*4+1])+Math.abs(good[k*4+2]-bad[k*4+2]);
  if(d>bestD){bestD=d;bestX=x;bestY=y;}}
const k=bestY*64+bestX;
console.log('差异最大像素 ('+bestX+','+bestY+') 曼哈顿差 '+bestD);
console.log('  正确版 RGBA=['+good[k*4]+','+good[k*4+1]+','+good[k*4+2]+','+good[k*4+3]+']');
console.log('  错误版 RGBA=['+bad[k*4]+','+bad[k*4+1]+','+bad[k*4+2]+','+bad[k*4+3]+']');
let darker=0,lighter=0,same=0;
for(let m=0;m<64*64;m++){if(good[m*4+3]<8)continue;
  const g=(good[m*4]+good[m*4+1]+good[m*4+2])/3,b=(bad[m*4]+bad[m*4+1]+bad[m*4+2])/3;
  if(b<g-2)darker++;else if(b>g+2)lighter++;else same++;}
console.log('  错误版更暗(往黑/往透明底拽) '+darker+' / 更亮 '+lighter+' / 基本相同 '+same);

const CX=Math.max(0,Math.min(48,bestX-8)),CY=Math.max(0,Math.min(48,bestY-8)),N=16,S=8;
function cropUp(buf,cx,cy){const W=N*S,H=N*S,o=Buffer.alloc(W*H*4);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const sx=cx+((x/S)|0),sy=cy+((y/S)|0);const s=(sy*64+sx)*4,d=(y*W+x)*4;
  o[d]=buf[s];o[d+1]=buf[s+1];o[d+2]=buf[s+2];o[d+3]=buf[s+3];}return {W,H,o};}
const A=cropUp(good,CX,CY),B=cropUp(bad,CX,CY);
function checker(W,H){const o=Buffer.alloc(W*H*4);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const c=(((x>>3)+(y>>3))&1)?0xcc:0xff;const d=(y*W+x)*4;o[d]=c;o[d+1]=c;o[d+2]=c;o[d+3]=255;}return o;}
function over(bg,W,H,fg){const o=Buffer.from(bg);for(let m=0;m<W*H;m++){const a=fg[m*4+3]/255;if(a===0)continue;
 o[m*4]=Math.round(fg[m*4]*a+bg[m*4]*(1-a));o[m*4+1]=Math.round(fg[m*4+1]*a+bg[m*4+1]*(1-a));o[m*4+2]=Math.round(fg[m*4+2]*a+bg[m*4+2]*(1-a));}return o;}
const gap=12,CW=A.W*2+gap*3,CH=A.H+gap*2;
const canvas=Buffer.alloc(CW*CH*4);
for(let m=0;m<CW*CH;m++){canvas[m*4]=0x33;canvas[m*4+1]=0x33;canvas[m*4+2]=0x33;canvas[m*4+3]=255;}
function blit(s,W,H,dx,dy,bg){const comp=over(bg,W,H,s);
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const a=(y*W+x)*4,d=((dy+y)*CW+dx+x)*4;canvas[d]=comp[a];canvas[d+1]=comp[a+1];canvas[d+2]=comp[a+2];canvas[d+3]=255;}}
blit(A.o,A.W,A.H,gap,gap,checker(A.W,A.H));
blit(B.o,B.W,B.H,gap*2+A.W,gap,checker(B.W,B.H));
writeFileSync('E:/dsh-theme/.agents/tmp/m6-assets/premul-zoom8x-typing-f0.png',enc(CW,CH,canvas));
console.log('写出 premul-zoom8x-typing-f0.png '+CW+'x'+CH+' (8x crop @ '+CX+','+CY+'; 左=预乘 / 右=直接平均)');
