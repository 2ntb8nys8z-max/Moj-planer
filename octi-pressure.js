/* Original resting glass and the approved v3 membrane optics in one surface. Presentation only. */
(()=>{
'use strict';
const TEXTURE='octi-glass-33-184.png?v=ffa5688726705d31';
const OPTICS='octi-pressure-33-311.webp?v=444011878e19cd36';
const SIZE=384,LIGHT=[235,250,255],SHADE=[34,111,164];
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*v*(10+v*(-15+6*v));};
let texturePromise=null,opticsPromise=null,surfacePromise=null,geometry=null;
function loadOptics(){
 if(!opticsPromise)opticsPromise=new Promise(resolve=>{
  const image=new Image();image.decoding='async';
  image.onload=()=>resolve(image);image.onerror=()=>{opticsPromise=null;resolve(null)};image.src=OPTICS;
 });
 return opticsPromise;
}
function loadTexture(){
 if(!texturePromise)texturePromise=new Promise(resolve=>{
  const image=new Image();image.decoding='async';
  image.onload=()=>{
   try{const staging=document.createElement('canvas');staging.width=staging.height=SIZE;const ctx=staging.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(image,0,0,SIZE,SIZE);const original=ctx.getImageData(0,0,SIZE,SIZE);surfaceGeometry();resolve({image,pixels:original.data,original});
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
async function loadSurfaces(asset){
 // The v3 Blender frames carry the changing surface normals, central dent,
 // moving softbox reflections and lower glass fold. Normalize their silhouette:
 // CSS owns the entire expansion, so both light fields share one moving edge.
 // Precompute once for all docks; drawing a gesture only blends two frames.
 if(!surfacePromise)surfacePromise=(async()=>{
  const optics=await loadOptics();
  return new Promise(resolve=>{
  const pressures=Array.from({length:29},(_,i)=>i<8?-.38+i*.38/8:(i-8)/20),frames=[];
  const optical=document.createElement('canvas');optical.width=optical.height=SIZE;
  const opticalContext=optical.getContext('2d',{willReadFrequently:true});
  let index=0;
  function next(){
   const pressure=pressures[index],frame=document.createElement('canvas');frame.width=frame.height=SIZE;
   const context=frame.getContext('2d');if(!context){surfacePromise=null;resolve(null);return}
   if(pressure===0)context.putImageData(asset.original,0,0);
   else{const pixels=context.createImageData(SIZE,SIZE);deformTexture(asset.pixels,pixels.data,pressure);context.putImageData(pixels,0,0)}
   if(pressure!==0&&optics&&opticalContext){
    opticalContext.clearRect(0,0,SIZE,SIZE);
    opticalContext.drawImage(optics,index%6*SIZE,Math.floor(index/6)*SIZE,SIZE,SIZE,0,0,SIZE,SIZE);
    const pixels=opticalContext.getImageData(0,0,SIZE,SIZE).data;
    let left=SIZE,top=SIZE,right=0,bottom=0;
    for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(pixels[(y*SIZE+x)*4+3]>3){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
    if(right>left&&bottom>top){
     const blend=pressure>0?.88*smooth(pressure):.48*smooth(-pressure/.38);
     // Interpolate premultiplied color and alpha inside this same canvas.
     // The resting image is exact, and no second rim or overlay is installed.
     context.globalCompositeOperation='destination-in';context.fillStyle='rgba(0,0,0,'+(1-blend)+')';context.fillRect(0,0,SIZE,SIZE);
     context.globalCompositeOperation='lighter';context.globalAlpha=blend;
     context.drawImage(optical,left,top,right-left+1,bottom-top+1,SIZE*.05,SIZE*.05,SIZE*.90,SIZE*.90);
     context.globalAlpha=1;context.globalCompositeOperation='source-over';
    }
   }
   frames.push({pressure,image:frame,optics:!!optics});index++;
   if(index<pressures.length)setTimeout(next,0);else resolve(frames);
  }
  setTimeout(next,0);
  });
 })();
 return surfacePromise;
}
window.createOctiPressureArtwork=function(root,floating,motion){
 const button=root.querySelector('.voice');if(!button)return {reset(){}};
 const glass=root.querySelector('.octi-motion-media'),canvas=document.createElement('canvas');
 if(!glass)return {reset(){}};
 canvas.className='octi-pressure-canvas';canvas.width=canvas.height=SIZE;canvas.setAttribute('aria-hidden','true');
 const ctx=canvas.getContext('2d',{willReadFrequently:true});let texture=null,surfaces=null,preparedSurfaces=null,active=null,animation=null,animationTarget=0,releasePending=false,frameClock=null,raf=0,lastPressure=NaN;
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
  // Reuse decoded pixels at rest. Re-sampling the PNG after Canvas has blended
  // transparent frames can choose another Chromium raster path and leave a
  // different low-alpha surface, even with the exact same pressure of zero.
  if(Math.abs(p)<.00001){ctx.putImageData(texture.original,0,0);drawCount++;lastDrawMs=performance.now()-drawStart;return}
  if(!surfaces)ctx.putImageData(texture.original,0,0);
  else{
   const pressure=Math.max(-.4,Math.min(1,p));let upper=surfaces.findIndex(frame=>frame.pressure>=pressure);
   if(upper<0)upper=surfaces.length-1;const b=surfaces[upper],a=surfaces[Math.max(0,upper-1)];
   const blend=a===b?0:(pressure-a.pressure)/(b.pressure-a.pressure);
   // Add premultiplied colors so interpolation preserves the original alpha.
   // Source-over crossfades would thicken the transparent rim into two layers.
   ctx.globalCompositeOperation='copy';ctx.globalAlpha=1-blend;ctx.drawImage(a.image,0,0);
   if(blend){ctx.globalCompositeOperation='lighter';ctx.globalAlpha=blend;ctx.drawImage(b.image,0,0)}
   ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
  }
  drawCount++;lastDrawMs=performance.now()-drawStart;
 }
 function paint(){
  const p=value(),effective=motion?.matches?Math.max(0,p)*.14:p;
  if(!surfaces&&preparedSurfaces&&effective===0)surfaces=preparedSurfaces;
  draw(effective);
  // Late image decoding never swaps the surface during a finger gesture.
  if(texture&&ctx&&canvas.parentElement!==glass&&effective===0){glass.append(canvas);glass.classList.add('is-pressure-ready')}
  return {pressure:p,effective};
 }
 function tick(time){
  raf=0;let complete=null;
  if(frameClock){
   // Keep the short contact impulse visible even if the live actor stalls a
   // frame. The input may already be released; the visual impulse still ends.
   frameClock.elapsed=Math.min(frameClock.duration,frameClock.elapsed+Math.min(frameClock.maxStep,Math.max(0,time-frameClock.last)));
   frameClock.last=time;frameClock.run.currentTime=frameClock.elapsed;
   if(frameClock.elapsed>=frameClock.duration){complete=frameClock.run;frameClock=null}
  }
  paint();
  if(complete)complete.finish();
  if(animation)raf=requestAnimationFrame(tick);
 }
 function stop(){frameClock=null;animationTarget=0;if(animation){animation.cancel();animation=null}if(raf){cancelAnimationFrame(raf);raf=0}}
 function animate(peaks,duration,easing=smooth,preserveFrames=false,maxStep=50){
  stop();animationTarget=peaks.at(-1)[1];floating.style.setProperty('--okti-pressure',String(peaks[0][1]));
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
  if(preserveFrames){run.pause();run.currentTime=0;frameClock={run,duration,maxStep,elapsed:0,last:performance.now()}}
  run.onfinish=()=>{
   if(animation!==run)return;
   if(raf){cancelAnimationFrame(raf);raf=0}
   floating.style.setProperty('--okti-pressure',String(peaks.at(-1)[1]));animation=null;run.cancel();
   if(!peaks.at(-1)[1]){delete floating.dataset.pressState;unlockDrift()}
   paint();
   if(peaks.at(-1)[1]===1&&releasePending){
    // Keep one fully pressed frame before returning. This is presentation
    // only: the recorder's native click has already run without waiting.
    raf=requestAnimationFrame(()=>{raf=0;if(releasePending&&!active){releasePending=false;rebound(1)}});
   }
  };
  paint();raf=requestAnimationFrame(tick);
 }
 function reset(){
  if(!active&&!animation&&!value())return;
  active=null;releasePending=false;stop();floating.style.setProperty('--okti-pressure','0');delete floating.dataset.pressState;unlockDrift();paint();
 }
 function begin(input){
  if(button.disabled||active)return;
  releasePending=false;lockDrift();const from=value();active={...input,bounds:glass.getBoundingClientRect()};
  floating.dataset.pressState='held';animate([[0,from],[240,1],[300,1]],300,smooth,true,17);
  if(!texture)prepare();
 }
 function rebound(from){
  if(Math.abs(from)<.001){reset();return}
  floating.dataset.pressState='release';
  const amplitude=Math.max(0,from),peaks=[[0,from]];
  for(const [time,p] of [[250,-.38],[500,.11],[750,-.075],[1000,.038],[1250,-.022],[1500,.008],[1750,0]])peaks.push([time,p*amplitude]);
  animate(peaks,1750,smooth,true);
 }
 function release(){
  if(!active)return;
  active=null;
  // A tap and a long hold reach the same pressed pose. Finger-up queues the
  // return instead of cancelling a tap before its first visible frame.
  if(animation&&animationTarget===1&&!motion?.matches){releasePending=true;floating.dataset.pressState='tap';return}
  rebound(value());
 }
 function prepare(){
  loadTexture().then(async asset=>{
   if(!asset||!ctx)return;texture=asset;lastPressure=NaN;paint();
   const frames=await loadSurfaces(asset);if(!frames)return;preparedSurfaces=frames;lastPressure=NaN;paint();
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
 button.addEventListener('blur',()=>{
  // The recorder can disable its focused button while opening the microphone.
  // That internal blur must not erase a tap whose finger is already released.
  if(button.disabled&&!active&&(releasePending||floating.dataset.pressState==='release'))return;
  reset();
 });window.addEventListener('blur',reset);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset()});motion?.addEventListener?.('change',reset);
 const controls={reset,getPaintState:()=>({pressure:lastPressure,count:drawCount,ms:lastDrawMs}),getState:()=>({...paint(),ready:!!surfaces&&canvas.parentElement===glass,rendering:!!texture&&!!ctx&&canvas.parentElement===glass,buffer:SIZE,source:TEXTURE,opticalSource:surfaces?.[0].optics?OPTICS:null,holding:!!active})};
 root.octiPressure=controls;prepare();return controls;
};
})();
