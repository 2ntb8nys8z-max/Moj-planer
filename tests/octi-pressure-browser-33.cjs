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
    // The cubic can round to full width before the native timeline finishes.
    if(animation&&animation.playState!=='finished'&&root.querySelector('.water-float').dataset.pressState==='held')requestAnimationFrame(sample);
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
  return {footprint:getComputedStyle(float.querySelector(".octi-shadow-footprint")).transform,target:rect(root.querySelector('.voice')),glass:rect(glass),actor:rect(actor),buffer:{width:canvas.width,height:canvas.height},pressure:pressureState.pressure,pixelHash,lightStyles,materialFilter:getComputedStyle(membrane).filter,surfaceOpacity:Number(getComputedStyle(glass).opacity),canvasOpacity:Number(getComputedStyle(membrane).opacity),canvasParent:membrane.parentElement===glass,edgeAlpha,edgeInk,interiorAlpha,transmittedShadow:{transform:transmittedShadow.transform,translate:transmittedShadow.translate,filter:transmittedShadow.filter,opacity:transmittedShadow.opacity},causticTransform:caustic.transform,glassZ:Number(getComputedStyle(glass).zIndex),actorZ:Number(getComputedStyle(actor).zIndex),pressureState,membraneBuffer:{width:membrane.width,height:membrane.height},sameHost:glass.parentElement===actor.parentElement,filter:getComputedStyle(root.querySelector('.voice')).filter,pressStart:root.pressStart,touchAction:getComputedStyle(root.querySelector('.voice')).touchAction,userSelect:getComputedStyle(root.querySelector('.voice')).getPropertyValue('user-select')||getComputedStyle(root.querySelector('.voice')).getPropertyValue('-webkit-user-select'),driftPlayState:getComputedStyle(float).animationPlayState,background:getComputedStyle(glass).backgroundImage,shadow:getComputedStyle(glass).boxShadow,extraGlint:getComputedStyle(glass,':before').display};
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
 await page.waitForFunction(channel=>{const root=document.querySelector(`.octi-dock[data-channel=${channel}]`),s=root.octiPressure.getState();return s.pressure===1&&(s.atPresentedPeak||matchMedia('(prefers-reduced-motion: reduce)').matches)&&!root.querySelector('.octi-motion-media').getAnimations().some(a=>a.id==='okti-pressure-compositor'&&a.playState==='running')},channel);
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
    const started=performance.now(),frames=[];let releasedAt=null,native=null,attack=null;
    const finish=timedOut=>{clearTimeout(guard);window.removeEventListener('pointerup',released,true);resolve({frames,releasedAt,timedOut,native,attack})};
    const guard=setTimeout(()=>finish(true),7000);
    function released(up){if(up.pointerId===event.pointerId){
     releasedAt=performance.now()-started;
     // Inspect the actual native return after finger-up. The entire 600 ms
     // feedback can finish between JS observer callbacks on software GL.
     const run=root.querySelector('.octi-motion-media').getAnimations().find(a=>a.id==='okti-pressure-compositor');
     function capture(run){if(run){
      const duration=Number(run.effect.getTiming().duration),poses=run.effect.getKeyframes().map(frame=>{
       const scale=frame.transform.match(/scale\(\s*([-\d.e+]+)\s*,\s*([-\d.e+]+)\s*\)/i);
       return {time:frame.computedOffset*duration,x:scale?Number(scale[1]):0,y:scale?Number(scale[2]):0};
      });
      native={count:poses.length,peakAt:poses.find(p=>p.x===Math.max(...poses.map(v=>v.x))).time,duration,delay:run.effect.getTiming().delay,firstX:poses[0].x,lastX:poses.at(-1).x,maxX:Math.max(...poses.map(p=>p.x)),minX:Math.min(...poses.map(p=>p.x)),immediate:poses[1].x<poses[0].x,monotonic:poses.every((p,i)=>!i||p.x<=poses[i-1].x),phase:root.octiPressure.getState().phase,holding:root.octiPressure.getState().holding};
     }}
     capture(run);
     if(native?.count===13){
      attack=native;native=null;
      function readReturn(){
       const current=root.querySelector('.octi-motion-media').getAnimations().find(a=>a.id==='okti-pressure-compositor');
       if(current&&current!==run)capture(current);
       else if(root.octiPressure.getState().phase==='release')requestAnimationFrame(readReturn);
      }
      requestAnimationFrame(readReturn);
     }
    }}
    window.addEventListener('pointerup',released,true);
    function sample(time){
     const float=root.querySelector('.water-float'),glass=root.querySelector('.octi-motion-media').getBoundingClientRect();
     frames.push({t:time-started,wall:performance.now()-started,pressure:root.octiPressure.getState().pressure,width:glass.width,height:glass.height,phase:float.dataset.pressState||'idle'});
     if(releasedAt!==null&&!float.hasAttribute('data-press-state'))finish(false);else requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
   },{once:true});
  });
 });
 return ()=>root.evaluate(root=>root.tapResult);
}
async function verifyCastPixels(page){
 const root=page.locator('.octi-dock[data-channel=main]'),voice=root.locator('.voice');
 const isolation=await page.addStyleTag({content:`
  html,body{background:white!important}body *,body :before,body :after{visibility:hidden!important}
  .octi-dock[data-channel=main] .water-float:has(.octi-shadow-footprint){animation-play-state:paused!important}
  .octi-dock[data-channel=main] .octi-shadow-footprint :is(.octi-pressure-shadow,.octi-pressure-caustic){visibility:visible!important}`});
 try{
  const bounds=await voice.evaluate(node=>node.getBoundingClientRect().toJSON()),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
  const clip={x:Math.floor(x-65),y:Math.floor(y+8),width:180,height:100};
  async function measure(){
   const pixels=await page.screenshot({clip});
   return page.evaluate(async data=>{
    const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
    const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data,columns=new Float64Array(canvas.width);
    for(let i=0;i<rgba.length;i+=4)columns[(i/4)%canvas.width]+=Math.max(0,250-(rgba[i]+rgba[i+1]+rgba[i+2])/3);
    const sum=columns.reduce((a,b)=>a+b,0);let accum=0,left=-1,right=-1;
    for(let i=0;i<columns.length;i++){accum+=columns[i];if(left<0&&accum>=sum*.05)left=i;if(right<0&&accum>=sum*.95)right=i}
    return {left,right,ink:Math.round(sum)};
   },pixels.toString('base64'));
  }
  const rest=await measure();
  await voice.dispatchEvent('pointerdown',{isPrimary:true,pointerId:419,clientX:x,clientY:y});
  await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').octiPressure.getState().pressure===1);
  const held=await measure();
  assert.ok(rest.ink>1000&&held.left<rest.left-2&&held.right>rest.right+2,'The actual cast pixels move outward on both sides: '+JSON.stringify({rest,held}));
  console.log(kind+' cast pixels '+JSON.stringify({rest,held}));
 }finally{await voice.dispatchEvent('pointercancel',{pointerId:419});await isolation.evaluate(node=>node.remove())}
}
function assertFastReturn(result){
 assert.equal(result.timedOut,false,'A real tap completes its visual cycle');
 assert.equal(result.native.duration,1750,'Return has the original duration');
 assert.equal(result.native.delay,0);assert.equal(result.native.phase,'release');assert.equal(result.native.holding,false);
 assert.equal(result.native.lastX,1);assert.ok(result.native.minX<.995);
 assert.equal(result.native.count,36,'Return has the successive damped extrema of the reference');
 assert.equal(result.native.firstX,1.106,'Every release starts from the full held width');
 assert.ok(result.native.immediate,'There is no plateau after maximum expansion');
 if(result.attack){assert.equal(result.attack.duration,600);assert.equal(result.attack.delay,0);assert.equal(result.attack.lastX,1.106)}
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
     const expected=ctx.getImageData(0,0,384,384).data;
     ctx.clearRect(0,0,384,384);ctx.drawImage(canvas,0,0);ctx.drawImage(root.querySelector('.octi-glass-surface'),0,0);
     const actual=ctx.getImageData(0,0,384,384).data;
     let differences=0,maxDelta=0;const first=[];for(let i=0;i<expected.length;i++)if(Math.abs(expected[i]-actual[i])*(i%4===3?1:expected[i-i%4+3]/255)>3){differences++;maxDelta=Math.max(maxDelta,Math.abs(expected[i]-actual[i]));if(first.length<8)first.push({i,expected:expected[i],actual:actual[i],alpha:expected[i-i%4+3]})}return {exact:!differences,differences,maxDelta,first};
    });
    assert.equal(exactOriginal.exact,true,'At rest the two textures reconstruct the reference within 3 premultiplied color levels: '+JSON.stringify(exactOriginal));
    assert.equal(await page.locator('.octi-pressure-lights').count(),0,'Discarded reflection atlases do not create or animate extra layers');
    assert.equal(await page.locator('.octi-key-seat').count(),0,'The extra glass mount has been removed');
    assert.ok(Math.abs(resting.glass.width/resting.target.width-1.28)<.002,'Restore the original full-size bubble');
    await hold(page);const pressed=await read(page);
    const response=await page.locator('.octi-dock[data-channel=main]').evaluate(root=>root.pressResponse);
    assert.ok(response.pressure>=0&&response.pressure<=1,'The native contact starts on pointerdown');
    assert.equal(response.duration,600,'A short native contact remains visibly smooth');assert.equal(response.delay,0);
    assert.equal(response.phase,'held');
    assert.deepEqual(pressed.target,resting.target,'Only artwork flexes; the recorder hit target stays still');
    assert.ok(pressed.glass.width>resting.glass.width*1.104,'The held bubble widens');
    assert.ok(pressed.glass.height>resting.glass.height*1.043,'Pressure expands the membrane around its whole circumference');
    const center=r=>({x:r.x+r.width/2,y:r.y+r.height/2});
    assert.ok(Math.abs(center(pressed.glass).x-center(pressed.actor).x)<.05,'Expansion keeps the center fixed horizontally: '+JSON.stringify({start:pressed.pressStart,current:center(pressed.glass)}));
    assert.ok(Math.abs(center(pressed.glass).y-center(pressed.actor).y)<.05,'Expansion keeps the center fixed vertically: '+JSON.stringify({start:pressed.pressStart,current:center(pressed.glass)}));
    assert.equal(pressed.driftPlayState,'running','Touching never freezes the actor or its idle floating');
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
    assert.match(pressed.pressureState.source,/octi-water-shell-332\.png/);
    assert.equal(pressed.pixelHash,resting.pixelHash,'All original RGBA material pixels stay unchanged during pressure');
    assert.equal(pressed.materialFilter,resting.materialFilter,'No pressure-dependent hue, saturation or material filter is applied');
    assert.equal(pressed.lightStyles.length,0,'Only the original blue surface is painted');
    assert.ok(pressed.glassZ>pressed.actorZ,'The front-surface reflection remains visible over the live octopus');
    const footprint=pressed.footprint.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
    assert.ok(Math.abs(footprint[0]-1.08)<.001&&Math.abs(footprint[3]-1.04)<.001,'Both cast layers expand with the approved shell');
    assert.equal(pressed.transmittedShadow.transform,resting.transmittedShadow.transform,'The contact does not create another shadow animation');
    assert.equal(pressed.causticTransform,resting.causticTransform,'The existing caustic keeps its original material');
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
    assert.ok(Math.abs(center(held.glass).x-center(held.actor).x)<.05&&Math.abs(center(held.glass).y-center(held.actor).y)<.05,'Glass and actor keep floating together during a long hold');
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
    const full=onset.at(-1);
    assert.ok(full&&full.paint.pressure>=.99999&&full.t>=599&&full.t<=601,'Native contact finishes within 600 ms: '+JSON.stringify(onset));
    if(width===390){
     const contact=await page.locator('.octi-dock[data-channel=main]').evaluate(root=>{
      const lens=root.querySelector('.octi-contact-lens'),actor=root.querySelector('.octi-touch-actor');
      const matrix=new DOMMatrix(getComputedStyle(actor).transform),pose=root.octiPressure.getActorPose();
      return {alpha:Number(getComputedStyle(lens).opacity),rotation:getComputedStyle(lens).transform,
       localWidth:lens.offsetWidth/root.querySelector('.octi-motion-media').offsetWidth,identity:matrix.isIdentity,head:pose.head,arms:pose.arms};
     });
     assert.ok(contact.alpha>.95&&contact.rotation!=='none'&&contact.localWidth>.88&&contact.localWidth<.94,'The held surface catches light at the off-center touch');
     assert.ok(contact.identity&&contact.head===.38&&contact.arms===.19,'The actor plane stays fixed while the renderer deforms the head and free tips');
     console.log(kind+' real onset: '+JSON.stringify(onset));await page.screenshot({path:`test-results/okti-listening/${kind}-pressure-held.png`})}
    const release=await samples(page);await page.mouse.up();const returning=await release();
    assert.equal(returning[0].duration,1750,'A long hold returns as quickly as a short tap');
    assert.ok(returning[4].height>resting.glass.height*1.05,'The first rebound stretches the membrane vertically');assert.equal(returning[0].pressure,1);assert.equal(returning.at(-1).pressure,0);
    assert.ok(returning[1].pressure<returning[0].pressure&&Math.min(...returning.map(v=>v.pressure))<-.22&&returning.slice(8,12).some(v=>v.pressure>.09),'Release crosses rest and rebounds once before settling: '+JSON.stringify(returning));await settled(page);
    assert.ok(Math.abs((await read(page)).glass.width-resting.glass.width)<.02,'The bubble returns to its original rendered size');assert.deepEqual((await read(page)).target,resting.target);
    assert.equal((await read(page)).footprint,resting.footprint,'The shared optical footprint returns to rest');
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
     assert.ok(sameTask.down>=sameTask.before-.02&&sameTask.down<=sameTask.before*1.16+.02,'Input starts a continuous contact without the former hard 40% jump');assert.equal(sameTask.phase,'release');
     const result=await instant();await page.locator('.octi-dock[data-channel=main] .voice').evaluate(button=>{button.disabled=false});assertFastReturn(result);await settled(page);
     console.log(kind+' immediate tap: continuous native pressure and 1750 ms return; same-task release after '+result.releasedAt.toFixed(2)+' ms.');
     const busy=await page.locator('.octi-dock[data-channel=main] .voice').evaluate(async button=>{
      const root=button.closest('.octi-dock'),r=button.getBoundingClientRect(),input={pointerId:25002,pointerType:'touch',isPrimary:true,bubbles:true,clientX:r.x+r.width/2,clientY:r.y+r.height/2};
      button.dispatchEvent(new PointerEvent('pointerdown',input));
      const run=root.querySelector('.octi-motion-media').getAnimations().find(a=>a.id==='okti-pressure-compositor');
      // Wait for the initial compositor commit before blocking JavaScript.
      // A timeline read inside the first resumed RAF can still use its old
      // frame timestamp, so observe again on the following fresh frame.
      await run.ready;await new Promise(requestAnimationFrame);
      const before=Number(run.currentTime);
      const started=performance.now();while(performance.now()-started<650){}
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const state={time:Number(run.currentTime),before,playState:run.playState,keys:Object.keys(run.effect.getKeyframes()[0]),pressure:root.octiPressure.getState().pressure,draws:root.octiPressure.getPaintState().count};
      while(!root.octiPressure.getState().atPresentedPeak)await new Promise(requestAnimationFrame);
      window.dispatchEvent(new PointerEvent('pointerup',input));const returning=root.querySelector('.octi-motion-media').getAnimations().find(a=>a.id==='okti-pressure-compositor');
      state.returnDuration=Number(returning.effect.getTiming().duration);await returning.ready;await new Promise(requestAnimationFrame);
      const releaseStarted=performance.now();while(performance.now()-releaseStarted<1800){}
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      state.returnPressure=root.octiPressure.getState().pressure;return state;
     });
     assert.equal(busy.playState,'finished','The native contact finishes during a 650 ms main-thread stall');
     assert.equal(busy.time,600);assert.equal(busy.pressure,1,'Native geometry reaches the held pose without JavaScript frames: '+JSON.stringify(busy));
     assert.equal(busy.returnDuration,1750);assert.equal(busy.returnPressure,0,'The native return finishes without needing JavaScript frame updates');
     assert.ok(busy.keys.includes('transform')&&!busy.keys.some(k=>k.startsWith('--')),'Compositor transforms own the actual geometry');
     assert.equal(busy.draws,resting.pressureState.paintCount,'Busy input causes no material redraws');await settled(page);
     console.log(kind+' native clock during 650 ms main-thread stall: '+JSON.stringify(busy));
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
     await verifyCastPixels(page);
     await page.evaluate(()=>{showPlannerWeather=async()=>{};tasks=[{id:'pressure-event',title:'Test sprężystego bąbla',date:iso(selected),time:'17:00',endTime:'18:00'}];renderAll();openEventActions(tasks[0])});
     await page.waitForFunction(()=>!window.OktiEventMotion.getState()&&document.querySelector('.octi-dock[data-channel=event]')?.octiListening?.getState().rendering);await visualOnly(page,'event');const eventRest=await read(page,'event');
     await hold(page,'event');assert.deepEqual((await read(page,'event')).target,eventRest.target);const back=await samples(page,'event');await page.mouse.up();const eventReturn=await back();assert.equal(eventReturn[0].duration,1750);assert.equal(eventReturn.at(-1).pressure,0);assert.ok(eventReturn.some(v=>v.pressure<-.2)&&eventReturn.slice(8,12).some(v=>v.pressure>.09));await settled(page,'event');
     await hold(page,'event');await page.evaluate(()=>closeEventActions());await page.mouse.up();await settled(page,'event');
    }
    assert.deepEqual(errors,[]);console.log(`${kind}: ${width}×${height} single-transform pressure, continuous floating, smooth 600/1750 ms feedback, centered hold and native long-press protection passed.`);
   }finally{
    const recording=page.video();await page.close();
    if(recording){const source=await recording.path(),target=`test-results/okti-listening/${kind}-pressure-realtime.webm`;await recording.saveAs(target);if(path.resolve(source)!==path.resolve(target))fs.unlinkSync(source)}
   }
  }
  // Reproduce the phone's DPR and the real software path, with live video.
  // Native keyframes alone cannot prove that the actor and UI keep painting.
  const mobile=await fixture(browser,390,844,{software:true,dpr:3});
  try{
   const {page}=mobile;await visualOnly(page);await page.waitForTimeout(600);
   const before=await read(page);
   assert.equal(before.pressureState.ready,true);
   const media=await page.locator('.octi-dock[data-channel=main]').evaluate(root=>{
    window.qaPlaybackCalls=0;
    const play=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){qaPlaybackCalls++;return play.call(this)};
    const video=root.querySelector('.octi-listening-source');
    return {time:video.currentTime,frames:video.getVideoPlaybackQuality?.().totalVideoFrames??null,paints:root.octiListening.getState().paintCount};
   });
   const observed=[];
   for(let i=0;i<4;i++){
    const tap=await observeTap(page),b=await page.locator('.octi-dock[data-channel=main] .voice').boundingBox();
    await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);const result=await tap();assertFastReturn(result);
    const visible=result.frames.filter(f=>f.pressure>.01&&f.width>before.glass.width+.1);
    observed.push({frames:visible.length,distinct:new Set(visible.map(f=>f.width.toFixed(2))).size,wall:result.frames.at(-1).wall,trace:result.frames,native:result.native});
   }
   const running=await page.locator('.octi-dock[data-channel=main]').evaluate(root=>{const video=root.querySelector('.octi-listening-source'),image=root.querySelector('.octi-listening-fallback'),state=root.octiListening.getState();return {calls:qaPlaybackCalls,paints:state.paintCount,nativeIdle:state.nativeIdle,offThread:state.offThread,backgroundError:state.backgroundError,idleVisible:Number(getComputedStyle(image).opacity),idleLoaded:image.complete&&image.naturalWidth===384,idleSource:image.getAttribute('src'),time:video.currentTime,frames:video.getVideoPlaybackQuality?.().totalVideoFrames??null,paused:video.paused,renderer:state.renderer,drift:getComputedStyle(root.querySelector('.water-float')).animationPlayState}});
   assert.equal(running.renderer,'canvas2d');assert.equal(running.calls,0,'Repeated touches never restart the live video');
   assert.equal(running.paused,false);assert.equal(running.drift,'running');
   // currentTime wraps naturally at the loop boundary. Decoded frame count
   // must advance across that boundary, without interpreting a loop as a stall.
   const advanced=(media.frames!==null&&running.frames!==null&&running.frames>media.frames)||Math.abs(running.time-media.time)>.001;
   assert.ok(advanced,'The video advances across loop boundaries, including engines whose decoded-frame counter stays at zero: '+JSON.stringify({media,running}));
   assert.ok(running.nativeIdle&&running.idleVisible===1&&running.idleLoaded,'The approved animated idle image stays visible throughout the taps');
   assert.match(running.idleSource,/octi-water-idle-332\.webp/);
   assert.equal(running.paints,media.paints,'Idle feedback never competes with a CPU pixel loop');
   assert.ok(observed.every(t=>t.frames>=3&&t.distinct>=3&&t.wall-2350<490&&t.trace.every((f,i)=>!i||f.wall-t.trace[i-1].wall<1000)),'Every actual mobile tap paints multiple moving frames, without a main-thread freeze: '+JSON.stringify(observed));
   console.log(kind+' DPR3 native idle frames: '+JSON.stringify({observed:observed.map(({trace,native,...summary})=>summary),running}));
   assert.ok(running.offThread,'The fallback projection runs in a background worker: '+JSON.stringify(running));
   // Also verify touch responsiveness during the active recording,
   // not only while the idle image can take over from the software renderer.
   await page.evaluate(()=>{plannerRecordings.main={mode:'recording',deadline:Date.now()+60000,chunks:[]}});
   await page.waitForFunction(()=>{const s=document.querySelector('.octi-dock[data-channel=main]').octiListening.getState();return s.isRecording&&s.nativeIdle&&s.approach===0});
   const recordings=[];
   for(let i=0;i<(kind==='webkit'?8:4);i++){
    const tap=await observeTap(page),b=await page.locator('.octi-dock[data-channel=main] .voice').boundingBox();
    await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);const result=await tap();assertFastReturn(result);
    recordings.push(new Set(result.frames.filter(f=>f.pressure>.01).map(f=>f.width.toFixed(2))).size);
   }
   console.log(kind+' DPR3 native recording '+JSON.stringify(recordings));
   assert.ok(recordings.every(n=>n>=3),'Native recording paints at least three sizes on each tap: '+JSON.stringify(recordings));
   await page.route('**/octi-water-idle-332.webp*',route=>route.fulfill({status:404,body:'missing native animation'}));
   await page.locator('.octi-dock[data-channel=main] .octi-listening-fallback').evaluate(im=>{im.src='octi-water-idle-332.webp?missing-native-animation'});
   await page.waitForFunction(()=>{const s=document.querySelector('.octi-dock[data-channel=main]').octiListening.getState();return s.offThread&&!s.nativeIdle&&s.isRecording&&s.approach===0&&s.paintCount>=2});
   const activeBefore=await page.locator('.octi-dock[data-channel=main]').evaluate(root=>root.octiListening.getState().paintCount),active=[],activeTraces=[];
   for(let i=0;i<2;i++){
    const tap=await observeTap(page),b=await page.locator('.octi-dock[data-channel=main] .voice').boundingBox();await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);const result=await tap();assertFastReturn(result);
    active.push(new Set(result.frames.filter(f=>f.pressure>.01).map(f=>f.width.toFixed(2))).size);
    activeTraces.push(result.frames);
   }
   const activeAfter=await page.locator('.octi-dock[data-channel=main]').evaluate(root=>root.octiListening.getState().paintCount);
   assert.ok(active.every(frames=>frames>=3)&&activeAfter>activeBefore,'The head keeps rendering off the main thread while every tap paints multiple frames: '+JSON.stringify({active,activeBefore,activeAfter,activeTraces}));
   await page.evaluate(()=>{plannerRecordings.main=null});
   console.log(kind+' DPR3 background recording: '+JSON.stringify({active,activeBefore,activeAfter}));assert.deepEqual(mobile.errors,[]);
  }finally{await mobile.page.close()}
  // Loading the optical atlas is optional: an unavailable asset must leave
  // one visible resting surface and working press/click controls.
  const unavailable=await fixture(browser,390,844,{blockOptics:true});
  try{
   await visualOnly(unavailable.page);const resting=await read(unavailable.page);
   assert.equal(unavailable.atlasRequests,0,'No colored atlas is requested, even when that former asset is unavailable');
   assert.equal(unavailable.lightRequests,0,'The discarded neutral atlas is no longer requested');
   await hold(unavailable.page);const held=await read(unavailable.page);
   assert.equal(held.pressureState.rendering,true);assert.equal(held.pressureState.holding,true);
   assert.ok(held.glass.width>resting.glass.width*1.104);
   assert.deepEqual(held.target,resting.target);
   await unavailable.page.mouse.up();await settled(unavailable.page);
   assert.equal((await read(unavailable.page)).interiorAlpha,resting.interiorAlpha,'Missing optics still return to the original resting pixels');
   assert.deepEqual(unavailable.errors,[]);
   console.log(kind+': unavailable optical artwork retains visible glass and working press controls.');
  }finally{await unavailable.page.close()}
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
