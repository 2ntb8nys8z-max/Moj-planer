// Standalone preview: the approved raster artwork, bound to eight joint chains.
window.createOktiRig=async function(canvas,chains,textureUrl){
 const SIZE=1254,PAD=0,GRID=112;
 const gl=canvas.getContext('webgl',{alpha:true,antialias:true,premultipliedAlpha:true,preserveDrawingBuffer:true});
 if(!gl)throw Error('This preview requires WebGL.');
 const smooth=(a,b,x)=>{const u=Math.max(0,Math.min(1,(x-a)/(b-a)));return u*u*(3-2*u)};
 const bones=[],arms=[];
 chains.forEach((chain,armIndex)=>{
  const points=chain.points,list=[];let total=0,lastAngle=null;
  for(let i=0;i<points.length-1;i++){
   const a=points[i],b=points[i+1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
   let angle=Math.atan2(dy,dx);
   if(lastAngle!==null){while(angle-lastAngle>Math.PI)angle-=2*Math.PI;while(angle-lastAngle<-Math.PI)angle+=2*Math.PI}
   const bone={a,b,dx,dy,length,angle,arc:total,armIndex,index:bones.length};
   bones.push(bone);list.push(bone);total+=length;lastAngle=angle;
  }
  const reference=list.find(b=>(b.arc+b.length*.5)/total>=.48)?.angle||list[0].angle;
  for(const bone of list){bone.progress=(bone.arc+bone.length*.5)/total;bone.curl=(bone.angle-reference)*smooth(.48,.9,bone.progress)}
  arms.push({bones:list,total,phase:armIndex*.67});
 });
 const projection=(x,y,bone)=>{
  const u=Math.max(0,Math.min(1,((x-bone.a[0])*bone.dx+(y-bone.a[1])*bone.dy)/(bone.length*bone.length)));
  const dx=x-bone.a[0]-u*bone.dx,dy=y-bone.a[1]-u*bone.dy;return dx*dx+dy*dy;
 };
 const bindings=[],uv=[];
 for(let row=0;row<=GRID;row++)for(let col=0;col<=GRID;col++){
  const x=col/GRID*SIZE,y=row/GRID*SIZE;
  // A compact smooth kernel keeps neighboring mesh vertices continuously bound.
  const selected=[],weights=[];let nearest=Infinity;
  const head=(1-smooth(130,160,Math.abs(x-627)))*(1-smooth(665,705,y));
  if(head<1)for(const bone of bones){
   const distance=Math.sqrt(projection(x,y,bone)),u=distance/86;nearest=Math.min(nearest,distance);
   if(u<1){selected.push(bone);weights.push((1-u)**4*(4*u+1)*bone.length)}
  }
  const sum=weights.reduce((a,b)=>a+b,0)||1;
  bindings.push({x,y,bones:selected.map(b=>b.index),weights:weights.map(w=>w/sum),strength:(1-head)*(1-smooth(30,86,nearest))});
  uv.push(col/GRID,row/GRID);
 }
 const indices=[];
 for(let row=0;row<GRID;row++)for(let col=0;col<GRID;col++){
  const a=row*(GRID+1)+col,b=a+1,c=a+GRID+1,d=c+1;indices.push(a,c,b,b,c,d);
 }
 const compile=(type,source)=>{const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader};
 const program=gl.createProgram();
 gl.attachShader(program,compile(gl.VERTEX_SHADER,'attribute vec2 a_position;attribute vec2 a_uv;varying vec2 v_uv;void main(){vec2 p=a_position/1254.0;gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);v_uv=a_uv;}'));
 gl.attachShader(program,compile(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 v_uv;uniform sampler2D u_image;void main(){gl_FragColor=texture2D(u_image,v_uv);}'));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 const positionBuffer=gl.createBuffer(),positions=new Float32Array(bindings.length*2),uvBuffer=gl.createBuffer(),indexBuffer=gl.createBuffer();
 gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(uv),gl.STATIC_DRAW);
 const uvLocation=gl.getAttribLocation(program,'a_uv');gl.enableVertexAttribArray(uvLocation);gl.vertexAttribPointer(uvLocation,2,gl.FLOAT,false,0,0);
 gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
 const positionLocation=gl.getAttribLocation(program,'a_position');gl.enableVertexAttribArray(positionLocation);
 const image=new Image();image.src=textureUrl;await image.decode();
 const texture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,true);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
 canvas.width=640;canvas.height=640;gl.viewport(0,0,canvas.width,canvas.height);
 gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
 const matrices=bones.map(()=>({}));
 function draw(time,rest=false){
  const phase=2*Math.PI*time/4.8;
  for(const arm of arms){
   let x=arm.bones[0].a[0],y=arm.bones[0].a[1];
   const relax=rest?0:.10+.025*Math.sin(phase+arm.phase);
   for(const bone of arm.bones){
    const wave=rest?0:.30*smooth(.12,.95,bone.progress)*Math.sin(phase-bone.progress*2.4+arm.phase)+.055*smooth(.4,.95,bone.progress)*Math.sin(2*phase-bone.progress*4.3+arm.phase*.5);
    const angle=bone.angle-bone.curl*relax+wave,rotation=angle-bone.angle;
    const matrix=matrices[bone.index];matrix.c=Math.cos(rotation);matrix.s=Math.sin(rotation);matrix.x=x;matrix.y=y;
    x+=Math.cos(angle)*bone.length;y+=Math.sin(angle)*bone.length;
   }
  }
  bindings.forEach((binding,index)=>{
   if(binding.strength===0||!binding.bones.length){positions[index*2]=binding.x;positions[index*2+1]=binding.y;return;}
   let ax=0,ay=0,bx=0,by=0,c=0,sn=0;
   binding.bones.forEach((boneIndex,j)=>{
    const bone=bones[boneIndex],matrix=matrices[boneIndex],w=binding.weights[j];
    ax+=w*bone.a[0];ay+=w*bone.a[1];bx+=w*matrix.x;by+=w*matrix.y;c+=w*matrix.c;sn+=w*matrix.s;
   });
   const norm=Math.hypot(c,sn)||1;c/=norm;sn/=norm;
   const x=binding.x-ax,y=binding.y-ay;
   const dx=bx+c*x-sn*y-binding.x,dy=by+sn*x+c*y-binding.y;
   positions[index*2]=binding.x+dx*binding.strength;positions[index*2+1]=binding.y+dy*binding.strength;
  });
  gl.bindBuffer(gl.ARRAY_BUFFER,positionBuffer);gl.bufferData(gl.ARRAY_BUFFER,positions,gl.DYNAMIC_DRAW);gl.vertexAttribPointer(positionLocation,2,gl.FLOAT,false,0,0);
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);
 }
 draw(0);return {draw,bones:bones.length,vertices:bindings.length,positions:()=>Array.from(positions),period:4.8};
};
