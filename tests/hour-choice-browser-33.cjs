const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const kind=process.env.PLANNER_BROWSER||'chromium',engine=kind==='webkit'?webkit:chromium,live=process.env.PLANNER_LIVE_URL,origin=live?new URL(live).origin:'https://2ntb8nys8z-max.github.io';
const output='test-results/hour-choice-'+kind+(live?'-deployed':'');
const html=fs.readFileSync('index.html','utf8'),apiOrigin=html.match(/API_URL="([^"]+)"/)[1];
const mime={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.json':'application/json'};
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
(async()=>{
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
 const nativeFetch=globalThis.fetch;let transcript,modelCalls=0,model,requests=[];
 // Only external STT/model providers are fixtures. The browser uses its real
 // request path, the actual Worker, and the actual next-turn/save handlers.
 globalThis.fetch=async url=>{
  if(String(url).includes('/audio/transcriptions'))return Response.json({text:transcript});
  modelCalls++;return Response.json({choices:[{message:{content:JSON.stringify(model)}}]});
 };
 fs.mkdirSync(output,{recursive:true});let browser;
 try{
  browser=await engine.launch({headless:true,...(kind==='chromium'?{args:['--no-sandbox']}: {})});
  for(const [width,lang,spoken,labels,index,time] of [
   [320,'pl','1:00',['01:00','13:00'],0,'01:00'],
   [390,'pl','1:00',['01:00','13:00'],1,'13:00'],
   [430,'pl','7:35',['07:35','19:35'],1,'19:35'],
   [390,'en','1:00',['1 AM','1 PM'],1,'13:00'],
   [390,'en-US','12:00',['12 AM','12 PM'],0,'00:00'],
   [390,'en-GB','12:00',['12 AM','12 PM'],1,'12:00'],
   [320,'en','7:35',['7:35 AM','7:35 PM'],1,'19:35']
  ]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Berlin'}),page=await context.newPage(),errors=[];
   page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(15000);
   await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin){
     if(live)return route.continue();const file=path.resolve(url.pathname.slice(1)||'index.html');
     if(file.startsWith(process.cwd()+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});
    }
    if(url.origin===apiOrigin){
     if(request.method()==='POST')requests.push(JSON.parse(request.postData()));
     const response=await worker.fetch(new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})}),env);
     return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});
    }
    if(request.resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});
    return route.fulfill({json:{}});
   });
   await page.goto(live||origin);await page.evaluate(()=>document.fonts.ready);
   requests=[];transcript='Utwórz spotkanie 4 stycznia o '+spoken;
   model={kind:'command',intent:'execute',action:'continue',reply:'Sprawdź.',operations:[],focus:'',ambiguity:null,uiAction:{type:'open_create_event',query:'Spotkanie',date:'2027-01-04',startTime:time,durationMinutes:15}};
   await page.evaluate(async({lang,token})=>{
    document.documentElement.lang=lang;showPlannerWeather=async()=>{};tasks=[];ideas=[];saveTasks();selected=new Date('2027-01-04T12:00:00');renderAll();saveApiAccess(token);
    window.testSpeech=[];Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},getVoices(){return []},speak(utterance){testSpeech.push(utterance.text)}}});window.SpeechSynthesisUtterance=function(text){this.text=text};
    window.hourSession=beginVoiceDialogue('main',null,null);const result=await requestVoiceDialogue(hourSession,new Blob(['test audio'],{type:'audio/mp4'}));if(result)await applyVoiceDialogueResult(hourSession,result);
   },{lang,token:env.PLANNER_ACCESS_TOKEN});
   const choices=page.locator('#oktiDecision [data-time-choice]');await choices.first().waitFor();
   await page.waitForFunction(()=>{const card=document.querySelector('#oktiDecision .okti-decision-card');return card&&Number(getComputedStyle(card).opacity)>.99&&card.getAnimations().every(animation=>animation.playState==='finished')});
   assert.deepEqual(await choices.allTextContents(),labels);assert.equal(await page.locator('#oktiDecision [role=spinbutton]').count(),0);
   assert.equal(await page.evaluate(()=>tasks.length),0);assert.deepEqual(await page.evaluate(()=>testSpeech),[],'The ready-made hour choices do not require another spoken question');
   const geometry=await choices.evaluateAll(nodes=>nodes.map(node=>{const r=node.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(node.querySelector('strong'));const text=range.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right,bottom:r.bottom,text:{x:text.x,right:text.right,bottom:text.bottom}}}));
   assert.ok(Math.abs(geometry[0].y-geometry[1].y)<1,'Both alternatives appear side by side');
   for(const box of geometry){assert.ok(box.width>=44&&box.height>=44);assert.ok(box.x>=0&&box.right<=width&&box.bottom<=844);assert.ok(box.text.x>=box.x&&box.text.right<=box.right&&box.text.bottom<=box.bottom,'The complete time label fits the touch target');}
   await page.screenshot({path:path.join(output,width+'-'+lang+'-'+time.replace(':','')+'.png')});
   const calls=modelCalls;await choices.nth(index).tap();await page.waitForFunction(()=>tasks.length===1);
   assert.equal(modelCalls,calls,'Tapping a time needs no model guess or repeated recording');assert.equal(requests.length,2);assert.ok(requests[0].audio);assert.equal(requests[1].audio,undefined);assert.equal(requests[1].manualTimeChoice.time,time);assert.equal(requests[1].manualTimeChoice.field,'startTime');assert.equal(requests[1].manualTimeChoice.revision,requests[1].dialogueState.revision);
   const saved=await page.evaluate(()=>PlannerData.snapshot().tasks[0]);assert.equal(saved.time,time);assert.equal(saved.title,'Spotkanie');assert.equal(saved.date,'2027-01-04');const [hour,minute]=time.split(':').map(Number),end=hour*60+minute+15;assert.equal(saved.endTime,String(Math.floor(end/60)).padStart(2,'0')+':'+String(end%60).padStart(2,'0'));
   await page.locator('#oktiDecision button').filter({hasText:'Nie — zakończ'}).tap();await page.waitForFunction(()=>document.getElementById('oktiDecision').hidden);assert.deepEqual(errors,[]);
   await page.reload();assert.equal(await page.evaluate(()=>PlannerData.snapshot().tasks[0].time),time,'The chosen hour survives reload');
   await context.close();console.log(kind+' '+width+' '+lang+': normalized audio → real Worker → native touch '+labels[index]+' → exact next request → durable event, paired geometry, no second recording/model call passed.');
  }
 }finally{await browser?.close();globalThis.fetch=nativeFetch}
})().catch(error=>{console.error(error);process.exitCode=1});
