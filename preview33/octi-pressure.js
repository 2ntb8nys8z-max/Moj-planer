/* Approved glass membrane, v3. Presentation only; recorder events stay passive. */
(()=>{
'use strict';
const ATLAS='octi-pressure-33-311.webp?v=444011878e19cd36';
const TILE=384,COLUMNS=6,REST_DIAMETER=298;
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*v*(10+v*(-15+6*v));};
let atlasPromise=null;
function loadAtlas(){
 if(!atlasPromise)atlasPromise=new Promise(resolve=>{
  const image=new Image();image.decoding='async';image.onload=()=>resolve(image);image.onerror=()=>{atlasPromise=null;resolve(null)};image.src=ATLAS;
 });
 return atlasPromise;
}
window.createOctiPressureArtwork=function(root,floating,motion){
 const button=root.querySelector('.voice');if(!button)return {reset(){}};
 const layer=document.createElement('span'),canvas=document.createElement('canvas');
 layer.className='octi-pressure-media';layer.setAttribute('aria-hidden','true');canvas.className='octi-pressure-canvas';
 // Fixed backing dimensions: touching the bubble never reallocates either canvas.
 canvas.width=canvas.height=TILE;layer.append(canvas);floating.append(layer);
 const ctx=canvas.getContext('2d');let atlas=null,active=null,animation=null,raf=0,lastPressure=NaN;
 let blend=0,initialBlend=0,releaseStart=0,releaseDuration=0,releaseBlend=0;
 const now=()=>performance.now();
 const value=()=>Number.parseFloat(getComputedStyle(floating).getPropertyValue('--okti-pressure'))||0;
 function draw(pressure){
  if(!ctx||!atlas||pressure===lastPressure)return;
  lastPressure=pressure;ctx.clearRect(0,0,TILE,TILE);
  const frame=pressure<0?8+Math.max(-.38,pressure)/.38*8:8+Math.min(1,pressure)*20;
  const low=Math.floor(frame),high=Math.min(28,low+1),part=frame-low;
  const tile=(index,alpha)=>{ctx.globalAlpha=alpha;ctx.drawImage(atlas,(index%COLUMNS)*TILE,Math.floor(index/COLUMNS)*TILE,TILE,TILE,0,0,TILE,TILE)};
  // Add premultiplied frame weights so interpolation preserves optical density.
  ctx.globalCompositeOperation='source-over';tile(low,1-part);
  if(part>.00001){ctx.globalCompositeOperation='lighter';tile(high,part)}
  ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
 }
 function paint(){
  const p=value(),quiet=!!motion?.matches,effective=quiet?Math.max(0,p)*.14:p;
  if(active)blend=Math.max(initialBlend,smooth(Math.abs(effective)/.2));
  else if(releaseDuration)blend=Math.max(smooth(Math.abs(effective)/.2),releaseBlend*(1-smooth((now()-releaseStart)/releaseDuration)));
  else blend=0;
  if(!atlas||!ctx)blend=0;
  draw(effective);floating.style.setProperty('--okti-glass-blend',String(blend));
  layer.style.opacity=String(blend);
  return {pressure:p,effective,blend};
 }
 function tick(){raf=0;paint();if(animation)raf=requestAnimationFrame(tick)}
 function stop(){if(animation){animation.cancel();animation=null}if(raf){cancelAnimationFrame(raf);raf=0}}
 function animate(peaks,duration){
  stop();floating.style.setProperty('--okti-pressure',String(peaks[0][1]));
  if(motion?.matches||typeof floating.animate!=='function'){
   floating.style.setProperty('--okti-pressure',String(peaks.at(-1)[1]));
   if(!peaks.at(-1)[1]){delete floating.dataset.pressState;releaseDuration=0}
   paint();return;
  }
  const keyframes=[];
  for(let segment=0;segment<peaks.length-1;segment++){
   const [start,from]=peaks[segment],[end,to]=peaks[segment+1],steps=Math.max(1,Math.ceil((end-start)/16));
   for(let i=segment?1:0;i<=steps;i++){
    const f=i/steps;keyframes.push({'--okti-pressure':String(from+(to-from)*smooth(f)),offset:(start+(end-start)*f)/duration});
   }
  }
  const run=floating.animate(keyframes,{duration,easing:'linear',fill:'forwards'});animation=run;
  run.onfinish=()=>{
   if(animation!==run)return;
   floating.style.setProperty('--okti-pressure',String(peaks.at(-1)[1]));animation=null;run.cancel();
   if(!peaks.at(-1)[1]){delete floating.dataset.pressState;releaseDuration=0}
   paint();
  };
  paint();raf=requestAnimationFrame(tick);
 }
 function reset(){
  if(!active&&!animation&&!releaseDuration&&!blend)return;
  active=null;stop();releaseDuration=0;initialBlend=blend=0;
  floating.style.setProperty('--okti-pressure','0');delete floating.dataset.pressState;paint();
 }
 function begin(input){
  if(button.disabled||active)return;
  const from=value();initialBlend=blend;releaseDuration=0;
  active={...input,bounds:root.querySelector('.octi-motion-media').getBoundingClientRect()};
  floating.dataset.pressState='held';animate([[0,from],[160,1]],160);
  if(!atlas)loadAtlas().then(image=>{atlas=image;if(atlas){lastPressure=NaN;paint()}});
 }
 function release(){
  if(!active)return;
  const from=value(),short=from<.42,peak=short?.65:from,delay=short?70:0;
  active=null;floating.dataset.pressState='release';releaseStart=now();releaseDuration=1750+delay;releaseBlend=Math.max(blend,.7);
  const peaks=short?[[0,from],[delay,peak]]:[[0,peak]];
  for(const [time,p] of [[250,-.38],[500,.11],[750,-.075],[1000,.038],[1250,-.022],[1500,.008],[1750,0]])peaks.push([time+delay,p*peak]);
  animate(peaks,releaseDuration);
 }
 button.addEventListener('pointerdown',event=>{
  if(event.isPrimary===false||event.pointerType==='mouse'&&event.button!==0)return;
  begin({pointerId:event.pointerId});
 },{passive:true});
 window.addEventListener('pointermove',event=>{
  if(active?.pointerId===undefined||active.pointerId!==event.pointerId)return;const r=active.bounds;
  if(event.clientX<r.left-8||event.clientX>r.right+8||event.clientY<r.top-8||event.clientY>r.bottom+8)reset();
 },{passive:true});
 window.addEventListener('pointerup',event=>{if(active?.pointerId===event.pointerId)release()},{capture:true,passive:true});
 window.addEventListener('pointercancel',event=>{if(active?.pointerId===event.pointerId)reset()},{capture:true,passive:true});
 button.addEventListener('keydown',event=>{if(!event.repeat&&[' ','Enter'].includes(event.key))begin({key:event.key})});
 window.addEventListener('keyup',event=>{if(active?.key===event.key)release()},true);
 button.addEventListener('blur',reset);window.addEventListener('blur',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});motion?.addEventListener?.('change',reset);
 const controls={reset,getState:()=>({...paint(),ready:!!atlas,rendering:!!ctx&&!!atlas,buffer:canvas.width,restDiameter:REST_DIAMETER})};
 root.octiPressure=controls;
 loadAtlas().then(image=>{atlas=image;if(atlas){lastPressure=NaN;paint()}});
 return controls;
};
})();
