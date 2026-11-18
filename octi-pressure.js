/* One static blue material and one native transform; no video or hover control. */
(()=>{
'use strict';
const TEXTURE='octi-water-shell-332.png?v=b52c46cccd774fd5',SIZE=384,CONTACT=120,RETURN=390;
const ease=v=>{const t=Math.max(0,Math.min(1,v));return t*(.75+t*(1.05-.8*t))};
const recover=v=>1-Math.pow(1-Math.max(0,Math.min(1,v)),2);
const EASING='cubic-bezier(.333333,.25,.666667,.85)',RECOVER='cubic-bezier(.333333,.666667,.666667,1)';
const settle=v=>{const t=Math.max(0,Math.min(1,v));return t*t*(3-2*t)};
const SETTLE='cubic-bezier(.333333,0,.666667,1)';
function splitSurface(source,ctx){
 const surface=ctx.createImageData(SIZE,SIZE),rim=source.data,light=surface.data;
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const i=(y*SIZE+x)*4,u=(x+.5)*2/SIZE-1,v=(y+.5)*2/SIZE-1;
  const radius=Math.hypot(u,v),weight=settle((.843-radius)/.052)*settle((rim[i]-130)/75);
  if(weight<=0)continue;
  const original=rim[i+3],base=Math.round(original*(1-weight));
  if(original===base)continue;
  light[i]=rim[i];light[i+1]=rim[i+1];light[i+2]=rim[i+2];
  light[i+3]=255*(original-base)/(255-base);rim[i+3]=base;
 }
 return {rim:source,surface};
}
let texturePromise=null;
function loadTexture(){
 if(!texturePromise)texturePromise=new Promise(resolve=>{
  const image=new Image();image.decoding='async';
  image.onload=()=>{
   try{const staging=document.createElement('canvas');staging.width=staging.height=SIZE;const ctx=staging.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0,SIZE,SIZE);resolve(splitSurface(ctx.getImageData(0,0,SIZE,SIZE),ctx));
   }catch{texturePromise=null;resolve(null)}
  };
  image.onerror=()=>{texturePromise=null;resolve(null)};image.src=TEXTURE;
 });
 return texturePromise;
}

// The native idle image and the last-resort poster have no shader. Two small
// displacement maps move their colored pixels locally with the same envelopes.
let nativeMaps;
function idleMaps(){
 if(nativeMaps)return nativeMaps;
 const size=96,c=document.createElement('canvas');c.width=c.height=size;
 const ctx=c.getContext('2d'),pixels=ctx.createImageData(size,size);
 const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
 nativeMaps=['head','side','arms'].map(part=>{
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const ax=(x+.5)*4-192,ay=(y+.5)*4-210;
   const head=smooth(-ay/76)*(1-smooth((Math.abs(ax)-29)/17));
   const arm=smooth((Math.hypot(ax,ay)-34)/62)*(1-smooth((-ay-7)/40)*(1-smooth((Math.abs(ax)-30)/18)));
   const u=((x+.5)*246/size-123)/21.4,v=((y+.5)*246/size-102)/32;
   const z=Math.sqrt(Math.max(0,1-u*u-v*v)),surface=smooth((1.06-u*u-v*v)/.23)*smooth((136-(y+.5)*246/size)/15);
   // Inverse projection: texture marks travel over the dome while the silhouette stays put.
   const dx=part==='head'?surface*z*5:part==='side'?surface*z*28:-arm*ax*.19;
   const dy=part==='head'?-surface*z*36:part==='side'?surface*z*13:-arm*(3.5+15.5*Math.min(1,Math.abs(ax)/70));
   const at=(y*size+x)*4;pixels.data[at]=128+255*dx/96;pixels.data[at+1]=128+255*dy/96;pixels.data[at+2]=128;pixels.data[at+3]=255;
  }
  ctx.putImageData(pixels,0,0);return c.toDataURL();
 });return nativeMaps;
}
function nativeTouchFilter(root){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
 svg.setAttribute('class','octi-touch-defs');svg.setAttribute('aria-hidden','true');
 const id='octi-regional-'+root.dataset.channel,[head,side,arms]=idleMaps();
 svg.innerHTML=`<defs><filter id="${id}" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" color-interpolation-filters="sRGB">
 <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" href="${head}" result="headMap"/>
 <feDisplacementMap in="SourceGraphic" in2="headMap" scale="0" xChannelSelector="R" yChannelSelector="G" result="head"><animate attributeName="scale" begin="indefinite" fill="freeze"/></feDisplacementMap>
 <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" href="${side}" result="sideMap"/>
 <feDisplacementMap in="head" in2="sideMap" scale="0" xChannelSelector="R" yChannelSelector="G" result="turned"><animate attributeName="scale" begin="indefinite" fill="freeze"/></feDisplacementMap>
 <feImage x="0" y="0" width="1" height="1" preserveAspectRatio="none" href="${arms}" result="armMap"/>
 <feDisplacementMap in="turned" in2="armMap" scale="0" xChannelSelector="R" yChannelSelector="G"><animate attributeName="scale" begin="indefinite" fill="freeze"/></feDisplacementMap></filter></defs>`;
 root.append(svg);
 const anim=svg.querySelectorAll('animate');
 return {id,play(keys,duration){for(const [i,part] of ['head','side','arms'].entries()){
  const a=anim[i];a.setAttribute('values',keys.map(p=>p[part]*.25).join(';'));a.setAttribute('keyTimes',keys.map(p=>p.offset).join(';'));a.setAttribute('dur',duration+'ms');a.beginElement?.();
 }}};
}
// Soft window, thin strip and compact glints from three lighting directions.
const lights=[
 {angle:-2.25,radius:.76,length:.40,width:.105},
 {angle:.77,radius:.83,length:.29,width:.057},
 {angle:-.79,radius:.84,length:.18,width:.073},
 {angle:2.83,radius:.79,length:.12,width:.046}
];
const sheenPixels=[];
function glassSheen(index){
 const node=document.createElement('canvas');node.width=node.height=144;
 const ctx=node.getContext('2d');if(!ctx)return node;
 if(!sheenPixels[index]){
  const image=ctx.createImageData(144,144),rgba=image.data,light=lights[index];
  for(let y=0;y<144;y++)for(let x=0;x<144;x++){
   const u=(x+.5)/72-1,v=(y+.5)/72-1,r=Math.hypot(u,v),angle=Math.atan2(v,u)-light.angle;
   const along=Math.atan2(Math.sin(angle),Math.cos(angle))/light.length;
   const across=(r-light.radius+.019*along*along)/light.width;
   const core=Math.exp(-Math.pow(along,4)-Math.pow(across,4));
   const glow=.52*Math.exp(-.75*along*along-.44*across*across);
   const alpha=core+(1-core)*glow;
   if(alpha<.004)continue;
   const q=4*(y*144+x);
   // Warm the broad upper-left reflection while keeping the secondary lights neutral.
   rgba[q]=index===0?255:248+7*core;
   rgba[q+1]=index===0?232+19*core:249+6*core;
   rgba[q+2]=index===0?203+37*core:250+5*core;
   rgba[q+3]=255*alpha;
  }
  sheenPixels[index]=image;
 }
 ctx.putImageData(sheenPixels[index],0,0);return node;
}
window.createOctiPressureArtwork=function(root,floating,motion){
 const button=root.querySelector('.voice'),glass=root.querySelector('.octi-motion-media');
 if(!button||!glass)return {reset(){}};
 const canvas=document.createElement('canvas');canvas.className='octi-pressure-canvas';canvas.width=canvas.height=SIZE;canvas.setAttribute('aria-hidden','true');
 const legacy=document.createElement('canvas');legacy.className='octi-glass-surface';legacy.width=legacy.height=SIZE;legacy.setAttribute('aria-hidden','true');glass.append(legacy);
 const legacyCtx=legacy.getContext('2d');
 const ctx=canvas.getContext('2d',{willReadFrequently:true});let texture=null,pendingTexture=null,drawCount=0,lastDrawMs=0;
 const footprint=document.createElement('span');footprint.className='octi-shadow-footprint';footprint.setAttribute('aria-hidden','true');floating.append(footprint);
 for(const name of ['octi-pressure-shadow','octi-pressure-caustic']){const node=document.createElement('span');node.className=name;node.setAttribute('aria-hidden','true');footprint.append(node)}
 floating.classList.add('has-composited-pressure');
 const wall=document.createElement('span');wall.className='octi-pressed-wall';wall.setAttribute('aria-hidden','true');glass.append(wall);
 let active=null,curve=null,primary=null,wallRun=null,footprintRun=null,phase='idle',settled=0;
 const initialTransform=glass.style.transform;
 const scatter=document.createElement('span');scatter.className='octi-glass-scatter';scatter.setAttribute('aria-hidden','true');glass.append(scatter);
 const reflections=lights.map(({angle,radius},index)=>{
  const node=glassSheen(index);node.className='octi-contact-lens';node.setAttribute('aria-hidden','true');glass.append(node);
  return {node,x:radius*Math.cos(angle),y:radius*Math.sin(angle),pull:0};
 });
 let details=[],poses=null,nativeFilter=null,filteredImage=null,touchX=0,touchY=0;
 const headResponse=.38,armResponse=.19;
 function actorPose(){const p=currentPose();return {head:p.head*headResponse,arms:p.arms*armResponse,side:touchX/50}}
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
 function clearDetails(){for(const run of details)run.cancel();details=[];poses=null;if(filteredImage){filteredImage.style.removeProperty('filter');filteredImage=null}}
 function startDetails(next,held){
  const actor=floating.querySelector('.octi-touch-actor');
  if(!actor||motion?.matches||typeof actor.animate!=='function')return;
  const first={...currentPose(),offset:0};
  const keys=held?[first,pose(.23,.67,.06,.43),pose(.60,.98,.70,.86),pose(1,1,1,1)]:
   [first,...(next.peakTime?[pose(.17,1,.20,1),pose(.31,.61,1,.89)]:[]),
    pose(.46,-.22,.38,.44,-.032),pose(.62,-.30,-.55,.11,-.017),pose(.80,.12,.23,0,.017),pose(.91,-.035,-.08,0,-.004),pose(1,0,0,0)];
  const detailDuration=held?next.duration:240;
  clearDetails();poses={keys,duration:detailDuration};
  filteredImage=floating.querySelector('.octi-listening-media:is(.is-native-idle,.is-fallback) .octi-listening-fallback');
  if(nativeFilter&&filteredImage){filteredImage.style.filter='url(#'+nativeFilter.id+')';nativeFilter.play(keys.map(p=>({...p,head:p.head*headResponse,side:p.head*headResponse*touchX/50,arms:p.arms*armResponse})),detailDuration)}
  // Contract each optical band toward the contact in glass-local coordinates.
  // The nearby band bends most; a central touch draws both bands inward.
  const layers=reflections.map(({node,pull})=>[node,p=>{
   const contraction=pull*p.light;
   return {opacity:.88+.12*p.light,transform:`translate3d(calc(-50% + ${touchX*contraction}%),calc(-50% + ${touchY*contraction}%),0) scale(${1-contraction})`};
  }]);
  layers.push([legacy,p=>{
   const bend=.34*p.light;
   return {transform:`translate3d(${touchX*.91/1.06*bend}%,${touchY*.91/1.06*bend}%,0) scale(${1-bend})`};
  }]);
  for(const [node,make] of layers){
   const frames=keys.map(p=>({offset:p.offset,...make(p)}));
   if(next.carry?.has(node))frames[0].transform=next.carry.get(node);
   const run=node.animate(frames,{duration:detailDuration,fill:'forwards'});
   if(document.timeline.currentTime!==null)run.startTime=document.timeline.currentTime;
   details.push(run);
  }
 }
 function sample(time){
  if(!curve)return settled;
  if(curve.peakTime&&time<curve.peakTime)return curve.from+(curve.peak-curve.from)*ease(time/curve.peakTime);
  if(curve.shoulderEnd&&time<curve.shoulderEnd)return curve.peak+(.965-curve.peak)*settle((time-curve.peakTime)/(curve.shoulderEnd-curve.peakTime));
  const from=curve.shoulderEnd ? .965 : curve.from,start=curve.shoulderEnd||0;
  if(curve.echo){
   const {low,high}=curve.echo,t=(time-start)/(curve.duration-start);
   if(t<=.43)return from+(low-from)*recover(t/.43);
   if(t<=.76)return low+(high-low)*settle((t-.43)/.33);
   return high*(1-settle((t-.76)/.24));
  }
  return from+(curve.to-from)*(curve.to===0?recover:ease)((time-start)/(curve.duration-start));
 }
 function value(){return primary?sample(Number(primary.currentTime)||0):settled}
 function style(p){return {transform:`translate(-50%,-50%) scale(${1+.20*p},${1+.13*p})`}}
 function install(){
  if(!pendingTexture||!ctx||phase!=='idle')return;
  const start=performance.now();ctx.putImageData(pendingTexture.rim,0,0);legacyCtx.putImageData(pendingTexture.surface,0,0);texture=pendingTexture;pendingTexture=null;drawCount++;lastDrawMs=performance.now()-start;
  glass.prepend(canvas);glass.classList.add('is-pressure-ready');
 }
 function clear(){clearDetails();footprintRun?.cancel();footprintRun=null;wallRun?.cancel();wallRun=null;if(primary){primary.onfinish=null;primary.cancel()}primary=null;curve=null;glass.style.transform=initialTransform;}
 function reset(){active=null;clear();settled=0;phase='idle';delete floating.dataset.pressState;install()}
 function start(next,nextPhase){
  startDetails(next,nextPhase==='held');
  const previous=primary;primary=null;curve=next;phase=nextPhase;floating.dataset.pressState=nextPhase;
  if(motion?.matches||typeof glass.animate!=='function'){
   if(previous){previous.onfinish=null;previous.cancel()}settled=next.to;curve=null;
   glass.style.transform=style(settled*(motion?.matches ? .1 : 1)).transform;return;
  }
  // The shell crosses rest once in each direction on its native timeline.
  // The actor and detached highlights keep their independent motion.
  const stops=[{p:next.from,offset:0,easing:next.peakTime||next.to?EASING:RECOVER}];
  if(next.peakTime){
   stops.push({p:next.peak,offset:next.peakTime/next.duration,easing:SETTLE});
   stops.push({p:.965,offset:next.shoulderEnd/next.duration,easing:RECOVER});
  }
  if(next.echo){
   const start=(next.shoulderEnd||0)/next.duration;
   for(const [offset,p] of [[.43,next.echo.low],[.76,next.echo.high]])stops.push({p,offset:start+(1-start)*offset,easing:SETTLE});
  }
  stops.push({p:next.to,offset:1});
  const frames=stops.map(({p,...timing})=>({...style(p),...timing}));
  footprintRun?.cancel();
  footprintRun=footprint.animate(stops.map(({p,...timing})=>({
   transform:`translateY(calc(var(--octi-size,100px) * ${.051*p})) scale(${1+.20*p},${1+.13*p})`,...timing
  })),{duration:next.duration,fill:'forwards'});
  if(document.timeline.currentTime!==null)footprintRun.startTime=document.timeline.currentTime;
  wallRun?.cancel();
  wallRun=wall.animate(stops.map(({p,...timing})=>({opacity:Math.max(0,p),...timing})),{duration:next.duration,fill:'forwards'});
  if(document.timeline.currentTime!==null)wallRun.startTime=document.timeline.currentTime;
  const run=glass.animate(frames,{duration:next.duration,easing:'linear',fill:'forwards'});run.id='okti-pressure-compositor';
  if(document.timeline.currentTime!==null)run.startTime=document.timeline.currentTime;
  primary=run;
  if(previous){previous.onfinish=null;previous.cancel()}
  run.onfinish=()=>{if(primary!==run)return;settled=next.to;if(!active)reset()};
 }
 function begin(input){
  if(button.disabled||active)return;
  const from=value(),bounds=glass.getBoundingClientRect();active={...input,bounds,downAt:performance.now()};
  // A second finger-down can redirect a reflection before it has returned.
  const carry=phase==='release'?new Map([...reflections.map(({node})=>node),legacy].map(node=>[node,getComputedStyle(node).transform])):null;
  const dx=Number.isFinite(input.x)?(input.x-bounds.left)/bounds.width-.5:0;
  const dy=Number.isFinite(input.y)?(input.y-bounds.top)/bounds.height-.5:0;
  touchX=Math.max(-50,Math.min(50,100*dx/.91));touchY=Math.max(-50,Math.min(50,100*dy/.91));
  for(const band of reflections){
   const proximity=Math.max(0,1-Math.hypot(band.x-touchX/50,band.y-touchY/50)/1.85);
   band.pull=.17+.39*proximity;
  }
  start({from:motion?.matches?from:Math.max(.115,from),to:1,duration:CONTACT,carry},'held');
  if(!texture&&!pendingTexture)prepare();
 }
 function release(){
  if(!active)return;
  const from=value(),elapsed=performance.now()-active.downAt;active=null;
  if(motion?.matches||typeof glass.animate!=='function'){reset();return}
  // A light tap finishes opening after lift. A hold starts returning on lift.
  const impulse=elapsed<105,amplitude=impulse?1:from;
  const peakTime=impulse?Math.max(18,94*(1-from)):0;
  const shoulderEnd=impulse?peakTime+64:0;
  start({from,to:0,duration:RETURN+shoulderEnd,echo:{low:-.24*amplitude,high:.105*amplitude},...(impulse?{peak:1,peakTime,shoulderEnd}:{})},'release');
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
 const controls={reset,getActorPose:actorPose,getPaintState:()=>({pressure:value(),count:drawCount,ms:lastDrawMs,engine:'compositor'}),getState:()=>({pressure:value(),effective:motion?.matches?value()*.14:value(),ready:!!texture,rendering:!!texture,buffer:SIZE,source:TEXTURE,holding:!!active,phase,engine:'compositor',paintCount:drawCount})};
 root.octiPressure=controls;prepare();
 if(ctx&&typeof SVGElement!=='undefined')nativeFilter=nativeTouchFilter(root);
 return controls;
};
})();
