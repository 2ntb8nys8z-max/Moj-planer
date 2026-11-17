/* One immutable blue material; native transforms and neutral light only. */
(()=>{
'use strict';
const TEXTURE='octi-glass-33-184.png?v=ffa5688726705d31',LIGHTS='octi-pressure-lights-33-319.webp?v=38ea712472ff432d',LIGHT_POSES=6,SIZE=384,CONTACT=80,RETURN=120,IMMEDIATE=.4;
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*v*(10+v*(-15+6*v));};
const easeOut=v=>1-Math.pow(1-Math.max(0,Math.min(1,v)),3);
let texturePromise=null,lightPromise=null;
function loadLights(){
 if(!lightPromise)lightPromise=new Promise(resolve=>{
  const image=new Image();image.decoding='async';
  image.onload=()=>resolve(true);image.onerror=()=>{lightPromise=null;resolve(false)};image.src=LIGHTS;
 });
 return lightPromise;
}
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
function sample(curve,time){
 if(curve.contact&&time<curve.contact)return curve.from+(1-curve.from)*easeOut(time/curve.contact);
 if(curve.releaseAt===null||time<=curve.releaseAt)return curve.contact?1:curve.from;
 return curve.from*(1-easeOut((time-curve.releaseAt)/RETURN));
}
window.createOctiPressureArtwork=function(root,floating,motion){
 const button=root.querySelector('.voice'),glass=root.querySelector('.octi-motion-media');
 if(!button||!glass)return {reset(){}};
 const canvas=document.createElement('canvas');canvas.className='octi-pressure-canvas';canvas.width=canvas.height=SIZE;canvas.setAttribute('aria-hidden','true');
 const ctx=canvas.getContext('2d',{willReadFrequently:true});let texture=null,pendingTexture=null,drawCount=0,lastDrawMs=0;
 function layer(parent,name){const node=document.createElement('span');node.className=name;node.setAttribute('aria-hidden','true');parent.append(node);return node}
 const lights=layer(glass,'octi-pressure-lights'),lightPoses=Array.from({length:LIGHT_POSES},(_,i)=>{
  const pose=layer(lights,'octi-pressure-light-pose');pose.style.backgroundImage=`url("${LIGHTS}")`;pose.style.backgroundPosition=`${i/(LIGHT_POSES-1)*100}% 0%`;return pose;
 });
 lights.style.visibility='hidden';let lightingReady=false,pendingLights=false;
 const shadow=layer(floating,'octi-pressure-shadow'),caustic=layer(floating,'octi-pressure-caustic');
 floating.classList.add('has-composited-pressure');
 let active=null,curve=null,records=[],primary=null,settledPressure=0,phase='idle',base=null,driftLock=null,hoverAnimation=null;
 const fallbackStyles=[];
 function value(){return curve&&primary?sample(curve,Math.max(0,Math.min(curve.duration,Number(primary.currentTime)||0))):settledPressure}
 function installTexture(){
  if(value()!==0)return;
  if(pendingTexture&&ctx){
   const start=performance.now();ctx.putImageData(pendingTexture,0,0);texture=pendingTexture;pendingTexture=null;drawCount++;lastDrawMs=performance.now()-start;
   glass.prepend(canvas);glass.classList.add('is-pressure-ready');
  }
  if(pendingLights){lightingReady=true;pendingLights=false;lights.style.visibility='visible'}
 }
 function lockDrift(){
  if(driftLock)return;
  hoverAnimation=floating.getAnimations().find(run=>run.animationName==='okti-hover-physics');
  if(hoverAnimation){const time=hoverAnimation.currentTime;hoverAnimation.pause();hoverAnimation.currentTime=time}
  const style=getComputedStyle(floating);
  driftLock=['--okti-drift-x','--okti-drift-y','--okti-lift'].map(name=>({name,value:style.getPropertyValue(name),previous:floating.style.getPropertyValue(name),priority:floating.style.getPropertyPriority(name)}));
  for(const item of driftLock)floating.style.setProperty(item.name,item.value,'important');
  base={x:parseFloat(style.getPropertyValue('--okti-drift-x'))||0,y:parseFloat(style.getPropertyValue('--okti-drift-y'))||0,size:parseFloat(style.getPropertyValue('--octi-size'))||100,shadowOpacity:Number(getComputedStyle(shadow).opacity)};
 }
 function unlockDrift(){
  if(!driftLock)return;
  for(const item of driftLock){if(item.previous)floating.style.setProperty(item.name,item.previous,item.priority);else floating.style.removeProperty(item.name)}
  driftLock=null;
  if(hoverAnimation&&!motion?.matches&&floating.getAnimations().includes(hoverAnimation))hoverAnimation.play();
  hoverAnimation=null;base=null;
 }
 function clearRuns(){
  for(const {run} of records){run.onfinish=null;run.cancel()}
  records=[];primary=null;curve=null;
  for(const [node,name,value,priority] of fallbackStyles){if(value)node.style.setProperty(name,value,priority);else node.style.removeProperty(name)}
  fallbackStyles.length=0;
 }
 function reset(){active=null;clearRuns();settledPressure=0;phase='idle';delete floating.dataset.pressState;unlockDrift();installTexture()}
 function projections(){
  const terms=p=>{p=motion?.matches?Math.max(0,p)*.14:p;return {p,load:smooth(Math.max(0,p)),recoil:smooth(Math.max(0,-p))}};
  return [
   [glass,p=>{const t=terms(p);return {transform:`translate(-50%,-50%) scale(${1+t.p*.16},${1+t.load*.10+t.recoil*.40})`,translate:`${base.x}px ${base.y-t.recoil*base.size*.08}px`}}],
   // Adjacent rendered light poses blend on the native clock. No material
   // crossfade, animated background position, Canvas redraw or JS frame loop.
   ...lightPoses.map((node,i)=>[node,p=>{
    const position=Math.max(0,terms(p).p)*LIGHT_POSES,lo=Math.floor(position),fraction=smooth(position-lo);
    const opacity=(i===lo-1?1-fraction:0)+(i===lo?fraction:0);
    return {opacity:String(opacity),transform:'translate(0,0)'};
   }]),
   [shadow,p=>{const t=terms(p);return {transform:`translate(-50%,-50%) rotate(-12deg) scale(${1+t.load*.24-t.recoil*.17},${1+t.load*.16-t.recoil*.16})`,translate:`${base.x-t.load*base.size*.06}px ${base.y*-.65-t.load*base.size*.07+t.recoil*base.size*.04}px`,opacity:String(Math.max(0,Math.min(1,base.shadowOpacity+t.load*.14-t.recoil*.3)))}}],
   [caustic,p=>{const t=terms(p);return {transform:`translate(-50%,-50%) rotate(-12deg) scale(${1+t.load*.24-t.recoil*.12},${1-t.load*.15+t.recoil*.2})`,opacity:String(1-t.load*.28-t.recoil*.5)}}]
  ];
 }
 function frames(next,project){
  const times=new Set([0,next.duration]);for(let t=4;t<next.duration;t+=4)times.add(t);
  for(const t of [next.contact,next.releaseAt])if(t!==null&&t>=0&&t<=next.duration)times.add(t);
  return [...times].sort((a,b)=>a-b).map(time=>({...project(sample(next,time)),offset:time/next.duration}));
 }
 function finished(){if(!curve)return;settledPressure=curve.releaseAt===null?1:0;if(curve.releaseAt!==null)reset()}
 function start(next,nextPhase){
  const previous=records;records=[];primary=null;curve=next;phase=nextPhase;floating.dataset.pressState=nextPhase;
  if(motion?.matches||typeof glass.animate!=='function'){
   for(const {run} of previous){run.onfinish=null;run.cancel()}
   const p=next.releaseAt===null?1:0;settledPressure=p;curve=null;
   for(const [node,project] of projections())for(const [name,value] of Object.entries(project(p))){fallbackStyles.push([node,name,node.style.getPropertyValue(name),node.style.getPropertyPriority(name)]);node.style.setProperty(name,value)}
   return;
  }
  const startTime=document.timeline.currentTime;
  for(const [node,project] of projections()){
   const run=node.animate(frames(next,project),{duration:next.duration,easing:'linear',fill:'forwards'});run.id='okti-pressure-compositor';
   if(startTime!==null)run.startTime=startTime;
   records.push({run,project});if(node===glass)primary=run;
  }
  for(const {run} of previous){run.onfinish=null;run.cancel()}
  primary.onfinish=finished;
 }
 function begin(input){
  if(button.disabled||active)return;
  // Apply visible pressure in this input task, including taps released before
  // the first display frame. The remaining expansion takes only 80 ms.
  const from=Math.max(value(),IMMEDIATE);lockDrift();active={...input,bounds:glass.getBoundingClientRect()};start({from,contact:CONTACT,releaseAt:null,duration:CONTACT},'held');
  if(!texture&&!pendingTexture)prepare();
 }
 function release(){
  if(!active)return;
  active=null;if(motion?.matches||typeof glass.animate!=='function'){reset();return}
  // Finger-up reverses from the currently displayed pressure immediately.
  // A short tap never waits for full expansion or a minimum held pose.
  start({from:value(),contact:0,releaseAt:0,duration:RETURN},'release');
 }
 function prepare(){
  loadTexture().then(asset=>{if(asset&&!texture){pendingTexture=asset;installTexture()}});
  loadLights().then(ready=>{if(ready&&!lightingReady){pendingLights=true;installTexture()}});
 }
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
 const controls={reset,getPaintState:()=>({pressure:value(),count:drawCount,ms:lastDrawMs,engine:'compositor'}),getState:()=>({pressure:value(),effective:motion?.matches?Math.max(0,value())*.14:value(),ready:!!texture,rendering:!!texture,buffer:SIZE,source:TEXTURE,lightSource:LIGHTS,lightingReady,holding:!!active,phase,engine:'compositor',paintCount:drawCount})};
 root.octiPressure=controls;prepare();return controls;
};
})();
