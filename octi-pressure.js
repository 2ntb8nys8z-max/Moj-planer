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
 const lens=document.createElement('img');lens.alt='';lens.draggable=false;lens.src='data:image/png;base64,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';lens.className='octi-contact-lens';lens.setAttribute('aria-hidden','true');glass.append(lens);
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
