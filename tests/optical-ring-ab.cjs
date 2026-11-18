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
 const dock=page.locator('.octi-dock[data-channel=main]'),voice=dock.locator('.voice'),box=await voice.boundingBox(),cx=box.x+box.width/2,cy=box.y+box.height/2;
 await page.addStyleTag({content:'.water-float,.octi-motion-media{animation-play-state:paused!important}'});
 fs.mkdirSync('ab',{recursive:true});
 for(const phase of ['rest','hold']){
 if(phase==='hold'){await page.mouse.move(cx,cy);await page.mouse.down();await page.waitForTimeout(400)}
 for(const mode of ['original','no_ring','no_scatter','no_legacy','no_reflections','no_actor','outer_only']){
 let css=({'no_scatter':'.octi-glass-scatter{visibility:hidden!important}',no_legacy:'.octi-glass-surface{visibility:hidden!important}',no_reflections:'.octi-contact-lens{visibility:hidden!important}',no_actor:'.octi-listening-media{visibility:hidden!important}',outer_only:'.octi-listening-media,.octi-glass-scatter,.octi-contact-lens,.octi-glass-surface{visibility:hidden!important}'})[mode]||'';
 if(mode==='no_ring')css=await dock.locator('.octi-glass-scatter').evaluate(el=>'.octi-dock .octi-glass-scatter{background-image:'+getComputedStyle(el).backgroundImage.replace(/, radial-gradient\(circle closest-side.*$/,'')+'!important}');
 const style=await page.addStyleTag({content:css||'html{}'});
 await page.screenshot({path:'ab/'+phase+'-'+mode+'.png',clip:{x:Math.floor(cx-80),y:Math.floor(cy-80),width:160,height:160}});
 await style.evaluate(e=>e.remove());
 }
 }await page.close()
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
