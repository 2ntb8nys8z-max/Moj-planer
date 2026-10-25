const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=path.resolve('.');
async function routeFiles(page,failMedia=false){
 await page.route('**/*',route=>{
  const url=new URL(route.request().url()),file=path.resolve(base,url.pathname==='/'?'preview33/index.html':url.pathname.slice(1));
  if(url.origin==='https://planner.test'&&file.startsWith(base+'/')&&fs.existsSync(file)&&fs.statSync(file).isFile()){
   const bytes=fs.readFileSync(file),types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2','.ttf':'font/ttf'};
   if(file.endsWith('octi-water-motion.webp')&&failMedia==='all-media-fail')return route.fulfill({status:404,body:'missing animated image'});
   if(file.endsWith('.mp4')){
    if(failMedia)return route.fulfill({status:404,body:'missing clip'});
    const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(start,end+1),contentType:'video/mp4',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`,'content-length':String(end-start+1)}});}
   }
   return route.fulfill({body:bytes,contentType:types[path.extname(file)]||'application/json',headers:{'accept-ranges':'bytes'}});
  }
  return route.fulfill({body:route.request().resourceType()==='script'?'':'{}',contentType:route.request().resourceType()==='script'?'application/javascript':'application/json'});
 });
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-accelerated-video-decode']});
 try{
  for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));await routeFiles(page);await page.goto('https://planner.test/preview33/index.html');
   const dock=page.locator('.octi-dock[data-channel=main]'),video=dock.locator('video.octi-motion-video');
   await page.waitForFunction(()=>{const v=document.querySelector('.octi-dock[data-channel=main] video');return v.readyState>=2&&!v.paused&&v.parentElement.classList.contains('is-playing')});
   const before=await video.evaluate(v=>v.currentTime);await page.waitForTimeout(250);assert.ok(await video.evaluate(v=>v.currentTime)>before,'The actual decoded clip advances');
   const geometry=await dock.evaluate(root=>{const b=root.querySelector('.voice'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),app=document.querySelector('.app');return {hit:hit===b||b.contains(hit),width:r.width,bottom:r.bottom,overflow:document.documentElement.scrollWidth>innerWidth,verticalOverflow:app.scrollHeight-app.clientHeight,muted:root.querySelector('video').muted,inline:root.querySelector('video').playsInline}});
   assert.equal(geometry.hit,true);assert.ok(geometry.width>=44);assert.ok(geometry.bottom<=height);assert.equal(geometry.overflow,false);assert.equal(geometry.verticalOverflow,0,'Decorative video margins cannot create scrollable app overflow');assert.equal(geometry.muted,true);assert.equal(geometry.inline,true);
   assert.equal(await dock.locator('.commands').isVisible(),false,'Idle suggestions stay absent');
   assert.equal(await page.locator('.octi-dock:not([data-channel=main]) video[src]').count(),0,'Hidden contexts do not load or play duplicate clips');
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>{const v=document.querySelector('.octi-dock[data-channel=main] video');return v.paused&&!v.parentElement.classList.contains('is-playing')});
   assert.ok(await dock.locator('.octi-motion-poster').evaluate(img=>img.complete&&img.naturalWidth===544),'Reduced motion keeps the approved blue poster');
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main] video').paused);
   if(width===390){
    const quality=await video.evaluate(async v=>{
     const c=document.createElement('canvas');c.width=c.height=544;const ctx=c.getContext('2d',{willReadFrequently:true}),tops=[];
     async function frame(t){v.pause();await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=t});ctx.drawImage(v,0,0,544,544);return ctx.getImageData(0,0,544,544).data;}
     for(const t of [0,.72,1.6,2.4,3.2,4.1]){const pixels=await frame(t);let top=200;for(let y=110;y<200;y++){let blue=0;for(let x=250;x<290;x++){const i=(y*544+x)*4;if(pixels[i]<110&&pixels[i+1]>60&&pixels[i+2]>140&&pixels[i+2]-pixels[i+1]>17)blue++;}if(blue>15){top=y;break;}}tops.push(top);}
     const pixels=await frame(1.8),eyes=[];
     for(const [left,right] of [[230,269],[275,314]]){let minX=544,maxX=0,minY=544,maxY=0;for(let y=207;y<245;y++)for(let x=left;x<right;x++){const i=(y*544+x)*4;if(pixels[i]>225&&pixels[i+1]>230&&pixels[i+2]>235){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}eyes.push({width:maxX-minX+1,height:maxY-minY+1});}
     const a=await frame(.8),b=await frame(4.0);let difference=0,pixelCount=0;for(let y=304;y<405;y++)for(let x=130;x<410;x++){const i=(y*544+x)*4;if((a[i+2]-a[i]>100&&a[i+1]>70)||(b[i+2]-b[i]>100&&b[i+1]>70)){for(let k=0;k<3;k++)difference+=Math.abs(a[i+k]-b[i+k]);pixelCount+=3;}}
     const edge=[];for(const t of [v.duration-3/60,v.duration-2/60,v.duration-1/60,0,1/60,2/60])edge.push(await frame(t));
     const delta=(a,b,c)=>{let sum=0,count=0;for(let y=280;y<435;y++)for(let x=120;x<424;x++){const i=(y*544+x)*4;for(let k=0;k<3;k++){sum+=Math.abs(c?(b[i+k]-a[i+k])-(c[i+k]-b[i+k]):a[i+k]-b[i+k]);count++;}}return sum/count;};
     const loop={seam:delta(edge[2],edge[3]),neighbors:[delta(edge[0],edge[1]),delta(edge[1],edge[2]),delta(edge[3],edge[4]),delta(edge[4],edge[5])],velocity:delta(edge[2],edge[3],edge[4]),neighborVelocities:[delta(edge[0],edge[1],edge[2]),delta(edge[3],edge[4],edge[5])]};
     return {duration:v.duration,tops,eyes,armDifference:difference/pixelCount,loop};
    });
    assert.ok(Math.abs(quality.duration-4.8)<.1);assert.ok(Math.max(...quality.tops)-Math.min(...quality.tops)<17,'The head stays calm instead of dipping at the end');
    for(const eye of quality.eyes){assert.ok(eye.width>20);assert.ok(eye.height/eye.width<.48,'The approved eyes are shallow tapered crescents, not semicircles');}
    assert.ok(quality.armDifference>2,'Opposite loop phases must differ; the second half must not replay the first half backwards');
    assert.ok(quality.loop.seam>.01,'The loop continues moving across its boundary');
    assert.ok(quality.loop.seam<Math.max(...quality.loop.neighbors)*1.8+.3,'The decoded loop boundary is no larger than an ordinary neighboring movement: '+JSON.stringify(quality.loop));
    assert.ok(quality.loop.velocity<Math.max(...quality.loop.neighborVelocities)*2+.4,'The decoded motion must not jerk at the boundary: '+JSON.stringify(quality.loop));
    console.log('Decoded logo geometry',JSON.stringify(quality));
    await video.evaluate(async v=>{await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=v.duration-.15});await v.play();});
    await page.waitForFunction(()=>{const v=document.querySelector('.octi-dock[data-channel=main] video');return !v.paused&&v.currentTime<.6;},null,{timeout:6000});
    assert.equal(await video.evaluate(v=>v.loop),true,'Actual playback wraps automatically without rewinding the movie');
    for(const mode of ['opening','recording','sending','ready']){
     await page.evaluate(mode=>{plannerRecordings.main={mode,deadline:Date.now()+RECORDING_SECONDS*1000}},mode);
     await page.waitForFunction(mode=>document.querySelector('.octi-dock[data-channel=main]').dataset.mode===mode,mode);
     assert.equal(await dock.locator('.commands').isVisible(),true,'Recorder status remains available');assert.equal(await video.evaluate(v=>v.paused),true,'Recorder activity uses the microphone poster');
    }
    await page.evaluate(()=>{plannerRecordings.main=null});await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').dataset.mode==='idle');
    await page.evaluate(()=>{tasks=[{id:'logo-test',title:'Spotkanie',date:'2026-10-25',time:'12:00',endTime:'13:00'}];openEventActions(tasks[0]);});
    await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=event] video').paused);
    assert.equal(await video.evaluate(v=>v.paused),true,'Switching context pauses the main logo');
    await page.evaluate(()=>closeEventActions());await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main] video').paused);
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await video.evaluate(v=>v.paused),true,'Background pages pause the clip');
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
   }
   assert.deepEqual(errors,[]);await page.close();console.log(`Okti motion ${width}x${height}: actual playback, stable touch target, idle layout and reduced motion passed.`);
  }
  for(const failure of ['blocked-autoplay','hanging-autoplay','stalled-playback','unsupported-video','missing-media','all-media-fail']){
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(failure==='blocked-autoplay')await page.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('Autoplay denied','NotAllowedError'))}});
   if(failure==='hanging-autoplay')await page.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return new Promise(()=>{})}});
   if(failure==='stalled-playback')await page.addInitScript(()=>Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{configurable:true,get(){return 0},set(){}}));
   if(failure==='unsupported-video')await page.addInitScript(()=>{HTMLMediaElement.prototype.canPlayType=function(){return ''}});
   await routeFiles(page,failure==='missing-media'||failure==='all-media-fail'?failure:false);await page.goto('https://planner.test/preview33/index.html');
   const dock=page.locator('.octi-dock[data-channel=main]'),layer=dock.locator('.octi-motion-media'),fallback=dock.locator('.octi-motion-fallback');
   if(failure==='all-media-fail'){
    await page.waitForTimeout(600);assert.equal(await layer.getAttribute('class'),'octi-motion-media');assert.ok(await dock.locator('.octi-motion-poster').evaluate(img=>img.complete&&img.naturalWidth>0));
   }else{
    await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main] .octi-motion-media').classList.contains('is-fallback'));
    assert.equal(await dock.locator('.octi-motion-media.is-playing').count(),0);assert.equal(await fallback.evaluate(img=>img.naturalWidth),320);
    assert.equal(await page.locator('.octi-dock:not([data-channel=main]) .octi-motion-fallback[src]').count(),0,'Hidden contexts do not load animated images');
    const before=await layer.screenshot();await page.waitForTimeout(1200);const after=await layer.screenshot();
    const changed=await page.evaluate(async frames=>{
     async function pixels(base64){const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return {data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};}
     const [a,b]=await Promise.all(frames.map(pixels));let changed=0;
     // Actual displayed pixels below the head, at the real 128px logo size.
     for(let y=Math.floor(a.height*.53);y<a.height*.8;y++)for(let x=Math.floor(a.width*.22);x<a.width*.78;x++){
      const i=(y*a.width+x)*4,blue=(p)=>p[i+2]-p[i]>80&&p[i+1]>65;
      if((blue(a.data)||blue(b.data))&&Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2])>25)changed++;
     }
     return changed;
    },[before.toString('base64'),after.toString('base64')]);
    assert.ok(changed>=20,'Tentacles visibly move even when video playback fails: '+changed);console.log(`Okti ${failure}: ${changed} changing tentacle pixels at actual display size.`);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main] .octi-motion-fallback').hasAttribute('src'));
    assert.equal(await dock.locator('.is-fallback').count(),0,'Reduced motion releases the animated fallback');
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main] .octi-motion-media').classList.contains('is-fallback'));
    await page.evaluate(()=>{plannerRecordings.main={mode:'recording',deadline:Date.now()+RECORDING_SECONDS*1000}});await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main] .octi-motion-fallback').hasAttribute('src'));
    assert.equal(await dock.locator('.commands').isVisible(),true,'Fallback does not hide the recording status');await page.evaluate(()=>{plannerRecordings.main=null});
   }
   await dock.locator('.menu-toggle').click();assert.equal(await dock.locator('.menu-toggle').getAttribute('aria-expanded'),'true','Media failure never blocks the action menu');
   assert.deepEqual(errors,[]);await page.close();console.log(`Okti motion ${failure}: correct motion fallback and working controls passed.`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
