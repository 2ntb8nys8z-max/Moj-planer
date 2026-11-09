import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

// Real Worker -> frontend -> choice -> durable save / next turn.
// External Google, speech recognition and model responses are controlled fixtures.
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',GOOGLE_MAPS_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
let model,transcript='',maps=[],mapWait=null,mapCalls=0,lastPayload,lastResult,lastMapRequest,lastModelContext;
const nativeFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(String(url).includes('maps.googleapis.com')){mapCalls++;lastMapRequest=new URL(url);if(mapWait)await mapWait;return Response.json({status:'OK',results:maps});}
  if(String(url).includes('/audio/transcriptions'))return Response.json({text:transcript});
  lastModelContext=JSON.parse(options.body).messages;return Response.json({choices:[{message:{content:JSON.stringify(model)}}]});
};
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,run=code=>vm.runInContext(code,dom.getInternalVMContext()),get=id=>w.document.getElementById(id);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>{throw Error('Unexpected native confirmation')},alert(){},fetch:async()=>Response.json({})});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
w.testApi=async(path,options)=>{if(path==='')lastPayload=JSON.parse(options.body);const response=await worker.fetch(new Request('https://worker'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:options.body}),env);const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));if(path==='')lastResult=data;return data;};
run(fs.readFileSync('sync-core.js','utf8'));for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
run("plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});getApiInfo=async()=>({conversationFeatures:['google-geocoding-v1']});showPlannerWeather=async()=>{};loadVoiceMemo=async()=>null;OktiLocalWeather.snapshot=()=>({enabled:false})");
const options=()=>[...get('oktiDecision').querySelectorAll('.okti-decision-option')];
async function waitFor(predicate){for(let i=0;i<150;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,5));}assert.fail('Expected location state did not appear');}
const choosing=()=>run('!!OktiCommunication.getState()?.locationPicker');
const part=(type,name)=>({types:[type],long_name:name,short_name:name});
function place(city,id='one',number='12'){
  return {place_id:id,formatted_address:`Mickiewicza ${number}, ${city}, Polska`,types:['street_address'],geometry:{location:{lat:52.2,lng:21.0},location_type:'ROOFTOP'},address_components:[part('route','Mickiewicza'),part('street_number',number),part('locality',city),part('country','PL')]};
}
function begin(){run("closeEventActions();clearVoicePreview();tasks=[{id:'one',title:'Spotkanie',date:'2027-01-04',time:'17:00',endTime:'18:00',location:'',notes:'Ważna notatka'}];saveTasks();openEventActions(tasks[0]);testSession=beginVoiceDialogue('event','one',voiceEventSnapshot(tasks[0]))");}
function answer(location,extra=[],locationContext){return {kind:'event',intent:'modify',action:'continue',reply:'Sprawdź.',operations:[{op:'set',field:'location',value:location},...extra],focus:'',ambiguity:null,uiAction:null,...(locationContext?{locationContext}:{})};}
async function turn(text,patch,audio=false){model=patch;transcript=text;w.testText=text;return run(`requestVoiceDialogue(testSession,${audio?'{}':'testText'}).then(result=>result&&applyVoiceDialogueResult(testSession,result))`);}
try{
  for(const audio of [false,true]){
    begin();maps=[place('Warszawa','first','12'),place('Warszawa','second','14')];
    const pending=turn('Mickiewicza w Warszawie.',answer('Mickiewicza, Warszawa'),audio);await waitFor(choosing);
    assert.deepEqual(options().map(button=>button.textContent),maps.map(result=>result.formatted_address));
    assert.equal(get('googleLocationModal'),null);assert.equal(run('tasks[0].location'),'');
    await options()[1].onclick();await pending;
    assert.equal(run('tasks[0].googlePlace.placeId'),'second');assert.equal(run('tasks[0].notes'),'Ważna notatka');assert.equal(run('tasks.length'),1);
    assert.equal(get('eventChangePreview').classList.contains('hidden'),true);assert.equal(get('oktiDecision').hidden,true);
    assert.equal(JSON.parse(run('PlannerData.storage.getItem(TASK_KEY)'))[0].googlePlace.placeId,'second');
  }
  begin();maps=[place('Warszawa')];let pending=turn('Mickiewicza w Warszawie',answer('Mickiewicza, Warszawa'));await waitFor(choosing);
  assert.deepEqual(options().map(button=>button.textContent),['Tak','Nie']);const stale=options()[0];await options()[1].onclick();await pending;
  assert.equal(run('tasks[0].location'),'');assert.equal(run('testSession.dialogueState.draft.location'),'');assert.equal(get('oktiDecision').hidden,true);
  await stale.onclick();assert.equal(run('tasks[0].location'),'','Old buttons cannot approve a rejected location');

  // A place choice never approves a simultaneous title change.
  begin();pending=turn('Zmień nazwę i adres.',answer('Mickiewicza, Warszawa',[{op:'set',field:'title',value:'Nowa nazwa'}]));await waitFor(choosing);await options()[0].onclick();
  await waitFor(()=>!get('eventChangePreview').classList.contains('hidden'));assert.equal(run('tasks[0].title'),'Spotkanie');assert.equal(run('tasks[0].location'),'');get('eventChangeCancel').click();await pending;

  // Different towns, or more than three addresses, ask for context instead of a long menu.
  for(const results of [[place('Warszawa'),place('Poznań','two')],Array.from({length:5},(_,i)=>place('Warszawa','p'+i,String(i+1)))]){
    begin();maps=results;await turn('Nowa Wieś',answer('Nowa Wieś'));
    assert.match(get('oktiDecisionQuestion').textContent,results.length>3?/kilka adresów.*numer budynku/:/kilka miejsc.*kraj, region/);assert.equal(run('tasks[0].location'),'');assert.equal(get('googleLocationModal'),null);
    assert.equal(run('testSession.dialogueState.locationSearch.query'),'Nowa Wieś');
    maps=[place('Warszawa')];pending=turn('W Polsce, niedaleko Warszawy.',answer('Nowa Wieś, niedaleko Warszawy, Polska'));await waitFor(choosing);
    assert.equal(JSON.parse(lastModelContext[1].content).locationSearch.query,'Nowa Wieś');await options()[1].onclick();await pending;
  }

  // "Centre" cannot disappear behind a result for the entire city.
  begin();maps=[{...place('Jelenia Góra'),formatted_address:'Jelenia Góra, Polska',types:['locality','political'],address_components:[part('locality','Jelenia Góra'),part('country','PL')]}];
  pending=turn('Centrum Jeleniej Góry.',answer('centrum Jelenia Góra'));await waitFor(choosing);assert.match(get('oktiDecisionQuestion').textContent,/całe miasto: Jelenia Góra/);await options()[1].onclick();await pending;

  // A fresh device city is sent to the model and strictly scopes a street-only map lookup.
  run("OktiLocalWeather.snapshot=()=>({enabled:true,place:{city:'Warszawa',countryCode:'PL',checkedAt:Date.now()}})");
  for(const audio of [false,true]){
    begin();maps=[place('Poznań','wrong'),place('Warszawa','right')];
    pending=turn('Ulica Mickiewicza 12',answer('Mickiewicza 12',[],{streetOnly:true}),audio);await waitFor(choosing);
    assert.equal(lastPayload.dialogueState.deviceLocation.city,'Warszawa');assert.equal(JSON.parse(lastModelContext[1].content).deviceLocation.city,'Warszawa');
    assert.match(lastMapRequest.searchParams.get('address'),/Warszawa/);assert.equal(lastMapRequest.searchParams.get('components'),'country:PL');assert.match(get('oktiDecisionQuestion').textContent,/Warszawa/);assert.doesNotMatch(get('oktiDecisionQuestion').textContent,/Poznań/);
    await options()[0].onclick();await pending;assert.equal(run('tasks[0].googlePlace.placeId'),'right');
  }
  // An explicitly named other town wins over the device city.
  begin();maps=[place('Poznań','explicit')];pending=turn('Mickiewicza 12 w Poznaniu.',answer('Mickiewicza 12, Poznań',[],{city:'Poznań',streetOnly:false}));await waitFor(choosing);assert.doesNotMatch(lastMapRequest.searchParams.get('address'),/Warszawa/);await options()[0].onclick();await pending;assert.equal(run('tasks[0].googlePlace.placeId'),'explicit');
  // No permission / no known city: no worldwide street search is issued.
  run("OktiLocalWeather.snapshot=()=>({enabled:false})");begin();const calls=mapCalls;await turn('Ulica Mickiewicza 12',answer('Mickiewicza 12',[],{streetOnly:true}));
  assert.equal(mapCalls,calls);assert.match(get('oktiDecisionQuestion').textContent,/jakiej miejscowości/);assert.equal(run('testSession.dialogueState.locationSearch.query'),'Mickiewicza 12');
  maps=[place('Warszawa')];pending=turn('Warszawa',answer('Mickiewicza 12, Warszawa',[],{city:'Warszawa',streetOnly:false}));await waitFor(choosing);assert.equal(JSON.parse(lastModelContext[1].content).locationSearch.query,'Mickiewicza 12');await options()[0].onclick();await pending;assert.equal(run('tasks[0].googlePlace.city'),'Warszawa');

  // Closing the event settles the in-flight turn and late map results stay inert.
  begin();let release;mapWait=new Promise(resolve=>release=resolve);const before=mapCalls;pending=turn('Adres w Warszawie',answer('Mickiewicza, Warszawa'));await waitFor(()=>mapCalls>before);run('closeEventActions()');release();await pending;mapWait=null;
  assert.equal(run('tasks[0].location'),'');assert.equal(get('oktiDecision').hidden,true);
  console.log('33.265: compact single/multiple choices, one approval, decline/stale/cancel, mixed-edit approval, centre specificity, ambiguity narrowing and device-city street filtering passed through Worker/frontend for text and normalized audio (providers mocked).');
}finally{globalThis.fetch=nativeFetch;dom.window.close();}
