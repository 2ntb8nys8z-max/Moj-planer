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
// Approved coupled pose from 058ddbf (33.239), before the 33.307 geometry change.
void main(){float a=approach;vec2 p=vec2(uv.x,1.0-uv.y)*544.0-.5;float wave=2.0*PI*phase/4.8;vec2 breathe=vec2(1.0+.009*sin(wave),1.0+.006*sin(wave+.6));p=(p-vec2(272.0,274.0+1.7*sin(wave)))/breathe+vec2(272.0,274.0);float camera=1.0+.40*a;vec2 view=(p-vec2(272.0,274.0))/camera+vec2(272.0,274.0);float angle=11.0*PI/180.0*a;vec2 rear=vec2(272.0+12.0*a,298.0+62.0*a);vec2 q=tiltPoint(view,angle*.55,rear);float sx=(q.x-rear.x)/(1.0+.06*a+.03*lag)+272.0;float arch=27.0*a*pow(clamp(abs(sx-272.0)/150.0,0.0,1.2),1.6);float sy=(q.y-rear.y+arch)/(1.0-.05*a)+298.0;float tip=pow(clamp(length(vec2(sx-272.0,sy-298.0))/135.0,0.0,1.0),1.5);float sweep=7.0*(a-lag)+3.5*a*sin(clock*2.0*PI/2.4);sx-=sign(sx-272.0)*tip*sweep;sy-=tip*5.0*lag;vec2 armUV=vec2(sx,sy);float oldHead=(1.0-smoothstep(50.0,52.0,capsuleDistance(armUV)))*(1.0-smoothstep(290.0,305.0,sy));float margin=(1.0-smoothstep(60.0,67.0,abs(sx-272.0)))*(1.0-smoothstep(292.0,310.0,sy));float armAlpha=atlasAlpha(bodyMap,armUV)*(1.0-max(oldHead,a*margin));vec2 root=vec2(272.0+38.0*a/camera,274.0+(298.0+134.0*a-274.0)/camera);q=tiltPoint(view,angle,root);vec2 headUV=(q-root)/(vec2(1.0+1.65*a,1.0+1.16*a)/camera)+vec2(272.0,298.0);vec4 head=mantle(headUV);float radius=length(p-vec2(272.0,274.0));float inside=clamp((194.0-radius)/1.3,0.0,1.0);float alpha=(armAlpha+head.a*(1.0-armAlpha))*inside*(1.0-smoothstep(180.0,194.0,radius));vec3 rgb=atlasColor(bodyMap,armUV)*armAlpha*(1.0-head.a)+head.rgb*head.a;gl_FragColor=vec4(rgb*inside*(1.0-smoothstep(180.0,194.0,radius)),alpha);}`;
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
// CPU evaluation of the same approved pose and capsule used by the GPU. This
// keeps the historical silhouette when iOS cannot use WebGL or decode video.
function createSoftwareRenderer(canvas,video,head,poster){
 const ctx=canvas.getContext('2d'),staging=document.createElement('canvas'),read=staging.getContext('2d',{willReadFrequently:true});
 if(!ctx||!read)throw Error('Canvas unavailable');
 function capture(image,atlas){const w=image.videoWidth||image.naturalWidth||image.width||768,h=image.videoHeight||image.naturalHeight||image.height||384;staging.width=w;staging.height=h;read.clearRect(0,0,w,h);read.drawImage(image,0,0,w,h);return {data:read.getImageData(0,0,w,h).data,w,h,atlas};}
 const headMap=capture(head,true),posterMap=capture(poster,false);let bodyMap=posterMap,lastTime=-1,lastLive=false,output=null,coordinates=null;
 const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 function sample(map,x,y,out){
  const valid=x>=0&&y>=0&&x<=543&&y<=543,u=(clamp(x,0,543)+.5)/544,v=(clamp(y,0,543)+.5)/544;
  const fx=clamp(u*(map.atlas?map.w/2:map.w)-.5,0,map.w-1),fy=clamp(v*map.h-.5,0,map.h-1),ix=Math.floor(fx),iy=Math.floor(fy),jx=Math.min(ix+1,map.w-1),jy=Math.min(iy+1,map.h-1),dx=fx-ix,dy=fy-iy;
  const weights=[(1-dx)*(1-dy),dx*(1-dy),(1-dx)*dy,dx*dy],indices=[(iy*map.w+ix)*4,(iy*map.w+jx)*4,(jy*map.w+ix)*4,(jy*map.w+jx)*4],d=map.data;
  for(let c=0;c<3;c++)out[c]=d[indices[0]+c]*weights[0]+d[indices[1]+c]*weights[1]+d[indices[2]+c]*weights[2]+d[indices[3]+c]*weights[3];
  const offset=map.atlas?map.w*2:3;let alpha=(d[indices[0]+offset]*weights[0]+d[indices[1]+offset]*weights[1]+d[indices[2]+offset]*weights[2]+d[indices[3]+offset]*weights[3])/255;
  out[3]=valid?(map.atlas?smooth((alpha-.03)/.94):alpha):0;
 }
 const bodyPixel=new Float64Array(4),headPixel=new Float64Array(4),projected=new Float64Array(4);
 const capsule=(x,y)=>Math.hypot(x-272,y-clamp(y,205,251));
 function headSample(x,y,a,out){sample(headMap,x,y,out);out[3]=out[3]*(1-a)+Math.min(out[3],clamp(49-capsule(x,y),0,1))*a;}
 function hit(ox,oy,oz,dx,dy,dz,cy,cylinder){
  const y=oy-cy,aa=dx*dx+dz*dz/.5184+(cylinder?0:dy*dy),bb=2*(ox*dx+oz*dz/.5184+(cylinder?0:y*dy)),cc=ox*ox+oz*oz/.5184-2304+(cylinder?0:y*y),disc=bb*bb-4*aa*cc;
  if(disc<0)return 10000;const t=(-bb-Math.sqrt(Math.max(disc,0)))/(2*aa),py=oy+t*dy;
  return t<0||cylinder&&Math.abs(py)>23||!cylinder&&(cy>0&&py<23||cy<0&&py> -23)?10000:t;
 }
 const lightLength=Math.hypot(-.48,-.52,.75),lx=-.48/lightLength,ly=-.52/lightLength,lz=.75/lightLength,halfLength=Math.hypot(lx,ly,lz+1),vx=lx/halfLength,vy=ly/halfLength,vz=(lz+1)/halfLength;
 return {kind:'canvas2d',draw(state){
  const live=state.videoAvailable&&video.readyState>=2&&!video.error;
  if(live&&(!lastLive||video.currentTime!==lastTime)){bodyMap=capture(video,true);lastTime=video.currentTime;}else if(!live)bodyMap=posterMap;lastLive=live;
  const size=Math.max(128,Math.min(256,Math.round(canvas.getBoundingClientRect().width*(devicePixelRatio||1))));
  if(!output||canvas.width!==size){canvas.width=canvas.height=size;output=ctx.createImageData(size,size);coordinates=Float64Array.from({length:size},(_,i)=>(i+.5)*544/size-.5);}else output.data.fill(0);
  const a=state.approach,lag=state.lag,g=state.gesture,wave=2*Math.PI*state.phase/4.8,bx=1+.009*Math.sin(wave),by=1+.006*Math.sin(wave+.6),bob=1.7*Math.sin(wave),camera=1+.40*a,angle=11*Math.PI/180*a,ca=Math.cos(angle),sa=Math.sin(angle),cb=Math.cos(angle*.55),sb=Math.sin(angle*.55),rearX=272+12*a,rearY=298+62*a,rootX=272+38*a/camera,rootY=274+(298+134*a-274)/camera,sweep=7*(a-lag)+3.5*a*Math.sin(state.clock*2*Math.PI/2.4),m=matrices(g)[1],dx=-m[6],dy=-m[7],dz=-m[8],blend=smooth(g),levels=[.55,.85,.55].map((rest,i)=>rest*(1-a)+clamp([.58,.75,.58][i]+[.22,.18,.22][i]*Math.sin([4,3,5][i]/4.8*state.clock*2*Math.PI+[0,1.5,3.2][i])+.035*Math.sin(state.clock*2*Math.PI/4.8),.30,.95)*a);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
   const px=(coordinates[x]-272)/bx+272,py=(coordinates[y]-274-bob)/by+274,radius=Math.hypot(px-272,py-274),edge=clamp((194-radius)/1.3,0,1)*(1-smooth((radius-180)/14));if(!edge)continue;
   const viewX=(px-272)/camera+272,viewY=(py-274)/camera+274,rx=viewX-rearX,ry=viewY-rearY;
   let sx=(cb*rx-sb*ry)/(1+.06*a+.03*lag)+272,sy=(sb*rx+cb*ry+27*a*Math.pow(clamp(Math.abs(sx-272)/150,0,1.2),1.6))/(1-.05*a)+298;
   const tip=Math.pow(clamp(Math.hypot(sx-272,sy-298)/135,0,1),1.5);sx-=Math.sign(sx-272)*tip*sweep;sy-=tip*5*lag;sample(bodyMap,sx,sy,bodyPixel);
   const oldHead=(1-smooth((capsule(sx,sy)-50)/2))*(1-smooth((sy-290)/15)),margin=(1-smooth((Math.abs(sx-272)-60)/7))*(1-smooth((sy-292)/18)),armAlpha=bodyPixel[3]*(1-Math.max(oldHead,a*margin)),hx=(ca*(viewX-rootX)-sa*(viewY-rootY))/((1+1.65*a)/camera)+272,hy=(sa*(viewX-rootX)+ca*(viewY-rootY))/((1+1.16*a)/camera)+298;
   let headAlpha=0,red=0,green=0,blue=0,sourceX=hx,sourceY=hy;
   if(hx>180&&hx<365&&hy>130&&hy<345){
    headSample(hx,hy,a,headPixel);headAlpha=headPixel[3];red=headPixel[0];green=headPixel[1];blue=headPixel[2];
    if(g>.00001){
     const ox=m[0]*(hx-272)+m[3]*(hy-228)+m[6]*180,oy=m[1]*(hx-272)+m[4]*(hy-228)+m[7]*180,oz=m[2]*(hx-272)+m[5]*(hy-228)+m[8]*180,t=Math.min(hit(ox,oy,oz,dx,dy,dz,0,true),hit(ox,oy,oz,dx,dy,dz,23,false),hit(ox,oy,oz,dx,dy,dz,-23,false)),visible=t<=9999,pointX=ox+dx*Math.min(t,180),pointY=oy+dy*Math.min(t,180),pointZ=oz+dz*Math.min(t,180);
     if(visible){sourceX=pointX+272;sourceY=pointY+228;}headSample(sourceX,sourceY,a,projected);headAlpha=headAlpha*(1-blend)+(visible?projected[3]:0)*blend;red=projected[0];green=projected[1];blue=projected[2];
     if(visible){
      let nx=pointX,ny=Math.sign(pointY)*Math.max(Math.abs(pointY)-23,0),nz=pointZ/.5184;const length=Math.hypot(nx,ny,nz);nx/=length;ny/=length;nz/=length;
      const wx=m[0]*nx+m[1]*ny+m[2]*nz,wy=m[3]*nx+m[4]*ny+m[5]*nz,wz=m[6]*nx+m[7]*ny+m[8]*nz,diffuse=clamp((.48+.52*Math.max(wx*lx+wy*ly+wz*lz,0))/(.48+.52*Math.max(nx*lx+ny*ly+nz*lz,0)),.72,1.28),spec=(Math.pow(Math.max(wx*vx+wy*vy+wz*vz,0),28)-Math.pow(Math.max(nx*vx+ny*vy+nz*vz,0),28))*65;
      red=red*diffuse+spec;green=green*diffuse+spec;blue=blue*diffuse+spec;
     }
    }
    let bars=0;for(let i=0;i<3;i++){const qx=Math.abs(sourceX-(252+i*20));if(qx>4)continue;const qy=Math.abs(sourceY-232)-Math.max(0,53*levels[i]/2-2.9),distance=Math.hypot(qx,Math.max(qy,0))-2.9;bars=Math.max(bars,1-smooth((distance+.55)/1.1));}
    red=clamp(red,0,255)*(1-bars)+255*bars;green=clamp(green,0,255)*(1-bars)+255*bars;blue=clamp(blue,0,255)*(1-bars)+255*bars;
   }
   const opacity=armAlpha+headAlpha*(1-armAlpha);if(!opacity)continue;const q=(y*size+x)*4,bodyWeight=armAlpha*(1-headAlpha);
   output.data[q]=(bodyPixel[0]*bodyWeight+red*headAlpha)/opacity;output.data[q+1]=(bodyPixel[1]*bodyWeight+green*headAlpha)/opacity;output.data[q+2]=(bodyPixel[2]*bodyWeight+blue*headAlpha)/opacity;output.data[q+3]=255*opacity*edge;
  }
  ctx.putImageData(output,0,0);
 },destroy(){staging.width=staging.height=1;bodyMap=null;output=null;coordinates=null;}};
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
