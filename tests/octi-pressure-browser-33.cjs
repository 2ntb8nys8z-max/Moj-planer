const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const engines=require('playwright'),kind=process.env.PLANNER_BROWSER||'chromium',base=path.resolve('.');
// Video encoding on software-rendered CI can stall requestAnimationFrame for
// hundreds of milliseconds. Keep the real-time smoothness assertions free of
// that observer overhead; request a separate recording only for visual review.
const recordVideo=process.env.PLANNER_PRESSURE_VIDEO==='1';
async function fixture(browser,width=390,height=844,{blockOptics=false}={}){
 const page=await browser.newPage({viewport:{width,height},hasTouch:true,...(recordVideo&&width===390?{recordVideo:{dir:'test-results/okti-listening/raw-video',size:{width,height}}}:{})}),errors=[];let atlasRequests=0,lightRequests=0;
 page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const u=new URL(route.request().url()),file=path.resolve(base,u.pathname==='/'?'preview33/index.html':u.pathname.slice(1));
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
 await page.waitForFunction(blockOptics=>{const root=document.querySelector('.octi-dock[data-channel=main]'),state=root?.octiListening?.getState(),canvas=root?.querySelector('.octi-listening-canvas'),video=root?.querySelector('.octi-listening-source'),pressure=root?.octiPressure?.getState();return state?.ready&&state.rendering&&!state.fallback&&canvas?.width===canvas?.height&&video?.currentTime>.25&&pressure?.ready&&(blockOptics||pressure.lightingReady)},blockOptics);
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 return {page,errors,get atlasRequests(){return atlasRequests},get lightRequests(){return lightRequests}};
}
// This fixture isolates visual feedback. The existing recorder/browser suites
// exercise actual recorder handlers with their explicit microphone/provider mocks.
async function visualOnly(page,channel='main'){
 await page.locator(`.octi-dock[data-channel=${channel}] .voice`).evaluate(button=>{
  button.addEventListener('click',event=>event.stopImmediatePropagation(),true);
  button.addEventListener('pointerdown',event=>{
   window.pressPointer=event.pointerId;const root=button.closest('.octi-dock'),r=root.querySelector('.octi-motion-media').getBoundingClientRect();
   root.pressStart={x:r.x+r.width/2,y:r.y+r.height/2};
   const run=root.querySelector('.octi-motion-media').getAnimations().find(a=>a.id==='okti-pressure-compositor');
   root.pressResponse={pressure:root.octiPressure.getState().pressure,width:r.width,phase:root.octiPressure.getState().phase,duration:Number(run?.effect.getTiming().duration),delay:run?.effect.getTiming().delay};
   const start=performance.now();root.onsetFrames=[];
   function sample(){
    const glass=root.querySelector('.octi-motion-media'),box=glass.getBoundingClientRect(),paint=root.octiPressure.getPaintState();
    const animation=glass.getAnimations().find(run=>run.id==='okti-pressure-compositor');
    // A resumed RAF can carry a timestamp from before this pointer event on
    // software GL. Read the running animation's clock, retaining wall time
    // separately; neither clock drives or seeks the feedback under test.
    root.onsetFrames.push({t:Number(animation?.currentTime)||0,wall:performance.now()-start,width:box.width,height:box.height,paint});
    if(paint.pressure<.99999&&root.querySelector('.water-float').dataset.pressState==='held')requestAnimationFrame(sample);
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
  let pixelHash=2166136261;for(const value of pixels)pixelHash=Math.imul(pixelHash^value,16777619)>>>0;
  let edgeAlpha=0,edgeInk=0,interiorAlpha=0;
  for(let y=0;y<384;y++)for(let x=0;x<384;x++){const r=Math.hypot(x-192,y-192),q=(y*384+x)*4;if(r<90)interiorAlpha+=pixels[q+3];if(r>122&&r<172){const a=pixels[q+3]/255;edgeAlpha+=pixels[q+3];edgeInk+=(255-(.2126*pixels[q]+.7152*pixels[q+1]+.0722*pixels[q+2]))*a}}
  const transmittedShadow=getComputedStyle(float.querySelector('.octi-pressure-shadow')),caustic=getComputedStyle(float.querySelector('.octi-pressure-caustic'));
  const lightStyles=[...glass.querySelectorAll('.octi-pressure-lights>span')].map(node=>{const s=getComputedStyle(node);return {opacity:Number(s.opacity),transform:s.transform,background:s.backgroundImage}});
  return {target:rect(root.querySelector('.voice')),glass:rect(glass),actor:rect(actor),buffer:{width:canvas.width,height:canvas.height},pressure:pressureState.pressure,pixelHash,lightStyles,materialFilter:getComputedStyle(membrane).filter,surfaceOpacity:Number(getComputedStyle(glass).opacity),canvasOpacity:Number(getComputedStyle(membrane).opacity),canvasParent:membrane.parentElement===glass,edgeAlpha,edgeInk,interiorAlpha,transmittedShadow:{transform:transmittedShadow.transform,translate:transmittedShadow.translate,filter:transmittedShadow.filter,opacity:transmittedShadow.opacity},causticTransform:caustic.transform,glassZ:Number(getComputedStyle(glass).zIndex),actorZ:Number(getComputedStyle(actor).zIndex),pressureState,membraneBuffer:{width:membrane.width,height:membrane.height},sameHost:glass.parentElement===actor.parentElement,filter:getComputedStyle(root.querySelector('.voice')).filter,pressStart:root.pressStart,touchAction:getComputedStyle(root.querySelector('.voice')).touchAction,userSelect:getComputedStyle(root.querySelector('.voice')).getPropertyValue('user-select')||getComputedStyle(root.querySelector('.voice')).getPropertyValue('-webkit-user-select'),driftPlayState:getComputedStyle(float).animationPlayState,background:getComputedStyle(glass).backgroundImage,shadow:getComputedStyle(glass).boxShadow,extraGlint:getComputedStyle(glass,':before').display};
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
    const root=float.closest('.octi-dock'),runs=[...float.querySelectorAll('*')].flatMap(node=>node.getAnimations()).filter(run=>run.id==='okti-pressure-compositor');
    const animation=float.querySelector('.octi-motion-media').getAnimations().find(run=>run.id==='okti-pressure-compositor');
    const frame=()=>{const r=float.querySelector('.octi-motion-media').getBoundingClientRect();return {pressure:root.octiPressure.getState().pressure,width:r.width,height:r.height,duration:Number(animation?.effect.getTiming().duration)||0}};
    if(!animation){resolve([frame()]);return}
    for(const run of runs)run.pause();await Promise.all(runs.map(run=>run.ready));const duration=Number(animation.effect.getTiming().duration),values=[];
    for(let i=0;i<=32;i++){for(const run of runs)run.currentTime=duration*i/32;values.push(frame())}
    for(const run of runs){run.currentTime=0;run.play()}resolve(values);
   }catch(error){reject(error)}
  },{once:true}));
 });
 return ()=>float.evaluate(float=>float.pressureSamples);
}
async function hold(page,channel='main'){
 const voice=page.locator(`.octi-dock[data-channel=${channel}] .voice`),b=await voice.boundingBox();
 await page.mouse.move(b.x+b.width/2,b.y+b.height*.4);await page.mouse.down();
 await page.waitForFunction(channel=>{const root=document.querySelector(`.octi-dock[data-channel=${channel}]`),s=root.octiPressure.getState();return s.pressure===1&&!root.querySelector('.octi-motion-media').getAnimations().some(a=>a.id==='okti-pressure-compositor'&&a.playState==='running')},channel);
 return voice;
}
async function settled(page,channel='main'){
 await page.waitForFunction(channel=>document.querySelector(`.octi-dock[data-channel=${channel}]`).octiPressure.getState().phase==='idle',channel);
}
async function observeTap(page,channel='main'){
 const root=page.locator(`.octi-dock[data-channel=${channel}]`);
 await root.evaluate(root=>{
  root.tapResult=new Promise(resolve=>{
   root.querySelector('.voice').addEventListener('pointerdown',event=>{
    const started=performance.now(),frames=[];let releasedAt=null,native=null;
    const finish=timedOut=>{clearTimeout(guard);window.removeEventListener('pointerup',released,true);resolve({frames,releasedAt,timedOut,native})};
    const guard=setTimeout(()=>finish(true),7000);
    function released(up){if(up.pointerId===event.pointerId){
     releasedAt=performance.now()-started;
     // Inspect the actual native return after finger-up. The entire 120 ms
     // feedback can finish between JS observer callbacks on software GL.
     const run=root.querySelector('.octi-motion-media').getAnimations().find(a=>a.id==='okti-pressure-compositor');
     if(run){
      const duration=Number(run.effect.getTiming().duration),poses=run.effect.getKeyframes().map(frame=>{
       const scale=frame.transform.match(/scale\(\s*([-\d.e+]+)\s*,\s*([-\d.e+]+)\s*\)/i);
       return {time:frame.computedOffset*duration,x:scale?Number(scale[1]):0,y:scale?Number(scale[2]):0};
      });
      native={duration,delay:run.effect.getTiming().delay,firstX:poses[0].x,lastX:poses.at(-1).x,maxX:Math.max(...poses.map(p=>p.x)),minX:Math.min(...poses.map(p=>p.x)),immediate:poses[1].x<poses[0].x,monotonic:poses.every((p,i)=>!i||p.x<=poses[i-1].x),phase:root.octiPressure.getState().phase,holding:root.octiPressure.getState().holding};
     }
    }}
    window.addEventListener('pointerup',released,true);
    function sample(time){
     const float=root.querySelector('.water-float'),glass=root.querySelector('.octi-motion-media').getBoundingClientRect();
     frames.push({t:time-started,pressure:root.octiPressure.getState().pressure,width:glass.width,height:glass.height,phase:float.dataset.pressState||'idle'});
     if(releasedAt!==null&&!float.hasAttribute('data-press-state'))finish(false);else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
   },{once:true});
  });
 });
 return ()=>root.evaluate(root=>root.tapResult);
}
function assertFastReturn(result){
 assert.equal(result.timedOut,false,'A real tap completes its visual cycle');
 assert.equal(result.native?.duration,120,'Finger-up gets a 120 ms return, with no queued contact phase');
 assert.equal(result.native.delay,0,'There is no finger-up delay');
 assert.equal(result.native.phase,'release');assert.equal(result.native.holding,false);
 assert.ok(result.native.firstX>=1.0639,'Even a before-first-frame tap retains visible immediate pressure: '+JSON.stringify(result));
 assert.equal(result.native.lastX,1,'The return ends at the original size');
 assert.ok(result.native.immediate&&result.native.monotonic,'The very first return interval shrinks and never waits or continues expanding: '+JSON.stringify(result));
 assert.equal(result.native.minX,1,'No long elastic tail follows the fast return');
 assert.equal(result.frames.at(-1).phase,'idle');assert.equal(result.frames.at(-1).pressure,0);
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
    const lighting=await page.locator('.octi-dock[data-channel=main]').evaluate(async root=>{
     const image=new Image();image.src=root.octiPressure.getState().lightSource;await image.decode();
     const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
     const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
     let tinted=0,center=0,rim=0,white=0,dark=0;const poses=Array(6).fill(0);
     for(let y=0;y<384;y++)for(let x=0;x<2304;x++){
      const q=(y*2304+x)*4,alpha=pixels[q+3],r=Math.hypot(x%384-191.5,y-191.5)/384;
      if(pixels[q]!==pixels[q+1]||pixels[q+1]!==pixels[q+2])tinted++;
      if(r<.075)center+=alpha;if(r>.365)rim+=alpha;
      poses[Math.floor(x/384)]+=alpha;if(pixels[q]>128)white+=alpha;else dark+=alpha;
     }
     return {width:image.width,height:image.height,tinted,center,rim,white,dark,poses};
    });
    assert.deepEqual([lighting.width,lighting.height],[2304,384]);
    assert.equal(lighting.tinted,0,'Every lighting pixel is neutral; the blue material cannot acquire another tint');
    assert.equal(lighting.center,0,'The fingertip center remains clear inside its surrounding reflections');
    assert.equal(lighting.rim,0,'The lighting leaves the original blue outer rim clear');
    assert.ok(lighting.white>100000&&lighting.dark>100000&&lighting.poses.every(v=>v>100000),'Each rendered indentation contains curved reflections and their relief shadows');
    assert.equal(await page.locator('.octi-key-seat').count(),0,'The extra glass mount has been removed');
    assert.ok(Math.abs(resting.glass.width/resting.target.width-1.28)<.002,'Restore the original full-size bubble');
    await hold(page);const pressed=await read(page);
    const response=await page.locator('.octi-dock[data-channel=main]').evaluate(root=>root.pressResponse);
    assert.ok(response.width>=resting.glass.width*1.0639&&response.pressure>=.4,'The pointerdown task itself changes the rendered geometry before any animation frame or click');
    assert.equal(response.duration,80,'The remaining expansion takes 80 ms');assert.equal(response.delay,0);
    assert.equal(response.phase,'held');
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
    assert.equal(pressed.pixelHash,resting.pixelHash,'All original RGBA material pixels stay unchanged during pressure');
    assert.equal(pressed.materialFilter,resting.materialFilter,'No pressure-dependent hue, saturation or material filter is applied');
    assert.ok(pressed.lightStyles.some(s=>s.opacity>.5),'Neutral surface reflections change visibly');
    assert.equal(pressed.lightStyles.length,6,'Six actual reflection shapes follow the indentation');
    for(const style of pressed.lightStyles)assert.match(style.background,/octi-pressure-lights-33-319\.webp/);
    assert.ok(Math.abs(pressed.lightStyles.reduce((sum,s)=>sum+s.opacity,0)-1)<.001,'Adjacent light poses never add an opaque replacement material');
    assert.ok(pressed.glassZ>pressed.actorZ,'The front-surface reflection remains visible over the live octopus');
    assert.notEqual(pressed.transmittedShadow.transform,resting.transmittedShadow.transform,'The transmitted shadow expands with the same contact');
    assert.notEqual(pressed.causticTransform,resting.causticTransform,'The transmitted light changes with the pressed membrane');
    assert.equal(await page.locator('.octi-pressure-media').count(),0,'No replacement glass layer is placed over the bubble');
    assert.equal(pressed.edgeInk,resting.edgeInk,'Pressure preserves the color and alpha of the original blue edge');
    assert.deepEqual(pressed.membraneBuffer,resting.membraneBuffer,'The glass canvas also keeps its backing buffer');
    assert.equal(pressed.pressureState.paintCount,resting.pressureState.paintCount,'Pressure never re-rasterizes the material');
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
    assert.equal(held.extraGlint,'none','Legacy pseudo-element glints cannot duplicate the rendered reflections');
    const onset=await page.locator('.octi-dock[data-channel=main]').evaluate(root=>root.onsetFrames);
    // RAF sampling shares the actor's main thread; software GL on CI can block
    // that observer for over a second while compositor animations keep running.
    // Probe the browser's actual interpolated transforms separately, retaining
    // the live clock/stall check below to reject manually stepped timelines.
    const nativeSizes=await page.locator('.octi-dock[data-channel=main]').evaluate(async root=>{
     const glass=root.querySelector('.octi-motion-media'),runs=[...root.querySelectorAll('*')].flatMap(node=>node.getAnimations()).filter(run=>run.id==='okti-pressure-compositor');
     const main=glass.getAnimations().find(run=>run.id==='okti-pressure-compositor'),duration=Number(main.effect.getTiming().duration),values=[];
     for(const run of runs)run.pause();await Promise.all(runs.map(run=>run.ready));
     for(let i=0;i<=10;i++){for(const run of runs)run.currentTime=duration*i/10;values.push(glass.getBoundingClientRect().width)}
     for(const run of runs)run.finish();return values;
    });
    assert.ok(new Set(nativeSizes.map(width=>width.toFixed(3))).size>=9,'Native geometry has distinct continuous intermediate sizes: '+JSON.stringify(nativeSizes));
    assert.ok(nativeSizes.every((width,i)=>!i||width>nativeSizes[i-1]),'Every native contact interval widens smoothly');
    assert.ok(onset.every((f,i)=>!i||f.width>=onset[i-1].width-.01),'The live contact never reverses or flickers');
    assert.ok(onset.every(f=>f.paint.count===resting.pressureState.paintCount),'The whole onset uses the immutable material with no Canvas redraws');
    const full=onset.find(f=>f.paint.pressure>=.99999);
    assert.ok(full&&full.t>=79&&full.t<=81,'Native contact finishes within 80 ms: '+JSON.stringify(onset));
    if(width===390){console.log(kind+' real onset: '+JSON.stringify(onset));await page.screenshot({path:`test-results/okti-listening/${kind}-pressure-held.png`})}
    const release=await samples(page);await page.mouse.up();const returning=await release();
    assert.equal(returning[0].duration,120,'A long hold returns as quickly as a short tap');
    assert.equal(returning[0].pressure,1);assert.equal(returning.at(-1).pressure,0);
    assert.ok(returning[1].pressure<returning[0].pressure&&returning.every((v,i)=>v.pressure>=0&&(!i||v.pressure<=returning[i-1].pressure)),'Release immediately shrinks without a held pose or oscillating tail: '+JSON.stringify(returning));await settled(page);
    assert.ok(Math.abs((await read(page)).glass.width-resting.glass.width)<.02,'The bubble returns to its original rendered size');assert.deepEqual((await read(page)).target,resting.target);
    assert.equal((await read(page)).transmittedShadow.transform,resting.transmittedShadow.transform,'The shadow recovers its original shape after release');
    assert.equal((await read(page)).interiorAlpha,resting.interiorAlpha,'The decoded resting glass is restored exactly after the optical animation');
    assert.ok((await read(page)).lightStyles.every(s=>s.opacity===0),'All indentation reflections return completely after release');
    if(width===390)await page.screenshot({path:`test-results/okti-listening/${kind}-pressure-restored.png`});
    // A native tap starts visible feedback on down and immediately reverses
    // on up. It must never queue completion of the contact or a minimum hold.
    const b=await page.locator('.octi-dock[data-channel=main] .voice').boundingBox(),tap=await observeTap(page);
    await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);const quick=await tap();
    assertFastReturn(quick);
    await settled(page);
    if(width===390){
     // Deterministic worst case: down and up occur in the same JavaScript task,
     // with no chance to paint a pressed frame between the two input events.
     // Then emulate the recorder disabling its focused button while opening
     // the microphone; its resulting blur must not erase the released tap.
     const instant=await observeTap(page);
     const sameTask=await page.locator('.octi-dock[data-channel=main] .voice').evaluate(button=>{
      button.focus();const root=button.closest('.octi-dock'),glass=root.querySelector('.octi-motion-media'),before=glass.getBoundingClientRect().width,r=button.getBoundingClientRect(),input={pointerId:25001,pointerType:'touch',isPrimary:true,bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2};
      button.dispatchEvent(new PointerEvent('pointerdown',input));const down=glass.getBoundingClientRect().width;
      window.dispatchEvent(new PointerEvent('pointerup',input));const phase=root.octiPressure.getState().phase;button.disabled=true;return {before,down,phase};
     });
     assert.ok(sameTask.down>=sameTask.before*1.0639,'No timer, click or display frame is required to apply visible pressure');assert.equal(sameTask.phase,'release');
     const result=await instant();await page.locator('.octi-dock[data-channel=main] .voice').evaluate(button=>{button.disabled=false});assertFastReturn(result);await settled(page);
     console.log(kind+' immediate tap: synchronous pressure and 120 ms return; same-task release after '+result.releasedAt.toFixed(2)+' ms.');
     const busy=await page.locator('.octi-dock[data-channel=main] .voice').evaluate(async button=>{
      const root=button.closest('.octi-dock'),r=button.getBoundingClientRect(),input={pointerId:25002,pointerType:'touch',isPrimary:true,bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2};
      button.dispatchEvent(new PointerEvent('pointerdown',input));
      const run=root.querySelector('.octi-motion-media').getAnimations().find(a=>a.id==='okti-pressure-compositor');
      // Wait for the initial compositor commit before blocking JavaScript.
      // A timeline read inside the first resumed RAF can still use its old
      // frame timestamp, so observe again on the following fresh frame.
      await run.ready;await new Promise(requestAnimationFrame);
      const before=Number(run.currentTime);
      const started=performance.now();while(performance.now()-started<150){}
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const state={time:Number(run.currentTime),before,playState:run.playState,keys:Object.keys(run.effect.getKeyframes()[0]),pressure:root.octiPressure.getState().pressure,draws:root.octiPressure.getPaintState().count};
      window.dispatchEvent(new PointerEvent('pointerup',input));const returning=root.querySelector('.octi-motion-media').getAnimations().find(a=>a.id==='okti-pressure-compositor');
      state.returnDuration=Number(returning.effect.getTiming().duration);await returning.ready;await new Promise(requestAnimationFrame);
      const releaseStarted=performance.now();while(performance.now()-releaseStarted<150){}
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      state.returnPressure=root.octiPressure.getState().pressure;return state;
     });
     assert.equal(busy.playState,'finished','The native 80 ms contact finishes during a 150 ms main-thread stall');
     assert.equal(busy.time,80);assert.equal(busy.pressure,1,'Native geometry reaches the held pose without JavaScript frames: '+JSON.stringify(busy));
     assert.equal(busy.returnDuration,120);assert.equal(busy.returnPressure,0,'The native return also finishes during a 150 ms main-thread stall');
     assert.ok(busy.keys.includes('transform')&&!busy.keys.some(k=>k.startsWith('--')),'Compositor transforms own the actual geometry');
     assert.equal(busy.draws,resting.pressureState.paintCount,'Busy input causes no material redraws');await settled(page);
     console.log(kind+' native clock during 150 ms main-thread stall: '+JSON.stringify(busy));
    }
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
     await page.locator('.octi-dock[data-channel=main] .voice').focus();await page.keyboard.down(' ');await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').octiPressure.getState().pressure>.95);assert.ok((await read(page)).pressure>.95);await page.keyboard.up(' ');await settled(page);
     await page.emulateMedia({reducedMotion:'reduce'});await hold(page);const reduced=await read(page);assert.ok(reduced.glass.width<resting.glass.width*1.025,'Reduced motion uses only a small static press');const quiet=await samples(page);await page.mouse.up();assert.ok((await quiet()).every(v=>v.pressure>=0),'Reduced motion has no elastic overshoot');await settled(page);await page.emulateMedia({reducedMotion:'no-preference'});
     await page.evaluate(()=>{showPlannerWeather=async()=>{};tasks=[{id:'pressure-event',title:'Test sprężystego bąbla',date:iso(selected),time:'17:00',endTime:'18:00'}];renderAll();openEventActions(tasks[0])});
     await page.waitForFunction(()=>!window.OktiEventMotion.getState()&&document.querySelector('.octi-dock[data-channel=event]')?.octiListening?.getState().rendering);await visualOnly(page,'event');const eventRest=await read(page,'event');
     await hold(page,'event');assert.deepEqual((await read(page,'event')).target,eventRest.target);const back=await samples(page,'event');await page.mouse.up();const eventReturn=await back();assert.equal(eventReturn[0].duration,120);assert.equal(eventReturn.at(-1).pressure,0);assert.ok(eventReturn.every(v=>v.pressure>=0));await settled(page,'event');
     await hold(page,'event');await page.evaluate(()=>closeEventActions());await page.mouse.up();await settled(page,'event');
    }
    assert.deepEqual(errors,[]);console.log(`${kind}: ${width}×${height} same-task pressure, 80 ms expansion, immediate 120 ms return, centered hold and native long-press protection passed.`);
   }finally{
    const recording=page.video();await page.close();
    if(recording){const source=await recording.path(),target=`test-results/okti-listening/${kind}-pressure-realtime.webm`;await recording.saveAs(target);if(path.resolve(source)!==path.resolve(target))fs.unlinkSync(source)}
   }
  }
  // Loading the optical atlas is optional: an unavailable asset must leave
  // one visible resting surface and working press/click controls.
  const unavailable=await fixture(browser,390,844,{blockOptics:true});
  try{
   await visualOnly(unavailable.page);const resting=await read(unavailable.page);
   assert.equal(unavailable.atlasRequests,0,'No colored atlas is requested, even when that former asset is unavailable');
   assert.ok(unavailable.lightRequests>0,'The optional neutral reflection asset was actually blocked');
   assert.equal(resting.pressureState.lightingReady,false);
   await hold(unavailable.page);const held=await read(unavailable.page);
   assert.equal(held.pressureState.rendering,true);assert.equal(held.pressureState.holding,true);
   assert.ok(held.glass.width>resting.glass.width*1.15);
   assert.deepEqual(held.target,resting.target);
   await unavailable.page.mouse.up();await settled(unavailable.page);
   assert.equal((await read(unavailable.page)).interiorAlpha,resting.interiorAlpha,'Missing optics still return to the original resting pixels');
   assert.deepEqual(unavailable.errors,[]);
   console.log(kind+': unavailable optical artwork retains visible glass and working press controls.');
  }finally{await unavailable.page.close()}
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
