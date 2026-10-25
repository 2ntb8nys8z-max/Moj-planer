const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=path.resolve('.');
async function routeFiles(page,failMedia=false){
 await page.route('**/*',route=>{
  const url=new URL(route.request().url()),file=path.resolve(base,url.pathname==='/'?'preview33/index.html':url.pathname.slice(1));
  if(url.origin==='https://planner.test'&&file.startsWith(base+'/')&&fs.existsSync(file)&&fs.statSync(file).isFile()){
   const bytes=fs.readFileSync(file),types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2','.ttf':'font/ttf'};
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
     for(const t of [0,.9,2.4,3.6,5.1,6.8]){const pixels=await frame(t);let top=200;for(let y=110;y<200;y++){let blue=0;for(let x=250;x<290;x++){const i=(y*544+x)*4;if(pixels[i]<110&&pixels[i+1]>60&&pixels[i+2]>140&&pixels[i+2]-pixels[i+1]>17)blue++;}if(blue>15){top=y;break;}}tops.push(top);}
     const pixels=await frame(3.6),eyes=[];
     for(const [left,right] of [[230,269],[275,314]]){let minX=544,maxX=0,minY=544,maxY=0;for(let y=207;y<245;y++)for(let x=left;x<right;x++){const i=(y*544+x)*4;if(pixels[i]>225&&pixels[i+1]>230&&pixels[i+2]>235){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}eyes.push({width:maxX-minX+1,height:maxY-minY+1});}
     return {duration:v.duration,tops,eyes};
    });
    assert.ok(Math.abs(quality.duration-14.5)<.1);assert.ok(Math.max(...quality.tops)-Math.min(...quality.tops)<17,'The head stays calm instead of dipping at the end');
    for(const eye of quality.eyes){assert.ok(eye.width>20);assert.ok(eye.height/eye.width<.48,'The approved eyes are shallow tapered crescents, not semicircles');}
    console.log('Decoded logo geometry',JSON.stringify(quality));
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
  for(const failure of ['blocked-autoplay','missing-media']){
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(failure==='blocked-autoplay')await page.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('Autoplay denied','NotAllowedError'))}});
   await routeFiles(page,failure==='missing-media');await page.goto('https://planner.test/preview33/index.html');await page.waitForTimeout(500);
   const dock=page.locator('.octi-dock[data-channel=main]');assert.equal(await dock.locator('.octi-motion-media.is-playing').count(),0);assert.ok(await dock.locator('.octi-motion-poster').evaluate(img=>img.complete&&img.naturalWidth>0));
   await dock.locator('.menu-toggle').click();assert.equal(await dock.locator('.menu-toggle').getAttribute('aria-expanded'),'true','Media failure never blocks the action menu');
   assert.deepEqual(errors,[]);await page.close();console.log(`Okti motion ${failure}: blue poster and working controls passed.`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
