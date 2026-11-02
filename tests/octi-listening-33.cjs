const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');
async function fixture({reduced=false,blocked=false,hanging=false,noGL=false}={}){
 const dom=new JSDOM('<div id="root"><div id="floating"></div><video id="idle"></video></div>',{url:'https://planner.test',runScripts:'outside-only'}),w=dom.window;
 let clock=0,next=1,draws=0,mediaReady=!hanging;const callbacks=new Map();
 Object.defineProperty(w.performance,'now',{value:()=>clock});w.devicePixelRatio=1;
 w.requestAnimationFrame=fn=>{const id=next++;callbacks.set(id,fn);return id};w.cancelAnimationFrame=id=>callbacks.delete(id);
 w.Image=class{set src(v){this._src=v;queueMicrotask(()=>this.onload?.())}};
 Object.defineProperty(w.HTMLMediaElement.prototype,'readyState',{get(){return mediaReady?4:0}});
 Object.defineProperty(w.HTMLMediaElement.prototype,'paused',{get(){return this._paused!==false}});
 w.HTMLMediaElement.prototype.play=function(){if(blocked)return Promise.reject(new w.DOMException('Autoplay denied','NotAllowedError'));if(hanging)return new Promise(()=>{});this._paused=false;return Promise.resolve()};
 w.HTMLMediaElement.prototype.pause=function(){this._paused=true};
 const gl=new Proxy({getShaderPrecisionFormat:()=>({precision:23}),getShaderParameter:()=>true,getProgramParameter:()=>true,isContextLost:()=>false,getExtension:()=>null,drawArrays(){draws++}}, {get(target,key){if(key in target)return target[key];if(/^[A-Z_0-9]+$/.test(key))return 1;return ()=>({})}});
 w.HTMLCanvasElement.prototype.getContext=()=>noGL?null:gl;w.HTMLCanvasElement.prototype.getBoundingClientRect=()=>({width:128});
 vm.runInContext(fs.readFileSync('octi-listening.js','utf8'),dom.getInternalVMContext());
 const root=w.document.getElementById('root'),motion={matches:reduced},controller=w.createOctiListeningArtwork(root,w.document.getElementById('floating'),motion,w.document.getElementById('idle'));
 const update=(recording,visible=true)=>controller.update({visible,isRecording:recording});
 async function frames(ms,recording=true){for(let elapsed=0;elapsed<ms;elapsed+=40){clock+=40;for(const v of root.querySelectorAll('video'))if(!v.paused)v.currentTime=clock/1000%4.8;update(recording);const run=[...callbacks.values()];callbacks.clear();for(const fn of run)fn(clock);await Promise.resolve()}}
 async function settle(){for(let i=0;i<8;i++)await Promise.resolve()}
 return {dom,root,motion,controller,update,frames,settle,setMediaReady(value){mediaReady=value},advance(ms){clock+=ms},get draws(){return draws}};
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
  f.update(false);await f.frames(320,false);assert.ok(f.controller.getState().approach>0&&f.controller.getState().approach<1,'Stop returns through intermediate poses');f.advance(600);await f.frames(40,false);assert.ok(f.controller.getState().approach>0,'A delayed return frame must not skip straight to idle');await f.frames(400,false);assert.equal(f.controller.getState().approach,0);assert.equal(f.controller.getState().rendering,true,'The resting pose keeps drawing through the final dissolve');const layer=f.root.querySelector('.octi-listening-media');assert.ok(Number(layer.style.opacity)>0&&Number(layer.style.opacity)<1,'Return blends into the idle artwork instead of removing the canvas');assert.ok(layer.classList.contains('is-rendered'));await f.frames(320,false);assert.equal(f.controller.getState().rendering,false);assert.equal(layer.style.opacity,'');
  f.update(true);await f.frames(240);f.update(false);await f.frames(120,false);const before=f.controller.getState().approach;f.update(true);assert.equal(f.controller.getState().approach,before,'Rapid restart retains the visible pose');await f.frames(1700);assert.equal(f.controller.getState().approach,1);
  f.update(true,false);assert.equal(f.controller.getState().rendering,false);assert.ok([...f.root.querySelectorAll('video')].every(v=>v.paused),'Hidden context releases all playback');
 }finally{f.controller.destroy();f.dom.window.close()}
 for(const options of [{noGL:true},{blocked:true},{hanging:true},{reduced:true}]){
  const f=await fixture(options);try{f.update(true);await f.settle();await f.frames(3000);assert.equal(f.controller.getState().fallback,true,JSON.stringify(options));assert.ok(f.root.querySelector('.octi-listening-fallback').hasAttribute('src'));const src=f.root.querySelector('.octi-listening-fallback').src;assert.match(src,options.reduced?/poster/:/fallback/);f.update(false);assert.equal(f.root.querySelector('.octi-listening-media').classList.contains('is-active'),false);}finally{f.controller.destroy();f.dom.window.close()}
 }
 console.log('Okti listening state: event-driven hold, smooth stop, rapid restart, hidden context, reduced motion and media failures passed (graphics mocked).');
})().catch(error=>{console.error(error);process.exitCode=1});
