/* One original glass surface for rest, press, hold and release. Presentation only. */
(()=>{
'use strict';
const TEXTURE='octi-glass-33-184.png?v=ffa5688726705d31';
const SIZE=384,LIGHT=[235,250,255],SHADE=[34,111,164];
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*v*(10+v*(-15+6*v));};
let texturePromise=null,geometry=null;
function loadTexture(){
 if(!texturePromise)texturePromise=new Promise(resolve=>{
  const image=new Image();image.decoding='async';
  image.onload=()=>{
   try{const staging=document.createElement('canvas');staging.width=staging.height=SIZE;const ctx=staging.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0,SIZE,SIZE);surfaceGeometry();resolve({image,pixels:ctx.getImageData(0,0,SIZE,SIZE).data});
   }catch{texturePromise=null;resolve(null)}
  };
  image.onerror=()=>{texturePromise=null;resolve(null)};image.src=TEXTURE;
 });
 return texturePromise;
}
function surfaceGeometry(){
 if(geometry)return geometry;
 const dx=new Float32Array(SIZE*SIZE),dy=new Float32Array(SIZE*SIZE),shade=new Float32Array(SIZE*SIZE),rim=new Float32Array(SIZE*SIZE),indices=[];
 const length=Math.hypot(-.48,-.54,.7),lx=-.48/length,ly=-.54/length,lz=.7/length;
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
  const i=y*SIZE+x,qx=(x+.5)/SIZE-.5,qy=(y+.5)/SIZE-.5,r=Math.hypot(qx,qy);
  if(r>=.45)continue;
  const edge=Math.exp(-(((r-.365)/.07)**2))*(1-smooth((r-.41)/.04));
  const bend=.025*edge/Math.max(.001,r)+.10*Math.exp(-r*r/.035);
  dx[i]=qx*bend*SIZE;dy[i]=qy*bend*SIZE;rim[i]=edge;
  // A circular concavity changes the normal of the same blue glass. Its light
  // and shade grow continuously from zero, without a second colored shell.
  const z=Math.sqrt(Math.max(.0001,.45*.45-r*r));
  const dent=2*.22/.0225*Math.exp(-r*r/.0225),gx=-qx/z+dent*qx,gy=-qy/z+dent*qy,n=Math.hypot(gx,gy,1);
  const before=(qx*lx+qy*ly+z*lz)/.45,after=(-gx*lx-gy*ly+lz)/n;
  shade[i]=Math.max(-.09,Math.min(.09,(after-before)*.12))*Math.exp(-r*r/.09);indices.push(i);
 }
 geometry={dx,dy,shade,rim,indices:new Uint32Array(indices)};return geometry;
}
function deformTexture(source,target,pressure){
 const {dx,dy,shade,rim,indices}=surfaceGeometry();target.set(source);
 for(const i of indices){
  const x=i%SIZE,y=(i-x)/SIZE,sx=Math.max(0,Math.min(SIZE-1.001,x+dx[i]*pressure)),sy=Math.max(0,Math.min(SIZE-1.001,y+dy[i]*pressure));
  const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy;
  const a=(iy*SIZE+ix)*4,b=a+4,c=a+SIZE*4,d=c+4;
  const wa=(1-fx)*(1-fy)*source[a+3]/255,wb=fx*(1-fy)*source[b+3]/255,wc=(1-fx)*fy*source[c+3]/255,wd=fx*fy*source[d+3]/255;
  const alpha=wa+wb+wc+wd,light=shade[i]*pressure,overlay=Math.abs(light),opacity=alpha*(1-overlay)+overlay;
  const dark=1-.12*Math.max(0,pressure)*rim[i],q=i*4;
  for(let channel=0;channel<3;channel++){
   const color=(light>=0?LIGHT:SHADE)[channel];
   const sampled=(source[a+channel]*wa+source[b+channel]*wb+source[c+channel]*wc+source[d+channel]*wd)*dark;
   target[q+channel]=opacity?(sampled*(1-overlay)+color*overlay)/opacity:0;
  }
  target[q+3]=opacity*255;
 }
}
window.createOctiPressureArtwork=function(root,floating,motion){
 const button=root.querySelector('.voice');if(!button)return {reset(){}};
 const glass=root.querySelector('.octi-motion-media'),canvas=document.createElement('canvas');
 if(!glass)return {reset(){}};
 canvas.className='octi-pressure-canvas';canvas.width=canvas.height=SIZE;canvas.setAttribute('aria-hidden','true');
 const ctx=canvas.getContext('2d',{willReadFrequently:true});let texture=null,active=null,animation=null,raf=0,lastPressure=NaN,lastPaint=0;
 const output=ctx?.createImageData(SIZE,SIZE);
 let driftLock=null,hoverAnimation=null,drawCount=0,lastDrawMs=0;
 function lockDrift(){
  if(driftLock)return;
  hoverAnimation=floating.getAnimations().find(run=>run.animationName==='okti-hover-physics');
  if(hoverAnimation){const time=hoverAnimation.currentTime;hoverAnimation.pause();hoverAnimation.currentTime=time}
  const style=getComputedStyle(floating);
  driftLock=['--okti-drift-x','--okti-drift-y','--okti-lift'].map(name=>({name,value:style.getPropertyValue(name),previous:floating.style.getPropertyValue(name),priority:floating.style.getPropertyPriority(name)}));
  for(const item of driftLock)floating.style.setProperty(item.name,item.value,'important');
 }
 function unlockDrift(){
  if(!driftLock)return;
  for(const item of driftLock){if(item.previous)floating.style.setProperty(item.name,item.previous,item.priority);else floating.style.removeProperty(item.name)}
  driftLock=null;
  if(hoverAnimation&&!motion?.matches&&floating.getAnimations().includes(hoverAnimation))hoverAnimation.play();
  hoverAnimation=null;
 }
 const value=()=>Number.parseFloat(getComputedStyle(floating).getPropertyValue('--okti-pressure'))||0;
 function draw(p){
  if(!texture||!ctx||p===lastPressure||p!==0&&p!==1&&Math.abs(p-lastPressure)<.0005)return;
  const drawStart=performance.now();lastPressure=p;
  if(Math.abs(p)<.00001){ctx.clearRect(0,0,SIZE,SIZE);ctx.drawImage(texture.image,0,0,SIZE,SIZE);drawCount++;lastDrawMs=performance.now()-drawStart;return}
  deformTexture(texture.pixels,output.data,p);ctx.putImageData(output,0,0);drawCount++;lastDrawMs=performance.now()-drawStart;
 }
 function paint(){
  const p=value(),effective=motion?.matches?Math.max(0,p)*.14:p;draw(effective);
  // Late image decoding never swaps the surface during a finger gesture.
  if(texture&&ctx&&canvas.parentElement!==glass&&effective===0){glass.append(canvas);glass.classList.add('is-pressure-ready')}
  return {pressure:p,effective};
 }
 function tick(time){raf=0;if(time-lastPaint>=30){paint();lastPaint=time}if(animation)raf=requestAnimationFrame(tick)}
 function stop(){if(animation){animation.cancel();animation=null}if(raf){cancelAnimationFrame(raf);raf=0}}
 function animate(peaks,duration,easing=smooth){
  stop();floating.style.setProperty('--okti-pressure',String(peaks[0][1]));
  if(motion?.matches||typeof floating.animate!=='function'){
   floating.style.setProperty('--okti-pressure',String(peaks.at(-1)[1]));
   if(!peaks.at(-1)[1]){delete floating.dataset.pressState;unlockDrift()}
   paint();return;
  }
  const keyframes=[];
  for(let segment=0;segment<peaks.length-1;segment++){
   const [start,from]=peaks[segment],[end,to]=peaks[segment+1],steps=Math.max(1,Math.ceil((end-start)/16));
   for(let i=segment?1:0;i<=steps;i++){
    const f=i/steps;keyframes.push({'--okti-pressure':String(from+(to-from)*easing(f)),offset:(start+(end-start)*f)/duration});
   }
  }
  const run=floating.animate(keyframes,{duration,easing:'linear',fill:'forwards'});animation=run;
  run.onfinish=()=>{
   if(animation!==run)return;
   floating.style.setProperty('--okti-pressure',String(peaks.at(-1)[1]));animation=null;run.cancel();
   if(!peaks.at(-1)[1]){delete floating.dataset.pressState;unlockDrift()}
   paint();
  };
  paint();raf=requestAnimationFrame(tick);
 }
 function reset(){
  if(!active&&!animation&&!value())return;
  active=null;stop();floating.style.setProperty('--okti-pressure','0');delete floating.dataset.pressState;unlockDrift();paint();
 }
 function begin(input){
  if(button.disabled||active)return;
  lockDrift();const from=value();active={...input,bounds:glass.getBoundingClientRect()};
  floating.dataset.pressState='held';animate([[0,from],[480,1]],480,t=>1-(1-t)**3);
  if(!texture)prepare();
 }
 function release(){
  if(!active)return;
  const from=value();if(Math.abs(from)<.001){reset();return}
  active=null;floating.dataset.pressState='release';
  // Only release the compression actually reached. Never add another press
  // after pointerup, including taps that finish before the first painted frame.
  const amplitude=Math.max(0,from),peaks=[[0,from]];
  for(const [time,p] of [[250,-.38],[500,.11],[750,-.075],[1000,.038],[1250,-.022],[1500,.008],[1750,0]])peaks.push([time,p*amplitude]);
  animate(peaks,1750);
 }
 function prepare(){
  loadTexture().then(asset=>{
   if(!asset||!ctx)return;texture=asset;lastPressure=NaN;paint();
   // paint() installs the identical texture only while the bubble is at rest.
  });
 }
 // Prevent only native long-press UI. Pointerdown/up and click remain owned by
 // the existing recorder, including its synchronous microphone activation.
 button.draggable=false;
 button.addEventListener('contextmenu',event=>event.preventDefault());
 button.addEventListener('selectstart',event=>event.preventDefault());
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
 const controls={reset,getPaintState:()=>({pressure:lastPressure,count:drawCount,ms:lastDrawMs}),getState:()=>({...paint(),ready:!!texture&&canvas.parentElement===glass,rendering:!!texture&&!!ctx&&canvas.parentElement===glass,buffer:SIZE,source:TEXTURE,holding:!!active})};
 root.octiPressure=controls;prepare();return controls;
};
})();
