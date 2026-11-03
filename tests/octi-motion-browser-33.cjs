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
   const dock=page.locator('.octi-dock[data-channel=main]'),video=dock.locator('video.octi-motion-video');
   await page.waitForFunction(()=>{const v=document.querySelector('.octi-dock[data-channel=main] video');return v.readyState>=2&&!v.paused&&v.parentElement.classList.contains('is-playing')});
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
   for(const action of await dock.locator('.bubble-extra').all()){const box=await action.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=width&&box.y+box.height<=height,'Each menu action fits the viewport');assert.equal(await action.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true,'Each emerged bubble can be tapped');const offset=await action.evaluate(el=>{const b=el.getBoundingClientRect(),s=el.querySelector('svg').getBoundingClientRect();return Math.hypot(b.x+b.width/2-s.x-s.width/2,b.y+b.height/2-s.y-s.height/2)});assert.ok(offset<1,'Action symbols are centered in their bubbles');}
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
   await page.waitForFunction(()=>{const root=document.querySelector('.octi-dock[data-channel=main]');return root.dataset.mode==='idle'&&!root.octiListening?.getState().rendering},null,{timeout:10000});
   assert.equal(await page.locator('.octi-dock:not([data-channel=main]) video[src]').count(),0,'Hidden contexts do not load or play duplicate clips');
   await page.emulateMedia({reducedMotion:'reduce'});
   await page.waitForFunction(()=>{const v=document.querySelector('.octi-dock[data-channel=main] video');return v.paused&&!v.parentElement.classList.contains('is-playing')});
   assert.ok(await dock.locator('.octi-motion-poster').evaluate(img=>img.complete&&img.naturalWidth===544),'Reduced motion keeps the approved blue poster');
   await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main] video').paused);
   if(width===390){
    const quality=await video.evaluate(async v=>{
     const c=document.createElement('canvas');c.width=c.height=544;const ctx=c.getContext('2d',{willReadFrequently:true}),tops=[];
     async function frame(t){
      v.pause();
      // Seek into the middle of a frame, then wait for that exact decoded
      // frame to be presented. "seeked" alone can still expose the old frame.
      const index=Math.min(287,Math.floor(t*60+.0001)),target=(index+.5)/60;
      await new Promise((resolve,reject)=>{
       let callback;
       const timeout=setTimeout(()=>{v.cancelVideoFrameCallback(callback);reject(new Error('Decoded frame '+index+' was not presented'));},4000);
       function presented(_,metadata){
        if(Math.round(metadata.mediaTime*60)===index){clearTimeout(timeout);resolve();}
        else callback=v.requestVideoFrameCallback(presented);
       }
       callback=v.requestVideoFrameCallback(presented);v.currentTime=target;
      });
      ctx.drawImage(v,0,0,544,544);return ctx.getImageData(0,0,544,544).data;
     }
     for(const t of [0,.72,1.6,2.4,3.2,4.1]){const pixels=await frame(t);let top=200;for(let y=110;y<200;y++){let blue=0;for(let x=250;x<290;x++){const i=(y*544+x)*4;if(pixels[i]<110&&pixels[i+1]>60&&pixels[i+2]>140&&pixels[i+2]-pixels[i+1]>17)blue++;}if(blue>15){top=y;break;}}tops.push(top);}
     const pixels=await frame(1.8),eyes=[];
     for(const [left,right] of [[230,269],[275,314]]){let minX=544,maxX=0,minY=544,maxY=0;for(let y=207;y<245;y++)for(let x=left;x<right;x++){const i=(y*544+x)*4;if(pixels[i]>225&&pixels[i+1]>230&&pixels[i+2]>235){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}}eyes.push({width:maxX-minX+1,height:maxY-minY+1});}
     const a=await frame(.8),b=await frame(4.0);let difference=0,pixelCount=0;for(let y=304;y<405;y++)for(let x=130;x<410;x++){const i=(y*544+x)*4;if((a[i+2]-a[i]>100&&a[i+1]>70)||(b[i+2]-b[i]>100&&b[i+1]>70)){for(let k=0;k<3;k++)difference+=Math.abs(a[i+k]-b[i+k]);pixelCount+=3;}}
     const edge=[];for(const t of [v.duration-3/60,v.duration-2/60,v.duration-1/60,0,1/60,2/60])edge.push(await frame(t));
     const delta=(a,b,c)=>{let sum=0,count=0;for(let y=280;y<435;y++)for(let x=120;x<424;x++){const i=(y*544+x)*4;for(let k=0;k<3;k++){sum+=Math.abs(c?(b[i+k]-a[i+k])-(c[i+k]-b[i+k]):a[i+k]-b[i+k]);count++;}}return sum/count;};
     const loop={seam:delta(edge[2],edge[3]),neighbors:[delta(edge[0],edge[1]),delta(edge[1],edge[2]),delta(edge[3],edge[4]),delta(edge[4],edge[5])],velocity:delta(edge[2],edge[3],edge[4]),neighborVelocities:[delta(edge[0],edge[1],edge[2]),delta(edge[3],edge[4],edge[5])]};
     // Decode the whole transition too: clean end frames alone cannot reveal
     // an arm snapping or disappearing in the middle of a contour morph.
     const sequence={ordinaryDeltas:[],overlapDeltas:[],ordinaryAccelerations:[],overlapAccelerations:[]};
     let previous=await frame(0),older=null;
     for(let i=1;i<288;i++){
      const current=await frame((i+.1)/60),overlap=i>=216;
      sequence[overlap?'overlapDeltas':'ordinaryDeltas'].push(delta(previous,current));
      if(older)sequence[overlap?'overlapAccelerations':'ordinaryAccelerations'].push(delta(older,previous,current));
      older=previous;previous=current;
     }
     const motion={minimumDelta:Math.min(...sequence.ordinaryDeltas,...sequence.overlapDeltas),ordinaryMaxDelta:Math.max(...sequence.ordinaryDeltas),overlapMaxDelta:Math.max(...sequence.overlapDeltas),ordinaryMaxAcceleration:Math.max(...sequence.ordinaryAccelerations),overlapMaxAcceleration:Math.max(...sequence.overlapAccelerations)};
     return {duration:v.duration,tops,eyes,armDifference:difference/pixelCount,loop,motion};
    });
    assert.ok(Math.abs(quality.duration-4.8)<.1);assert.ok(Math.max(...quality.tops)-Math.min(...quality.tops)<17,'The head stays calm instead of dipping at the end');
    for(const eye of quality.eyes){assert.ok(eye.width>20);assert.ok(eye.height/eye.width<.48,'The approved eyes are shallow tapered crescents, not semicircles');}
    assert.ok(quality.armDifference>2,'Opposite loop phases must differ; the second half must not replay the first half backwards');
    assert.ok(quality.loop.seam>.01,'The loop continues moving across its boundary');
    assert.ok(quality.loop.seam<Math.max(...quality.loop.neighbors)*1.8+.3,'The decoded loop boundary is no larger than an ordinary neighboring movement: '+JSON.stringify(quality.loop));
    assert.ok(quality.loop.velocity<Math.max(...quality.loop.neighborVelocities)*2+.4,'The decoded motion must not jerk at the boundary: '+JSON.stringify(quality.loop));
    assert.ok(quality.motion.minimumDelta>.01,'Every decoded phase must continue moving, including the middle of the overlap');
    assert.ok(quality.motion.overlapMaxDelta<quality.motion.ordinaryMaxDelta*1.5+.5,'The entire overlap must move as smoothly as the reference wave: '+JSON.stringify(quality.motion));
    assert.ok(quality.motion.overlapMaxAcceleration<quality.motion.ordinaryMaxAcceleration*1.8+.5,'The middle of the overlap must not snap between arm matches: '+JSON.stringify(quality.motion));
    console.log('Decoded logo geometry',JSON.stringify(quality));
    await video.evaluate(async v=>{await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=v.duration-.15});await v.play();});
    await page.waitForFunction(()=>{const v=document.querySelector('.octi-dock[data-channel=main] video');return !v.paused&&v.currentTime<.6;},null,{timeout:6000});
    assert.equal(await video.evaluate(v=>v.loop),true,'Actual playback wraps automatically without rewinding the movie');
    for(const mode of ['opening','recording','sending','ready']){
     await page.evaluate(mode=>{plannerRecordings.main={mode,deadline:Date.now()+RECORDING_SECONDS*1000}},mode);
     await page.waitForFunction(mode=>document.querySelector('.octi-dock[data-channel=main]').dataset.mode===mode,mode);
     assert.equal(await dock.locator('.commands').isVisible(),false,'The obsolete recorder ribbon stays hidden in every recorder state');if(mode==='opening')assert.equal(await video.evaluate(v=>v.paused),false,'Opening the microphone keeps the idle motion alive');else if(mode==='recording')await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').octiListening.getState().rendering);else {const returnTime=await video.evaluate(v=>v.currentTime);await page.waitForTimeout(250);assert.ok(await video.evaluate(v=>!v.paused&&v.currentTime)>returnTime,'Idle motion continues beneath the return while waiting for the API');}
    }
    await page.evaluate(()=>{plannerRecordings.main=null});await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main]').dataset.mode==='idle');
    // Repeat with an already loaded event clip, when playback starts fastest.
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
   await page.getByRole('button',{name:'Ustawienia',exact:true}).click();const settings=page.getByRole('dialog',{name:'Ustawienia i narzędzia',exact:true});assert.equal(await settings.isVisible(),true);assert.equal(await settings.evaluate(el=>el.matches(':modal')),true,'Settings are in the browser modal top layer');assert.match(await settings.locator('#appVersion').textContent(),/33\.175-test/);assert.equal(await settings.locator('#appVersion').isVisible(),true);await page.evaluate(()=>toast('Kontrola powiadomienia'));assert.equal(await settings.getByRole('button',{name:'Zamknij ustawienia',exact:true}).isVisible(),true);await page.screenshot({path:`test-output/cancel-bubble-settings-${width}.png`});await settings.getByRole('button',{name:'Zamknij ustawienia',exact:true}).click();assert.equal(await page.locator('.app').evaluate(el=>el.inert),false,'Closing settings restores the bottom navigation after the recording error');await page.getByRole('button',{name:'Ustawienia',exact:true}).click();await page.keyboard.press('Escape');assert.equal(await settings.isVisible(),false);assert.equal(await page.locator('.app').evaluate(el=>el.inert),false,'Escape closes the native dialog without leaving the app inert');
   assert.deepEqual(errors,[]);await page.close();console.log(`Okti motion ${width}x${height}: actual playback, stable touch target, idle layout and reduced motion passed.`);
  }
  for(const failure of ['blocked-autoplay','hanging-autoplay','stalled-playback','unsupported-video','missing-media','all-media-fail']){
   const page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   if(failure==='blocked-autoplay')await page.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('Autoplay denied','NotAllowedError'))}});
   if(failure==='hanging-autoplay')await page.addInitScript(()=>{HTMLMediaElement.prototype.play=function(){return new Promise(()=>{})}});
   if(failure==='stalled-playback')await page.addInitScript(()=>Object.defineProperty(HTMLMediaElement.prototype,'currentTime',{configurable:true,get(){return 0},set(){}}));
   if(failure==='unsupported-video')await page.addInitScript(()=>{HTMLMediaElement.prototype.canPlayType=function(){return ''}});
   await routeFiles(page,failure==='missing-media'||failure==='all-media-fail'?failure:false);await page.goto('https://planner.test/preview33/index.html');
   const dock=page.locator('.octi-dock[data-channel=main]'),layer=dock.locator('.octi-motion-media'),fallback=dock.locator('.octi-motion-fallback');
   if(failure==='all-media-fail'){
    await page.waitForTimeout(600);assert.equal(await layer.getAttribute('class'),'octi-motion-media');assert.ok(await dock.locator('.octi-motion-poster').evaluate(img=>img.complete&&img.naturalWidth>0));
   }else{
    await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main] .octi-motion-media').classList.contains('is-fallback'));
    assert.equal(await dock.locator('.octi-motion-media.is-playing').count(),0);assert.equal(await fallback.evaluate(img=>img.naturalWidth),320);
    assert.equal(await page.locator('.octi-dock:not([data-channel=main]) .octi-motion-fallback[src]').count(),0,'Hidden contexts do not load animated images');
    const before=await layer.screenshot({animations:'disabled'});await page.waitForTimeout(1200);const after=await layer.screenshot({animations:'disabled'});
    const changed=await page.evaluate(async frames=>{
     async function pixels(base64){const image=new Image();image.src='data:image/png;base64,'+base64;await image.decode();const c=document.createElement('canvas');c.width=image.width;c.height=image.height;const ctx=c.getContext('2d');ctx.drawImage(image,0,0);return {data:ctx.getImageData(0,0,c.width,c.height).data,width:c.width,height:c.height};}
     const [a,b]=await Promise.all(frames.map(pixels));let changed=0;
     // Actual displayed pixels below the head, at the real 128px logo size.
     for(let y=Math.floor(a.height*.53);y<a.height*.8;y++)for(let x=Math.floor(a.width*.22);x<a.width*.78;x++){
      const i=(y*a.width+x)*4,blue=(p)=>p[i+2]-p[i]>80&&p[i+1]>65;
      if((blue(a.data)||blue(b.data))&&Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2])>25)changed++;
     }
     return changed;
    },[before.toString('base64'),after.toString('base64')]);
    assert.ok(changed>=20,'Tentacles visibly move even when video playback fails: '+changed);console.log(`Okti ${failure}: ${changed} changing tentacle pixels at actual display size.`);
    await page.emulateMedia({reducedMotion:'reduce'});await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main] .octi-motion-fallback').hasAttribute('src'));
    assert.equal(await dock.locator('.is-fallback').count(),0,'Reduced motion releases the animated fallback');
    await page.emulateMedia({reducedMotion:'no-preference'});await page.waitForFunction(()=>document.querySelector('.octi-dock[data-channel=main] .octi-motion-media').classList.contains('is-fallback'));
    await page.evaluate(()=>{plannerRecordings.main={mode:'recording',deadline:Date.now()+RECORDING_SECONDS*1000}});await page.waitForFunction(()=>!document.querySelector('.octi-dock[data-channel=main] .octi-motion-fallback').hasAttribute('src'));
    assert.equal(await dock.locator('.commands').isVisible(),false,'Recording ribbon stays absent with fallback artwork');await page.evaluate(()=>{plannerRecordings.main=null});
   }
   await dock.locator('.menu-toggle').click();assert.equal(await dock.locator('.menu-toggle').getAttribute('aria-expanded'),'true','Media failure never blocks the action menu');
   assert.deepEqual(errors,[]);await page.close();console.log(`Okti motion ${failure}: correct motion fallback and working controls passed.`);
  }
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
