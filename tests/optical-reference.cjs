const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engines=require('playwright'),kind=process.env.PLANNER_BROWSER||'chromium',base=path.resolve(process.env.APP_ROOT||'.');
// Video encoding on software-rendered CI can stall requestAnimationFrame for
// hundreds of milliseconds. Keep the real-time smoothness assertions free of
// that observer overhead; request a separate recording only for visual review.
const recordVideo=process.env.PLANNER_PRESSURE_VIDEO==='1';
async function fixture(browser,width=390,height=844,{blockOptics=false,software=false,dpr=1}={}){
 const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:dpr,hasTouch:true,...(recordVideo&&width===390?{recordVideo:{dir:'test-results/okti-listening/raw-video',size:{width,height}}}:{})}),errors=[];let atlasRequests=0,lightRequests=0;
 if(software)await page.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return type==='webgl'?null:get.call(this,type,...args)}});
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url()),file=path.resolve(base,u.pathname==='/'?'preview33/index.html':u.pathname.slice(1));
  if(u.protocol==='blob:')return route.continue();
  if(u.pathname.endsWith('/octi-pressure-33-311.webp')){atlasRequests++;if(blockOptics)return route.fulfill({status:404,body:'unavailable artwork'})}
  if(u.pathname.endsWith('/octi-pressure-lights-33-319.webp')){lightRequests++;if(blockOptics)return route.fulfill({status:404,body:'unavailable lighting'})}
  if(u.origin!=='https://planner.test')return route.fulfill({body:route.request().resourceType()==='script'?'':'{}',contentType:route.request().resourceType()==='script'?'application/javascript':'application/json'});
  if(!file.startsWith(base+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'missing'});
  const body=fs.readFileSync(file),type={'.html':'text/html','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2','.ttf':'font/ttf'}[path.extname(file)]||'application/json';
  const range=file.endsWith('.mp4')&&route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
  if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),body.length-1):body.length-1;return route.fulfill({status:206,body:body.subarray(start,end+1),contentType:type,headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${body.length}`}})}
  return route.fulfill({body,contentType:type});
 });
 await page.goto('https://planner.test/');await require('./permission-fixture.cjs').dismissInitialPermissions(page);
 // The initial poster is visible before video decoding and shader compilation.
 // Measure a finger gesture only after the actual artwork is drawing, rather
 // than counting the renderer's first-start compilation as press animation.
 await page.waitForFunction(blockOptics=>{const root=document.querySelector('.octi-dock[data-channel=main]'),state=root?.octiListening?.getState(),canvas=root?.querySelector('.octi-listening-canvas'),video=root?.querySelector('.octi-listening-source'),pressure=root?.octiPressure?.getState();return state?.ready&&state.rendering&&!state.fallback&&canvas?.width===canvas?.height&&video?.currentTime>.25&&pressure?.ready},blockOptics);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 return {page,errors,get atlasRequests(){return atlasRequests},get lightRequests(){return lightRequests}};
}

(async()=>{
const browser=await engines.webkit.launch();
const label=process.env.APP_ROOT?'old':'new',dir='proof/'+label;fs.mkdirSync(dir,{recursive:true});
try{
 for(const engine of ['native','worker','webgl']){
  const {page}=await fixture(browser,390,844,{software:engine!=='webgl',dpr:3});
  const dock=page.locator('.octi-dock[data-channel=main]'),voice=dock.locator('.voice');
  await page.addStyleTag({content:'.water-float{--okti-drift-x:0px!important;--okti-drift-y:0px!important;--okti-lift:0!important;animation-play-state:paused!important}'});
  if(engine==='worker'){
   await page.route('**/octi-water-idle-332.webp*',r=>r.fulfill({status:404,body:'missing'}));
   await dock.locator('.octi-listening-fallback').evaluate(im=>im.src='octi-water-idle-332.webp?missing-native-animation');
   await page.waitForFunction(()=>{const s=document.querySelector('.octi-dock[data-channel=main]').octiListening.getState();return s.offThread&&!s.nativeIdle&&s.paintCount>2});
  }
  if(engine==='native'){
   for(const channel of ['main','event']){
    if(channel==='event'){
     await page.evaluate(()=>{showPlannerWeather=async()=>{};tasks=[{id:'qa',title:'Test',date:iso(selected),time:'17:00',endTime:'18:00'}];renderAll();openEventActions(tasks[0])});
     await page.waitForFunction(()=>!window.OktiEventMotion.getState()&&document.querySelector('.octi-dock[data-channel=event]')?.octiListening?.getState().rendering);
    }
    const root=page.locator('.octi-dock[data-channel='+channel+']'),plus=root.locator('.action-bubble');
    for(const pose of ['plus','middle','open']){
     if(pose==='middle')await plus.click();if(pose==='open')await page.waitForTimeout(3800);
     console.log('action',label,channel,pose,await root.evaluate(r=>{
      const a=r.querySelector('.action-bubble').getBoundingClientRect(),s=r.querySelector('.action-fixed-shadow').getBoundingClientRect(),img=r.querySelector('.action-glass'),bits=[...r.querySelectorAll('.menu-bud-shadow')].map(e=>{const s=e.getBoundingClientRect(),b=e.parentNode.getBoundingClientRect();return s.x+s.width/2-b.x-b.width/2});
      return {hit:[a.x,a.y,a.width,a.height],cast:s.x+s.width/2-a.x-a.width/2,buds:bits,baked:getComputedStyle(img).opacity}
     }));
     const a=await plus.boundingBox();const clip={x:Math.floor(a.x-20),y:Math.floor(a.y-4),width:Math.min(100,390-Math.floor(a.x-20)),height:83};
     await page.screenshot({path:dir+'/action-'+channel+'-'+pose+'.png',clip});
    }await plus.click();await page.waitForTimeout(2600);if(channel==='event')await page.evaluate(()=>closeEventActions());
   }
  }
  await page.addStyleTag({content:'.octi-dock .octi-motion-media,.octi-dock .octi-shadow-footprint{visibility:hidden!important}'});
  await page.waitForTimeout(500);
  const b=await voice.boundingBox(),cx=b.x+b.width/2,cy=b.y+b.height/2;
  const clip={x:Math.floor(cx-60),y:Math.floor(cy-60),width:120,height:120};
  await voice.dispatchEvent('pointerdown',{isPrimary:true,pointerId:510,clientX:cx+10,clientY:cy});
  await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').octiPressure.getState().atPresentedPeak);
  await voice.dispatchEvent('pointerup',{pointerId:510});await dock.evaluate(root=>{root.runs=[...root.querySelectorAll('*')].flatMap(e=>e.getAnimations()).filter(a=>a.effect.getTiming().fill==='forwards');root.runs.forEach(a=>a.pause())});
  for(const t of [0,250,450,700,1000,1250,1600]){
   await dock.evaluate((r,t)=>r.runs.forEach(a=>a.currentTime=t),t);await page.waitForTimeout(80);
   console.log('actor',label,engine,t,await dock.evaluate(r=>JSON.stringify({pose:r.octiPressure.getActorPose(),renderer:r.octiListening.getState().renderer,native:r.octiListening.getState().nativeIdle})));
   await page.screenshot({path:dir+'/actor-'+engine+'-'+t+'.png',clip});
  }
  await page.close()
 }
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
