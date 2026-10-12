import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

// Real Worker -> frontend -> next request. Only the external model and audio
// provider are controlled; the reminder interpretation and mutations are real.
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const nativeFetch=globalThis.fetch;
let model,modelCalls=0,audioTranscript='',lastPayload;
globalThis.fetch=async url=>{
 if(String(url).includes('/audio/transcriptions'))return new Response(JSON.stringify({text:audioTranscript}));
 modelCalls++;
 return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}));
};
const command=(type,fields={},intent='execute')=>({reply:'Sprawdź ustalenia.',kind:'command',action:'continue',intent,operations:[],focus:'',ambiguity:null,uiAction:{type,...fields}});
const continueAnswer={reply:'Jak mogę pomóc?',kind:'command',action:'continue',intent:'continue',operations:[],focus:'',ambiguity:null,uiAction:null};
async function post(payload){
 const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify(payload)}),env);
 assert.equal(response.status,200,'Worker request succeeds');
 return response.json();
}
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,ctx=dom.getInternalVMContext(),run=s=>vm.runInContext(s,ctx),get=id=>w.document.getElementById(id);
let confirmCalls=0;
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>{confirmCalls++;return true},alert(){},fetch:async()=>new Response('{}')});
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
w.testApi=async(path,options)=>{lastPayload=JSON.parse(options.body);return post(lastPayload)};
for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
run('plannerApiRequest=testApi;loadVoiceMemo=async()=>null;showPlannerWeather=async()=>{};plannerAudioPayload=async()=>({base64:"YXVkaW8=",type:"audio/mp4"})');
const read=s=>JSON.parse(JSON.stringify(run(s)));
const eventId='opened-event';
const originalTasks=[
 {id:eventId,title:'Otwarte spotkanie',date:'2026-10-12',time:'12:00',endTime:'13:00',location:'Rynek 1, Dresden',notes:'Istniejąca notatka'},
 {id:'other-event',title:'Inne wydarzenie',date:'2026-10-12',time:'16:00',endTime:'17:00',endDate:'2026-10-12',notes:'Nie zmieniać',reminder:{minutesBefore:10}}
];
const originalIdeas=[{id:'existing-note',title:'Osobna notatka',text:'Nie zmieniać',createdAt:'2026-10-11T10:00:00.000Z',alarm:{date:'2026-10-12',time:'18:00',message:'Istniejący alarm'}}];
function begin(reset=true){
 if(reset){w.testTasks=structuredClone(originalTasks);w.testIdeas=structuredClone(originalIdeas);run("closeEventActions();closeIdeaActions();clearVoiceDialogue('main');clearVoiceDialogue('event');clearVoiceDialogue('idea');tasks=testTasks;ideas=testIdeas;pendingVoiceItem=null;pendingIdeaConversion=null;selected=new Date('2026-10-12T12:00:00');renderAll();openEventActions(tasks[0])");}
 run("testSession=beginVoiceDialogue('event',activeTask.id,voiceDialogueCurrent('event',activeTask.id))");
}
function assertScope(){
 assert.deepEqual(read('tasks.map(t=>t.id)'),originalTasks.map(t=>t.id),'No additional axis event or alarm');
 assert.deepEqual(read('tasks[1]'),originalTasks[1],'Other event stays unchanged');
 assert.deepEqual(read('ideas'),originalIdeas,'No separate note or alarm is created or modified');
 assert.equal(run('pendingVoiceItem'),null,'No standalone reminder preview');
 assert.equal(run('tasks[0].alarm'),undefined,'Reminder is not stored as an axis alarm');
 for(const field of ['title','date','time','endTime','location'])assert.equal(run('tasks[0].'+field),originalTasks[0][field]);
 assert.equal(run('activeTask.id'),eventId);
}
async function turn(text,answer=continueAnswer,{audio=false,confirmInline=false}={}){
 model=answer;w.testText=text;w.testResult=null;
 if(audio)audioTranscript=text;
 const pending=run(`requestVoiceDialogue(testSession,${audio?'{}':'testText'}).then(r=>{testResult=r;return r&&applyVoiceDialogueResult(testSession,r)})`);
 if(confirmInline){
  for(let count=0;count<30&&get('eventChangePreview')?.classList.contains('hidden');count++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(get('eventChangePreview')?.classList.contains('hidden'),false,'Change is reviewed inside the open event');
  assert.equal(get('eventModal').classList.contains('hidden'),false);
  get('eventChangeConfirm').click();
 }
 await pending;
 return w.testResult;
}
try{
 // Complete reminder commands use the event's own identity and need no extra
 // date/title/time question even when the old model returns a global reminder.
 begin();
 let result=await turn('Ustaw przypomnienie 15 minut przed.',command('set_entry_reminder',{date:'2026-10-12',startTime:'11:45',message:'Otwarte spotkanie'}));
 assert.equal(lastPayload.currentItem.eventId,eventId);
 assert.equal(lastPayload.currentItem.endDate,'2026-10-12','Legacy event end date is inferred');
 assert.equal(result.uiAction.type,'set_event_reminder');
 assert.equal(result.uiAction.eventId,eventId);
 assert.equal(result.uiAction.minutesBefore,15);
 assert.equal(run('tasks[0].reminder.minutesBefore'),15);
 assertScope();
 assert.equal(confirmCalls,0,'Event reminder is immediate');

 // A bare request asks only for the relative offset. That state and event ID
 // cross the actual frontend -> next Worker request boundary.
 begin();
 await turn('Ustaw przypomnienie.',command('set_entry_reminder',{}));
 assert.equal(run('testSession.dialogueState.pendingField'),'eventReminderMinutes');
 assert.deepEqual(read('testSession.dialogueState.eventReminderDraft'),{eventId});
 assert.equal(run('tasks[0].reminder'),undefined);
 assert.equal(get('eventConversation').querySelector('.voice-message.assistant').textContent,'AI: Ile minut przed wydarzeniem mam przypomnieć?');
 await turn('Dlaczego pytasz?',{...continueAnswer,reply:'Potrzebuję tylko liczby minut przed tym wydarzeniem.'});
 assert.equal(run('testSession.dialogueState.pendingField'),'eventReminderMinutes','An aside preserves the missing offset');
 assert.equal(run('testSession.dialogueState.eventReminderDraft.eventId'),eventId);
 result=await turn('25',command('set_entry_reminder',{date:'2026-10-19',startTime:'07:00',message:'Błędne dane modelu'}));
 assert.equal(lastPayload.dialogueState.pendingField,'eventReminderMinutes');
 assert.equal(lastPayload.dialogueState.eventReminderDraft.eventId,eventId);
 assert.equal(lastPayload.currentItem.eventId,eventId);
 assert.equal(result.uiAction.minutesBefore,25);
 assert.equal(run('tasks[0].reminder.minutesBefore'),25);assertScope();

 // Normalized voice transcription is a duration, never an ambiguous clock.
 begin();
 await turn('Ustaw przypomnienie.',command('set_event_reminder',{}));
 result=await turn('15 minut przed',command('set_entry_reminder',{startTime:'07:00'}),{audio:true});
 assert.ok(lastPayload.audio,'Audio uses the real Worker transcription path');
 assert.equal(result.uiAction.minutesBefore,15);
 assert.equal(run('tasks[0].reminder.minutesBefore'),15);
 assert.doesNotMatch(get('eventConversation')?.textContent||'',/czy 19:00|O której|Na jaki dzień|O czym/);
 assertScope();

 // Changing and removing the reminder affect that event alone.
 begin(false);
 await turn('Zmień przypomnienie na 30 minut przed.',command('set_event_reminder',{minutesBefore:30},'modify'));
 assert.equal(run('tasks[0].reminder.minutesBefore'),30);assertScope();
 begin(false);
 result=await turn('Usuń przypomnienie.',command('remove_entry_reminder',{},'modify'));
 assert.equal(result.uiAction.type,'remove_event_reminder');assert.equal(result.uiAction.eventId,eventId);
 assert.equal(run('tasks[0].reminder')??null,null);assertScope();
 assert.equal(confirmCalls,0,'Reminder changes do not open an old confirmation dialog');

 // The frontend alone protects old Workers: an absolute reminder is converted
 // to this event's offset; missing relative information asks only for minutes.
 begin();
 await run("applyVoiceUiAction(testSession,{type:'set_entry_reminder',date:'2026-10-12',startTime:'11:45',message:'Old Worker'})");
 assert.equal(run('tasks[0].reminder.minutesBefore'),15);assertScope();
 begin();
 await run("applyVoiceUiAction(testSession,{type:'set_entry_reminder',message:'Missing offset'})");
 assert.equal(run('tasks[0].reminder'),undefined);assertScope();
 assert.equal(run('testSession.dialogueState.pendingField'),'eventReminderMinutes');
 assert.match(get('eventConversation').textContent,/Ile minut przed wydarzeniem mam przypomnieć\?/);

 // A response belonging to another event, or arriving after opening another
 // event, cannot attach its reminder to the wrong current task.
 begin();
 await run("applyVoiceUiAction(testSession,{type:'set_event_reminder',eventId:'other-event',minutesBefore:5})");
 assert.equal(run('tasks[0].reminder'),undefined);assertScope();
 begin();
 const before=read('tasks');
 run('staleSession=testSession;openEventActions(tasks[1])');
 await run("applyVoiceUiAction(staleSession,{type:'set_event_reminder',eventId:'opened-event',minutesBefore:5})");
 assert.deepEqual(read('tasks'),before,'Late action cannot mutate a closed or different event');
 assert.deepEqual(read('ideas'),originalIdeas);
 assert.equal(run('pendingVoiceItem'),null);

 // An old/global frontend entry point must route text into the event context
 // while its detail sheet is open.
 begin();
 run("testSession=beginVoiceDialogue('main',null,null)");
 result=await turn('Ustaw przypomnienie 15 minut przed.',command('set_entry_reminder',{date:'2026-10-12',startTime:'11:45',message:'Global path'}));
 assert.equal(lastPayload.currentItem.type,'event');
 assert.equal(lastPayload.currentItem.eventId,eventId);
 assert.equal(run('tasks[0].reminder.minutesBefore'),15);assertScope();

 // Out-of-scope command actions are blocked by both Worker and frontend, even
 // when a controlled/legacy model proposes creation, search, shopping or timer.
 for(const action of [
  {type:'open_create_event',query:'Nowe wydarzenie',date:'2026-10-13',startTime:'10:00',endTime:'11:00'},
  {type:'shopping_summary'},
  {type:'find_entry',query:'Inne wydarzenie'},
  {type:'start_timer',minutes:5}
 ]){
  begin();
  result=await turn('Wykonaj polecenie.',command(action.type,Object.fromEntries(Object.entries(action).filter(([key])=>key!=='type'))));
  assert.equal(result?.uiAction,undefined,'Worker does not release an out-of-scope action');
  assertScope();
  await run('applyVoiceUiAction(testSession,'+JSON.stringify(action)+')');
  assertScope();
  assert.equal(get('entryResultsModal').classList.contains('hidden'),true);
  assert.equal(get('shoppingModal').classList.contains('hidden'),true);
  assert.equal(run('tasks[0].reminder'),undefined);
 }

 begin();
 result=await turn('Wykonaj polecenie.',{reply:'Tworzę osobną notatkę.',kind:'idea',action:'continue',intent:'execute',operations:[],focus:'',ambiguity:null,uiAction:null,idea:{type:'idea',text:'Osobna notatka',action:'create'}});
 assert.equal(result,null,'Worker rejects a separate idea in event context');assertScope();
 await run("applyVoiceDialogueResult(testSession,{engine:3,item:{type:'idea',text:'Osobna notatka',action:'create'},saveEntry:true})");
 assertScope();

 // Legacy note responses become an inline event edit. Missing endDate must
 // not cause unrelated calendar validation before approval.
 begin();
 await turn('Dodaj notatkę: Treść transkrypcji.',{reply:'Dopisuję notatkę.',kind:'idea',action:'continue',intent:'modify',operations:[],focus:'',ambiguity:null,uiAction:null,idea:{text:'Treść transkrypcji',addition:'Treść transkrypcji',action:'append'}},{confirmInline:true});
 assert.match(run('tasks[0].notes'),/Istniejąca notatka[\s\S]*Treść transkrypcji/);
 assert.equal(confirmCalls,0,'Note changes use inline event approval');
 assertScope();

 assert.ok(modelCalls>0,'Tests exercised the real Worker with the model boundary mocked');
 assert.equal(run("voiceEventSnapshot({id:'legacy-zero',title:'Zero',date:'2026-10-12',time:'12:00',endTime:'13:00',reminder:0}).reminder.minutesBefore"),0,'Legacy numeric reminder offsets normalize without losing zero');
 console.log('33.57: real Worker/frontend event reminder text/audio/multi-turn, change/removal, legacy protection, event identity, scoped actions and inline notes passed (model and audio provider mocked).');
}finally{globalThis.fetch=nativeFetch;dom.window.close()}
