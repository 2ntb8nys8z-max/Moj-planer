import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let model,transcript,lastPayload,lastResult,modelCalls=0,requestCount=0;
const savedFetch=globalThis.fetch;globalThis.fetch=async(url)=>{if(String(url).includes('/audio/transcriptions'))return Response.json({text:transcript});modelCalls++;return Response.json({choices:[{message:{content:JSON.stringify(model)}}]})};
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});const w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext()),get=id=>w.document.getElementById(id);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async()=>Response.json({})});w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
w.testApi=async(path,options)=>{requestCount++;lastPayload=JSON.parse(options.body);const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:options.body}),env);lastResult=await response.json();assert.equal(response.status,200,JSON.stringify(lastResult));return lastResult};
run(fs.readFileSync('sync-core.js','utf8'));for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
run("plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});showPlannerWeather=async()=>{};loadVoiceMemo=async()=>null");
const event=fields=>({kind:'event',intent:'execute',action:'continue',reply:'Sprawdź.',operations:Object.entries(fields).map(([field,value])=>({op:'set',field,value})),focus:'',ambiguity:null,uiAction:null});
const command=fields=>({kind:'command',intent:'execute',action:'continue',reply:'Sprawdź.',operations:[],focus:'',ambiguity:null,uiAction:{type:'open_create_event',...fields}});
function begin(){run("closeEventActions();clearVoicePreview();tasks=[];saveTasks();testSession=beginVoiceDialogue('main',null,null)")}
async function turn(text,answer,audio=false){model=answer;transcript=text;w.testText=text;return run(`requestVoiceDialogue(testSession,${audio?'{}':'testText'}).then(r=>r&&applyVoiceDialogueResult(testSession,r))`)}
const options=()=>[...get('oktiDecision').querySelectorAll('button.okti-decision-option')];
async function settle(){await new Promise(r=>w.setTimeout(r,20))}
try{
 begin();await turn('Utwórz wizytę 4 stycznia o 7:00',command({query:'Wizyta',date:'2027-01-04',startTime:'07:00'}),true);
 assert.equal(get('oktiDecision').hidden,false);assert.equal(get('oktiDecision').querySelectorAll('[role=spinbutton]').length,2);assert.equal(run('tasks.length'),0);
 assert.equal(options().some(b=>/^07:00$|^19:00$/.test(b.textContent)),false,'Ambiguous hours use wheels, not two hour buttons');
 assert.equal(get('mainConversation').querySelector('.voice-message.user').style.display,'none');assert.equal(run('testSession.history[0].role'),'user','Full internal history remains intact');
 const priorCalls=modelCalls;const cols=get('oktiDecision').querySelectorAll('[role=spinbutton]');cols[0].scrollTop=19*44;cols[0].onscroll();cols[1].scrollTop=35*44;cols[1].onscroll();assert.match(options()[0].textContent,/19:35/);
 await options()[0].onclick();assert.equal(modelCalls,priorCalls,'Exact wheel selection does not need another model guess');assert.equal(lastPayload.manualTimeChoice.time,'19:35');assert.equal(run('tasks[0].time'),'19:35');assert.equal(run('tasks[0].endTime'),'20:35');assert.equal(get('oktiDecision').hidden,true);assert.equal(run('!!document.querySelector(".app").inert'),false);
 // Manual selection is freshness-checked on the Worker as well as in the UI.
 const stale=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({...lastPayload,manualTimeChoice:{...lastPayload.manualTimeChoice,revision:-1}})}),env);assert.equal(stale.status,409);assert.equal((await stale.json()).code,'stale_time_choice');
 // Choosing a date uses the current session; completed creation remains immediate.
 begin();await turn('Utwórz wizytę o 17:00',command({query:'Wizyta',startTime:'17:00'}));assert.ok(options().some(b=>b.textContent==='Jutro'));
 model=command({date:'2027-01-04'});await options().find(b=>b.textContent==='Jutro').onclick();assert.equal(lastPayload.text,'Jutro');assert.equal(run('tasks[0].time'),'17:00');
 // General three-option clarification remains read-only until one current button is chosen.
 begin();const ask={kind:'command',intent:'continue',action:'continue',reply:'Którą odpowiedź wybierasz?',operations:[],focus:'intent',ambiguity:null,uiAction:null,clarificationChoices:[{label:'Pierwsza',detail:'Pierwszy opis',answer:'Wybieram pierwszą.'},{label:'Druga',answer:'Wybieram drugą.'},{label:'Szukaj dalej',answer:'Poszukaj innych możliwości.'}]};
 await turn('Mam pytanie',ask);assert.equal(options().length,4);assert.equal(run('tasks.length'),0);const old=options()[0],count=requestCount;
 get('oktiDecision').querySelector('[aria-label="Zamknij pytanie"]').click();await old.onclick();assert.equal(requestCount,count,'Closed decisions cannot send stale answers');assert.equal(run('voiceDialogues.main===testSession'),true,'Hiding a question preserves the conversation');
 run("showVoiceClarification(testSession,'Którą odpowiedź wybierasz?');started=null;startPlannerRecording=(channel,makeSession)=>{started={channel,session:makeSession()}};");
 options().find(b=>b.textContent==='Wybierz głosowo').click();await settle();assert.equal(get('oktiDecision').hidden,true);assert.equal(run('started.channel'),'main');assert.equal(run('started.session===testSession'),true);assert.equal(run('!!document.querySelector(".app").inert'),false);
 // A turn failure keeps the question actionable for retry and never claims success.
 run("showVoiceClarification(testSession,'Którą odpowiedź wybierasz?');originalRequest=plannerApiRequest;plannerApiRequest=async()=>{throw Error('Test offline')}");
 await options()[0].onclick();assert.match(get('oktiDecision').querySelector('.okti-decision-error').textContent,/Test offline/);assert.equal(options()[0].disabled,false);assert.equal(run('tasks.length'),0);run('plannerApiRequest=originalRequest');
 // Switching or editing the source makes captured options stale without sending another request.
 const staleOption=options()[0],before=requestCount;run("pendingVoiceItem={type:'event',title:'Inny',date:'2027-01-05',startTime:'18:00',endTime:'19:00'}");await staleOption.onclick();assert.equal(requestCount,before);
 run("OktiCommunication.close();clearVoicePreview();pendingVoiceItem={type:'event',title:'Zachowany projekt',date:'2027-01-05',startTime:'18:00',endTime:'19:00'};showVoicePreview(pendingVoiceItem)");get('oktiDecision').querySelector('[aria-label="Zamknij pytanie"]').click();assert.equal(run('pendingVoiceItem.title'),'Zachowany projekt','Closing the review keeps its draft; only the explicit reject button discards it');
 assert.match(fs.readFileSync('index.html','utf8'),/min-height:82px/);assert.match(fs.readFileSync('index.html','utf8'),/okti-decision-card h2\{[^}]*clamp\(25px/);
 console.log('Communication UI: real normalized audio → Worker → hour/minute wheels → exact manual choice → immediate durable save; date and 3-option answers, hidden transcript/internal history, voice handoff to existing recorder, stale/closed decisions, offline retry and source freshness passed (external providers mocked).');
}finally{dom.window.close();globalThis.fetch=savedFetch}
