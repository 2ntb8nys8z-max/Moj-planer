const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engines=require('playwright'),kind=process.env.PLANNER_BROWSER||'chromium',base=path.resolve('.');
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
 const browser=await engines.webkit.launch({headless:true});
 try{
  for(const channel of ['main','event']){
   const {page}=await fixture(browser,390,844,{software:true,dpr:3});
   const marker=await page.evaluateHandle(()=>{
    const dot=document.createElement('div');dot.style.cssText='position:fixed;left:4px;top:4px;width:20px;height:20px;background:rgb(0,0,0);z-index:2147483647;pointer-events:none';document.body.append(dot);return dot;
   });
   try{
    await page.evaluate(()=>{
     Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>({getTracks:()=>[{stop(){}}]})}});
     window.MediaRecorder=class{static isTypeSupported(){return true}start(){this.state='recording';this.onstart?.()}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['audio'],{type:'audio/mp4'})});this.onstop?.()}};
    });
    if(channel==='event'){
     await page.evaluate(()=>{showPlannerWeather=async()=>{};tasks=[{id:'qa',title:'Próba',date:iso(selected),time:'17:00',endTime:'18:00'}];renderAll();openEventActions(tasks[0])});
     await page.waitForFunction(()=>!window.OktiEventMotion.getState()&&document.querySelector('.octi-dock[data-channel=event]')?.octiListening?.getState().rendering);
    }
    const dock=page.locator('.octi-dock[data-channel='+channel+']'),voice=dock.locator('.voice');
    const box=await voice.boundingBox(),center=[box.x+box.width/2,box.y+box.height/2];
    const glass=await dock.locator('.octi-motion-media').boundingBox();
    console.log(channel,'geometry',JSON.stringify({box,glass,center}));
    await voice.evaluate((button,marker)=>{
     let n=0;button.addEventListener('pointerdown',()=>{marker.style.backgroundColor='rgb('+((++n)*30)+',0,0)';});
    },marker);
    await page.waitForTimeout(550);
    await page.touchscreen.tap(...center);await page.waitForFunction(channel=>plannerRecordings[channel]?.mode==='recording',channel);
    await voice.evaluate(b=>b.addEventListener('click',e=>e.stopImmediatePropagation(),true));
    await page.waitForTimeout(650);
    for(let i=0;i<3;i++){await page.touchscreen.tap(...center);await page.waitForTimeout(710);}
    // Force failure of native artwork and measure the worker with the recorder still running.
    await page.route('**/octi-water-idle-332.webp*',route=>route.fulfill({status:404,body:'missing'}));
    await dock.locator('.octi-listening-fallback').evaluate(im=>{im.src='octi-water-idle-332.webp?force-worker'});
    await page.waitForFunction(channel=>{const s=document.querySelector('.octi-dock[data-channel='+channel+']').octiListening.getState();return !s.nativeIdle&&s.offThread&&s.paintCount>1},channel);
    for(let i=0;i<3;i++){await page.touchscreen.tap(...center);await page.waitForTimeout(710);}
    console.log(channel,'done',JSON.stringify(await dock.evaluate(r=>r.octiListening.getState())));
   }finally{const video=page.video();await page.close();await video.saveAs('test-results/okti-listening/'+channel+'.webm')}
  }
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
