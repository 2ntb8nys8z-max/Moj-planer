/* Okti listening artwork. Presentation only: the existing recorder owns state. */
(()=>{
'use strict';
const FILES={body:'octi-listening-body.mp4?v=63a63bad76c25c35',head:'octi-listening-head.webp?v=bb333f958242d2fc',background:'octi-listening-background.webp?v=ad256a438de85c9a',fallback:'octi-listening-fallback.webp?v=25ae76619a20d894',poster:'octi-listening-poster.webp?v=c71534ebdd09f60d'};
const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=(position+1.0)*.5;gl_Position=vec4(position,0.0,1.0);}`;
const fragment=`precision highp float;
varying vec2 uv;
uniform sampler2D bodyMap,headMap;
uniform float approach,lag,gesture,clock,phase;
uniform mat3 rotation,inverseRotation;
const float PI=3.14159265359;
float smooth01(float v){return smoothstep(0.0,1.0,v);}
vec2 imageUV(vec2 p){return (clamp(p,vec2(0.0),vec2(543.0))+.5)/544.0;}
vec3 atlasColor(sampler2D map,vec2 p){vec2 t=imageUV(p);return texture2D(map,vec2(t.x*.5,t.y)).rgb;}
float atlasAlpha(sampler2D map,vec2 p){if(p.x<0.0||p.y<0.0||p.x>543.0||p.y>543.0)return 0.0;vec2 t=imageUV(p);return smoothstep(.03,.97,texture2D(map,vec2(.5+t.x*.5,t.y)).r);}
vec2 tiltPoint(vec2 p,float angle,vec2 pivot){float c=cos(angle),s=sin(angle);return mat2(c,s,-s,c)*(p-pivot)+pivot;}
float capsuleDistance(vec2 p){return length(vec2(p.x-272.0,p.y-clamp(p.y,205.0,251.0)));}
float headAlpha(vec2 p){float alpha=atlasAlpha(headMap,p);return mix(alpha,min(alpha,clamp(49.0-capsuleDistance(p),0.0,1.0)),approach);}
float bar(vec2 p,vec2 center,float height){vec2 q=abs(p-center)-vec2(0.0,max(0.0,height*.5-2.9));float d=length(max(q,0.0))+min(max(q.x,q.y),0.0)-2.9;return 1.0-smoothstep(-.55,.55,d);}
float bars(vec2 p){vec3 rest=vec3(.55,.85,.55);vec3 level=vec3(.58,.75,.58)+vec3(.22,.18,.22)*sin(vec3(4.0,3.0,5.0)/4.8*clock*2.0*PI+vec3(0.0,1.5,3.2));level+=.035*sin(clock*2.0*PI/4.8);level=mix(rest,clamp(level,.30,.95),approach);return max(bar(p,vec2(252.0,232.0),53.0*level.x),max(bar(p,vec2(272.0,232.0),53.0*level.y),bar(p,vec2(292.0,232.0),53.0*level.z)));}
float hitCapsule(vec3 o,vec3 d,float cy,bool cylinder){float depth=.5184;vec3 q=o-vec3(0.0,cy,0.0);float aa=d.x*d.x+d.z*d.z/depth+(cylinder?0.0:d.y*d.y);float bb=2.0*(q.x*d.x+q.z*d.z/depth+(cylinder?0.0:q.y*d.y));float cc=q.x*q.x+q.z*q.z/depth-2304.0+(cylinder?0.0:q.y*q.y);float disc=bb*bb-4.0*aa*cc;if(disc<0.0)return 10000.0;float t=(-bb-sqrt(max(disc,0.0)))/(2.0*aa);float y=o.y+t*d.y;if(t<0.0)return 10000.0;if(cylinder&&abs(y)>23.0)return 10000.0;if(!cylinder&&((cy>0.0&&y<23.0)||(cy<0.0&&y> -23.0)))return 10000.0;return t;}
vec4 mantle(vec2 p){vec2 source=p;float baseline=headAlpha(p),alpha=baseline;vec3 color;
 if(gesture>.00001){vec3 origin=inverseRotation*vec3(p-vec2(272.0,228.0),180.0);vec3 direction=inverseRotation*vec3(0.0,0.0,-1.0);float t=min(hitCapsule(origin,direction,0.0,true),min(hitCapsule(origin,direction,23.0,false),hitCapsule(origin,direction,-23.0,false)));float visible=step(t,9999.0);vec3 point=origin+direction*min(t,180.0);if(visible>.5)source=point.xy+vec2(272.0,228.0);float projected=headAlpha(source)*visible;alpha=mix(baseline,projected,smooth01(gesture));color=atlasColor(headMap,source);
  if(visible>.5){vec3 normal=normalize(vec3(point.x,sign(point.y)*max(abs(point.y)-23.0,0.0),point.z/.5184));vec3 world=rotation*normal;vec3 light=normalize(vec3(-.48,-.52,.75));vec3 halfVector=normalize(light+vec3(0.0,0.0,1.0));float diffuse=(.48+.52*max(dot(world,light),0.0))/(.48+.52*max(dot(normal,light),0.0));color*=clamp(diffuse,.72,1.28);float spec=pow(max(dot(world,halfVector),0.0),28.0)-pow(max(dot(normal,halfVector),0.0),28.0);color+=spec*(65.0/255.0);}
 }else color=atlasColor(headMap,source);
 color=mix(clamp(color,0.0,1.0),vec3(1.0),bars(source));return vec4(color,alpha);
}
void main(){float a=approach;vec2 p=vec2(uv.x,1.0-uv.y)*544.0-.5;float wave=2.0*PI*phase/4.8;vec2 breathe=vec2(1.0+.009*sin(wave),1.0+.006*sin(wave+.6));p=(p-vec2(272.0,274.0+1.7*sin(wave)))/breathe+vec2(272.0,274.0);
 // The body stays in its idle coordinates. Only the separate head approaches.
 vec2 armUV=p;float sy=armUV.y;float oldHead=(1.0-smoothstep(50.0,52.0,capsuleDistance(armUV)))*(1.0-smoothstep(290.0,305.0,sy));float armAlpha=atlasAlpha(bodyMap,armUV)*(1.0-oldHead);
 float angle=11.0*PI/180.0*a;vec2 root=vec2(272.0+38.0*a,298.0+134.0*a);vec2 q=tiltPoint(p,angle,root);vec2 headUV=(q-root)/vec2(1.0+1.65*a,1.0+1.16*a)+vec2(272.0,298.0);vec4 head=mantle(headUV);
 float radius=length(p-vec2(272.0,274.0));float edge=clamp((194.0-radius)/1.3,0.0,1.0)*(1.0-smoothstep(180.0,194.0,radius));float alpha=(armAlpha+head.a*(1.0-armAlpha))*edge;vec3 rgb=atlasColor(bodyMap,armUV)*armAlpha*(1.0-head.a)+head.rgb*head.a;gl_FragColor=vec4(rgb*edge,alpha);}`;
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v)};
function matrices(g){
 const angles=[8,-3,-2].map(v=>v*g*Math.PI/180),[y,p,r]=angles,cy=Math.cos(y),sy=Math.sin(y),cp=Math.cos(p),sp=Math.sin(p),cr=Math.cos(r),sr=Math.sin(r);
 const multiply=(a,b)=>a.map((_,i)=>{const row=Math.floor(i/3),col=i%3;return a[row*3]*b[col]+a[row*3+1]*b[3+col]+a[row*3+2]*b[6+col]});
 const m=multiply(multiply([cr,-sr,0,sr,cr,0,0,0,1],[cy,0,sy,0,1,0,-sy,0,cy]),[1,0,0,0,cp,-sp,0,sp,cp]);
 return [new Float32Array([m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]]),new Float32Array(m)];
}
function createRenderer(canvas,video,head){
 const gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});if(!gl||gl.isContextLost()||!gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision)throw Error('WebGL unavailable');
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
 const uniforms=Object.fromEntries(['approach','lag','gesture','clock','phase','rotation','inverseRotation'].map(name=>[name,gl.getUniformLocation(program,name)]));
 const textures=[video,head].map((image,i)=>{const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);if(i)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);gl.uniform1i(gl.getUniformLocation(program,['bodyMap','headMap'][i]),i);return texture});
 return {kind:'webgl',draw(state){const size=Math.max(128,Math.min(384,Math.round(canvas.getBoundingClientRect().width*(devicePixelRatio||1))));if(canvas.width!==size){canvas.width=canvas.height=size;gl.viewport(0,0,size,size)}gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[0]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,video);for(const name of ['approach','lag','gesture','clock','phase'])gl.uniform1f(uniforms[name],state[name]);const [rotation,inverse]=matrices(state.gesture);gl.uniformMatrix3fv(uniforms.rotation,false,rotation);gl.uniformMatrix3fv(uniforms.inverseRotation,false,inverse);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);if(gl.isContextLost())throw Error('WebGL context lost');},destroy(){for(const t of textures)gl.deleteTexture(t);gl.deleteBuffer(buffer);gl.deleteProgram(program);}};
}
function loadImage(src,retry=0){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Artwork unavailable'));image.src=src+(retry?'&retry='+retry:'')})}
// A separate 2D head keeps the listening gesture usable after GPU loss or a
// blocked video. It never scales the complete actor and uses the same artwork.
function createSoftwareRenderer(canvas,video,head,poster){
 const size=256,ctx=canvas.getContext('2d'),body=document.createElement('canvas'),matte=document.createElement('canvas'),headLayer=document.createElement('canvas'),edge=document.createElement('canvas');
 if(!ctx)throw Error('Canvas unavailable');
 for(const c of [body,matte,headLayer,edge])c.width=c.height=size;
 const bodyCtx=body.getContext('2d',{willReadFrequently:true}),matteCtx=matte.getContext('2d',{willReadFrequently:true}),headCtx=headLayer.getContext('2d'),edgeCtx=edge.getContext('2d');
 if(!bodyCtx||!matteCtx||!headCtx||!edgeCtx)throw Error('Canvas unavailable');
 const removeHead=new Float32Array(size*size),fade=edgeCtx.createImageData(size,size);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){const i=y*size+x,px=(x+.5)*544/size,py=(y+.5)*544/size,dist=Math.hypot(px-272,py-Math.max(205,Math.min(251,py)));removeHead[i]=1-(1-smooth((dist-50)/2))*(1-smooth((py-290)/15));fade.data[i*4+3]=255*(1-smooth((Math.hypot(px-272,py-274)-180)/14));}
 edgeCtx.putImageData(fade,0,0);
 function atlas(image,target){
  const w=image.videoWidth||image.naturalWidth||image.width,h=image.videoHeight||image.naturalHeight||image.height;
  target.clearRect(0,0,size,size);target.drawImage(image,0,0,w/2,h,0,0,size,size);
  matteCtx.clearRect(0,0,size,size);matteCtx.drawImage(image,w/2,0,w/2,h,0,0,size,size);
  const rgb=target.getImageData(0,0,size,size),alpha=matteCtx.getImageData(0,0,size,size).data;
  for(let i=0;i<size*size;i++)rgb.data[i*4+3]=255*smooth((alpha[i*4]/255-.03)/.94);
  return rgb;
 }
 headCtx.putImageData(atlas(head,headCtx),0,0);
 let lastTime=-1,lastVideo=false,haveBody=false;
 return {kind:'canvas2d',draw(state){
  const live=state.videoAvailable&&video.readyState>=2&&!video.error;
  if(!haveBody||live!==lastVideo||live&&video.currentTime!==lastTime){
   let pixels;if(live)pixels=atlas(video,bodyCtx);else{bodyCtx.clearRect(0,0,size,size);bodyCtx.drawImage(poster,0,0,size,size);pixels=bodyCtx.getImageData(0,0,size,size);}
   for(let i=0;i<size*size;i++)pixels.data[i*4+3]*=removeHead[i];bodyCtx.putImageData(pixels,0,0);lastTime=video.currentTime;lastVideo=live;haveBody=true;
  }
  const output=Math.max(128,Math.min(256,Math.round(canvas.getBoundingClientRect().width*(devicePixelRatio||1))));if(canvas.width!==output)canvas.width=canvas.height=output;
  ctx.setTransform(output/544,0,0,output/544,0,0);ctx.clearRect(0,0,544,544);ctx.drawImage(body,0,0,544,544);
  const a=state.approach;ctx.save();ctx.translate(272+38*a,298+134*a);ctx.rotate(11*Math.PI/180*a);ctx.scale(1+1.65*a,1+1.16*a);ctx.translate(-272,-298);ctx.drawImage(headLayer,0,0,544,544);
  const rest=[.55,.85,.55],base=[.58,.75,.58],amplitude=[.22,.18,.22],rates=[4,3,5],phases=[0,1.5,3.2];ctx.fillStyle='#fff';
  for(let i=0;i<3;i++){const level=Math.max(.30,Math.min(.95,base[i]+amplitude[i]*Math.sin(rates[i]/4.8*state.clock*2*Math.PI+phases[i])+.035*Math.sin(state.clock*2*Math.PI/4.8))),height=53*(rest[i]*(1-a)+level*a);ctx.beginPath();ctx.roundRect(249.1+i*20,232-height/2,5.8,height,2.9);ctx.fill();}
  ctx.restore();ctx.globalCompositeOperation='destination-in';ctx.drawImage(edge,0,0,544,544);ctx.globalCompositeOperation='source-over';
 },destroy(){for(const c of [body,matte,headLayer,edge])c.width=c.height=1;}};
}
window.createOctiListeningArtwork=function(root,floating,motion){
 const layer=document.createElement('span');layer.className='octi-listening-media';layer.setAttribute('aria-hidden','true');
 let canvas=document.createElement('canvas');canvas.className='octi-listening-canvas';
 const fallback=document.createElement('img');fallback.className='octi-listening-fallback';fallback.alt='';fallback.src='octi-actor-poster.webp?v=9b20c4f5b0d17977';
 layer.append(canvas,fallback);floating.append(layer);
 const video=document.createElement('video');video.muted=video.defaultMuted=true;video.loop=video.playsInline=true;video.preload='auto';video.setAttribute('muted','');video.setAttribute('playsinline','');video.className='octi-listening-source';video.setAttribute('aria-hidden','true');layer.append(video);
 let visible=false,isRecording=false,ready=false,rendering=false,preparing=null,renderer=null,raf=0,lastFrame=0,lastDraw=0,pose=0,follow=0,headTurn=0,recordStart=0,starting=false,lastVideoTime=-1,lastProgress=0,reason='';
 let destroyed=false,generation=0,playGeneration=0,assets=null,software=false,mediaBlocked=false,playPending=false,retryAt=0,retries=0,mediaRetryAt=0,mediaRetries=0,mediaReloads=0,reloadMedia=false,loadingSince=0,lastError=null;
 const delays=[350,1200,3000];
 let transition={from:0,to:0,start:0,duration:720},turnTransition=null;
 const now=()=>performance.now();
 const value=t=>transition.from+(transition.to-transition.from)*smooth((t-transition.start)/transition.duration);
 function staticFrame(){const src=motion?.matches?'octi-actor-poster.webp?v=9b20c4f5b0d17977':'octi-actor-idle.webp?v=d571dd888f44cb66';if(fallback.getAttribute('src')!==src)fallback.src=src;layer.classList.add('is-active','is-fallback');layer.classList.remove('is-rendered');rendering=false;}
 function remember(error,stage){reason=error?.message||'Artwork unavailable';lastError={stage,name:error?.name||'Error',message:reason,mediaCode:video.error?.code||0,at:Date.now()};}
 function stop(){if(raf)cancelAnimationFrame(raf);raf=0;playGeneration++;playPending=false;video.pause();lastFrame=0;starting=false;}
 function releaseRenderer(){renderer?.destroy();renderer=null;ready=false;}
 function fail(error,stage='artwork'){remember(error,stage);generation++;preparing=null;stop();releaseRenderer();retryAt=retries<delays.length?now()+delays[retries++]:Infinity;if(visible)staticFrame();}
 function lost(event){event.preventDefault();if(!destroyed&&visible)useSoftware(Error('WebGL context lost'),'context-lost');}
 function replaceCanvas(){canvas.removeEventListener('webglcontextlost',lost);const next=document.createElement('canvas');next.className='octi-listening-canvas';canvas.replaceWith(next);canvas=next;canvas.addEventListener('webglcontextlost',lost);}
 function source(reload=false){if(video.getAttribute('src')?.split('&retry=')[0]!==FILES.body)video.src=FILES.body;else if(reload&&(video.error||reloadMedia)){video.src=FILES.body+'&retry='+(++mediaReloads);reloadMedia=false;}}
 function playbackFailed(error,stage){if(destroyed||!visible||motion?.matches)return;remember(error,stage);mediaBlocked=true;if(stage==='video-stalled')reloadMedia=true;mediaRetryAt=mediaRetries<delays.length?now()+delays[mediaRetries++]:Infinity;if(renderer?.kind==='webgl'||!software)useSoftware(error,stage);}
 function play(){if(destroyed||!visible||motion?.matches||playPending||mediaBlocked&&now()<mediaRetryAt)return;source(true);const token=++playGeneration;playPending=true;
  try{Promise.resolve(video.play()).then(()=>{if(token!==playGeneration||destroyed)return;playPending=false;mediaBlocked=false;lastProgress=now();},error=>{if(token!==playGeneration||destroyed)return;playPending=false;if(error?.name!=='AbortError')playbackFailed(error,'video-play');});}catch(error){playPending=false;playbackFailed(error,'video-play');}
 }
 function useSoftware(error,stage){if(destroyed)return;remember(error,stage);software=true;generation++;preparing=null;stop();releaseRenderer();retryAt=0;replaceCanvas();if(visible&&!motion?.matches){staticFrame();prepare();}}
 function prepare(){if(preparing||destroyed||!visible||motion?.matches||now()<retryAt)return preparing;const token=++generation;loadingSince=now();source();
  const task=Promise.resolve().then(async()=>{try{
   if(!assets){const head=await loadImage(FILES.head,lastError?token:0);if(token!==generation||destroyed)return;assets={head,poster:null};}
   if(software){if(!assets.poster)assets.poster=await loadImage('octi-actor-poster.webp?v=9b20c4f5b0d17977',lastError?token:0);if(token!==generation||destroyed)return;renderer=createSoftwareRenderer(canvas,video,assets.head,assets.poster);}
   else{try{renderer=createRenderer(canvas,video,assets.head);}catch(error){remember(error,'webgl-init');software=true;replaceCanvas();if(!assets.poster)assets.poster=await loadImage('octi-actor-poster.webp?v=9b20c4f5b0d17977',token);if(token!==generation||destroyed)return;renderer=createSoftwareRenderer(canvas,video,assets.head,assets.poster);}}
   if(token!==generation||destroyed){renderer?.destroy();return;}ready=true;retryAt=0;retries=0;preparing=null;if(visible&&!motion?.matches)start();
  }catch(error){if(token===generation&&!destroyed)fail(error,'artwork-init');}finally{if(token===generation)preparing=null;}});preparing=task;return task;
 }
 function animate(t){raf=0;if(!visible||destroyed||!ready||motion?.matches)return;
  if(renderer.kind==='canvas2d'||video.readyState>=2){
   if(starting){lastFrame=t;lastProgress=t;starting=false;if(isRecording){transition.start=t;recordStart=t;}}
   const elapsed=lastFrame?t-lastFrame:0;if(elapsed>50){transition.start+=elapsed-50;recordStart+=elapsed-50;if(turnTransition)turnTransition.start+=elapsed-50;}
   pose=value(t);headTurn=turnTransition?turnTransition.from*(1-smooth((t-turnTransition.start)/650)):(isRecording?smooth((t-recordStart-550)/900):0);
   const dt=lastFrame?Math.min(.1,(t-lastFrame)/1000):1/30;lastFrame=t;follow+=(pose-follow)*(1-Math.exp(-dt/.07));
   if(t-lastDraw>=30){try{renderer.draw({approach:pose,lag:follow,gesture:headTurn,clock:t/1000,phase:video.currentTime,videoAvailable:!mediaBlocked});if(!rendering){layer.classList.add('is-active','is-rendered');layer.classList.remove('is-fallback')}rendering=true;reason='';lastDraw=t;}catch(error){if(renderer.kind==='webgl')useSoftware(error,'webgl-draw');else fail(error,'canvas-draw');return;}}
  }
  if(video.currentTime!==lastVideoTime){lastVideoTime=video.currentTime;lastProgress=t;}
  if(!mediaBlocked&&t-lastProgress>5000){playPending=false;playbackFailed(Error('Animation stalled'),'video-stalled');if(!ready)return;}
  if(mediaBlocked&&t>=mediaRetryAt){playPending=false;play();}
  raf=requestAnimationFrame(animate);
 }
 function start(){if(!ready||!visible||destroyed||motion?.matches||raf)return;starting=true;lastProgress=now();play();raf=requestAnimationFrame(animate);}
 function resetRetries(){retryAt=mediaRetryAt=0;retries=mediaRetries=0;}
 function setRecording(next){next=!!next;if(next===isRecording)return;const t=now();pose=value(t);isRecording=next;transition={from:pose,to:next?1:0,start:t,duration:next?720:700};if(next){recordStart=t;turnTransition=null;resetRetries();}else turnTransition={from:headTurn,start:t};}
 function update(options){if(destroyed)return;const returning=!visible&&!!options.visible;visible=!!options.visible;if(returning)resetRetries();setRecording(options.isRecording);if(!visible){stop();rendering=false;isRecording=false;pose=follow=headTurn=0;transition={from:0,to:0,start:now(),duration:700};layer.classList.remove('is-active');return;}
  layer.classList.add('is-active');if(motion?.matches){stop();staticFrame();return;}if(preparing&&now()-loadingSince>5000)fail(Error('Artwork load timed out'),'artwork-timeout');if(!ready){staticFrame();prepare();}else start();
 }
 function resume(){if(destroyed||!visible||motion?.matches)return;resetRetries();source(true);if(!ready)prepare();play();if(ready)start();}
 function visibility(){if(document.hidden)stop();else resume();}
 const videoError=()=>playbackFailed(Error('Video unavailable'),'video-error');
 video.addEventListener('error',videoError);canvas.addEventListener('webglcontextlost',lost);root.addEventListener('pointerdown',resume,{passive:true});document.addEventListener('visibilitychange',visibility);window.addEventListener('pageshow',resume);window.addEventListener('online',resume);
 return {update,setRecording,getState:()=>({isRecording,approach:pose,gesture:headTurn,rendering,fallback:layer.classList.contains('is-fallback'),renderer:renderer?.kind||'image',ready,reason,lastError,retries,mediaRetries}),destroy(){destroyed=true;generation++;preparing=null;stop();releaseRenderer();canvas.removeEventListener('webglcontextlost',lost);video.removeEventListener('error',videoError);root.removeEventListener('pointerdown',resume);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('pageshow',resume);window.removeEventListener('online',resume);}};
};
})();
