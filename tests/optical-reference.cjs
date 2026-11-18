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
const browser=await engines.webkit.launch();
try{
 const {page}=await fixture(browser,390,844,{software:true,dpr:3});
 await page.addStyleTag({content:'.water-float{--okti-drift-x:0px!important;--okti-drift-y:0px!important;--okti-lift:0!important;animation-play-state:paused!important}'});
 await page.evaluate(()=>{
  window.pings=[];
  const start=OscillatorNode.prototype.start;
  OscillatorNode.prototype.start=function(t){window.pings.push({when:t-this.context.currentTime,state:this.context.state});return start.call(this,t)};
 });
 fs.mkdirSync('ab',{recursive:true});
 for(const ch of ['main','event']){
  if(ch==='event'){await page.evaluate(()=>{showPlannerWeather=async()=>{};tasks=[{id:'qa',title:'Test',date:iso(selected),time:'17:00',endTime:'18:00'}];renderAll();openEventActions(tasks[0])});await page.waitForFunction(()=>!window.OktiEventMotion.getState()&&document.querySelector('.octi-dock[data-channel=event]')?.octiListening?.getState().rendering)}
  const dock=page.locator('.octi-dock[data-channel='+ch+']'),voice=dock.locator('.voice'),box=await voice.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
  await voice.evaluate(e=>e.addEventListener('click',ev=>ev.stopImmediatePropagation(),true));
  const paths=['normal','hidden','soft','arc'];
  const clip={x:Math.floor(cx-108),y:Math.floor(cy+5),width:208,height:95};
  console.log('box',ch,cx,cy,clip);
  for(const pose of ['rest','hold']){
   if(pose==='hold'){await page.mouse.move(cx,cy);await page.mouse.down();await page.waitForFunction(ch=>document.querySelector('.octi-dock[data-channel='+ch+']').octiPressure.getState().atPresentedPeak,ch)}
   for(const m of paths){
    const show=m==='hidden'?'.octi-shadow-footprint':m==='soft'?'.octi-pressure-caustic':m==='arc'?'.octi-pressure-shadow':'#no-such-layer';
    const style=await page.addStyleTag({content:show+'{visibility:hidden!important}'});
    await page.screenshot({path:'ab/'+ch+'-'+pose+'-'+m+'.png',clip});
    await style.evaluate(e=>e.remove());
   }
  }
  const prior=ch==='main'?0:2;
  assert.equal(await page.evaluate(()=>pings.length),prior);
  await page.mouse.up();await page.waitForFunction(n=>pings.length===n,prior+1);
  await page.waitForFunction(ch=>document.querySelector('.octi-dock[data-channel='+ch+']').octiPressure.getState().phase==='idle',ch);
  await page.touchscreen.tap(cx,cy);await page.waitForFunction(n=>pings.length===n,prior+2);
  await page.waitForFunction(ch=>document.querySelector('.octi-dock[data-channel='+ch+']').octiPressure.getState().phase==='idle',ch);
  const notes=await page.evaluate(()=>pings);assert.equal(notes.length,prior+2);assert.ok(notes.every(n=>n.state==='running'&&n.when>.12&&n.when<=.255),JSON.stringify(notes));
  console.log(ch,JSON.stringify(notes));
 }
 await page.close()
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
