import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';

const source=fs.readFileSync('worker.js','utf8');
const worker=(await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'))).default;
const env={PLANNER_ACCESS_TOKEN:'test-only-token-1234567890123456',OPENAI_API_KEY:'dummy',API_LIMITS_DB:{prepare(){return {run:async()=>{},bind(){return this},first:async()=>({})}}}};
const event={type:'event',eventId:'calendar-event-57',title:'Spotkanie',date:'2026-10-12',startTime:'15:00',endTime:'16:00',notes:'Istniejąca treść',location:'Warszawa'};
const command=(uiAction,intent='execute')=>({reply:'Odpowiedź modelu.',kind:'command',intent,action:'continue',operations:[],focus:'',ambiguity:null,uiAction});
const aside={reply:'Tak, przypomnienie jest przypisane do tego wydarzenia.',kind:'event',intent:'continue',action:'continue',operations:[],focus:'',ambiguity:null,uiAction:null};
let model=command({type:'set_event_reminder',minutesBefore:15}),transcript='',modelCalls=0,audioCalls=0,contexts=[];
const oldFetch=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/audio/transcriptions')){audioCalls++;return new Response(JSON.stringify({text:transcript}));}
  modelCalls++;
  const data=JSON.parse(options.body);
  assert.match(data.messages[0].content,/OTWARTE WYDARZENIE/);
  contexts.push(JSON.parse(data.messages[1].content));
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(model)}}]}));
};
const ctx=vm.createContext({fetch:(...args)=>globalThis.fetch(...args),Response,Request,AbortController,TextEncoder,TextDecoder,crypto:webcrypto,setTimeout,clearTimeout});
vm.runInContext(source.replace('export default','const workerDefault ='),ctx);
async function post(text,currentItem=event,dialogueState={},audio=false){
  const response=await worker.fetch(new Request('https://worker/',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+env.PLANNER_ACCESS_TOKEN},body:JSON.stringify({protocolVersion:2,conversationEngine:3,text,currentItem,dialogueState,dialogue:[],...(audio?{audio:{base64:'YXVkaW8=',type:'audio/mp4'}}:{})})}),env);
  assert.equal(response.status,200);
  return response.json();
}
function assertReminder(result,minutesBefore,id=event.eventId){
  assert.equal(result.status,'command');
  assert.deepEqual(result.uiAction,{type:'set_event_reminder',eventId:id,minutesBefore});
  assert.equal(result.item,undefined);
  assert.equal(result.saveEntry,undefined);
  assert.equal(result.dialogueState.pendingField,null);
  assert.equal(result.dialogueState.eventReminderDraft.eventId,id);
  assert.equal(result.dialogueState.reminderDraft,undefined);
}
try{
  // Exercise the reducer itself, then the public text and normalized-audio routes.
  let result=await ctx.runConversationTurn({text:'Ustaw przypomnienie 15 minut przed.',history:[],original:event,state:{},env,today:'2026-10-12'});
  result=JSON.parse(JSON.stringify(result));assertReminder(result,15);
  assert.equal(contexts.at(-1).original.eventId,event.eventId);
  assert.equal(contexts.at(-1).original.endDate,event.date,'Legacy event hours determine endDate without asking for it');
  assert.equal(contexts.at(-1).capabilities.eventScopeOnly,true);
  model=command({type:'set_entry_reminder',date:'2026-10-12',startTime:'14:45',message:'Spotkanie'});
  result=await post('Ustaw przypomnienie 15 minut przed.');assertReminder(result,15);
  transcript='Ustaw przypomnienie piętnaście minut przed.';
  result=await post('',event,{},true);assertReminder(result,15);assert.equal(audioCalls,1);assert.equal(result.transcription,transcript);

  // Even an older answer which asks for the day cannot escape the event context.
  model=command({type:'set_entry_reminder'});
  const waiting=await post('Ustaw przypomnienie.');
  assert.equal(waiting.status,'continue');assert.equal(waiting.reply,'Ile minut przed wydarzeniem mam przypomnieć?');
  assert.equal(waiting.uiAction,undefined);assert.equal(waiting.dialogueState.pendingField,'eventReminderMinutes');
  assert.equal(waiting.dialogueState.eventReminderDraft.eventId,event.eventId);
  model=aside;
  const explanation=await post('Czy to dotyczy tego wydarzenia?',event,waiting.dialogueState);
  assert.equal(explanation.dialogueState.pendingField,'eventReminderMinutes');
  assert.equal(explanation.dialogueState.eventReminderDraft.eventId,event.eventId);
  // The next answer must remain minutes-before, including transcribed speech.
  transcript='30 minut';model=command({type:'set_entry_reminder',startTime:'00:30'});
  result=await post('',event,explanation.dialogueState,true);assertReminder(result,30);
  const withReminder={...event,reminder:{minutesBefore:30}};
  model=command({type:'set_event_reminder',minutesBefore:10},'modify');
  result=await post('Zmień przypomnienie na 10 minut przed.',withReminder);assertReminder(result,10);
  const pendingEdit={engine:3,eventContextId:event.eventId,draft:{...withReminder,title:'Nowy tytuł'}};
  result=await post('Zmień przypomnienie na 10 minut przed.',withReminder,pendingEdit);assertReminder(result,10);assert.equal(result.dialogueState.draft.title,'Nowy tytuł');assert.equal(result.dialogueState.draft.reminder.minutesBefore,10,'Immediate event reminder also patches an existing event draft');
  // Negated requests must remain non-mutating, even with a wrong model action.
  for(const text of ['Nie ustaw przypomnienia 15 minut przed.','Nie ustawiaj przypomnienia 15 minut przed.','Nie usuwaj przypomnienia.']){
    model=command({type:'set_event_reminder',minutesBefore:15});result=await post(text,withReminder);
    assert.equal(result.status,'continue');assert.equal(result.uiAction,undefined);assert.equal(result.item,undefined);assert.equal(result.dialogueState.draft?.reminder,undefined);
  }
  model=aside;result=await post('Czy ustawisz przypomnienie 15 minut przed?',withReminder);assert.equal(result.status,'continue');assert.equal(result.uiAction,undefined);
  model={...aside,intent:'propose',operations:[{op:'set',field:'reminder',value:{minutesBefore:15}}]};
  result=await post('Może ustaw przypomnienie 15 minut przed.',withReminder);assert.equal(result.status,'continue');assert.equal(result.uiAction,undefined);assert.equal(result.item,undefined);assert.equal(result.dialogueState.pendingProposal.kind,'event');
  // A correction identifies the target offset, rather than the old duration.
  model=command({type:'set_entry_reminder',minutesBefore:15});
  result=await post('Zmień przypomnienie z 15 minut na 30 minut przed.',withReminder);assertReminder(result,30);
  result=await post('Zmień przypomnienie z 15 minut na 30.',withReminder);assertReminder(result,30);
  result=await post('Zmień przypomnienie z 15 minut na tylko 45 minut przed.',withReminder);assertReminder(result,45);
  result=await post('Zmień przypomnienie z piętnastu minut na pół godziny przed.',withReminder);assertReminder(result,30);
  result=await post('Nie, ustaw przypomnienie na 20 minut przed.',withReminder);assertReminder(result,20);
  model=command({type:'remove_entry_reminder'},'modify');
  result=await post('Usuń przypomnienie.',withReminder);
  assert.equal(result.status,'command');assert.deepEqual(result.uiAction,{type:'remove_event_reminder',eventId:event.eventId});assert.equal(result.item,undefined);
  result=await post('Usuń przypomnienie.',event);assert.equal(result.status,'continue');assert.equal(result.uiAction,undefined);assert.match(result.reply,/nie ma ustawionego przypomnienia/);
  model=command({type:'set_event_reminder',minutesBefore:0});result=await post('Ustaw przypomnienie 0 minut przed.');assertReminder(result,0);
  model=command({type:'set_event_reminder',minutesBefore:20000});result=await post('Ustaw przypomnienie 20000 minut przed.');assert.equal(result.status,'continue');assert.equal(result.uiAction,undefined);assert.equal(result.dialogueState.lastOperation.code,'invalid_event_reminder_minutes');

  // Scope guards validate the actual output action and target, not only stack state.
  for(const action of [{type:'find_entry',query:'inny wpis'},{type:'open_create_event',query:'Osobne wydarzenie'},{type:'start_timer',minutes:5},{type:'set_entry_deadline',date:'2026-10-13'},{type:'shopping_summary'}]){
    model=command(action);result=await post('Wykonaj inne polecenie.');
    assert.equal(result.status,'continue');assert.equal(result.uiAction,undefined);assert.equal(result.item,undefined);assert.equal(result.dialogueState.lastOperation.code,'event_scope_only');
  }
  model=command({type:'set_event_reminder',eventId:'other-event',minutesBefore:15});result=await post('Przesuń sygnał nieco wcześniej.');
  assert.equal(result.uiAction,undefined);assert.equal(result.dialogueState.lastOperation.code,'invalid_event_target');
  model={reply:'Tworzę wpis.',kind:'idea',intent:'execute',action:'continue',operations:[],focus:'',ambiguity:null,idea:{type:'idea',action:'replace',text:'Osobny wpis'}};
  result=await post('Utwórz osobny wpis.');assert.equal(result.item,undefined);assert.equal(result.saveEntry,undefined);assert.equal(result.dialogueState.lastOperation.code,'event_scope_only');
  model={...model,idea:{type:'idea',action:'append',text:'Spotkanie',addition:'Nowa notatka'}};
  result=await post('Dodaj notatkę: Nowa notatka.');assert.equal(result.status,'review');assert.equal(result.item.type,'event');assert.equal(result.item.notes,'Istniejąca treść\nNowa notatka');assert.equal(result.item.endDate,event.date);assert.deepEqual(result.item.changedFields,['notes']);

  // Missing endDate is derived for overnight/all-day events without an extra change.
  model={...aside,intent:'modify',operations:[{op:'set',field:'notes',value:'Zmieniona notatka'}]};
  result=await post('Zmień notatkę.',{...event,startTime:'23:30',endTime:'00:30'});
  assert.equal(result.status,'review');assert.equal(result.item.endDate,'2026-10-13');assert.deepEqual(result.item.changedFields,['notes']);
  result=await post('Zmień notatkę.',{...event,startTime:'',endTime:''});assert.equal(result.status,'review');assert.equal(result.item.endDate,'2026-10-13');assert.deepEqual(result.item.changedFields,['notes']);
  result=await post('Zmień notatkę.',{...event,endTime:'',durationMinutes:60});assert.equal(result.status,'review');assert.equal(result.item.endTime,'16:00');assert.deepEqual(result.item.changedFields,['notes']);
  result=await post('Zmień notatkę.',{...event,endDate:''});assert.equal(result.status,'review');assert.equal(result.item.endDate,event.date);assert.deepEqual(result.item.changedFields,['notes']);

  // Pending minutes from another opened event may not be applied accidentally.
  model=aside;result=await post('20 minut',{...event,eventId:'new-event'},waiting.dialogueState);
  assert.equal(result.uiAction,undefined);assert.equal(result.dialogueState.eventReminderDraft,undefined);assert.equal(result.dialogueState.eventContextId,'new-event');
  model=command({type:'set_event_reminder',minutesBefore:15});result=await post('Ustaw przypomnienie 15 minut przed.',{...event,eventId:undefined,id:'stored-legacy-id'});assertReminder(result,15,'stored-legacy-id');
  result=await post('Ustaw przypomnienie 15 minut przed.',{...event,eventId:1728743010123.5});assertReminder(result,15,1728743010123.5);

  // Existing independent entry reminders keep their prior protocol.
  model=command({type:'set_entry_reminder',date:'2026-10-13',startTime:'15:00',message:'Kup mleko'});
  result=await post('Przypomnij jutro o 15:00.',{type:'idea',title:'Zakupy',text:'Zakupy'});
  assert.equal(result.status,'command');assert.deepEqual(result.uiAction,{type:'set_entry_reminder',date:'2026-10-13',startTime:'15:00',message:'Kup mleko'});
  console.log(`Event Worker 33.36: text/audio, immediate reminder, multi-turn minutes, change/removal, legacy action/identity/endDate, event scope and unchanged entry flow passed (${modelCalls} mocked interpretation calls, ${audioCalls} transcriptions).`);
}finally{globalThis.fetch=oldFetch;}
