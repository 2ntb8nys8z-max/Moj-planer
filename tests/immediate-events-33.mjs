import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
// Current frontend -> real Worker -> current frontend -> durable state -> next turn.
// Only external model/STT and hardware are simulated; no legacy policy override.
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const originalFetch=globalThis.fetch;let model,audioTranscript,lastPayload,lastResult,modelContext;
globalThis.fetch=async(url,options)=>{if(String(url).includes('/audio/transcriptions'))return new Response(JSON.stringify({text:audioTranscript}));modelContext=JSON.parse(options.body).messages;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}))};
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,run=code=>vm.runInContext(code,dom.getInternalVMContext()),get=id=>w.document.getElementById(id);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,matchMedia:()=>({matches:true}),confirm:()=>{throw Error('Unexpected native confirmation')},alert(){},fetch:async()=>new Response('{}')});
w.HTMLElement.prototype.scrollIntoView=function(){};w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
w.testApi=async(path,options)=>{lastPayload=JSON.parse(options.body);const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:options.body}),env);assert.equal(response.status,200);lastResult=await response.json();return lastResult};
run(fs.readFileSync('sync-core.js','utf8'));
for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
run("plannerApiRequest=testApi;plannerAudioPayload=async()=>({base64:'YXVkaW8=',type:'audio/mp4'});loadVoiceMemo=async()=>null;showPlannerWeather=async()=>{}");
const command=(fields={},intent='execute')=>({reply:'Tworzę szkic.',kind:'command',action:'continue',intent,operations:[],focus:'',ambiguity:null,uiAction:{type:'open_create_event',...fields}});
const event=(fields={},intent='execute')=>({reply:'Tworzę szkic.',kind:'event',action:'continue',intent,operations:Object.entries(fields).map(([field,value])=>({op:'set',field,value})),focus:'',ambiguity:null,uiAction:null});
const day='2027-01-04';
function begin(existing=[]){w.existing=existing;run("closeIdeaActions();closeEventActions();clearVoicePreview();pendingIdeaConversion=null;tasks=existing;ideas=[];PlannerData.commit({...PlannerData.snapshot(),tasks,ideas});testSession=beginVoiceDialogue('main',null,null)");}
async function turn(text,answer,audio=false){model=answer;audioTranscript=text;w.testText=text;return run(`requestVoiceDialogue(testSession,${audio?'{}':'testText'}).then(r=>r&&applyVoiceDialogueResult(testSession,r))`);}
const stored=()=>JSON.parse(run('PlannerData.storage.getItem(TASK_KEY)'));
try{
 begin();await turn('Utwórz wydarzenie 4 stycznia o 15:00',command({date:day,startTime:'15:00'}));
 assert.equal(stored().length,1);assert.equal(stored()[0].title,'Wydarzenie');assert.equal(stored()[0].endTime,'16:00');assert.equal(get('conversationConfirm'),null);assert.match(get('toast').textContent,/Zapisano/);assert.equal(get('voiceHint').textContent,'');assert.doesNotMatch(get('voiceHint').textContent,/szkic/);
 assert.match(modelContext[0].content,/NOWE WYDARZENIA/);assert.equal(lastPayload.dialogueState.eventCreationPolicy,'immediate-v1');
 w.duplicate=lastResult;await run('applyVoiceDialogueResult(testSession,duplicate)');assert.equal(stored().length,1,'Applying the same response twice does not duplicate an event');
 for(const [next,end] of [['15:50','15:35'],['16:15','16:00'],['18:00','16:00'],['15:16','15:01']]){
  begin([{id:'next',title:'Następne',date:day,time:next,endTime:'19:00'}]);await turn('Dodaj spacer 4 stycznia o 15:00',command({query:'Spacer',date:day,startTime:'15:00'}));
  assert.equal(stored().length,2);assert.equal(stored()[1].endTime,end);assert.equal(stored()[0].time,next);
 }
 begin([{id:'next',title:'Następne',date:day,time:'15:15',endTime:'16:00'}]);await turn('Utwórz wydarzenie 4 stycznia o 15:00',command({date:day,startTime:'15:00'}));
 assert.equal(stored().length,1);assert.match(get('mainConversation').textContent,/Nie ma miejsca/);assert.doesNotMatch(get('voiceHint').textContent,/Zapisano/);
 run("testSession=voiceDialogues.main");await turn('Ustaw na 17:00',command({startTime:'17:00'},'modify'));
 assert.equal(stored().length,2);assert.equal(stored()[1].time,'17:00');assert.equal(stored()[1].endTime,'18:00');assert.equal(stored()[1].title,'Wydarzenie');
 begin([{id:'next',title:'Jutro',date:'2027-01-05',time:'00:20',endTime:'01:00'}]);await turn('Dodaj wydarzenie 4 stycznia o 23:50',command({date:day,startTime:'23:50'}));
 assert.equal(stored()[1].endTime,'00:05');assert.equal(stored()[1].endDate,'2027-01-05');
 begin();await turn('Dentysta 4 stycznia o 15:00, półtorej godziny',command({query:'Dentysta',date:day,startTime:'15:00',durationMinutes:90}));assert.equal(stored()[0].endTime,'16:30');
 begin();await turn('Dentysta 4 stycznia od 15:00 do 15:20',event({title:'Dentysta',date:day,startTime:'15:00',endTime:'15:20',notes:'Zabrać dokumenty'}));assert.equal(stored()[0].endTime,'15:20');assert.equal(stored()[0].notes,'Zabrać dokumenty');assert.equal(lastResult.saveEvent,true);
 begin();await turn('Całodniowe 4 stycznia',command({date:day,allDay:true}));assert.equal(stored()[0].time,'');assert.equal(stored()[0].endDate,'2027-01-05');
 begin();await turn('Utwórz wizytę 4 stycznia o 7:00',command({query:'Wizyta',date:day,startTime:'07:00'}),true);
 assert.equal(stored().length,0);assert.match(get('mainConversation').textContent,/07:00 czy 19:00/);
 await turn('Na dziewiętnastą',command({startTime:'07:00'}));assert.equal(stored()[0].time,'19:00');assert.equal(stored()[0].endTime,'20:00');assert.equal(stored()[0].title,'Wizyta');
 begin();await turn('Utwórz spotkanie 4 stycznia',command({query:'Rozmowa',date:day}));assert.equal(stored().length,0);assert.match(get('mainConversation').textContent,/rozpocząć/);
 await turn('O 15:00',command({startTime:'15:00'}));assert.equal(stored()[0].title,'Rozmowa');assert.equal(stored()[0].endTime,'16:00');
 begin();await turn('Utwórz spotkanie o 15:00',command({startTime:'15:00'}));assert.equal(stored().length,0);
 await turn('4 stycznia',command({date:day}));assert.equal(stored()[0].endTime,'16:00');assert.equal(stored()[0].date,day);
 begin();await turn('Może zarezerwujmy spacer 4 stycznia o 15:00?',event({title:'Spacer',date:day,startTime:'15:00'},'propose'));assert.equal(stored().length,0);
 const proposal=run('testSession.dialogueState.pendingProposal.id');await turn('Tak, utwórz',{...event({},'accept'),proposalId:proposal});assert.equal(stored()[0].endTime,'16:00');
 begin();await turn('Jak to działa?',{...event({},'continue'),reply:'Mogę pomóc zaplanować dzień.'});assert.equal(stored().length,0);
 begin();await turn('Dodaj wydarzenie',{...event({},'continue'),reply:'Tworzę szkic.'});assert.equal(stored().length,0);assert.equal(lastResult.dialogueState.lastOperation.code,'creation_claim_without_action');assert.doesNotMatch(get('mainConversation').textContent,/Tworzę szkic/);
 // An explicit duration remains intact even when a conflict needs a decision.
 begin([{id:'busy',title:'Zajęte',date:day,time:'15:45',endTime:'17:00'}]);
 let saving=turn('Wizyta 4 stycznia od 15:00 do 16:00',command({query:'Wizyta',date:day,startTime:'15:00',endTime:'16:00'}));
 for(let i=0;i<40&&!get('scheduleConfirm');i++)await new Promise(resolve=>w.setTimeout(resolve,5));
 assert.ok(get('scheduleConfirm'));assert.equal(stored().length,1);assert.equal(run('pendingVoiceItem.endTime'),'16:00');
 assert.match(get('oktiDecisionQuestion').textContent,/17:00\n\nZapisać mimo to\?/,'The warning separates its date/time from the final question');
 const cutout=get('oktiDecision').querySelector('.okti-schedule-cutout');assert.equal(cutout.dataset.previewEventId,'busy');assert.equal(cutout.querySelector('.phone-event-title-text').textContent,'Zajęte');assert.deepEqual([...cutout.querySelectorAll('.okti-schedule-hour span')].map(node=>node.textContent),['15:45','17:00']);assert.equal(cutout.querySelector('.okti-calendar-card').dataset.eventPalette,run('plannerEventPalette(tasks[0])'));
 assert.equal(cutout.querySelector('button,input'),null,'The calendar excerpt is a static preview');assert.equal(get('oktiDecision').querySelector('.okti-decision-edits'),null,'The conflict decision only offers save or correct');assert.equal(get('oktiDecision').querySelector('[aria-label="Wróć — popraw termin"]').classList.contains('is-negative'),true);
 const override=get('scheduleConfirm');override.click();override.click();await saving;assert.equal(stored().length,2,'An override writes exactly one event');
 assert.equal(get('oktiDecisionQuestion').textContent,'Dodać lokalizację?','There is no second save confirmation after an override');
 // Back opens the existing microphone directly, preserving the full draft.
 // Both typed and normalized-audio creation are followed by a real Worker correction.
 run("savedRecorder=startPlannerRecording;savedLegacy=OktiCommunication.showLegacy;collisionDecisions=[];correctionStarts=0;OktiCommunication.showLegacy=(...args)=>{collisionDecisions.push(args[1]);return savedLegacy(...args)};startPlannerRecording=(channel,makeSession)=>{correctionStarts++;correctionSession=makeSession()}");
 for(const audio of [false,true]){
  begin([{id:'busy',title:'Zajęte',date:day,time:'22:00',endTime:'23:00'}]);
  run('collisionDecisions=[];correctionStarts=0');
  const pending=turn('Spotkanie z Anitką 4 stycznia od 22:00 do 23:00. Notatka: zabrać dokumenty.',event({title:'Spotkanie z Anitką',date:day,startTime:'22:00',endTime:'23:00',notes:'Zabrać dokumenty'}),audio);
  for(let i=0;i<100&&!get('scheduleBack');i++)await new Promise(resolve=>w.setTimeout(resolve,5));
  assert.ok(get('scheduleBack'));const oldSave=get('scheduleConfirm'),back=get('scheduleBack'),decisions=run('collisionDecisions.length');
  back.click();back.click();await pending;await new Promise(resolve=>w.setTimeout(resolve,20));
  assert.equal(stored().length,1,'Choosing correction never saves the overlapping event');assert.equal(run('correctionStarts'),1,'One correction choice starts the microphone once');
  assert.equal(run('collisionDecisions.length'),decisions,'Back must not reopen the earlier save question');assert.equal(get('oktiDecision').hidden,true);
  assert.equal(run('correctionSession.currentItem'),null,'An unsaved event is kept as a creation draft');assert.equal(run('correctionSession.dialogueState.draft.title'),'Spotkanie z Anitką');assert.equal(run('correctionSession.dialogueState.draft.date'),day);assert.equal(run('correctionSession.dialogueState.draft.notes'),'Zabrać dokumenty');assert.equal(run('plannerSchedulePending'),null);
  oldSave.click();assert.equal(stored().length,1,'The discarded collision approval stays inert');
  run('testSession=correctionSession');
  if(audio){
   await turn('Przenieś na 7:00 do 8:00',event({startTime:'07:00',endTime:'08:00'},'modify'),true);
   assert.ok(lastPayload.audio);assert.equal(stored().length,1,'A normalized ambiguous hour still needs clarification');assert.match(get('oktiDecisionQuestion').textContent,/07:00 czy 19:00/);
  }
  await turn('Przenieś na 19:00 do 20:00',event({startTime:'19:00',endTime:'20:00'},'modify'),!audio);
  if(!audio)assert.ok(lastPayload.audio);assert.equal(lastPayload.dialogueState.draft.title,'Spotkanie z Anitką');assert.equal(lastPayload.currentItem,null);assert.equal(stored().length,2,'The corrected draft is saved without a second save question');
  assert.equal(stored()[1].time,'19:00');assert.equal(stored()[1].endTime,'20:00');assert.equal(stored()[1].notes,'Zabrać dokumenty');assert.equal(stored()[0].time,'22:00');assert.equal(get('oktiDecisionQuestion').textContent,'Dodać lokalizację?');
 }
 for(const control of ['close']){
  begin([{id:'busy',title:'Zajęte',date:day,time:'22:00',endTime:'23:00'}]);run('correctionStarts=0');
  const pending=turn('Spotkanie 4 stycznia od 22:00 do 23:00',event({title:'Spotkanie',date:day,startTime:'22:00',endTime:'23:00'}));
  for(let i=0;i<100&&!get('scheduleBack');i++)await new Promise(resolve=>w.setTimeout(resolve,5));
  assert.equal(get('oktiDecision').querySelector('.okti-decision-voice'),null,'The redundant change microphone is removed from conflicts');const button=get('oktiDecision').querySelector('[aria-label="Zamknij pytanie"]');button.click();await pending;await new Promise(resolve=>w.setTimeout(resolve,20));
  assert.equal(stored().length,1);assert.equal(run('plannerSchedulePending'),null);
  assert.equal(run('correctionStarts'),0,'Closing the decision does not start the microphone');
 }
 run('startPlannerRecording=savedRecorder;OktiCommunication.showLegacy=savedLegacy');
 // Source name/body remain attached, saved with the source in one atomic record.
 begin();run("ideas=[{id:'source',title:'Zadzwonić do Ani',text:'Zadzwonić do Ani',content:'Omówić wyjazd',history:[]}];saveIdeas();openIdeaActions(ideas[0]);testSession=beginVoiceDialogue('idea','source',voiceDialogueCurrent('idea','source'))");
 await turn('Wrzuć do kalendarza 4 stycznia o 15:00',command({date:day,startTime:'15:00'},'modify'));
 assert.equal(stored()[0].title,'Zadzwonić do Ani');assert.match(stored()[0].notes,/Omówić wyjazd/);assert.equal(stored()[0].sourceEntryId,'source');assert.equal(run('PlannerData.snapshot().ideas[0].status'),'calendar');
 // A failed durable write cannot claim success or leave a phantom task in memory.
 begin();run("originalCommit=PlannerData.commit;PlannerData.commit=()=>{throw Error('storage unavailable')}");
 await turn('Utwórz wizytę 4 stycznia o 15:00',command({query:'Wizyta',date:day,startTime:'15:00'}));
 assert.equal(stored().length,0);assert.equal(run('tasks.length'),0);assert.match(get('voiceHint').textContent,/Nie udało się zapisać/);assert.ok(get('conversationConfirm'));
 run("PlannerData.commit=originalCommit;tasks.push({id:'later',title:'Nowe w kalendarzu',date:'2027-01-04',time:'15:50',endTime:'17:00'});saveTasks()");await get('conversationConfirm').onclick();assert.equal(stored().length,2);assert.equal(stored()[1].endTime,'15:35','Retry recalculates the gap against the latest calendar');
 // Recurring defaults use one duration that fits every occurrence and the Google master.
 begin([{id:'later',title:'Drugiego dnia',date:'2027-01-05',time:'15:50',endTime:'17:00'}]);
 await turn('Spacer 4 stycznia o 15:00, codziennie dwa razy',event({title:'Spacer',date:day,startTime:'15:00',recurrence:{frequency:'daily',interval:1,count:2}}));
 assert.equal(stored().length,3);assert.equal(stored()[1].endTime,'15:35');assert.equal(stored()[2].endTime,'15:35');assert.equal(stored()[2].endDate,'2027-01-05');
 // The operation path can also fill a missing title and duration.
 begin();await turn('Utwórz wydarzenie 4 stycznia o 15:00',event({date:day,startTime:'15:00'}));assert.equal(stored()[0].title,'Wydarzenie');assert.equal(stored()[0].endTime,'16:00');
 // Open-event edits keep their existing review flow and event identity.
 begin([{id:'existing',title:'Istniejące',date:day,time:'15:00',endTime:'16:00',history:[]}]);run("openEventActions(tasks[0]);testSession=beginVoiceDialogue('event','existing',voiceEventSnapshot(tasks[0]))");
 const edit=turn('Zmień nazwę na Nowa',event({title:'Nowa'},'modify'));
 for(let i=0;i<40&&get('eventChangePreview').classList.contains('hidden');i++)await new Promise(resolve=>w.setTimeout(resolve,5));
 assert.equal(lastResult.saveEvent,undefined);assert.equal(stored()[0].title,'Istniejące');get('eventChangeCancel').click();await edit;
 console.log('Immediate events: text/audio, Worker → frontend → durable write → next turn, defaults, 15-minute gap, midnight, explicit duration, proposals, conflicts, rollback, duplicate responses and source conversion passed (model/STT mocked).');
}finally{globalThis.fetch=originalFetch;dom.window.close()}
