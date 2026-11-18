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
 const browser=await engines.webkit.launch(),version=process.env.APP_ROOT?'old':'new',dir='proof/'+version;fs.mkdirSync(dir,{recursive:true});
 try{for(const kind of ['native','worker','webgl']){
  const {page}=await fixture(browser,390,844,{software:kind!=='webgl',dpr:3});
  await page.addStyleTag({content:'.water-float{animation:none!important;--okti-drift-x:0px!important;--okti-drift-y:0px!important}'});
  await page.route('**/tip-still-124',r=>r.fulfill({body:fs.readFileSync('tests/tip-124.png'),contentType:'image/png'}));
  for(const channel of (kind==='native'?['main','event']:['main'])){
   if(channel==='event'){await page.evaluate(()=>{showPlannerWeather=async()=>{};tasks=[{id:'qa',title:'Test',date:iso(selected),time:'17:00',endTime:'18:00'}];renderAll();openEventActions(tasks[0])});await page.waitForFunction(()=>!window.OktiEventMotion.getState()&&document.querySelector('.octi-dock[data-channel=event]').octiListening.getState().rendering)}
   const root=page.locator('.octi-dock[data-channel='+channel+']'),voice=root.locator('.voice');
   await voice.evaluate(e=>e.addEventListener('click',ev=>ev.stopImmediatePropagation(),true));
   if(kind==='worker'){
    await page.route('**/octi-water-idle-332.webp*',r=>r.fulfill({status:404,body:'missing'}));
    await root.locator('.octi-listening-fallback').evaluate(im=>im.src='octi-water-idle-332.webp?missing-native-animation');
    await page.waitForFunction(()=>{const s=document.querySelector('.octi-dock[data-channel=main]').octiListening.getState();return s.offThread&&!s.nativeIdle&&s.paintCount>2});
   }
   await root.evaluate(async(r,kind)=>{if(kind==='native'){const im=r.querySelector('.octi-listening-fallback');im.src='tip-still-124';await im.decode()}else{const v=r.querySelector('video');v.pause();v.play=async()=>{};v.currentTime=124.25/30;await new Promise(ok=>{if(!v.seeking)ok();else v.addEventListener('seeked',ok,{once:true})})}},kind);
   await page.evaluate(ch=>{plannerRecordings[ch]={mode:'recording',deadline:Date.now()+60000,chunks:[]}},channel);
   await page.waitForTimeout(140);
   const b=await voice.boundingBox(),cx=b.x+b.width/2,cy=b.y+b.height/2,clip={x:Math.floor(cx-80),y:Math.floor(cy-80),width:160,height:160};
   const prefix=dir+'/'+channel+'-'+kind+'-';
   const snap=async name=>{await page.screenshot({path:prefix+name+'.png',clip});
    const loc=await root.locator('.octi-touch-actor').boundingBox();
    const st=await root.evaluate(r=>({p:r.octiPressure.getPaintState().pressure,filter:getComputedStyle(r.querySelector('.octi-touch-actor')).filter,scales:[...r.querySelectorAll('feDisplacementMap')].map(n=>n.scale.animVal)}));console.log(prefix,name,JSON.stringify({loc,clip,st}));};
   await snap('rest');
   await page.touchscreen.tap(cx+8,cy-5);await page.waitForTimeout(228);await snap('tap');
   await page.waitForFunction(ch=>document.querySelector('.octi-dock[data-channel='+ch+']').octiPressure.getState().phase==='idle',channel);
   await voice.dispatchEvent('pointerdown',{isPrimary:true,pointerId:772,clientX:cx+8,clientY:cy-5});await page.waitForFunction(ch=>document.querySelector('.octi-dock[data-channel='+ch+']').octiPressure.getState().atPresentedPeak,channel);
   await snap('held');
   await voice.dispatchEvent('pointercancel',{pointerId:772});await page.waitForTimeout(180);await snap('reset');
  }await page.close();
 }}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
