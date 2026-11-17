const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engines=require('playwright'),kind=process.env.PLANNER_BROWSER||'chromium',base=path.resolve('.');
async function fixture(browser,width=390,height=844){
 const page=await browser.newPage({viewport:{width,height},hasTouch:true,...(width===390?{recordVideo:{dir:'test-results/okti-listening/raw-video',size:{width,height}}}:{})}),errors=[];
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
 await page.waitForFunction(()=>{const root=document.querySelector('.octi-dock[data-channel=main]'),state=root?.octiListening?.getState(),canvas=root?.querySelector('.octi-listening-canvas');return (state?.fallback||state?.rendering&&canvas?.width===canvas?.height)&&root.octiPressure?.getState().ready});
 return {page,errors};
}
// This fixture isolates visual feedback. The existing recorder/browser suites
// exercise actual recorder handlers with their explicit microphone/provider mocks.
async function visualOnly(page,channel='main'){
 await page.locator(`.octi-dock[data-channel=${channel}] .voice`).evaluate(button=>{
  button.addEventListener('click',event=>event.stopImmediatePropagation(),true);
  button.addEventListener('pointerdown',event=>{
   window.pressPointer=event.pointerId;const root=button.closest('.octi-dock'),r=root.querySelector('.octi-motion-media').getBoundingClientRect();
   root.pressStart={x:r.x+r.width/2,y:r.y+r.height/2};
   const start=performance.now();root.onsetFrames=[];
   function sample(time){
    const box=root.querySelector('.octi-motion-media').getBoundingClientRect(),paint=root.octiPressure.getPaintState();
    root.onsetFrames.push({t:time-start,width:box.width,height:box.height,paint});
    if(time-start<700&&root.querySelector('.water-float').dataset.pressState==='held')requestAnimationFrame(sample);
   }
   requestAnimationFrame(sample);
  });
 });
}
function read(page,channel='main'){
 return page.locator(`.octi-dock[data-channel=${channel}]`).evaluate(root=>{
  const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height}};
  const float=root.querySelector('.water-float'),glass=root.querySelector('.octi-motion-media'),actor=root.querySelector('.octi-listening-media');
  const canvas=root.querySelector('.octi-listening-canvas'),pressureState=root.octiPressure.getState();
  const membrane=root.querySelector('.octi-pressure-canvas'),pixels=membrane.getContext('2d').getImageData(0,0,384,384).data;
  let edgeAlpha=0,edgeInk=0;
  for(let y=0;y<384;y++)for(let x=0;x<384;x++){const r=Math.hypot(x-192,y-192);if(r>122&&r<172){const q=(y*384+x)*4,a=pixels[q+3]/255;edgeAlpha+=pixels[q+3];edgeInk+=(255-(.2126*pixels[q]+.7152*pixels[q+1]+.0722*pixels[q+2]))*a}}
  return {target:rect(root.querySelector('.voice')),glass:rect(glass),actor:rect(actor),buffer:{width:canvas.width,height:canvas.height},pressure:parseFloat(getComputedStyle(float).getPropertyValue('--okti-pressure'))||0,surfaceOpacity:Number(getComputedStyle(glass).opacity),canvasOpacity:Number(getComputedStyle(membrane).opacity),canvasParent:membrane.parentElement===glass,edgeAlpha,edgeInk,pressureState,membraneBuffer:{width:membrane.width,height:membrane.height},sameHost:glass.parentElement===actor.parentElement,filter:getComputedStyle(root.querySelector('.voice')).filter,pressStart:root.pressStart,touchAction:getComputedStyle(root.querySelector('.voice')).touchAction,userSelect:getComputedStyle(root.querySelector('.voice')).getPropertyValue('user-select')||getComputedStyle(root.querySelector('.voice')).getPropertyValue('-webkit-user-select'),driftPlayState:getComputedStyle(float).animationPlayState,background:getComputedStyle(glass).backgroundImage,shadow:getComputedStyle(glass).boxShadow,extraGlint:getComputedStyle(glass,':before').display};
 });
}
async function samples(page,channel='main'){
 const float=page.locator(`.octi-dock[data-channel=${channel}] .water-float`);
 // Probe the real browser animation at controlled animation times: software
 // GPU runners can skip an entire 100 ms lobe between painted frames. Then
 // restart normal playback and independently wait for its natural completion.
 await float.evaluate(float=>{
  float.pressureSamples=new Promise((resolve,reject)=>window.addEventListener('pointerup',async()=>{
   try{
    const animation=float.getAnimations().find(a=>a.effect.getKeyframes().some(k=>'--okti-pressure' in k));
    const frame=()=>{const r=float.querySelector('.octi-motion-media').getBoundingClientRect();return {pressure:parseFloat(getComputedStyle(float).getPropertyValue('--okti-pressure'))||0,width:r.width,height:r.height}};
    if(!animation){resolve([frame()]);return}
    animation.pause();await animation.ready;const duration=Number(animation.effect.getTiming().duration),values=[];
    for(let i=0;i<32;i++){animation.currentTime=duration*i/32;values.push(frame())}
    animation.currentTime=0;animation.play();resolve(values);
   }catch(error){reject(error)}
  },{once:true}));
 });
 return ()=>float.evaluate(float=>float.pressureSamples);
}
async function hold(page,channel='main'){
 const voice=page.locator(`.octi-dock[data-channel=${channel}] .voice`),b=await voice.boundingBox();
 await page.mouse.move(b.x+b.width/2,b.y+b.height*.4);await page.mouse.down();
 await page.waitForFunction(channel=>{const float=document.querySelector(`.octi-dock[data-channel=${channel}] .water-float`);return Number(getComputedStyle(float).getPropertyValue('--okti-pressure'))>.99999&&!float.getAnimations().some(a=>a.effect.getKeyframes().some(k=>'--okti-pressure' in k))},channel);
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
    const exactOriginal=await page.locator('.octi-dock[data-channel=main]').evaluate(async root=>{
     const canvas=root.querySelector('.octi-pressure-canvas'),ref=document.createElement('canvas');ref.width=ref.height=384;
     const image=new Image();image.src=root.octiPressure.getState().source;await image.decode();
     const ctx=ref.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0,384,384);
     const expected=ctx.getImageData(0,0,384,384).data,actual=canvas.getContext('2d').getImageData(0,0,384,384).data;
     let differences=0,maxDelta=0;const first=[];for(let i=0;i<expected.length;i++)if(expected[i]!==actual[i]){differences++;maxDelta=Math.max(maxDelta,Math.abs(expected[i]-actual[i]));if(first.length<8)first.push({i,expected:expected[i],actual:actual[i],alpha:expected[i-i%4+3]})}return {exact:!differences,differences,maxDelta,first};
    });
    assert.equal(exactOriginal.exact,true,'At rest the rendered glass is pixel-identical to the original image: '+JSON.stringify(exactOriginal));
    assert.equal(await page.locator('.octi-key-seat').count(),0,'The extra glass mount has been removed');
    assert.ok(Math.abs(resting.glass.width/resting.target.width-1.28)<.002,'Restore the original full-size bubble');
    await hold(page);const pressed=await read(page);
    assert.deepEqual(pressed.target,resting.target,'Only artwork flexes; the recorder hit target stays still');
    assert.ok(pressed.glass.width>resting.glass.width*1.15,'The held bubble widens');
    assert.ok(pressed.glass.height>resting.glass.height*1.095,'Pressure expands the membrane around its whole circumference');
    const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
    assert.ok(Math.abs(center(pressed.glass).x-pressed.pressStart.x)<.05,'Expansion keeps the center fixed horizontally: '+JSON.stringify({start:pressed.pressStart,current:center(pressed.glass)}));
    assert.ok(Math.abs(center(pressed.glass).y-pressed.pressStart.y)<.05,'Expansion keeps the center fixed vertically: '+JSON.stringify({start:pressed.pressStart,current:center(pressed.glass)}));
    assert.equal(pressed.driftPlayState,'paused','Idle floating is paused throughout the finger gesture');
    assert.equal(pressed.touchAction,'none','The control reserves its touch gesture');
    assert.equal(pressed.userSelect,'none','The bubble cannot start native text selection');
    const nativeMenus=await page.locator('.octi-dock[data-channel=main] .voice').evaluate(button=>({
     contextAllowed:button.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true})),
     selectionAllowed:button.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})),draggable:button.draggable
    }));
    assert.deepEqual(nativeMenus,{contextAllowed:false,selectionAllowed:false,draggable:false},'Long press must not open a context menu or drag preview');
    assert.equal(pressed.surfaceOpacity,1,'The original surface stays fully visible under pressure');
    assert.equal(pressed.canvasOpacity,resting.canvasOpacity,'Pressing does not crossfade the glass');
    assert.equal(pressed.canvasParent,true,'The original glass owns its deformable image');
    assert.equal(pressed.pressureState.source,resting.pressureState.source,'Rest and press use the exact same texture');
    assert.match(pressed.pressureState.source,/octi-glass-33-184\.png/);
    assert.equal(await page.locator('.octi-pressure-media').count(),0,'No replacement glass layer is placed over the bubble');
    assert.ok(pressed.edgeInk>resting.edgeInk*1.03,'Pressure darkens the original rim while preserving its blue glass');
    assert.deepEqual(pressed.membraneBuffer,resting.membraneBuffer,'The glass canvas also keeps its backing buffer');
    assert.equal(await page.locator('.octi-pressure-dent').count(),0,'The old flat fold is removed');
    assert.deepEqual(pressed.buffer,resting.buffer,'Press feedback must not reallocate the renderer backing buffer');
    // Animated fractional translations round DOMRect edges independently.
    // A hundredth of a CSS pixel still catches any visible actor deformation.
    assert.ok(Math.abs(pressed.actor.width-resting.actor.width)<.01,'The live actor keeps its width');
    assert.ok(Math.abs(pressed.actor.height-resting.actor.height)<.01,'The live actor keeps its height');
    assert.equal(pressed.sameHost,true);assert.equal(pressed.filter,'none');
    await page.waitForTimeout(width===390?1300:250);const held=await read(page);
    assert.equal(held.pressure,1,'The bubble remains expanded for the entire hold');
    assert.ok(Math.abs(held.glass.width-pressed.glass.width)<.01,'Holding never starts the return animation');
    assert.ok(Math.abs(center(held.glass).x-center(pressed.glass).x)<.05&&Math.abs(center(held.glass).y-center(pressed.glass).y)<.05,'A long hold stays fixed under the fingertip');
    assert.equal(await page.evaluate(()=>getSelection().toString()),'','A long hold does not select page content');
    assert.equal(held.background,'none','A legacy CSS lens cannot add a second glass outline');
    assert.equal(held.shadow,'none','A separate inset frame cannot appear during pressure');
    assert.equal(held.extraGlint,'none','The original image carries all moving highlights');
    const onset=await page.locator('.octi-dock[data-channel=main]').evaluate(root=>root.onsetFrames);
    const intermediate=onset.filter(f=>f.paint.pressure>.05&&f.paint.pressure<.95);
    assert.ok(new Set(intermediate.map(f=>f.paint.count)).size>=5,'Native onset must actually paint at least five intermediate glass surfaces: '+JSON.stringify(onset));
    const full=onset.find(f=>f.paint.pressure>=.99999);
    assert.ok(full&&full.t>=360,'Expansion must remain visible over time rather than snapping to an extra rim: '+JSON.stringify(onset));
    if(width===390){console.log(kind+' real onset: '+JSON.stringify(onset));await page.screenshot({path:`test-results/okti-listening/${kind}-pressure-held.png`})}
    const release=await samples(page);await page.mouse.up();const bounce=await release();
    assert.ok(bounce.some(v=>v.pressure<-.3&&v.width<resting.glass.width&&v.height>resting.glass.height*1.06),'Release crosses the resting shape with a visible elastic rebound: '+JSON.stringify(bounce));await settled(page);
    assert.ok(Math.abs((await read(page)).glass.width-resting.glass.width)<.02,'The bubble returns to its original rendered size');assert.deepEqual((await read(page)).target,resting.target);
    if(width===390)await page.screenshot({path:`test-results/okti-listening/${kind}-pressure-restored.png`});
    // Real short touch events can both arrive before the next painted frame.
    const b=await page.locator('.octi-dock[data-channel=main] .voice').boundingBox(),tap=await samples(page);
    await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);const quick=await tap();
    assert.ok(quick.every(v=>v.pressure<=quick[0].pressure+.001),'A quick release never injects another compression after pointerup');await settled(page);
    await hold(page);await page.mouse.move(2,2);await page.mouse.up();await settled(page);
    await hold(page);await page.evaluate(()=>document.querySelector('.octi-dock[data-channel=main] .voice').dispatchEvent(new PointerEvent('pointercancel',{pointerId:window.pressPointer,bubbles:true})));await page.mouse.up();await settled(page);
    if(width===390){
     if(kind==='chromium'){
      const touch=await page.context().newCDPSession(page);
      await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2}]});
      await page.waitForTimeout(1300);const finger=await read(page);
      assert.equal(finger.pressure,1,'A real long touch remains expanded');
      assert.equal(finger.pressureState.holding,true,'Native long touch does not cancel the gesture');
      assert.equal(await page.evaluate(()=>getSelection().toString()),'');
      await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settled(page);await touch.detach();
     }
     for(let i=0;i<4;i++){await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.up();}await settled(page);
     await page.locator('.octi-dock[data-channel=main] .voice').focus();await page.keyboard.down(' ');await page.waitForFunction(()=>Number(getComputedStyle(document.querySelector('.octi-dock[data-channel=main] .water-float')).getPropertyValue('--okti-pressure'))>.95);assert.ok((await read(page)).pressure>.95);await page.keyboard.up(' ');await settled(page);
     await page.emulateMedia({reducedMotion:'reduce'});await hold(page);const reduced=await read(page);assert.ok(reduced.glass.width<resting.glass.width*1.025,'Reduced motion uses only a small static press');const quiet=await samples(page);await page.mouse.up();assert.ok((await quiet()).every(v=>v.pressure>=0),'Reduced motion has no elastic overshoot');await settled(page);await page.emulateMedia({reducedMotion:'no-preference'});
     await page.evaluate(()=>{showPlannerWeather=async()=>{};tasks=[{id:'pressure-event',title:'Test sprężystego bąbla',date:iso(selected),time:'17:00',endTime:'18:00'}];renderAll();openEventActions(tasks[0])});
     await page.waitForFunction(()=>!window.OktiEventMotion.getState()&&document.querySelector('.octi-dock[data-channel=event]')?.octiListening?.getState().rendering);await visualOnly(page,'event');const eventRest=await read(page,'event');
     await hold(page,'event');assert.deepEqual((await read(page,'event')).target,eventRest.target);const spring=await samples(page,'event');await page.mouse.up();assert.ok((await spring()).some(v=>v.pressure<-.08));await settled(page,'event');
     await hold(page,'event');await page.evaluate(()=>closeEventActions());await page.mouse.up();await settled(page,'event');
    }
    assert.deepEqual(errors,[]);console.log(`${kind}: ${width}×${height} visible real-time surface expansion, no duplicate frame, centered hold, native long-press protection and elastic release passed.`);
   }finally{
    const recording=page.video();await page.close();
    if(recording){const source=await recording.path(),target=`test-results/okti-listening/${kind}-pressure-realtime.webm`;await recording.saveAs(target);if(path.resolve(source)!==path.resolve(target))fs.unlinkSync(source)}
   }
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
