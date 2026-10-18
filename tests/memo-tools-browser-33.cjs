const {chromium}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLANNER_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin==='https://planner.test'){const file=path.resolve(url.pathname==='/'?'index.html':url.pathname.slice(1)),types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2'};if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/json'})}return route.fulfill({body:route.request().resourceType()==='script'?'':'{}',contentType:route.request().resourceType()==='script'?'application/javascript':'application/json'})});
   await page.goto('https://planner.test');await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{const context=new AudioContext(),tone=context.createOscillator(),out=context.createMediaStreamDestination();tone.connect(out);tone.start();out.stream.getTracks().forEach(track=>track.addEventListener('ended',()=>context.close()));return out.stream};selected=today();tasks=[{id:'demo',title:'Próba dyktafonu',date:iso(today()),time:'13:00',endTime:'14:00'}];ideas=[];renderAll();showView('day')});
   const root=page.locator('.octi-dock[data-channel=main]');await root.locator('.menu-toggle').click();await root.locator('.recorder').click();
   await page.waitForFunction(()=>document.getElementById('memoTools').dataset.mode==='recording');
   const metrics=await page.evaluate(()=>{const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}};return {panel:rect(document.getElementById('memoTools')),bg:getComputedStyle(document.body).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('#memoTools button')].map(el=>{const r=el.getBoundingClientRect();return {id:el.id,hit:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))}})}});
   assert.ok(metrics.panel.top>=0&&metrics.panel.bottom<=height,JSON.stringify({width,height,metrics}));assert.ok(metrics.panel.left>=0&&metrics.panel.right<=width);assert.equal(metrics.overflow,false);assert.equal(metrics.bg,'rgb(228, 240, 251)');assert.ok(metrics.buttons.every(x=>x.hit),'all recorder controls remain reachable '+JSON.stringify(metrics));
   if(process.env.PLANNER_MEMO_SCREENSHOT){fs.mkdirSync(process.env.PLANNER_MEMO_SCREENSHOT,{recursive:true});await page.screenshot({path:path.join(process.env.PLANNER_MEMO_SCREENSHOT,`recorder-${width}.png`)})}
   await page.locator('#memoToolsPause').click();await page.waitForFunction(()=>document.getElementById('memoTools').dataset.mode==='paused');
   await page.locator('#memoToolsPause').click();await page.waitForTimeout(1100);await page.locator('#memoToolsStop').click();await page.waitForFunction(()=>document.getElementById('memoTools').dataset.mode==='ready');
   await page.locator('#memoToolsSave').click();await page.waitForFunction(()=>document.getElementById('memoTools').hidden);
   assert.equal(await page.evaluate(()=>ideas.length),1,'real MediaRecorder audio saves exactly one entry');assert.ok(await page.evaluate(()=>!!ideas[0].voiceMemoId));assert.deepEqual(errors,[]);await page.close();console.log(`Recorder ${width}x${height}: visible glass controls, real MediaRecorder pause/stop/save and blue lower edge passed (synthetic audio).`);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
