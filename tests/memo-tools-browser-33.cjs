const {chromium}=require(process.env.PLANNER_PLAYWRIGHT||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.PLANNER_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  for(const [width,height] of [[320,568],[390,844],[430,932],[844,390]]){
   const page=await browser.newPage({viewport:{width,height},reducedMotion:'reduce'}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.origin==='https://planner.test'){const file=path.resolve(url.pathname==='/'?'index.html':url.pathname.slice(1)),types={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2'};if(fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:types[path.extname(file)]||'application/json'})}return route.fulfill({body:route.request().resourceType()==='script'?'':'{}',contentType:route.request().resourceType()==='script'?'application/javascript':'application/json'})});
   await page.goto('https://planner.test');await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(()=>{navigator.mediaDevices.getUserMedia=async()=>{const context=new AudioContext(),tone=context.createOscillator(),out=context.createMediaStreamDestination();tone.connect(out);tone.start();out.stream.getTracks().forEach(track=>track.addEventListener('ended',()=>context.close()));return out.stream};selected=today();tasks=[{id:'demo',title:'Próba dyktafonu',date:iso(today()),time:'13:00',endTime:'14:00'}];ideas=[];renderAll();showView('day')});
   const root=page.locator('.octi-dock[data-channel=main]');const closed=await root.locator('.memo-glass').boundingBox();await page.evaluate(()=>window.originalMemoGlass=document.querySelector('.octi-dock[data-channel=main] .command-drop'));await root.locator('.menu-toggle').click();await root.locator('.recorder').click();
   await page.waitForFunction(()=>document.getElementById('memoTools').dataset.mode==='recording');
   const metrics=await page.evaluate(()=>{const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}};return {panel:rect(document.getElementById('memoTools')),bg:getComputedStyle(document.body).backgroundColor,overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...document.querySelectorAll('#memoTools button')].map(el=>{const r=el.getBoundingClientRect();return {id:el.id,hit:el.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))}})}});
   assert.ok(metrics.panel.top>=0&&metrics.panel.bottom<=height,JSON.stringify({width,height,metrics}));assert.ok(metrics.panel.left>=0&&metrics.panel.right<=width);assert.equal(metrics.overflow,false);assert.equal(metrics.bg,'rgb(228, 240, 251)');assert.ok(metrics.buttons.every(x=>x.hit),'all recorder controls remain reachable '+JSON.stringify(metrics));
   assert.ok(metrics.panel.bottom>closed.y+closed.height+8,'the original ribbon also expands down into the available space');assert.ok(metrics.panel.top<closed.y-80);assert.equal(await page.evaluate(()=>document.querySelector('.memo-glass').contains(window.originalMemoGlass)),true,'the same glossy SVG frame expands rather than a second card');assert.equal(await page.locator('#memoTools button').count(),3,'pause, combined stop/save and cancel only');
   const footprint=await page.evaluate(()=>{
    const glass=document.querySelector('.memo-glass .command-drop'),shape=glass.querySelector('defs path'),inverse=glass.getScreenCTM().inverse(),result=[];
    for(const lang of ['pl','en']){document.documentElement.lang=lang;updateMemoTools();for(const button of document.querySelectorAll('.memo-tools-actions button')){const r=button.getBoundingClientRect(),corners=[[r.left+2,r.top+2],[r.right-2,r.top+2],[r.left+2,r.bottom-2],[r.right-2,r.bottom-2]];result.push({lang,id:button.id,width:r.width,height:r.height,inside:corners.every(([x,y])=>shape.isPointInFill(new DOMPoint(x,y).matrixTransform(inverse)))})}}
    document.documentElement.lang='pl';updateMemoTools();return result;
   });assert.ok(footprint.every(b=>b.inside&&b.width<=48&&b.height<=58),'PL and EN action buttons fit inside the actual curved glass outline '+JSON.stringify({width,footprint}));
   if(process.env.PLANNER_MEMO_SCREENSHOT){fs.mkdirSync(process.env.PLANNER_MEMO_SCREENSHOT,{recursive:true});await page.screenshot({path:path.join(process.env.PLANNER_MEMO_SCREENSHOT,`recorder-${width}.png`)})}
   await page.locator('#memoToolsPause').click();await page.waitForFunction(()=>document.getElementById('memoTools').dataset.mode==='paused');
   await page.locator('#memoToolsPause').click();await page.waitForTimeout(1100);
   await page.locator('#memoToolsSave').click();await page.waitForFunction(()=>document.getElementById('memoTools').hidden);
   assert.equal(await page.evaluate(()=>ideas.length),1,'real MediaRecorder audio saves exactly one entry');assert.ok(await page.evaluate(()=>!!ideas[0].voiceMemoId));
   assert.equal(await page.locator('#dayView').isVisible(),true,'save keeps the calendar visible');assert.equal(await page.locator('#ideasView').isVisible(),false);assert.equal(await page.locator('.memo-save-confirmation').count(),1);assert.equal(await page.locator('#phoneEntries').evaluate(el=>el.classList.contains('memo-received')),true);
   assert.equal(await page.locator('.memo-save-confirmation circle').count(),0,'the green check has no circular backing');assert.ok((await page.locator('.memo-save-confirmation svg').boundingBox()).width>=90,'the confirmation is large and clear');
   if(width===390&&process.env.PLANNER_MEMO_SCREENSHOT)await page.screenshot({path:path.join(process.env.PLANNER_MEMO_SCREENSHOT,'saved-check.png')});
   if(width===390){
    await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>startVoiceMemo());await page.waitForTimeout(120);
    const middle=await root.locator('.memo-glass').boundingBox();assert.ok(middle.height>64&&middle.height<218,'the existing glass continuously changes size');
    await page.waitForTimeout(700);assert.doesNotMatch(await root.locator('.command-drop defs path').first().getAttribute('d'),/NaN/);
    await page.locator('#memoToolsCancel').click();await page.waitForTimeout(800);assert.ok(Math.abs((await root.locator('.memo-glass').boundingBox()).height-64)<1,'closing restores the original ribbon dimensions');
    const targetBefore=await page.locator('#phoneEntries').boundingBox();await page.evaluate(()=>startVoiceMemo());await page.waitForTimeout(1200);await page.locator('#memoToolsSave').click();await page.waitForTimeout(950);
    assert.equal(await page.locator('.memo-save-confirmation').count(),1);const targetDuring=await page.locator('#phoneEntries').boundingBox();assert.deepEqual(targetDuring,targetBefore,'the waving caption leaves the tab hit area fixed');const firstPose=await page.locator('#phoneEntries>span').evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(220);const secondPose=await page.locator('#phoneEntries>span').evaluate(el=>getComputedStyle(el).transform);assert.notEqual(firstPose,secondPose,'the glass tab visibly waves left and right');
    assert.ok((await page.locator('#phoneEntries>span').boundingBox()).width>=targetBefore.width*1.6,'the waving glass label becomes conspicuously larger');
    if(process.env.PLANNER_MEMO_SCREENSHOT)await page.screenshot({path:path.join(process.env.PLANNER_MEMO_SCREENSHOT,'saved-feedback.png')});
    await page.waitForTimeout(1700);assert.equal(await page.locator('.memo-save-confirmation').count(),0);assert.equal(await page.locator('#phoneEntries').evaluate(el=>el.classList.contains('memo-received')),false,'feedback cleans itself up');
   }
   assert.deepEqual(errors,[]);await page.close();console.log(`Recorder ${width}x${height}: shared glossy frame, visible two-action controls, pause/stop-save and ribbon restoration passed (synthetic audio).`);
  }
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
