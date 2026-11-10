const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{chromium,webkit}=require('playwright');
const kind=process.env.PLANNER_BROWSER||'chromium',engine=kind==='webkit'?webkit:chromium,live=process.env.PLANNER_LIVE_URL,origin=live?new URL(live).origin:'https://2ntb8nys8z-max.github.io';
const output='test-results/day-briefing-'+kind+(live?'-deployed':''),api=fs.readFileSync('index.html','utf8').match(/API_URL="([^"]+)"/)[1];
const mime={'.html':'text/html','.js':'application/javascript','.webp':'image/webp','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.json':'application/json'};
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',GOOGLE_MAPS_API_KEY:'maps-fixture',API_LIMITS_DB:{prepare(){return{run:async()=>{},bind(){return this},first:async()=>({})}}}};
(async()=>{
 const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default,nativeFetch=globalThis.fetch;
 let transcript='',modelCalls=0,routeCalls=[];
 globalThis.fetch=async(url,options={})=>{if(String(url).includes('/audio/transcriptions'))return Response.json({text:transcript});if(String(url).includes('routes.googleapis.com')){routeCalls.push(JSON.parse(options.body));return Response.json({routes:[{duration:'2700s',distanceMeters:65000}]})}modelCalls++;throw Error('A clear briefing request must not reach the model')};
 const days=['2026-11-09','2026-11-10','2026-11-11'],times=days.flatMap(day=>Array.from({length:24},(_,h)=>day+'T'+String(h).padStart(2,'0')+':00'));
 const forecast={timezone:'Europe/Warsaw',current:{time:'2026-11-10T15:30',temperature_2m:14,weather_code:2,is_day:1},hourly:{time:times,temperature_2m:times.map(t=>Number(t.slice(11,13))<18?14:5),weather_code:times.map(t=>Number(t.slice(11,13))>=20?61:2),precipitation_probability:times.map(t=>Number(t.slice(11,13))>=20?70:10),wind_speed_10m:times.map(()=>10)},daily:{time:days,sunrise:days.map(d=>d+'T07:00'),sunset:days.map(d=>d+'T16:30')}};
 fs.mkdirSync(output,{recursive:true});let browser;
 try{
  browser=await engine.launch({headless:true,...(kind==='chromium'?{args:['--no-sandbox'],...(process.env.PLANNER_CHROMIUM?{executablePath:process.env.PLANNER_CHROMIUM}:{})}: {})});
  for(const width of [320,390,430]){
   const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,timezoneId:'Europe/Warsaw',geolocation:{latitude:52.23,longitude:21.01},permissions:['geolocation']}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
   await page.addInitScript(()=>{
    const NativeDate=Date;window.testNow=+new NativeDate('2026-11-10T15:30:00+01:00');window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.testNow]))}static now(){return window.testNow}};
    window.testSpeech=[];Object.defineProperty(window,'speechSynthesis',{configurable:true,value:{cancel(){},getVoices(){return []},speak(u){testSpeech.push(u.text)}}});window.SpeechSynthesisUtterance=function(text){this.text=text};
   });
   await page.route('**/*',async route=>{
    const request=route.request(),url=new URL(request.url());
    if(url.origin===origin){if(live)return route.continue();const file=path.resolve(url.pathname.slice(1)||'index.html');if(file.startsWith(process.cwd()+path.sep)&&fs.existsSync(file)&&fs.statSync(file).isFile())return route.fulfill({body:fs.readFileSync(file),contentType:mime[path.extname(file)]||'application/octet-stream'});}
    if(url.origin===api){const response=await worker.fetch(new Request(request.url(),{method:request.method(),headers:request.headers(),...(request.postData()?{body:request.postData()}:{})}),env);return route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:await response.text()});}
    if(url.hostname==='api.open-meteo.com')return route.fulfill({json:forecast});
    if(url.hostname==='api.bigdatacloud.net')return route.fulfill({json:{city:'Warszawa',countryCode:'PL',countryName:'Polska'}});
    if(request.resourceType()==='script')return route.fulfill({body:'',contentType:'application/javascript'});return route.fulfill({json:{}});
   });
   await page.goto(live||origin);await require('./permission-fixture.cjs').dismissInitialPermissions(page);await page.evaluate(()=>document.fonts.ready);
   await page.evaluate(async token=>{
    tasks=[{id:'past',title:'Minione spotkanie',date:'2026-11-10',time:'09:00',endTime:'10:00'},{id:'ongoing',title:'Trwające spotkanie',date:'2026-11-10',time:'15:00',endTime:'15:45',location:'Rynek, Warszawa'},{id:'future',title:'Nadchodząca konsultacja',date:'2026-11-10',time:'16:00',endTime:'17:00',location:'Centrum, Łódź'},{id:'done',title:'Już wykonane',date:'2026-11-10',time:'18:00',endTime:'19:00',done:true},{id:'tomorrow',title:'Jutro rano',date:'2026-11-11',time:'09:00',endTime:'10:00',location:'Warszawa'},{id:'yesterday',title:'Wczorajszy plan',date:'2026-11-09',time:'12:00',endTime:'13:00',done:true}];ideas=[{id:'future-task-module',text:'Nie przypisuj mi zadania do dnia',done:true}];saveTasks();saveIdeas();saveApiAccess(token);selected=new Date('2026-11-11T12:00:00');renderAll();showPlannerWeather=async()=>{};await OktiLocalWeather.enable();window.briefSession=beginVoiceDialogue('main',null,null);window.briefBefore=JSON.stringify(PlannerData.snapshot());
   },env.PLANNER_ACCESS_TOKEN);
   async function ask(text,audio=false){transcript=text;await page.evaluate(async({text,audio})=>{const result=await requestVoiceDialogue(briefSession,audio?new Blob(['test audio'],{type:'audio/mp4'}):text);if(result)await applyVoiceDialogueResult(briefSession,result);},{text,audio});await page.waitForFunction(()=>!!OktiDayBriefUI.getState()?.model)}
   await ask('Co mam jeszcze dzisiaj przed sobą?',true);
   const modal=page.locator('#entryResultsModal'),list=page.locator('#entryResults');assert.equal(await list.locator('.entry-result').count(),2);assert.doesNotMatch(await list.textContent(),/Minione spotkanie|Już wykonane|Jutro rano|Nie przypisuj/);assert.match(await list.textContent(),/Ryzyko spóźnienia/);assert.match(await list.textContent(),/ochłodzi/);assert.match(await list.textContent(),/20:00/);
   assert.ok(routeCalls.some(body=>body.origin.location?.latLng.latitude===52.23));assert.equal(modelCalls,0);
   assert.equal(await page.evaluate(()=>iso(selected)),'2026-11-11');assert.equal(await page.evaluate(()=>JSON.stringify(PlannerData.snapshot())===briefBefore),true);
   const geometry=await modal.locator('.action-card').evaluate(n=>{const r=n.getBoundingClientRect();return{x:r.x,right:r.right,top:r.top,bottom:r.bottom,scroll:n.scrollHeight,height:n.clientHeight}});assert.ok(geometry.x>=0&&geometry.right<=width&&geometry.top>=0&&geometry.bottom<=844,'The briefing fits the mobile viewport and scrolls internally');
   const read=page.getByRole('button',{name:'Odczytaj podsumowanie',exact:true});await read.tap();assert.match(await page.evaluate(()=>testSpeech.at(-1)),/Nadchodząca konsultacja/);
   await page.screenshot({path:path.join(output,width+'-remaining.png')});
   transcript='Pokaż mi to wydarzenie';await page.evaluate(async()=>{const result=await requestVoiceDialogue(briefSession,new Blob(['test audio'],{type:'audio/mp4'}));if(result)await applyVoiceDialogueResult(briefSession,result)});
   assert.equal(await list.locator('.entry-result').count(),2);assert.match(await page.locator('#entryResultsTitle').textContent(),/Które spotkanie/);await page.screenshot({path:path.join(output,width+'-reference-choices.png')});
   await page.evaluate(async()=>{const result=await requestVoiceDialogue(briefSession,'To o 16:00');if(result)await applyVoiceDialogueResult(briefSession,result)});await page.waitForFunction(()=>activeTask?.id==='future');assert.equal(await page.locator('#eventModal').isVisible(),true);assert.equal(modelCalls,0);await page.screenshot({path:path.join(output,width+'-reference-event.png')});await page.evaluate(()=>closeEventActions());await page.waitForFunction(()=>!OktiEventMotion.getState());assert.equal(await page.evaluate(()=>OktiDayBriefUI.getState()),null);

   const routesBeforeReview=routeCalls.length;await ask('Podsumuj wczorajszy dzień');assert.match(await list.textContent(),/Wczorajszy plan/);assert.doesNotMatch(await list.textContent(),/odbyły się|Nie przypisuj/);assert.equal(routeCalls.length,routesBeforeReview);await page.screenshot({path:path.join(output,width+'-review.png')});await page.locator('#closeEntryResults').tap();
   await ask('A plan na jutro?');assert.match(await list.textContent(),/Jutro rano/);assert.doesNotMatch(await list.textContent(),/wyruszyć teraz/);await page.screenshot({path:path.join(output,width+'-tomorrow.png')});
   // Native touch on an actual result opens its original event handlers.
   await list.getByRole('button').filter({hasText:'Jutro rano'}).tap();await page.waitForFunction(()=>activeTask?.id==='tomorrow');assert.equal(await page.locator('#eventModal').isVisible(),true);await page.evaluate(()=>closeEventActions());await page.waitForFunction(()=>!OktiEventMotion.getState());
   const count=await page.evaluate(()=>testSpeech.length);await page.evaluate(()=>{window.realWeatherRefresh=OktiLocalWeather.refresh;OktiLocalWeather.refresh=()=>new Promise(resolve=>window.releaseBriefWeather=resolve);window.pendingBrief=OktiDayBriefUI.show({day:'today',briefMode:'remaining'},null,{speak:true});});await page.locator('#closeEntryResults').tap();await page.evaluate(async()=>{releaseBriefWeather();await pendingBrief;OktiLocalWeather.refresh=realWeatherRefresh});assert.equal(await modal.isVisible(),false);assert.equal(await page.evaluate(()=>testSpeech.length),count);
   assert.equal(await page.evaluate(()=>JSON.stringify(PlannerData.snapshot())===briefBefore),true);assert.deepEqual(errors,[]);await context.close();console.log(kind+' '+width+': audio → Worker → mobile briefing, future-only events/weather, coordinate Routes and lateness, tomorrow/review, no task claims, native read/close/event-open, audio reference → precise event selection, async cancellation and unchanged planner passed (STT/GPS/Google/weather fixtures).');
  }
 }finally{await browser?.close();globalThis.fetch=nativeFetch}
})().catch(error=>{console.error(error);process.exitCode=1});
