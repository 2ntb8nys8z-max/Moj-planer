import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const token='test-only-token-1234567890123456',env={PLANNER_ACCESS_TOKEN:token,OPENAI_API_KEY:'dummy',GOOGLE_MAPS_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const savedFetch=globalThis.fetch;let model,transcript='',lastModelContext,lastPayload,lastResult,mapsCalls=0;
const component=(type,long,short=long)=>({types:[type],long_name:long,short_name:short});
globalThis.fetch=async(url,options)=>{
 if(String(url).startsWith('https://maps.googleapis.com/')){mapsCalls++;return Response.json({status:'OK',results:[{place_id:'test-meissen',formatted_address:'Meißen, Sachsen, Deutschland',types:['locality','political'],geometry:{location:{lat:51.16,lng:13.47},location_type:'APPROXIMATE'},address_components:[component('locality','Meißen'),component('administrative_area_level_1','Sachsen'),component('country','Deutschland','DE')]}]})}
 if(String(url).includes('/audio/transcriptions'))return Response.json({text:transcript});
 lastModelContext=JSON.parse(options.body).messages;
 return Response.json({choices:[{message:{content:JSON.stringify(model)}}]});
};
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,run=s=>vm.runInContext(s,dom.getInternalVMContext()),get=id=>w.document.getElementById(id);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>true,alert(){},fetch:async()=>Response.json({})});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
w.testApi=async(path,options)=>{if(path==='')lastPayload=JSON.parse(options.body);const response=await worker.fetch(new Request('https://worker'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:options.body}),env);lastResult=await response.json();assert.equal(response.status,200,JSON.stringify(lastResult));return lastResult};
run(fs.readFileSync('sync-core.js','utf8'));for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
run("plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});getApiInfo=async()=>({conversationFeatures:['google-geocoding-v1']});showPlannerWeather=async()=>{};loadVoiceMemo=async()=>null");
const ask=(reply,locationContext)=>({kind:'command',intent:'continue',action:'continue',reply,operations:[],focus:'location',ambiguity:null,uiAction:null,...(locationContext?{locationContext}:{})});
function begin(){run("closeEventActions();clearVoicePreview();tasks=[{id:'one',title:'Wymiana opon',date:'2027-01-04',time:'17:00',endTime:'18:00',location:'',notes:'Ważna notatka',history:[]}];saveTasks();openEventActions(tasks[0]);testSession=beginVoiceDialogue('event','one',voiceEventSnapshot(tasks[0]))")}
async function turn(text,answer,audio=false){model=answer;transcript=text;w.testText=text;return run(`requestVoiceDialogue(testSession,${audio?'{}':'testText'}).then(r=>r&&applyVoiceDialogueResult(testSession,r))`)}
async function waitFor(predicate){for(let n=0;n<100;n++){if(predicate())return;await new Promise(r=>w.setTimeout(r,5))}assert.fail('Expected state did not appear')}
try{
 for(const audio of [false,true]){
  begin();await turn('Dodaj mi lokalizację centrum miasta Meissen w Dolnej Saksonii.',ask('Doprecyzuj region.',{city:'Meissen',region:'Dolna Saksonia',country:'Niemcy',area:'centrum',clarification:'region'}),audio);
  assert.equal(run('testSession.dialogueState.locationContext.city'),'Meissen');assert.match(get('oktiDecisionQuestion').textContent,/Meissen/);assert.equal(run('tasks[0].location'),'');
  assert.ok(get('oktiDecision').querySelector('button.okti-decision-option strong').textContent.includes('Meissen'));
  await turn('No tak, masz rację, mój błąd. W Excelsior.',ask('Podaj miasto.',{city:'Excelsior',clarification:'city'}),audio);
  assert.equal(run('testSession.dialogueState.locationContext.city'),'Meissen');assert.equal(run('testSession.dialogueState.locationContext.alternativeCity'),'Excelsior');assert.match(get('oktiDecisionQuestion').textContent,/Meissen.*Excelsior/);
  // The first utterance may leave the history window; structured memory still carries the city.
  run("testSession.history=Array.from({length:24},(_,i)=>({role:i%2?'assistant':'user',content:'Dodatkowa rozmowa '+i}))");
  await turn('W Dolnej Saksonii, w Niemczech. Chcę być w centrum miasta.',ask('Jakie miasto?',{country:'Niemcy',region:'Dolna Saksonia',area:'centrum',clarification:'city'}),audio);
  const context=JSON.parse(lastModelContext[1].content);assert.equal(context.locationContext.city,'Meissen');assert.equal(lastPayload.dialogueState.locationContext.city,'Meissen');assert.match(get('oktiDecisionQuestion').textContent,/Meissen/);assert.equal(run('tasks[0].notes'),'Ważna notatka');assert.equal(run('tasks[0].location'),'');
  // A genuine different-city command is allowed; ordinary omissions cannot reset it.
  await turn('Zmień miejscowość na Hannover.',ask('Doprecyzuj adres.',{city:'Hannover',cityChange:'replace',clarification:null}),audio);
  assert.equal(run('testSession.dialogueState.locationContext.city'),'Hannover');assert.equal(run('testSession.dialogueState.locationContext.alternativeCity'),undefined);
 }
 begin();await turn('Centrum Meissen.',ask('Potwierdź miejscowość.',{city:'Meissen',country:'Niemcy',area:'centrum',clarification:'city'}));
 await turn('Nadal chodzi o Meißen.',ask('Potwierdź region.',{city:'Meißen',clarification:'region',alternativeCity:null}));assert.equal(run('testSession.dialogueState.locationContext.alternativeCity'),undefined,'ss and ß do not invent a different city');
 // The button answer passes through the actual request, resolver, review and atomic edit.
 model={kind:'event',intent:'modify',action:'continue',reply:'Sprawdź miejsce.',operations:[{op:'set',field:'location',value:'Centrum Meißen, Niemcy'}],focus:'',ambiguity:null,uiAction:null,locationContext:{city:'Meißen',clarification:null,alternativeCity:null}};
 const choose=[...get('oktiDecision').querySelectorAll('.okti-decision-option')].find(b=>b.textContent.includes('Meißen')&&!b.textContent.includes('głosowo'));
 const changing=choose.onclick();await waitFor(()=>!get('eventChangePreview').classList.contains('hidden'));
 assert.match(lastPayload.text,/Tak, nadal chodzi/);assert.equal(mapsCalls,1);assert.equal(run('tasks[0].location'),'');assert.match(get('oktiDecisionQuestion').textContent,/Zapisać zmianę/);
 const confirm=[...get('oktiDecision').querySelectorAll('.okti-decision-option')].find(b=>b.textContent==='Tak — zapisz');await confirm.onclick();await changing;
 assert.equal(run('tasks[0].googlePlace.placeId'),'test-meissen');assert.equal(run('tasks[0].notes'),'Ważna notatka');assert.equal(get('oktiDecision').hidden,true);
 // An unresolved guessed new city is not allowed into a reviewed location mutation.
 begin();await turn('Meissen.',ask('Potwierdź.',{city:'Meissen',clarification:'city'}));
 await turn('W Excelsior.',{...model,operations:[{op:'set',field:'location',value:'Excelsior'}],locationContext:{city:'Excelsior',clarification:null,alternativeCity:null}});
 assert.equal(lastResult.item,undefined);assert.equal(lastResult.dialogueState.locationContext.city,'Meissen');assert.equal(lastResult.dialogueState.draft.location,'');assert.equal(run('tasks[0].location'),'');
 // Context does not leak to a different event.
 run("tasks.push({id:'two',title:'Inne',date:'2027-01-05',time:'18:00',endTime:'19:00'});oldMemory=testSession.dialogueState;closeEventActions();openEventActions(tasks[1]);testSession=beginVoiceDialogue('event','two',voiceEventSnapshot(tasks[1]));testSession.dialogueState=oldMemory");
 await turn('Jak mogę zmienić to wydarzenie?',ask('Powiedz, co zmienić.'));assert.equal(lastResult.dialogueState.locationContext,undefined);
 console.log('Location memory: real Worker → frontend → next typed/audio turn, history trimming, original city/region/centre, uncertain transcription, explicit replacement, aliases, large choice buttons → Google → review → saved location and event isolation passed (external providers mocked).');
}finally{dom.window.close();globalThis.fetch=savedFetch}
