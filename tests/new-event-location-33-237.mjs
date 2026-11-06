import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const token='test-only-token-1234567890123456',env={PLANNER_ACCESS_TOKEN:token,OPENAI_API_KEY:'dummy',GOOGLE_MAPS_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let model,transcript='',city='Radeburg',lastPayload,lastResult,lastContext,microphones=0;
const nativeFetch=globalThis.fetch,part=(type,long,short=long)=>({types:[type],long_name:long,short_name:short});
globalThis.fetch=async(url,options)=>{
 if(String(url).includes('maps.googleapis.com'))return Response.json({status:'OK',results:[{place_id:'place-'+city,formatted_address:city+', Niemcy',types:['locality','political'],geometry:{location:{lat:51.2,lng:13.7},location_type:'APPROXIMATE'},address_components:[part('locality',city),part('administrative_area_level_1','Sachsen'),part('country','Deutschland','DE')]}]});
 if(String(url).includes('/audio/transcriptions'))return Response.json({text:transcript});
 lastContext=JSON.parse(options.body).messages;return Response.json({choices:[{message:{content:JSON.stringify(model)}}]});
};
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext()),get=id=>w.document.getElementById(id);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async()=>Response.json({})});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
Object.defineProperty(w.navigator,'mediaDevices',{value:{getUserMedia:async()=>{microphones++;return {getTracks:()=>[{stop(){}}]}}},configurable:true});
w.MediaRecorder=class{static isTypeSupported(){return true}state='inactive';start(){this.state='recording';this.onstart()}stop(){this.state='inactive';this.ondataavailable({data:new w.Blob(['audio'],{type:'audio/mp4'})});this.onstop()}};
w.testApi=async(path,options)=>{if(path==='')lastPayload=JSON.parse(options.body);const response=await worker.fetch(new Request('https://worker'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:options.body}),env);const result=await response.json();assert.equal(response.status,200,JSON.stringify(result));if(path==='')lastResult=result;return result};
run(fs.readFileSync('sync-core.js','utf8'));for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
run("plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});getApiInfo=async()=>({conversationFeatures:['google-geocoding-v1']});showPlannerWeather=async()=>{};loadVoiceMemo=async()=>null");
const choices=()=>[...get('oktiDecision').querySelectorAll('.okti-decision-option')];
async function waitFor(f){for(let i=0;i<100;i++){if(f())return;await new Promise(r=>w.setTimeout(r,10))}assert.fail('Expected state did not appear')}
function begin(){run("closeEventActions();clearVoicePreview();tasks=[];ideas=[];saveTasks();testSession=beginVoiceDialogue('main',null,null)")}
const create=(extra={})=>({kind:'event',intent:'execute',action:'continue',reply:'Sprawdź.',operations:Object.entries({title:'Wymiana opon',date:'2027-01-04',startTime:'17:00',notes:'Zabrać dokumenty',...extra}).map(([field,value])=>({op:'set',field,value})),focus:'',ambiguity:null,uiAction:null});
async function turn(text,answer,audio=false){model=answer;transcript=text;w.testText=text;return run(`requestVoiceDialogue(testSession,${audio?'{}':'testText'}).then(r=>r&&applyVoiceDialogueResult(testSession,r))`)}
try{
 for(const audio of [false,true]){
  begin();await turn('Utwórz wymianę opon 4 stycznia o 17:00.',create(),audio);
  assert.equal(run('tasks.length'),1);assert.equal(JSON.parse(run('PlannerData.storage.getItem(TASK_KEY)')).length,1,'Offer follows the durable save');assert.equal(run('tasks[0].endTime'),'18:00');
  assert.equal(get('oktiDecisionQuestion').textContent,'Dodać lokalizację?');assert.deepEqual(choices().map(b=>b.textContent),['Tak — dodaj głosowo','Nie — zakończ']);assert.equal(microphones,0);
  const stale=choices()[0],result=lastResult;w.duplicate=result;await run('applyVoiceDialogueResult(testSession,duplicate)');assert.equal(choices().length,2,'Duplicate delivery leaves the follow-up intact');
  const before=run('JSON.stringify(tasks)');await choices()[1].onclick();assert.equal(run('JSON.stringify(tasks)'),before);assert.equal(get('oktiDecision').hidden,true);assert.equal(!!w.document.querySelector('.app').inert,false);await stale.onclick();assert.equal(microphones,0);
 }
 begin();await turn('Utwórz wydarzenie 4 stycznia o 17:00.',create(),true);await choices()[0].onclick();await waitFor(()=>run("plannerRecordings.event?.mode==='recording'"));assert.equal(microphones,1);assert.equal(run('activeTask.id'),run('tasks[0].id'));assert.equal(run('voiceDialogues.event.dialogueState.pendingField'),'location');
 transcript='Radeburg, Niemcy.';model={kind:'event',intent:'modify',action:'continue',reply:'Sprawdź.',operations:[{op:'set',field:'location',value:'Radeburg, Niemcy'}],focus:'',ambiguity:null,uiAction:null,locationContext:{city:'Radeburg',country:'Niemcy',clarification:null}};
 await get('eventVoice').onclick();await waitFor(()=>!get('eventChangePreview').classList.contains('hidden'));
 assert.equal(lastPayload.currentItem.eventId,run('tasks[0].id'));assert.equal(JSON.parse(lastContext[1].content).requiredNext,'location');assert.ok(lastPayload.dialogue.some(m=>m.content==='Podaj lokalizację tego wydarzenia.'));
 assert.equal(get('oktiDecisionQuestion').textContent,'Dodać lokalizację: Radeburg, Niemcy?');assert.equal(choices()[0].textContent,'Tak — dodaj');assert.equal(choices()[0].classList.contains('is-primary'),true);assert.equal(choices()[1].classList.contains('is-primary'),false);await choices()[0].onclick();await waitFor(()=>get('oktiDecision').hidden);
 assert.equal(run('tasks.length'),1);assert.equal(run('tasks[0].location'),'Radeburg, Niemcy');assert.equal(run('tasks[0].googlePlace.placeId'),'place-Radeburg');assert.equal(run('tasks[0].title'),'Wymiana opon');assert.equal(run('tasks[0].time'),'17:00');assert.equal(run('tasks[0].endTime'),'18:00');assert.equal(run('tasks[0].notes'),'Zabrać dokumenty');
 assert.equal(run("voiceEventChangePreview({location:'Radeburg, Niemcy'},{location:'Görlitz, Niemcy'},['location'],'')"),'Zmienić lokalizację na Görlitz, Niemcy?');
 // Existing location: creation does not ask for the same address again.
 begin();await turn('Utwórz wydarzenie 4 stycznia o 17:00 w Radeburg.',create({location:'Radeburg, Niemcy'}));assert.equal(run('tasks.length'),1);assert.equal(get('oktiDecision').hidden,true);
 // A recurring creation offers once; the target is the first actual saved occurrence.
 begin();await turn('Utwórz wydarzenie 4 stycznia o 17:00, codziennie dwa razy.',create({recurrence:{frequency:'daily',interval:1,count:2}}));assert.equal(run('tasks.length'),2);assert.equal(run('OktiCommunication.getState().eventId'),run('tasks[0].id'));assert.equal(choices().length,2);get('oktiDecision').querySelector('[aria-label="Zamknij pytanie"]').click();assert.equal(run('tasks.length'),2);
 // Manual creation uses the same follow-up and leaves the saved record untouched on refusal.
 begin();get('title').value='Ręczne';get('date').value='2027-01-04';get('time').value='17:00';get('endTime').value='18:00';get('newLocation').value='';await get('form').onsubmit({preventDefault(){}});assert.equal(run('tasks.length'),1);assert.equal(get('oktiDecisionQuestion').textContent,'Dodać lokalizację?');await choices()[1].onclick();assert.equal(run('tasks[0].location'),'');
 // A stale follow-up cannot open a different event or overwrite a newly supplied address.
 begin();await turn('Utwórz wydarzenie 4 stycznia o 17:00.',create());const old=choices()[0];run("tasks[0].location='Adres dodany w międzyczasie';saveTasks()");await old.onclick();assert.equal(microphones,1);get('oktiDecision').querySelector('[aria-label="Zamknij pytanie"]').click();
 // Failed storage cannot produce the post-save offer; the existing retry remains available.
 begin();run("originalCommit=PlannerData.commit;PlannerData.commit=()=>{throw Error('Storage unavailable')}");await turn('Utwórz wydarzenie 4 stycznia o 17:00.',create());assert.equal(run('tasks.length'),0);assert.notEqual(get('oktiDecisionQuestion').textContent,'Dodać lokalizację?');run('PlannerData.commit=originalCommit');
 console.log('New-event location: Worker → frontend → durable creation → optional offer → existing event recorder → normalized audio → Google → add-location review → same saved event; text/audio, skip/X, duplicate responses, manual/recurring/already-located creation, stale targets and storage failures passed (external providers and microphone mocked).');
}finally{dom.window.close();globalThis.fetch=nativeFetch}
