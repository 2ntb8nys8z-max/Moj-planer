const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const engines=require('playwright'),kind=process.env.PLANNER_BROWSER||'chromium',base=path.resolve('.');
const reference=fs.readFileSync('tests/fixtures/octi-listening-approved-33-239.js','utf8');
// This frozen renderer was recovered from 058ddbf, not derived from the fix.
const referenceHash='9176961b8a12a14c41c107aa45c90726fbead6429854ccc9abc523de9864665a';
assert.equal(crypto.createHash('sha256').update(reference).digest('hex'),referenceHash);
(async()=>{
 const browser=await engines[kind].launch({headless:true,...(kind==='chromium'?{args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
 fs.mkdirSync('test-results/okti-listening/history',{recursive:true});
 try{
  const page=await browser.newPage({viewport:{width:750,height:500}});page.setDefaultTimeout(15000);
  await page.route('**/*',route=>{
   const url=new URL(route.request().url());if(url.origin!=='https://planner.test')return route.fulfill({status:404,body:''});
   if(url.pathname==='/history.html')return route.fulfill({contentType:'text/html',body:'<!doctype html><html><style>body{font:14px system-ui;background:#eef7fc;display:flex;gap:30px}figure{margin:25px 0}canvas{width:160px;height:160px}video{width:1px;height:1px;position:absolute;opacity:0}</style><script src="octi-listening.js"></script><script src="tests/fixtures/octi-listening-approved-33-239.js"></script>'});
   const file=path.resolve(base,url.pathname.slice(1));if(!file.startsWith(base+'/')||!fs.existsSync(file))return route.fulfill({status:404,body:''});
   if(file.endsWith('octi-listening.js'))return route.fulfill({contentType:'application/javascript',body:fs.readFileSync(file,'utf8').replace('window.createOctiListeningArtwork=', 'window.createCurrentOktiRenderer=createRenderer;window.createSoftwareOktiRenderer=createSoftwareRenderer;window.createOctiListeningArtwork=')});
   const bytes=fs.readFileSync(file),type={'.js':'application/javascript','.webp':'image/webp','.mp4':'video/mp4'}[path.extname(file)]||'application/octet-stream';
   if(file.endsWith('.mp4')){const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);if(range){const start=+range[1],end=range[2]?Math.min(+range[2],bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(start,end+1),contentType:type,headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`}})}}
   return route.fulfill({body:bytes,contentType:type});
  });
  await page.goto('https://planner.test/history.html');
  await page.evaluate(async()=>{
   const image=src=>new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=src});
   const [head,background,poster]=await Promise.all(['octi-listening-head.webp','octi-listening-background.webp','octi-actor-poster.webp'].map(image));
   const video=document.createElement('video');video.muted=true;video.playsInline=true;video.loop=true;video.src='octi-listening-body.mp4';document.body.append(video);await video.play();video.pause();video.currentTime=0;await new Promise(resolve=>video.seeking?video.addEventListener('seeked',resolve,{once:true}):resolve());
   // WebKit may finish a decoded-frame swap after seeked, even while paused.
   // All three renderers must sample the same immutable decoded texels.
   const frozen=document.createElement('canvas');frozen.width=video.videoWidth;frozen.height=video.videoHeight;frozen.getContext('2d').drawImage(video,0,0);Object.assign(frozen,{videoWidth:frozen.width,videoHeight:frozen.height,readyState:4,currentTime:0});
   const make=label=>{const figure=document.createElement('figure'),caption=document.createElement('figcaption'),c=document.createElement('canvas');caption.textContent=label;figure.append(c,caption);document.body.append(figure);return c};
   const historical=make('Oryginał 33.239'),current=make('Przywrócony ruch'),software=make('Tryb awaryjny');
   const atlas=document.createElement('canvas');atlas.width=1088;atlas.height=544;const ctx=atlas.getContext('2d');ctx.drawImage(poster,0,0,544,544);const rgba=ctx.getImageData(0,0,544,544).data,opaque=ctx.createImageData(1088,544);
   for(let y=0;y<544;y++)for(let x=0;x<544;x++){const a=(y*544+x)*4,b=(y*1088+x)*4;for(let i=0;i<3;i++){opaque.data[b+i]=rgba[a+i];opaque.data[b+544*4+i]=rgba[a+3];}opaque.data[b+3]=opaque.data[b+544*4+3]=255;}ctx.putImageData(opaque,0,0);
   window.historyQA={historical,current,software,video:frozen,head,background,poster,atlas,original:createApprovedOktiRenderer(historical,frozen,head,background),gpu:createCurrentOktiRenderer(current,frozen,head),cpu:createSoftwareOktiRenderer(software,frozen,head,poster)};
  });
  for(const [a,lag,g,clock] of [[0,0,0,0],[.35,.25,0,1.1],[1,.98,.2,1.8],[1,1,1,2.6],[.5,.6,.35,3.7]]){
   const metrics=await page.evaluate(({a,lag,g,clock})=>{
    const q=historyQA,state={approach:a,lag,gesture:g,clock,phase:0,videoAvailable:true};q.original.draw(state);q.gpu.draw(state);q.cpu.draw(state);
    function pixels(c,gpu){const n=c.width,out=new Uint8Array(n*n*4);if(gpu){const gl=c.getContext('webgl'),raw=new Uint8Array(out.length);gl.readPixels(0,0,n,n,gl.RGBA,gl.UNSIGNED_BYTE,raw);for(let y=0;y<n;y++)out.set(raw.subarray((n-1-y)*n*4,(n-y)*n*4),y*n*4);}else{out.set(c.getContext('2d').getImageData(0,0,n,n).data);for(let i=0;i<out.length;i+=4)for(let k=0;k<3;k++)out[i+k]=Math.round(out[i+k]*out[i+3]/255);}return out;}
    const old=pixels(q.historical,true),gpu=pixels(q.current,true),cpu=pixels(q.software,false);const mean=data=>data.reduce((sum,v,i)=>sum+Math.abs(v-old[i]),0)/old.length;
    return {a,lag,g,clock,gpuDifference:mean(gpu),softwareDifference:mean(cpu)};
   },{a,lag,g,clock});
   console.log(kind+': historical pose '+JSON.stringify(metrics));
   await page.screenshot({path:`test-results/okti-listening/history/${kind}-approach-${a}-gesture-${g}.png`});
   assert.ok(metrics.gpuDifference<.1,'The restored GPU pose must match the historical renderer pixel for pixel');assert.ok(metrics.softwareDifference<.5,'The software renderer must retain the historical complete silhouette and head projection');
  }
  const poster=await page.evaluate(()=>{
   const q=historyQA,canvas=document.createElement('canvas');canvas.style.width='160px';document.body.append(canvas);const cpu=createSoftwareOktiRenderer(canvas,q.video,q.head,q.poster);
   // Use identical image sources in the no-video comparison; poster alpha has
   // antialiased edges whereas the GPU atlas applies its existing matte curve.
   const refCanvas=document.createElement('canvas');refCanvas.style.width='160px';document.body.append(refCanvas);const old=createApprovedOktiRenderer(refCanvas,q.atlas,q.head,q.background),state={approach:1,lag:1,gesture:1,clock:2.6,phase:0,videoAvailable:false};old.draw(state);cpu.draw(state);
   const gl=refCanvas.getContext('webgl'),n=refCanvas.width,raw=new Uint8Array(n*n*4);gl.readPixels(0,0,n,n,gl.RGBA,gl.UNSIGNED_BYTE,raw);const rgba=canvas.getContext('2d').getImageData(0,0,n,n).data;let sum=0;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=(y*n+x)*4,j=((n-1-y)*n+x)*4;for(let k=0;k<3;k++)sum+=Math.abs(Math.round(rgba[i+k]*rgba[i+3]/255)-raw[j+k]);sum+=Math.abs(rgba[i+3]-raw[j+3]);}old.destroy();cpu.destroy();return sum/raw.length;
  });
  assert.ok(poster<.5,'A blocked video retains the same approved silhouette, using the transparent poster');console.log(kind+': historical poster fallback mean difference '+poster);
  await page.close();console.log('Historical Okti '+kind+': recovered GPU pose, perspective, arm fan and software recovery match the 33.239 reference.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
