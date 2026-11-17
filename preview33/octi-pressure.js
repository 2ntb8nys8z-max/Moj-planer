/* One immutable blue material; native transforms and neutral light only. */
(()=>{
'use strict';
const TEXTURE='octi-glass-33-184.png?v=ffa5688726705d31',SIZE=384,CONTACT=600,RETURN=1750;
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*v*(10+v*(-15+6*v));};
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
function spring(ms){
 const t=ms/1000,p=Math.exp(-4*t)*(Math.cos(12.5*t)+4/12.5*Math.sin(12.5*t));
 return p*(1-smooth((ms-1500)/250));
}
function sample(curve,time){
 if(curve.contact&&time<curve.contact)return curve.from+(1-curve.from)*smooth(time/curve.contact);
 if(curve.releaseAt===null||time<=curve.releaseAt)return curve.contact?1:curve.from;
 return (curve.contact?1:curve.from)*spring(time-curve.releaseAt);
}
window.createOctiPressureArtwork=function(root,floating,motion){
 const button=root.querySelector('.voice'),glass=root.querySelector('.octi-motion-media');
 if(!button||!glass)return {reset(){}};
 const canvas=document.createElement('canvas');canvas.className='octi-pressure-canvas';canvas.width=canvas.height=SIZE;canvas.setAttribute('aria-hidden','true');
 const ctx=canvas.getContext('2d',{willReadFrequently:true});let texture=null,pendingTexture=null,drawCount=0,lastDrawMs=0;
 function layer(parent,name){const node=document.createElement('span');node.className=name;node.setAttribute('aria-hidden','true');parent.append(node);return node}
 const lights=layer(glass,'octi-pressure-lights'),dent=layer(lights,'octi-pressure-dent'),reflection=layer(lights,'octi-pressure-reflection'),sheen=layer(lights,'octi-pressure-sheen');
 const shadow=layer(floating,'octi-pressure-shadow'),caustic=layer(floating,'octi-pressure-caustic');
 floating.classList.add('has-composited-pressure');
 let active=null,curve=null,records=[],primary=null,settledPressure=0,phase='idle',base=null,driftLock=null,hoverAnimation=null;
 const fallbackStyles=[];
 function value(){return curve&&primary?sample(curve,Math.max(0,Math.min(curve.duration,Number(primary.currentTime)||0))):settledPressure}
 function installTexture(){
  if(!pendingTexture||!ctx||value()!==0)return;
  const start=performance.now();ctx.putImageData(pendingTexture,0,0);texture=pendingTexture;pendingTexture=null;drawCount++;lastDrawMs=performance.now()-start;
  glass.prepend(canvas);glass.classList.add('is-pressure-ready');
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
   [dent,p=>{const t=terms(p);return {opacity:String(t.load*.64+t.recoil*.12),transform:`translate(${t.load*-1}%,${t.load*2}%) scale(${1-t.load*.12},${1-t.load*.16})`}}],
   [reflection,p=>{const t=terms(p);return {opacity:String(t.load*.56+t.recoil*.10),transform:`translate(${t.load*17}%,${t.load*32}%) rotate(${-18+t.load*24}deg) scale(${1-t.load*.18},${1-t.load*.25})`}}],
   [sheen,p=>{const t=terms(p);return {opacity:String(t.load*.72+t.recoil*.14),transform:`translate(${t.load*-22}%,${t.load*-15}%) rotate(${12-t.load*26}deg) scale(${1+t.load*.13},${1-t.load*.16})`}}],
   [shadow,p=>{const t=terms(p);return {transform:`translate(-50%,-50%) rotate(-12deg) scale(${1+t.load*.24-t.recoil*.17},${1+t.load*.16-t.recoil*.16})`,translate:`${base.x-t.load*base.size*.06}px ${base.y*-.65-t.load*base.size*.07+t.recoil*base.size*.04}px`,opacity:String(Math.max(0,Math.min(1,base.shadowOpacity+t.load*.14-t.recoil*.3)))}}],
   [caustic,p=>{const t=terms(p);return {transform:`translate(-50%,-50%) rotate(-12deg) scale(${1+t.load*.24-t.recoil*.12},${1-t.load*.15+t.recoil*.2})`,opacity:String(1-t.load*.28-t.recoil*.5)}}]
  ];
 }
 function frames(next,project){
  const times=new Set([0,next.duration]);for(let t=12;t<next.duration;t+=12)times.add(t);
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
  const from=value();lockDrift();active={...input,bounds:glass.getBoundingClientRect()};start({from,contact:CONTACT,releaseAt:null,duration:CONTACT},'held');
  if(!texture&&!pendingTexture)prepare();
 }
 function release(){
  if(!active)return;
  active=null;if(motion?.matches||typeof glass.animate!=='function'){reset();return}
  const from=value(),elapsed=Number(primary?.currentTime)||0;
  if(curve?.releaseAt===null&&elapsed<curve.contact&&primary?.playState!=='finished'){
   // Extend the same native timeline: same-task taps retain the full contact
   // impulse. Nothing pauses or advances an animation from a JavaScript loop.
   const next={...curve,releaseAt:curve.contact+60,duration:curve.contact+60+RETURN};
   for(const {run,project} of records){run.effect.setKeyframes(frames(next,project));run.effect.updateTiming({duration:next.duration})}
   curve=next;phase='tap';floating.dataset.pressState='tap';
  }else start({from,contact:0,releaseAt:0,duration:RETURN},'release');
 }
 function prepare(){loadTexture().then(asset=>{if(asset){pendingTexture=asset;installTexture()}})}
 button.draggable=false;
 button.addEventListener('contextmenu',event=>event.preventDefault());button.addEventListener('selectstart',event=>event.preventDefault());
 button.addEventListener('pointerdown',event=>{if(event.isPrimary===false||event.pointerType==='mouse'&&event.button!==0)return;begin({pointerId:event.pointerId})},{passive:true});
 window.addEventListener('pointermove',event=>{if(active?.pointerId===undefined||active.pointerId!==event.pointerId)return;const r=active.bounds;if(event.clientX<r.left-8||event.clientX>r.right+8||event.clientY<r.top-8||event.clientY>r.bottom+8)reset()},{passive:true});
 window.addEventListener('pointerup',event=>{if(active?.pointerId===event.pointerId)release()},{capture:true,passive:true});
 window.addEventListener('pointercancel',event=>{if(active?.pointerId===event.pointerId)reset()},{capture:true,passive:true});
 button.addEventListener('keydown',event=>{if(!event.repeat&&[' ','Enter'].includes(event.key))begin({key:event.key})});
 window.addEventListener('keyup',event=>{if(active?.key===event.key)release()},true);
 button.addEventListener('blur',()=>{if(button.disabled&&!active&&['tap','release'].includes(phase))return;reset()});window.addEventListener('blur',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});motion?.addEventListener?.('change',reset);
 const controls={reset,getPaintState:()=>({pressure:value(),count:drawCount,ms:lastDrawMs,engine:'compositor'}),getState:()=>({pressure:value(),effective:motion?.matches?Math.max(0,value())*.14:value(),ready:!!texture,rendering:!!texture,buffer:SIZE,source:TEXTURE,holding:!!active,phase,engine:'compositor',paintCount:drawCount})};
 root.octiPressure=controls;prepare();return controls;
};
})();
