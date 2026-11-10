import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',GOOGLE_MAPS_API_KEY:'maps-fixture',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const originalFetch=globalThis.fetch;let transcript='',modelCalls=0,routeCalls=[],model,lastPayload;
globalThis.fetch=async(url,options={})=>{
 if(String(url).includes('/audio/transcriptions'))return Response.json({text:transcript});
 if(String(url).includes('routes.googleapis.com')){const body=JSON.parse(options.body);routeCalls.push(body);return Response.json({routes:[{duration:'2700s',distanceMeters:65000}]})}
 modelCalls++;return Response.json({choices:[{message:{content:JSON.stringify(model)}}]});
};
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext()),get=id=>w.document.getElementById(id);
let now=+new Date('2026-11-10T15:30:00'),gps=0,forecastCalls=0;
const NativeDate=w.Date;w.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[now]))}static now(){return now}};
const days=['2026-11-09','2026-11-10','2026-11-11'],hours=days.flatMap(d=>Array.from({length:24},(_,h)=>d+'T'+String(h).padStart(2,'0')+':00'));
const forecast={timezone:'Europe/Warsaw',current:{time:'2026-11-10T15:30',temperature_2m:14,weather_code:2,is_day:1},hourly:{time:hours,temperature_2m:hours.map(t=>Number(t.slice(11,13))<18?14:5),weather_code:hours.map(t=>Number(t.slice(11,13))>=20?61:2),precipitation_probability:hours.map(t=>Number(t.slice(11,13))>=20?70:10),wind_speed_10m:hours.map(()=>10)},daily:{time:days,sunrise:days.map(d=>d+'T07:00'),sunset:days.map(d=>d+'T16:30')}};
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async url=>{
 if(String(url).includes('bigdatacloud'))return Response.json({city:'Warszawa',countryCode:'PL',countryName:'Polska'});
 if(String(url).includes('api.open-meteo.com')){forecastCalls++;return Response.json(forecast)}return Response.json({});
}});
Object.defineProperty(w.navigator,'geolocation',{value:{
 getCurrentPosition(ok){gps++;ok({coords:{latitude:52.23,longitude:21.01,accuracy:20}})}
}});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
const spoken=[];w.speechSynthesis={cancel(){},getVoices(){return []},speak(u){spoken.push(u.text)}};w.SpeechSynthesisUtterance=function(text){this.text=text};
w.testApi=async(path,options)=>{lastPayload=JSON.parse(options.body);const response=await worker.fetch(new Request('https://worker'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:options.body}),env);const value=await response.json();assert.equal(response.status,200,JSON.stringify(value));return value};
run(fs.readFileSync('sync-core.js','utf8'));for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
run(fs.readFileSync('day-briefing.js','utf8'));run(fs.readFileSync('travel-routes.js','utf8'));run(fs.readFileSync('day-briefing-ui.js','utf8'));
run("plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});showPlannerWeather=async()=>{};loadVoiceMemo=async()=>null");
async function turn(text,audio=false){transcript=text;w.testText=text;return run(`requestVoiceDialogue(testSession,${audio?'{}':'testText'}).then(r=>r&&applyVoiceDialogueResult(testSession,r))`)}
const event=(id,time,endTime,fields={})=>({id,title:id,date:'2026-11-10',time,endTime,...fields});
try{
 const invalid=await worker.fetch(new Request('https://worker/routes/compute',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({origin:{latitude:91,longitude:21},destination:'Warszawa',mode:'DRIVE'})}),env);assert.equal(invalid.status,400);assert.equal((await invalid.json()).code,'invalid_route');assert.equal(routeCalls.length,0);
 w.fixtureTasks=[event('Minione spotkanie','09:00','10:00'),event('Trwa teraz','15:00','15:45',{location:'Rynek, Warszawa'}),event('Nadchodzące spotkanie','16:00','17:00',{location:'Centrum, Łódź'}),event('Już wykonane','18:00','19:00',{done:true}),event('Jutro rano','09:00','10:00',{date:'2026-11-11',location:'Warszawa'}),event('Wczorajszy plan','12:00','13:00',{date:'2026-11-09',done:true})];
 run("tasks=fixtureTasks;ideas=[{id:'future-task-module',text:'Nie zaliczaj mi tego zadania',done:true}];saveTasks();saveIdeas();selected=new Date('2026-11-11T12:00:00');renderAll();testSession=beginVoiceDialogue('main',null,null)");
 const dataBefore=run('JSON.stringify(PlannerData.snapshot())'),selectedBefore=run('iso(selected)');await run('OktiLocalWeather.enable()');
 await turn('Co mam jeszcze dzisiaj przed sobą?',true);
 assert.equal(modelCalls,0,'Clear brief requests never ask the model to invent a calendar response');
 const state=w.OktiDayBriefUI.getState();assert.ok(state.model);assert.deepEqual(Array.from(state.model.records,r=>r.item.id),['Trwa teraz','Nadchodzące spotkanie']);
 const text=get('entryResults').textContent;assert.doesNotMatch(text,/Minione spotkanie|Już wykonane|Jutro rano|Nie zaliczaj/);assert.match(text,/Ryzyko spóźnienia/);assert.match(text,/ochłodzi/);assert.match(text,/20:00/);
 assert.ok(routeCalls.some(body=>body.origin.location?.latLng.latitude===52.23),'The existing Routes API receives a coordinate waypoint for the phone');
 assert.ok(spoken.at(-1).includes('Nadchodzące spotkanie'));assert.doesNotMatch(spoken.at(-1),/Minione spotkanie/);
 assert.equal(run('JSON.stringify(PlannerData.snapshot())'),dataBefore);assert.equal(run('iso(selected)'),selectedBefore,'The query concerns today even while another day is selected');
 get('closeEntryResults').click();assert.equal(w.OktiDayBriefUI.getState(),null);
 await turn('A plan na jutro?');assert.equal(w.OktiDayBriefUI.getState().model.date,'2026-11-11');assert.match(get('entryResults').textContent,/Jutro rano/);assert.doesNotMatch(get('entryResults').textContent,/wyruszyć teraz/);
 const callsBeforeReview={gps,forecastCalls,routes:routeCalls.length};await turn('Podsumuj wczorajszy dzień');assert.equal(w.OktiDayBriefUI.getState().model.mode,'review');assert.match(get('entryResults').textContent,/Wczorajszy plan/);assert.doesNotMatch(get('entryResults').textContent,/Nie zaliczaj|odbyły się/);assert.deepEqual({gps,forecastCalls,routes:routeCalls.length},callsBeforeReview,'Past-day review makes no weather or route calls');
 // A read-only detour preserves an active hour question and its complete draft.
 get('closeEntryResults').click();run("clearVoiceDialogue('main');testSession=beginVoiceDialogue('main',null,null)");
 model={kind:'command',intent:'execute',action:'continue',reply:'Sprawdź.',operations:[],focus:'',ambiguity:null,uiAction:{type:'open_create_event',query:'Konsultacja',date:'2026-11-11',startTime:'01:00',durationMinutes:30}};
 await turn('Dodaj konsultację jutro na pierwszą na pół godziny.');assert.equal(run('testSession.dialogueState.activeHourChoice.choices[1]'),'13:00');
 await turn('Co mnie jeszcze czeka dzisiaj?');assert.equal(run('testSession.dialogueState.activeHourChoice.choices[1]'),'13:00');assert.equal(run('testSession.dialogueState.draft.title'),'Konsultacja');get('closeEntryResults').click();
 const next=await run("requestVoiceDialogue(testSession,'13:00')");assert.equal(next.uiAction.query,'Konsultacja');assert.equal(next.uiAction.date,'2026-11-11');assert.equal(next.uiAction.startTime,'13:00');assert.equal(run('JSON.stringify(PlannerData.snapshot())'),dataBefore,'Only the explicit subsequent creation path can save anything');
 // Closing during a slow provider response cannot re-open or read a late result.
 let release;const refresh=w.OktiLocalWeather.refresh;w.OktiLocalWeather.refresh=()=>new Promise(resolve=>{release=resolve});const speechBefore=spoken.length;
 const pending=w.OktiDayBriefUI.show({day:'today',briefMode:'remaining'},null,{speak:true});get('closeEntryResults').click();release();await pending;assert.equal(get('entryResultsModal').classList.contains('hidden'),true);assert.equal(spoken.length,speechBefore);w.OktiLocalWeather.refresh=refresh;
 // No GPS request is made when local weather/location is switched off.
 w.OktiLocalWeather.disable();const fixesBefore=gps;await w.OktiDayBriefUI.show({day:'today',briefMode:'remaining'});assert.equal(gps,fixesBefore);assert.match(get('entryResults').textContent,/Brak aktualnej/);assert.equal(run('JSON.stringify(PlannerData.snapshot())'),dataBefore);
 console.log('Day briefing flow: real Worker → frontend → text/normalized audio → read-only briefing; remaining/tomorrow/review, live selected-day independence, coordinate Routes request, future weather, travel/overlap alerts, preserved active hour draft → next turn, no task completion inference, cancellation, disabled GPS, no calendar/entry/sync mutations passed (model/STT/GPS/weather/Google fixtures).');
}finally{dom.window.close();globalThis.fetch=originalFetch}
