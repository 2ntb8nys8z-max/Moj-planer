const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const base=path.resolve('.');
async function routeFiles(page,failMedia=false,holdListening=false){
 let release;const listeningGate=holdListening?new Promise(resolve=>{release=resolve}):Promise.resolve();
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url()),file=path.resolve(base,url.pathname==='/'?'preview33/index.html':url.pathname.slice(1));
  if(url.origin==='https://planner.test'&&file.startsWith(base+'/')&&fs.existsSync(file)&&fs.statSync(file).isFile()){
   const bytes=fs.readFileSync(file),types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.mp4':'video/mp4','.woff2':'font/woff2','.ttf':'font/ttf'};
   if(file.endsWith('octi-water-motion.webp')&&failMedia==='all-media-fail')return route.fulfill({status:404,body:'missing animated image'});
   if(file.endsWith('octi-listening-body.mp4'))await listeningGate;
   if(file.endsWith('.mp4')){
    if(failMedia)return route.fulfill({status:404,body:'missing clip'});
    const range=route.request().headers().range?.match(/bytes=(\d+)-(\d*)/);
    if(range){const start=Number(range[1]),end=range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;return route.fulfill({status:206,body:bytes.subarray(start,end+1),contentType:'video/mp4',headers:{'accept-ranges':'bytes','content-range':`bytes ${start}-${end}/${bytes.length}`,'content-length':String(end-start+1)}});}
   }
   return route.fulfill({body:bytes,contentType:types[path.extname(file)]||'application/json',headers:{'accept-ranges':'bytes'}});
  }
  return route.fulfill({body:route.request().resourceType()==='script'?'':'{}',contentType:route.request().resourceType()==='script'?'application/javascript':'application/json'});
 });
 return ()=>release?.();
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-accelerated-video-decode']});
 try{
  for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'no-preference'}),errors=[];
   page.on('pageerror',error=>errors.push(error.message));const releaseListening=await routeFiles(page,false,width===390);await page.goto('https://planner.test/preview33/index.html',{waitUntil:'domcontentloaded'});
   const dock=page.locator('.octi-dock[data-channel=main]'),video=dock.locator('video.octi-listening-source');
   await page.waitForFunction(()=>{const v=document.querySelector('.octi-dock[data-channel=main] video');return v.readyState>=2&&!v.paused&&v.parentElement.classList.contains('is-rendered')});
   const before=await video.evaluate(v=>v.currentTime);await page.waitForTimeout(250);assert.ok(await video.evaluate(v=>v.currentTime)>before,'The actual decoded clip advances');
   const geometry=await dock.evaluate(root=>{const b=root.querySelector('.voice'),r=b.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2),app=document.querySelector('.app');return {hit:hit===b||b.contains(hit),width:r.width,bottom:r.bottom,overflow:document.documentElement.scrollWidth>innerWidth,verticalOverflow:app.scrollHeight-app.clientHeight,muted:root.querySelector('video').muted,inline:root.querySelector('video').playsInline}});
   assert.equal(geometry.hit,true);assert.ok(geometry.width>=44);assert.ok(geometry.bottom<=height);assert.equal(geometry.overflow,false);assert.equal(geometry.verticalOverflow,0,'Decorative video margins cannot create scrollable app overflow');assert.equal(geometry.muted,true);assert.equal(geometry.inline,true);
   assert.equal(await dock.locator('.commands').isVisible(),false,'Idle suggestions stay absent');
   // Holding the real button must not dim, shrink or shift either artwork layer.
   const voice=dock.locator('.voice'),pressStyles=()=>voice.evaluate(button=>{
    const style=getComputedStyle(button),floatStyle=getComputedStyle(button.closest('.stage').querySelector('.water-float'));
    return {filter:style.filter,transform:style.transform,tap:style.webkitTapHighlightColor,floating:floatStyle.transform};
   });
   const resting=await pressStyles(),buttonBox=await voice.boundingBox();
   await page.mouse.move(buttonBox.x+buttonBox.width/2,buttonBox.y+buttonBox.height/2);await page.mouse.down();
   assert.equal(await voice.evaluate(button=>button.matches(':active')),true);
   const pressed=await pressStyles();assert.deepEqual(pressed,resting,'Holding Okti keeps its brightness and artwork position');
   assert.equal(pressed.filter,'none');assert.equal(pressed.tap,'rgba(0, 0, 0, 0)');
   await page.mouse.move(1,1);await page.mouse.up();
   const media=dock.locator('.octi-motion-media'),drift=await media.evaluate(el=>getComputedStyle(el).translate);await page.waitForTimeout(350);assert.notEqual(await media.evaluate(el=>getComputedStyle(el).translate),drift,'The visible bubble drifts gently');
   const idleAction=await dock.locator('.action-bubble').boundingBox();
   await dock.locator('.action-bubble').click();await page.waitForTimeout(100);const openingAngle=await dock.locator('.action-rotation').evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return Math.atan2(m.b,m.a)*180/Math.PI});assert.ok(openingAngle>0&&openingAngle<44.9,'The plus visibly rotates through intermediate angles on opening');
   await page.waitForFunction(()=>[...document.querySelectorAll('.octi-dock[data-channel=main] .menu-bud-neck')].some(c=>!c.hidden&&c.getContext('2d').getImageData(0,0,260,260).data.some((v,i)=>i%4===3&&v>30)),null,{timeout:10000});
   await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main]').hasAttribute('data-menu-budding'));
   assert.equal(await dock.locator('.bubble-extra:not(:disabled)').count(),3);assert.equal((await dock.locator('.bubble-menu').textContent()).trim(),'','Bubbles contain symbols without captions');
   for(const action of await dock.locator('.bubble-extra').all()){const box=await action.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,'Each menu action fits the viewport');assert.equal(await action.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true,'Each emerged bubble can be tapped');const offset=await action.evaluate(el=>{const b=el.querySelector('.menu-bud-skin').getBoundingClientRect(),s=el.querySelector('svg').getBoundingClientRect();return Math.hypot(b.x+b.width/2-s.x-s.width/2,b.y+b.height/2-s.y-s.height/2)});assert.ok(offset<1,'Action symbols stay centered in their moving bubbles');}
   fs.mkdirSync('test-output',{recursive:true});await page.screenshot({path:`test-output/cancel-bubble-menu-${width}.png`});
   await dock.locator('.action-bubble').click();await page.waitForTimeout(100);const closingAngle=await dock.locator('.action-rotation').evaluate(el=>{const m=new DOMMatrix(getComputedStyle(el).transform);return Math.atan2(m.b,m.a)*180/Math.PI});assert.ok(closingAngle>0&&closingAngle<44.9,'The X visibly rotates back through intermediate angles on closing');await dock.locator('.action-bubble').click();await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main]').hasAttribute('data-menu-budding'));assert.equal(await dock.locator('.bubble-extra:not(:disabled)').count(),3,'Rapid close and reopen does not leave disabled or ghost actions');await dock.locator('.action-bubble').click();await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main]').hasAttribute('data-menu-budding'));assert.equal(await dock.locator('.bubble-extra:visible').count(),0,'Closing collects every bubble');

   if(width===390){await page.evaluate(()=>{plannerRecordings.main={mode:'opening'}});await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').dataset.mode==='opening');const openingFrames=await video.evaluate(v=>v.getVideoPlaybackQuality().totalVideoFrames);await page.waitForTimeout(250);assert.ok(await video.evaluate(v=>!v.paused&&v.getVideoPlaybackQuality().totalVideoFrames)>openingFrames,'Microphone permission and setup do not freeze the visible idle clip');}
   await page.evaluate(()=>{plannerRecordings.main={mode:'recording',deadline:Date.now()+RECORDING_SECONDS*1000,chunks:[]}});
   await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').dataset.mode==='recording');
   assert.equal(await dock.locator('.commands').isVisible(),false,'Recording has no timer ribbon');
   if(width===390){const loadingFrames=await video.evaluate(v=>v.getVideoPlaybackQuality().totalVideoFrames);await page.waitForTimeout(250);assert.equal(await dock.evaluate(r=>r.octiListening.getState().rendering),false,'Listening media is deliberately still loading');assert.ok(await video.evaluate(v=>!v.paused&&v.getVideoPlaybackQuality().totalVideoFrames)>loadingFrames,'Idle motion continues until the first rendered listening frame');releaseListening();await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').octiListening.getState().rendering);}
   assert.equal(await dock.locator('.action-bubble').count(),1,'One action bubble serves both menu and cancel');assert.equal(await dock.locator('.dismiss,.dismiss-canvas,.dismiss-flow').count(),0,'No separate cancel bud is created');
   await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main]').hasAttribute('data-action-moving'));
   const cancel=dock.locator('.action-bubble'),b=await cancel.boundingBox(),main=await dock.locator('.voice').boundingBox();
   assert.ok(b.x>=0&&b.y>=0&&b.x+b.width<=width&&b.y+b.height<=height,'Cancel remains on screen');
   assert.ok(b.x+b.width/2>main.x+main.width/2&&b.y+b.height/2<main.y+main.height/2,'Cancel sits above the right-hand finger, close to the main rim');assert.ok(b.y<idleAction.y-25,'The original plus visibly travels upward');
   const skin=await cancel.locator('.action-skin').evaluate(el=>{const r=el.getBoundingClientRect(),p=el.parentElement.getBoundingClientRect(),mark=el.querySelector('.action-mark').getBoundingClientRect();return {offset:Math.hypot(r.x+r.width/2-mark.x-mark.width/2,r.y+r.height/2-mark.y-mark.height/2),width:r.width,target:p.width,background:getComputedStyle(el).backgroundImage,warm:el.style.getPropertyValue('--action-warm'),glass:el.querySelector('img').complete&&el.querySelector('img').naturalWidth>0}});assert.ok(skin.offset<1,'The glass and geometric X stay centered');assert.ok(skin.width<skin.target*.8,'Cancel ends visibly smaller while keeping a generous hit target');assert.match(skin.background,/gradient/);assert.equal(skin.warm,'1','Cancel has a warm internal glow');assert.equal(skin.glass,true,'The blue glass artwork actually loads');
   assert.equal(await cancel.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true,'The transformed bubble is reachable');
   await page.evaluate(()=>plannerRecordings.main.mode='ready');await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').dataset.mode==='ready');assert.equal(await dock.locator('.commands').isVisible(),false,'Ready recording does not restore the send ribbon');assert.equal(await cancel.getAttribute('aria-label'),'Skasuj nagranie');
   fs.mkdirSync('test-output',{recursive:true});await page.screenshot({path:`test-output/cancel-bubble-${width}.png`});
   await cancel.click();await page.waitForFunction(()=>plannerRecordings.main===null);assert.equal(await cancel.isVisible(),true,'Cancel reuses the plus instead of removing its target');await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main]').hasAttribute('data-action-moving'));assert.equal(await cancel.getAttribute('aria-label'),'Dodatkowe działania');await cancel.click();assert.equal(await cancel.getAttribute('aria-expanded'),'true','The returned plus opens the existing action menu');await cancel.click();assert.equal(await dock.locator('.commands').isVisible(),false,'Cancelling never brings back the old ribbon');
   await page.waitForFunction(()=>{const root=document.querySelector('.octi-dock[data-channel=main]');return root.dataset.mode==='idle'&&root.octiListening?.getState().rendering},null,{timeout:10000});
   assert.equal(await page.locator('.octi-dock:not([data-channel=main]) video[src]').count(),0,'Hidden contexts do not load or play duplicate clips');
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>{const v=document.querySelector('.octi-dock[data-channel=main] video');return v.paused&&!v.parentElement.classList.contains('is-rendered')});
   assert.ok(await dock.locator('.octi-listening-fallback').evaluate(img=>img.complete&&img.naturalWidth===384),'Reduced motion keeps the approved blue poster');
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main] video').paused);
   if(width===390){
    const quality=await video.evaluate(v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight,loop:v.loop}));
    assert.ok(Math.abs(quality.duration-4.8)<.1);assert.deepEqual({width:quality.width,height:quality.height},{width:768,height:384},'The current two-channel Okti atlas is decoded');assert.equal(quality.loop,true);
    for(const mode of ['opening','recording','sending','ready']){
     await page.evaluate(mode=>{plannerRecordings.main={mode,deadline:Date.now()+RECORDING_SECONDS*1000}},mode);
     await page.waitForFunction(mode=>document.querySelector('.octi-dock[data-channel=main]').dataset.mode===mode,mode);
     assert.equal(await dock.locator('.commands').isVisible(),false,'The obsolete recorder ribbon stays hidden in every recorder state');if(mode==='opening')assert.equal(await video.evaluate(v=>v.paused),false,'Opening the microphone keeps the idle motion alive');else if(mode==='recording')await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').octiListening.getState().rendering);else {const returnTime=await video.evaluate(v=>v.currentTime);await page.waitForTimeout(250);assert.ok(await video.evaluate(v=>!v.paused&&v.currentTime)>returnTime,'Idle motion continues beneath the return while waiting for the API');}
    }
    await page.evaluate(()=>{plannerRecordings.main=null});await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').dataset.mode==='idle');
    for(let switchIndex=0;switchIndex<3;switchIndex++){
     await page.evaluate(()=>{tasks=[{id:'logo-test',title:'Spotkanie',date:'2026-10-25',time:'12:00',endTime:'13:00'}];openEventActions(tasks[0]);});
     await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=event] video').paused);
     assert.equal(await video.evaluate(v=>v.paused),true,'Switching context pauses the main logo');
     await page.evaluate(()=>closeEventActions());await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main] video').paused);
    }
    await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    assert.equal(await video.evaluate(v=>v.paused),true,'Background pages pause the clip');
    await page.evaluate(()=>{delete document.hidden;document.dispatchEvent(new Event('visibilitychange'));});
   }
   await page.evaluate(()=>{const host=document.querySelector('.voice-area');host.dataset.qaBottom=host.style.bottom;host.style.bottom='0px'});
   const overlap=await dock.evaluate(root=>{const voice=root.querySelector('.voice'),b=voice.getBoundingClientRect(),nav=document.querySelector('.phone-bottom-bar'),n=nav.getBoundingClientRect(),x=b.x+b.width/2,y=Math.min(b.bottom-6,n.bottom-6),hit=document.elementFromPoint(x,y);return {overlaps:y>=n.top&&y>=b.top,hit:hit===voice||voice.contains(hit),recorderZ:Number(getComputedStyle(document.querySelector('.voice-area')).zIndex),navZ:Number(getComputedStyle(nav).zIndex)}});assert.equal(overlap.overlaps,true,'The test deliberately overlaps Okti with navigation');assert.equal(overlap.hit,true,'The floating bubble paints and receives touches above the bottom bar');assert.ok(overlap.recorderZ>overlap.navZ);await page.screenshot({path:`test-output/cancel-bubble-over-nav-${width}.png`});
   await page.evaluate(()=>{const host=document.querySelector('.voice-area');host.style.bottom=host.dataset.qaBottom;delete host.dataset.qaBottom});
   await page.evaluate(async()=>{clearVoiceDialogue('main');const api=plannerApiRequest,audio=plannerAudioPayload;plannerApiRequest=async()=>{throw Object.assign(new Error('Klucz OpenAI w Cloudflare wymaga sprawdzenia.'),{code:'openai_error'})};plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});const session=beginVoiceDialogue('main',null,null),state={session,mode:'ready',chunks:[new Blob(['audio'])]};plannerRecordings.main=state;$('toast').classList.remove('show');try{await sendPlannerRecording('main',state)}finally{plannerApiRequest=api;plannerAudioPayload=audio}});
   assert.equal(await page.locator('#voiceHint').textContent(),'Klucz OpenAI w Cloudflare wymaga sprawdzenia.');assert.equal(await page.locator('#toast').evaluate(el=>el.classList.contains('show')),false,'The API error appears once without a toast over navigation');
   await page.getByRole('button',{name:'Ustawienia',exact:true}).click();const settings=page.getByRole('dialog',{name:'Ustawienia i narzędzia',exact:true});assert.equal(await settings.isVisible(),true);assert.equal(await settings.evaluate(el=>el.matches(':modal')),true,'Settings are in the browser modal top layer');assert.match(await settings.locator('#appVersion').textContent(),/33\.196-test/);assert.equal(await settings.locator('#appVersion').isVisible(),true);await page.evaluate(()=>toast('Kontrola powiadomienia'));assert.equal(await settings.getByRole('button',{name:'Zamknij ustawienia',exact:true}).isVisible(),true);await page.screenshot({path:`test-output/cancel-bubble-settings-${width}.png`});await settings.getByRole('button',{name:'Zamknij ustawienia',exact:true}).click();assert.equal(await page.locator('.app').evaluate(el=>el.inert),false,'Closing settings restores the bottom navigation after the recording error');await page.getByRole('button',{name:'Ustawienia',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await settings.isVisible(),false);assert.equal(await page.locator('.app').evaluate(el=>el.inert),false,'Escape closes the native dialog without leaving the app inert');
   assert.deepEqual(errors,[]);await page.close();console.log(`Okti motion ${width}x${height}: actual playback, stable touch target, idle layout and reduced motion passed.`);
  }
  for(const failure of ['blocked-autoplay','hanging-autoplay','stalled-playback','missing-media']){
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(failure==='blocked-autoplay')await page.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('Autoplay denied','NotAllowedError'))}});
   if(failure==='hanging-autoplay')await page.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return new Promise(()=>{})}});
   if(failure==='stalled-playback')await page.addInitScript(()=>Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{configurable:true,get(){return 0},set(){}}));
   await routeFiles(page,failure==='missing-media'?'missing-media':false);await page.goto('https://planner.test/preview33/index.html');
   const dock=page.locator('.octi-dock[data-channel=main]'),layer=dock.locator('.octi-listening-media'),fallback=dock.locator('.octi-listening-fallback');
   await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main] .octi-listening-media')?.classList.contains('is-fallback'),null,{timeout:10000});
   assert.equal(await layer.evaluate(el=>el.classList.contains('is-rendered')),false);assert.ok(await fallback.evaluate(img=>img.complete&&img.naturalWidth>0));
   assert.equal(await page.locator('.octi-dock:not([data-channel=main]) .octi-listening-source[src]').count(),0,'Hidden contexts do not load duplicate clips');
   await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main] video').paused);
   assert.equal(await layer.evaluate(el=>el.classList.contains('is-fallback')),true,'Reduced motion keeps the approved static Okti artwork');
   await dock.locator('.menu-toggle').click();assert.equal(await dock.locator('.menu-toggle').getAttribute('aria-expanded'),'true','Media failure never blocks the action menu');
   assert.deepEqual(errors,[]);await page.close();console.log(`Okti motion ${failure}: static fallback and working controls passed.`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
