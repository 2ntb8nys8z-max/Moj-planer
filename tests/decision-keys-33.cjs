const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),{JSDOM}=require('jsdom');
(async()=>{
 const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=code=>vm.runInContext(code,dom.getInternalVMContext());
 let reduced=false;const animations=[];
 Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:query=>({matches:query.includes('prefers-reduced-motion')?reduced:true}),confirm:()=>true,alert(){},fetch:async()=>Response.json({})});
 w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
 w.HTMLElement.prototype.animate=function(frames,options){let resolve,reject;const finished=new Promise((ok,no)=>{resolve=ok;reject=no}),entry={node:this,frames,options,resolve};animations.push(entry);return {finished,cancel(){reject(new w.DOMException('Cancelled','AbortError'))}}};
 for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
 const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 function show(){run("testLive=true;testClicks=0;OktiCommunication.showActions('main','Dodać miejsce?',[{label:'Tak',primary:true,run:()=>testClicks++},{label:'Nie',run:()=>testClicks--}],()=>testLive)");const button=w.document.querySelector('#oktiDecision .okti-decision-option');button.getBoundingClientRect=()=>({left:10,right:170,top:10,bottom:90});return button;}
 function pointer(button,type,extra={}){const event=new w.Event(type,{bubbles:true,cancelable:true});Object.assign(event,{pointerId:1,pointerType:'touch',isPrimary:true,button:0,clientX:50,clientY:40,...extra});button.dispatchEvent(event);}
 try{
  let button=show();const before=animations.length;pointer(button,'pointerdown');assert(button.classList.contains('is-key-pressed'));await wait(180);pointer(button,'pointerup');
  button.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));await wait(10);assert.equal(run('testClicks'),0,'Pointer click waits for the rebound');
  const rebound=animations.slice(before).find(entry=>entry.node===button);assert.ok(rebound);assert.equal(rebound.options.duration,280);assert.equal(rebound.frames[1].transform,'translateY(-2px)');rebound.resolve();await wait(100);assert.equal(run('testClicks'),1,'One press invokes exactly one original action');assert.equal(w.document.getElementById('oktiDecision').hidden,true);
  for(const cancel of ['drag','pointercancel','outside','scroll']){
   button=show();pointer(button,'pointerdown');
   if(cancel==='drag')pointer(button,'pointermove',{clientX:80});else if(cancel==='outside')pointer(button,'pointerup',{clientX:200});else if(cancel==='scroll')w.document.dispatchEvent(new w.Event('scroll'));else pointer(button,'pointercancel');
   pointer(button,'pointerup');button.dispatchEvent(new w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1}));await wait(180);
   assert.equal(run('testClicks'),0,cancel+' must not activate');assert.equal(button.classList.contains('is-key-pressed'),false);
  }
  button=show();pointer(button,'pointerdown');await wait(180);pointer(button,'pointerup');await wait(5);const old=animations.at(-1);show();old.resolve();await wait(100);assert.equal(run('testClicks'),0,'Replacing a decision cancels its pending action');
  button=show();button.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert(button.classList.contains('is-key-pressed'));await wait(180);button.dispatchEvent(new w.KeyboardEvent('keyup',{key:'Enter',bubbles:true,cancelable:true}));await wait(5);animations.at(-1).resolve();await wait(100);assert.equal(run('testClicks'),1,'Keyboard uses the same release sequence');
  reduced=true;button=show();const count=animations.length;pointer(button,'pointerdown');pointer(button,'pointerup');await wait(10);assert.equal(run('testClicks'),1);assert.equal(animations.length,count,'Reduced motion skips the rebound');
  button=show();run('testLive=false');pointer(button,'pointerdown');pointer(button,'pointerup');await wait(10);assert.equal(run('testClicks'),0,'Stale decisions remain inert');
  button=show();button.disabled=true;pointer(button,'pointerdown');pointer(button,'pointerup');await wait(10);assert.equal(run('testClicks'),0);assert(!button.classList.contains('is-key-pressed'));
  console.log('Decision glass keys: held press, 280ms rebound before one action, pointer/drag/outside/scroll cancellation, replacement, keyboard, reduced motion, stale and disabled choices passed (WAAPI mocked).');
 }finally{dom.window.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
