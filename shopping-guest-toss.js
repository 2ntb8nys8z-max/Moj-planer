// The recipient uses the same tessellation, draw functions and timing as the planner.
// Only the texture comes from the recipient's live layout.
const guestPaperArt=Promise.all(['shopping-paper-top.webp','shopping-paper-body.webp','shopping-paper-bottom.webp',$('addProductIcon').src].map(async src=>{
  const image=new Image();
  image.src=src;
  await image.decode();
  return image;
})).catch(()=>null);
function guestPaperSnapshot(sheet,art){
  const bounds=sheet.getBoundingClientRect(),pad=24,w=bounds.width;
  // Keep the moving texture within mobile GPU limits even for a very long shopping list.
  const h=Math.min(bounds.height,innerHeight+w);
  if(!w||!h)return null;
  const texture=document.createElement('canvas'),ratio=Math.min(devicePixelRatio||1,2);
  texture.width=Math.ceil((w+2*pad)*ratio);texture.height=Math.ceil((h+2*pad)*ratio);
  const ctx=texture.getContext('2d');if(!ctx)return null;
  ctx.scale(ratio,ratio);ctx.translate(pad,pad);
  ctx.save();ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
  const [top,body,bottom,addIcon]=art;
  ctx.drawImage(body,0,52,w,Math.max(1,bounds.height-104));
  ctx.drawImage(bottom,0,bounds.height-66,w,66);ctx.drawImage(top,0,0,w,68);
  const backTexture=document.createElement('canvas');
  backTexture.width=texture.width;backTexture.height=texture.height;
  backTexture.getContext('2d').drawImage(texture,0,0);
  // Closed details can retain layout rectangles in Safari. Use the same visibility
  // decision for every layer of the handwritten page, including checkboxes.
  function visibleRect(el){
    if(el.closest('[hidden], details:not([open]) #bought'))return null;
    const rect=el.getBoundingClientRect();
    return rect.width&&rect.height&&rect.bottom>bounds.top&&rect.top<bounds.top+h?rect:null;
  }
  for(const row of sheet.querySelectorAll('.item')){
    const rect=visibleRect(row);
    if(!rect)continue;
    const style=getComputedStyle(row),line=parseFloat(style.borderBottomWidth);
    if(line){
      ctx.fillStyle=style.borderBottomColor;
      ctx.fillRect(rect.left-bounds.left,rect.bottom-bounds.top-line,rect.width,line);
    }
  }
  const walker=document.createTreeWalker(sheet,NodeFilter.SHOW_TEXT),range=document.createRange();
  let node;
  while((node=walker.nextNode())){
    const el=node.parentElement;
    if(!node.textContent.trim()||el.closest('svg')||!visibleRect(el))continue;
    const st=getComputedStyle(el);
    ctx.font=[st.fontStyle,st.fontWeight,st.fontSize,st.fontFamily].join(' ');ctx.fillStyle=st.color;
    const metrics=ctx.measureText('Mg'),ascent=metrics.fontBoundingBoxAscent||parseFloat(st.fontSize)*.8,descent=metrics.fontBoundingBoxDescent||0;
    for(let i=0;i<node.length;i++){
      range.setStart(node,i);range.setEnd(node,i+1);
      const r=range.getBoundingClientRect();if(!r.width)continue;
      const x=r.left-bounds.left,y=r.top-bounds.top+(r.height-ascent-descent)/2+ascent;
      ctx.fillText(node.data[i],x,y);
      if(st.textDecorationLine.includes('line-through'))ctx.fillRect(x,y-ascent*.35,r.width,.9);
    }
  }
  const iconRect=visibleRect($('addProductIcon'));
  if(iconRect)ctx.drawImage(addIcon,iconRect.left-bounds.left,iconRect.top-bounds.top,iconRect.width,iconRect.height);
  for(const svg of sheet.querySelectorAll('svg')){
    const r=visibleRect(svg),vb=svg.viewBox.baseVal;
    if(!r||!vb.width)continue;
    ctx.save();ctx.translate(r.left-bounds.left,r.top-bounds.top);ctx.scale(r.width/vb.width,r.height/vb.height);
    for(const path of svg.querySelectorAll('path')){
      if(path.classList.contains('ink')&&!svg.closest('[aria-pressed=true]'))continue;
      const st=getComputedStyle(path);if(st.display==='none')continue;
      ctx.lineWidth=parseFloat(st.strokeWidth);
      ctx.globalAlpha=Number(st.opacity);ctx.lineCap='round';ctx.lineJoin='round';
      const shape=new Path2D(path.getAttribute('d'));
      if(st.fill!=='none'){ctx.fillStyle=st.fill;ctx.fill(shape)}
      if(st.stroke!=='none'){ctx.strokeStyle=st.stroke;ctx.stroke(shape)}
    }
    ctx.restore();
  }
  ctx.restore();
  return {texture,backTexture,pad,width:w+2*pad,height:h+2*pad,center:{x:bounds.left+w/2,y:bounds.top+h/2},angle:0};
}
async function tossGuestPaper(sheet,art){
  const snapshot=guestPaperSnapshot(sheet,art);
  if(!snapshot)return;
  const canvas=document.createElement('canvas'),dpr=Math.min(devicePixelRatio||1,2);
  canvas.className='guest-toss';canvas.setAttribute('aria-hidden','true');
  canvas.width=Math.ceil(innerWidth*dpr);canvas.height=Math.ceil(innerHeight*dpr);
  const motion={canvas,snapshot,dpr,closing:false,plane:false};
  try{
    try{motion.gpu=prepareShoppingPaperGL(canvas,snapshot)}catch{motion.canvas=canvas.cloneNode()}
    snapshot.fallback=!motion.gpu;
    if(!motion.gpu&&!motion.canvas.getContext('2d'))return;
    document.body.append(motion.canvas);
    const width=innerWidth,height=innerHeight,begin=performance.now();
    await new Promise((resolve,reject)=>{
      function frame(now){
        if(document.hidden||reducedMotion()||innerWidth!==width||innerHeight!==height){resolve();return}
        try{
          const t=Math.min(1,(now-begin)/shoppingTossDuration);drawShoppingPaper(motion,t);
          if(t<1)requestAnimationFrame(frame);else resolve();
        }catch(error){reject(error)}
      }
      frame(begin);
    });
  }finally{motion.gpu?.dispose();motion.canvas.remove()}
}
