import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';

// Exercise the real Worker -> frontend -> next request boundary with controlled model patches.
const worker=(await import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync('worker.js','utf8')).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const nativeFetch=globalThis.fetch;
let model,modelCalls=0;
globalThis.fetch=async()=>{modelCalls++;return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}))};
const command=(type,fields={},intent='execute')=>({reply:'Sprawdź ustalenia.',kind:'command',action:'continue',intent,operations:[],focus:'',ambiguity:null,uiAction:{type,...fields}});
async function post(payload){
 const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify(payload)}),env);
 assert.equal(response.status,200);return response.json();
}
const dom=new JSDOM(fs.readFileSync('index.html','utf8'),{url:'https://planner.test',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window,ctx=dom.getInternalVMContext(),run=s=>vm.runInContext(s,ctx),get=id=>w.document.getElementById(id);
Object.assign(w,{structuredClone,TextEncoder,TextDecoder,AbortController,Response,Request,confirm:()=>true,alert(){},fetch:async()=>new Response('{}')});
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLMediaElement.prototype.pause=function(){};w.HTMLMediaElement.prototype.load=function(){};
w.URL.createObjectURL=()=> 'blob:test';w.URL.revokeObjectURL=()=>{};
let lastPayload;
w.testApi=async(path,options)=>{lastPayload=JSON.parse(options.body);return post(lastPayload)};
for(const script of w.document.querySelectorAll('script'))if(!script.src)run(script.textContent);
run('plannerApiRequest=testApi;loadVoiceMemo=async()=>null;tasks=[];ideas=[]');
const read=s=>JSON.parse(JSON.stringify(run(s)));
async function turn(text,answer){model=answer;w.testText=text;await run('requestVoiceDialogue(testSession,testText).then(r=>r&&applyVoiceDialogueResult(testSession,r))')}
function begin(channel,entry={}){
 run("closeIdeaActions();clearVoiceDialogue('main');clearVoiceDialogue('idea');pendingVoiceItem=null;pendingIdeaConversion=null");
 w.testEntry=entry;
 if(channel==='idea')run("ideas=[{id:'source',title:'Źródłowa notatka',text:'Źródłowa notatka',content:'Treść źródła',notes:'Dodatkowe uwagi',additions:[],...testEntry}];openIdeaActions(ideas[0]);testSession=beginVoiceDialogue('idea','source',voiceDialogueCurrent('idea','source'))");
 else run("testSession=beginVoiceDialogue('main',null,null)");
}
try{
 // Same active flow, despite the model returning open_create_event again with only one field.
 for(const channel of ['main','idea']){
  begin(channel);const source=read('ideas');
  await turn('Kontrola u dentysty w poniedziałek, 15 minut.',command('open_create_event',{query:'Kontrola u dentysty',date:'2027-01-04',durationMinutes:15}));
  assert.equal(run('testSession.dialogueState.draft.title'),'Kontrola u dentysty');
  assert.equal(run('voiceDialogueValid(testSession)'),true);
  assert.equal(run('testSession.dialogueState.draft.durationMinutes'),15);
  await turn('O dwunastej.',command('open_create_event',{startTime:'12:00'},'modify'));
  const event=read('pendingVoiceItem');
  assert.equal(lastPayload.dialogueState.draft.durationMinutes,15);
  assert.equal(event.title,'Kontrola u dentysty');assert.equal(event.date,'2027-01-04');assert.equal(event.startTime,'12:00');assert.equal(event.endTime,'12:15');
  assert.equal(run('tasks.length'),0);assert.deepEqual(read('ideas'),source);
  if(channel==='idea')assert.match(event.notes,/Treść źródła[\s\S]*Dodatkowe uwagi/);
 }
 // Explicit new flow discards the old date, time and length rather than inheriting them.
 begin('main');
 await turn('Pierwsze wydarzenie w poniedziałek.',command('open_create_event',{query:'Pierwsze',date:'2027-01-04',durationMinutes:15}));
 await turn('Zacznij inne nowe wydarzenie: Drugie.',command('open_create_event',{query:'Drugie',newFlow:true}));
 assert.equal(run('testSession.dialogueState.draft.title'),'Drugie');assert.equal(run('testSession.dialogueState.draft.date'),null);assert.equal(run('testSession.dialogueState.draft.durationMinutes'),null);assert.equal(run('voiceDialogueValid(testSession)'),true);
 // Day -> time -> message must remain an active session until all three are known.
 begin('main');
 await turn('Przypomnij w poniedziałek.',command('set_entry_reminder',{date:'2027-01-04'}));
 await turn('O 13.',command('set_entry_reminder',{startTime:'13:00'}));
 assert.equal(run('voiceDialogueValid(testSession)'),true);assert.match(get('mainClarification').textContent,/Odpowiedz/);assert.match(get('mainConversation').textContent,/O czym mam przypomnieć/);assert.equal(run('pendingVoiceItem'),null);
 await turn('Wyślij list polecony.',command('set_entry_reminder',{message:'Wyślij list polecony'}));
 assert.deepEqual(read('pendingVoiceItem'),{type:'reminder',date:'2027-01-04',time:'13:00',message:'Wyślij list polecony'});assert.equal(run('voiceDialogues.main'),null);
 // Editing an existing reminder: a no-command follow-up is valid and preserves context.
 begin('idea',{alarm:{date:'2027-01-04',time:'09:00',message:'Własna treść'}});
 const beforeCalls=modelCalls;
 await turn('Zmień godzinę przypomnienia.',{reply:'Na którą godzinę?',kind:'command',action:'continue',intent:'continue',operations:[],focus:'nowa godzina',ambiguity:null,uiAction:null});
 assert.equal(modelCalls-beforeCalls,1);assert.match(get('ideaConversation').textContent,/Na którą godzinę/);
 await turn('Na 14.',command('set_entry_reminder',{date:null,startTime:'14:00',message:''},'modify'));
 assert.equal(get('entryReminderDate').value,'2027-01-04');assert.equal(get('entryReminderTime').value,'14:00');assert.equal(get('entryReminderMessage').value,'Własna treść');assert.equal(run('ideas[0].alarm.time'),'09:00');
 // No duplicate session reminder can leak through reminder -> incomplete timer -> new reminder.
 begin('main');
 await turn('Przypomnij w poniedziałek: Stara treść.',command('set_entry_reminder',{date:'2027-01-04',message:'Stara treść'}));
 await turn('Ustaw minutnik.',command('start_timer'));
 assert.equal(run('testSession.dialogueState.reminderDraft'),undefined);assert.equal(run('testSession.reminderDraft'),undefined);
 await turn('Przypomnij o 18.',command('set_entry_reminder',{startTime:'18:00'}));
 assert.deepEqual(read('testSession.dialogueState.reminderDraft'),{startTime:'18:00'});assert.match(get('mainConversation').textContent,/Na jaki dzień/);assert.equal(run('pendingVoiceItem'),null);
 // Continue retains a partial reminder draft and cannot execute or mutate anything.
 model={reply:'Podaj godzinę.',kind:'command',action:'continue',intent:'continue',operations:[],focus:'godzina',ambiguity:null,uiAction:null};
 const state={engine:3,mode:'reminder',draft:{},reminderDraft:{date:'2027-01-04',message:'Treść'},pendingField:'startTime'};
 let r=await post({protocolVersion:2,conversationEngine:3,text:'Nie podałem jeszcze godziny.',dialogueState:state});
 assert.deepEqual(r.dialogueState.reminderDraft,state.reminderDraft);assert.equal(r.dialogueState.pendingField,'startTime');assert.equal(r.uiAction,undefined);
 model={...model,uiAction:{type:'start_timer',minutes:25}};
 r=await post({protocolVersion:2,conversationEngine:3,text:'Pytanie',dialogueState:state});assert.equal(r.dialogueState.lastOperation.code,'invalid_ui_action');assert.equal(r.uiAction,undefined);
 // Cancellation starts with no reminder facts left in the next session.
 run("getCancel=document.getElementById('mainClarification').querySelectorAll('button')[2];getCancel.click();pendingVoiceItem=null;testSession=beginVoiceDialogue('main',null,null)");
 assert.equal(run('testSession.dialogueState'),undefined);
 console.log('33.25: real Worker/frontend multi-turn state, repeated create commands, new flow, titles, reminder completion, continue validation and flow switching passed.');
}finally{globalThis.fetch=nativeFetch;dom.window.close()}
