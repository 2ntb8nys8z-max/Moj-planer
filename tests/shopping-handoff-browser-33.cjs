const {chromium}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
async function checkGuestHandoff(page){
 await page.setViewportSize({width:390,height:688});
 await page.goto('https://planner.test/podglad-odbiorcy/index.html?imie=1');
 const sounds=page.getByRole('switch',{name:'Dźwięki animacji'});
 assert.equal(await sounds.getAttribute('aria-checked'),'true');
 const track=await sounds.locator('.switch-track').boundingBox();
 const y=track.y+track.height/2;
 await page.mouse.move(track.x+track.width-8,y);
 await page.mouse.down();
 await page.mouse.move(track.x+8,y,{steps:5});
 await page.mouse.up();
 assert.equal(await sounds.getAttribute('aria-checked'),'false');
 await page.reload();
 assert.equal(await sounds.getAttribute('aria-checked'),'false');
 await page.getByLabel('Wpisz swoje imię (nick)',{exact:true}).fill('Zosia');
 await page.getByRole('button',{name:'Zatwierdź'}).click();
 await page.waitForFunction(()=>document.documentElement.classList.contains('arriving'));
 assert.equal(await page.locator('#flightSound').evaluate(el=>el.muted),true);
 await page.waitForFunction(()=>revision>0&&!arriving&&!document.documentElement.classList.contains('arrival-wait'));
 assert.equal(await page.locator('#flightReplay').count(),0);
 const details=page.locator('details');
 assert.equal(await details.evaluate(el=>el.open),true);
 assert.equal(await page.locator('#pending .item').count(),3);
 assert.equal(await page.locator('#bought .item[aria-pressed=true] em:visible').count(),4);
 await page.setViewportSize({width:320,height:410});
 await page.waitForFunction(()=>!document.querySelector('details').open);
 const pixels=await page.evaluate(async()=>{
   const sheet=document.querySelector('main'),bought=document.querySelector('#bought');
   const art=await guestPaperArt,texture=()=>guestPaperSnapshot(sheet,art).texture;
   const row=sheet.querySelector('.item'),rect=row.getBoundingClientRect();
   // Model a browser returning remembered rectangles for icons inside closed details.
   const icons=[...bought.querySelectorAll('svg')];
   for(const icon of icons)icon.getBoundingClientRect=()=>new DOMRect(rect.left,rect.bottom+3,25,27);
   const closed=texture().toDataURL(),rows=[...bought.children];
   bought.replaceChildren();
   const withoutHiddenRows=texture().toDataURL();
   bought.append(...rows);
   const bounds=sheet.getBoundingClientRect(),scale=Math.min(devicePixelRatio,2);
   const x=Math.floor((24+rect.right-bounds.left-4)*scale),y=Math.floor((24+rect.bottom-bounds.top-.5)*scale);
   const pixel=()=>[...texture().getContext('2d').getImageData(x,y,1,1).data].join(',');
   const ruled=pixel();
   row.style.borderBottomColor='transparent';
   const plain=pixel();
   return {noHiddenInk:closed===withoutHiddenRows,hasRule:ruled!==plain};
 });
 assert.deepEqual(pixels,{noHiddenInk:true,hasRule:true});
 await page.locator('summary').click();
 await page.setViewportSize({width:320,height:395});
 assert.equal(await details.evaluate(el=>el.open),true);
 await page.setViewportSize({width:390,height:688});
 const pencil=await page.locator('#addProductIcon').boundingBox(),foot=await page.locator('.shopping-foot').boundingBox();
 assert.equal(await page.locator('#addProductIcon').evaluate(img=>img.complete && img.naturalWidth>0),true);
 assert.ok(pencil.width>=52 && Math.abs(pencil.x+pencil.width-foot.x-foot.width)<3);
 await page.getByRole('button',{name:'Dodaj produkt'}).click();
 await page.locator('#newProduct').fill('Jarmuż');
 await page.getByRole('button',{name:'Dodaj produkt',exact:true}).click();
 assert.equal(await page.locator('#newProduct').isHidden(),true);
 const ownRow=page.locator('.shopping-has-options').filter({has:page.getByRole('button',{name:'Opcje produktu: Jarmuż',exact:true})});
 await ownRow.locator('.item-name').click({force:true});
 await ownRow.locator('.shopping-item-trash').waitFor({state:'visible'});
 assert.equal(await ownRow.locator('.item').getAttribute('aria-pressed'),'false');
 await ownRow.locator('.shopping-item-trash').waitFor({state:'hidden',timeout:4200});
 await ownRow.locator('.shopping-item-options').click();
 await ownRow.getByRole('button',{name:'Usuń produkt: Jarmuż'}).click();
 assert.equal(await ownRow.count(),0);
 console.log('Guest paper fits all four signed purchases or collapses the group, honours manual expansion and draws only visible ink and rules.');
}
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{for(const [width,fallback,noCanvasFilters] of [[390,false,false],[430,false,true],[390,true,true]]){
  const recordPlane=process.env.CI&&width===390&&!fallback;
  const page=await browser.newPage({...(recordPlane?{recordVideo:{dir:'test-output/shopping-plane',size:{width,height:844}}}:{}),viewport:{width,height:width===430?932:844},deviceScaleFactor:1,reducedMotion:'no-preference'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  if(noCanvasFilters)await page.addInitScript(()=>Object.defineProperty(CanvasRenderingContext2D.prototype,'filter',{configurable:true,get(){return 'none'},set(){}}));
  await page.route('**/*',route=>{const url=new URL(route.request().url()),file=path.resolve(url.pathname==='/'?'preview33/index.html':url.pathname.slice(1));if(url.origin==='https://planner.test'&&fs.existsSync(file)&&fs.statSync(file).isFile()){const types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.ttf':'font/ttf','.woff2':'font/woff2','.m4a':'audio/mp4'};return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/json'})}return route.fulfill({body:'{}',contentType:'application/json'})});
  await page.goto('https://planner.test/preview33/index.html');await require('./permission-fixture.cjs').dismissInitialPermissions(page);await page.evaluate(()=>document.fonts.ready);
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
  console.log(`Paper handoff ${width}px, ${fallback?'Canvas 2D':'WebGL'}, canvas filters ${noCanvasFilters?'disabled':'enabled'}: brightness delta ${result.brightnessDelta.toFixed(3)}/255, underline agreement ${result.inkAgreement.map(v=>v.toFixed(3))}, shadow delta ${result.shadowDelta.toFixed(3)}/${result.middleShadowDelta.toFixed(3)}/255.`);
  if(width===390){
   await page.evaluate(()=>{
     document.querySelector('.app').style.visibility='';
     shoppingOwner=true;saveShopping('id',crypto.randomUUID());
     window.inviteCalls=[];
     shoppingRequest=async(action,body)=>{
       if(action==='counted-invite')window.inviteCalls.push(body.seats);
       return {inviteOnly:true,invitations:[],revision:1,rows:[{key:'legacy',text:'Mleko 2 l',done:false,by:''}]};
     };
     openLegacyShopping();
     Object.defineProperty(navigator,'share',{configurable:true,value:async()=>{throw new DOMException('Anulowano','AbortError')}});
   });
   // Both visible entry points ask before issuing an invitation.
   await page.locator('#shoppingSendShared').click();
   await page.locator('#shoppingManageAccess').click();
   await page.locator('#shoppingInviteMore').click();
   const dialog=page.locator('#shoppingInviteDialog');
   await dialog.getByRole('heading',{name:'Ile kolejnych osób chcesz zaprosić?'}).waitFor();
   await dialog.getByRole('button',{name:'Zamknij',exact:true}).click();
   await page.locator('#shoppingSendShared').click();
   await dialog.getByRole('heading',{name:'Ile osób chcesz zaprosić?'}).waitFor();
   assert.equal(await dialog.locator('output').textContent(),'3');
   await dialog.getByRole('button',{name:'Mniej osób'}).click();
   await dialog.getByRole('button',{name:'Więcej osób'}).click();
   await dialog.getByRole('button',{name:'Więcej osób'}).click();
   assert.equal(await dialog.locator('output').textContent(),'4');
   assert.deepEqual(await page.evaluate(()=>window.inviteCalls),[]);
   await page.locator('#shoppingPrepareInvite').click();
   assert.deepEqual(await page.evaluate(()=>window.inviteCalls),[4]);
   assert.ok(await page.locator('#shoppingModal').isVisible());
   await page.evaluate(()=>Object.defineProperty(navigator,'share',{value:async()=>{}}));
   await page.locator('#shoppingShareInvite').click();
   await page.waitForFunction(()=>shoppingPaperMotion?.plane && shoppingPaperMotion?.mesh && shoppingPaperMotion.progress>.1);
   assert.equal(await page.evaluate(()=>shoppingPaperMotion.snapshot.includesData),true);
   await page.waitForSelector('#shoppingModal.hidden',{state:'attached',timeout:20000});
   assert.equal(await page.evaluate(()=>document.querySelector('.app').inert),false);
   assert.deepEqual(errors,[]);
   console.log('Sharing folded the written shopping sheet and returned to the planner.');
  }
  if(width===390&&!fallback)await checkGuestHandoff(page);
  await page.close();
 }}finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
