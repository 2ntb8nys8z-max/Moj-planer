import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const token='test-only-token-1234567890123456',env={PLANNER_ACCESS_TOKEN:token,OPENAI_API_KEY:'dummy',GOOGLE_MAPS_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let transcript='',model,interpretations=0,transcriptions=0,routeCalls=[],routeAvailable=true,amplitude=0,closed=0,requests=0;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('routes.googleapis.com')){routeCalls.push(JSON.parse(options.body));return Response.json({routes:routeAvailable?[{duration:'1200s',distanceMeters:20000}]:[]})}
 if(String(url).includes('/audio/transcriptions')){transcriptions++;assert.doesNotMatch(options.body.get('prompt'),/Zachowaj|Nie tłumacz|odpowiadać/);return Response.json({text:transcript})}
 interpretations++;return Response.json({choices:[{message:{content:JSON.stringify(model)}}]});
};
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext()),get=id=>w.document.getElementById(id);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async()=>Response.json({})});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
w.testApi=async(path,options)=>{requests++;const response=await worker.fetch(new Request('https://worker'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:options.body}),env);const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));return result};
run(fs.readFileSync('sync-core.js','utf8'));for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
run("plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});showPlannerWeather=async()=>{};loadVoiceMemo=async()=>null");
const settle=()=>new Promise(r=>w.setTimeout(r,30));
async function waitFor(f){for(let i=0;i<100;i++){if(f())return;await settle()}assert.fail('Expected state did not appear')}
const options=()=>[...get('oktiDecision').querySelectorAll('.okti-decision-option')];
try{
 run("tasks=[{id:'one',title:'Wymiana opon',date:'2026-11-07',time:'13:00',endTime:'14:00',notes:'Stara notatka',location:'Riesa, Niemcy',history:[]}];saveTasks();openEventActions(tasks[0]);testSession=beginVoiceDialogue('event','one',voiceEventSnapshot(tasks[0]));testSession.dialogueState={engine:3,revision:7,locationContext:{city:'Riesa',country:'Niemcy'},draft:{}};");
 const history=run('JSON.stringify(testSession.history)'),state=run('JSON.stringify(testSession.dialogueState)');
 await run('requestVoiceDialogue(testSession,{})');assert.equal(interpretations,0);assert.equal(transcriptions,1);assert.equal(run('JSON.stringify(testSession.history)'),history);assert.equal(run('JSON.stringify(testSession.dialogueState)'),state);assert.equal(get('oktiDecision').hidden,true);assert.equal(get('eventVoiceHint').textContent,'');
 // The next normalized audio turn still targets the same event and preserves earlier context.
 transcript='Dopisz do notatki: odebrać samochód o 17:00.';
 model={kind:'event',intent:'modify',action:'continue',reply:'Sprawdź.',operations:[{op:'set',field:'notes',value:'Stara notatka\nodebrać samochód o 17:00'}],focus:'',ambiguity:null,uiAction:null};
 const editing=run('requestVoiceDialogue(testSession,{}).then(r=>r&&applyVoiceDialogueResult(testSession,r))');await waitFor(()=>!get('eventChangePreview').classList.contains('hidden'));
 assert.doesNotMatch(get('oktiDecisionQuestion').textContent,/Rozpoznano:|Stara notatka.*→/);assert.deepEqual(options().slice(0,2).map(b=>b.textContent),['Tak — zmień','Nie — wróć']);assert.ok(options().some(b=>b.textContent==='Zmień'));assert.ok(!options().some(b=>b.textContent==='Popraw głosowo'));
 assert.equal(w.getComputedStyle(get('eventConversationPanel')).display,'none');
 await options().find(b=>b.textContent==='Tak — zmień').onclick();await editing;assert.equal(run('tasks[0].time'),'13:00');assert.equal(run('tasks[0].location'),'Riesa, Niemcy');assert.match(run('tasks[0].notes'),/odebrać/);assert.equal(w.getComputedStyle(get('eventConversationPanel')).display,'none');
 assert.equal(run("voiceEventChangePreview({location:'Riesa, Niemcy'},{location:'Görlitz, Niemcy'},['location'],'Zmień lokalizację na Görlitz')"),'Zmienić lokalizację na Görlitz, Niemcy?');
 // Local decoding rejects digital silence before it can become hallucinated transcription.
 w.AudioContext=class{decodeAudioData(){return Promise.resolve({sampleRate:16000,length:1600,numberOfChannels:2,getChannelData:()=>new Float32Array(1600).fill(amplitude)})}close(){closed++;return Promise.resolve()}};
 w.audioBlob=new Blob(['audio']);assert.equal(await run('plannerRecordingAudible(audioBlob)'),false);amplitude=.002;assert.equal(await run('plannerRecordingAudible(audioBlob)'),true,'Quiet speech is not rejected');assert.equal(closed,2);
 amplitude=0;let stops=0;Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>({getTracks:()=>[{stop(){stops++}}]})},configurable:true});
 w.MediaRecorder=class{static isTypeSupported(){return true}state='inactive';start(){this.state='recording';this.onstart()}stop(){this.state='inactive';this.ondataavailable({data:w.audioBlob});this.onstop()}};
 run('Blob=audioBlob.constructor');const before=requests;await get('eventVoice').onclick();await get('eventVoice').onclick();await waitFor(()=>run('plannerRecordings.event===null'));assert.equal(requests,before);assert.equal(get('oktiDecision').hidden,true);assert.equal(get('eventVoiceHint').textContent,'');assert.ok(stops);
 // Real route connector with a mocked Worker/provider: unlocated events do not break located pairs.
 run("closeEventActions();selected=new Date('2026-11-06T12:00:00');tasks=[{id:'a',title:'Pierwsze',date:'2026-11-06',time:'17:00',endTime:'18:00',location:'Riesa, Niemcy'},{id:'unknown',title:'Wydarzenie',date:'2026-11-06',time:'20:00',endTime:'20:45'},{id:'b',title:'Spotkanie Centrum',date:'2026-11-06',time:'21:00',endTime:'22:00',location:'Görlitz, Niemcy'}];renderAll();showView('day')");
 const timeline=w.document.querySelector('.phone-timeline');Object.defineProperty(timeline,'clientWidth',{value:365});timeline.getBoundingClientRect=()=>({top:0,left:0});
 for(const [i,card] of [...timeline.querySelectorAll('.phone-event')].entries())card.getBoundingClientRect=()=>({top:i*80,right:235,height:50});
 run(fs.readFileSync('travel-routes.js','utf8'));await waitFor(()=>w.document.querySelector('.okti-route-badge')?.dataset.routeDuration==='20 min');assert.equal(routeCalls.length,1);assert.equal(routeCalls[0].origin.address,'Riesa, Niemcy');assert.equal(routeCalls[0].destination.address,'Görlitz, Niemcy');
 const heading=w.document.querySelectorAll('.phone-event-title-text')[1],line=parseFloat(w.getComputedStyle(heading.parentElement).lineHeight);assert.ok(parseFloat(heading.style.maxHeight)>=line);assert.equal(parseFloat(heading.style.maxHeight)%line,0,'Titles reserve complete lines');
 routeAvailable=false;run("tasks[2].location='Adres bez trasy';window.dispatchEvent(new Event('resize'))");await waitFor(()=>routeCalls.length===2);await waitFor(()=>!w.document.querySelector('.okti-route-badge'));
 routeAvailable=true;run("tasks[2].location='Meißen, Niemcy';window.dispatchEvent(new Event('resize'))");await waitFor(()=>w.document.querySelector('.okti-route-badge')?.dataset.routeDuration==='20 min');assert.equal(routeCalls.length,3,'Changed address invalidates a previously hidden route');
 run("tasks[2].location='  RIESA,   NIEMCY ';window.dispatchEvent(new Event('resize'))");await waitFor(()=>!w.document.querySelector('.okti-route-badge'));assert.equal(routeCalls.length,3,'Same address shows no travel');
 console.log('Feedback 33.236: concise review, correction label, hidden old panels, real recorder silence, Worker empty audio → preserved state → next normalized audio edit, located routes across unlocated events, address cache invalidation and whole title lines passed (microphone, model, speech, map providers and geometry mocked).');
}finally{dom.window.close();globalThis.fetch=nativeFetch}
