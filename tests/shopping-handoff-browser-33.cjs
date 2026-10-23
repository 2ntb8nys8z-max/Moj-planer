const {chromium}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{for(const [width,fallback,noCanvasFilters] of [[390,false,false],[430,false,true],[390,true,true]]){
  const page=await browser.newPage({viewport:{width,height:width===430?932:844},deviceScaleFactor:1,reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(noCanvasFilters)await page.addInitScript(()=>Object.defineProperty(CanvasRenderingContext2D.prototype,'filter',{configurable:true,get(){return 'none'},set(){}}));
  await page.route('**/*',route=>{const url=new URL(route.request().url()),file=path.resolve(url.pathname==='/'?'preview33/index.html':url.pathname.slice(1));if(url.origin==='https://planner.test'&&fs.existsSync(file)&&fs.statSync(file).isFile()){const types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2'};return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/json'})}return route.fulfill({body:'{}',contentType:'application/json'})});
  await page.goto('https://planner.test/preview33/index.html');await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(fallback=>{ideas=[{id:'handoff',title:'Test',list:{type:'shopping',items:['Mleko 2 l','Chleb','Pomidory','Kawa 250 g','Jabłka 1 kg'].map((text,id)=>({id:String(id),text,done:false}))}}];renderAll();if(fallback)prepareShoppingPaperGL=()=>null;openShoppingSummary()},fallback);
  // The real Shopping anchor is captured; hide the unrelated animated dock for pixel comparisons.
  await page.waitForFunction(()=>{const m=shoppingPaperMotion;if(!m?.canvas)return false;cancelAnimationFrame(m.raf);window.handoffMotion=m;drawShoppingPaper(m,1);document.querySelector('.app').style.visibility='hidden';return true});
  const before=await page.screenshot();
  await page.evaluate(()=>{document.querySelector('.shopping-sheet').classList.add('shopping-paper-handoff');handoffMotion.canvas.style.opacity='.5'});
  const middle=await page.screenshot();
  const regions=await page.evaluate(async()=>{
   const ready=[...document.querySelectorAll('.shopping-paper-piece')].every(el=>el.dataset.paperTone==='ready'&&getComputedStyle(el).filter==='none');
   finishShoppingPaperOpen();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
   const underline=document.querySelector('.shopping-title-underline').getBoundingClientRect(),paper=document.querySelector('.shopping-paper-body').getBoundingClientRect(),surface=document.querySelector('.shopping-paper-surface').getBoundingClientRect();
   return {ready,surface:{left:surface.left,right:surface.right,top:surface.top,bottom:surface.bottom},underline:{x:Math.floor(underline.left)-1,y:Math.floor(underline.top)-1,w:Math.ceil(underline.width)+2,h:Math.ceil(underline.height)+2},paper:{x:Math.ceil(paper.left)+28,y:Math.ceil(paper.top)+25,w:Math.floor(paper.width)-56,h:Math.floor(paper.height)-50}};
  });
  const after=await page.screenshot();
  const result=await page.evaluate(async({before,middle,after,regions})=>{
   async function pixels(data){const image=new Image();image.src='data:image/png;base64,'+data;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {data:ctx.getImageData(0,0,canvas.width,canvas.height).data,width:canvas.width}}
   const a=await pixels(before),b=await pixels(after),mid=await pixels(middle),at=(p,x,y)=>{const i=(y*p.width+x)*4;return [p.data[i],p.data[i+1],p.data[i+2]]},warm=v=>v[0]>200&&v[1]>190&&v[0]>v[1]+2&&v[1]>v[2]+2;
   let delta=0,count=0;const r=regions.paper;
   for(let y=r.y;y<r.y+r.h;y++)for(let x=r.x;x<r.x+r.w;x++){const aa=at(a,x,y),bb=at(b,x,y);if(warm(aa)&&warm(bb)){delta+=aa[0]+aa[1]+aa[2]-bb[0]-bb[1]-bb[2];count++}}
   const blue=v=>v[2]>v[0]*1.4&&v[2]>v[1]*1.2&&v[0]<140,masks=[new Set(),new Set()],u=regions.underline;
   for(let y=u.y;y<u.y+u.h;y++)for(let x=u.x;x<u.x+u.w;x++){if(blue(at(a,x,y)))masks[0].add(y*a.width+x);if(blue(at(b,x,y)))masks[1].add(y*a.width+x)}
   const near=(key,mask)=>{for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++)if(mask.has(key+dy*a.width+dx))return true;return false};
   let shadowError=0,middleShadowError=0,shadowPixels=0;const edge=regions.surface;
   for(let y=Math.max(0,Math.ceil(edge.top-18));y<Math.min(a.data.length/a.width/4,edge.bottom+34);y++)for(let x=Math.max(0,Math.ceil(edge.left-24));x<Math.min(a.width,edge.right+34);x++){
    if(x>=edge.left-2&&x<=edge.right+2&&y>=edge.top-2&&y<=edge.bottom+2)continue;
    const aa=at(a,x,y),bb=at(b,x,y),mm=at(mid,x,y);for(let k=0;k<3;k++){shadowError+=Math.abs(aa[k]-bb[k]);middleShadowError+=Math.abs(mm[k]-bb[k])}shadowPixels++;
   }
   return {shadowDelta:shadowError/(shadowPixels*3),middleShadowDelta:middleShadowError/(shadowPixels*3),shadowPixels,brightnessDelta:Math.abs(delta/(count*3)),paperPixels:count,inkPixels:masks.map(m=>m.size),inkAgreement:masks.map((mask,i)=>[...mask].filter(key=>near(key,masks[1-i])).length/mask.size)};
  },{before:before.toString('base64'),middle:middle.toString('base64'),after:after.toString('base64'),regions});
  assert.equal(regions.ready,true,'DOM and animation share already toned paper pixels');assert.ok(result.paperPixels>10000,'brightness compares a large opaque paper area');assert.ok(result.brightnessDelta<.5,'no visible brightness step at handoff '+JSON.stringify(result));assert.ok(result.inkPixels.every(n=>n>100)&&result.inkAgreement.every(r=>r>.95),'underline retains its shape and location, allowing one pixel of rasterization '+JSON.stringify(result));assert.ok(result.shadowPixels>5000&&result.shadowDelta<1&&result.middleShadowDelta<1,'shadow keeps its shape and strength before, during and after blending '+JSON.stringify(result));assert.deepEqual(errors,[]);
  console.log(`Paper handoff ${width}px, ${fallback?'Canvas 2D':'WebGL'}, canvas filters ${noCanvasFilters?'disabled':'enabled'}: brightness delta ${result.brightnessDelta.toFixed(3)}/255, underline agreement ${result.inkAgreement.map(v=>v.toFixed(3))}, shadow delta ${result.shadowDelta.toFixed(3)}/${result.middleShadowDelta.toFixed(3)}/255.`);await page.close();
 }}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
