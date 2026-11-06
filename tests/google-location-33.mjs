import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

const {default:worker}=await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'));
const token='test-only-token-1234567890123456';
let mapsCalls=0,modelCalls=0,limited=false,googleStatus='OK',googleResults=[],model,transcript='',delayMaps=null,googleHttpStatus=200;
const queries=[],sqlCalls=[];
const env={PLANNER_ACCESS_TOKEN:token,OPENAI_API_KEY:'dummy',GOOGLE_MAPS_API_KEY:'test-secret-do-not-expose',API_LIMITS_DB:{prepare(sql){sqlCalls.push(sql);return {run:async()=>{},bind(){return this},first:async()=>limited&&sql.includes('INSERT INTO planner_maps_quota')?null:{}}}}};
const savedFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(String(url).startsWith('https://maps.googleapis.com/')){
    if(options.redirect==='error')throw new TypeError('Invalid redirect value, must be one of follow or manual');
    mapsCalls++;const query=new URL(url);queries.push(query);
    assert.equal(query.searchParams.get('key'),env.GOOGLE_MAPS_API_KEY);
    assert.equal(query.searchParams.get('language'),'pl');assert.equal(options.redirect,'manual');
    if(delayMaps)await delayMaps;
    if(googleHttpStatus!==200)return new Response(null,{status:googleHttpStatus,headers:{Location:'https://another-host.invalid/'}});
    return Response.json({status:googleStatus,results:googleResults,error_message:env.GOOGLE_MAPS_API_KEY});
  }
  if(String(url).includes('/audio/transcriptions'))return Response.json({text:transcript});
  assert.equal(new URL(url).hostname,'api.openai.com');modelCalls++;
  return Response.json({choices:[{message:{content:JSON.stringify(model)}}]});
};
const component=(type,long,short=long)=>({types:[type],long_name:long,short_name:short});
const street={partial_match:true,place_id:'google-street-id',formatted_address:'Wyszogrodzka, Warszawa, Polska',types:['route'],geometry:{location:{lat:52.29,lng:21.04},location_type:'GEOMETRIC_CENTER'},address_components:[component('route','Wyszogrodzka'),component('locality','Warszawa'),component('country','Polska','PL')]};
const building={...street,place_id:'google-building-id',formatted_address:'Wyszogrodzka 10, Warszawa, Polska',types:['street_address'],geometry:{location:{lat:52.291,lng:21.041},location_type:'ROOFTOP'},address_components:[...street.address_components,component('street_number','10')]};
async function post(path,body,overrides={}){
  const response=await worker.fetch(new Request('https://worker'+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify(body)}),{...env,...overrides});
  return {status:response.status,data:await response.json()};
}
async function waitFor(predicate){for(let n=0;n<100;n++){if(predicate())return;await new Promise(r=>setTimeout(r,5))}assert.fail('Expected UI state did not appear')}
let dom;
try{
  googleResults=[street,building,{...street,place_id:'bad',geometry:{location:{lat:91,lng:21}}},street];
  let result=await post('/locations/resolve',{query:'Wyszogrodzka, Warszawa'});
  assert.equal(result.status,200);assert.equal(result.data.places.length,2);
  assert.equal(result.data.places[0].kind,'street');assert.equal(result.data.places[0].number,'');
  assert.equal(result.data.places[1].kind,'address');assert.equal(result.data.places[1].number,'10');
  assert.equal(JSON.stringify(result.data).includes(env.GOOGLE_MAPS_API_KEY),false);
  assert.ok(sqlCalls.some(sql=>sql.includes('planner_maps_quota')&&sql.includes('RETURNING *')));
  assert.equal(sqlCalls.some(sql=>sql.includes('INSERT INTO planner_api_quota')),false,'Geocoding does not consume AI quota');
  const before=mapsCalls;
  for(const query of ['',null,'a'.repeat(501)])assert.equal((await post('/locations/resolve',{query})).status,400);
  assert.equal((await post('/locations/resolve',{query:'Warszawa',countryCode:'pl'})).status,400);
  assert.equal((await post('/locations/resolve',{query:'Warszawa'},{GOOGLE_MAPS_API_KEY:''})).data.code,'maps_not_configured');
  const denied=await worker.fetch(new Request('https://worker/locations/resolve',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:'Warszawa'})}),env);
  assert.equal(denied.status,401);assert.equal(mapsCalls,before,'Invalid, missing-key and unauthorized requests do not contact Google');
  limited=true;assert.equal((await post('/locations/resolve',{query:'Warszawa'})).data.code,'maps_limit');assert.equal(mapsCalls,before);limited=false;
  googleStatus='REQUEST_DENIED';result=await post('/locations/resolve',{query:'Warszawa'});assert.equal(result.status,503);assert.equal(result.data.code,'maps_denied');assert.equal(JSON.stringify(result.data).includes(env.GOOGLE_MAPS_API_KEY),false);
  googleStatus='OVER_QUERY_LIMIT';assert.equal((await post('/locations/resolve',{query:'Warszawa'})).status,429);
  googleHttpStatus=302;assert.equal((await post('/locations/resolve',{query:'Warszawa'})).status,502,'Redirects are rejected without forwarding the Google key');googleHttpStatus=200;
  googleStatus='ZERO_RESULTS';assert.deepEqual((await post('/locations/resolve',{query:'Nic'})).data.places,[]);
  googleStatus='OK';googleResults=[{...street,partial_match:true}];
  result=await post('/locations/resolve',{query:'Wyszogrodzka, Warszawa, Polska',countryCode:'PL'});assert.equal(result.data.places[0].partialMatch,true);assert.equal(queries.at(-1).searchParams.get('components'),'country:PL');

  dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test/',runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,ctx=dom.getInternalVMContext(),run=code=>vm.runInContext(code,ctx),get=id=>w.document.getElementById(id);
  let lastPayload;
  Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>true,alert(){},fetch:async(url,options={})=>{
    if(String(url).includes('.workers.dev')){
      if(options.body){lastPayload=JSON.parse(options.body);if(lastPayload.dialogueState)delete lastPayload.dialogueState.eventCreationPolicy;options={...options,body:JSON.stringify(lastPayload)};} // Legacy review client; immediate persistence is tested separately.
      return worker.fetch(new Request(String(url),options),env);
    }
    throw Error('Unexpected browser request: '+url);
  }});
  w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
  for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
  run(`saveApiAccess('${token}');showPlannerWeather=async()=>{};loadVoiceMemo=async()=>null`);
  w.testAudio=new w.Blob(['audio'],{type:'audio/mp4'});run('plannerAudioPayload=async()=>({base64:"YXVkaW8=",type:"audio/mp4"})');
  const eventAnswer=()=>({kind:'event',intent:'execute',action:'continue',reply:'Sprawdź wydarzenie.',operations:[{op:'set',field:'title',value:'Spotkanie'},{op:'set',field:'date',value:'2026-11-06'},{op:'set',field:'startTime',value:'14:00'},{op:'set',field:'endTime',value:'15:00'},{op:'set',field:'location',value:'Wyszogrodzka, Warszawa'}],ambiguity:null,focus:'',uiAction:null});
  for(const audio of [false,true]){
    run("clearVoicePreview();tasks=[];saveTasks();testSession=beginVoiceDialogue('main',null,null)");
    model=eventAnswer();googleResults=[street];const count=mapsCalls;
    transcript='Utwórz spotkanie jutro o 14:00 do 15:00 przy Wyszogrodzkiej w Warszawie.';
    const pending=run(`requestVoiceDialogue(testSession,${audio?'testAudio':JSON.stringify(transcript)}).then(async result=>{testResult=result;if(result)await applyVoiceDialogueResult(testSession,result)})`);
    await waitFor(()=>get('googleLocationChoices')?.children.length);
    assert.equal(run('tasks.length'),0,'No write before confirming the Google place');
    assert.match(get('googleLocationChoices').textContent,/bez numeru budynku/);
    get('googleLocationChoices').querySelector('button').click();await pending;
    assert.equal(run('pendingVoiceItem.location'),street.formatted_address);assert.equal(run('pendingVoiceItem.googlePlace.placeId'),street.place_id);assert.equal(run('tasks.length'),0);
    // Next text turn crosses the Worker again and retains the chosen place.
    model={kind:'event',intent:'modify',action:'continue',reply:'Nowa nazwa.',operations:[{op:'set',field:'title',value:'Zmienione spotkanie'}],ambiguity:null,focus:'',uiAction:null};
    run("testSession=beginVoiceDialogue('main',null,pendingVoiceItem)");
    await run("requestVoiceDialogue(testSession,'Zmień nazwę na Zmienione spotkanie').then(r=>r&&applyVoiceDialogueResult(testSession,r))");
    assert.equal(lastPayload.currentItem.googlePlace.placeId,street.place_id);
    assert.equal(run('pendingVoiceItem.googlePlace.placeId'),street.place_id,'Changing the title retains the selected place across turns');
    await run("document.getElementById('confirmVoice').onclick()");
    assert.equal(run('tasks.length'),1);assert.equal(run('tasks[0].title'),'Zmienione spotkanie');assert.equal(run('tasks[0].googlePlace.placeId'),street.place_id);assert.equal(run('tasks[0].weatherPlace.latitude'),52.29);assert.equal(mapsCalls,count+1,'Next turn and save do not repeat the Google lookup');
    const link=new URL(run('plannerGoogleMapsUrl(tasks[0])'));assert.equal(link.searchParams.get('query_place_id'),street.place_id);assert.equal(link.searchParams.get('query'),'52.29,21.04');
    assert.equal(run('PlannerData.storage.getItem(TASK_KEY).includes("google-street-id")'),true);
  }

  // A unique exact town (whose centre is approximate by nature) resolves with
  // no picker. Exact buildings do too; partial results still require choice.
  const city={...street,partial_match:false,place_id:'ruciane-nida',formatted_address:'Ruciane-Nida, Polska',types:['locality','political'],geometry:{location:{lat:53.64,lng:21.54},location_type:'APPROXIMATE'},address_components:[component('locality','Ruciane-Nida'),component('country','Polska','PL')]};
  googleResults=[city];w.item={type:'event',location:'Ruciane Nida'};
  assert.equal(await run('choosePlannerGoogleLocation(item)'),true);assert.equal(w.item.googlePlace.placeId,'ruciane-nida');assert.equal(get('googleLocationModal'),null,'A unique town does not ask for confirmation');
  googleResults=[{...building,partial_match:false}];w.item={type:'event',location:'Wyszogrodzka 10, Warszawa'};
  assert.equal(await run('choosePlannerGoogleLocation(item)'),true);assert.equal(w.item.googlePlace.placeId,building.place_id);assert.equal(get('googleLocationModal'),null);

  // Manual create/edit use the same lookup and retain the selected coordinates.
  googleResults=[street];run("tasks=[];saveTasks();document.getElementById('title').value='Ręczne spotkanie';document.getElementById('date').value='2026-11-06';document.getElementById('time').value='16:00';document.getElementById('endTime').value='17:00';document.getElementById('newLocation').value='Wyszogrodzka, Warszawa'");
  let manual=run("document.getElementById('form').onsubmit({preventDefault(){}})");await waitFor(()=>get('googleLocationChoices')?.children.length);get('googleLocationChoices').firstChild.click();await manual;
  assert.equal(run('tasks.length'),1);assert.equal(run('tasks[0].googlePlace.placeId'),street.place_id);
  run("openEventActions(tasks[0]);document.getElementById('editLocation').value='Wyszogrodzka 10, Warszawa'");googleResults=[building];
  manual=run("document.getElementById('saveEdit').onclick()");await waitFor(()=>get('googleLocationChoices')?.children.length);assert.equal(run('tasks[0].googlePlace.placeId'),street.place_id);get('googleLocationChoices').firstChild.click();await manual;
  assert.equal(run('tasks[0].googlePlace.placeId'),building.place_id);assert.equal(run('tasks[0].weatherPlace.longitude'),building.geometry.location.lng);
  run("document.getElementById('editLocation').value=''");await run("document.getElementById('saveEdit').onclick()");assert.equal(run('tasks[0].googlePlace'),undefined);assert.equal(run('tasks[0].weatherPlace'),undefined);
  run('closeEventActions()');

  // An event's spoken location edit still waits for that event's own approval.
  run("openEventActions(tasks[0]);testSession=beginVoiceDialogue('event',activeTask.id,voiceEventSnapshot(activeTask))");
  model={kind:'event',intent:'modify',action:'continue',reply:'Sprawdź miejsce.',operations:[{op:'set',field:'location',value:'Wyszogrodzka 10, Warszawa'}],focus:'',ambiguity:null,uiAction:null};
  const edit=run("requestVoiceDialogue(testSession,'Ustaw lokalizację Wyszogrodzka 10, Warszawa').then(r=>r&&applyVoiceDialogueResult(testSession,r))");
  await waitFor(()=>get('googleLocationChoices')?.children.length);get('googleLocationChoices').firstChild.click();await waitFor(()=>!get('eventChangePreview').classList.contains('hidden'));
  assert.equal(run('tasks[0].location'),'');get('eventChangeConfirm').click();await edit;assert.equal(run('tasks[0].googlePlace.placeId'),building.place_id);run('closeEventActions()');

  // An already typed address can be explicitly verified later. The model's
  // capability disclaimer must not suppress the real Google lookup.
  run("delete tasks[0].googlePlace;delete tasks[0].weatherPlace;tasks[0].location='Wyszogrodzka 10, Warszawa';saveTasks();openEventActions(tasks[0]);testSession=beginVoiceDialogue('event',activeTask.id,voiceEventSnapshot(activeTask))");
  model={kind:'command',intent:'continue',action:'continue',reply:'Nie mogę sprawdzić Google Maps.',operations:[],focus:'',ambiguity:null,uiAction:null};googleResults=[building];
  const verify=run("requestVoiceDialogue(testSession,'Sprawdź ten adres w Google Maps')");
  await waitFor(()=>get('googleLocationChoices')?.children.length);assert.equal(run('tasks[0].googlePlace'),undefined,'No place is saved before the user chooses a Google result');
  get('googleLocationChoices').firstChild.click();await verify;
  assert.equal(run('tasks[0].googlePlace.placeId'),building.place_id);assert.equal(run('tasks[0].location'),building.formatted_address);
  assert.match(get('eventConversation').textContent,/Adres sprawdzony i przypięty/);run('closeEventActions()');
  for(const audio of [false,true]){
    run("delete tasks[0].googlePlace;delete tasks[0].weatherPlace;tasks[0].location='Ruciane Nida';saveTasks();openEventActions(tasks[0]);testSession=beginVoiceDialogue('event',activeTask.id,voiceEventSnapshot(activeTask))");
    googleResults=[city];transcript='Sprawdź ten adres w Google Maps';
    await run(`requestVoiceDialogue(testSession,${audio?'testAudio':JSON.stringify(transcript)})`);
    assert.equal(run('tasks[0].googlePlace.placeId'),'ruciane-nida');assert.equal(run('tasks[0].location'),'Ruciane-Nida, Polska');assert.equal(get('googleLocationModal'),null,'Text and normalized audio resolve the town without a picker');run('closeEventActions()');
  }

  // Multiple results require an explicit choice; partial matching is visible.
  w.item={type:'event',location:'Wyszogrodzka'};googleResults=[{...street,partial_match:true},building];
  let pending=run('choosePlannerGoogleLocation(item)');await waitFor(()=>get('googleLocationChoices')?.children.length===2);
  assert.match(get('googleLocationChoices').textContent,/Dopasowano tylko część/);get('googleLocationChoices').children[1].click();assert.equal(await pending,true);assert.equal(w.item.googlePlace.placeId,building.place_id);

  // No result can be corrected and retried without involving the language model.
  w.item={type:'event',location:'Nieznana ulica'};googleStatus='ZERO_RESULTS';const calls=modelCalls;
  pending=run('choosePlannerGoogleLocation(item)');await waitFor(()=>get('googleLocationStatus')?.textContent.includes('Nie znaleziono'));
  googleStatus='OK';googleResults=[street];get('googleLocationQuery').value='Wyszogrodzka, Warszawa';get('googleLocationQuery').form.dispatchEvent(new w.Event('submit',{cancelable:true}));await waitFor(()=>get('googleLocationChoices')?.children.length);
  get('googleLocationChoices').firstChild.click();assert.equal(await pending,true);assert.equal(modelCalls,calls);

  // API failures never claim a verified address; preserving the text is explicit.
  w.item={type:'event',location:'Własny adres'};googleStatus='REQUEST_DENIED';pending=run('choosePlannerGoogleLocation(item)');await waitFor(()=>get('googleLocationStatus')?.textContent.includes('Google odrzuciło'));
  get('googleLocationKeep').click();assert.equal(await pending,true);assert.equal(w.item.location,'Własny adres');assert.equal(w.item.googlePlace,undefined);
  googleStatus='OK';w.item={type:'event',location:'Inny adres'};pending=run('choosePlannerGoogleLocation(item)');await waitFor(()=>get('googleLocationChoices')?.children.length);get('googleLocationBack').click();assert.equal(await pending,false);assert.equal(w.item.location,'Inny adres');

  // Closing an event invalidates an in-flight response, with no stale mutation.
  run('openEventActions(tasks[0])');w.item={type:'event',location:'Nowy adres'};let release;delayMaps=new Promise(r=>release=r);
  const beforeDelayed=mapsCalls;pending=run('choosePlannerGoogleLocation(item,()=>!!activeTask,"event")');await waitFor(()=>mapsCalls>beforeDelayed);run('closeEventActions()');release();assert.equal(await pending,false);delayMaps=null;await new Promise(r=>setTimeout(r,10));assert.equal(w.item.googlePlace,undefined);assert.equal(get('googleLocationModal'),null);
  run('clearPlannerWeatherResolution(tasks[0])');assert.equal(run('tasks[0].googlePlace'),undefined);
  console.log('Google location: authenticated bounded lookup, separate atomic quota, street/building/partial choices, errors and cancellation; real Worker → frontend → next turn → save for text and normalized audio (external providers mocked).');
}finally{globalThis.fetch=savedFetch;dom?.window.close()}
