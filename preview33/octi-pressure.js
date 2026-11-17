/* One static blue material and one native transform; no video or hover control. */
(()=>{
'use strict';
const TEXTURE='octi-glass-33-184.png?v=ffa5688726705d31',SIZE=384,CONTACT=120,RETURN=240;
const ease=v=>1-Math.pow(1-Math.max(0,Math.min(1,v)),3);
const recover=v=>1-Math.pow(1-Math.max(0,Math.min(1,v)),2);
const EASING='cubic-bezier(.333333,1,.666667,1)',RECOVER='cubic-bezier(.333333,.666667,.666667,1)';
let texturePromise=null;
function loadTexture(){
 if(!texturePromise)texturePromise=new Promise(resolve=>{
  const image=new Image();image.decoding='async';
  image.onload=()=>{
   try{const staging=document.createElement('canvas');staging.width=staging.height=SIZE;const ctx=staging.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0,SIZE,SIZE);resolve(ctx.getImageData(0,0,SIZE,SIZE));
   }catch{texturePromise=null;resolve(null)}
  };
  image.onerror=()=>{texturePromise=null;resolve(null)};image.src=TEXTURE;
 });
 return texturePromise;
}

window.createOctiPressureArtwork=function(root,floating,motion){
 const button=root.querySelector('.voice'),glass=root.querySelector('.octi-motion-media');
 if(!button||!glass)return {reset(){}};
 const canvas=document.createElement('canvas');canvas.className='octi-pressure-canvas';canvas.width=canvas.height=SIZE;canvas.setAttribute('aria-hidden','true');
 const ctx=canvas.getContext('2d',{willReadFrequently:true});let texture=null,pendingTexture=null,drawCount=0,lastDrawMs=0;
 for(const name of ['octi-pressure-shadow','octi-pressure-caustic']){const node=document.createElement('span');node.className=name;node.setAttribute('aria-hidden','true');floating.append(node)}
 floating.classList.add('has-composited-pressure');
 let active=null,curve=null,primary=null,phase='idle',settled=0;
 const initialTransform=glass.style.transform;
 function sample(time){
  if(!curve)return settled;
  if(curve.peakTime&&time<curve.peakTime)return curve.from+(curve.peak-curve.from)*ease(time/curve.peakTime);
  const from=curve.peakTime?curve.peak:curve.from,start=curve.peakTime||0;
  return from+(curve.to-from)*(curve.to===0?recover:ease)((time-start)/(curve.duration-start));
 }
 function value(){return primary?sample(Number(primary.currentTime)||0):settled}
 function style(p){return {transform:`translate(-50%,-50%) scale(${1+.16*p},${1+.10*p})`}}
 function install(){
  if(!pendingTexture||!ctx||phase!=='idle')return;
  const start=performance.now();ctx.putImageData(pendingTexture,0,0);texture=pendingTexture;pendingTexture=null;drawCount++;lastDrawMs=performance.now()-start;
  glass.prepend(canvas);glass.classList.add('is-pressure-ready');
 }
 function clear(){if(primary){primary.onfinish=null;primary.cancel()}primary=null;curve=null;glass.style.transform=initialTransform;}
 function reset(){active=null;clear();settled=0;phase='idle';delete floating.dataset.pressState;install()}
 function start(next,nextPhase){
  const previous=primary;primary=null;curve=next;phase=nextPhase;floating.dataset.pressState=nextPhase;
  if(motion?.matches||typeof glass.animate!=='function'){
   if(previous){previous.onfinish=null;previous.cancel()}settled=next.to;curve=null;
   glass.style.transform=style(settled*(motion?.matches ? .14 : 1)).transform;return;
  }
  // Only two (or three for a before-first-frame tap) native transform frames.
  // The actor, its video, inherited drift and transmitted shadow keep running.
  const frames=[{...style(next.from),offset:0,easing:next.peakTime||next.to?EASING:RECOVER}];
  if(next.peakTime)frames.push({...style(next.peak),offset:next.peakTime/next.duration,easing:RECOVER});
  frames.push({...style(next.to),offset:1});
  const run=glass.animate(frames,{duration:next.duration,easing:'linear',fill:'forwards'});run.id='okti-pressure-compositor';
  if(document.timeline.currentTime!==null)run.startTime=document.timeline.currentTime;
  primary=run;
  if(previous){previous.onfinish=null;previous.cancel()}
  run.onfinish=()=>{if(primary!==run)return;settled=next.to;if(!active)reset()};
 }
 function begin(input){
  if(button.disabled||active)return;
  const from=value();active={...input,bounds:glass.getBoundingClientRect()};start({from,to:1,duration:CONTACT},'held');
  if(!texture&&!pendingTexture)prepare();
 }
 function release(){
  if(!active)return;
  const from=value(),elapsed=Number(primary?.currentTime)||0;active=null;
  if(motion?.matches||typeof glass.animate!=='function'){reset();return}
  // A tap released before the first display frame still paints a short, smooth
  // impulse. All other releases reverse immediately from the current size.
  start({from,to:0,duration:RETURN,...(elapsed<16&&from<.1?{peak:.7,peakTime:40}:{})},'release');
 }
 function prepare(){loadTexture().then(asset=>{if(asset&&!texture){pendingTexture=asset;install()}})}
 button.draggable=false;
 button.addEventListener('contextmenu',event=>event.preventDefault());button.addEventListener('selectstart',event=>event.preventDefault());
 button.addEventListener('pointerdown',event=>{if(event.isPrimary===false||event.pointerType==='mouse'&&event.button!==0)return;begin({pointerId:event.pointerId})},{passive:true});
 window.addEventListener('pointermove',event=>{if(active?.pointerId===undefined||active.pointerId!==event.pointerId)return;const r=active.bounds;if(event.clientX<r.left-8||event.clientX>r.right+8||event.clientY<r.top-8||event.clientY>r.bottom+8)reset()},{passive:true});
 window.addEventListener('pointerup',event=>{if(active?.pointerId===event.pointerId)release()},{capture:true,passive:true});
 window.addEventListener('pointercancel',event=>{if(active?.pointerId===event.pointerId)reset()},{capture:true,passive:true});
 button.addEventListener('keydown',event=>{if(!event.repeat&&[' ','Enter'].includes(event.key))begin({key:event.key})});
 window.addEventListener('keyup',event=>{if(active?.key===event.key)release()},true);
 button.addEventListener('blur',()=>{if(button.disabled&&!active&&phase==='release')return;reset()});window.addEventListener('blur',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});motion?.addEventListener?.('change',reset);
 const controls={reset,getPaintState:()=>({pressure:value(),count:drawCount,ms:lastDrawMs,engine:'compositor'}),getState:()=>({pressure:value(),effective:motion?.matches?value()*.14:value(),ready:!!texture,rendering:!!texture,buffer:SIZE,source:TEXTURE,holding:!!active,phase,engine:'compositor',paintCount:drawCount})};
 root.octiPressure=controls;prepare();return controls;
};
})();
