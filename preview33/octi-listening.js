/* Okti listening artwork. Presentation only: the existing recorder owns state. */
(()=>{
'use strict';
const FILES={body:'octi-listening-body.mp4?v=f39db801c0c6475d',head:'octi-listening-head.webp?v=bb333f958242d2fc',background:'octi-listening-background.webp?v=ad256a438de85c9a',fallback:'octi-listening-fallback.webp?v=25ae76619a20d894',poster:'octi-listening-poster.webp?v=c71534ebdd09f60d'};
const vertex=`attribute vec2 position;varying vec2 uv;void main(){uv=(position+1.0)*.5;gl_Position=vec4(position,0.0,1.0);}`;
const fragment=`precision highp float;
varying vec2 uv;
uniform sampler2D bodyMap,headMap,backgroundMap;
uniform float approach,lag,gesture,clock,phase;
uniform mat3 rotation,inverseRotation;
const float PI=3.14159265359;
float smooth01(float v){return smoothstep(0.0,1.0,v);}
vec2 imageUV(vec2 p){return (clamp(p,vec2(0.0),vec2(543.0))+.5)/544.0;}
vec3 atlasColor(sampler2D map,vec2 p){vec2 t=imageUV(p);return texture2D(map,vec2(t.x*.5,t.y)).rgb;}
float atlasAlpha(sampler2D map,vec2 p){if(p.x<0.0||p.y<0.0||p.x>543.0||p.y>543.0)return 0.0;vec2 t=imageUV(p);return texture2D(map,vec2(.5+t.x*.5,t.y)).r;}
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
void main(){float a=approach;vec2 p=vec2(uv.x,1.0-uv.y)*544.0-.5;float wave=2.0*PI*phase/4.8;vec2 breathe=vec2(1.0+.009*sin(wave),1.0+.006*sin(wave+.6));p=(p-vec2(272.0,274.0+1.7*sin(wave)))/breathe+vec2(272.0,274.0);vec3 background=texture2D(backgroundMap,imageUV(p)).rgb;float camera=1.0+.40*a;vec2 view=(p-vec2(272.0,274.0))/camera+vec2(272.0,274.0);float angle=11.0*PI/180.0*a;vec2 rear=vec2(272.0+12.0*a,298.0+62.0*a);vec2 q=tiltPoint(view,angle*.55,rear);float sx=(q.x-rear.x)/(1.0+.06*a+.03*lag)+272.0;float arch=27.0*a*pow(clamp(abs(sx-272.0)/150.0,0.0,1.2),1.6);float sy=(q.y-rear.y+arch)/(1.0-.05*a)+298.0;float tip=pow(clamp(length(vec2(sx-272.0,sy-298.0))/135.0,0.0,1.0),1.5);float sweep=7.0*(a-lag)+3.5*a*sin(clock*2.0*PI/2.4);sx-=sign(sx-272.0)*tip*sweep;sy-=tip*5.0*lag;vec2 armUV=vec2(sx,sy);float oldHead=(1.0-smoothstep(50.0,52.0,capsuleDistance(armUV)))*(1.0-smoothstep(290.0,305.0,sy));float margin=(1.0-smoothstep(60.0,67.0,abs(sx-272.0)))*(1.0-smoothstep(292.0,310.0,sy));float armAlpha=atlasAlpha(bodyMap,armUV)*(1.0-max(oldHead,a*margin));vec3 scene=mix(background,atlasColor(bodyMap,armUV),armAlpha);vec2 root=vec2(272.0+38.0*a/camera,274.0+(298.0+134.0*a-274.0)/camera);q=tiltPoint(view,angle,root);vec2 headUV=(q-root)/(vec2(1.0+1.65*a,1.0+1.16*a)/camera)+vec2(272.0,298.0);vec4 head=mantle(headUV);scene=mix(scene,head.rgb,head.a);float radius=length(p-vec2(272.0,274.0));float inside=clamp((194.0-radius)/1.3,0.0,1.0);scene=mix(background,scene,inside);scene=mix(scene,background,smoothstep(180.0,194.0,radius));gl_FragColor=vec4(scene,1.0);}`;
const smooth=v=>{v=Math.max(0,Math.min(1,v));return v*v*(3-2*v)};
function matrices(g){
 const angles=[8,-3,-2].map(v=>v*g*Math.PI/180),[y,p,r]=angles,cy=Math.cos(y),sy=Math.sin(y),cp=Math.cos(p),sp=Math.sin(p),cr=Math.cos(r),sr=Math.sin(r);
 const multiply=(a,b)=>a.map((_,i)=>{const row=Math.floor(i/3),col=i%3;return a[row*3]*b[col]+a[row*3+1]*b[3+col]+a[row*3+2]*b[6+col]});
 const m=multiply(multiply([cr,-sr,0,sr,cr,0,0,0,1],[cy,0,sy,0,1,0,-sy,0,cy]),[1,0,0,0,cp,-sp,0,sp,cp]);
 return [new Float32Array([m[0],m[3],m[6],m[1],m[4],m[7],m[2],m[5],m[8]]),new Float32Array(m)];
}
function createRenderer(canvas,video,head,background){
 const gl=canvas.getContext('webgl',{alpha:false,antialias:false,preserveDrawingBuffer:true,powerPreference:'low-power'});if(!gl||!gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT)?.precision)throw Error('WebGL unavailable');
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s};
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const position=gl.getAttribLocation(program,'position');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
 const uniforms=Object.fromEntries(['approach','lag','gesture','clock','phase','rotation','inverseRotation'].map(name=>[name,gl.getUniformLocation(program,name)]));
 const textures=[video,head,background].map((image,i)=>{const texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);if(i)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,image);gl.uniform1i(gl.getUniformLocation(program,['bodyMap','headMap','backgroundMap'][i]),i);return texture});
 return {draw(state){const size=Math.max(128,Math.min(384,Math.round(canvas.getBoundingClientRect().width*(devicePixelRatio||1))));if(canvas.width!==size){canvas.width=canvas.height=size;gl.viewport(0,0,size,size)}gl.useProgram(program);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,textures[0]);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGB,gl.RGB,gl.UNSIGNED_BYTE,video);for(const name of ['approach','lag','gesture','clock','phase'])gl.uniform1f(uniforms[name],state[name]);const [rotation,inverse]=matrices(state.gesture);gl.uniformMatrix3fv(uniforms.rotation,false,rotation);gl.uniformMatrix3fv(uniforms.inverseRotation,false,inverse);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);if(gl.isContextLost())throw Error('WebGL context lost');},destroy(){gl.getExtension('WEBGL_lose_context')?.loseContext();}};
}
function loadImage(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(Error('Artwork unavailable'));image.src=src})}
window.createOctiListeningArtwork=function(root,floating,motion,idleVideo){
 const layer=document.createElement('span');layer.className='octi-listening-media';layer.setAttribute('aria-hidden','true');const canvas=document.createElement('canvas'),fallback=document.createElement('img');canvas.className='octi-listening-canvas';fallback.className='octi-listening-fallback';fallback.alt='';fallback.draggable=false;layer.append(canvas,fallback);floating.append(layer);
 const video=document.createElement('video');video.className='octi-listening-source';video.muted=video.defaultMuted=true;video.loop=video.playsInline=true;video.preload='none';video.setAttribute('muted','');video.setAttribute('playsinline','');video.tabIndex=-1;video.setAttribute('aria-hidden','true');layer.append(video);
 let isRecording=false,visible=false,rendering=false,failed=false,ready=false,preparing=null,renderer=null,raf=0,hideTimer=0,recordStart=0,lastDraw=0,lastFrame=0,lastProgress=0,lastVideoTime=-1,pose=0,headTurn=0,follow=0;
 let starting=false,reason='',transition={from:0,to:0,start:0,duration:720};
 let turnTransition=null;
 const now=()=>performance.now();
 function value(t){const p=Math.max(0,Math.min(1,(t-transition.start)/transition.duration)),e=transition.to?1-(1-p)**3:smooth(p);return transition.from+(transition.to-transition.from)*e;}
 function turnValue(t){if(turnTransition){const p=smooth((t-turnTransition.start)/650);return turnTransition.from*(1-p)}return smooth((t-recordStart-550)/900);}
 function hide(){clearTimeout(hideTimer);layer.classList.remove('is-active','is-fallback','is-rendered');rendering=starting=false;if(!isRecording)pose=headTurn=follow=0;if(raf)cancelAnimationFrame(raf);raf=0;video.pause();if(fallback.hasAttribute('src'))fallback.removeAttribute('src');}
 function showFallback(error=true){if(error!==false)failed=true;rendering=starting=false;video.pause();if(raf)cancelAnimationFrame(raf);raf=0;if(!visible)return;if(isRecording){const src=motion?.matches?FILES.poster:FILES.fallback;if(fallback.getAttribute('src')!==src)fallback.src=src;layer.classList.add('is-active','is-fallback');layer.classList.remove('is-rendered')}else{layer.classList.remove('is-active');hideTimer=setTimeout(hide,700)}}
 fallback.onerror=()=>{if(fallback.src&&!fallback.src.includes(FILES.poster))fallback.src=FILES.poster;else layer.classList.remove('is-active')};
 async function prepare(){
  if(preparing||ready)return preparing;
  preparing=(async()=>{try{const [head,background]=await Promise.all([loadImage(FILES.head),loadImage(FILES.background)]);renderer=createRenderer(canvas,video,head,background);ready=true;if(isRecording&&visible)start();}catch(error){reason=error?.message||'Artwork unavailable';showFallback()}})();
  return preparing;
 }
 function animate(t){raf=0;if(!visible||motion?.matches){hide();return}pose=value(t);headTurn=turnValue(t);const dt=lastFrame?Math.min(.1,(t-lastFrame)/1000):1/30;lastFrame=t;follow+=(pose-follow)*(1-Math.exp(-dt/.07));if(!isRecording&&pose<.0001){pose=headTurn=follow=0;try{if(Number.isFinite(video.currentTime)&&idleVideo.readyState>=1)idleVideo.currentTime=video.currentTime}catch(_){}hide();return}
  if(video.currentTime!==lastVideoTime){lastVideoTime=video.currentTime;lastProgress=t}
  if(t-lastProgress>2200){showFallback();return}
  if(video.readyState>=2&&t-lastDraw>=30){try{renderer.draw({approach:pose,lag:follow,gesture:headTurn,clock:t/1000,phase:video.currentTime});layer.classList.add('is-active','is-rendered');layer.classList.remove('is-fallback');rendering=true;starting=false;lastDraw=t}catch(error){reason=error?.message||'Rendering unavailable';showFallback();return}}
  raf=requestAnimationFrame(animate);
 }
 function start(){if(!ready||!renderer||!visible||starting)return;if(motion?.matches||failed){showFallback(!motion?.matches);return}if(!video.hasAttribute('src')){video.src=FILES.body;try{if(idleVideo.readyState>=1)video.currentTime=idleVideo.currentTime%4.8}catch(_){}}if(!rendering&&isRecording&&pose===0){transition={from:0,to:1,start:now(),duration:720};recordStart=transition.start;turnTransition=null}starting=true;lastProgress=now();lastVideoTime=video.currentTime;Promise.resolve(video.play()).then(()=>{if(!visible||(!isRecording&&!rendering))video.pause()}).catch(error=>{starting=false;if(error?.name==='AbortError'||(!isRecording&&!rendering))return;reason=error?.message||'Video unavailable';showFallback()});if(!raf)raf=requestAnimationFrame(animate)}
 function setRecording(next){next=!!next;if(next===isRecording)return;const t=now();pose=value(t);headTurn=turnValue(t);isRecording=next;clearTimeout(hideTimer);transition={from:pose,to:next?1:0,start:t,duration:next?720:700};if(next){recordStart=t;turnTransition=null}else turnTransition={from:headTurn,start:t};if(!visible)return;if(motion?.matches||failed){showFallback(!motion?.matches);return}if(next){prepare();if(ready)start()}else if(ready&&rendering){if(!raf)raf=requestAnimationFrame(animate)}else hide();}
 function update(options){visible=!!options.visible;if(!visible){setRecording(false);pose=headTurn=follow=0;transition={from:0,to:0,start:now(),duration:700};hide();return}if(options.opening)prepare();setRecording(options.isRecording);if(isRecording&&(motion?.matches||failed))showFallback(!motion?.matches);else if(isRecording&&ready&&!rendering)start();}
 video.addEventListener('error',showFallback);canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();showFallback()});root.addEventListener('pointerdown',()=>{if(visible)prepare()},{passive:true});
 return {update,setRecording,getState:()=>({isRecording,approach:pose,gesture:headTurn,rendering,fallback:layer.classList.contains('is-fallback'),ready,reason}),destroy(){hide();renderer?.destroy()}};
};
})();
