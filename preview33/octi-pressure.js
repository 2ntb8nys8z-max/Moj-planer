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
 const lens=document.createElement('span');lens.className='octi-contact-lens';lens.setAttribute('aria-hidden','true');glass.append(lens);
 let details=[],poses=null,actorHeight=128;
 const rest={head:0,arms:0,light:0,rim:0};
 const pose=(offset,head,arms,light,rim=0)=>({offset,head,arms,light,rim});
 function currentPose(){
  if(!poses)return rest;
  const t=Math.min(1,Math.max(0,(Number(details[0]?.currentTime)||0)/poses.duration));
  const keys=poses.keys;
  for(let i=1;i<keys.length;i++)if(t<=keys[i].offset){
   const a=keys[i-1],b=keys[i],f=(t-a.offset)/(b.offset-a.offset);
   return pose(0,a.head+(b.head-a.head)*f,a.arms+(b.arms-a.arms)*f,a.light+(b.light-a.light)*f,a.rim+(b.rim-a.rim)*f);
  }
  return keys[keys.length-1];
 }
 // Project one continuously rendered image. The head and tentacles have
 // independent horizontal scales at two heights, with no seam between them.
 function actorPose({head,arms}){
  const top=1-.09*head,bottom=1+.095*arms,anchor=actorHeight*.13;
  const k=(top-bottom)/((top+bottom)*anchor),x=2*top*bottom/(top+bottom);
  const yTop=(-anchor+actorHeight*.02*head)*(1-k*anchor);
  const yBottom=(anchor+actorHeight*.016*arms)*(1+k*anchor);
  return {transform:`matrix3d(${x},0,0,0,0,${(yBottom-yTop)/(2*anchor)},0,${k},0,0,1,0,0,${(yBottom+yTop)/2},0,1)`};
 }
 function clearDetails(){for(const run of details)run.cancel();details=[];poses=null}
 function startDetails(next,held){
  const actor=floating.querySelector('.octi-touch-actor');
  if(!actor||motion?.matches||typeof actor.animate!=='function')return;
  const first={...currentPose(),offset:0};
  const keys=held?[first,pose(.27,.58,.08,.66),pose(.65,.96,.69,1),pose(1,1,1,1)]:
   [first,...(next.peakTime?[pose(.14,.96,.32,.98),pose(.29,.60,.9,.52)]:[]),
    pose(.46,-.22,.38,.09,-.032),pose(.62,-.30,-.55,0,-.017),pose(.80,.12,.23,0,.017),pose(.91,-.035,-.08,0,-.004),pose(1,0,0,0)];
  clearDetails();poses={keys,duration:next.duration};
  for(const [node,make] of [[actor,actorPose],[lens,p=>({opacity:p.light})],[canvas,p=>({transform:`scale(${1+p.rim})`})]]){
   const run=node.animate(keys.map(p=>({offset:p.offset,...make(p)})),{duration:next.duration,fill:'forwards'});
   if(document.timeline.currentTime!==null)run.startTime=document.timeline.currentTime;
   details.push(run);
  }
 }
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
 function clear(){clearDetails();if(primary){primary.onfinish=null;primary.cancel()}primary=null;curve=null;glass.style.transform=initialTransform;}
 function reset(){active=null;clear();settled=0;phase='idle';delete floating.dataset.pressState;install()}
 function start(next,nextPhase){
  startDetails(next,nextPhase==='held');
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
  const from=value(),bounds=glass.getBoundingClientRect();active={...input,bounds};
  actorHeight=floating.querySelector('.octi-touch-actor')?.clientHeight||bounds.height||128;
  const dx=Number.isFinite(input.x)?(input.x-bounds.left)/bounds.width-.5:0;
  const dy=Number.isFinite(input.y)?(input.y-bounds.top)/bounds.height-.5:0;
  const clamp=Math.min(1,.38/(Math.hypot(dx,dy)||1));
  lens.style.left=(50+100*dx*clamp)+'%';lens.style.top=(50+100*dy*clamp)+'%';
  start({from,to:1,duration:CONTACT},'held');
  if(!texture&&!pendingTexture)prepare();
 }
 function release(){
  if(!active)return;
  const from=value(),elapsed=Number(primary?.currentTime)||0;active=null;
  if(motion?.matches||typeof glass.animate!=='function'){reset();return}
  // A tap released before the first display frame still paints a short, smooth
  // impulse. All other releases reverse immediately from the current size.
  start({from,to:0,duration:RETURN,...(elapsed<16&&from<.1?{peak:1,peakTime:40}:{})},'release');
 }
 function prepare(){loadTexture().then(asset=>{if(asset&&!texture){pendingTexture=asset;install()}})}
 button.draggable=false;
 button.addEventListener('contextmenu',event=>event.preventDefault());button.addEventListener('selectstart',event=>event.preventDefault());
 button.addEventListener('pointerdown',event=>{if(event.isPrimary===false||event.pointerType==='mouse'&&event.button!==0)return;begin({pointerId:event.pointerId,x:event.clientX,y:event.clientY})},{passive:true});
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
