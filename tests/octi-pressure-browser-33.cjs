const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engines=require('playwright'),kind=process.env.PLANNER_BROWSER||'chromium',base=path.resolve('.');
async function fixture(browser,width=390,height=844){
 const page=await browser.newPage({viewport:{width,height},hasTouch:true}),errors=[];
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url()),file=path.resolve(base,u.pathname==='/'?'preview33/index.html':u.pathname.slice(1));
  if(u.origin!=='https://planner.test')return route.fulfill({body:route.request().resourceType()==='script'?'':'{}',contentType:route.request().resourceType()==='script'?'application/javascript':'application/json'});
  if(!file.startsWith(base+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile())return route.fulfill({status:404,body:'missing'});
  const body=fs.readFileSync(file),type={'.html':'text/html','.js':'application/javascript','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2','.ttf':'font/ttf'}[path.extname(file)]||'application/json';
  const range=file.endsWith('.mp4')&&route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
  if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),body.length-1):body.length-1;return route.fulfill({status:206,body:body.subarray(start,end+1),contentType:type,headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${body.length}`}})}
  return route.fulfill({body,contentType:type});
 });
 await page.goto('https://planner.test/');await require('./permission-fixture.cjs').dismissInitialPermissions(page);
 await page.waitForFunction(()=>{const root=document.querySelector('.octi-dock[data-channel=main]');return root?.octiListening?.getState().rendering||root?.octiListening?.getState().fallback});
 return {page,errors};
}
// This fixture isolates visual feedback. The existing recorder/browser suites
// exercise actual recorder handlers with their explicit microphone/provider mocks.
async function visualOnly(page,channel='main'){
 await page.locator(`.octi-dock[data-channel=${channel}] .voice`).evaluate(button=>{
  button.addEventListener('click',event=>event.stopImmediatePropagation(),true);
  button.addEventListener('pointerdown',event=>window.pressPointer=event.pointerId);
 });
}
function read(page,channel='main'){
 return page.locator(`.octi-dock[data-channel=${channel}]`).evaluate(root=>{
  const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
  const float=root.querySelector('.water-float'),glass=root.querySelector('.octi-motion-media'),actor=root.querySelector('.octi-listening-media');
  return {target:rect(root.querySelector('.voice')),glass:rect(glass),actor:rect(actor),pressure:parseFloat(getComputedStyle(float).getPropertyValue('--okti-pressure'))||0,dentOpacity:Number(getComputedStyle(root.querySelector('.octi-pressure-dent')).opacity),sameHost:glass.parentElement===actor.parentElement,filter:getComputedStyle(root.querySelector('.voice')).filter};
 });
}
function samples(page,channel='main',duration=510){
 return page.locator(`.octi-dock[data-channel=${channel}] .water-float`).evaluate((float,duration)=>new Promise(resolve=>{
  const values=[],start=performance.now();function tick(){values.push(parseFloat(getComputedStyle(float).getPropertyValue('--okti-pressure'))||0);if(performance.now()-start>=duration)resolve(values);else requestAnimationFrame(tick)}tick();
 }),duration);
}
async function hold(page,channel='main'){
 const voice=page.locator(`.octi-dock[data-channel=${channel}] .voice`),b=await voice.boundingBox();
 await page.mouse.move(b.x+b.width/2,b.y+b.height*.4);await page.mouse.down();
 await page.waitForFunction(channel=>Number(getComputedStyle(document.querySelector(`.octi-dock[data-channel=${channel}] .water-float`)).getPropertyValue('--okti-pressure'))>.95,channel);
 return voice;
}
async function settled(page,channel='main'){
 await page.waitForFunction(channel=>Math.abs(parseFloat(getComputedStyle(document.querySelector(`.octi-dock[data-channel=${channel}] .water-float`)).getPropertyValue('--okti-pressure'))||0)<.0001&&!document.querySelector(`.octi-dock[data-channel=${channel}] .water-float`).hasAttribute('data-press-state'),channel);
}
(async()=>{
 const browser=await engines[kind].launch({headless:true,...(kind==='chromium'&&process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{}),...(kind==='chromium'?{args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}: {})});
 fs.mkdirSync('test-results/okti-listening',{recursive:true});
 try{
  for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]]){
   const {page,errors}=await fixture(browser,width,height);try{
    await visualOnly(page);const resting=await read(page);
    assert.equal(await page.locator('.octi-key-seat').count(),0,'The extra glass mount has been removed');
    assert.ok(Math.abs(resting.glass.width/resting.target.width-1.28)<.002,'Restore the original full-size bubble');
    await hold(page);const pressed=await read(page);
    assert.deepEqual(pressed.target,resting.target,'Only artwork flexes; the recorder hit target stays still');
    assert.ok(pressed.glass.width>resting.glass.width*1.06,'The held bubble widens');
    assert.ok(pressed.glass.height<resting.glass.height*.91,'The held bubble compresses vertically');
    assert.ok(pressed.dentOpacity>.95,'A shallow concave reflection appears under the fingertip');
    assert.equal(pressed.actor.width,pressed.glass.width);assert.equal(pressed.actor.height,pressed.glass.height);assert.equal(pressed.sameHost,true);assert.equal(pressed.filter,'none');
    if(width===390)await page.screenshot({path:`test-results/okti-listening/${kind}-pressure-held.png`});
    const release=samples(page);await page.mouse.up();const bounce=await release;
    assert.ok(bounce.some(v=>v<-.08),'Release crosses the resting shape with a visible elastic rebound');await settled(page);
    assert.ok(Math.abs((await read(page)).glass.width-resting.glass.width)<.02,'The bubble returns to its original rendered size');assert.deepEqual((await read(page)).target,resting.target);
    if(width===390)await page.screenshot({path:`test-results/okti-listening/${kind}-pressure-restored.png`});
    // Real short touch events can both arrive before the next painted frame.
    const b=await page.locator('.octi-dock[data-channel=main] .voice').boundingBox(),tap=samples(page);
    await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);const quick=await tap;
    assert.ok(quick.some(v=>v>.2),'Even a very short touch paints a small compression');await settled(page);
    await hold(page);await page.mouse.move(2,2);await page.mouse.up();await settled(page);
    await hold(page);await page.evaluate(()=>document.querySelector('.octi-dock[data-channel=main] .voice').dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.pressPointer,bubbles:true})));await page.mouse.up();await settled(page);
    if(width===390){
     for(let i=0;i<4;i++){await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.up();}await settled(page);
     await page.locator('.octi-dock[data-channel=main] .voice').focus();await page.keyboard.down(' ');await page.waitForTimeout(100);assert.ok((await read(page)).pressure>.95);await page.keyboard.up(' ');await settled(page);
     await page.emulateMedia({reducedMotion:'reduce'});await hold(page);const reduced=await read(page);assert.ok(reduced.glass.width<resting.glass.width*1.025,'Reduced motion uses only a small static press');const quiet=samples(page,'main',100);await page.mouse.up();assert.ok((await quiet).every(v=>v>=0),'Reduced motion has no elastic overshoot');await settled(page);await page.emulateMedia({reducedMotion:'no-preference'});
     await page.evaluate(()=>{showPlannerWeather=async()=>{};tasks=[{id:'pressure-event',title:'Test sprężystego bąbla',date:iso(selected),time:'17:00',endTime:'18:00'}];renderAll();openEventActions(tasks[0])});
     await page.waitForFunction(()=>!window.OktiEventMotion.getState()&&document.querySelector('.octi-dock[data-channel=event]')?.octiListening?.getState().rendering);await visualOnly(page,'event');const eventRest=await read(page,'event');
     await hold(page,'event');assert.deepEqual((await read(page,'event')).target,eventRest.target);const spring=samples(page,'event');await page.mouse.up();assert.ok((await spring).some(v=>v<-.08));await settled(page,'event');
     await hold(page,'event');await page.evaluate(()=>closeEventActions());await page.mouse.up();await settled(page,'event');
    }
    assert.deepEqual(errors,[]);console.log(`${kind}: ${width}×${height} held dent, fixed target, elastic release, short touch and cancellation passed.`);
   }finally{await page.close()}
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
