const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
async function fixture({reduced=false,blocked=false,hanging=false,noGL=false,canvas2d=false,imagesFail=false}={}){
 const dom=new JSDOM('<div id="root"><div id="floating"></div><video id="idle"></video></div>',{url:'https://planner.test',runScripts:'outside-only'}),w=dom.window;
 let clock=0,next=1,draws=0,softwareDraws=0,imageLoads=0,mediaReady=!hanging,denyPlay=blocked,failImages=imagesFail;const callbacks=new Map();
 Object.defineProperty(w.performance,'now',{value:()=>clock});w.devicePixelRatio=1;
 w.requestAnimationFrame=fn=>{const id=next++;callbacks.set(id,fn);return id};w.cancelAnimationFrame=id=>callbacks.delete(id);
 w.Image=class{constructor(){this.width=this.naturalWidth=1088;this.height=this.naturalHeight=544;}set src(v){this._src=v;imageLoads++;queueMicrotask(()=>failImages?this.onerror?.():this.onload?.())}};
 Object.defineProperty(w.HTMLMediaElement.prototype,'readyState',{get(){return mediaReady?4:0}});
 Object.defineProperty(w.HTMLMediaElement.prototype,'paused',{get(){return this._paused!==false}});
 w.HTMLMediaElement.prototype.play=function(){if(denyPlay)return Promise.reject(new w.DOMException('Autoplay denied','NotAllowedError'));if(hanging)return new Promise(()=>{});this._paused=false;return Promise.resolve()};
 w.HTMLMediaElement.prototype.pause=function(){this._paused=true};
 const gl=new Proxy({getShaderPrecisionFormat:()=>({precision:23}),getShaderParameter:()=>true,getProgramParameter:()=>true,isContextLost:()=>false,getExtension:()=>null,drawArrays(){draws++}}, {get(target,key){if(key in target)return target[key];if(/^[A-Z_0-9]+$/.test(key))return 1;return ()=>({})}});
 const context2d=new Proxy({createImageData:(width,height)=>({data:new Uint8ClampedArray(width*height*4)}),getImageData:(x,y,width,height)=>({data:new Uint8ClampedArray(width*height*4).fill(255)}),drawImage(){softwareDraws++},putImageData(){softwareDraws++}}, {get:(target,key)=>key in target?target[key]:()=>{}});
 w.HTMLCanvasElement.prototype.getContext=type=>type==='2d'?(canvas2d?context2d:null):(noGL?null:gl);w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:128});
 vm.runInContext(fs.readFileSync('octi-listening.js','utf8'),dom.getInternalVMContext());
 const root=w.document.getElementById('root'),motion={matches:reduced},controller=w.createOctiListeningArtwork(root,w.document.getElementById('floating'),motion,w.document.getElementById('idle'));
 const update=(recording,visible=true)=>controller.update({visible,isRecording:recording});
 async function frames(ms,recording=true){for(let elapsed=0;elapsed<ms;elapsed+=40){clock+=40;for(const v of root.querySelectorAll('video'))if(!v.paused)v.currentTime=clock/1000%4.8;update(recording);const run=[...callbacks.values()];callbacks.clear();for(const fn of run)fn(clock);await Promise.resolve()}}
 async function settle(){for(let i=0;i<20;i++)await Promise.resolve()}
 return {dom,root,motion,controller,update,frames,settle,setMediaReady(value){mediaReady=value},setImagesFail(value){failImages=value},setBlocked(value){denyPlay=value},advance(ms){clock+=ms},get draws(){return draws},get softwareDraws(){return softwareDraws},get imageLoads(){return imageLoads}};
}
(async()=>{
 const delayed=await fixture();try{
  delayed.setMediaReady(false);delayed.update(true);await delayed.settle();await delayed.frames(1200);
  assert.equal(delayed.controller.getState().approach,0,'Loading media does not skip the start of the approach');
  delayed.setMediaReady(true);await delayed.frames(40);assert.equal(delayed.controller.getState().approach,0,'The first visible frame starts at the idle pose');
  await delayed.frames(120);assert.ok(delayed.controller.getState().approach>0&&delayed.controller.getState().approach<.15,'The approach accelerates gently');
  await delayed.frames(1600);assert.equal(delayed.controller.getState().approach,1);
 }finally{delayed.controller.destroy();delayed.dom.window.close()}
 const f=await fixture();try{
  f.update(true);await f.settle();await f.frames(1700);assert.equal(f.controller.getState().rendering,true);assert.equal(f.controller.getState().approach,1);assert.equal(f.controller.getState().gesture,1);assert.ok(f.draws>10);
  await f.frames(10500);assert.equal(f.controller.getState().approach,1,'Held listening must not cycle back to idle after the preview duration');assert.equal(f.controller.getState().rendering,true);
  f.update(false);await f.frames(320,false);assert.ok(f.controller.getState().approach>0&&f.controller.getState().approach<1,'Stop returns through intermediate poses');f.advance(600);await f.frames(40,false);assert.ok(f.controller.getState().approach>0,'A delayed return frame must not skip straight to idle');await f.frames(400,false);assert.equal(f.controller.getState().approach,0);assert.equal(f.controller.getState().rendering,true,'The resting pose keeps drawing through the final dissolve');const layer=f.root.querySelector('.octi-listening-media');assert.ok(layer.classList.contains('is-rendered'));await f.frames(320,false);assert.equal(f.controller.getState().rendering,true,'One transparent renderer continues at idle without a second mascot');assert.equal(layer.style.opacity,'');
  f.update(true);await f.frames(240);f.update(false);await f.frames(120,false);const before=f.controller.getState().approach;f.update(true);assert.equal(f.controller.getState().approach,before,'Rapid restart retains the visible pose');await f.frames(1700);assert.equal(f.controller.getState().approach,1);
  f.update(true,false);assert.equal(f.controller.getState().rendering,false);assert.ok([...f.root.querySelectorAll('video')].every(v=>v.paused),'Hidden context releases all playback');
 }finally{f.controller.destroy();f.dom.window.close()}
 for(const options of [{noGL:true},{blocked:true},{hanging:true},{reduced:true}]){
  const f=await fixture(options);try{f.update(true);await f.settle();await f.frames(6000);assert.equal(f.controller.getState().fallback,true,JSON.stringify(options));assert.ok(f.root.querySelector('.octi-listening-fallback').hasAttribute('src'));const src=f.root.querySelector('.octi-listening-fallback').src;assert.match(src,options.reduced?/poster/:/actor-idle/);assert.doesNotMatch(f.root.querySelector('.octi-listening-fallback').style.transform,/scale/,'The whole actor is never enlarged after a failure');f.update(false);assert.equal(f.root.querySelector('.octi-listening-media').classList.contains('is-active'),true,'Idle retains one transparent actor');f.update(false,false);assert.equal(f.root.querySelector('.octi-listening-media').classList.contains('is-active'),false);}finally{f.controller.destroy();f.dom.window.close()}
 }
 for(const options of [{noGL:true},{blocked:true},{hanging:true}]){
  const f=await fixture({...options,canvas2d:true});try{
   f.update(true);await f.settle();await f.frames(8000);assert.equal(f.controller.getState().renderer,'canvas2d',JSON.stringify(options));assert.equal(f.controller.getState().rendering,true);assert.equal(f.controller.getState().fallback,false);assert.equal(f.controller.getState().approach,1);assert.ok(f.softwareDraws>10,'The approved coupled pose keeps rendering without WebGL or decoded video');assert.ok(f.controller.getState().lastError,'The original failure remains available for diagnosis');
   f.update(false);await f.frames(1100,false);assert.equal(f.controller.getState().approach,0);await f.frames(7000,false);assert.equal(f.controller.getState().rendering,true,'A settled preparation promise cannot become a spurious loading timeout');
  }finally{f.controller.destroy();f.dom.window.close()}
 }
 const network=await fixture({imagesFail:true});try{
  network.update(true);await network.settle();await network.frames(20000);assert.equal(network.controller.getState().fallback,true);assert.ok(network.imageLoads<=8,'Automatic retries are bounded');network.setImagesFail(false);network.root.dispatchEvent(new network.dom.window.Event('pointerdown'));await network.settle();await network.frames(2000);assert.equal(network.controller.getState().rendering,true,'A user gesture retries after a transient image failure');assert.equal(network.controller.getState().renderer,'webgl');assert.equal(network.controller.getState().reason,'');assert.equal(network.controller.getState().lastError.stage,'artwork-init');
 }finally{network.controller.destroy();network.dom.window.close()}
 const recovered=await fixture({imagesFail:true});try{
  recovered.update(true);await recovered.settle();recovered.setImagesFail(false);await recovered.frames(2500);assert.equal(recovered.controller.getState().rendering,true,'A transient request is retried without reloading the app');
 }finally{recovered.controller.destroy();recovered.dom.window.close()}
 const lost=await fixture({canvas2d:true});try{
  lost.update(true);await lost.settle();await lost.frames(1800);lost.root.querySelector('canvas').dispatchEvent(new lost.dom.window.Event('webglcontextlost',{cancelable:true}));await lost.settle();await lost.frames(2000);assert.equal(lost.controller.getState().renderer,'canvas2d');assert.equal(lost.controller.getState().rendering,true);assert.equal(lost.controller.getState().lastError.stage,'context-lost');assert.equal(lost.root.querySelectorAll('.octi-listening-canvas').length,1);
  lost.update(false,false);lost.update(true);await lost.settle();await lost.frames(2000);assert.equal(lost.controller.getState().rendering,true,'Returning to the app does not remain in the failed state');
 }finally{lost.controller.destroy();lost.dom.window.close()}
 const late=await fixture();try{
  let rejectOld,calls=0;late.dom.window.HTMLMediaElement.prototype.play=function(){this._paused=false;return ++calls===1?new Promise((resolve,reject)=>rejectOld=reject):Promise.resolve()};
  late.update(true);await late.settle();await late.frames(120);late.update(false,false);late.update(true);await late.settle();rejectOld(new late.dom.window.DOMException('Old playback request','NotAllowedError'));await late.settle();await late.frames(2000);assert.equal(late.controller.getState().renderer,'webgl');assert.equal(late.controller.getState().rendering,true);assert.equal(late.controller.getState().lastError,null,'An obsolete playback rejection cannot break the resumed animation');
 }finally{late.controller.destroy();late.dom.window.close()}
 console.log('Okti listening state: event-driven hold, smooth stop, rapid restart, hidden context, reduced motion and media failures passed (graphics mocked).');
})().catch(error=>{console.error(error);process.exitCode=1});

